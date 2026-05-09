import { createHash } from "crypto";
import { logger } from "../logger";
import { pubClient, redisReady } from "../redis";

export type CompanionSessionTransport = "http" | "socket";
export type CompanionSessionStatus = "active" | "offline";

export interface CompanionSessionRecord {
  sessionId: string;
  userId: string;
  tokenId: string | null;
  deviceId: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  transport: CompanionSessionTransport;
  socketId: string | null;
  status: CompanionSessionStatus;
  createdAt: string;
  lastSeenAt: string;
}

export interface TouchCompanionSessionInput {
  userId: string;
  tokenId?: string | null;
  providedSessionId?: string | null;
  deviceId?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  transport: CompanionSessionTransport;
  socketId?: string | null;
}

const SESSION_TTL_MS = Math.max(
  5 * 60_000,
  Number.parseInt(process.env.COMPANION_SESSION_TTL_MS ?? "2592000000", 10),
); // default 30 days
const SESSION_TTL_SECS = Math.max(60, Math.floor(SESSION_TTL_MS / 1000));
const WRITE_THROTTLE_MS = Math.max(
  5_000,
  Number.parseInt(process.env.COMPANION_SESSION_WRITE_THROTTLE_MS ?? "15000", 10),
);
const MAX_LIST_LIMIT = 100;
const MAX_MEMORY_SESSIONS_PER_USER = 64;
const MAX_REDIS_SESSIONS_PER_USER = Math.max(
  MAX_MEMORY_SESSIONS_PER_USER,
  Number.parseInt(process.env.COMPANION_SESSION_MAX_PER_USER ?? "256", 10),
);
const SESSION_KEY_PREFIX = "quantchat:companion-session";
const USER_INDEX_PREFIX = "quantchat:companion-session-user";
const REVOKED_SESSION_KEY_PREFIX = "quantchat:companion-session-revoked";
const REVOKED_CACHE_TTL_MS = Math.max(5 * 60_000, SESSION_TTL_MS);
const LAST_PERSIST_TRACKING_TTL_MS = Math.max(60_000, WRITE_THROTTLE_MS * 4);
const REDIS_SESSION_PRUNE_INTERVAL_MS = Math.max(
  30_000,
  Number.parseInt(process.env.COMPANION_SESSION_REDIS_PRUNE_INTERVAL_MS ?? "60000", 10),
);
const LAST_REDIS_PRUNE_TRACKING_TTL_MS = Math.max(
  60_000,
  REDIS_SESSION_PRUNE_INTERVAL_MS * 4,
);

const memorySessions = new Map<string, Map<string, CompanionSessionRecord>>();
const lastPersistAt = new Map<string, number>();
const revokedSessionCache = new Map<string, number>();
const lastRedisPruneAt = new Map<string, number>();

function sessionKey(userId: string, sessionId: string): string {
  return `${SESSION_KEY_PREFIX}:${userId}:${sessionId}`;
}

function userIndexKey(userId: string): string {
  return `${USER_INDEX_PREFIX}:${userId}`;
}

function revokedSessionKey(userId: string, sessionId: string): string {
  return `${REVOKED_SESSION_KEY_PREFIX}:${userId}:${sessionId}`;
}

function normalizeOptional(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildSessionId(input: TouchCompanionSessionInput): string {
  const explicit = normalizeOptional(input.providedSessionId, 256);
  if (explicit) return explicit;

  const digest = createHash("sha256")
    .update(
      [
        input.userId,
        input.tokenId ?? "",
        input.deviceId ?? "",
        input.userAgent ?? "",
        input.ipAddress ?? "",
        input.transport,
      ].join("|"),
    )
    .digest("hex");

  return digest.slice(0, 40);
}

function parseSession(raw: string | null): CompanionSessionRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CompanionSessionRecord>;
    if (
      typeof parsed.sessionId !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.lastSeenAt !== "string"
    ) {
      return null;
    }

    return {
      sessionId: parsed.sessionId,
      userId: parsed.userId,
      tokenId: normalizeOptional(parsed.tokenId, 512),
      deviceId: normalizeOptional(parsed.deviceId, 256),
      userAgent: normalizeOptional(parsed.userAgent, 1024),
      ipAddress: normalizeOptional(parsed.ipAddress, 256),
      transport: parsed.transport === "socket" ? "socket" : "http",
      socketId: normalizeOptional(parsed.socketId, 256),
      status: parsed.status === "offline" ? "offline" : "active",
      createdAt: parsed.createdAt,
      lastSeenAt: parsed.lastSeenAt,
    };
  } catch {
    return null;
  }
}

function rememberInMemory(record: CompanionSessionRecord): void {
  let userMap = memorySessions.get(record.userId);
  if (!userMap) {
    userMap = new Map();
    memorySessions.set(record.userId, userMap);
  }

  // Re-insert to keep recent sessions at the end of the map.
  userMap.delete(record.sessionId);
  userMap.set(record.sessionId, record);

  while (userMap.size > MAX_MEMORY_SESSIONS_PER_USER) {
    const oldestSessionId = userMap.keys().next().value;
    if (!oldestSessionId) break;
    userMap.delete(oldestSessionId);
  }
}

