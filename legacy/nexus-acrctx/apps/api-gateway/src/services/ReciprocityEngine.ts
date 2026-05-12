import { prisma } from "@repo/database";
import { GiftTransactionStatus } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════
// ReciprocityEngine — ETHICS-FIRST REWRITE
// ═══════════════════════════════════════════════════════════════
//
// Issue #37 described a "reciprocity pressure" engine that sent the
// SENDER a "gift not returned 😢" message if the recipient didn't
// reciprocate within 24h, plus a friend-attention leaderboard and
// silent "someone viewed your profile" pings.
//
// Those are regulated dark patterns:
//   * EU DSA Art. 25 (deceptive/nudging interface designs)
//   * FTC policy on "dark patterns" (Sep 2022 staff report)
//   * California SB-976 / UK Age-Appropriate Design Code
//
// Accordingly this engine does NOT implement any sender-facing
// shaming signal, friend leaderboard, or silent profile-view ping.
// What it DOES provide:
//
//   1. Thank-you suggestions for the RECIPIENT ONLY, and only if
//      they've opted in (GiftPreferences.thankYouSuggestions === true).
//      The suggestion is a plain nudge shown to the recipient's own
//      client. It is never echoed back to the sender.
//
//   2. A neutral "call-streak" counter the user can optionally surface
//      in their own profile. No "don't break it" framing. No
//      notifications when a streak ends. The counter simply reports
//      the current run-length; breaking it is a zero-event.
//
//   3. Mutual-engagement insights shown only to the user about their
//      OWN pattern of sending/receiving gifts, so they can self-
//      reflect — not to rank friends against each other.
//
// Every public method below requires an explicit userId whose data is
// being read, and returns data only about that user. There is no
// cross-user leaderboard or "who views your profile" surface.
//
// ═══════════════════════════════════════════════════════════════

const STREAK_GAP_DAYS = 1; // any day without a call breaks the streak
const MAX_RECENT_GIFTS = 20;
const THANK_YOU_WINDOW_DAYS = 7;

export interface ThankYouSuggestion {
  suggestionId: string;        // stable id = the received gift txn id
  fromUserId: string;
  giftSlug: string;
  giftDisplayName: string;
  receivedAt: Date;
  // Suggested gift slugs the recipient could send back, by their own cost,
  // excluding anything more expensive than what they received (to avoid
  // accidental over-spending pressure). Purely a convenience pre-filter;
  // the user still picks whatever they want — or nothing.
  suggestedReplySlugs: string[];
}

