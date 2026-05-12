/**
 * x3dh.ts — Extended Triple Diffie-Hellman Key Agreement
 *
 * Establishes an initial shared secret between two users who have
 * never communicated. Uses 3 (or 4) ECDH operations to derive
 * a root key that feeds into the Double Ratchet.
 *
 * All crypto via Web Crypto API — zero external dependencies.
 */

const CURVE = "P-256";
const HKDF_INFO = new TextEncoder().encode("QuantchatX3DH");
const HKDF_SALT = new Uint8Array(32); // 32 zero bytes per Signal spec

// ─── Types ──────────────────────────────────────────────────

export interface SerializedKeyPair {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

export interface IdentityKeyPair extends SerializedKeyPair {
  keyId: string;
}

export interface SignedPreKey extends SerializedKeyPair {
  keyId: string;
  signature: string; // Base64 ECDSA signature of the public key bytes
  createdAt: number;
}

export interface OneTimePreKey extends SerializedKeyPair {
  keyId: string;
}

/** The bundle a server stores and distributes publicly */
export interface PreKeyBundle {
  identityKey: JsonWebKey;       // IK public
  signedPreKey: JsonWebKey;      // SPK public
  signedPreKeyId: string;
  signature: string;             // SPK signed by IK
  oneTimePreKey?: JsonWebKey;    // OPK public (if available)
  oneTimePreKeyId?: string;
}

/** The initial message header Alice sends alongside the first ciphertext */
export interface X3DHHeader {
  identityKey: JsonWebKey;       // Alice's IK public
  ephemeralKey: JsonWebKey;      // Alice's fresh EK public
  usedOneTimePreKeyId?: string;  // Which OPK was consumed (if any)
}

// ─── Key Generation ─────────────────────────────────────────

async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: CURVE },
    true, // extractable so we can export JWK
    ["deriveKey", "deriveBits"]
  );
}

// Currently unused but may be needed for signature verification in future
// async function generateECDSAKeyPair(): Promise<CryptoKeyPair> {
//   return crypto.subtle.generateKey(
//     { name: "ECDSA", namedCurve: CURVE },
//     true,
//     ["sign", "verify"]
//   );
// }

async function exportKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey("jwk", key);
}

async function importECDHPublic(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: CURVE }, true, []);
}

async function importECDHPrivate(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk", jwk,
    { name: "ECDH", namedCurve: CURVE },
    false, // non-extractable for security
    ["deriveKey", "deriveBits"]
  );
}

// ─── Public API ─────────────────────────────────────────────

export class X3DH {
  /**
   * Generate a long-lived Identity Key pair.
   * Created once per device. Stored permanently in IndexedDB.
   */
  static async generateIdentityKeyPair(): Promise<IdentityKeyPair> {
    const kp = await generateECDHKeyPair();
    return {
      keyId: `ik_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      publicKey: await exportKey(kp.publicKey),
      privateKey: await exportKey(kp.privateKey),
    };
  }

  /**
   * Generate a Signed Pre-Key, signed by the identity key.
   * Rotated every 7–30 days.
   */
  static async generateSignedPreKey(identityPrivateJWK: JsonWebKey): Promise<SignedPreKey> {
    const spkPair = await generateECDHKeyPair();
    const spkPubJWK = await exportKey(spkPair.publicKey);

    // Sign the SPK public bytes with IK using ECDSA
    // We sign the canonical JSON of the public JWK
    const signingKey = await crypto.subtle.importKey(
      "jwk",
      { ...identityPrivateJWK, key_ops: ["sign"], alg: "ES256" },
      { name: "ECDSA", namedCurve: CURVE },
      false,
      ["sign"]
    );

    const dataToSign = new TextEncoder().encode(JSON.stringify(spkPubJWK));
    const sigBuffer = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      dataToSign
    );

    const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

    return {
      keyId: `spk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      publicKey: spkPubJWK,
      privateKey: await exportKey(spkPair.privateKey),
      signature: sigBase64,
      createdAt: Date.now(),
    };
  }

