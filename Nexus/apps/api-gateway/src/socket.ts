import type { Server, Socket } from "socket.io";
import { prisma, type Prisma } from "@repo/database";
import { logger } from "./logger";
import { pubClient, redisReady } from "./redis";
import {
  DISAPPEARING_MAX_SECS,
  DISAPPEARING_MIN_SECS,
  normalizeTtlSecs,
} from "./services/DisappearingMessages";
import {
  roomManager,
  MAX_PARTICIPANTS_PER_ROOM,
  type RoomParticipant,
  type RoomSnapshot,
} from "./services/RoomManager";
import {
  GiftSystem,
  GiftNotFoundError,
  GiftRateLimitError,
  RecipientRefusesGiftsError,
  SelfGiftError,
} from "./services/GiftSystem";
import {
  AttentionTokenService,
  InsufficientBalanceError,
  InvalidAmountError,
} from "./services/AttentionTokenService";
import { ReciprocityEngine } from "./services/ReciprocityEngine";
import { verifyBiometricToken } from "./middleware/auth";
import {
  isCompanionSessionRevoked,
  markCompanionSessionOffline,
  touchCompanionSession,
} from "./services/CompanionSessionTracker";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SOCKET EVENT HANDLERS â€” Production Hardened
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//
// Hardening applied:
//   1. Auth guard on all events (except "auth" itself)
//   2. Per-user sliding-window rate limiter
//   3. Payload validation + max content size
//   4. Single-query delivery acks (was 2 queries)
//   5. Backpressured offline queue flush (batched)
//   6. Structured logging (no console.log spam at 10k+ connections)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€â”€ Rate Limiter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface RateBucket {
  count: number;
  windowStart: number;
}

// Per-user, per-event rate limits (requests per 60-second window)
const RATE_LIMITS: Record<string, number> = {
  "auth": 10,  // Prevent brute force auth attempts
  "send-message": 30,
  "typing": 60,
  "upload-prekeys": 5,
  "rotate-prekeys": 10,
  "register-keys": 5,
  "get-prekey-bundle": 20,
  "get-keys": 20,
  "message-delivered": 60,
  "message-read": 60,
  "sync-queue": 5,
  "live-location-update": 30,
  "webrtc-signal": 60,
  "join-room": 20,
  "leave-room": 20,
  "room-publish-state": 60,
  "hologram-visual-sync": 120,
  "quantsink-liveness-ping": 120,
  "set-disappearing": 10,
  "get-disappearing": 30,
  "send-gift": 20,
  "record-call-minute": 120,
  "get-gift-insights": 20,
  "whiteboard-join": 10,
  "whiteboard-leave": 10,
  "whiteboard-op": 600,
  "whiteboard-cursor": 1200,
  "whiteboard-snapshot-request": 6,
  "whiteboard-snapshot-response": 6,
  "whiteboard-replay-request": 12,
};

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const IS_DEVELOPMENT = process.env.NODE_ENV === "development";
const INSECURE_SOCKET_AUTH_REQUESTED = process.env.ALLOW_INSECURE_SOCKET_AUTH === "true";
const ALLOW_INSECURE_SOCKET_AUTH = IS_DEVELOPMENT && INSECURE_SOCKET_AUTH_REQUESTED;
const REALTIME_TELEMETRY_LOG_INTERVAL_MS = Math.max(
  10_000,
  Number.parseInt(process.env.REALTIME_TELEMETRY_LOG_INTERVAL_MS ?? "60000", 10),
);

interface RealtimeTelemetry {
  sendAttempts: number;
  sendPersisted: number;
  sendErrors: number;
  sendPersistLatencyMsTotal: number;
  receiptEvents: number;
  receiptMessagesRequested: number;
  receiptMessagesUpdated: number;
  receiptCacheSuppressed: number;
  queueSyncRequests: number;
  queueFlushRuns: number;
  queueFlushBatches: number;
  queueMessagesEmitted: number;
  queueFlushCapped: number;
  queueRecoveryPulseEvents: number;
  queueRecoveryDriftAlerts: number;
  queueRecoveryBacklogTotal: number;
}

const realtimeTelemetry: RealtimeTelemetry = {
  sendAttempts: 0,
  sendPersisted: 0,
  sendErrors: 0,
  sendPersistLatencyMsTotal: 0,
  receiptEvents: 0,
  receiptMessagesRequested: 0,
  receiptMessagesUpdated: 0,
  receiptCacheSuppressed: 0,
  queueSyncRequests: 0,
  queueFlushRuns: 0,
  queueFlushBatches: 0,
  queueMessagesEmitted: 0,
  queueFlushCapped: 0,
  queueRecoveryPulseEvents: 0,
  queueRecoveryDriftAlerts: 0,
  queueRecoveryBacklogTotal: 0,
};

let telemetryLastLoggedAt = Date.now();

function flushRealtimeTelemetry(): void {
  const now = Date.now();
  const elapsedMs = now - telemetryLastLoggedAt;
  telemetryLastLoggedAt = now;

  const totalEvents =
    realtimeTelemetry.sendAttempts +
    realtimeTelemetry.receiptEvents +
    realtimeTelemetry.queueFlushRuns;
  if (totalEvents === 0) return;

  const avgSendPersistMs =
    realtimeTelemetry.sendPersisted > 0
      ? Number(
          (realtimeTelemetry.sendPersistLatencyMsTotal / realtimeTelemetry.sendPersisted).toFixed(2),
        )
      : 0;

  logger.info(
    {
      windowMs: elapsedMs,
      sendAttempts: realtimeTelemetry.sendAttempts,
      sendPersisted: realtimeTelemetry.sendPersisted,
      sendErrors: realtimeTelemetry.sendErrors,
      avgSendPersistMs,
      receiptEvents: realtimeTelemetry.receiptEvents,
      receiptMessagesRequested: realtimeTelemetry.receiptMessagesRequested,
      receiptMessagesUpdated: realtimeTelemetry.receiptMessagesUpdated,
      receiptCacheSuppressed: realtimeTelemetry.receiptCacheSuppressed,
      queueSyncRequests: realtimeTelemetry.queueSyncRequests,
      queueFlushRuns: realtimeTelemetry.queueFlushRuns,
      queueFlushBatches: realtimeTelemetry.queueFlushBatches,
      queueMessagesEmitted: realtimeTelemetry.queueMessagesEmitted,
      queueFlushCapped: realtimeTelemetry.queueFlushCapped,
      queueRecoveryPulseEvents: realtimeTelemetry.queueRecoveryPulseEvents,
      queueRecoveryDriftAlerts: realtimeTelemetry.queueRecoveryDriftAlerts,
      avgQueueRecoveryBacklog:
        realtimeTelemetry.queueRecoveryPulseEvents > 0
          ? Number(
              (
                realtimeTelemetry.queueRecoveryBacklogTotal /
                realtimeTelemetry.queueRecoveryPulseEvents
              ).toFixed(2),
            )
          : 0,
    },
    "[SocketTelemetry] Realtime delivery window summary",
  );

  realtimeTelemetry.sendAttempts = 0;
  realtimeTelemetry.sendPersisted = 0;
  realtimeTelemetry.sendErrors = 0;
  realtimeTelemetry.sendPersistLatencyMsTotal = 0;
  realtimeTelemetry.receiptEvents = 0;
  realtimeTelemetry.receiptMessagesRequested = 0;
  realtimeTelemetry.receiptMessagesUpdated = 0;
  realtimeTelemetry.receiptCacheSuppressed = 0;
  realtimeTelemetry.queueSyncRequests = 0;
  realtimeTelemetry.queueFlushRuns = 0;
  realtimeTelemetry.queueFlushBatches = 0;
  realtimeTelemetry.queueMessagesEmitted = 0;
  realtimeTelemetry.queueFlushCapped = 0;
  realtimeTelemetry.queueRecoveryPulseEvents = 0;
  realtimeTelemetry.queueRecoveryDriftAlerts = 0;
  realtimeTelemetry.queueRecoveryBacklogTotal = 0;
}

const realtimeTelemetryLogTimer = setInterval(() => {
  flushRealtimeTelemetry();
}, REALTIME_TELEMETRY_LOG_INTERVAL_MS);

if (typeof realtimeTelemetryLogTimer.unref === "function") {
  realtimeTelemetryLogTimer.unref();
}

if (!IS_DEVELOPMENT && INSECURE_SOCKET_AUTH_REQUESTED) {
  logger.warn(
    "[Socket] Ignoring ALLOW_INSECURE_SOCKET_AUTH=true because NODE_ENV is not development",
  );
}

// â”€â”€â”€ Whiteboard server-side state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// Boards are ephemeral, in-memory rooms.  Each board keeps a small
// ring buffer of recent ops so reconnecting peers can request a
// `replay` rather than always falling back to a full snapshot.
//
// The buffer size and roster cap are intentionally conservative so a
// single api-gateway process can host hundreds of concurrent boards
// without measurable memory pressure.

interface WhiteboardRosterEntry {
  userId: string;
  name: string;
  color: string;
  joinedAt: number;
  socketIds: Set<string>;
}

interface WhiteboardBoard {
  id: string;
  roster: Map<string, WhiteboardRosterEntry>;
  /** Most recent ops, keyed by author for quick replay */
  recentOps: Map<string, unknown[]>;
}

const WHITEBOARD_MAX_PEERS = 16;
const WHITEBOARD_REPLAY_PER_AUTHOR = 256;
const WHITEBOARD_BOARD_ID_MAX = 128;
const WHITEBOARD_PAYLOAD_MAX = 96 * 1024;

const whiteboards = new Map<string, WhiteboardBoard>();

function whiteboardRoom(boardId: string): string {
  return `whiteboard:${boardId}`;
}

function getOrCreateBoard(boardId: string): WhiteboardBoard {
  let b = whiteboards.get(boardId);
  if (!b) {
    b = { id: boardId, roster: new Map(), recentOps: new Map() };
    whiteboards.set(boardId, b);
  }
  return b;
}

function rosterToWire(board: WhiteboardBoard): Array<{ userId: string; name: string; color: string; joinedAt: number }> {
  return Array.from(board.roster.values()).map(({ userId, name, color, joinedAt }) => ({
    userId, name, color, joinedAt,
  }));
}

function recordWhiteboardOp(board: WhiteboardBoard, authorId: string, envelope: unknown): void {
  let arr = board.recentOps.get(authorId);
  if (!arr) { arr = []; board.recentOps.set(authorId, arr); }
  arr.push(envelope);
  if (arr.length > WHITEBOARD_REPLAY_PER_AUTHOR) {
    arr.splice(0, arr.length - WHITEBOARD_REPLAY_PER_AUTHOR);
  }
}

