/**
 * double-ratchet.ts — Double Ratchet Algorithm
 *
 * Combines a DH ratchet (asymmetric, per-turn) with a symmetric
 * chain ratchet (KDF, per-message) to achieve:
 *   - Forward secrecy:  compromising current keys cannot decrypt past messages
 *   - Break-in recovery: new DH exchange heals after key compromise
 *   - Out-of-order:     skipped message keys are cached for late delivery
 *
 * Follows the Signal specification:
 *   https://signal.org/docs/specifications/doubleratchet/
 */

import {
  generateECDHKeyPair,
  exportKey,
  importECDHPublic,
  importECDHPrivate,
  ecdh,
} from "./x3dh";

// ─── Constants ──────────────────────────────────────────────

const HKDF_RK_INFO = new TextEncoder().encode("QuantchatRatchet");
const HKDF_CK_MSG = new Uint8Array([0x01]); // message key derivation constant
const HKDF_CK_CHAIN = new Uint8Array([0x02]); // chain key derivation constant

// ─── Types ──────────────────────────────────────────────────

export interface MessageHeader {
  dhPub: JsonWebKey;    // Current DH ratchet public key
  n: number;            // Message number in the sending chain
  pn: number;           // Previous chain length (for receiver to skip)
}

export interface RatchetState {
  // DH Ratchet keys
  DHs: { publicKey: JsonWebKey; privateKey: JsonWebKey }; // Our current sending key pair
  DHr: JsonWebKey | null;                                   // Their current public key

  // Root key (32 bytes, hex-encoded for serialization)
  RK: string;

  // Sending chain
  CKs: string | null;  // Chain key (sending), hex
  Ns: number;           // Send message counter

  // Receiving chain
  CKr: string | null;   // Chain key (receiving), hex
  Nr: number;            // Receive message counter

  // Previous sending chain length (sent in header so receiver knows how many to skip)
  PN: number;

  // Skipped message keys: "dhPubHash:N" → hex messageKey
  MKSKIPPED: Record<string, string>;
  MAX_SKIP: number;
}

export interface EncryptResult {
  header: MessageHeader;
  ciphertext: string;  // Base64
  iv: string;          // Base64
}

// ─── Initialization ─────────────────────────────────────────

/**
 * Initialize ratchet state for the SENDER (Alice, who initiated X3DH).
 * @param sk       The shared secret from X3DH (32 bytes)
 * @param bobDHPub Bob's signed pre-key public (used as initial DHr)
 */
export async function ratchetInitSender(
  sk: Uint8Array,
  bobDHPubJWK: JsonWebKey
): Promise<RatchetState> {
  // Generate our first DH sending key pair
  const dhPair = await generateECDHKeyPair();
  const dhPubJWK = await exportKey(dhPair.publicKey);
  const dhPrivJWK = await exportKey(dhPair.privateKey);

  // Perform initial DH ratchet step
  const bobDHPub = await importECDHPublic(bobDHPubJWK);
  const dhOutput = await ecdh(dhPair.privateKey, bobDHPub);

  // KDF_RK to get new root key and sending chain key
  const [newRK, CKs] = await kdfRK(sk, dhOutput);

  return {
    DHs: { publicKey: dhPubJWK, privateKey: dhPrivJWK },
    DHr: bobDHPubJWK,
    RK: toHex(newRK),
    CKs: toHex(CKs),
    Ns: 0,
    CKr: null,
    Nr: 0,
    PN: 0,
    MKSKIPPED: {},
    MAX_SKIP: 200,
  };
}

/**
 * Initialize ratchet state for the RECEIVER (Bob, who responds to X3DH).
 * @param sk  The shared secret from X3DH (32 bytes)
 * @param spk Bob's signed pre-key pair (used as initial DH sending key)
 */
export async function ratchetInitReceiver(
  sk: Uint8Array,
  spk: { publicKey: JsonWebKey; privateKey: JsonWebKey }
): Promise<RatchetState> {
  return {
    DHs: spk,
    DHr: null,
    RK: toHex(sk),
    CKs: null,
    Ns: 0,
    CKr: null,
    Nr: 0,
    PN: 0,
    MKSKIPPED: {},
    MAX_SKIP: 200,
  };
}

// ─── Encrypt ────────────────────────────────────────────────

/**
 * Encrypt a plaintext message, advancing the sending chain.
 */
