import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "crypto";

export interface SenderKey {
  userId: string;
  groupId: string;
  deviceId: string;
  chainKey: Uint8Array;
  publicSigningKey: Uint8Array;
  iteration: number;
  createdAt: Date;
}

export interface MessageKey {
  encryptionKey: Uint8Array;
  iv: Uint8Array;
  macKey: Uint8Array;
  iteration: number;
}

export interface EncryptedGroupMessage {
  messageId: string;
  groupId: string;
  senderId: string;
  senderDeviceId?: string;
  signatureVersion?: 1 | 2;
  ciphertext: Uint8Array;
  iv: Uint8Array;
  tag: Uint8Array;
  senderKeyIteration: number;
  signature: Uint8Array;
  timestamp: Date;
}

export interface GroupState {
  groupId: string;
  groupName: string;
  members: GroupMember[];
  epochNumber: number;
  createdAt: Date;
  lastKeyRotation: Date;
}

export interface GroupMember {
  userId: string;
  displayName: string;
  joinedAt: Date;
  senderKeyDistributed: boolean;
  role: "admin" | "member";
}

const DEFAULT_DEVICE_ID = "primary";
const MESSAGE_KEY_CACHE_MAX = 20_000;
const CHAIN_CHECKPOINT_CACHE_MAX = 30_000;
const CHAIN_CHECKPOINT_INTERVAL = 64;
const REPLAY_CACHE_MAX = 100_000;
const REPLAY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MESSAGE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MESSAGE_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MESSAGE_MAX_ITERATION_AHEAD = 4_096;
const MESSAGE_MAX_ITERATION_ROLLBACK_WINDOW = 128;
const MAX_PLAINTEXT_BYTES = 64 * 1024;
const MAX_CIPHERTEXT_BYTES = MAX_PLAINTEXT_BYTES + 2048;
const REPLAY_PRUNE_INTERVAL_MS = 30_000;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]+$/;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

type SignatureVersion = 1 | 2;

export class QuantumGroupEncryption {
  private groups = new Map<string, GroupState>();
  private senderKeys = new Map<string, SenderKey>();
  private senderInitialChainKeys = new Map<string, Uint8Array>();
  private signingSecrets = new Map<string, Uint8Array>();
  private messageKeyCache = new Map<string, MessageKey>();
  private chainCheckpointCache = new Map<string, Uint8Array>();
  private replayCache = new Map<string, number>();
  private highestAcceptedIterations = new Map<string, number>();
  private replayLastPrunedAt = 0;

  createGroup(groupId: string, groupName: string, creatorId: string, creatorName: string): GroupState {
    const state: GroupState = {
      groupId,
      groupName,
      members: [
        {
          userId: creatorId,
          displayName: creatorName,
          joinedAt: new Date(),
          senderKeyDistributed: false,
          role: "admin",
        },
      ],
      epochNumber: 0,
      createdAt: new Date(),
      lastKeyRotation: new Date(),
    };

    this.groups.set(groupId, state);
    this.generateSenderKey(creatorId, groupId, DEFAULT_DEVICE_ID);
    return state;
  }

  addMember(groupId: string, userId: string, displayName: string): { success: boolean; requiresKeyRotation: boolean } {
    const group = this.groups.get(groupId);
    if (!group) return { success: false, requiresKeyRotation: false };
    if (group.members.some((m) => m.userId === userId)) {
      return { success: false, requiresKeyRotation: false };
    }

    group.members.push({
      userId,
      displayName,
      joinedAt: new Date(),
      senderKeyDistributed: false,
      role: "member",
    });

    group.epochNumber += 1;
    this.rotateAllKeys(groupId);
    return { success: true, requiresKeyRotation: true };
  }

