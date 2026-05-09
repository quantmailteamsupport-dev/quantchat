/**
 * AttentionDecayMath.ts
 * ═══════════════════════════════════════════════════════════════════
 * THE TEMPORAL ECHO ALGORITHM
 * Authored by: Claude 3 Opus (Psychological & Neural Architect)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Traditional "Stories" blindly delete after 24 hours. This is boring.
 * Project Nexus introduces "Temporal Echoes": Posts that feed on Attention.
 *
 * Algorithm Definition:
 * 1. Base TTL = 12 hours.
 * 2. Every full view (dwell time > 3s) = +30 minutes (Attention Reward).
 * 3. Every skip (dwell time < 1s) = -15 minutes (Algorithm Punishment).
 * 4. Maximum TTL = 48 hours (to prevent eternal pinning).
 *
 * Heat (Visual Aura):
 * Calculated as (Current Views / Expected Views for this Time elapsed).
 * If Heat > 1.5, the Echo glows intensely (viral).
 */

export interface EchoMetrics {
  currentTTLHours: number;
  heatRatio: number; // For Sonnet to render the UI aura
  cssGlowHex: string;
}

const BASE_TTL_HOURS = 12;
const MAX_TTL_HOURS = 48;
const MIN_TTL_HOURS = 1;

export class TemporalPhysics {
  /**
   * Calculates the remaining lifespan and visual intensity of an Echo.
   * 
   * @param postedAt - ISO Date string of original post
   * @param totalViews - Number of unique views (dwell > 3s)
   * @param totalSkips - Number of immediate swipe-aways (dwell < 1s)
   * @param baselineFollowers - Expected audience size
   */
  static calculateDecayAndHeat(
    postedAt: string, 
    totalViews: number, 
    totalSkips: number, 
    baselineFollowers: number = 100
  ): EchoMetrics {
    const postTime = new Date(postedAt).getTime();
    const now = Date.now();
    const hoursElapsed = (now - postTime) / (1000 * 60 * 60);

    // 1. Calculate the dynamic TTL based on Engagement
    const viewBonusHours = totalViews * 0.5; // +30 mins per view
    const skipPenaltyHours = totalSkips * 0.25; // -15 mins per skip
    
    let dynamicTTL = BASE_TTL_HOURS + viewBonusHours - skipPenaltyHours;
    dynamicTTL = Math.max(MIN_TTL_HOURS, Math.min(MAX_TTL_HOURS, dynamicTTL));

    // 2. Calculate Heat (Viral Coefficient)
    // Expected views follows a logarithmic curve over time
    const expectedViews = baselineFollowers * Math.log10(hoursElapsed + 1.5);
    const heatRatio = expectedViews > 0 ? totalViews / expectedViews : 0;

    // 3. Map Heat to CSS Aura
    let cssGlowHex = "#ffffff"; // Default dim white
    if (heatRatio > 2.0) {
      cssGlowHex = "#fbbf24"; // Super-viral Golden
    } else if (heatRatio > 1.2) {
      cssGlowHex = "#00f3ff"; // Viral Neon/Blue
    } else if (heatRatio < 0.5 && hoursElapsed > 2) {
      cssGlowHex = "#333333"; // Dying Dark/Grey (Ignored post)
    }

    return {
      currentTTLHours: dynamicTTL,
      heatRatio,
      cssGlowHex
    };
  }

  /**
   * Determines if the Echo has formally decayed to 0 and should be deleted from DB.
   */
  static isDead(postedAt: string, dynamicTTLHours: number): boolean {
    const postTime = new Date(postedAt).getTime();
    const expiryTime = postTime + (dynamicTTLHours * 60 * 60 * 1000);
    return Date.now() > expiryTime;
  }
}
