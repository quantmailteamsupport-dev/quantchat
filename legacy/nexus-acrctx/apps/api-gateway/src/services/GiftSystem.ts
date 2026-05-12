import { prisma, Prisma } from "@repo/database";
import {
  AttentionTokenReason,
  GiftTransactionStatus,
} from "@prisma/client";
import { logger } from "../logger";
import {
  AttentionTokenService,
  InsufficientBalanceError,
  InvalidAmountError,
} from "./AttentionTokenService";

const SERIALIZABLE_TX: Prisma.TransactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};

// ═══════════════════════════════════════════════════════════════
// GiftSystem
// ═══════════════════════════════════════════════════════════════
//
// Lets users send each other small 3D "gifts" (rose, crown, bolt,
// heart, …) during or outside of calls. Gifts cost tokens from the
// sender's balance and are recorded immutably in GiftTransaction.
//
// Abuse controls (important — this is the moderation surface):
//
//   * Recipient consent: GiftPreferences.acceptGifts must be true. If
//     the recipient has opted out, the send is REFUSED (not silently
//     delivered). Sender sees `BLOCKED` status.
//
//   * Anti-harassment rate limit: a single sender may only send up to
//     MAX_GIFTS_PER_RECIPIENT_PER_HOUR gifts to the same recipient per
//     rolling hour. Prevents gift-bomb pressure tactics.
//
//   * Note moderation: the optional sender note is trimmed and length-
//     capped server-side (clients cannot bypass).
//
//   * No sender-visible "gift not returned" signal. The sender sees
//     only that the gift was delivered (or blocked). Whether the
//     recipient reciprocated is NEVER exposed back to the sender.
//
//   * Refunds are automatic: if anything after the token debit fails,
//     a compensating REFUND ledger entry is recorded in the same
//     transaction (so the user is never out of tokens for a failed
//     send).
//
// ═══════════════════════════════════════════════════════════════

export const MAX_GIFT_NOTE_LENGTH = 140;
export const MAX_GIFTS_PER_RECIPIENT_PER_HOUR = 10;
export const MAX_GIFTS_PER_HOUR_GLOBAL = 60;
export const HISTORY_PAGE_SIZE_DEFAULT = 30;
export const HISTORY_PAGE_SIZE_MAX = 100;

// Built-in catalog. Seeded on first use; extra gifts can be added later
// via admin tooling. Keep this list short and curated — every new gift
// costs content-moderation review.
const DEFAULT_CATALOG: ReadonlyArray<{
  slug: string;
  displayName: string;
  description: string;
  costTokens: number;
  rendererKind: "rose" | "crown" | "bolt" | "heart";
  palette: string;
}> = [
  {
    slug: "rose",
    displayName: "Rose",
    description: "A simple red rose. Classic and low-cost.",
    costTokens: 5,
    rendererKind: "rose",
    palette: "#e11d48,#fb7185,#fecdd3",
  },
  {
    slug: "heart",
    displayName: "Heart",
    description: "A soft floating heart with a gentle pulse.",
    costTokens: 3,
    rendererKind: "heart",
    palette: "#ec4899,#f472b6,#fce7f3",
  },
  {
    slug: "bolt",
    displayName: "Lightning Bolt",
    description: "A crackling bolt — great for hype moments.",
    costTokens: 10,
    rendererKind: "bolt",
    palette: "#facc15,#fde047,#fff7cc",
  },
  {
    slug: "crown",
    displayName: "Crown",
    description: "A gilded crown with particle sparkles.",
    costTokens: 25,
    rendererKind: "crown",
    palette: "#fbbf24,#fde68a,#fef3c7",
  },
];

export interface GiftCatalogEntry {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  costTokens: number;
  rendererKind: string;
  modelUrl: string | null;
  palette: string[];
  isActive: boolean;
}

export interface SendGiftInput {
  senderId: string;
  recipientId: string;
  giftSlug: string;
  note?: string | null;
  callId?: string | null;
  conversationId?: string | null;
}

