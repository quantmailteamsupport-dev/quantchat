// __tests__/ReferralEngine.test.ts
import { ReferralEngine, ReferralNode, ReferralState, BadgeTier } from "../ReferralEngine";

// Suppress console output during tests
jest.spyOn(console, "log").mockImplementation(() => {});

// ── Helpers ──────────────────────────────────────────────────────

function makeNode(
  userId: string,
  referredBy: string | null,
  isActive = true,
  lastActiveAt = Date.now()
): ReferralNode {
  return { userId, referredBy, joinedAt: Date.now() - 86400000, lastActiveAt, isActive };
}

function makeState(overrides: Partial<ReferralState> = {}): ReferralState {
  return {
    userId: "referrer1",
    badge: "spark",
    totalTokensEarned: 0,
    directReferrals: [],
    activeDirectReferrals: 0,
    networkSize: 0,
    networkDepth: 0,
    lastReferralAt: 0,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════

describe("ReferralEngine", () => {
  describe("initializeReferrer", () => {
    it("should create a fresh state with spark badge and zero metrics", () => {
      const state = ReferralEngine.initializeReferrer("user_abc");
      expect(state.userId).toBe("user_abc");
      expect(state.badge).toBe("spark");
      expect(state.totalTokensEarned).toBe(0);
      expect(state.directReferrals).toEqual([]);
      expect(state.networkSize).toBe(0);
    });
  });

  describe("generateReferralLink", () => {
    it("should produce a valid link containing the user ID", () => {
      const link = ReferralEngine.generateReferralLink("user_123");
      expect(link).toContain("ref=user_123");
      expect(link).toMatch(/^https:\/\/nexus\.quantchat\.com\/join\?ref=/);
    });

    it("should encode special characters in user IDs", () => {
      const link = ReferralEngine.generateReferralLink("user with spaces");
      expect(link).toContain("ref=user%20with%20spaces");
    });
  });

  describe("calculateBadgeTier", () => {
    it.each<[number, number, BadgeTier]>([
      [0, 0, "spark"],
      [2, 0, "spark"],
      [3, 0, "connector"],
      [9, 1, "connector"],
      [10, 1, "influencer"],
      [25, 2, "architect"],
      [50, 3, "oracle"],
      [100, 5, "oracle"],
    ])("activeCount=%i depth=%i → badge=%s", (activeCount, depth, expected) => {
      expect(ReferralEngine.calculateBadgeTier(activeCount, depth)).toBe(expected);
    });

    it("should require both activeCount AND depth for higher tiers", () => {
      // 50 active but depth 0 → only connector (depth not met for higher)
      expect(ReferralEngine.calculateBadgeTier(50, 0)).toBe("connector");
      // 50 active but depth 1 → influencer
      expect(ReferralEngine.calculateBadgeTier(50, 1)).toBe("influencer");
    });
  });

  describe("computeUpgradeReward", () => {
    it("should return 0 for spark tier", () => {
      expect(ReferralEngine.computeUpgradeReward("spark", 10)).toBe(0);
    });

    it("should scale reward logarithmically with network size", () => {
      const small = ReferralEngine.computeUpgradeReward("connector", 3);
      const large = ReferralEngine.computeUpgradeReward("connector", 50);
      expect(large).toBeGreaterThan(small);
      // Logarithmic growth: large should not be linearly proportional
      expect(large).toBeLessThan(small * (50 / 3));
    });
  });

  describe("computeNetworkDepth", () => {
    it("should return 0 for a user with no referrals", () => {
      const nodes = [makeNode("root", null)];
      expect(ReferralEngine.computeNetworkDepth("root", nodes)).toBe(0);
    });

    it("should compute depth 1 for direct referrals only", () => {
      const nodes = [
        makeNode("root", null),
        makeNode("child1", "root"),
        makeNode("child2", "root"),
      ];
      expect(ReferralEngine.computeNetworkDepth("root", nodes)).toBe(1);
    });

    it("should compute depth across multiple levels", () => {
      const nodes = [
        makeNode("root", null),
        makeNode("lvl1", "root"),
        makeNode("lvl2", "lvl1"),
        makeNode("lvl3", "lvl2"),
      ];
      expect(ReferralEngine.computeNetworkDepth("root", nodes)).toBe(3);
    });

    it("should handle branching trees", () => {
      const nodes = [
        makeNode("root", null),
        makeNode("a1", "root"),
        makeNode("a2", "root"),
        makeNode("b1", "a1"),
        makeNode("b2", "a1"),
        makeNode("c1", "b1"),
      ];
      expect(ReferralEngine.computeNetworkDepth("root", nodes)).toBe(3);
    });
  });

  describe("propagateCascadeRewards", () => {
    it("should return empty array for empty ancestor chain", async () => {
      const rewards = await ReferralEngine.propagateCascadeRewards([], 100);
      expect(rewards).toEqual([]);
    });

    it("should apply decaying rewards to ancestors", async () => {
      const rewards = await ReferralEngine.propagateCascadeRewards(
        ["ancestor1", "ancestor2", "ancestor3"],
        100
      );
      expect(rewards).toHaveLength(3);
      // Decay: 40, 16, 6
      expect(rewards[0]!.tokens).toBe(40);
      expect(rewards[1]!.tokens).toBe(16);
      expect(rewards[2]!.tokens).toBe(6);
    });

    it("should respect MAX_CASCADE_DEPTH limit", async () => {
      const ancestors = Array.from({ length: 10 }, (_, i) => `anc_${i}`);
      const rewards = await ReferralEngine.propagateCascadeRewards(ancestors, 100);
      expect(rewards.length).toBeLessThanOrEqual(ReferralEngine.MAX_CASCADE_DEPTH);
    });

    it("should stop when decayed amount reaches zero", async () => {
      const rewards = await ReferralEngine.propagateCascadeRewards(
        ["a", "b", "c", "d", "e"],
        5 // Small base: 2, 0 → stops after 2
      );
      expect(rewards.length).toBeLessThanOrEqual(3);
      for (const r of rewards) {
        expect(r.tokens).toBeGreaterThan(0);
      }
    });
  });

  describe("badgeRank", () => {
    it("should return ascending ranks for badge tiers", () => {
      expect(ReferralEngine.badgeRank("spark")).toBeLessThan(ReferralEngine.badgeRank("connector"));
      expect(ReferralEngine.badgeRank("connector")).toBeLessThan(ReferralEngine.badgeRank("influencer"));
      expect(ReferralEngine.badgeRank("influencer")).toBeLessThan(ReferralEngine.badgeRank("architect"));
      expect(ReferralEngine.badgeRank("architect")).toBeLessThan(ReferralEngine.badgeRank("oracle"));
    });
  });

  describe("isNodeActive", () => {
    it("should return true for recently active nodes", () => {
      const node = makeNode("u1", null, true, Date.now() - 3600000); // 1 hour ago
      expect(ReferralEngine.isNodeActive(node)).toBe(true);
    });

    it("should return false for inactive nodes", () => {
      const node = makeNode("u1", null, false, Date.now());
      expect(ReferralEngine.isNodeActive(node)).toBe(false);
    });

    it("should return false for nodes active beyond threshold", () => {
      const beyondThreshold = ReferralEngine.ACTIVE_THRESHOLD_HOURS * 3600000 + 1;
      const node = makeNode("u1", null, true, Date.now() - beyondThreshold);
      expect(ReferralEngine.isNodeActive(node)).toBe(false);
    });
  });

  describe("processReferral", () => {
    it("should add new user to direct referrals", async () => {
      const state = makeState();
      const nodes = [makeNode("new_user", "referrer1")];
      const result = await ReferralEngine.processReferral(state, "new_user", nodes);

      expect(result.referrerState.directReferrals).toContain("new_user");
    });

    it("should not duplicate existing referrals", async () => {
      const state = makeState({ directReferrals: ["existing_user"] });
      const nodes = [makeNode("existing_user", "referrer1")];
      const result = await ReferralEngine.processReferral(state, "existing_user", nodes);

      const count = result.referrerState.directReferrals.filter((r) => r === "existing_user").length;
      expect(count).toBe(1);
    });

    it("should upgrade badge when thresholds are met", async () => {
      const state = makeState({ directReferrals: ["u1", "u2"] });
      const nodes = [
        makeNode("u1", "referrer1"),
        makeNode("u2", "referrer1"),
        makeNode("u3", "referrer1"),
      ];
      const result = await ReferralEngine.processReferral(state, "u3", nodes);

      expect(result.referrerState.badge).toBe("connector");
      expect(result.reward).not.toBeNull();
      expect(result.reward!.previousBadge).toBe("spark");
      expect(result.reward!.newBadge).toBe("connector");
      expect(result.reward!.tokensAwarded).toBeGreaterThan(0);
    });

    it("should not award tokens when badge does not change", async () => {
      const state = makeState({ badge: "connector", directReferrals: ["u1", "u2", "u3"] });
      const nodes = [
        makeNode("u1", "referrer1"),
        makeNode("u2", "referrer1"),
        makeNode("u3", "referrer1"),
        makeNode("u4", "referrer1"),
      ];
      const result = await ReferralEngine.processReferral(state, "u4", nodes);

      expect(result.referrerState.badge).toBe("connector");
      expect(result.reward).toBeNull();
    });

    it("should propagate cascade rewards to ancestors", async () => {
      const state = makeState();
      const nodes = [makeNode("new_user", "referrer1")];
      const ancestors = ["grandparent", "great_grandparent"];
      const result = await ReferralEngine.processReferral(state, "new_user", nodes, ancestors);

      expect(result.cascadeRewards.length).toBeGreaterThan(0);
      expect(result.cascadeRewards[0]!.userId).toBe("grandparent");
    });

    it("should update network metrics correctly", async () => {
      const state = makeState();
      const now = Date.now();
      const nodes = [
        makeNode("u1", "referrer1", true, now),
        makeNode("u2", "referrer1", true, now),
        makeNode("u3", "u1", true, now), // Indirect referral (depth 2)
      ];
      const result = await ReferralEngine.processReferral(state, "u1", nodes);

      expect(result.referrerState.networkSize).toBe(3);
      expect(result.referrerState.networkDepth).toBe(2);
      expect(result.referrerState.lastReferralAt).toBeGreaterThan(0);
    });

    it("should not count inactive nodes toward badge progression", async () => {
      const state = makeState();
      const staleTime = Date.now() - (ReferralEngine.ACTIVE_THRESHOLD_HOURS + 1) * 3600000;
      const nodes = [
        makeNode("u1", "referrer1", false, Date.now()),
        makeNode("u2", "referrer1", true, staleTime),
        makeNode("u3", "referrer1", true, Date.now()),
      ];
      const result = await ReferralEngine.processReferral(state, "u3", nodes);

      // Only 1 node is truly active (u3), so badge stays spark
      expect(result.referrerState.badge).toBe("spark");
      expect(result.referrerState.activeDirectReferrals).toBeLessThanOrEqual(1);
    });
  });
});
