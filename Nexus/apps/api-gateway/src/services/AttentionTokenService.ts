import { prisma, Prisma } from "@repo/database";
import { AttentionTokenReason } from "@prisma/client";
import { logger } from "../logger";

// ═══════════════════════════════════════════════════════════════
// AttentionTokenService
// ═══════════════════════════════════════════════════════════════
//
// Provides an append-only, auditable ledger for the in-app attention
// token balance. Tokens are a closed-loop virtual currency with NO
// redemption for real money, gift cards or regulated assets. Because
// there is no cash-out, this system is intentionally out of scope for
// MSB/VASP registration in the US/EU — but we still apply consumer-
// finance hygiene (append-only ledger, atomic debit, hard caps).
//
// Ethics guardrails baked into this service:
//
//   * Earning from call minutes is strictly opt-in (GiftPreferences.
//     earnFromCalls). If the user hasn't opted in, zero tokens accrue
//     no matter how long they talk. This neutralises the "time-on-app
//     coercion" dark pattern called out by the FTC and EU DSA.
//
//   * Daily earn cap (DAILY_EARN_CAP_TOKENS). Beyond the cap, extra
//     minutes still count toward the streak / history but earn no
//     additional tokens. This breaks the "infinite grind" loop.
//
//   * Every mutation goes through a transaction that:
//       (a) locks the user row,
//       (b) verifies balance >= debit,
//       (c) writes the new balance AND a ledger entry atomically.
//     Readers therefore cannot observe a state where the balance and
//     ledger disagree.
//
//   * No negative balances are ever written; any attempt to overspend
//     throws `InsufficientBalanceError` and the caller must handle it.
//
// ═══════════════════════════════════════════════════════════════

export const DAILY_EARN_CAP_TOKENS = 60;         // ≈ one hour of calls
export const MAX_TOKENS_PER_CALL_MINUTE = 1;     // 1 token / minute
export const MAX_NOTE_LENGTH = 256;
export const MAX_LEDGER_PAGE_SIZE = 100;

export class InsufficientBalanceError extends Error {
  constructor(public readonly required: number, public readonly available: number) {
    super(`Insufficient balance: required ${required}, available ${available}`);
    this.name = "InsufficientBalanceError";
  }
}

export class InvalidAmountError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "InvalidAmountError";
  }
}

export interface LedgerEntry {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: AttentionTokenReason;
  refId: string | null;
  note: string | null;
  createdAt: Date;
}

export interface BalanceSnapshot {
  userId: string;
  balance: number;
  earnedLifetime: number;
  spentLifetime: number;
  earnedToday: number;
  dailyEarnCap: number;
  earnFromCallsEnabled: boolean;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function assertFiniteInt(n: unknown, label: string): asserts n is number {
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n)) {
    throw new InvalidAmountError(`${label} must be a finite integer`);
  }
}

function truncateNote(note: string | undefined | null): string | null {
  if (!note) return null;
  const trimmed = note.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_NOTE_LENGTH);
}

function startOfUtcDay(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function minuteBucket(d: Date = new Date()): Date {
  const ms = d.getTime();
  return new Date(ms - (ms % 60_000));
}

// ─────────────────────────────────────────────────────────────
// Core ledger primitives
// ─────────────────────────────────────────────────────────────

type TxClient = Prisma.TransactionClient;
const SERIALIZABLE_TX = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};

async function creditInternal(
  tx: TxClient,
  userId: string,
  amount: number,
  reason: AttentionTokenReason,
  refId: string | null,
  note: string | null,
): Promise<LedgerEntry> {
  assertFiniteInt(amount, "amount");
  if (amount <= 0) throw new InvalidAmountError("credit amount must be positive");

  const user = await tx.user.update({
    where: { id: userId },
    data: {
      tokenBalance: { increment: amount },
      tokensEarnedLifetime: { increment: amount },
    },
    select: { tokenBalance: true },
  });

  const entry = await tx.attentionTokenLedger.create({
    data: {
      userId,
      delta: amount,
      balanceAfter: user.tokenBalance,
      reason,
      refId,
      note,
    },
  });

  return mapLedger(entry);
}

