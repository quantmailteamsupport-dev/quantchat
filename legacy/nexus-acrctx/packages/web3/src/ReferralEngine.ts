/**
 * ReferralEngine.ts
 * ═══════════════════════════════════════════════════════════════════
 * VIRAL PSYCHOLOGICAL REFERRAL LOOP — "Status as a Service" Model
 * ═══════════════════════════════════════════════════════════════════
 *
 * Implements a referral system where users earn Social Token Badges
 * by inviting active nodes into the Quantchat network. Badge tiers
 * grant visible social status, creating a self-reinforcing loop:
 *
 *   Invite → Friend becomes active → Badge upgrade → Status signal
 *   → Others see badge → Motivated to invite → Repeat
 *
 * Behavioral Science Foundations:
 *   - Eugene Wei's "Status as a Service" (Social Capital = f(Proof of Work))
 *   - Nir Eyal's "Hooked" Model (Trigger → Action → Variable Reward → Investment)
 *   - Network Effects (Metcalfe's Law: value ∝ n² of active nodes)
 */

import { randomUUID } from "crypto";

// ═══════════════════════════════════════════════════════════════════
// SECTION 1: BADGE TIER SYSTEM
// ═══════════════════════════════════════════════════════════════════

/**
 * Social Token Badge tiers ordered by prestige.
 * Higher tiers are scarcer and more visible, driving aspiration.
 */
export type BadgeTier =
  | "spark"       // Entry level — everyone starts here
  | "connector"   // 3+ active referrals — first status signal
  | "influencer"  // 10+ active referrals — visible network builder
  | "architect"   // 25+ active referrals + depth ≥2 — community leader
  | "oracle";     // 50+ active referrals + depth ≥3 — top ~1%, legendary

const BADGE_ORDER: BadgeTier[] = ["spark", "connector", "influencer", "architect", "oracle"];

/**
 * Thresholds for each badge tier.
 * `minActive`: minimum active direct+indirect referrals.
 * `minDepth`:  minimum referral tree depth (cascading invites).
 */
const BADGE_THRESHOLDS: Record<BadgeTier, { minActive: number; minDepth: number }> = {
  spark:      { minActive: 0,  minDepth: 0 },
  connector:  { minActive: 3,  minDepth: 0 },
  influencer: { minActive: 10, minDepth: 1 },
  architect:  { minActive: 25, minDepth: 2 },
  oracle:     { minActive: 50, minDepth: 3 },
};

/** Base token reward per badge tier upgrade. */
const BADGE_REWARDS: Record<BadgeTier, number> = {
  spark: 0,
  connector: 50,
  influencer: 200,
  architect: 750,
  oracle: 2500,
};

// ═══════════════════════════════════════════════════════════════════
// SECTION 2: DATA TYPES
// ═══════════════════════════════════════════════════════════════════

export interface ReferralNode {
  userId: string;
  referredBy: string | null;
  joinedAt: number;
  lastActiveAt: number;
  isActive: boolean;
}

export interface ReferralState {
  userId: string;
  badge: BadgeTier;
  totalTokensEarned: number;
  directReferrals: string[];
  activeDirectReferrals: number;
  networkSize: number;
  networkDepth: number;
  lastReferralAt: number;
}

export interface BadgeReward {
  previousBadge: BadgeTier;
  newBadge: BadgeTier;
  tokensAwarded: number;
  networkSize: number;
  networkDepth: number;
  txHash: string;
}

export interface ReferralResult {
  referrerState: ReferralState;
  reward: BadgeReward | null;
  cascadeRewards: Array<{ userId: string; tokens: number; txHash: string }>;
}

/** Simulated smart contract latency in ms (placeholder until on-chain integration). */
const MOCK_CONTRACT_DELAY_MS = 300;

// ═══════════════════════════════════════════════════════════════════
// SECTION 3: THE REFERRAL ENGINE
// ═══════════════════════════════════════════════════════════════════

export class ReferralEngine {
  /**
   * Activity threshold in hours. A referred user must have been
   * active within this window to count as an "active node".
   */
  static readonly ACTIVE_THRESHOLD_HOURS = 72;

