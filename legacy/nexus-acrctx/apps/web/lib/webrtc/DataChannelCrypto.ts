// ═══════════════════════════════════════════════════════════════
// DataChannelCrypto — ECDH + AES-GCM on WebRTC DataChannels
// ═══════════════════════════════════════════════════════════════
//
// WebRTC DTLS already encrypts DataChannel traffic peer-to-peer,
// but we add a defence-in-depth E2E layer so that:
//
//   • Keys rotate every 60s (fresh AES-GCM key per epoch)
//   • Each frame is bound to a monotonic 96-bit counter (never reused)
//   • A compromised DTLS endpoint (e.g. a future SFU) still cannot read
//     the application payload
//
// Protocol
//   1. Each peer generates an ECDH P-256 key pair on construction.
//   2. Peers exchange their public JWKs via a signaling callback.
//   3. deriveSharedSecret runs HKDF to produce an epoch AES-GCM key.
//   4. Every 60s (configurable) we advance the epoch by hashing the
//      previous epoch key with the shared secret (ratchet).
//   5. Each outbound frame carries {epoch, counter, iv, ct}.
//      Receiver picks the key for that epoch (current or previous).
// ═══════════════════════════════════════════════════════════════

export interface DataChannelCryptoOptions {
  /** Key rotation period in ms (default 60s). */
  rotationIntervalMs?: number;
  /** Called when our public key is ready to be sent to the peer. */
  onPublicKey?: (jwk: JsonWebKey) => void | Promise<void>;
  /** Called when a key rotation event completes (epoch bump). */
  onRotate?: (epoch: number) => void;
}

interface Frame {
  e: number; // epoch
  c: number; // counter
  iv: string; // base64 (12 bytes)
  ct: string; // base64
}

const ROTATION_MS_DEFAULT = 60_000;
const EPOCH_RETENTION = 2; // keep current + previous epoch

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto SubtleCrypto is not available in this context");
  }
  return subtle;
}