export interface SelfEngagementSummary {
  userId: string;
  giftsSentLast30Days: number;
  giftsReceivedLast30Days: number;
  // How many days in the last 30 had at least one outgoing call minute,
  // computed from the user's OWN CallMinuteLog rows only.
  activeCallDaysLast30: number;
  currentCallStreakDays: number;
  // Honest self-reflection field: tokens spent over the last 30 days.
  // Helps the user notice their own spend patterns. Mirrors consumer-
  // finance "mindful spending" UX, not growth-hacking.
  tokensSpentLast30Days: number;
}

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.floor(ms / (24 * 3600_000));
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export const ReciprocityEngine = {
  /**
   * Returns up to N pending thank-you suggestions for the given user.
   * Empty if the user has not opted in to thank-you suggestions.
   * Never called on behalf of the sender.
   */
  async getThankYouSuggestionsForRecipient(userId: string): Promise<ThankYouSuggestion[]> {
    const prefs = await prisma.giftPreferences.findUnique({
      where: { userId },
      select: { thankYouSuggestions: true },
    });
    if (!prefs?.thankYouSuggestions) return [];

    const windowStart = new Date(Date.now() - THANK_YOU_WINDOW_DAYS * 24 * 3600_000);

    const recent = await prisma.giftTransaction.findMany({
      where: {
        recipientId: userId,
        status: GiftTransactionStatus.DELIVERED,
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_RECENT_GIFTS,
      include: { gift: true },
    });
    if (recent.length === 0) return [];

    // Build the set of senders the user has ALREADY replied to inside
    // the same window — we suppress suggestions for those to avoid
    // pestering a user who's already responded.
    const senders = Array.from(new Set(recent.map((r) => r.senderId)));
    const outgoing = await prisma.giftTransaction.findMany({
      where: {
        senderId: userId,
        recipientId: { in: senders },
        status: GiftTransactionStatus.DELIVERED,
        createdAt: { gte: windowStart },
      },
      select: { recipientId: true, createdAt: true },
    });
    const repliedTo = new Map<string, Date>();
    for (const o of outgoing) {
      const existing = repliedTo.get(o.recipientId);
      if (!existing || o.createdAt > existing) repliedTo.set(o.recipientId, o.createdAt);
    }

    const cheaperGifts = await prisma.gift.findMany({
      where: { isActive: true },
      orderBy: { costTokens: "asc" },
      select: { slug: true, costTokens: true },
    });

    const suggestions: ThankYouSuggestion[] = [];
    for (const r of recent) {
      const replyAfter = repliedTo.get(r.senderId);
      if (replyAfter && replyAfter >= r.createdAt) continue; // already thanked
      const suggestedReplySlugs = cheaperGifts
        .filter((g) => g.costTokens <= r.costTokens)
        .slice(0, 3)
        .map((g) => g.slug);
      suggestions.push({
        suggestionId: r.id,
        fromUserId: r.senderId,
        giftSlug: r.gift.slug,
        giftDisplayName: r.gift.displayName,
        receivedAt: r.createdAt,
        suggestedReplySlugs,
      });
      if (suggestions.length >= 5) break;
    }
    return suggestions;
  },

  /**
   * Neutral call-streak length for a single user. Opt-in — returns 0
   * if the user hasn't chosen to display a streak counter.
   *
   * We deliberately compute this on read from the CallMinuteLog table
   * rather than maintaining a cached counter, so there is no server-
   * side event that fires when the streak "breaks." A broken streak is
   * simply the counter reading a lower number next time it's viewed.
   */
  async getCallStreak(userId: string): Promise<number> {
    const prefs = await prisma.giftPreferences.findUnique({
      where: { userId },
      select: { showCallStreakCounter: true },
    });
    if (!prefs?.showCallStreakCounter) return 0;

    // Look back up to 60 days; beyond that we just report 60+.
    const horizon = new Date(Date.now() - 60 * 24 * 3600_000);
    const rows = await prisma.callMinuteLog.findMany({
      where: { userId, createdAt: { gte: horizon } },
      select: { createdAt: true },
    });
    if (rows.length === 0) return 0;

    const activeDays = new Set<string>();
    for (const r of rows) {
      activeDays.add(startOfUtcDay(r.createdAt).toISOString());
    }

    let streak = 0;
    const today = startOfUtcDay(new Date());
    for (let i = 0; i < 60; i++) {
      const d = new Date(today.getTime() - i * 24 * 3600_000);
      if (activeDays.has(d.toISOString())) {
        streak++;
      } else if (i === 0) {
        // No call today yet — don't count today as a breaker; users
        // shouldn't feel pressure to call before bed to "save" a
        // streak. The streak only breaks when a *previous* day has no
        // activity.
        continue;
      } else {
        // Genuine gap on a previous day — streak ends here.
        break;
      }
    }
    return streak;
  },

  /**
   * Returns the user's view of their own engagement. Accessible only
   * to the user themselves; never used to rank users against each
   * other. No "most attentive friend" surface is exposed.
   */
  async getSelfEngagementSummary(userId: string): Promise<SelfEngagementSummary> {
    const since = new Date(Date.now() - 30 * 24 * 3600_000);
    const [sent, received, minutes, spendAgg, streak] = await Promise.all([
      prisma.giftTransaction.count({
        where: {
          senderId: userId,
          status: GiftTransactionStatus.DELIVERED,
          createdAt: { gte: since },
        },
      }),
      prisma.giftTransaction.count({
        where: {
          recipientId: userId,
          status: GiftTransactionStatus.DELIVERED,
          createdAt: { gte: since },
        },
      }),
      prisma.callMinuteLog.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      prisma.attentionTokenLedger.aggregate({
        where: {
          userId,
          createdAt: { gte: since },
          delta: { lt: 0 },
        },
        _sum: { delta: true },
      }),
      ReciprocityEngine.getCallStreak(userId),
    ]);

    const activeCallDays = new Set<string>();
    for (const m of minutes) {
      activeCallDays.add(startOfUtcDay(m.createdAt).toISOString());
    }

    return {
      userId,
      giftsSentLast30Days: sent,
      giftsReceivedLast30Days: received,
      activeCallDaysLast30: activeCallDays.size,
      currentCallStreakDays: streak,
      tokensSpentLast30Days: Math.abs(spendAgg._sum.delta ?? 0),
    };
  },

  /**
   * INTENTIONALLY NOT IMPLEMENTED (see file header):
   *
   *   getGiftNotReturnedSignalForSender()   — would shame the sender
   *   getFriendAttentionLeaderboard()       — would gamify friendships
   *   getSilentProfileViewPings()           — would weaponise curiosity
   *
   * If a future issue tries to re-add these, it should be reviewed
   * against the regulatory framework referenced at the top of this
   * file before any code lands.
   */
};