  removeMember(groupId: string, userId: string): { success: boolean; requiresKeyRotation: boolean } {
    const group = this.groups.get(groupId);
    if (!group) return { success: false, requiresKeyRotation: false };

    const idx = group.members.findIndex((m) => m.userId === userId);
    if (idx === -1) return { success: false, requiresKeyRotation: false };

    group.members.splice(idx, 1);

    const senderScopePrefix = `${userId}:${groupId}:`;
    for (const keyId of Array.from(this.senderKeys.keys())) {
      if (!keyId.startsWith(senderScopePrefix)) {
        continue;
      }
      const deviceId = keyId.slice(senderScopePrefix.length);
      if (!deviceId) continue;
      this.removeSenderKeyMaterial(userId, groupId, deviceId);
    }

    group.epochNumber += 1;
    this.rotateAllKeys(groupId);
    return { success: true, requiresKeyRotation: true };
  }

  registerSenderDevice(groupId: string, userId: string, deviceId: string): { success: boolean } {
    const normalizedDeviceId = this.normalizeDeviceId(deviceId);
    const group = this.groups.get(groupId);
    if (!group || !group.members.some((m) => m.userId === userId)) {
      return { success: false };
    }

    const keyId = this.senderKeyId(userId, groupId, normalizedDeviceId);
    if (this.senderKeys.has(keyId)) {
      return { success: true };
    }

    this.generateSenderKey(userId, groupId, normalizedDeviceId);
    return { success: true };
  }

  revokeSenderDevice(groupId: string, userId: string, deviceId: string): { success: boolean } {
    const normalizedDeviceId = this.normalizeDeviceId(deviceId);
    if (normalizedDeviceId === DEFAULT_DEVICE_ID) {
      return { success: false };
    }

    const keyId = this.senderKeyId(userId, groupId, normalizedDeviceId);
    if (!this.senderKeys.has(keyId)) {
      return { success: false };
    }

    this.removeSenderKeyMaterial(userId, groupId, normalizedDeviceId);

    return { success: true };
  }

  encrypt(
    senderId: string,
    groupId: string,
    plaintext: string,
    senderDeviceId: string = DEFAULT_DEVICE_ID,
  ): EncryptedGroupMessage | null {
    const group = this.groups.get(groupId);
    if (!group || !group.members.some((member) => member.userId === senderId)) {
      return null;
    }

    const normalizedDeviceId = this.normalizeDeviceId(senderDeviceId);
    const senderKeyId = this.senderKeyId(senderId, groupId, normalizedDeviceId);
    const senderKey = this.senderKeys.get(senderKeyId);
    const signingSecret = this.signingSecrets.get(senderKeyId);
    if (!senderKey || !signingSecret) return null;

    const iteration = senderKey.iteration;
    const msgKey = this.deriveMessageKey(senderKey.chainKey, iteration);
    try {
      if (Buffer.byteLength(plaintext, "utf8") > MAX_PLAINTEXT_BYTES) {
        return null;
      }

      const plaintextBuffer = Buffer.from(plaintext, "utf8");
      const aad = Buffer.from(`${groupId}:${senderId}:${normalizedDeviceId}:${iteration}`, "utf8");

      const cipher = createCipheriv(
        "aes-256-gcm",
        Buffer.from(msgKey.encryptionKey),
        Buffer.from(msgKey.iv),
      );
      cipher.setAAD(aad);

      const ciphertextBuffer = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
      const tagBuffer = cipher.getAuthTag();
      const messageId = randomUUID();
      const timestamp = new Date();
      const signatureVersion: SignatureVersion = 2;
      const signaturePayload = this.signaturePayload(
        messageId,
        groupId,
        senderId,
        normalizedDeviceId,
        iteration,
        new Uint8Array(ciphertextBuffer),
        msgKey.iv,
        new Uint8Array(tagBuffer),
        timestamp,
        signatureVersion,
      );
      const signature = this.sign(signaturePayload, signingSecret);

      senderKey.chainKey = this.ratchetChainKey(senderKey.chainKey);
      senderKey.iteration += 1;
      this.cacheChainCheckpoint(senderId, groupId, normalizedDeviceId, senderKey.iteration, senderKey.chainKey);
      this.cacheMessageKey(
        this.messageKeyId(senderId, groupId, normalizedDeviceId, iteration),
        msgKey,
      );

      return {
        messageId,
        groupId,
        senderId,
        senderDeviceId: normalizedDeviceId,
        signatureVersion,
        ciphertext: new Uint8Array(ciphertextBuffer),
        iv: this.cloneBytes(msgKey.iv),
        tag: new Uint8Array(tagBuffer),
        senderKeyIteration: iteration,
        signature,
        timestamp,
      };
    } finally {
      this.wipeMessageKey(msgKey);
    }
  }

