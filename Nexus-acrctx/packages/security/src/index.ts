// Legacy ECDH primitives (kept for backward compatibility)
export * from "./signal";

// Signal Protocol: X3DH + Double Ratchet
export { X3DH } from "./x3dh";
export type { IdentityKeyPair, SignedPreKey, OneTimePreKey, PreKeyBundle, X3DHHeader } from "./x3dh";

export { ratchetInitSender, ratchetInitReceiver, ratchetEncrypt, ratchetDecrypt } from "./double-ratchet";
export type { RatchetState, MessageHeader, EncryptResult } from "./double-ratchet";

export { KeyStore } from "./key-store";
export { SessionManager } from "./session-manager";
export type { EncryptedEnvelope } from "./session-manager";

export { MultiDeviceManager } from "./multi-device";
export type { DeviceBundle, FanOutEnvelope, MultiDeviceMessage } from "./multi-device";