function whiteboardPayloadTooLarge(payload: unknown): boolean {
  try {
    return JSON.stringify(payload).length > WHITEBOARD_PAYLOAD_MAX;
  } catch {
    return true;
  }
}

const rateBuckets = new Map<string, RateBucket>();
const WINDOW_MS = 60_000; // 1 minute

function isRateLimited(userId: string, event: string): boolean {
  const limit = RATE_LIMITS[event];
  if (!limit) return false; // no limit configured for this event

  const key = `${userId}:${event}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    rateBuckets.set(key, { count: 1, windowStart: now });
    return false;
  }

  bucket.count++;
  if (bucket.count > limit) {
    return true; // BLOCKED
  }
  return false;
}

// Periodic cleanup to prevent memory leak (every 5 min)
const rateBucketSweep = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.windowStart > WINDOW_MS * 2) {
      rateBuckets.delete(key);
    }
  }
}, 5 * 60_000);

if (typeof rateBucketSweep.unref === "function") {
  rateBucketSweep.unref();
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Auth guard â€” rejects if socket hasn't completed "auth" handshake */
function requireAuth(socket: Socket): boolean {
  const userId = socket.data.userId;
  if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
    socket.emit("error", { message: "Not authenticated. Send 'auth' event first." });
    return false;
  }
  return true;
}

/** Rate limit guard â€” returns true if request should be dropped */
function checkRate(socket: Socket, event: string): boolean {
  if (isRateLimited(socket.data.userId, event)) {
    socket.emit("error", { message: `Rate limited on '${event}'. Slow down.` });
    return true; // blocked
  }
  return false;
}

/** Validate string field â€” non-empty, within max length */
function isValidString(val: unknown, maxLen: number = 500): val is string {
  return typeof val === "string" && val.length > 0 && val.length <= maxLen;
}

function normalizeOptionalString(val: unknown, maxLen: number): string | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

type SocketAuthPayload =
  | string
  | {
      userId?: unknown;
      token?: unknown;
    };

function parseSocketAuthPayload(payload: SocketAuthPayload): {
  requestedUserId: string | null;
  token: string | null;
} {
  if (typeof payload === "string") {
    return {
      requestedUserId: normalizeOptionalString(payload, 128),
      token: null,
    };
  }

  if (!payload || typeof payload !== "object") {
    return { requestedUserId: null, token: null };
  }

  return {
    requestedUserId: normalizeOptionalString(payload.userId, 128),
    token: normalizeOptionalString(payload.token, 8192),
  };
}

function isValidAnchorPoint(anchor: unknown): anchor is HologramAnchorPoint {
  if (!anchor || typeof anchor !== "object") return false;
  const candidate = anchor as Record<string, unknown>;
  return isValidString(candidate.id, 128)
    && typeof candidate.x === "number"
    && typeof candidate.y === "number"
    && typeof candidate.z === "number";
}

function isLivenessOnline(record: QuantsinkLivenessRecord | undefined, now: number): boolean {
  return Boolean(record && now - record.lastSeenAt <= LIVENESS_TTL_MS);
}

async function usersShareConversation(userA: string, userB: string): Promise<boolean> {
  if (userA === userB) return true;

  const sharedConversation = await prisma.conversation.findFirst({
    where: {
      participants: { some: { userId: userA } },
      AND: [{ participants: { some: { userId: userB } } }],
    },
    select: { id: true },
  });

  return Boolean(sharedConversation);
}

function extractSocketIp(socket: Socket): string | null {
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return normalizeOptionalString(forwarded.split(",")[0], 128);
  }
  return normalizeOptionalString(socket.handshake.address, 128);
}

interface TypingStateEntry {
  isTyping: boolean;
  updatedAt: number;
}

const typingStateCache = new Map<string, TypingStateEntry>();
const TYPING_DUPLICATE_WINDOW_MS = 1_000;
const TYPING_STATE_TTL_MS = 30_000;

function typingStateKey(senderId: string, receiverId: string): string {
  return `${senderId}:${receiverId}`;
}

function shouldEmitTyping(senderId: string, receiverId: string, isTyping: boolean): boolean {
  const key = typingStateKey(senderId, receiverId);
  const now = Date.now();
  const existing = typingStateCache.get(key);

  if (existing && existing.isTyping === isTyping && now - existing.updatedAt < TYPING_DUPLICATE_WINDOW_MS) {
    return false;
  }

  typingStateCache.set(key, { isTyping, updatedAt: now });
  return true;
}

const typingStateSweep = setInterval(() => {
  const cutoff = Date.now() - TYPING_STATE_TTL_MS;
  for (const [key, value] of typingStateCache) {
    if (value.updatedAt < cutoff) typingStateCache.delete(key);
  }
}, 10_000);

if (typeof typingStateSweep.unref === "function") {
  typingStateSweep.unref();
}

interface ConversationAccessEntry {
  allowed: boolean;
  expiresAt: number;
}

const conversationAccessCache = new Map<string, ConversationAccessEntry>();
const CONVERSATION_ACCESS_TTL_MS = 30_000;
const CONVERSATION_ACCESS_MAX_ENTRIES = 20_000;
const CONVERSATION_ACCESS_SWEEP_INTERVAL_MS = 5_000;
let conversationAccessLastSweepAt = 0;

function conversationAccessKey(conversationId: string, senderId: string, receiverId: string): string {
  return `${conversationId}:${senderId}:${receiverId}`;
}

function setConversationAccessCacheEntry(key: string, value: ConversationAccessEntry): void {
  // Re-insert to keep Map order aligned with most-recent access.
  conversationAccessCache.delete(key);
  conversationAccessCache.set(key, value);
}

function pruneConversationAccessCache(now: number): void {
  for (const [key, value] of conversationAccessCache) {
    if (value.expiresAt <= now) conversationAccessCache.delete(key);
  }

  while (conversationAccessCache.size > CONVERSATION_ACCESS_MAX_ENTRIES) {
    const oldestKey = conversationAccessCache.keys().next().value;
    if (!oldestKey) break;
    conversationAccessCache.delete(oldestKey);
  }
}

function maybeSweepConversationAccessCache(now: number, force: boolean = false): void {
  if (
    !force &&
    now - conversationAccessLastSweepAt < CONVERSATION_ACCESS_SWEEP_INTERVAL_MS &&
    conversationAccessCache.size <= CONVERSATION_ACCESS_MAX_ENTRIES
  ) {
    return;
  }
  pruneConversationAccessCache(now);
  conversationAccessLastSweepAt = now;
}

async function canUseConversation(
  conversationId: string,
  senderId: string,
  receiverId: string,
): Promise<boolean> {
  const key = conversationAccessKey(conversationId, senderId, receiverId);
  const now = Date.now();
  const cached = conversationAccessCache.get(key);

  if (cached && cached.expiresAt > now) {
    setConversationAccessCacheEntry(key, cached);
    return cached.allowed;
  }
  if (cached && cached.expiresAt <= now) {
    conversationAccessCache.delete(key);
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      participants: { some: { userId: senderId } },
      AND: [{ participants: { some: { userId: receiverId } } }],
    },
    select: { id: true },
  });

  const allowed = Boolean(conversation);
  setConversationAccessCacheEntry(key, {
    allowed,
    expiresAt: now + CONVERSATION_ACCESS_TTL_MS,
  });
  maybeSweepConversationAccessCache(now);
  return allowed;
}

const conversationAccessSweep = setInterval(() => {
  maybeSweepConversationAccessCache(Date.now(), true);
}, CONVERSATION_ACCESS_SWEEP_INTERVAL_MS);

if (typeof conversationAccessSweep.unref === "function") {
  conversationAccessSweep.unref();
}

// Max envelope size: 64KB (encrypted message + headers)
const MAX_ENVELOPE_SIZE = 64 * 1024;
const MAX_HOLOGRAM_PAYLOAD_SIZE = 256 * 1024;
const MAX_HOLOGRAM_ANCHOR_POINTS = 256;
const MAX_HOLOGRAM_COORDINATE_BOUND = 100_000;
const MAX_OPKS_PER_UPLOAD = 1000;
const MAX_OPK_SERIALIZED_SIZE = 8192;
const PREKEY_LOW_THRESHOLD = 10;
const LIVENESS_TTL_MS = 45_000;

type ReceiptStatus = "DELIVERED" | "READ";
type ReceiptPayload =
  | string
  | {
      messageId?: unknown;
      messageIds?: unknown;
    };

interface ReceiptMessageRecord {
  id: string;
  senderId: string;
  receiverId: string;
  status: "QUEUED" | "DELIVERED" | "READ" | "PURGED";
}

interface ReceiptAckCacheEntry {
  status: ReceiptStatus;
  expiresAt: number;
}

const RECEIPT_ACK_CACHE_TTL_MS = 2 * 60_000;
const RECEIPT_ACK_CACHE_MAX_ENTRIES = 50_000;
const RECEIPT_ACK_SWEEP_INTERVAL_MS = 10_000;
const MAX_RECEIPTS_PER_EVENT = 100;
const receiptAckCache = new Map<string, ReceiptAckCacheEntry>();
const activeReceiptUpdates = new Map<string, Promise<void>>();
let receiptAckLastSweepAt = 0;

function receiptCacheKey(receiverId: string, messageId: string): string {
  return `${receiverId}:${messageId}`;
}

function getCachedReceiptStatus(cacheKey: string, now: number): ReceiptStatus | null {
  const cached = receiptAckCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    receiptAckCache.delete(cacheKey);
    return null;
  }
  return cached.status;
}

function pruneReceiptAckCache(now: number): void {
  for (const [key, value] of receiptAckCache) {
    if (value.expiresAt <= now) {
      receiptAckCache.delete(key);
    }
  }

  while (receiptAckCache.size > RECEIPT_ACK_CACHE_MAX_ENTRIES) {
    const oldestKey = receiptAckCache.keys().next().value;
    if (!oldestKey) break;
    receiptAckCache.delete(oldestKey);
  }
}

function maybeSweepReceiptAckCache(now: number, force: boolean = false): void {
  if (
    !force &&
    now - receiptAckLastSweepAt < RECEIPT_ACK_SWEEP_INTERVAL_MS &&
    receiptAckCache.size <= RECEIPT_ACK_CACHE_MAX_ENTRIES
  ) {
    return;
  }

  pruneReceiptAckCache(now);
  receiptAckLastSweepAt = now;
}

function cacheReceiptStatus(cacheKey: string, status: ReceiptStatus, now: number): void {
  receiptAckCache.delete(cacheKey);
  receiptAckCache.set(cacheKey, {
    status,
    expiresAt: now + RECEIPT_ACK_CACHE_TTL_MS,
  });
  maybeSweepReceiptAckCache(now);
}

async function coalesceReceiptUpdate(cacheKey: string, updater: () => Promise<void>): Promise<void> {
  const existing = activeReceiptUpdates.get(cacheKey);
  if (existing) {
    await existing;
    return;
  }

  const task = updater().finally(() => {
    activeReceiptUpdates.delete(cacheKey);
  });
  activeReceiptUpdates.set(cacheKey, task);
  await task;
}

function shouldSkipReceipt(cachedStatus: ReceiptStatus | null, target: ReceiptStatus): boolean {
  if (cachedStatus === "READ") return true;
  if (target === "DELIVERED" && cachedStatus === "DELIVERED") return true;
  return false;
}

function normalizeReceiptMessageIds(payload: ReceiptPayload): string[] {
  const ids = new Set<string>();

  const addMessageId = (candidate: unknown): void => {
    if (ids.size >= MAX_RECEIPTS_PER_EVENT) return;
    const normalized = normalizeOptionalString(candidate, 128);
    if (!normalized) return;
    ids.add(normalized);
  };

  if (typeof payload === "string") {
    addMessageId(payload);
    return Array.from(ids);
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  addMessageId(payload.messageId);
  if (Array.isArray(payload.messageIds)) {
    for (const candidate of payload.messageIds) {
      addMessageId(candidate);
    }
  }

  return Array.from(ids);
}

function parseReceiptStatus(status: ReceiptMessageRecord["status"]): ReceiptStatus | null {
  if (status === "READ") return "READ";
  if (status === "DELIVERED") return "DELIVERED";
  return null;
}

function shouldUpdateReceiptStatus(
  currentStatus: ReceiptMessageRecord["status"],
  target: ReceiptStatus,
): boolean {
  if (target === "DELIVERED") {
    return currentStatus === "QUEUED";
  }
  return currentStatus === "QUEUED" || currentStatus === "DELIVERED";
}

async function processReceiptBatch(
  io: Server,
  socket: Socket,
  messageIds: string[],
  target: ReceiptStatus,
): Promise<void> {
  const now = Date.now();
  const receiverId = socket.data.userId;
  realtimeTelemetry.receiptEvents += 1;
  realtimeTelemetry.receiptMessagesRequested += messageIds.length;

  const pendingIds = messageIds.filter((messageId) => {
    const cacheKey = receiptCacheKey(receiverId, messageId);
    return !shouldSkipReceipt(getCachedReceiptStatus(cacheKey, now), target);
  });
  const cacheSuppressed = messageIds.length - pendingIds.length;
  if (cacheSuppressed > 0) {
    realtimeTelemetry.receiptCacheSuppressed += cacheSuppressed;
  }

  if (pendingIds.length === 0) return;

  const messages = await prisma.message.findMany({
    where: { id: { in: pendingIds } },
    select: {
      id: true,
      senderId: true,
      receiverId: true,
      status: true,
    },
  });

  const messageById = new Map<string, ReceiptMessageRecord>();
  for (const message of messages) {
    messageById.set(message.id, {
      id: message.id,
      senderId: message.senderId,
      receiverId: message.receiverId,
      status: message.status,
    });
  }

  const updateTasks: Array<Promise<void>> = [];
  let updatedCount = 0;

  for (const messageId of pendingIds) {
    const message = messageById.get(messageId);
    if (!message) continue;

    const cacheKey = receiptCacheKey(receiverId, messageId);
    if (message.receiverId !== receiverId) {
      logger.warn(
        {
          socketId: socket.id,
          authUserId: receiverId,
          messageId,
          messageReceiverId: message.receiverId,
        },
        target === "DELIVERED"
          ? "[SECURITY] message-delivered for non-owned message blocked"
          : "[SECURITY] message-read for non-owned message blocked",
      );
      continue;
    }

    const currentStatus = parseReceiptStatus(message.status);
    if (shouldSkipReceipt(currentStatus, target)) {
      if (currentStatus) {
        cacheReceiptStatus(cacheKey, currentStatus, Date.now());
        realtimeTelemetry.receiptCacheSuppressed += 1;
      }
      continue;
    }

    if (!shouldUpdateReceiptStatus(message.status, target)) {
      continue;
    }

    updateTasks.push(
      coalesceReceiptUpdate(cacheKey, async () => {
        const cachedStatus = getCachedReceiptStatus(cacheKey, Date.now());
        if (shouldSkipReceipt(cachedStatus, target)) return;

        const receiptAt = new Date();
        const updated = await prisma.message.updateMany({
          where:
            target === "DELIVERED"
              ? {
                  id: messageId,
                  receiverId,
                  status: "QUEUED",
                }
              : {
                  id: messageId,
                  receiverId,
                  status: { in: ["QUEUED", "DELIVERED"] },
                },
          data:
            target === "DELIVERED"
              ? {
                  status: "DELIVERED",
                  deliveredAt: receiptAt,
                }
              : {
                  status: "READ",
                  readAt: receiptAt,
                },
        });
        if (updated.count === 0) return;

        updatedCount += 1;
        cacheReceiptStatus(cacheKey, target, receiptAt.getTime());
        io.to(`user:${message.senderId}`).emit("delivery-receipt", {
          messageId,
          status: target,
          ...(target === "DELIVERED" ? { deliveredAt: receiptAt } : { readAt: receiptAt }),
        });
      }),
    );
  }

  if (updateTasks.length > 0) {
    await Promise.all(updateTasks);
  }
  if (updatedCount > 0) {
    realtimeTelemetry.receiptMessagesUpdated += updatedCount;
  }
}

const receiptAckSweep = setInterval(() => {
  maybeSweepReceiptAckCache(Date.now(), true);
}, RECEIPT_ACK_SWEEP_INTERVAL_MS);

if (typeof receiptAckSweep.unref === "function") {
  receiptAckSweep.unref();
}

interface HologramAnchorPoint {
  id: string;
  x: number;
  y: number;
  z: number;
}

interface HologramVisualSyncPayload {
  targetUserId: string;
  signal: unknown;
  type: "offer" | "answer" | "ice-candidate";
  engine: "godot";
  quantneonAvatarId: string;
  anchorPoints: HologramAnchorPoint[];
}

interface QuantsinkLivenessRecord {
  digitalTwinId?: string;
  autoRespondEnabled: boolean;
  lastSeenAt: number;
}

const quantsinkLivenessDb = new Map<string, QuantsinkLivenessRecord>();
const QUANTSINK_LIVENESS_KEY_PREFIX = "quantsink:liveness:";

function livenessKey(userId: string): string {
  return `${QUANTSINK_LIVENESS_KEY_PREFIX}${userId}`;
}

async function setLivenessRecord(userId: string, record: QuantsinkLivenessRecord): Promise<void> {
  quantsinkLivenessDb.set(userId, record);
  if (!redisReady) return;
  await pubClient.set(livenessKey(userId), JSON.stringify(record), { PX: LIVENESS_TTL_MS });
}

async function getLivenessRecord(userId: string): Promise<QuantsinkLivenessRecord | undefined> {
  if (!redisReady) return quantsinkLivenessDb.get(userId);
  const raw = await pubClient.get(livenessKey(userId));
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as QuantsinkLivenessRecord;
  } catch {
    return undefined;
  }
}

// Helper to safely parse JSON with fallback
function safeJsonParse<T = unknown>(raw: string, fallback: T | null = null): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function generateLegacyOpkKeyId(): string {
  return `legacy_opk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MAIN HANDLER REGISTRATION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export function registerSocketHandlers(io: Server): void {
  io.on("connection", (socket: Socket) => {
    logger.debug({ socketId: socket.id }, "[Socket] Connected");

    // â”€â”€â”€ AUTH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    socket.on("auth", async (rawAuthPayload: SocketAuthPayload) => {
      // Rate limit auth attempts by socket ID (pre-auth)
      if (isRateLimited(socket.id, "auth")) {
        return socket.emit("error", { message: "Too many auth attempts. Slow down." });
      }

      const { requestedUserId, token } = parseSocketAuthPayload(rawAuthPayload);
      const handshakeToken = normalizeOptionalString(
        (socket.handshake.auth as Record<string, unknown> | undefined)?.token,
        8192,
      );
      const authToken = token ?? handshakeToken;
      const handshakeAuth = socket.handshake.auth as Record<string, unknown> | undefined;
      let authenticatedUserId: string | null = null;
      let verifiedTokenPayload: Awaited<ReturnType<typeof verifyBiometricToken>> | null = null;

      if (authToken) {
        try {
          const verified = await verifyBiometricToken(authToken);
          if (!verified?.sub) {
            return socket.emit("error", { message: "Authentication failed" });
          }
          verifiedTokenPayload = verified;
          authenticatedUserId = verified.sub;
        } catch (err) {
          logger.warn({ err, socketId: socket.id }, "[Socket] Auth token verification failed");
          return socket.emit("error", { message: "Authentication failed" });
        }

        if (requestedUserId && requestedUserId !== authenticatedUserId) {
          logger.warn(
            {
              socketId: socket.id,
              requestedUserId,
              tokenUserId: authenticatedUserId,
            },
            "[Socket] Auth user mismatch",
          );
          return socket.emit("error", { message: "User mismatch in auth payload" });
        }
      } else if (ALLOW_INSECURE_SOCKET_AUTH && requestedUserId) {
        authenticatedUserId = requestedUserId;
        logger.warn(
          { socketId: socket.id, userId: authenticatedUserId },
          "[Socket] Insecure socket auth accepted due to ALLOW_INSECURE_SOCKET_AUTH=true",
        );
      } else {
        return socket.emit("error", { message: "Authentication token required" });
      }

      if (!authenticatedUserId) {
        return socket.emit("error", { message: "Authentication failed" });
      }

      socket.data.userId = authenticatedUserId;
      socket.join(`user:${authenticatedUserId}`);
      const existingRecord = await getLivenessRecord(authenticatedUserId);
      await setLivenessRecord(authenticatedUserId, {
        ...(existingRecord ?? { autoRespondEnabled: false }),
        lastSeenAt: Date.now(),
      });

      const providedSessionId =
        normalizeOptionalString(handshakeAuth?.sessionId, 256) ??
        normalizeOptionalString(socket.handshake.headers["x-quantchat-session-id"], 256) ??
        normalizeOptionalString(socket.handshake.headers["x-session-id"], 256);
      const deviceId =
        normalizeOptionalString(handshakeAuth?.deviceId, 256) ??
        normalizeOptionalString(socket.handshake.headers["x-quantchat-device-id"], 256) ??
        normalizeOptionalString(socket.handshake.headers["x-device-id"], 256);
      const requestedSessionId = providedSessionId ?? verifiedTokenPayload?.sessionId ?? null;

      if (requestedSessionId) {
        try {
          const revoked = await isCompanionSessionRevoked(authenticatedUserId, requestedSessionId);
          if (revoked) {
            socket.emit("error", { message: "Session revoked. Re-authentication required." });
            socket.disconnect(true);
            return;
          }
        } catch (err) {
          logger.warn(
            { err, userId: authenticatedUserId, socketId: socket.id, sessionId: requestedSessionId },
            "[Socket] Session revocation check failed; continuing auth",
          );
        }
      }

      try {
        const companionSession = await touchCompanionSession({
          userId: authenticatedUserId,
          tokenId: null,
          providedSessionId: requestedSessionId,
          deviceId,
          userAgent: normalizeOptionalString(socket.handshake.headers["user-agent"], 1024),
          ipAddress: extractSocketIp(socket),
          transport: "socket",
          socketId: socket.id,
        });
        socket.data.companionSessionId = companionSession.sessionId;
      } catch (err) {
        logger.warn(
          { err, userId: authenticatedUserId, socketId: socket.id },
          "[Socket] Companion session tracking failed (non-fatal)",
        );
      }

      logger.debug({ userId: authenticatedUserId }, "[Socket] User authenticated");
      socket.emit("authenticated", { userId: authenticatedUserId });

      // Flush queued messages
      void flushOfflineQueue(io, socket, authenticatedUserId)
        .then((summary) => emitQueueRecoveryPulse(socket, authenticatedUserId, "auth", summary))
        .catch((err) => {
          logger.warn({ err, userId: authenticatedUserId }, "[Queue] Auth-time queue sync failed");
        });
    });

    const upsertPreKeys = async (
      payload: {
        userId?: unknown;
        bundle?: unknown;
        oneTimePreKeys?: unknown[];
      } | undefined,
      replaceOneTimePreKeys: boolean
    ): Promise<void> => {
      const { userId, bundle, oneTimePreKeys } = payload ?? {};
      if (!isValidString(userId, 128) || !bundle) {
        socket.emit("error", { message: "Invalid payload" });
        return;
      }
      const typedBundle = bundle as Record<string, unknown>;
      if (socket.data.userId !== userId) {
        socket.emit("error", { message: "User mismatch in key upload" });
        return;
      }

      const normalizedOneTimePreKeys: string[] = Array.isArray(oneTimePreKeys)
        ? oneTimePreKeys
            .slice(0, MAX_OPKS_PER_UPLOAD)
            .map((opk) => {
              const typedOpk = opk as Record<string, unknown> | null;
              if (!typedOpk || !isValidString(typedOpk.keyId, 256) || !typedOpk.publicKey) return null;
              const serialized = JSON.stringify({ keyId: typedOpk.keyId, publicKey: typedOpk.publicKey });
              if (serialized.length > MAX_OPK_SERIALIZED_SIZE) return null;
              return serialized;
            })
            .filter((v): v is string => Boolean(v))
        : (
          typedBundle.oneTimePreKey
            ? [JSON.stringify({
              keyId: typedBundle.oneTimePreKeyId || generateLegacyOpkKeyId(),
              publicKey: typedBundle.oneTimePreKey,
            })]
            : []
        );

      const existing = replaceOneTimePreKeys
        ? null
        : await prisma.publicKeyBundle.findUnique({
          where: { userId },
          select: { oneTimePreKeys: true },
        });

      const nextOneTimePreKeys = replaceOneTimePreKeys
        ? normalizedOneTimePreKeys
        : [...(existing?.oneTimePreKeys ?? []), ...normalizedOneTimePreKeys];

      await prisma.publicKeyBundle.upsert({
        where: { userId },
        update: {
          identityKey: JSON.stringify(typedBundle.identityKey),
          signedPreKey: JSON.stringify(typedBundle.signedPreKey),
          signature: typeof typedBundle.signature === "string" ? typedBundle.signature : "",
          oneTimePreKeys: nextOneTimePreKeys,
        },
        create: {
          userId,
          identityKey: JSON.stringify(typedBundle.identityKey),
          signedPreKey: JSON.stringify(typedBundle.signedPreKey),
          signature: typeof typedBundle.signature === "string" ? typedBundle.signature : "",
          oneTimePreKeys: nextOneTimePreKeys,
        },
      });
      socket.emit("keys-registered", { success: true });
    };

    // â”€â”€â”€ UPLOAD PRE-KEY BUNDLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    socket.on("upload-prekeys", async (payload) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "upload-prekeys")) return;

      try {
        await upsertPreKeys(payload, true);
      } catch (e) {
        logger.error({ err: e }, "[Socket] upload-prekeys error");
        socket.emit("error", { message: "Failed to upload pre-key bundle" });
      }
    });

    // Explicit pre-key rotation endpoint (replace current server-side OPK pool)
    socket.on("rotate-prekeys", async (payload) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "rotate-prekeys")) return;

      try {
        await upsertPreKeys(payload, true);
        socket.emit("keys-rotated", { success: true });
      } catch (e) {
        logger.error({ err: e }, "[Socket] rotate-prekeys error");
        socket.emit("error", { message: "Failed to rotate pre-keys" });
      }
    });

    // Legacy key registration (backward compat)
    socket.on("register-keys", async (payload) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "register-keys")) return;

      try {
        const {
          userId,
          identityKey,
          signedPreKey,
          signature,
          oneTimePreKeys,
        } = (payload ?? {}) as {
          userId?: unknown;
          identityKey?: unknown;
          signedPreKey?: unknown;
          signature?: unknown;
          oneTimePreKeys?: unknown;
        };

        if (!isValidString(userId, 128)) {
          socket.emit("error", { message: "Invalid userId" });
          return;
        }

        if (socket.data.userId !== userId) {
          logger.warn(
            { socketId: socket.id, authUserId: socket.data.userId, payloadUserId: userId },
            "[SECURITY] register-keys user mismatch blocked",
          );
          socket.emit("error", { message: "User mismatch in key registration" });
          return;
        }

        const typedIdentityKey = identityKey as string;
        const typedSignedPreKey = signedPreKey as string;
        const typedSignature = signature as string;
        const typedOneTimePreKeys = oneTimePreKeys as string[];

        await prisma.publicKeyBundle.upsert({
          where: { userId },
          update: { identityKey: typedIdentityKey, signedPreKey: typedSignedPreKey, signature: typedSignature, oneTimePreKeys: typedOneTimePreKeys },
          create: { userId, identityKey: typedIdentityKey, signedPreKey: typedSignedPreKey, signature: typedSignature, oneTimePreKeys: typedOneTimePreKeys },
        });
        socket.emit("keys-registered", { success: true });
      } catch (e) {
        logger.error({ err: e }, "[Socket] Key registration error");
        socket.emit("error", { message: "Failed to register E2EE keys" });
      }
    });

    // â”€â”€â”€ GET PRE-KEY BUNDLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    socket.on("get-prekey-bundle", async (targetUserId: string, callback) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "get-prekey-bundle")) return;
      if (typeof callback !== "function") return;
      if (!isValidString(targetUserId, 128)) {
        return callback({ error: "Invalid userId" });
      }

      try {
        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const b = await tx.publicKeyBundle.findUnique({ where: { userId: targetUserId } });
          if (!b) return null;

          let oneTimePreKey: string | undefined;
          let oneTimePreKeyId: string | undefined;
          let remainingOneTimePreKeys = b.oneTimePreKeys.length;
          if (b.oneTimePreKeys.length > 0) {
            const raw = b.oneTimePreKeys[0];
            const remaining = b.oneTimePreKeys.slice(1);
            await tx.publicKeyBundle.update({
              where: { id: b.id },
              data: { oneTimePreKeys: remaining },
            });
            remainingOneTimePreKeys = remaining.length;
            if (!raw) {
              const identityKey = safeJsonParse(b.identityKey);
              const signedPreKey = safeJsonParse(b.signedPreKey);
              if (!identityKey || !signedPreKey) {
                logger.error({ userId: targetUserId }, "[Socket] Invalid key bundle data");
                return null;
              }
              return {
                bundle: {
                  identityKey,
                  signedPreKey,
                  signedPreKeyId: b.id,
                  signature: b.signature,
                  oneTimePreKey: undefined,
                  oneTimePreKeyId: undefined,
                },
                remainingOneTimePreKeys,
              };
            }
            try {
              const parsed = JSON.parse(raw);
              if (parsed && parsed.publicKey && parsed.keyId) {
                oneTimePreKey = parsed.publicKey;
                oneTimePreKeyId = parsed.keyId;
              } else {
                oneTimePreKey = raw;
              }
            } catch {
              oneTimePreKey = raw;
            }
          }

          const identityKey = safeJsonParse(b.identityKey);
          const signedPreKey = safeJsonParse(b.signedPreKey);
          if (!identityKey || !signedPreKey) {
            logger.error({ userId: targetUserId }, "[Socket] Invalid key bundle data in main return");
            return null;
          }

          return {
            bundle: {
              identityKey,
              signedPreKey,
              signedPreKeyId: b.id,
              signature: b.signature,
              oneTimePreKey: oneTimePreKey ? safeJsonParse(oneTimePreKey) : undefined,
              oneTimePreKeyId,
            },
            remainingOneTimePreKeys,
          };
        });

        if (!result) {
          return callback({ error: "User keys not found" });
        }

        if (result.remainingOneTimePreKeys < PREKEY_LOW_THRESHOLD) {
          io.to(`user:${targetUserId}`).emit("prekeys-low", {
            remaining: result.remainingOneTimePreKeys,
          });
        }

        callback(result.bundle);
      } catch (e) {
        logger.error({ err: e }, "[Socket] get-prekey-bundle error");
        callback({ error: "Server error retrieving pre-key bundle" });
      }
    });

    // Legacy get-keys (backward compat)
    socket.on("get-keys", async (targetUserId: string, callback) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "get-keys")) return;
      if (typeof callback !== "function") return;
      try {
        const b = await prisma.publicKeyBundle.findUnique({ where: { userId: targetUserId } });
        if (b) {
          callback({ identityKey: b.identityKey, signedPreKey: b.signedPreKey, signature: b.signature });
        } else {
          callback({ error: "User keys not found" });
        }
      } catch {
        callback({ error: "Server error" });
      }
    });

    // â”€â”€â”€ SEND ENCRYPTED MESSAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    socket.on("send-message", async (data) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "send-message")) return;
      const sendStartMs = Date.now();
      realtimeTelemetry.sendAttempts += 1;

      const { senderId, receiverId, envelope, ttlSecs, conversationId } = data;

      // Anti-spoofing
      if (socket.data.userId !== senderId) {
        logger.warn({ socketId: socket.id, senderId }, "[SECURITY] Spoofing blocked");
        return socket.emit("error", { message: "Sender spoofing detected" });
      }

      if (!isValidString(receiverId, 128) || !envelope) {
        return socket.emit("error", { message: "Missing receiverId or envelope" });
      }

      // Enforce max envelope size
      let envelopeStr: string;
      try {
        envelopeStr = JSON.stringify(envelope);
      } catch {
        return socket.emit("error", { message: "Invalid encrypted envelope payload" });
      }
      if (envelopeStr.length > MAX_ENVELOPE_SIZE) {
        return socket.emit("error", { message: "Message too large (max 64KB)" });
      }

      // Optional disappearing-message TTL. null/undefined = no expiry.
      let expiresAt: Date | null = null;
      if (ttlSecs !== undefined && ttlSecs !== null) {
        const normalized = normalizeTtlSecs(ttlSecs);
        if (normalized === undefined) {
          return socket.emit("error", {
            message: `Invalid ttlSecs (must be between ${DISAPPEARING_MIN_SECS}s and ${DISAPPEARING_MAX_SECS}s)`,
          });
        }
        if (normalized !== null) {
          expiresAt = new Date(Date.now() + normalized * 1000);
        }
      }

      // Optional conversationId â€” validated lightly (uuid-like string).
      // Optional conversationId. When provided, enforce that both sender
      // and receiver are participants before linking the message row.
      let linkedConversationId: string | null = null;

      try {
        if (typeof conversationId === "string" && conversationId.length > 0 && conversationId.length <= 128) {
          const conversationAllowed = await canUseConversation(conversationId, senderId, receiverId);
          if (!conversationAllowed) {
            logger.warn(
              { socketId: socket.id, senderId, receiverId, conversationId },
              "[SECURITY] send-message conversation mismatch blocked",
            );
            socket.emit("error", { message: "Conversation access denied" });
            return;
          }

          linkedConversationId = conversationId;
        }

        const msg = await prisma.message.create({
          data: {
            senderId,
            receiverId,
            content: envelopeStr,
            iv: null,
            status: "QUEUED",
            expiresAt,
            conversationId: linkedConversationId,
          },
          select: {
            id: true,
            createdAt: true,
            expiresAt: true,
            conversationId: true,
          },
        });

        // Real-time delivery via room (works across cluster via Redis adapter)
        io.to(`user:${receiverId}`).emit("receive-message", {
          id: msg.id,
          senderId,
          envelope,
          createdAt: msg.createdAt,
          expiresAt: msg.expiresAt,
          conversationId: msg.conversationId,
        });

        socket.emit("message-sent", {
          success: true,
          messageId: msg.id,
          expiresAt: msg.expiresAt,
        });
        realtimeTelemetry.sendPersisted += 1;
        realtimeTelemetry.sendPersistLatencyMsTotal += Date.now() - sendStartMs;
      } catch (e) {
        realtimeTelemetry.sendErrors += 1;
        logger.error({ err: e }, "[Socket] send-message error");
        socket.emit("error", { message: "Message routing failed" });
      }
    });

    // Delivery and read receipts now accept either:
    //   { messageId: "..." } (legacy)
    //   { messageIds: ["...", "..."] } (batched)
    socket.on("message-delivered", async (payload: ReceiptPayload) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "message-delivered")) return;

      const messageIds = normalizeReceiptMessageIds(payload);
      if (messageIds.length === 0) return;

      try {
        await processReceiptBatch(io, socket, messageIds, "DELIVERED");
      } catch (e) {
        logger.error({ err: e }, "[Socket] delivery ack error");
      }
    });

    socket.on("message-read", async (payload: ReceiptPayload) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "message-read")) return;

      const messageIds = normalizeReceiptMessageIds(payload);
      if (messageIds.length === 0) return;

      try {
        await processReceiptBatch(io, socket, messageIds, "READ");
      } catch (e) {
        logger.error({ err: e }, "[Socket] read ack error");
      }
    });

    // â”€â”€â”€ MANUAL QUEUE SYNC (reconnection fallback) â”€â”€â”€â”€â”€â”€â”€â”€â”€
    socket.on("sync-queue", async () => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "sync-queue")) return;
      realtimeTelemetry.queueSyncRequests += 1;
      const summary = await flushOfflineQueue(io, socket, socket.data.userId);
      socket.emit("queue-sync-complete", summary);
      void emitQueueRecoveryPulse(socket, socket.data.userId, "sync-queue", summary);
    });

    // â”€â”€â”€ LIVE LOCATION (ephemeral, never stored) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    socket.on("live-location-update", (data: {
      senderId: string; receiverId: string;
      lat: number; lng: number; encrypted: boolean;
    }) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "live-location-update")) return;
      if (socket.data.userId !== data.senderId) return;
      if (!isValidString(data.receiverId, 128)) return;
      if (typeof data.lat !== "number" || typeof data.lng !== "number") return;

      io.to(`user:${data.receiverId}`).emit("receive-location", {
        senderId: data.senderId,
        lat: data.lat,
        lng: data.lng,
        timestamp: Date.now(),
        encrypted: data.encrypted,
      });
    });

    // â”€â”€â”€ WEBRTC SIGNALING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    socket.on("webrtc-signal", (data: {
      targetUserId: string;
      signal: RTCSessionDescriptionInit | RTCIceCandidateInit;
      type: "offer" | "answer" | "ice-candidate";
      roomId?: string;
    }) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "webrtc-signal")) return;
      if (!isValidString(data.targetUserId, 128)) return;

      // If a roomId is provided, verify both peers are members
      if (data.roomId) {
        if (!isValidString(data.roomId, 128)) return;
        const room = roomManager.get(data.roomId);
        if (!room) {
          socket.emit("error", { message: "Room not found" });
          return;
        }
        const me = room.participants.find((p) => p.userId === socket.data.userId);
        const them = room.participants.find((p) => p.userId === data.targetUserId);
        if (!me || !them) {
          socket.emit("error", { message: "Not a member of that room" });
          return;
        }
      }

      io.to(`user:${data.targetUserId}`).emit("webrtc-signal", {
        fromUserId: socket.data.userId,
        signal: data.signal,
        type: data.type,
        roomId: data.roomId,
      });
    });

    // â”€â”€â”€ MULTI-PARTY ROOM MANAGEMENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    socket.on("join-room", (
      data: {
        roomId: string;
        audio?: boolean;
        video?: boolean;
        screen?: boolean;
      },
      ack?: (res: { ok: true; room: RoomSnapshot } | { ok: false; error: string }) => void,
    ) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "join-room")) return;
      if (!isValidString(data?.roomId, 128)) {
        ack?.({ ok: false, error: "Invalid roomId" });
        return;
      }

      const participant: RoomParticipant = {
        userId: socket.data.userId,
        socketId: socket.id,
        joinedAt: Date.now(),
        audio: Boolean(data.audio),
        video: Boolean(data.video),
        screen: Boolean(data.screen),
      };
      const result = roomManager.join(data.roomId, participant);
      if ("error" in result) {
        ack?.({ ok: false, error: result.error });
        return;
      }

      socket.join(`room:${data.roomId}`);

      // Tell the joining socket the roster
      ack?.({ ok: true, room: result.room });

      // Notify other peers (broadcast to room, excluding self)
      socket.to(`room:${data.roomId}`).emit("room-peer-joined", {
        roomId: data.roomId,
        participant,
        room: result.room,
      });

      logger.debug(
        { userId: socket.data.userId, roomId: data.roomId, size: result.room.participants.length, topology: result.room.topology },
        "[Room] Joined",
      );
    });

    socket.on("leave-room", (
      data: { roomId: string },
      ack?: (res: { ok: boolean }) => void,
    ) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "leave-room")) return;
      if (!isValidString(data?.roomId, 128)) {
        ack?.({ ok: false });
        return;
      }

      const snapshot = roomManager.leave(data.roomId, socket.data.userId);
      socket.leave(`room:${data.roomId}`);
      ack?.({ ok: true });

      // Notify remaining peers
      io.to(`room:${data.roomId}`).emit("room-peer-left", {
        roomId: data.roomId,
        userId: socket.data.userId,
        room: snapshot, // null if room dissolved
      });
      logger.debug(
        { userId: socket.data.userId, roomId: data.roomId },
        "[Room] Left",
      );
    });

    socket.on("room-publish-state", (data: {
      roomId: string;
      audio?: boolean;
      video?: boolean;
      screen?: boolean;
    }) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "room-publish-state")) return;
      if (!isValidString(data?.roomId, 128)) return;

      const patch: Partial<Pick<RoomParticipant, "audio" | "video" | "screen">> = {};
      if (typeof data.audio === "boolean") patch.audio = data.audio;
      if (typeof data.video === "boolean") patch.video = data.video;
      if (typeof data.screen === "boolean") patch.screen = data.screen;
      if (Object.keys(patch).length === 0) return;

      const snapshot = roomManager.updatePublishState(data.roomId, socket.data.userId, patch);
      if (!snapshot) return;

      io.to(`room:${data.roomId}`).emit("room-publish-state", {
        roomId: data.roomId,
        userId: socket.data.userId,
        ...patch,
        room: snapshot,
      });
    });

    // â”€â”€â”€ NEURAL E2EE HOLOGRAM VISUAL SYNC (Godot AR anchors) â”€â”€
    socket.on("hologram-visual-sync", (data: HologramVisualSyncPayload) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "hologram-visual-sync")) return;
      if (!isValidString(data?.targetUserId, 128)) return;
      if (!isValidString(data?.quantneonAvatarId, 128)) return;
      if (data?.engine !== "godot") return;
      if (!Array.isArray(data?.anchorPoints)) return;
      if (data.anchorPoints.some((a) => !isValidAnchorPoint(a))) return;
      if (!["offer", "answer", "ice-candidate"].includes(data.type)) return;
      if (data.anchorPoints.length > MAX_HOLOGRAM_ANCHOR_POINTS) return;
      if (data.anchorPoints.some(
        ({ x, y, z }) =>
          Math.abs(x) > MAX_HOLOGRAM_COORDINATE_BOUND
          || Math.abs(y) > MAX_HOLOGRAM_COORDINATE_BOUND
          || Math.abs(z) > MAX_HOLOGRAM_COORDINATE_BOUND,
      )) {
        socket.emit("error", { message: "Hologram anchor coordinates out of bounds" });
        return;
      }

      const signalSize = data.signal ? JSON.stringify(data.signal).length : 0;
      if (signalSize > MAX_HOLOGRAM_PAYLOAD_SIZE) {
        socket.emit("error", { message: "Hologram sync payload too large" });
        return;
      }

      io.to(`user:${data.targetUserId}`).emit("hologram-visual-sync", {
        fromUserId: socket.data.userId,
        signal: data.signal,
        type: data.type,
        engine: "godot",
        quantneonAvatarId: data.quantneonAvatarId,
        anchorPoints: data.anchorPoints,
        syncedAt: Date.now(),
      });
    });

    // â”€â”€â”€ QUANTSINK LIVENESS + DIGITAL TWIN AUTO-RESPONDER â”€â”€â”€â”€
    socket.on("quantsink-liveness-ping", async (data: {
      targetUserId: string;
      digitalTwinId?: string;
      autoRespondEnabled?: boolean;
    }) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "quantsink-liveness-ping")) return;
      if (!isValidString(data?.targetUserId, 128)) return;
      if (data?.digitalTwinId && !isValidString(data.digitalTwinId, 128)) return;

      const requesterId = socket.data.userId as string;
      if (data.targetUserId !== requesterId) {
        const canPingTarget = await usersShareConversation(requesterId, data.targetUserId);
        if (!canPingTarget) {
          logger.warn(
            { requesterId, targetUserId: data.targetUserId, socketId: socket.id },
            "[SECURITY] quantsink-liveness-ping blocked for unrelated users",
          );
          socket.emit("error", { message: "Target user is not reachable" });
          return;
        }
      }

      const now = Date.now();
      await setLivenessRecord(requesterId, {
        digitalTwinId: data.digitalTwinId,
        autoRespondEnabled: data.autoRespondEnabled ?? false,
        lastSeenAt: now,
      });

      const targetRecord = await getLivenessRecord(data.targetUserId);
      if (isLivenessOnline(targetRecord, now)) {
        io.to(`user:${data.targetUserId}`).emit("quantsink-liveness-ping", {
          fromUserId: requesterId,
          sentAt: now,
        });
        return;
      }

      socket.emit("digital-twin-matchmaker", {
        targetUserId: data.targetUserId,
        matched: Boolean(targetRecord?.autoRespondEnabled && targetRecord?.digitalTwinId),
        digitalTwinId: targetRecord?.digitalTwinId,
        reason: "target-offline-in-quantsink-liveness-db",
        interceptedAt: now,
      });
    });

    // â”€â”€â”€ TYPING INDICATORS (ephemeral) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    socket.on("typing", (data: { receiverId: string; isTyping: boolean }) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "typing")) return;
      if (!isValidString(data.receiverId, 128)) return;
      if (typeof data.isTyping !== "boolean") return;
      if (!shouldEmitTyping(socket.data.userId, data.receiverId, data.isTyping)) return;

      io.to(`user:${data.receiverId}`).emit("typing", {
        senderId: socket.data.userId,
        isTyping: data.isTyping,
      });
    });

    // â”€â”€â”€ DISAPPEARING MESSAGES (per-conversation default TTL) â”€â”€â”€
    // The caller must be a participant of the Conversation. On change,
    // both the updated value and a system-notice payload are broadcast
    // to all participants so no silent downgrade can happen.
    socket.on("set-disappearing", async (
      data: { conversationId: string; ttlSecs: number | null },
      callback?: (resp: { success: boolean; error?: string; ttlSecs?: number | null }) => void,
    ) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "set-disappearing")) return;

      const cb = typeof callback === "function" ? callback : () => {};

      if (!isValidString(data?.conversationId, 128)) {
        return cb({ success: false, error: "Invalid conversationId" });
      }

      const normalized = normalizeTtlSecs(data.ttlSecs);
      if (normalized === undefined) {
        return cb({
          success: false,
          error: `Invalid ttlSecs (must be null or between ${DISAPPEARING_MIN_SECS}s and ${DISAPPEARING_MAX_SECS}s)`,
        });
      }

      const userId = socket.data.userId as string;

      try {
        const existing = await prisma.conversation.findFirst({
          where: {
            id: data.conversationId,
            participants: { some: { userId } },
          },
          select: { id: true },
        });
        if (!existing) {
          return cb({ success: false, error: "Not a participant of this conversation" });
        }

        const updated = await prisma.conversation.update({
          where: { id: data.conversationId },
          data: { disappearingSecs: normalized },
          select: { id: true, disappearingSecs: true, participants: { select: { userId: true } } },
        });

        const payload = {
          conversationId: updated.id,
          ttlSecs: updated.disappearingSecs,
          changedBy: userId,
          changedAt: new Date().toISOString(),
        };
        for (const p of updated.participants) {
          io.to(`user:${p.userId}`).emit("disappearing-updated", payload);
        }

        cb({ success: true, ttlSecs: updated.disappearingSecs });
      } catch (err) {
        logger.error({ err, userId, conversationId: data.conversationId }, "[Socket] set-disappearing error");
        cb({ success: false, error: "Failed to update disappearing setting" });
      }
    });

    socket.on("get-disappearing", async (
      data: { conversationId: string },
      callback?: (resp: { success: boolean; error?: string; ttlSecs?: number | null }) => void,
    ) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "get-disappearing")) return;

      const cb = typeof callback === "function" ? callback : () => {};

      if (!isValidString(data?.conversationId, 128)) {
        return cb({ success: false, error: "Invalid conversationId" });
      }

      const userId = socket.data.userId as string;
      try {
        const conversation = await prisma.conversation.findFirst({
          where: {
            id: data.conversationId,
            participants: { some: { userId } },
          },
          select: { disappearingSecs: true },
        });
        if (!conversation) {
          return cb({ success: false, error: "Not a participant of this conversation" });
        }
        cb({ success: true, ttlSecs: conversation.disappearingSecs });
      } catch (err) {
        logger.error({ err, userId, conversationId: data.conversationId }, "[Socket] get-disappearing error");
        cb({ success: false, error: "Failed to fetch disappearing setting" });
      }
    });

    // â”€â”€â”€ GIFTS & ATTENTION TOKENS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //
    // send-gift: debit sender, record gift transaction, fan out
    //   to the recipient's socket room (never surfaces sender-facing
    //   "gift not returned" shaming). Errors are mapped to a typed
    //   error payload so the client can render sensible UX.
    socket.on("send-gift", async (payload: unknown) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "send-gift")) return;

      const senderId = socket.data.userId as string;
      const data = payload as {
        recipientId?: unknown;
        giftSlug?: unknown;
        note?: unknown;
        callId?: unknown;
        conversationId?: unknown;
      };
      if (
        !isValidString(data?.recipientId, 128) ||
        !isValidString(data?.giftSlug, 64)
      ) {
        socket.emit("gift-error", { code: "invalid_payload" });
        return;
      }
      const note = typeof data.note === "string" ? data.note.slice(0, GiftSystem.MAX_GIFT_NOTE_LENGTH) : null;
      const callId = typeof data.callId === "string" && data.callId.length <= 128 ? data.callId : null;
      const conversationId =
        typeof data.conversationId === "string" && data.conversationId.length <= 128
          ? data.conversationId
          : null;

      try {
        const result = await GiftSystem.sendGift({
          senderId,
          recipientId: data.recipientId,
          giftSlug: data.giftSlug,
          note,
          callId,
          conversationId,
        });

        // Sender gets the delivery confirmation (balance + txn id).
        socket.emit("gift-sent", {
          transactionId: result.transactionId,
          status: result.status,
          costTokens: result.costTokens,
          newBalance: result.newSenderBalance,
          giftSlug: result.gift.slug,
          deliveredAt: result.deliveredAt,
        });

        // Recipient gets the renderable gift event. Note that we do
        // NOT surface any "reciprocate now?" pressure prompt â€” that
        // lives client-side and only fires if the recipient has
        // thank-you suggestions enabled (see Gifts UI).
        io.to(`user:${data.recipientId}`).emit("gift-received", {
          transactionId: result.transactionId,
          fromUserId: senderId,
          giftSlug: result.gift.slug,
          displayName: result.gift.displayName,
          rendererKind: result.gift.rendererKind,
          palette: result.gift.palette,
          costTokens: result.costTokens,
          note,
          callId,
          conversationId,
          createdAt: result.deliveredAt,
        });
      } catch (err) {
        if (err instanceof SelfGiftError) {
          socket.emit("gift-error", { code: "self_gift" });
        } else if (err instanceof GiftNotFoundError) {
          socket.emit("gift-error", { code: "gift_not_found" });
        } else if (err instanceof RecipientRefusesGiftsError) {
          socket.emit("gift-error", { code: "recipient_refuses_gifts" });
        } else if (err instanceof GiftRateLimitError) {
          socket.emit("gift-error", { code: "rate_limited", scope: err.scope });
        } else if (err instanceof InsufficientBalanceError) {
          socket.emit("gift-error", {
            code: "insufficient_balance",
            required: err.required,
            available: err.available,
          });
        } else if (err instanceof InvalidAmountError) {
          socket.emit("gift-error", { code: "invalid_amount" });
        } else {
          logger.error({ err, senderId }, "[Socket] send-gift failed");
          socket.emit("gift-error", { code: "internal" });
        }
      }
    });

    // record-call-minute: idempotent opt-in token earning from calls.
    // The client pings this once per minute per active call. Dedupe
    // and daily-cap enforcement live in AttentionTokenService.
    socket.on("record-call-minute", async (payload: unknown) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "record-call-minute")) return;
      const data = payload as { callId?: unknown };
      if (!isValidString(data?.callId, 128)) {
        socket.emit("gift-error", { code: "invalid_payload" });
        return;
      }
      try {
        const { awarded, dailyTotal } = await AttentionTokenService.recordCallMinute({
          userId: socket.data.userId,
          callId: data.callId,
        });
        socket.emit("call-minute-recorded", {
          awarded,
          dailyTotal,
          dailyCap: AttentionTokenService.DAILY_EARN_CAP_TOKENS,
        });
      } catch (err) {
        logger.error({ err, userId: socket.data.userId }, "[Socket] record-call-minute failed");
        socket.emit("gift-error", { code: "internal" });
      }
    });

    // get-gift-insights: returns the requesting user's OWN engagement
    // summary + thank-you suggestions (recipient-only). No data about
    // other users is returned â€” by design, there is no leaderboard.
    socket.on("get-gift-insights", async () => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "get-gift-insights")) return;
      try {
        const [summary, suggestions] = await Promise.all([
          ReciprocityEngine.getSelfEngagementSummary(socket.data.userId),
          ReciprocityEngine.getThankYouSuggestionsForRecipient(socket.data.userId),
        ]);
        socket.emit("gift-insights", { summary, thankYouSuggestions: suggestions });
      } catch (err) {
        logger.error({ err, userId: socket.data.userId }, "[Socket] get-gift-insights failed");
        socket.emit("gift-error", { code: "internal" });
      }
    });

    // â”€â”€â”€ COLLABORATIVE WHITEBOARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //
    // Boards are namespaced by `boardId` (typically the call/room id).
    // All events require auth + per-event rate limits + payload size
    // checks.  We never echo a peer's own message back to them.

    socket.on("whiteboard-join", (
      data: { boardId?: string; name?: string; color?: string },
      ack?: (resp: { roster: Array<{ userId: string; name: string; color: string; joinedAt: number }>; snapshot?: unknown }) => void,
    ) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "whiteboard-join")) return;
      if (!isValidString(data?.boardId, WHITEBOARD_BOARD_ID_MAX)) return;
      const name = isValidString(data?.name, 80) ? data.name! : "Guest";
      const color = isValidString(data?.color, 16) ? data.color! : "#0ea5e9";
      const boardId = data!.boardId!;
      const linkedRoom = roomManager.get(boardId);
      if (linkedRoom && !linkedRoom.participants.some((p) => p.userId === socket.data.userId)) {
        socket.emit("whiteboard-error", {
          code: "not-room-member",
          message: "Join the call room before joining this whiteboard.",
        });
        return;
      }
      const board = getOrCreateBoard(boardId);
      if (board.roster.size >= WHITEBOARD_MAX_PEERS && !board.roster.has(socket.data.userId)) {
        socket.emit("whiteboard-error", { code: "board-full", message: "Whiteboard is full." });
        return;
      }
      const existing = board.roster.get(socket.data.userId);
      if (existing) {
        existing.socketIds.add(socket.id);
        existing.name = name;
        existing.color = color;
      } else {
        board.roster.set(socket.data.userId, {
          userId: socket.data.userId,
          name, color,
          joinedAt: Date.now(),
          socketIds: new Set([socket.id]),
        });
      }
      socket.join(whiteboardRoom(boardId));
      socket.data.whiteboardIds = (socket.data.whiteboardIds as Set<string> | undefined) ?? new Set<string>();
      (socket.data.whiteboardIds as Set<string>).add(boardId);

      const roster = rosterToWire(board);
      // Notify peers
      socket.to(whiteboardRoom(boardId)).emit("whiteboard-peer-joined", {
        boardId,
        user: roster.find((r) => r.userId === socket.data.userId),
      });
      // Refresh full roster for everyone (small payload, simpler client)
      io.to(whiteboardRoom(boardId)).emit("whiteboard-roster", { boardId, roster });
      ack?.({ roster });
    });

    socket.on("whiteboard-leave", (data: { boardId?: string }) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "whiteboard-leave")) return;
      if (!isValidString(data?.boardId, WHITEBOARD_BOARD_ID_MAX)) return;
      const boardId = data!.boardId!;
      const board = whiteboards.get(boardId);
      if (!board) return;
      const entry = board.roster.get(socket.data.userId);
      if (entry) {
        entry.socketIds.delete(socket.id);
        if (entry.socketIds.size === 0) board.roster.delete(socket.data.userId);
      }
      socket.leave(whiteboardRoom(boardId));
      io.to(whiteboardRoom(boardId)).emit("whiteboard-peer-left", { boardId, userId: socket.data.userId });
      if (board.roster.size === 0) {
        whiteboards.delete(boardId);
      } else {
        io.to(whiteboardRoom(boardId)).emit("whiteboard-roster", { boardId, roster: rosterToWire(board) });
      }
    });

    socket.on("whiteboard-op", (data: { boardId?: string; envelope?: { authorId?: string; seq?: number; ts?: number; op?: { kind?: string } } }) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "whiteboard-op")) return;
      if (!isValidString(data?.boardId, WHITEBOARD_BOARD_ID_MAX)) return;
      const env = data?.envelope;
      if (!env || typeof env !== "object") return;
      if (typeof env.seq !== "number" || typeof env.ts !== "number") return;
      if (!env.op || typeof env.op !== "object" || typeof env.op.kind !== "string") return;
      // Authoritatively stamp the authorId from the auth context to
      // prevent spoofing other users' ops.
      env.authorId = socket.data.userId;
      if (whiteboardPayloadTooLarge(env)) {
        socket.emit("whiteboard-error", { code: "payload-too-large" });
        return;
      }
      const board = getOrCreateBoard(data!.boardId!);
      // Only members can broadcast ops.
      if (!board.roster.has(socket.data.userId)) return;
      // Don't buffer transient ops (`extend` / `clear`) in the replay
      // log â€” they expand the ring buffer with no future value.
      if (env.op.kind !== "extend" && env.op.kind !== "clear") {
        recordWhiteboardOp(board, socket.data.userId, env);
      }
      socket.to(whiteboardRoom(data!.boardId!)).emit("whiteboard-op", {
        boardId: data!.boardId!,
        fromUserId: socket.data.userId,
        envelope: env,
      });
    });

    socket.on("whiteboard-cursor", (data: { boardId?: string; x?: number; y?: number; tool?: string; isDrawing?: boolean }) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "whiteboard-cursor")) return;
      if (!isValidString(data?.boardId, WHITEBOARD_BOARD_ID_MAX)) return;
      if (typeof data!.x !== "number" || typeof data!.y !== "number") return;
      if (!Number.isFinite(data!.x) || !Number.isFinite(data!.y)) return;
      const board = whiteboards.get(data!.boardId!);
      if (!board || !board.roster.has(socket.data.userId)) return;
      socket.to(whiteboardRoom(data!.boardId!)).emit("whiteboard-cursor", {
        boardId: data!.boardId!,
        fromUserId: socket.data.userId,
        x: data!.x,
        y: data!.y,
        tool: typeof data!.tool === "string" ? data!.tool : "pen",
        isDrawing: Boolean(data!.isDrawing),
      });
    });

    socket.on("whiteboard-snapshot-request", (data: { boardId?: string }) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "whiteboard-snapshot-request")) return;
      if (!isValidString(data?.boardId, WHITEBOARD_BOARD_ID_MAX)) return;
      const board = whiteboards.get(data!.boardId!);
      if (!board || !board.roster.has(socket.data.userId)) return;
      socket.to(whiteboardRoom(data!.boardId!)).emit("whiteboard-snapshot-request", {
        boardId: data!.boardId!,
        fromUserId: socket.data.userId,
      });
    });

    socket.on("whiteboard-snapshot-response", (data: { boardId?: string; toUserId?: string; snapshot?: unknown }) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "whiteboard-snapshot-response")) return;
      if (!isValidString(data?.boardId, WHITEBOARD_BOARD_ID_MAX)) return;
      if (!isValidString(data?.toUserId, 128)) return;
      if (whiteboardPayloadTooLarge(data?.snapshot)) {
        socket.emit("whiteboard-error", { code: "snapshot-too-large" });
        return;
      }
      const board = whiteboards.get(data!.boardId!);
      if (!board || !board.roster.has(socket.data.userId)) return;
      const target = board.roster.get(data!.toUserId!);
      if (!target) return;
      for (const sid of target.socketIds) {
        io.to(sid).emit("whiteboard-snapshot-response", {
          boardId: data!.boardId!,
          fromUserId: socket.data.userId,
          snapshot: data!.snapshot,
        });
      }
    });

    socket.on("whiteboard-replay-request", (data: { boardId?: string; authorId?: string; sinceSeq?: number }) => {
      if (!requireAuth(socket)) return;
      if (checkRate(socket, "whiteboard-replay-request")) return;
      if (!isValidString(data?.boardId, WHITEBOARD_BOARD_ID_MAX)) return;
      if (!isValidString(data?.authorId, 128)) return;
      if (typeof data!.sinceSeq !== "number") return;
      const board = whiteboards.get(data!.boardId!);
      if (!board || !board.roster.has(socket.data.userId)) return;
      const buf = board.recentOps.get(data!.authorId!) ?? [];
      const ops = buf.filter((env) => {
        const e = env as { seq?: number };
        return typeof e.seq === "number" && e.seq > (data!.sinceSeq as number);
      });
      socket.emit("whiteboard-replay-response", {
        boardId: data!.boardId!,
        authorId: data!.authorId!,
        ops,
      });
    });

    // â”€â”€â”€ DISCONNECT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    socket.on("disconnect", () => {
      if (socket.data.userId) {
        // Remove from any call rooms & notify remaining peers
        const affectedRooms = roomManager.removeSocket(socket.id);
        for (const roomId of affectedRooms) {
          io.to(`room:${roomId}`).emit("room-peer-left", {
            roomId,
            userId: socket.data.userId,
            room: roomManager.get(roomId),
            reason: "disconnect",
          });
        }

        quantsinkLivenessDb.delete(socket.data.userId);
        if (redisReady) {
          void pubClient.del(livenessKey(socket.data.userId));
        }
        // Clean up whiteboard rooms this socket joined.
        const ids = socket.data.whiteboardIds as Set<string> | undefined;
        if (ids) {
          for (const boardId of ids) {
            const board = whiteboards.get(boardId);
            if (!board) continue;
            const entry = board.roster.get(socket.data.userId);
            if (entry) {
              entry.socketIds.delete(socket.id);
              if (entry.socketIds.size === 0) {
                board.roster.delete(socket.data.userId);
                io.to(whiteboardRoom(boardId)).emit("whiteboard-peer-left", { boardId, userId: socket.data.userId });
              }
            }
            if (board.roster.size === 0) {
              whiteboards.delete(boardId);
            } else {
              io.to(whiteboardRoom(boardId)).emit("whiteboard-roster", { boardId, roster: rosterToWire(board) });
            }
          }
        }

        const sessionId = normalizeOptionalString(socket.data.companionSessionId, 256);
        if (sessionId) {
          void markCompanionSessionOffline(socket.data.userId, sessionId);
        }

        const typingPrefix = `${socket.data.userId}:`;
        for (const key of typingStateCache.keys()) {
          if (key.startsWith(typingPrefix)) typingStateCache.delete(key);
        }

        queueRecoveryCache.delete(socket.data.userId);
      }
      logger.debug({ socketId: socket.id, userId: socket.data.userId }, "[Socket] Disconnected");
    });
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// OFFLINE QUEUE FLUSH â€” BACKPRESSURED
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const FLUSH_EMIT_BATCH_SIZE = 50;
const FLUSH_QUERY_BATCH_SIZE = 250;
const FLUSH_MAX_MESSAGES_PER_SYNC = 1_500;
const FLUSH_DELAY_MS = 8;
const QUEUE_RECOVERY_DRIFT_THRESHOLD_MS = Math.max(
  2_000,
  Number.parseInt(process.env.QUEUE_RECOVERY_DRIFT_THRESHOLD_MS ?? "2000", 10),
);
const QUEUE_RECOVERY_BACKLOG_THRESHOLD = Math.max(
  50,
  Number.parseInt(process.env.QUEUE_RECOVERY_BACKLOG_THRESHOLD ?? "250", 10),
);
const QUEUE_RECOVERY_CACHE_MS = Math.max(
  500,
  Number.parseInt(process.env.QUEUE_RECOVERY_CACHE_MS ?? "1500", 10),
);
const QUEUE_RECOVERY_CACHE_TTL_MS = Math.max(15_000, QUEUE_RECOVERY_CACHE_MS * 8);
const activeQueueFlushes = new Map<string, Promise<QueueFlushSummary>>();
const queueRecoveryCache = new Map<string, QueueRecoverySnapshot>();