  decrypt(receiverId: string, message: EncryptedGroupMessage): string | null {
    if (
      !this.isValidIdentifier(message.messageId, 128) ||
      !this.isValidIdentifier(message.groupId, 128) ||
      !this.isValidIdentifier(message.senderId, 128)
    ) {
      return null;
    }

    if (
      !(message.ciphertext instanceof Uint8Array) ||
      !(message.iv instanceof Uint8Array) ||
      !(message.tag instanceof Uint8Array) ||
      !(message.signature instanceof Uint8Array)
    ) {
      return null;
    }

    if (message.ciphertext.length === 0 || message.ciphertext.length > MAX_CIPHERTEXT_BYTES) {
      return null;
    }

    const group = this.groups.get(message.groupId);
    if (!group || !group.members.some((member) => member.userId === receiverId)) {
      return null;
    }

    const senderDeviceId = this.normalizeIncomingDeviceId(message.senderDeviceId);
    if (!senderDeviceId) {
      return null;
    }
    const senderKeyId = this.senderKeyId(message.senderId, message.groupId, senderDeviceId);
    const senderKey = this.senderKeys.get(senderKeyId);
    const signingSecret = this.signingSecrets.get(senderKeyId);
    if (!senderKey || !signingSecret) return null;

    const normalizedTimestamp = this.normalizeTimestamp(message.timestamp);
    if (!normalizedTimestamp) return null;
    const now = Date.now();
    const tsMs = normalizedTimestamp.getTime();
    if (tsMs > now + MESSAGE_MAX_FUTURE_SKEW_MS || tsMs < now - MESSAGE_MAX_AGE_MS) {
      return null;
    }

    if (
      !Number.isInteger(message.senderKeyIteration) ||
      message.senderKeyIteration < 0 ||
      message.senderKeyIteration > senderKey.iteration + MESSAGE_MAX_ITERATION_AHEAD
    ) {
      return null;
    }

    if (message.iv.length !== 12 || message.tag.length !== 16 || message.signature.length !== 32) {
      return null;
    }

    const senderIterationTrackerId = this.senderKeyId(
      message.senderId,
      message.groupId,
      senderDeviceId,
    );
    const highestAcceptedIteration = this.highestAcceptedIterations.get(senderIterationTrackerId);
    if (
      highestAcceptedIteration !== undefined &&
      message.senderKeyIteration < highestAcceptedIteration - MESSAGE_MAX_ITERATION_ROLLBACK_WINDOW
    ) {
      return null;
    }

    const signatureVersion: SignatureVersion = message.signatureVersion === 2 ? 2 : 1;
    const signaturePayload = this.signaturePayload(
      message.messageId,
      message.groupId,
      message.senderId,
      senderDeviceId,
      message.senderKeyIteration,
      message.ciphertext,
      message.iv,
      message.tag,
      normalizedTimestamp,
      signatureVersion,
    );
    if (!this.verifySignature(signaturePayload, message.signature, signingSecret)) {
      return null;
    }

    if (this.isReplay(message.groupId, message.messageId, now)) {
      return null;
    }

    const msgKey = this.deriveMessageKeyForIteration(
      message.senderId,
      message.groupId,
      senderDeviceId,
      message.senderKeyIteration,
    );
    if (!msgKey) return null;
    try {
      if (!this.bytesEqual(msgKey.iv, message.iv)) return null;

      const aad = Buffer.from(
        signatureVersion === 2
          ? `${message.groupId}:${message.senderId}:${senderDeviceId}:${message.senderKeyIteration}`
          : `${message.groupId}:${message.senderId}:${message.senderKeyIteration}`,
        "utf8",
      );

      const decipher = createDecipheriv(
        "aes-256-gcm",
        Buffer.from(msgKey.encryptionKey),
        Buffer.from(message.iv),
      );
      decipher.setAAD(aad);
      decipher.setAuthTag(Buffer.from(message.tag));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(message.ciphertext)),
        decipher.final(),
      ]);
      if (
        highestAcceptedIteration === undefined ||
        message.senderKeyIteration > highestAcceptedIteration
      ) {
        this.highestAcceptedIterations.set(senderIterationTrackerId, message.senderKeyIteration);
      }
      return plaintext.toString("utf8");
    } catch {
      return null;
    } finally {
      this.wipeMessageKey(msgKey);
    }
  }

  getGroup(groupId: string): GroupState | null {
    return this.groups.get(groupId) ?? null;
  }

  getGroupMembers(groupId: string): GroupMember[] {
    return this.groups.get(groupId)?.members ?? [];
  }

  getEpoch(groupId: string): number {
    return this.groups.get(groupId)?.epochNumber ?? 0;
  }

  private senderKeyId(userId: string, groupId: string, deviceId: string = DEFAULT_DEVICE_ID): string {
    return `${userId}:${groupId}:${deviceId}`;
  }

  private messageKeyId(
    senderId: string,
    groupId: string,
    deviceId: string,
    iteration: number,
  ): string {
    return `${senderId}:${groupId}:${deviceId}:${iteration}`;
  }

  private chainCheckpointId(
    senderId: string,
    groupId: string,
    deviceId: string,
    iteration: number,
  ): string {
    return `${senderId}:${groupId}:${deviceId}:${iteration}`;
  }

  private generateSenderKey(userId: string, groupId: string, deviceId: string): SenderKey {
    const keyId = this.senderKeyId(userId, groupId, deviceId);
    if (
      this.senderKeys.has(keyId) ||
      this.senderInitialChainKeys.has(keyId) ||
      this.signingSecrets.has(keyId)
    ) {
      this.removeSenderKeyMaterial(userId, groupId, deviceId);
    }

    const baseChainKey = this.secureRandom(32);
    const signingSecret = this.secureRandom(32);

    const key: SenderKey = {
      userId,
      groupId,
      deviceId,
      chainKey: this.cloneBytes(baseChainKey),
      publicSigningKey: this.derivePublicSigningKey(signingSecret),
      iteration: 0,
      createdAt: new Date(),
    };

    this.senderKeys.set(keyId, key);
    this.senderInitialChainKeys.set(keyId, this.cloneBytes(baseChainKey));
    this.signingSecrets.set(keyId, signingSecret);
    this.highestAcceptedIterations.delete(keyId);
    this.cacheChainCheckpoint(userId, groupId, deviceId, 0, baseChainKey);
    this.clearMessageKeyCacheForGroup(groupId);
    this.wipeBytes(baseChainKey);
    return key;
  }

  private rotateAllKeys(groupId: string): void {
    const group = this.groups.get(groupId);
    if (!group) return;

    for (const member of group.members) {
      const deviceIds = this.listSenderDevicesForMember(member.userId, groupId);
      for (const deviceId of deviceIds) {
        this.generateSenderKey(member.userId, groupId, deviceId);
      }
      member.senderKeyDistributed = false;
    }

    group.lastKeyRotation = new Date();
    this.clearReplayCacheForGroup(groupId);
  }

  private listSenderDevicesForMember(userId: string, groupId: string): string[] {
    const deviceIds = new Set<string>([DEFAULT_DEVICE_ID]);
    for (const key of this.senderKeys.keys()) {
      const [keyUserId, keyGroupId, keyDeviceId] = key.split(":");
      if (keyUserId === userId && keyGroupId === groupId && keyDeviceId) {
        deviceIds.add(keyDeviceId);
      }
    }
    return Array.from(deviceIds);
  }

  private ratchetChainKey(chainKey: Uint8Array): Uint8Array {
    const next = createHmac("sha256", Buffer.from(chainKey))
      .update("quantchat.group.chain.ratchet.v1")
      .digest();
    return new Uint8Array(next);
  }

  private deriveMessageKey(chainKey: Uint8Array, iteration: number): MessageKey {
    const iterationBytes = Buffer.allocUnsafe(4);
    iterationBytes.writeUInt32BE(iteration >>> 0, 0);

    const material = Buffer.from(
      hkdfSync(
        "sha256",
        Buffer.from(chainKey),
        iterationBytes,
        Buffer.from("quantchat.group.message.keys.v1"),
        76,
      ),
    );

    const derived: MessageKey = {
      encryptionKey: new Uint8Array(material.subarray(0, 32)),
      macKey: new Uint8Array(material.subarray(32, 64)),
      iv: new Uint8Array(material.subarray(64, 76)),
      iteration,
    };
    material.fill(0);
    iterationBytes.fill(0);
    return derived;
  }

  private deriveMessageKeyForIteration(
    senderId: string,
    groupId: string,
    deviceId: string,
    iteration: number,
  ): MessageKey | null {
    if (iteration < 0) return null;

    const cacheId = this.messageKeyId(senderId, groupId, deviceId, iteration);
    const cached = this.messageKeyCache.get(cacheId);
    if (cached) {
      return this.cloneMessageKey(cached);
    }

    const senderKeyId = this.senderKeyId(senderId, groupId, deviceId);
    const senderKey = this.senderKeys.get(senderKeyId);
    const baseChainKey = this.senderInitialChainKeys.get(senderKeyId);
    if (!senderKey || !baseChainKey) return null;
    if (iteration > senderKey.iteration + MESSAGE_MAX_ITERATION_AHEAD) return null;

    let startIteration = 0;
    let chain = this.cloneBytes(baseChainKey);

    const nearestCheckpoint = iteration - (iteration % CHAIN_CHECKPOINT_INTERVAL);
    for (let checkpoint = nearestCheckpoint; checkpoint >= 0; checkpoint -= CHAIN_CHECKPOINT_INTERVAL) {
      const checkpointKey = this.chainCheckpointCache.get(
        this.chainCheckpointId(senderId, groupId, deviceId, checkpoint),
      );
      if (checkpointKey) {
        startIteration = checkpoint;
        chain = this.cloneBytes(checkpointKey);
        break;
      }
    }

    for (let i = startIteration; i < iteration; i++) {
      chain = this.ratchetChainKey(chain);
      const nextIteration = i + 1;
      if (nextIteration % CHAIN_CHECKPOINT_INTERVAL === 0) {
        this.cacheChainCheckpoint(senderId, groupId, deviceId, nextIteration, chain);
      }
    }

    const derived = this.deriveMessageKey(chain, iteration);
    this.cacheMessageKey(cacheId, derived);
    return this.cloneMessageKey(derived);
  }

  private cacheChainCheckpoint(
    senderId: string,
    groupId: string,
    deviceId: string,
    iteration: number,
    chainKey: Uint8Array,
  ): void {
    if (iteration % CHAIN_CHECKPOINT_INTERVAL !== 0 && iteration !== 0) {
      return;
    }

    const checkpointId = this.chainCheckpointId(senderId, groupId, deviceId, iteration);
    const existing = this.chainCheckpointCache.get(checkpointId);
    if (existing) {
      this.wipeBytes(existing);
    }
    this.chainCheckpointCache.set(checkpointId, this.cloneBytes(chainKey));

    while (this.chainCheckpointCache.size > CHAIN_CHECKPOINT_CACHE_MAX) {
      const oldestKey = this.chainCheckpointCache.keys().next().value;
      if (!oldestKey) break;
      this.wipeBytes(this.chainCheckpointCache.get(oldestKey));
      this.chainCheckpointCache.delete(oldestKey);
    }
  }

  private signaturePayload(
    messageId: string,
    groupId: string,
    senderId: string,
    senderDeviceId: string,
    iteration: number,
    ciphertext: Uint8Array,
    iv: Uint8Array,
    tag: Uint8Array,
    timestamp: Date,
    version: SignatureVersion,
  ): Uint8Array {
    const prefixString =
      version === 2
        ? `${messageId}|${groupId}|${senderId}|${senderDeviceId}|${iteration}|${timestamp.toISOString()}`
        : `${messageId}|${groupId}|${senderId}|${iteration}|${timestamp.toISOString()}`;

    const prefix = Buffer.from(prefixString, "utf8");
    const payload = Buffer.concat([
      prefix,
      Buffer.from(iv),
      Buffer.from(tag),
      Buffer.from(ciphertext),
    ]);
    return new Uint8Array(payload);
  }

  private derivePublicSigningKey(secret: Uint8Array): Uint8Array {
    return new Uint8Array(
      createHash("sha256")
        .update(Buffer.from(secret))
        .update("quantchat.signing.public.v1")
        .digest(),
    );
  }

  private sign(data: Uint8Array, signingSecret: Uint8Array): Uint8Array {
    return new Uint8Array(
      createHmac("sha256", Buffer.from(signingSecret))
        .update(Buffer.from(data))
        .digest(),
    );
  }

  private verifySignature(data: Uint8Array, signature: Uint8Array, signingSecret: Uint8Array): boolean {
    const expected = this.sign(data, signingSecret);
    if (expected.length !== signature.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  private bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.length !== right.length) return false;
    return timingSafeEqual(Buffer.from(left), Buffer.from(right));
  }

  private isReplay(groupId: string, messageId: string, observedAtMs: number): boolean {
    const replayId = `${groupId}:${messageId}`;
    if (this.replayCache.has(replayId)) return true;

    this.replayCache.set(replayId, observedAtMs);
    if (
      observedAtMs - this.replayLastPrunedAt >= REPLAY_PRUNE_INTERVAL_MS ||
      this.replayCache.size > REPLAY_CACHE_MAX
    ) {
      this.pruneReplayCache(observedAtMs);
    }
    return false;
  }

  private pruneReplayCache(nowMs: number): void {
    this.replayLastPrunedAt = nowMs;
    const cutoff = nowMs - REPLAY_CACHE_TTL_MS;
    for (const [key, seenAtMs] of this.replayCache) {
      if (seenAtMs < cutoff) {
        this.replayCache.delete(key);
      }
    }

    while (this.replayCache.size > REPLAY_CACHE_MAX) {
      const oldestKey = this.replayCache.keys().next().value;
      if (!oldestKey) break;
      this.replayCache.delete(oldestKey);
    }
  }

  private clearReplayCacheForGroup(groupId: string): void {
    const prefix = `${groupId}:`;
    for (const key of this.replayCache.keys()) {
      if (key.startsWith(prefix)) {
        this.replayCache.delete(key);
      }
    }
  }

  private secureRandom(length: number): Uint8Array {
    return new Uint8Array(randomBytes(length));
  }

  private clearMessageKeyCacheForGroup(groupId: string): void {
    for (const [key, value] of this.messageKeyCache) {
      if (key.includes(`:${groupId}:`)) {
        this.wipeMessageKey(value);
        this.messageKeyCache.delete(key);
      }
    }
  }

  private cacheMessageKey(cacheKey: string, key: MessageKey): void {
    const existing = this.messageKeyCache.get(cacheKey);
    if (existing) {
      this.wipeMessageKey(existing);
    }
    this.messageKeyCache.set(cacheKey, this.cloneMessageKey(key));

    while (this.messageKeyCache.size > MESSAGE_KEY_CACHE_MAX) {
      const oldestKey = this.messageKeyCache.keys().next().value;
      if (!oldestKey) break;
      this.wipeMessageKey(this.messageKeyCache.get(oldestKey));
      this.messageKeyCache.delete(oldestKey);
    }
  }

  private clearSenderScopedCaches(groupId: string, deviceId: string): void {
    const scopedKey = `:${groupId}:${deviceId}:`;
    for (const [cacheKey, value] of this.messageKeyCache) {
      if (!cacheKey.includes(scopedKey)) continue;
      this.wipeMessageKey(value);
      this.messageKeyCache.delete(cacheKey);
    }
    for (const [checkpointKey, value] of this.chainCheckpointCache) {
      if (!checkpointKey.includes(scopedKey)) continue;
      this.wipeBytes(value);
      this.chainCheckpointCache.delete(checkpointKey);
    }
  }

  private removeSenderKeyMaterial(userId: string, groupId: string, deviceId: string): void {
    const keyId = this.senderKeyId(userId, groupId, deviceId);
    const senderKey = this.senderKeys.get(keyId);
    if (senderKey) {
      this.wipeBytes(senderKey.chainKey);
      this.wipeBytes(senderKey.publicSigningKey);
      this.senderKeys.delete(keyId);
    }

    const baseChainKey = this.senderInitialChainKeys.get(keyId);
    if (baseChainKey) {
      this.wipeBytes(baseChainKey);
      this.senderInitialChainKeys.delete(keyId);
    }

    const signingSecret = this.signingSecrets.get(keyId);
    if (signingSecret) {
      this.wipeBytes(signingSecret);
      this.signingSecrets.delete(keyId);
    }

    this.highestAcceptedIterations.delete(keyId);
    this.clearSenderScopedCaches(groupId, deviceId);
  }

  private normalizeDeviceId(deviceId: string | undefined): string {
    if (!deviceId || typeof deviceId !== "string") return DEFAULT_DEVICE_ID;
    const trimmed = deviceId.trim();
    if (!trimmed || trimmed.length > 64 || !DEVICE_ID_PATTERN.test(trimmed)) {
      return DEFAULT_DEVICE_ID;
    }
    return trimmed;
  }

  private normalizeIncomingDeviceId(deviceId: string | undefined): string | null {
    if (deviceId === undefined) return DEFAULT_DEVICE_ID;
    if (typeof deviceId !== "string") return null;
    const trimmed = deviceId.trim();
    if (!trimmed || trimmed.length > 64 || !DEVICE_ID_PATTERN.test(trimmed)) {
      return null;
    }
    return trimmed;
  }

  private normalizeTimestamp(timestamp: Date): Date | null {
    if (timestamp instanceof Date && !Number.isNaN(timestamp.getTime())) {
      return timestamp;
    }

    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  private cloneBytes(bytes: Uint8Array): Uint8Array {
    return new Uint8Array(bytes);
  }

  private wipeBytes(bytes: Uint8Array | undefined): void {
    if (bytes) {
      bytes.fill(0);
    }
  }

  private isValidIdentifier(value: unknown, maxLength: number): value is string {
    return (
      typeof value === "string" &&
      value.length > 0 &&
      value.length <= maxLength &&
      IDENTIFIER_PATTERN.test(value)
    );
  }

  private cloneMessageKey(key: MessageKey): MessageKey {
    return {
      encryptionKey: this.cloneBytes(key.encryptionKey),
      iv: this.cloneBytes(key.iv),
      macKey: this.cloneBytes(key.macKey),
      iteration: key.iteration,
    };
  }

  private wipeMessageKey(key: MessageKey | undefined): void {
    if (!key) return;
    this.wipeBytes(key.encryptionKey);
    this.wipeBytes(key.iv);
    this.wipeBytes(key.macKey);
  }
}