  /**
   * Generate a batch of one-time pre-keys.
   * Each is consumed exactly once during X3DH session initiation.
   */
  static async generateOneTimePreKeys(count: number = 100): Promise<OneTimePreKey[]> {
    const keys: OneTimePreKey[] = [];
    for (let i = 0; i < count; i++) {
      const kp = await generateECDHKeyPair();
      keys.push({
        keyId: `opk_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        publicKey: await exportKey(kp.publicKey),
        privateKey: await exportKey(kp.privateKey),
      });
    }
    return keys;
  }

  /**
   * Build a PreKeyBundle for server upload.
   */
  static buildPreKeyBundle(
    ik: IdentityKeyPair,
    spk: SignedPreKey,
    opk?: OneTimePreKey
  ): PreKeyBundle {
    return {
      identityKey: ik.publicKey,
      signedPreKey: spk.publicKey,
      signedPreKeyId: spk.keyId,
      signature: spk.signature,
      oneTimePreKey: opk?.publicKey,
      oneTimePreKeyId: opk?.keyId,
    };
  }

  /**
   * INITIATOR: Alice starts a session with Bob.
   * Returns the shared secret SK and the X3DH header to include in the first message.
   */
  static async initiateSession(
    myIK: IdentityKeyPair,
    theirBundle: PreKeyBundle
  ): Promise<{ sharedKey: Uint8Array; header: X3DHHeader }> {
    // Generate ephemeral key
    const ekPair = await generateECDHKeyPair();
    const ekPubJWK = await exportKey(ekPair.publicKey);

    // Import keys
    const myIKPriv = await importECDHPrivate(myIK.privateKey);
    const theirIKPub = await importECDHPublic(theirBundle.identityKey);
    const theirSPKPub = await importECDHPublic(theirBundle.signedPreKey);

    // DH1 = ECDH(IK_A, SPK_B)
    const dh1 = await ecdh(myIKPriv, theirSPKPub);
    // DH2 = ECDH(EK_A, IK_B)
    const dh2 = await ecdh(ekPair.privateKey, theirIKPub);
    // DH3 = ECDH(EK_A, SPK_B)
    const dh3 = await ecdh(ekPair.privateKey, theirSPKPub);

    // DH4 = ECDH(EK_A, OPK_B) — optional
    let dh4: Uint8Array | null = null;
    if (theirBundle.oneTimePreKey) {
      const theirOPKPub = await importECDHPublic(theirBundle.oneTimePreKey);
      dh4 = await ecdh(ekPair.privateKey, theirOPKPub);
    }

    // SK = HKDF(DH1 || DH2 || DH3 [|| DH4])
    const dhConcat = concatBytes(dh1, dh2, dh3, ...(dh4 ? [dh4] : []));
    const sharedKey = await hkdfDerive(dhConcat, 32);

    const header: X3DHHeader = {
      identityKey: myIK.publicKey,
      ephemeralKey: ekPubJWK,
      usedOneTimePreKeyId: theirBundle.oneTimePreKeyId,
    };

    return { sharedKey, header };
  }

  /**
   * RESPONDER: Bob receives Alice's first message.
   * Computes the same SK from the X3DH header.
   */
  static async respondToSession(
    myIK: IdentityKeyPair,
    mySPK: SignedPreKey,
    myOPK: OneTimePreKey | undefined,
    header: X3DHHeader
  ): Promise<Uint8Array> {
    const myIKPriv = await importECDHPrivate(myIK.privateKey);
    const mySPKPriv = await importECDHPrivate(mySPK.privateKey);
    const theirIKPub = await importECDHPublic(header.identityKey);
    const theirEKPub = await importECDHPublic(header.ephemeralKey);

    // DH1 = ECDH(SPK_B, IK_A)  — mirror of initiator
    const dh1 = await ecdh(mySPKPriv, theirIKPub);
    // DH2 = ECDH(IK_B, EK_A)
    const dh2 = await ecdh(myIKPriv, theirEKPub);
    // DH3 = ECDH(SPK_B, EK_A)
    const dh3 = await ecdh(mySPKPriv, theirEKPub);

    // DH4 = ECDH(OPK_B, EK_A) — optional
    let dh4: Uint8Array | null = null;
    if (myOPK) {
      const myOPKPriv = await importECDHPrivate(myOPK.privateKey);
      dh4 = await ecdh(myOPKPriv, theirEKPub);
    }

    const dhConcat = concatBytes(dh1, dh2, dh3, ...(dh4 ? [dh4] : []));
    return hkdfDerive(dhConcat, 32);
  }
}

// ─── Internal Helpers ───────────────────────────────────────

async function ecdh(privateKey: CryptoKey, publicKey: CryptoKey): Promise<Uint8Array> {
  const bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256 // P-256 yields 32 bytes
  );
  return new Uint8Array(bits);
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/** HKDF-SHA256 derivation */
async function hkdfDerive(ikm: Uint8Array, length: number): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey("raw", ikm as unknown as ArrayBuffer, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT as unknown as ArrayBuffer, info: HKDF_INFO },
    baseKey,
    length * 8
  );
  return new Uint8Array(bits);
}

// Re-export helpers other modules need
export { generateECDHKeyPair, exportKey, importECDHPublic, importECDHPrivate, ecdh, concatBytes, hkdfDerive };