export async function ratchetEncrypt(
  state: RatchetState,
  plaintext: string
): Promise<{ state: RatchetState; result: EncryptResult }> {
  if (!state.CKs) {
    throw new Error("[DoubleRatchet] No sending chain key. Session not fully initialized.");
  }

  // Derive message key from chain
  const [newCKs, mk] = await kdfCK(fromHex(state.CKs));

  // Build header
  const header: MessageHeader = {
    dhPub: state.DHs.publicKey,
    n: state.Ns,
    pn: state.PN,
  };

  // Encrypt with AES-GCM using the message key
  const { ciphertext, iv } = await aesGcmEncrypt(mk, plaintext, header);

  // Update state
  const newState: RatchetState = {
    ...state,
    CKs: toHex(newCKs),
    Ns: state.Ns + 1,
  };

  return { state: newState, result: { header, ciphertext, iv } };
}

// ─── Decrypt ────────────────────────────────────────────────

/**
 * Decrypt an incoming message, performing DH ratchet step if needed.
 */
export async function ratchetDecrypt(
  state: RatchetState,
  header: MessageHeader,
  ciphertext: string,
  iv: string
): Promise<{ state: RatchetState; plaintext: string }> {
  // 1. Try skipped message keys first (out-of-order delivery)
  const skippedKey = dhPubHash(header.dhPub) + ":" + header.n;
  if (state.MKSKIPPED[skippedKey]) {
    const mk = fromHex(state.MKSKIPPED[skippedKey]!);
    const plaintext = await aesGcmDecrypt(mk, ciphertext, iv, header);

    const newSkipped = { ...state.MKSKIPPED };
    delete newSkipped[skippedKey];

    return {
      state: { ...state, MKSKIPPED: newSkipped },
      plaintext,
    };
  }

  let currentState = { ...state };

  // 2. If the header has a new DH public key, perform DH ratchet step
  if (!currentState.DHr || dhPubHash(header.dhPub) !== dhPubHash(currentState.DHr)) {
    // Skip any remaining messages in the current receiving chain
    currentState = await skipMessageKeys(currentState, header.pn);

    // DH ratchet step (receiving)
    currentState = await dhRatchetStep(currentState, header.dhPub);
  }

  // 3. Skip message keys up to header.n in the receiving chain
  currentState = await skipMessageKeys(currentState, header.n);

  // 4. Derive the message key for this message
  if (!currentState.CKr) {
    throw new Error("[DoubleRatchet] No receiving chain key after ratchet step");
  }
  const [newCKr, mk] = await kdfCK(fromHex(currentState.CKr));

  // 5. Decrypt
  const plaintext = await aesGcmDecrypt(mk, ciphertext, iv, header);

  return {
    state: {
      ...currentState,
      CKr: toHex(newCKr),
      Nr: currentState.Nr + 1,
    },
    plaintext,
  };
}

// ─── DH Ratchet Step ────────────────────────────────────────

async function dhRatchetStep(
  state: RatchetState,
  theirNewDHPubJWK: JsonWebKey
): Promise<RatchetState> {
  const theirNewDHPub = await importECDHPublic(theirNewDHPubJWK);

  // Derive receiving chain from their new DH key + our current DH private
  const myDHPriv = await importECDHPrivate(state.DHs.privateKey);
  const dhOutput1 = await ecdh(myDHPriv, theirNewDHPub);
  const [rk1, newCKr] = await kdfRK(fromHex(state.RK), dhOutput1);

  // Generate our new DH key pair
  const newDHPair = await generateECDHKeyPair();
  const newDHPubJWK = await exportKey(newDHPair.publicKey);
  const newDHPrivJWK = await exportKey(newDHPair.privateKey);

  // Derive new sending chain from our new DH key + their new DH key
  const dhOutput2 = await ecdh(newDHPair.privateKey, theirNewDHPub);
  const [rk2, newCKs] = await kdfRK(rk1, dhOutput2);

  return {
    ...state,
    DHs: { publicKey: newDHPubJWK, privateKey: newDHPrivJWK },
    DHr: theirNewDHPubJWK,
    RK: toHex(rk2),
    CKs: toHex(newCKs),
    CKr: toHex(newCKr),
    Ns: 0,
    Nr: 0,
    PN: state.Ns, // previous sending chain length
  };
}

// ─── Skip Message Keys (out-of-order support) ───────────────

