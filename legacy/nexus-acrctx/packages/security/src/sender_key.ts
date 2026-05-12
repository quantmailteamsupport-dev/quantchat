/**
 * sender_key.ts
 * ═══════════════════════════════════════════════════════════════════
 * SIGNAL SENDER KEY PROTOCOL (MULTICAST E2EE)
 * Authored by: Gemini (Backend & Architecture Core)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Problem:
 * Standard Double Ratchet for 1000 users = 1000 encrypt ops per message.
 * O(N) complexity causes exponential battery drain and lag.
 *
 * Solution (Signal Sender Key):
 * Each user generates a single "Sender Key" for the Hive (Group).
 * The user encrypts their message ONCE with this key.
 * The Sender Key is distributed to all N members via 1-on-1 Double Ratchets O(N).
 * Subsequent messages cost O(1) to encrypt, and O(1) to decrypt.
 */

import * as crypto from 'crypto';

export class MulticastEngine {
  /**
   * Generates a new cryptographic Chain Key and Signature Key for a Hive participant.
   * This is sent via E2EE to all other participants so they can decrypt our future messages.
   */
  static generateSenderKey(): { chainKey: string; signatureKeyPublic: string; signatureKeyPrivate: string } {
    // Generate Ed25519 signing pair for message authentication
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    
    // Generate the initial 32-byte Chain Key (KDF root)
    const chainKey = crypto.randomBytes(32).toString('base64');

    return {
      chainKey,
      signatureKeyPublic: publicKey.export({ type: 'spki', format: 'pem' }).toString('base64'),
      signatureKeyPrivate: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString('base64')
    };
  }

  /**
   * Group Encrypt: O(1)
   * The sender derives a Message Key from the CURRENT Chain Key, then steps the Chain Key forward.
   */
  static async groupEncrypt(
    plaintextMsg: string, 
    currentChainKeyBase64: string, 
    privateKeyBase64: string
  ): Promise<{ ciphertext: string; nextChainKeyBase64: string; signature: string }> {
    const currentChainKey = Buffer.from(currentChainKeyBase64, 'base64');

    // 1. HKDF to get Message Key and Next Chain Key
    // Conceptually: KDF(ChainKey) -> (MessageKey || NextChainKey)
    // (Mocking HKDF step for tech demo architecture)
    const messageKey = crypto.createHash('sha256').update(currentChainKey).update('MSG').digest();
    const nextChainKey = crypto.createHash('sha256').update(currentChainKey).update('CHAIN').digest();

    // 2. Encrypt using AES-256-GCM
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', messageKey, iv);
    
    let encrypted = cipher.update(plaintextMsg, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag().toString('base64');
    
    const ciphertextBase64 = JSON.stringify({
      iv: iv.toString('base64'),
      data: encrypted,
      tag: authTag
    });

    // 3. Sign the ciphertext to ensure it couldn't have been forged by someone else in the group
    // (Since everyone shares the SenderKey, anyone could theoretically spoof the sender,
    //  thus Ed25519 signing provides Origin Authentication).
    const privateKey = crypto.createPrivateKey({
      key: Buffer.from(privateKeyBase64, 'base64').toString('ascii'),
      format: 'pem',
      type: 'pkcs8'
    });
    
    const signature = crypto.sign(null, Buffer.from(ciphertextBase64), privateKey).toString('base64');

    return {
      ciphertext: ciphertextBase64,
      nextChainKeyBase64: nextChainKey.toString('base64'),
      signature
    };
  }

  /**
   * Group Decrypt: O(1)
   * The receiver steps their copy of the sender's Chain Key forward to derive the exact Message Key.
   */
  static async groupDecrypt(
    ciphertextPayload: string,
    signature: string,
    theirChainKeyBase64: string,
    theirPublicKeyBase64: string
  ): Promise<{ plaintext: string; nextChainKeyBase64: string }> {
    // 1. Verify Origin Authentication FIRST (Anti-Spoofing algorithm)
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(theirPublicKeyBase64, 'base64').toString('ascii'),
      format: 'pem',
      type: 'spki'
    });
    
    const isValid = crypto.verify(null, Buffer.from(ciphertextPayload), publicKey, Buffer.from(signature, 'base64'));
    if (!isValid) throw new Error("Hive Multicast Decryption Failed: Cryptographic Signature mismatch. Message Spoofed.");

    // 2. Derive key matching sender's algorithm
    const currentChainKey = Buffer.from(theirChainKeyBase64, 'base64');
    const messageKey = crypto.createHash('sha256').update(currentChainKey).update('MSG').digest();
    const nextChainKey = crypto.createHash('sha256').update(currentChainKey).update('CHAIN').digest();

    // 3. AES Decrypt
    const { iv, data, tag } = JSON.parse(ciphertextPayload);
    const decipher = crypto.createDecipheriv('aes-256-gcm', messageKey, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    
    let decrypted = decipher.update(data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return {
      plaintext: decrypted,
      nextChainKeyBase64: nextChainKey.toString('base64')
    };
  }
}