async function debitInternal(
  tx: TxClient,
  userId: string,
  amount: number,
  reason: AttentionTokenReason,
  refId: string | null,
  note: string | null,
): Promise<LedgerEntry> {
  assertFiniteInt(amount, "amount");
  if (amount <= 0) throw new InvalidAmountError("debit amount must be positive");

  // Lock the row by doing a conditional update — Postgres will serialise.
  const current = await tx.user.findUnique({
    where: { id: userId },
    select: { tokenBalance: true },
  });
  if (!current) throw new Error(`User not found: ${userId}`);
  if (current.tokenBalance < amount) {
    throw new InsufficientBalanceError(amount, current.tokenBalance);
  }

  const updated = await tx.user.update({
    where: { id: userId },
    data: {
      tokenBalance: { decrement: amount },
      tokensSpentLifetime: { increment: amount },
    },
    select: { tokenBalance: true },
  });

  const entry = await tx.attentionTokenLedger.create({
    data: {
      userId,
      delta: -amount,
      balanceAfter: updated.tokenBalance,
      reason,
      refId,
      note,
    },
  });

  return mapLedger(entry);
}

function mapLedger(row: {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: AttentionTokenReason;
  refId: string | null;
  note: string | null;
  createdAt: Date;
}): LedgerEntry {
  return {
    id: row.id,
    delta: row.delta,
    balanceAfter: row.balanceAfter,
    reason: row.reason,
    refId: row.refId,
    note: row.note,
    createdAt: row.createdAt,
  };
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export const AttentionTokenService = {
  DAILY_EARN_CAP_TOKENS,
  MAX_TOKENS_PER_CALL_MINUTE,

  /**
   * Returns a full balance snapshot including today's earnings
   * (used to render the progress ring in the client and to short-circuit
   * server-side earning once the cap is hit).
   */
  async getBalance(userId: string): Promise<BalanceSnapshot> {
    const [user, prefs, earnedTodayAgg] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          tokenBalance: true,
          tokensEarnedLifetime: true,
          tokensSpentLifetime: true,
        },
      }),
      prisma.giftPreferences.findUnique({
        where: { userId },
        select: { earnFromCalls: true },
      }),
      prisma.attentionTokenLedger.aggregate({
        where: {
          userId,
          createdAt: { gte: startOfUtcDay() },
          reason: { in: [AttentionTokenReason.CALL_MINUTE, AttentionTokenReason.DAILY_BONUS] },
        },
        _sum: { delta: true },
      }),
    ]);

    if (!user) throw new Error(`User not found: ${userId}`);

    return {
      userId: user.id,
      balance: user.tokenBalance,
      earnedLifetime: user.tokensEarnedLifetime,
      spentLifetime: user.tokensSpentLifetime,
      earnedToday: earnedTodayAgg._sum.delta ?? 0,
      dailyEarnCap: DAILY_EARN_CAP_TOKENS,
      earnFromCallsEnabled: prefs?.earnFromCalls ?? false,
    };
  },

  /**
   * Record one elapsed call minute for a user. Idempotent on
   * (userId, callId, minuteBucket) — safe to retry from the client.
   *
   * Returns the tokens actually awarded (0 if opt-out or cap hit).
   */
  async recordCallMinute(params: {
    userId: string;
    callId: string;
    at?: Date;
  }): Promise<{ awarded: number; dailyTotal: number }> {
    const { userId, callId } = params;
    const bucket = minuteBucket(params.at ?? new Date());

    const prefs = await prisma.giftPreferences.findUnique({
      where: { userId },
      select: { earnFromCalls: true },
    });
    const earnEnabled = prefs?.earnFromCalls ?? false;

    return prisma.$transaction(async (tx) => {
      // Dedupe on the unique index — if insert fails with Prisma's
      // unique-constraint violation (P2002) the minute was already
      // recorded and we silently skip awarding. Any other error is
      // unexpected and should propagate so the caller can observe it.
      let inserted = true;
      try {
        await tx.callMinuteLog.create({
          data: {
            userId,
            callId,
            minuteBucket: bucket,
            tokensAwarded: 0,
          },
        });
      } catch (err) {
        const code = (err as { code?: string } | null)?.code;
        if (code === "P2002") {
          inserted = false;
        } else {
          throw err;
        }
      }

      if (!inserted || !earnEnabled) {
        const agg = await tx.attentionTokenLedger.aggregate({
          where: {
            userId,
            createdAt: { gte: startOfUtcDay() },
            reason: AttentionTokenReason.CALL_MINUTE,
          },
          _sum: { delta: true },
        });
        return { awarded: 0, dailyTotal: agg._sum.delta ?? 0 };
      }

      // Hard daily cap
      const earnedTodayAgg = await tx.attentionTokenLedger.aggregate({
        where: {
          userId,
          createdAt: { gte: startOfUtcDay() },
          reason: AttentionTokenReason.CALL_MINUTE,
        },
        _sum: { delta: true },
      });
      const earnedToday = earnedTodayAgg._sum.delta ?? 0;
      const remainingCap = Math.max(0, DAILY_EARN_CAP_TOKENS - earnedToday);
      const awardable = Math.min(MAX_TOKENS_PER_CALL_MINUTE, remainingCap);

      if (awardable <= 0) {
        return { awarded: 0, dailyTotal: earnedToday };
      }

      await creditInternal(
        tx,
        userId,
        awardable,
        AttentionTokenReason.CALL_MINUTE,
        callId,
        null,
      );

      await tx.callMinuteLog.update({
        where: {
          userId_callId_minuteBucket: {
            userId,
            callId,
            minuteBucket: bucket,
          },
        },
        data: { tokensAwarded: awardable },
      });

      return { awarded: awardable, dailyTotal: earnedToday + awardable };
    }, SERIALIZABLE_TX);
  },

  /**
   * Attempt to debit `amount` tokens. Throws `InsufficientBalanceError`
   * if the user can't afford it. `refId` is typically a gift-transaction
   * id so the ledger can be joined back to gifts for audit.
   */
  async debit(params: {
    userId: string;
    amount: number;
    reason: AttentionTokenReason;
    refId?: string | null;
    note?: string | null;
    tx?: TxClient;
  }): Promise<LedgerEntry> {
    const { userId, amount, reason } = params;
    const note = truncateNote(params.note ?? null);
    const refId = params.refId ?? null;

    const run = (tx: TxClient) => debitInternal(tx, userId, amount, reason, refId, note);
    return params.tx ? run(params.tx) : prisma.$transaction(run, SERIALIZABLE_TX);
  },

  /**
   * Credit tokens. Does NOT enforce the daily cap — callers that need
   * cap-awareness (e.g. call-minute crediting) must handle that.
   */
  async credit(params: {
    userId: string;
    amount: number;
    reason: AttentionTokenReason;
    refId?: string | null;
    note?: string | null;
    tx?: TxClient;
  }): Promise<LedgerEntry> {
    const { userId, amount, reason } = params;
    const note = truncateNote(params.note ?? null);
    const refId = params.refId ?? null;

    const run = (tx: TxClient) => creditInternal(tx, userId, amount, reason, refId, note);
    return params.tx ? run(params.tx) : prisma.$transaction(run, SERIALIZABLE_TX);
  },

  /**
   * Atomically refund a previously-debited amount. Used when a gift
   * transaction is blocked / moderated / fails to deliver.
   */
  async refund(params: {
    userId: string;
    amount: number;
    refId: string;
    note?: string | null;
    tx?: TxClient;
  }): Promise<LedgerEntry> {
    return AttentionTokenService.credit({
      userId: params.userId,
      amount: params.amount,
      reason: AttentionTokenReason.REFUND,
      refId: params.refId,
      note: params.note,
      tx: params.tx,
    });
  },

  async listLedger(params: {
    userId: string;
    limit?: number;
    before?: Date;
  }): Promise<LedgerEntry[]> {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), MAX_LEDGER_PAGE_SIZE);
    const rows = await prisma.attentionTokenLedger.findMany({
      where: {
        userId: params.userId,
        ...(params.before ? { createdAt: { lt: params.before } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(mapLedger);
  },

  /**
   * Admin-only: used by the support console for a manual correction
   * (e.g. fraud clawback). Always leaves a ledger trail.
   */
  async adminAdjust(params: {
    userId: string;
    delta: number;
    note: string;
    actorId: string;
  }): Promise<LedgerEntry> {
    assertFiniteInt(params.delta, "delta");
    if (params.delta === 0) throw new InvalidAmountError("delta must be non-zero");
    const note = `admin:${params.actorId}:${truncateNote(params.note) ?? ""}`;
    if (params.delta > 0) {
      return AttentionTokenService.credit({
        userId: params.userId,
        amount: params.delta,
        reason: AttentionTokenReason.ADMIN_ADJUST,
        note,
      });
    }
    try {
      return await AttentionTokenService.debit({
        userId: params.userId,
        amount: -params.delta,
        reason: AttentionTokenReason.ADMIN_ADJUST,
        note,
      });
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        logger.warn(
          { userId: params.userId, actor: params.actorId },
          "[AttentionToken] admin debit bounced — insufficient balance",
        );
      }
      throw err;
    }
  },
};

export type { AttentionTokenReason };