async function persistToRedis(record: CompanionSessionRecord): Promise<void> {
  const key = sessionKey(record.userId, record.sessionId);
  const indexKey = userIndexKey(record.userId);
  const cutoff = Date.now() - SESSION_TTL_MS;

  await pubClient
    .multi()
    .set(key, JSON.stringify(record), { PX: SESSION_TTL_MS })
    .zAdd(indexKey, { score: Date.parse(record.lastSeenAt), value: record.sessionId })
    .zRemRangeByScore(indexKey, 0, cutoff)
    .expire(indexKey, SESSION_TTL_SECS)
    .exec();

  const nowMs = Date.now();
  const lastPruneAt = lastRedisPruneAt.get(record.userId);
  if (
    lastPruneAt !== undefined &&
    nowMs - lastPruneAt < REDIS_SESSION_PRUNE_INTERVAL_MS
  ) {
    return;
  }
  lastRedisPruneAt.set(record.userId, nowMs);

  const totalSessions = await pubClient.zCard(indexKey);
  const overflow = totalSessions - MAX_REDIS_SESSIONS_PER_USER;
  if (overflow <= 0) {
    return;
  }

  const staleSessionIds = await pubClient.zRange(indexKey, 0, overflow - 1);
  if (staleSessionIds.length === 0) {
    return;
  }

  const pruneTx = pubClient.multi().zRemRangeByRank(indexKey, 0, staleSessionIds.length - 1);
  for (const staleSessionId of staleSessionIds) {
    pruneTx.del(sessionKey(record.userId, staleSessionId));
  }
  await pruneTx.exec();
}

function rememberRevokedSession(userId: string, sessionId: string, nowMs: number = Date.now()): void {
  revokedSessionCache.set(`${userId}:${sessionId}`, nowMs + REVOKED_CACHE_TTL_MS);
}

function isRevokedSessionCached(userId: string, sessionId: string, nowMs: number): boolean {
  const key = `${userId}:${sessionId}`;
  const expiresAt = revokedSessionCache.get(key);
  if (!expiresAt) return false;
  if (expiresAt <= nowMs) {
    revokedSessionCache.delete(key);
    return false;
  }
  return true;
}

export async function isCompanionSessionRevoked(
  userIdInput: string,
  sessionIdInput: string,
): Promise<boolean> {
  const userId = normalizeOptional(userIdInput, 128);
  const sessionId = normalizeOptional(sessionIdInput, 256);
  if (!userId || !sessionId) return false;

  const nowMs = Date.now();
  if (isRevokedSessionCached(userId, sessionId, nowMs)) {
    return true;
  }

  if (!redisReady) {
    return false;
  }

  try {
    const exists = await pubClient.exists(revokedSessionKey(userId, sessionId));
    if (exists > 0) {
      rememberRevokedSession(userId, sessionId, nowMs);
      return true;
    }
  } catch (err) {
    logger.warn({ err, userId, sessionId }, "[CompanionSession] Revoke lookup failed");
  }

  return false;
}

function shouldPersist(userId: string, sessionId: string, nowMs: number): boolean {
  const key = `${userId}:${sessionId}`;
  const last = lastPersistAt.get(key);
  if (last !== undefined && nowMs - last < WRITE_THROTTLE_MS) {
    return false;
  }
  lastPersistAt.set(key, nowMs);
  return true;
}

export async function touchCompanionSession(
  input: TouchCompanionSessionInput,
): Promise<CompanionSessionRecord> {
  const userId = normalizeOptional(input.userId, 128);
  if (!userId) {
    throw new Error("Invalid userId for companion session");
  }

  const sessionId = buildSessionId({
    ...input,
    userId,
    tokenId: normalizeOptional(input.tokenId, 512),
    deviceId: normalizeOptional(input.deviceId, 256),
    userAgent: normalizeOptional(input.userAgent, 1024),
    ipAddress: normalizeOptional(input.ipAddress, 256),
    providedSessionId: normalizeOptional(input.providedSessionId, 256),
    socketId: normalizeOptional(input.socketId, 256),
  });

  const timestamp = nowIso();
  let existing: CompanionSessionRecord | null = null;

  if (redisReady) {
    existing = parseSession(await pubClient.get(sessionKey(userId, sessionId)));
  } else {
    existing = memorySessions.get(userId)?.get(sessionId) ?? null;
  }

  const record: CompanionSessionRecord = {
    sessionId,
    userId,
    tokenId: normalizeOptional(input.tokenId, 512),
    deviceId: normalizeOptional(input.deviceId, 256),
    userAgent: normalizeOptional(input.userAgent, 1024),
    ipAddress: normalizeOptional(input.ipAddress, 256),
    transport: input.transport,
    socketId: normalizeOptional(input.socketId, 256),
    status: "active",
    createdAt: existing?.createdAt ?? timestamp,
    lastSeenAt: timestamp,
  };

  rememberInMemory(record);

  const nowMs = Date.now();
  if (!shouldPersist(userId, sessionId, nowMs)) {
    return record;
  }

  if (redisReady) {
    try {
      await persistToRedis(record);
    } catch (err) {
      logger.warn({ err, userId, sessionId }, "[CompanionSession] Redis persist failed");
    }
  }

  return record;
}