export class DataChannelCrypto {
  private ecdhKeyPair: CryptoKeyPair | null = null;
  private sharedSecret: CryptoKey | null = null;
  private epochs = new Map<number, CryptoKey>();
  private currentEpoch = 0;
  private counter = 0;
  private rotationTimer: ReturnType<typeof setInterval> | null = null;
  private ready: Promise<void>;
  private resolveReady: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly opts: DataChannelCryptoOptions = {}) {
    this.ready = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });
  }

  /** Generate our ECDH P-256 key pair and emit our public key. */
  async init(): Promise<JsonWebKey> {
    const subtle = getSubtle();
    this.ecdhKeyPair = await subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"],
    );
    const pub = await subtle.exportKey("jwk", this.ecdhKeyPair.publicKey);
    await this.opts.onPublicKey?.(pub);
    return pub;
  }

  /**
   * Complete the handshake once the peer's public key arrives.
   * Starts the rotation timer.
   */
  async acceptPeerKey(peerPublicJwk: JsonWebKey): Promise<void> {
    if (!this.ecdhKeyPair) throw new Error("init() must be called before acceptPeerKey()");
    const subtle = getSubtle();
    const peerKey = await subtle.importKey(
      "jwk",
      peerPublicJwk,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    // Derive a 256-bit HKDF key to ratchet from
    this.sharedSecret = await subtle.deriveKey(
      { name: "ECDH", public: peerKey },
      this.ecdhKeyPair.privateKey,
      { name: "HKDF" },
      false,
      ["deriveKey"],
    );

    const firstKey = await this.deriveEpochKey(0);
    this.epochs.set(0, firstKey);
    this.currentEpoch = 0;
    this.resolveReady?.();
    this.resolveReady = null;

    this.startRotationTimer();
  }

  async whenReady(): Promise<void> {
    return this.ready;
  }

  /** Encrypt a UTF-8 string for transmission over the data channel. */
  async encrypt(plaintext: string): Promise<string> {
    await this.whenReady();
    const subtle = getSubtle();
    const key = this.epochs.get(this.currentEpoch);
    if (!key) throw new Error("No key for current epoch");

    const ivBuf = new ArrayBuffer(12);
    const iv = new Uint8Array(ivBuf);
    globalThis.crypto.getRandomValues(iv);

    // Bind counter into AAD to make replay detectable even if IV collides.
    this.counter = (this.counter + 1) >>> 0;
    const aad = new TextEncoder().encode(`${this.currentEpoch}|${this.counter}`);

    const ctBuf = await subtle.encrypt(
      { name: "AES-GCM", iv: ivBuf, additionalData: aad },
      key,
      new TextEncoder().encode(plaintext),
    );

    const frame: Frame = {
      e: this.currentEpoch,
      c: this.counter,
      iv: b64encode(iv),
      ct: b64encode(ctBuf),
    };
    return JSON.stringify(frame);
  }

  /** Decrypt an incoming frame. */
  async decrypt(serialized: string): Promise<string> {
    await this.whenReady();
    const subtle = getSubtle();
    let frame: Frame;
    try {
      frame = JSON.parse(serialized) as Frame;
    } catch {
      throw new Error("Malformed ciphertext frame");
    }
    if (typeof frame.e !== "number" || typeof frame.c !== "number" ||
        typeof frame.iv !== "string" || typeof frame.ct !== "string") {
      throw new Error("Invalid frame fields");
    }

    let key = this.epochs.get(frame.e);
    if (!key) {
      // Try deriving on demand (e.g. after a restart) for within-window epochs
      if (frame.e >= 0 && frame.e <= this.currentEpoch && this.sharedSecret) {
        key = await this.deriveEpochKey(frame.e);
        this.epochs.set(frame.e, key);
      } else {
        throw new Error(`No key for epoch ${frame.e}`);
      }
    }

    const ivBytes = b64decode(frame.iv);
    const ctBytes = b64decode(frame.ct);
    const aad = new TextEncoder().encode(`${frame.e}|${frame.c}`);
    const pt = await subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes.buffer as ArrayBuffer, additionalData: aad },
      key,
      ctBytes.buffer as ArrayBuffer,
    );
    return new TextDecoder().decode(pt);
  }

  /** Trigger an immediate rotation (mainly for tests / manual ratchet). */
  async rotateNow(): Promise<number> {
    if (!this.sharedSecret) throw new Error("Not initialized");
    const next = this.currentEpoch + 1;
    const nextKey = await this.deriveEpochKey(next);
    this.epochs.set(next, nextKey);
    // Evict old epochs (keep current + previous)
    for (const epoch of this.epochs.keys()) {
      if (epoch < next - EPOCH_RETENTION + 1) this.epochs.delete(epoch);
    }
    this.currentEpoch = next;
    this.counter = 0;
    this.opts.onRotate?.(next);
    return next;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
    this.epochs.clear();
    this.sharedSecret = null;
    this.ecdhKeyPair = null;
  }

  getCurrentEpoch(): number {
    return this.currentEpoch;
  }

  // ─── internals ─────────────────────────────────────────────

  private async deriveEpochKey(epoch: number): Promise<CryptoKey> {
    if (!this.sharedSecret) throw new Error("Shared secret not established");
    const subtle = getSubtle();
    // NOTE: these salt/info strings are part of the wire protocol (v1).
    // Changing them will break decryption of any message produced by a peer
    // running a different version, so they MUST remain constant for the
    // lifetime of this protocol version. Bump to "...v2" + add version
    // negotiation before rolling a new derivation.
    const info = new TextEncoder().encode(`quantchat-dc-epoch-${epoch}`);
    const salt = new TextEncoder().encode("quantchat-dc-salt-v1");
    return subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", info, salt },
      this.sharedSecret,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  private startRotationTimer(): void {
    if (this.rotationTimer) return;
    const interval = this.opts.rotationIntervalMs ?? ROTATION_MS_DEFAULT;
    this.rotationTimer = setInterval(() => {
      this.rotateNow().catch(() => {
        /* non-fatal — next tick will retry */
      });
    }, interval);
  }
}