async function skipMessageKeys(
  state: RatchetState,
  until: number
): Promise<RatchetState> {
  if (!state.CKr || !state.DHr) return state;

  if (until - state.Nr > state.MAX_SKIP) {
    throw new Error("[DoubleRatchet] Too many skipped messages — possible attack");
  }

  let ck = fromHex(state.CKr);
  const newSkipped = { ...state.MKSKIPPED };
  let nr = state.Nr;

  while (nr < until) {
    const [newCK, mk] = await kdfCK(ck);
    const key = dhPubHash(state.DHr) + ":" + nr;
    newSkipped[key] = toHex(mk);
    ck = newCK;
    nr++;
  }

  return { ...state, CKr: toHex(ck), Nr: nr, MKSKIPPED: newSkipped };
}

// ─── KDF Functions ──────────────────────────────────────────

/**
 * KDF_RK: Root key ratchet.
 * HKDF(salt=RK, ikm=dhOutput) → [newRK(32), chainKey(32)]
 */
async function kdfRK(
  rk: Uint8Array,
  dhOutput: Uint8Array
): Promise<[Uint8Array, Uint8Array]> {
  const baseKey = await crypto.subtle.importKey("raw", dhOutput as unknown as ArrayBuffer, "HKDF", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: rk as unknown as ArrayBuffer, info: HKDF_RK_INFO },
    baseKey,
    512 // 64 bytes = 32 root + 32 chain
  );
  const bytes = new Uint8Array(derived);
  return [bytes.slice(0, 32), bytes.slice(32, 64)];
}

/**
 * KDF_CK: Symmetric chain ratchet.
 * HMAC-SHA256(CK, 0x01) → messageKey
 * HMAC-SHA256(CK, 0x02) → newChainKey
 */
async function kdfCK(ck: Uint8Array): Promise<[Uint8Array, Uint8Array]> {
  const hmacKey = await crypto.subtle.importKey(
    "raw", ck as unknown as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );

  const [mkBuf, ckBuf] = await Promise.all([
    crypto.subtle.sign("HMAC", hmacKey, HKDF_CK_MSG as unknown as ArrayBuffer),
    crypto.subtle.sign("HMAC", hmacKey, HKDF_CK_CHAIN as unknown as ArrayBuffer),
  ]);

  return [new Uint8Array(ckBuf), new Uint8Array(mkBuf)];
}

// ─── AES-GCM Encryption ────────────────────────────────────

async function aesGcmEncrypt(
  mk: Uint8Array,
  plaintext: string,
  header: MessageHeader
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", mk.slice(0, 32) as unknown as ArrayBuffer, "AES-GCM", false, ["encrypt"]);

  // Use header as AAD (authenticated additional data)
  const aad = new TextEncoder().encode(JSON.stringify(header));
  const enc = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer, additionalData: aad as unknown as ArrayBuffer },
    key,
    new TextEncoder().encode(plaintext) as unknown as ArrayBuffer
  );

  return {
    ciphertext: bufToBase64(new Uint8Array(enc)),
    iv: bufToBase64(iv),
  };
}

async function aesGcmDecrypt(
  mk: Uint8Array,
  ciphertextB64: string,
  ivB64: string,
  header: MessageHeader
): Promise<string> {
  const iv = base64ToBuf(ivB64);
  const ct = base64ToBuf(ciphertextB64);
  const key = await crypto.subtle.importKey("raw", mk.slice(0, 32) as unknown as ArrayBuffer, "AES-GCM", false, ["decrypt"]);
  const aad = new TextEncoder().encode(JSON.stringify(header));

  const dec = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer, additionalData: aad as unknown as ArrayBuffer },
    key,
    ct as unknown as ArrayBuffer
  );
  return new TextDecoder().decode(dec);
}

// ─── Utilities ──────────────────────────────────────────────

function toHex(arr: Uint8Array): string {
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function bufToBase64(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf));
}

function base64ToBuf(b64: string): Uint8Array {
  const str = atob(b64);
  const buf = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
  return buf;
}

/** Deterministic hash of a JWK DH public key for skipped-key lookup */
function dhPubHash(jwk: JsonWebKey): string {
  // Use the raw x+y coordinates as a stable identifier
  return `${jwk.x ?? ""}:${jwk.y ?? ""}`;
}

export { toHex, fromHex, bufToBase64, base64ToBuf };