export async function markCompanionSessionOffline(
  userIdInput: string,
  sessionIdInput: string,
): Promise<void> {
  const userId = normalizeOptional(userIdInput, 128);
  const sessionId = normalizeOptional(sessionIdInput, 256);
  if (!userId || !sessionId) return;

  const key = sessionKey(userId, sessionId);
  let existing: CompanionSessionRecord | null = null;

  if (redisReady) {
    existing = parseSession(await pubClient.get(key));
  } else {
    existing = memorySessions.get(userId)?.get(sessionId) ?? null;
  }

  if (!existing) return;

  const updated: CompanionSessionRecord = {
    ...existing,
    status: "offline",
    socketId: null,
    lastSeenAt: nowIso(),
  };
  rememberInMemory(updated);

  if (redisReady) {
    try {
      await persistToRedis(updated);
    } catch (err) {
      logger.warn({ err, userId, sessionId }, "[CompanionSession] Offline update failed");
    }
  }
}

export async function listCompanionSessions(
  userIdInput: string,
  limit: number = 25,
): Promise<CompanionSessionRecord[]> {
  const userId = normalizeOptional(userIdInput, 128);
  if (!userId) return [];
  const boundedLimit = Math.min(Math.max(1, limit), MAX_LIST_LIMIT);

  if (redisReady) {
    try {
      const indexKey = userIndexKey(userId);
      const cutoff = Date.now() - SESSION_TTL_MS;
      await pubClient.zRemRangeByScore(indexKey, 0, cutoff);

      const ids = await pubClient.zRevRange(indexKey, 0, boundedLimit * 2);
      if (ids.length === 0) return [];

      const keys = ids.map((id) => sessionKey(userId, id));
      const raws = await pubClient.mGet(keys);
      const records = raws
        .map((raw) => parseSession(raw))
        .filter((record): record is CompanionSessionRecord => Boolean(record))
        .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
        .slice(0, boundedLimit);

      for (const record of records) rememberInMemory(record);
      return records;
    } catch (err) {
      logger.warn({ err, userId }, "[CompanionSession] Redis list failed");
    }
  }

  const userMap = memorySessions.get(userId);
  if (!userMap) return [];
  return Array.from(userMap.values())
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
    .slice(0, boundedLimit);
}

export async function revokeCompanionSession(
  userIdInput: string,
  sessionIdInput: string,
): Promise<boolean> {
  const userId = normalizeOptional(userIdInput, 128);
  const sessionId = normalizeOptional(sessionIdInput, 256);
  if (!userId || !sessionId) return false;

  rememberRevokedSession(userId, sessionId);
  memorySessions.get(userId)?.delete(sessionId);
  lastPersistAt.delete(`${userId}:${sessionId}`);
  lastRedisPruneAt.delete(userId);

  if (!redisReady) return true;

  try {
    const results = await pubClient
      .multi()
      .set(revokedSessionKey(userId, sessionId), "1", { PX: SESSION_TTL_MS })
      .del(sessionKey(userId, sessionId))
      .zRem(userIndexKey(userId), sessionId)
      .exec();

    const delCount = Array.isArray(results) ? Number(results[1] ?? 0) : 0;
    return Number(delCount ?? 0) > 0;
  } catch (err) {
    logger.warn({ err, userId, sessionId }, "[CompanionSession] Revoke failed");
    return false;
  }
}

const persistTrackingSweep = setInterval(() => {
  const nowMs = Date.now();
  const cutoff = nowMs - LAST_PERSIST_TRACKING_TTL_MS;
  for (const [key, lastPersistMs] of lastPersistAt) {
    if (lastPersistMs < cutoff) {
      lastPersistAt.delete(key);
    }
  }

  const redisPruneCutoff = nowMs - LAST_REDIS_PRUNE_TRACKING_TTL_MS;
  for (const [userId, lastPrunedAt] of lastRedisPruneAt) {
    if (lastPrunedAt < redisPruneCutoff) {
      lastRedisPruneAt.delete(userId);
    }
  }
}, LAST_PERSIST_TRACKING_TTL_MS);

if (typeof persistTrackingSweep.unref === "function") {
  persistTrackingSweep.unref();
}

const revokedSessionSweep = setInterval(() => {
  const nowMs = Date.now();
  for (const [key, expiresAt] of revokedSessionCache) {
    if (expiresAt <= nowMs) {
      revokedSessionCache.delete(key);
    }
  }
}, REVOKED_CACHE_TTL_MS);

if (typeof revokedSessionSweep.unref === "function") {
  revokedSessionSweep.unref();
}