interface QueueFlushSummary {
  emittedCount: number;
  dbBatchCount: number;
  reachedCap: boolean;
  durationMs: number;
  error: boolean;
}

interface QueueRecoverySnapshot {
  pendingCount: number;
  oldestPendingAgeMs: number | null;
  driftDetected: boolean;
  sampledAtMs: number;
}

const EMPTY_QUEUE_FLUSH_SUMMARY: QueueFlushSummary = {
  emittedCount: 0,
  dbBatchCount: 0,
  reachedCap: false,
  durationMs: 0,
  error: false,
};

function hasEnvelopeHeader(data: unknown): data is { header: unknown } {
  return typeof data === "object" && data !== null && "header" in data;
}

function activeQueueWhere(userId: string, now: Date): Prisma.MessageWhereInput {
  return {
    receiverId: userId,
    status: "QUEUED",
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

async function getQueueRecoverySnapshot(userId: string): Promise<QueueRecoverySnapshot> {
  const nowMs = Date.now();
  const cached = queueRecoveryCache.get(userId);
  if (cached && nowMs - cached.sampledAtMs < QUEUE_RECOVERY_CACHE_MS) {
    return cached;
  }

  const now = new Date(nowMs);
  const where = activeQueueWhere(userId, now);
  const [pendingCount, oldestPending] = await Promise.all([
    prisma.message.count({ where }),
    prisma.message.findFirst({
      where,
      select: { createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  const oldestPendingAgeMs = oldestPending
    ? Math.max(0, nowMs - oldestPending.createdAt.getTime())
    : null;
  const driftDetected =
    pendingCount >= QUEUE_RECOVERY_BACKLOG_THRESHOLD ||
    (oldestPendingAgeMs !== null && oldestPendingAgeMs >= QUEUE_RECOVERY_DRIFT_THRESHOLD_MS);

  const snapshot: QueueRecoverySnapshot = {
    pendingCount,
    oldestPendingAgeMs,
    driftDetected,
    sampledAtMs: nowMs,
  };
  queueRecoveryCache.set(userId, snapshot);
  return snapshot;
}

async function emitQueueRecoveryPulse(
  socket: Socket,
  userId: string,
  trigger: "auth" | "sync-queue",
  syncSummary: QueueFlushSummary,
): Promise<void> {
  try {
    const snapshot = await getQueueRecoverySnapshot(userId);
    realtimeTelemetry.queueRecoveryPulseEvents += 1;
    realtimeTelemetry.queueRecoveryBacklogTotal += snapshot.pendingCount;
    if (snapshot.driftDetected) {
      realtimeTelemetry.queueRecoveryDriftAlerts += 1;
    }

    socket.emit("queue-recovery-pulse", {
      trigger,
      sampledAt: new Date(snapshot.sampledAtMs).toISOString(),
      pendingCount: snapshot.pendingCount,
      oldestPendingAgeMs: snapshot.oldestPendingAgeMs,
      driftDetected: snapshot.driftDetected,
      driftThresholdMs: QUEUE_RECOVERY_DRIFT_THRESHOLD_MS,
      backlogThreshold: QUEUE_RECOVERY_BACKLOG_THRESHOLD,
      syncDurationMs: syncSummary.durationMs,
      syncEmittedCount: syncSummary.emittedCount,
      syncReachedCap: syncSummary.reachedCap,
      syncError: syncSummary.error,
    });
  } catch (err) {
    logger.warn({ err, userId, trigger }, "[Queue] Recovery pulse failed");
  }
}

const queueRecoveryCacheSweep = setInterval(() => {
  const cutoff = Date.now() - QUEUE_RECOVERY_CACHE_TTL_MS;
  for (const [userId, snapshot] of queueRecoveryCache) {
    if (snapshot.sampledAtMs < cutoff) {
      queueRecoveryCache.delete(userId);
    }
  }
}, QUEUE_RECOVERY_CACHE_TTL_MS);

if (typeof queueRecoveryCacheSweep.unref === "function") {
  queueRecoveryCacheSweep.unref();
}

async function flushOfflineQueue(io: Server, socket: Socket, userId: string): Promise<QueueFlushSummary> {
  const existing = activeQueueFlushes.get(userId);
  if (existing) {
    return existing;
  }

  const task = flushOfflineQueueInternal(io, socket, userId).finally(() => {
    activeQueueFlushes.delete(userId);
  });

  activeQueueFlushes.set(userId, task);
  return task;
}

async function flushOfflineQueueInternal(
  io: Server,
  _socket: Socket,
  userId: string,
): Promise<QueueFlushSummary> {
  const flushStartedAtMs = Date.now();
  realtimeTelemetry.queueFlushRuns += 1;
  try {
    const now = new Date();
    const userRoom = `user:${userId}`;
    let emittedCount = 0;
    let dbBatchCount = 0;
    let cursorCreatedAt: Date | null = null;
    let cursorId: string | null = null;

    while (emittedCount < FLUSH_MAX_MESSAGES_PER_SYNC) {
      const remaining = FLUSH_MAX_MESSAGES_PER_SYNC - emittedCount;
      const take = Math.min(FLUSH_QUERY_BATCH_SIZE, remaining);

      const where = activeQueueWhere(userId, now);

      if (cursorCreatedAt && cursorId) {
        where.AND = [
          {
            OR: [
              { createdAt: { gt: cursorCreatedAt } },
              { createdAt: cursorCreatedAt, id: { gt: cursorId } },
            ],
          },
        ];
      }

      const pending = await prisma.message.findMany({
        where,
        select: {
          id: true,
          senderId: true,
          content: true,
          iv: true,
          createdAt: true,
          expiresAt: true,
          conversationId: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take,
      });

      if (pending.length === 0) break;
      dbBatchCount += 1;
      realtimeTelemetry.queueFlushBatches += 1;

      logger.debug(
        { userId, batchCount: pending.length, emittedCount },
        "[Queue] Flushing offline messages batch",
      );

      for (let i = 0; i < pending.length; i += FLUSH_EMIT_BATCH_SIZE) {
        const batch = pending.slice(i, i + FLUSH_EMIT_BATCH_SIZE);

        for (const msg of batch) {
          const isLikelyEnvelopePayload =
            msg.content.startsWith("{") &&
            msg.content.includes("\"header\"");
          const envelopeData = isLikelyEnvelopePayload
            ? safeJsonParse(msg.content)
            : null;

          if (envelopeData && hasEnvelopeHeader(envelopeData)) {
            io.to(userRoom).emit("receive-message", {
              id: msg.id,
              senderId: msg.senderId,
              envelope: envelopeData,
              createdAt: msg.createdAt,
              expiresAt: msg.expiresAt,
              conversationId: msg.conversationId,
            });
          } else {
            io.to(userRoom).emit("receive-message", {
              id: msg.id,
              senderId: msg.senderId,
              ciphertext: msg.content,
              iv: msg.iv,
              createdAt: msg.createdAt,
              expiresAt: msg.expiresAt,
              conversationId: msg.conversationId,
            });
          }
          realtimeTelemetry.queueMessagesEmitted += 1;
        }

        if (i + FLUSH_EMIT_BATCH_SIZE < pending.length) {
          await new Promise((resolve) => setTimeout(resolve, FLUSH_DELAY_MS));
        }
      }

      emittedCount += pending.length;

      const lastMessage = pending[pending.length - 1];
      if (!lastMessage) break;
      cursorCreatedAt = lastMessage.createdAt;
      cursorId = lastMessage.id;

      if (pending.length < take) break;
    }

    if (emittedCount >= FLUSH_MAX_MESSAGES_PER_SYNC) {
      realtimeTelemetry.queueFlushCapped += 1;
      logger.info(
        { userId, cap: FLUSH_MAX_MESSAGES_PER_SYNC },
        "[Queue] Flush reached sync cap; additional messages require next sync",
      );
    }
    return {
      emittedCount,
      dbBatchCount,
      reachedCap: emittedCount >= FLUSH_MAX_MESSAGES_PER_SYNC,
      durationMs: Date.now() - flushStartedAtMs,
      error: false,
    };
  } catch (e) {
    logger.error({ err: e }, "[Queue] Flush error");
    return {
      ...EMPTY_QUEUE_FLUSH_SUMMARY,
      durationMs: Date.now() - flushStartedAtMs,
      error: true,
    };
  }
}
