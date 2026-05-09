import type { Server } from "socket.io";
import { prisma } from "@repo/database";
import { logger } from "../logger";

// Minimum TTL prevents immediate self-destruct spam.
export const DISAPPEARING_MIN_SECS = 10;

// Maximum TTL keeps disappearing mode meaningfully ephemeral.
export const DISAPPEARING_MAX_SECS = 30 * 24 * 60 * 60;

// Suggested presets for client UX.
export const DISAPPEARING_PRESETS_SECS: ReadonlyArray<number> = [
  30,
  5 * 60,
  60 * 60,
  24 * 60 * 60,
  7 * 24 * 60 * 60,
  30 * 24 * 60 * 60,
];

export function normalizeTtlSecs(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  if (raw <= 0) return null;

  const secs = Math.floor(raw);
  if (secs < DISAPPEARING_MIN_SECS || secs > DISAPPEARING_MAX_SECS) {
    return undefined;
  }
  return secs;
}

const DEFAULT_SWEEP_INTERVAL_MS = 30_000;
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_MAX_MESSAGES_PER_SWEEP = 5_000;
const PURGEABLE_STATUSES = ["QUEUED", "DELIVERED", "READ"] as const;

export interface PurgeWorkerOptions {
  sweepIntervalMs?: number;
  batchSize?: number;
  maxMessagesPerSweep?: number;
}

export class PurgeWorker {
  private readonly io: Server;
  private readonly sweepIntervalMs: number;
  private readonly batchSize: number;
  private readonly maxMessagesPerSweep: number;
  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(io: Server, opts: PurgeWorkerOptions = {}) {
    this.io = io;
    this.sweepIntervalMs = opts.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
    this.batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
    this.maxMessagesPerSweep = opts.maxMessagesPerSweep ?? DEFAULT_MAX_MESSAGES_PER_SWEEP;
  }

  start(): void {
    if (this.timer) return;

    void this.sweepOnce();
    this.timer = setInterval(() => {
      void this.sweepOnce();
    }, this.sweepIntervalMs);

    if (typeof this.timer.unref === "function") {
      this.timer.unref();
    }

    logger.info(
      {
        sweepIntervalMs: this.sweepIntervalMs,
        batchSize: this.batchSize,
        maxMessagesPerSweep: this.maxMessagesPerSweep,
      },
      "[PurgeWorker] Started",
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info("[PurgeWorker] Stopped");
  }

  async sweepOnce(): Promise<number> {
    if (this.sweeping) return 0;
    this.sweeping = true;

    const now = new Date();
    let purgedCount = 0;

    try {
      while (purgedCount < this.maxMessagesPerSweep) {
        const remaining = this.maxMessagesPerSweep - purgedCount;
        const take = Math.min(this.batchSize, remaining);

        const expired = await prisma.message.findMany({
          where: {
            expiresAt: { lte: now },
            status: { in: [...PURGEABLE_STATUSES] },
          },
          select: {
            id: true,
            senderId: true,
            receiverId: true,
            conversationId: true,
          },
          orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
          take,
        });

        if (expired.length === 0) break;

        const ids = expired.map((message) => message.id);
        const deleted = await prisma.message.deleteMany({
          where: { id: { in: ids } },
        });

        if (deleted.count === 0) break;

        purgedCount += deleted.count;
        this.emitPurgeNotifications(expired, now);

        if (expired.length < take) break;
      }

      if (purgedCount > 0) {
        logger.info({ purgedCount }, "[PurgeWorker] Purged expired messages");
      }

      return purgedCount;
    } catch (err) {
      logger.error({ err }, "[PurgeWorker] Sweep failed");
      return purgedCount;
    } finally {
      this.sweeping = false;
    }
  }

  private emitPurgeNotifications(
    expired: Array<{ id: string; senderId: string; receiverId: string; conversationId: string | null }>,
    now: Date,
  ): void {
    const purgedAt = now.toISOString();

    for (const message of expired) {
      const payload = {
        messageId: message.id,
        conversationId: message.conversationId,
        purgedAt,
        reason: "expired",
      };

      this.io.to(`user:${message.senderId}`).emit("message-purged", payload);
      if (message.receiverId !== message.senderId) {
        this.io.to(`user:${message.receiverId}`).emit("message-purged", payload);
      }
    }
  }
}
