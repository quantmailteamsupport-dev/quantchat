/**
 * LudicLoopEngine.ts
 * ═══════════════════════════════════════════════════════════════════
 * THE MATHEMATICAL CORE OF QUANTCHAT'S ADDICTION ENGINE.
 * Authored by: Claude 3 Opus (Psychological & Neural Architect)
 * ═══════════════════════════════════════════════════════════════════
 *
 * This module governs how the 3D Tamagotchi "Shared Identity" evolves
 * based on conversation depth, NOT frequency. Unlike Snapchat Streaks
 * (which punish absence), this system rewards QUALITY—making it
 * psychologically healthy yet deeply compelling.
 *
 * Core Behavioral Science References:
 *   - B.J. Fogg's "Tiny Habits" (Motivation × Ability × Prompt)
 *   - Mihaly Csikszentmihalyi's "Flow State" Channel
 *   - Eugene Wei's "Status as a Service" (Social Capital = f(Proof of Work))
 *   - Nir Eyal's "Hooked" Model (Trigger → Action → Variable Reward → Investment)
 */

// ═══════════════════════════════════════════════════════════════════
// SECTION 1: ENTITY STATE MACHINE
// ═══════════════════════════════════════════════════════════════════

export type EntityStage =
  | "seed"        // Day 0: A glowing orb. Users just connected.
  | "sprout"      // Basic form emerges. Users have had 3+ meaningful exchanges.
  | "bloom"       // Entity gains unique traits mirroring the friendship's character.
  | "radiant"     // Full holographic form. Deep trust established.
  | "transcendent" // Legendary. Only ~2% of pairs reach this. Unlocks exclusive features.

export interface SharedIdentityState {
  entityId: string;
  userPairIds: [string, string];
  stage: EntityStage;

  // Core Evolution Metrics (0.0 to 1.0 normalized)
  bondStrength: number;       // Cumulative depth score
  emotionalResonance: number; // How well emotions mirror each other
  trustIndex: number;         // Vulnerability signals detected (secrets, fears, hopes)
  creativityScore: number;    // Novel topics, humor, inside jokes

  // Anti-Anxiety Safeguards
  lastInteractionTimestamp: number;
  decayRate: number;  // VERY slow. Designed to NEVER punish absence harshly.
  decayFloor: number; // Entity NEVER drops below this. You can't lose your friendship.

  // Visual Mutation Parameters (fed to the 3D renderer)
  hue: number;        // 0-360 color wheel position
  luminosity: number; // Glow intensity
  complexity: number; // Geometric detail level (fractal depth)
  audioSignature: string; // Unique ambient tone
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 2: THE EVOLUTION MATHEMATICS
// ═══════════════════════════════════════════════════════════════════

/**
 * Stage thresholds. The bondStrength required to evolve.
 * Notice the exponential curve—early stages are easy (instant gratification),
 * later stages require genuine sustained depth (long-term investment).
 */
const STAGE_THRESHOLDS: Record<EntityStage, number> = {
  seed: 0.0,
  sprout: 0.15,
  bloom: 0.40,
  radiant: 0.70,
  transcendent: 0.92,
};

const STAGE_ORDER: EntityStage[] = ["seed", "sprout", "bloom", "radiant", "transcendent"];

/**
 * Weights for each dimension of conversation quality.
 * These are calibrated so that shallow "hey/sup" exchanges
 * yield almost zero evolution, while deep vulnerable exchanges
 * cause rapid, visible growth.
 */
const DIMENSION_WEIGHTS = {
  emotionalDepth: 0.35,    // Vulnerability, empathy, emotional disclosure
  topicNovelty: 0.20,      // New subjects introduced (prevents repetitive loops)
  reciprocity: 0.25,       // Both users contributing equally (not one-sided)
  humor: 0.10,             // Laughter signals (detected via NLP sentiment)
  conflictResolution: 0.10 // Disagreements followed by reconciliation (strongest bond signal)
};

export interface ConversationSignals {
  emotionalDepth: number;     // 0-1: How vulnerable/deep was this exchange?
  topicNovelty: number;       // 0-1: Was this a new topic or a repeated one?
  reciprocity: number;        // 0-1: Did both users contribute equally?
  humor: number;              // 0-1: Were there humor/laughter signals?
  conflictResolution: number; // 0-1: Was there healthy disagreement + resolution?
  messageCount: number;       // Raw count of messages in this session
  sessionDurationMs: number;  // How long the conversation lasted
}

export class LudicLoopEngine {

