/**
 * session-manager.ts — Signal Session Lifecycle Manager
 *
 * Orchestrates X3DH + Double Ratchet into a simple encrypt/decrypt API.
 * Handles session creation, persistence, and OPK refill triggers.
 *
 * This is the ONLY module the socket hook should interact with.
 * Internal crypto details (ratchet states, KDF chains) are fully encapsulated.
 */

import { X3DH, type PreKeyBundle, type X3DHHeader } from "./x3dh";
import {
  ratchetInitSender,
  ratchetInitReceiver,
  ratchetEncrypt,
  ratchetDecrypt,
  type MessageHeader,
} from "./double-ratchet";
import { KeyStore } from "./key-store";

// ─── Wire Format ────────────────────────────────────────────

/** The complete encrypted envelope sent over the socket */
export interface EncryptedEnvelope {
  // X3DH initial message fields (only present on the first message of a session)
  x3dhHeader?: X3DHHeader;

  // Double Ratchet header (every message)
  header: MessageHeader;

  // Encrypted payload
  ciphertext: string; // Base64
  iv: string;         // Base64
}

// ─── Session Manager ────────────────────────────────────────

export class SessionManager {
  private myUserId: string;

  constructor(myUserId: string) {
    this.myUserId = myUserId;
  }

  /**
   * Bootstrap: ensure this device has identity keys and pre-keys.
   * Call once on app startup. Returns the PreKeyBundle to upload to the server.
   */
  async bootstrap(): Promise<PreKeyBundle> {
    const { bundle } = await this.prepareLocalPreKeys();
    return bundle;
  }

  /**
   * Prepare (or rotate) local pre-keys and return upload payload for server sync.
   * Useful for periodic key rotation and OPK refill over WebSocket.
   */
  async prepareLocalPreKeys(forceRotateSignedPreKey: boolean = false): Promise<{
    bundle: PreKeyBundle;
    oneTimePreKeys: { keyId: string; publicKey: JsonWebKey }[];
  }> {
    let ik = await KeyStore.getIdentityKey();
    if (!ik) {
      ik = await X3DH.generateIdentityKeyPair();
      await KeyStore.saveIdentityKey(ik);
    }

    // Ensure we have a current SPK (rotate if older than 7 days)
    let spk = await KeyStore.getCurrentSignedPreKey();
    const SEVEN_DAYS = 7 * 24 * 3600 * 1000;
    if (forceRotateSignedPreKey || !spk || (Date.now() - spk.createdAt) > SEVEN_DAYS) {
      spk = await X3DH.generateSignedPreKey(ik.privateKey);
      await KeyStore.saveSignedPreKey(spk);
      // Clean up SPKs older than 30 days
      await KeyStore.deleteOldSignedPreKeys();
    }

    // Ensure we have enough OPKs (refill if below 10)
    const opkCount = await KeyStore.getOneTimePreKeyCount();
    if (opkCount < 10) {
      const newOPKs = await X3DH.generateOneTimePreKeys(100);
      await KeyStore.saveOneTimePreKeys(newOPKs);
    }

    // Pick one OPK for the bundle (server stores multiple, we send one)
    const allOPKs = await KeyStore.getAllOneTimePreKeys();
    const opk = allOPKs[0];

    return {
      bundle: X3DH.buildPreKeyBundle(ik, spk, opk),
      oneTimePreKeys: allOPKs.map((o) => ({
        keyId: o.keyId,
        publicKey: o.publicKey,
      })),
    };
  }

  /**
   * Get OPK public keys for server upload (called when server requests refill).
   */
  async getOPKPublicKeys(): Promise<{ keyId: string; publicKey: JsonWebKey }[]> {
    const opks = await KeyStore.getAllOneTimePreKeys();
    return opks.map((o) => ({ keyId: o.keyId, publicKey: o.publicKey }));
  }

  /**
   * ENCRYPT a message for a recipient.
   *
   * If no session exists, initiates X3DH to establish one.
   * If a session exists, uses the existing Double Ratchet.
   */
  async encrypt(
    recipientId: string,
    plaintext: string,
    theirBundle?: PreKeyBundle
  ): Promise<EncryptedEnvelope> {
    let state = await KeyStore.getSession(this.myUserId, recipientId);
    let x3dhHeader: X3DHHeader | undefined;

    if (!state) {
      // No session yet — need X3DH
      if (!theirBundle) {
        throw new Error(
          `[SessionManager] No session with ${recipientId} and no PreKeyBundle provided. ` +
          `Fetch their bundle from the server first.`
        );
      }

      const ik = await KeyStore.getIdentityKey();
      if (!ik) throw new Error("[SessionManager] No identity key. Call bootstrap() first.");

      // X3DH: compute shared secret
      const { sharedKey, header } = await X3DH.initiateSession(ik, theirBundle);
      x3dhHeader = header;

      // Initialize Double Ratchet as sender
      state = await ratchetInitSender(sharedKey, theirBundle.signedPreKey);
    }

    // Double Ratchet encrypt
    const { state: newState, result } = await ratchetEncrypt(state, plaintext);

    // Persist updated session state
    await KeyStore.saveSession(this.myUserId, recipientId, newState);

    return {
      x3dhHeader,
      header: result.header,
      ciphertext: result.ciphertext,
      iv: result.iv,
    };
  }

  /**
   * DECRYPT an incoming message from a sender.
   *
   * If the envelope contains an X3DH header, establishes a new session.
   * Otherwise, uses the existing session's ratchet state.
   */
  async decrypt(
    senderId: string,
    envelope: EncryptedEnvelope
  ): Promise<string> {
    let state = await KeyStore.getSession(this.myUserId, senderId);

    if (!state && envelope.x3dhHeader) {
      // This is the first message — respond to X3DH
      const ik = await KeyStore.getIdentityKey();
      if (!ik) throw new Error("[SessionManager] No identity key. Call bootstrap() first.");

      // Find the SPK that was used
      const spk = await KeyStore.getCurrentSignedPreKey();
      if (!spk) throw new Error("[SessionManager] No signed pre-key found");

      // Consume the OPK if one was used
      let opk;
      if (envelope.x3dhHeader.usedOneTimePreKeyId) {
        opk = await KeyStore.consumeOneTimePreKey(envelope.x3dhHeader.usedOneTimePreKeyId);
      }

      // Compute same SK as sender
      const sk = await X3DH.respondToSession(ik, spk, opk, envelope.x3dhHeader);

      // Initialize Double Ratchet as receiver
      state = await ratchetInitReceiver(sk, {
        publicKey: spk.publicKey,
        privateKey: spk.privateKey,
      });
    }

    if (!state) {
      throw new Error(
        `[SessionManager] No session with ${senderId} and no X3DH header in message. ` +
        `Cannot decrypt.`
      );
    }

    // Double Ratchet decrypt
    const { state: newState, plaintext } = await ratchetDecrypt(
      state,
      envelope.header,
      envelope.ciphertext,
      envelope.iv
    );

    // Persist updated session state
    await KeyStore.saveSession(this.myUserId, senderId, newState);

    // Trigger OPK refill check
    this.checkOPKRefill().catch(() => {}); // fire-and-forget

    return plaintext;
  }

  /**
   * Request the server for OPK refill if we're running low.
   * Returns true if refill is needed.
   */
  async checkOPKRefill(): Promise<boolean> {
    const count = await KeyStore.getOneTimePreKeyCount();
    return count < 10;
  }

  /**
   * Delete a session (e.g., user blocks someone or resets encryption).
   */
  async resetSession(recipientId: string): Promise<void> {
    await KeyStore.deleteSession(this.myUserId, recipientId);
  }
}