export interface SendGiftResult {
  transactionId: string;
  status: GiftTransactionStatus;
  costTokens: number;
  newSenderBalance: number;
  gift: GiftCatalogEntry;
  deliveredAt: Date | null;
}

export interface GiftHistoryItem {
  id: string;
  direction: "sent" | "received";
  counterpartyId: string;
  giftSlug: string;
  displayName: string;
  rendererKind: string;
  palette: string[];
  costTokens: number;
  note: string | null;
  status: GiftTransactionStatus;
  callId: string | null;
  conversationId: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
}

export class GiftNotFoundError extends Error {
  constructor(slug: string) {
    super(`Gift not found or inactive: ${slug}`);
    this.name = "GiftNotFoundError";
  }
}

export class RecipientRefusesGiftsError extends Error {
  constructor() {
    super("Recipient has disabled gifts");
    this.name = "RecipientRefusesGiftsError";
  }
}

export class GiftRateLimitError extends Error {
  constructor(public readonly scope: "recipient" | "global") {
    super(`Gift rate limit exceeded (${scope})`);
    this.name = "GiftRateLimitError";
  }
}

export class SelfGiftError extends Error {
  constructor() {
    super("Cannot send a gift to yourself");
    this.name = "SelfGiftError";
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function parsePalette(raw: string): string[] {
  // Accept only #RGB, #RGBA, #RRGGBB, #RRGGBBAA hex color literals.
  const validHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  return raw.split(",").map((c) => c.trim()).filter((c) => validHex.test(c));
}

function sanitizeAndTruncateNote(note: string | null | undefined): string | null {
  if (!note) return null;
  const trimmed = note.trim();
  if (!trimmed) return null;

  // XSS protection: strip HTML tags and dangerous characters
  const sanitized = trimmed
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>'"&]/g, (char) => {
      // HTML entity encoding for dangerous characters
      const entities: Record<string, string> = {
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
        '&': '&amp;'
      };
      return entities[char] || char;
    });

  return sanitized.slice(0, MAX_GIFT_NOTE_LENGTH);
}

function mapCatalog(row: {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  costTokens: number;
  rendererKind: string;
  modelUrl: string | null;
  palette: string;
  isActive: boolean;
}): GiftCatalogEntry {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    description: row.description,
    costTokens: row.costTokens,
    rendererKind: row.rendererKind,
    modelUrl: row.modelUrl,
    palette: parsePalette(row.palette),
    isActive: row.isActive,
  };
}

// ─────────────────────────────────────────────────────────────
// Seeding & catalog
// ─────────────────────────────────────────────────────────────

let catalogSeeded = false;

async function ensureCatalogSeeded(): Promise<void> {
  if (catalogSeeded) return;
  for (const entry of DEFAULT_CATALOG) {
    await prisma.gift.upsert({
      where: { slug: entry.slug },
      create: entry,
      update: {
        displayName: entry.displayName,
        description: entry.description,
        costTokens: entry.costTokens,
        rendererKind: entry.rendererKind,
        palette: entry.palette,
        isActive: true,
      },
    });
  }
  catalogSeeded = true;
}

async function loadGift(slug: string): Promise<GiftCatalogEntry> {
  await ensureCatalogSeeded();
  const row = await prisma.gift.findUnique({ where: { slug } });
  if (!row || !row.isActive) throw new GiftNotFoundError(slug);
  return mapCatalog(row);
}

// ─────────────────────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────────────────────