  /**
   * Maximum referral tree depth for cascade rewards.
   * Prevents unbounded recursion while still incentivizing
   * multi-level network growth.
   */
  static readonly MAX_CASCADE_DEPTH = 5;

  /**
   * Decay factor per cascade level. Each level deeper in the
   * referral tree yields diminishing (but non-zero) rewards.
   * Level 1: 100%, Level 2: 40%, Level 3: 16%, Level 4: 6.4%, Level 5: 2.56%
   */
  static readonly CASCADE_DECAY = 0.4;

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Initializes a new referral state for a user with no referrals.
   */
  static initializeReferrer(userId: string): ReferralState {
    return {
      userId,
      badge: "spark",
      totalTokensEarned: 0,
      directReferrals: [],
      activeDirectReferrals: 0,
      networkSize: 0,
      networkDepth: 0,
      lastReferralAt: 0,
    };
  }

  /**
   * Generates a unique referral link for the user.
   */
  static generateReferralLink(userId: string): string {
    return `https://nexus.quantchat.com/join?ref=${encodeURIComponent(userId)}`;
  }

  /**
   * THE CORE REFERRAL PROCESSING FUNCTION.
   *
   * Called when a referred user becomes active. Evaluates the
   * referrer's network, computes badge progression, awards tokens,
   * and propagates cascade rewards up the referral tree.
   *
   * @param referrerState   Current state of the inviting user.
   * @param newActiveUserId The user ID that just became active.
   * @param networkNodes    All nodes in the referrer's network (for depth calculation).
   * @param ancestorChain   Chain of referrers above this referrer (for cascade rewards).
   * @returns Updated referrer state and any rewards earned.
   */
  static async processReferral(
    referrerState: ReferralState,
    newActiveUserId: string,
    networkNodes: ReferralNode[],
    ancestorChain: string[] = []
  ): Promise<ReferralResult> {
    // ── Step 1: Register the new referral ──
    const updatedDirectReferrals = referrerState.directReferrals.includes(newActiveUserId)
      ? referrerState.directReferrals
      : [...referrerState.directReferrals, newActiveUserId];

    // ── Step 2: Count active nodes in the network ──
    const now = Date.now();
    const activeThresholdMs = ReferralEngine.ACTIVE_THRESHOLD_HOURS * 3600000;
    const activeNodes = networkNodes.filter(
      (node) => node.isActive && (now - node.lastActiveAt) < activeThresholdMs
    );
    const activeDirectCount = updatedDirectReferrals.filter((uid) =>
      activeNodes.some((n) => n.userId === uid)
    ).length;

    // ── Step 3: Compute network depth ──
    const depth = ReferralEngine.computeNetworkDepth(referrerState.userId, networkNodes);

    // ── Step 4: Determine badge tier ──
    const previousBadge = referrerState.badge;
    const newBadge = ReferralEngine.calculateBadgeTier(activeNodes.length, depth);

    // ── Step 5: Compute reward if badge upgraded ──
    let reward: BadgeReward | null = null;
    let tokensDelta = 0;
    if (ReferralEngine.badgeRank(newBadge) > ReferralEngine.badgeRank(previousBadge)) {
      tokensDelta = ReferralEngine.computeUpgradeReward(newBadge, activeNodes.length);

      console.log(
        `[ReferralEngine] 🏅 Badge upgrade: ${previousBadge} → ${newBadge} ` +
        `for user ${referrerState.userId}. Awarding ${tokensDelta} StaaS tokens.`
      );

      // Simulate smart contract mint
      await new Promise((resolve) => setTimeout(resolve, MOCK_CONTRACT_DELAY_MS));

      reward = {
        previousBadge,
        newBadge,
        tokensAwarded: tokensDelta,
        networkSize: activeNodes.length,
        networkDepth: depth,
        txHash: `0x${randomUUID().replace(/-/g, "")}`,
      };
    }

    // ── Step 6: Cascade rewards up the ancestor chain ──
    const cascadeRewards = await ReferralEngine.propagateCascadeRewards(
      ancestorChain,
      BADGE_REWARDS.connector // Base amount for cascade calculation
    );

    // ── Step 7: Assemble updated state ──
    const updatedState: ReferralState = {
      ...referrerState,
      badge: newBadge,
      totalTokensEarned: referrerState.totalTokensEarned + tokensDelta,
      directReferrals: updatedDirectReferrals,
      activeDirectReferrals: activeDirectCount,
      networkSize: activeNodes.length,
      networkDepth: depth,
      lastReferralAt: now,
    };

    return { referrerState: updatedState, reward, cascadeRewards };
  }

