import { createHash } from "crypto";
import type { NextRequest } from "next/server";

export type AiPrivacyMode = "private" | "sensitive" | "workspace";

const MAX_RETENTION_SECS = 24 * 60 * 60;
const DEFAULT_RETENTION_BY_MODE: Record<AiPrivacyMode, number> = {
  private: 0,
  sensitive: 15 * 60,
  workspace: 60 * 60,
};

interface RateBucket {
  count: number;
  windowStart: number;
}

interface AuditEntry {
  scope: string;
  requesterKey: string;
  chatId: string;
  privacyMode: AiPrivacyMode;
  digest: string;
  expiresAt: number;
}

const rateBuckets = new Map<string, RateBucket>();
const auditEntries = new Map<string, AuditEntry>();

const RATE_BUCKETS_MAX = 30_000;
const AUDIT_ENTRIES_MAX = 40_000;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

export function normalizeAiOptIn(raw: unknown, fallback: boolean = false): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

export function normalizeAiPrivacyMode(raw: unknown): AiPrivacyMode {
  if (raw === "private" || raw === "sensitive" || raw === "workspace") {
    return raw;
  }
  return "private";
}

export function normalizeRetentionSecs(raw: unknown, privacyMode: AiPrivacyMode): number {
  if (raw === null || raw === undefined) {
    return DEFAULT_RETENTION_BY_MODE[privacyMode];
  }

  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_RETENTION_BY_MODE[privacyMode];
  }

  const secs = Math.floor(raw);
  if (secs <= 0) return 0;
  return Math.min(secs, MAX_RETENTION_SECS);
}

export function normalizeChatId(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 128) return fallback;
  if (!/^[a-zA-Z0-9:_\-.#]+$/.test(trimmed)) return fallback;
  return trimmed;
}

export function resolveRequesterKey(req: NextRequest, userId?: string | null): string {
  if (typeof userId === "string" && userId.trim()) {
    return `user:${userId.trim()}`;
  }

  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = req.headers.get("user-agent")?.trim() ?? "unknown";
  const digest = createHash("sha256")
    .update(`${forwardedFor}|${userAgent}`)
    .digest("hex")
    .slice(0, 20);

  return `anon:${digest}`;
}

export function consumeAiRateLimit(params: {
  scope: string;
  requesterKey: string;
  chatId: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  pruneRateBuckets(now, params.windowMs);

  const bucketId = `${params.scope}:${params.requesterKey}:${params.chatId}`;
  const existing = rateBuckets.get(bucketId);

  if (!existing || now - existing.windowStart >= params.windowMs) {
    rateBuckets.set(bucketId, { count: 1, windowStart: now });
    trimRateBuckets();
    return { allowed: true, retryAfterSec: 0 };
  }

  existing.count += 1;
  if (existing.count <= params.limit) {
    rateBuckets.set(bucketId, existing);
    return { allowed: true, retryAfterSec: 0 };
  }

  const retryAfterMs = Math.max(0, params.windowMs - (now - existing.windowStart));
  return {
    allowed: false,
    retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  };
}

export function digestForRetention(parts: Array<string | number | null | undefined>): string {
  const hasher = createHash("sha256");
  for (const part of parts) {
    hasher.update(String(part ?? ""));
    hasher.update("|");
  }
  return hasher.digest("hex");
}

export function recordAiAuditEvent(params: {
  scope: string;
  requesterKey: string;
  chatId: string;
  privacyMode: AiPrivacyMode;
  retentionSecs: number;
  digest: string;
}): void {
  if (params.retentionSecs <= 0) return;

  const now = Date.now();
  const expiresAt = now + params.retentionSecs * 1000;
  const randomSuffix = Math.random().toString(16).slice(2, 10);
  const key = `${params.scope}:${params.requesterKey}:${params.chatId}:${now}:${randomSuffix}`;

  auditEntries.set(key, {
    scope: params.scope,
    requesterKey: params.requesterKey,
    chatId: params.chatId,
    privacyMode: params.privacyMode,
    digest: params.digest,
    expiresAt,
  });

  pruneAuditEntries(now);
  trimAuditEntries();
}

function pruneRateBuckets(now: number, windowMs: number): void {
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.windowStart >= windowMs * 2) {
      rateBuckets.delete(key);
    }
  }
}

function trimRateBuckets(): void {
  while (rateBuckets.size > RATE_BUCKETS_MAX) {
    const oldestKey = rateBuckets.keys().next().value;
    if (!oldestKey) break;
    rateBuckets.delete(oldestKey);
  }
}

function pruneAuditEntries(now: number): void {
  for (const [key, entry] of auditEntries) {
    if (entry.expiresAt <= now) {
      auditEntries.delete(key);
    }
  }
}

function trimAuditEntries(): void {
  while (auditEntries.size > AUDIT_ENTRIES_MAX) {
    const oldestKey = auditEntries.keys().next().value;
    if (!oldestKey) break;
    auditEntries.delete(oldestKey);
  }
}
