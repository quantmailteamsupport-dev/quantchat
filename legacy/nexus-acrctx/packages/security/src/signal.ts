// Implement ECDH standard generation for Web Crypto API
export class SignalProtocol {
  /**
   * Generates a new ECDH P-256 Key Pair for Identity or Pre-Keys.
   */
  static async generateKeyPair(): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true, // extractable
      ["deriveKey", "deriveBits"]
    );
  }

  /**
   * Derives an AES-GCM shared symmetric key from my Private Key and their Public Key.
   */
  static async deriveSharedSecret(
    myPrivateKey: CryptoKey,
    theirPublicKey: CryptoKey
  ): Promise<CryptoKey> {
    return await crypto.subtle.deriveKey(
      {
        name: "ECDH",
        public: theirPublicKey,
      },
      myPrivateKey,
      {
        name: "AES-GCM",
        length: 256,
      },
      false, // shared key shouldn't be extractable
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Encrypts the payload using the shared AES-GCM key.
   */
  static async encryptPayload(
    sharedKey: CryptoKey,
    plaintext: string
  ): Promise<{ ciphertext: string; iv: string }> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      sharedKey,
      encoder.encode(plaintext)
    );

    // Using btoa and atob for universal browser compatibility instead of Node Buffer
    const cipherStr = Array.from(new Uint8Array(encryptedBuffer))
        .map((b) => String.fromCharCode(b))
        .join('');
    const ivStr = Array.from(iv)
        .map((b) => String.fromCharCode(b))
        .join('');

    return {
      ciphertext: btoa(cipherStr),
      iv: btoa(ivStr)
    };
  }

  /**
   * Decrypts the payload using the shared AES-GCM key.
   */
  static async decryptPayload(
    sharedKey: CryptoKey,
    ciphertextBase64: string,
    ivBase64: string
  ): Promise<string> {
    const ivStr = atob(ivBase64);
    const ivBytes = new Uint8Array(ivStr.length);
    for (let i = 0; i < ivStr.length; i++) ivBytes[i] = ivStr.charCodeAt(i);

    const cipherStr = atob(ciphertextBase64);
    const cipherBytes = new Uint8Array(cipherStr.length);
    for (let i = 0; i < cipherStr.length; i++) cipherBytes[i] = cipherStr.charCodeAt(i);
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ivBytes,
      },
      sharedKey,
      cipherBytes
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  }
}