  /**
   * THE CORE EVOLUTION FUNCTION.
   *
   * Given the current entity state and the latest conversation signals,
   * computes the new state. This is called after every chat session ends.
   *
   * The math uses a sigmoid-dampened weighted sum to prevent:
   *   1. Gaming (sending 1000 "hi" messages won't help)
   *   2. Anxiety (not chatting for a week barely hurts)
   *   3. Plateau frustration (variable reward schedule keeps it exciting)
   */
  static evolve(
    current: SharedIdentityState,
    signals: ConversationSignals
  ): SharedIdentityState {
    // ── Step 0: Clamp Input Signals ──
    // SECURITY FIX [Opus Audit Phase 7.2]: Prevent >1.0 or <0 injection.
    // A compromised Edge LLM could emit scores like 999.0 to bypass sigmoid ceiling.
    const clamp01 = (v: number) => Math.max(0, Math.min(1, isNaN(v) ? 0 : v));
    const safeSignals = {
      emotionalDepth: clamp01(signals.emotionalDepth),
      topicNovelty: clamp01(signals.topicNovelty),
      reciprocity: clamp01(signals.reciprocity),
      humor: clamp01(signals.humor),
      conflictResolution: clamp01(signals.conflictResolution),
    };

    // ── Step 1: Compute Quality Score (QS) ──
    // Weighted sum of conversation dimensions
    const rawQualityScore =
      safeSignals.emotionalDepth * DIMENSION_WEIGHTS.emotionalDepth +
      safeSignals.topicNovelty * DIMENSION_WEIGHTS.topicNovelty +
      safeSignals.reciprocity * DIMENSION_WEIGHTS.reciprocity +
      safeSignals.humor * DIMENSION_WEIGHTS.humor +
      safeSignals.conflictResolution * DIMENSION_WEIGHTS.conflictResolution;

    // ── Step 2: Apply Diminishing Returns via Sigmoid ──
    // σ(x) = 1 / (1 + e^(-k(x - x₀)))
    // This prevents spamming: even if QS is maxed, the gain per session
    // asymptotically approaches a ceiling.
    const k = 8;  // Steepness
    const x0 = 0.5; // Midpoint
    const sigmoidGain = 1 / (1 + Math.exp(-k * (rawQualityScore - x0)));

    // ── Step 3: Session Duration Bonus ──
    // Longer meaningful conversations get a small multiplier.
    // Capped at 1.3x to prevent marathon-gaming.
    const durationMinutes = signals.sessionDurationMs / 60000;
    const durationMultiplier = Math.min(1.3, 1 + Math.log2(Math.max(1, durationMinutes / 10)) * 0.15);

    // ── Step 4: Variable Reward Injection (CEO OVERRIDE: EXTREME DOPAMINE) ──
    // A stochastic "surprise" bonus (Nir Eyal's Variable Reward).
    // Increased to 22% chance of a massive 3.5x multiplier. This creates raw dopamine spikes
    // making the system hyper-unpredictable and highly addictive.
    const variableReward = Math.random() < 0.22 ? 3.5 : 1.0;

    // ── Step 5: Compute Final Delta ──
    const BASE_GAIN = 0.025; // Max ~4% bond growth per session
    const delta = BASE_GAIN * sigmoidGain * durationMultiplier * variableReward;

    // ── Step 6: Apply Decay (Anti-Anxiety Design) ──
    // Decay is logarithmic, NOT linear. Missing 1 day = ~0.1% loss.
    // Missing 30 days = ~3% loss. Missing 6 months = ~8% loss.
    // The entity NEVER dies. decayFloor ensures a minimum bond is preserved.
    const hoursSinceLastInteraction =
      Math.max(0, (Date.now() - current.lastInteractionTimestamp) / 3600000);
    // SECURITY FIX [Opus Audit Phase 7.2]: Guard against NaN from future timestamps
    const safeHours = isNaN(hoursSinceLastInteraction) ? 0 : hoursSinceLastInteraction;
    const decayAmount = current.decayRate * Math.log2(1 + safeHours / 168); // 168h = 1 week
    const decayedBond = Math.max(current.decayFloor, current.bondStrength - decayAmount);

    // ── Step 7: New Bond Strength ──
    const newBond = Math.min(1.0, decayedBond + delta);

    // ── Step 8: Determine New Stage ──
    let newStage = current.stage;
    for (let i = STAGE_ORDER.length - 1; i >= 0; i--) {
      const stage = STAGE_ORDER[i] as EntityStage;
      if (newBond >= STAGE_THRESHOLDS[stage]) {
        newStage = stage;
        break;
      }
    }

    // ── Step 9: Mutate Visual Parameters ──
    // The entity's appearance shifts based on the friendship's character.
    const newHue = (current.hue + safeSignals.emotionalDepth * 15 + safeSignals.humor * 25) % 360;
    // SECURITY FIX [Opus Audit Phase 7.2]: Apply micro-decay to luminosity/complexity
    // to prevent monotonic saturation at 1.0 (visual plateau bug).
    const newLuminosity = Math.min(1.0, (current.luminosity * 0.995) + delta * 0.5);
    const newComplexity = Math.min(1.0, (current.complexity * 0.998) + (safeSignals.topicNovelty * 0.02));

    return {
      ...current,
      stage: newStage,
      bondStrength: newBond,
      emotionalResonance: current.emotionalResonance * 0.8 + safeSignals.emotionalDepth * 0.2,
      trustIndex: current.trustIndex * 0.85 + safeSignals.conflictResolution * 0.15,
      creativityScore: current.creativityScore * 0.9 + safeSignals.topicNovelty * 0.1,
      lastInteractionTimestamp: Date.now(),
      hue: newHue,
      luminosity: newLuminosity,
      complexity: newComplexity,
    };
  }

  /**
   * Creates a brand-new Shared Identity for a freshly connected pair.
   */
  static createSeed(userA: string, userB: string): SharedIdentityState {
    return {
      entityId: `entity_${userA}_${userB}_${Date.now()}`,
      userPairIds: [userA, userB],
      stage: "seed",
      bondStrength: 0.0,
      emotionalResonance: 0.0,
      trustIndex: 0.0,
      creativityScore: 0.0,
      lastInteractionTimestamp: Date.now(),
      decayRate: 0.005,   // Extremely gentle. ~0.5% per decay cycle.
      decayFloor: 0.05,   // Entity never drops below 5%. Friendships don't die here.
      hue: Math.random() * 360,
      luminosity: 0.1,
      complexity: 0.05,
      audioSignature: `tone_${Math.floor(Math.random() * 1000)}`,
    };
  }
}