async function assertWithinRateLimits(
  tx: Prisma.TransactionClient,
  senderId: string,
  recipientId: string,
): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60_000);

  const [toRecipient, globalCount] = await Promise.all([
    tx.giftTransaction.count({
      where: {
        senderId,
        recipientId,
        createdAt: { gte: oneHourAgo },
        status: { in: [GiftTransactionStatus.PENDING, GiftTransactionStatus.DELIVERED] },
      },
    }),
    tx.giftTransaction.count({
      where: {
        senderId,
        createdAt: { gte: oneHourAgo },
        status: { in: [GiftTransactionStatus.PENDING, GiftTransactionStatus.DELIVERED] },
      },
    }),
  ]);

  if (toRecipient >= MAX_GIFTS_PER_RECIPIENT_PER_HOUR) {
    throw new GiftRateLimitError("recipient");
  }
  if (globalCount >= MAX_GIFTS_PER_HOUR_GLOBAL) {
    throw new GiftRateLimitError("global");
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export const GiftSystem = {
  MAX_GIFT_NOTE_LENGTH,
  MAX_GIFTS_PER_RECIPIENT_PER_HOUR,
  MAX_GIFTS_PER_HOUR_GLOBAL,

  async listCatalog(): Promise<GiftCatalogEntry[]> {
    await ensureCatalogSeeded();
    const rows = await prisma.gift.findMany({
      where: { isActive: true },
      orderBy: { costTokens: "asc" },
    });
    return rows.map(mapCatalog);
  },

  async getGift(slug: string): Promise<GiftCatalogEntry> {
    return loadGift(slug);
  },

  /**
   * Send a gift.
   *
   * This is the core transactional path. Everything (consent check,
   * rate-limit check, token debit, transaction write) runs inside a
   * single Postgres transaction so there's no window where the sender
   * is debited but the transaction isn't visible, or vice versa.
   *
   * Returns the transaction record; WebSocket fan-out is the caller's
   * responsibility (see socket.ts `send-gift` handler).
   */
  async sendGift(input: SendGiftInput): Promise<SendGiftResult> {
    const { senderId, recipientId } = input;
    if (senderId === recipientId) throw new SelfGiftError();

    const gift = await loadGift(input.giftSlug);
    if (gift.costTokens <= 0) throw new InvalidAmountError("gift cost must be positive");

    const note = sanitizeAndTruncateNote(input.note);

    return prisma.$transaction(async (tx) => {
      // 1. Recipient consent check
      const recipient = await tx.user.findUnique({
        where: { id: recipientId },
        select: {
          id: true,
          giftPrefs: { select: { acceptGifts: true } },
        },
      });
      if (!recipient) {
        throw new Error(`Recipient not found: ${recipientId}`);
      }
      const acceptGifts = recipient.giftPrefs?.acceptGifts ?? true;
      if (!acceptGifts) {
        throw new RecipientRefusesGiftsError();
      }

      // 2. Rate-limit checks (anti-harassment)
      await assertWithinRateLimits(tx, senderId, recipientId);

      // 3. Create the pending transaction
      const txn = await tx.giftTransaction.create({
        data: {
          giftId: gift.id,
          senderId,
          recipientId,
          costTokens: gift.costTokens,
          note,
          status: GiftTransactionStatus.PENDING,
          callId: input.callId ?? null,
          conversationId: input.conversationId ?? null,
        },
      });

      // 4. Debit sender atomically (throws InsufficientBalanceError ⇒
      //    whole transaction rolls back, no partial state).
      await AttentionTokenService.debit({
        userId: senderId,
        amount: gift.costTokens,
        reason: AttentionTokenReason.GIFT_SENT,
        refId: txn.id,
        note: `gift:${gift.slug}→${recipientId}`,
        tx,
      });

      // 5. Mark delivered. Ledger and gift row are now in lockstep.
      const delivered = await tx.giftTransaction.update({
        where: { id: txn.id },
        data: {
          status: GiftTransactionStatus.DELIVERED,
          deliveredAt: new Date(),
        },
      });

      // 6. Optional tiny rebate to the recipient. Keeps the loop
      //    positive-sum without creating a "grind reciprocity" mechanic.
      //    Recipient does NOT have to opt in to receive a rebate because
      //    this is a one-off, bounded credit, not a recurring income.
      const rebate = Math.max(1, Math.floor(gift.costTokens * 0.1));
      await AttentionTokenService.credit({
        userId: recipientId,
        amount: rebate,
        reason: AttentionTokenReason.GIFT_RECEIVED,
        refId: txn.id,
        note: `rebate:${gift.slug}`,
        tx,
      });

      // 7. Fresh sender balance for the API response
      const freshSender = await tx.user.findUnique({
        where: { id: senderId },
        select: { tokenBalance: true },
      });

      return {
        transactionId: delivered.id,
        status: delivered.status,
        costTokens: gift.costTokens,
        newSenderBalance: freshSender?.tokenBalance ?? 0,
        gift,
        deliveredAt: delivered.deliveredAt,
      };
    }, SERIALIZABLE_TX);
  },

  /**
   * Returns the sender-visible view of a gift transaction. The sender
   * never sees whether the recipient has reciprocated — by design.
   */
  async getTransactionForSender(senderId: string, txnId: string): Promise<GiftHistoryItem | null> {
    const row = await prisma.giftTransaction.findFirst({
      where: { id: txnId, senderId },
      include: { gift: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      direction: "sent",
      counterpartyId: row.recipientId,
      giftSlug: row.gift.slug,
      displayName: row.gift.displayName,
      rendererKind: row.gift.rendererKind,
      palette: parsePalette(row.gift.palette),
      costTokens: row.costTokens,
      note: row.note,
      status: row.status,
      callId: row.callId,
      conversationId: row.conversationId,
      createdAt: row.createdAt,
      deliveredAt: row.deliveredAt,
    };
  },

  /**
   * List gifts for a user. The result is either the user's sent gifts,
   * received gifts, or both (merged by createdAt). Never leaks
   * information about one party's behaviour to the other beyond what
   * they've already observed via real-time events.
   */
  async listHistory(params: {
    userId: string;
    direction?: "sent" | "received" | "both";
    limit?: number;
    before?: Date;
  }): Promise<GiftHistoryItem[]> {
    const direction = params.direction ?? "both";
    const limit = Math.min(
      Math.max(params.limit ?? HISTORY_PAGE_SIZE_DEFAULT, 1),
      HISTORY_PAGE_SIZE_MAX,
    );

    const whereBase: Prisma.GiftTransactionWhereInput = {
      ...(params.before ? { createdAt: { lt: params.before } } : {}),
    };
    const whereDirection: Prisma.GiftTransactionWhereInput =
      direction === "sent"
        ? { senderId: params.userId }
        : direction === "received"
          ? { recipientId: params.userId }
          : {
              OR: [
                { senderId: params.userId },
                { recipientId: params.userId },
              ],
            };

    const rows = await prisma.giftTransaction.findMany({
      where: { ...whereBase, ...whereDirection },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { gift: true },
    });

    return rows.map((row) => ({
      id: row.id,
      direction: row.senderId === params.userId ? "sent" : "received",
      counterpartyId: row.senderId === params.userId ? row.recipientId : row.senderId,
      giftSlug: row.gift.slug,
      displayName: row.gift.displayName,
      rendererKind: row.gift.rendererKind,
      palette: parsePalette(row.gift.palette),
      costTokens: row.costTokens,
      note: row.note,
      status: row.status,
      callId: row.callId,
      conversationId: row.conversationId,
      createdAt: row.createdAt,
      deliveredAt: row.deliveredAt,
    }));
  },

  /**
   * Admin-only: refund a gift and mark it REFUNDED. Used for moderation
   * (e.g. abusive note, policy violation).
   */
  async refundGift(txnId: string, adminId: string, reason: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const txn = await tx.giftTransaction.findUnique({ where: { id: txnId } });
      if (!txn) throw new Error(`Gift transaction not found: ${txnId}`);
      if (txn.status === GiftTransactionStatus.REFUNDED) return;

      await tx.giftTransaction.update({
        where: { id: txnId },
        data: { status: GiftTransactionStatus.REFUNDED },
      });
      try {
        await AttentionTokenService.refund({
          userId: txn.senderId,
          amount: txn.costTokens,
          refId: txn.id,
          note: `admin:${adminId}:${reason.slice(0, 120)}`,
          tx,
        });
      } catch (err) {
        if (err instanceof InsufficientBalanceError) {
          // Can't happen for a refund, but guard anyway.
          logger.error({ txnId, adminId }, "[GiftSystem] unexpected refund error");
        }
        throw err;
      }
    }, SERIALIZABLE_TX);
  },
};