  // ── Badge Calculation ───────────────────────────────────────────

  /**
   * Determines the highest badge tier a user qualifies for
   * based on their active network size and depth.
   */
  static calculateBadgeTier(activeCount: number, depth: number): BadgeTier {
    let bestBadge: BadgeTier = "spark";
    for (const tier of BADGE_ORDER) {
      const threshold = BADGE_THRESHOLDS[tier];
      if (threshold && activeCount >= threshold.minActive && depth >= threshold.minDepth) {
        bestBadge = tier;
      }
    }
    return bestBadge;
  }

  // ── Internal Helpers ────────────────────────────────────────────

  /**
   * Computes token reward for a badge upgrade.
   * Applies a network-size multiplier that rewards larger networks
   * with a logarithmic bonus (prevents linear gaming while still
   * incentivizing growth).
   */
  static computeUpgradeReward(badge: BadgeTier, networkSize: number): number {
    const baseReward = BADGE_REWARDS[badge] ?? 0;
    // Logarithmic bonus: log₂(networkSize + 1) provides diminishing returns
    const networkBonus = Math.log2(Math.max(1, networkSize) + 1);
    return Math.round(baseReward * networkBonus);
  }

  /**
   * Computes the maximum depth of the referral tree rooted at userId.
   * Uses iterative BFS to avoid stack overflow on deep trees.
   */
  static computeNetworkDepth(userId: string, nodes: ReferralNode[]): number {
    let currentLevel = [userId];
    let depth = 0;
    const visited = new Set<string>([userId]);

    while (currentLevel.length > 0) {
      const nextLevel: string[] = [];
      for (const uid of currentLevel) {
        for (const node of nodes) {
          if (node.referredBy === uid && !visited.has(node.userId)) {
            visited.add(node.userId);
            nextLevel.push(node.userId);
          }
        }
      }
      if (nextLevel.length > 0) {
        depth++;
      }
      currentLevel = nextLevel;
    }

    return depth;
  }

  /**
   * Propagates diminishing cascade rewards up the ancestor chain.
   * Each ancestor receives a decaying fraction of the base reward,
   * creating a viral incentive for deep referral trees.
   */
  static async propagateCascadeRewards(
    ancestorChain: string[],
    baseAmount: number
  ): Promise<Array<{ userId: string; tokens: number; txHash: string }>> {
    const rewards: Array<{ userId: string; tokens: number; txHash: string }> = [];
    const maxDepth = Math.min(ancestorChain.length, ReferralEngine.MAX_CASCADE_DEPTH);

    for (let i = 0; i < maxDepth; i++) {
      const ancestor = ancestorChain[i];
      if (!ancestor) break;

      const decayedAmount = Math.round(baseAmount * Math.pow(ReferralEngine.CASCADE_DECAY, i + 1));
      if (decayedAmount <= 0) break;

      console.log(
        `[ReferralEngine] 🔗 Cascade reward: ${decayedAmount} tokens to ancestor ${ancestor} (depth ${i + 1})`
      );

      // Simulate smart contract mint
      await new Promise((resolve) => setTimeout(resolve, MOCK_CONTRACT_DELAY_MS));

      rewards.push({
        userId: ancestor,
        tokens: decayedAmount,
        txHash: `0x${randomUUID().replace(/-/g, "")}`,
      });
    }

    return rewards;
  }

  /**
   * Returns the numeric rank of a badge tier for comparison.
   */
  static badgeRank(badge: BadgeTier): number {
    const index = BADGE_ORDER.indexOf(badge);
    return index >= 0 ? index : 0;
  }

  /**
   * Checks whether a node qualifies as "active" within the threshold.
   */
  static isNodeActive(node: ReferralNode): boolean {
    if (!node.isActive) return false;
    const hoursSinceActive = (Date.now() - node.lastActiveAt) / 3600000;
    return hoursSinceActive < ReferralEngine.ACTIVE_THRESHOLD_HOURS;
  }
}
