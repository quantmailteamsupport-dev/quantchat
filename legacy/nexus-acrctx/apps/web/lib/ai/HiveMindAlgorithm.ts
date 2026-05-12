/**
 * HiveMindAlgorithm.ts
 * ═══════════════════════════════════════════════════════════════════
 * THE NEURAL HIVE PSYCHOLOGICAL ENGINE
 * Authored by: Claude 3 Opus (Psychological & Neural Architect)
 * ═══════════════════════════════════════════════════════════════════
 *
 * This algorithm translates raw group chat behavior (synergy vs conflict)
 * into tangible 3D aesthetic properties (Heat, Glow, Color) for their Hive.
 * 
 * CORE PRINCIPLES OF ADDICTION:
 * 1. Groups are no longer static lists of names; they are living entities.
 * 2. If a group fights/trolls, the Hive burns RED (Conflict).
 * 3. If a group collaborates/jokes, the Hive glows NEON BLUE (Synergy).
 * 4. This provides immediate, gamified, visceral feedback on social dynamics.
 */

import { parseLLMSignals } from "./CooperativeIdentityPrompts";

export interface HiveStateMetrics {
  synergyLevel: number;
  conflictLevel: number;
  humorIndex: number;
  heatMap: "NEUTRAL" | "NEON_BLUE" | "RED" | "GOLDEN";
}

/**
 * Simulates analyzing a batch of 50 recent messages in a Hive
 * using the Edge AI / WebLLM model to extract psychological signals.
 */
export async function analyzeHiveBatch(
  messages: { sender: string; text: string }[],
  generateResponse: (prompt: string) => Promise<string>
): Promise<HiveStateMetrics> {
  const transcript = messages.map(m => `[${m.sender}]: ${m.text}`).join("\n");
  
  const prompt = `
    Analyze the following group chat transcript.
    Compute aggregate group synergy, conflict, and humor out of 1.0.
    Output ONLY JSON: {"synergy": Float, "conflict": Float, "humor": Float}
    ===
    ${transcript}
  `;

  try {
    const rawOutput = await generateResponse(prompt);
    const cleaned = rawOutput.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    
    return calculateHiveEvolution(
      parsed.synergy || 0.5,
      parsed.conflict || 0.0,
      parsed.humor || 0.2
    );
  } catch (err) {
    console.warn("[HiveMind] AI parse failed. Returning neutral logic.", err);
    return { synergyLevel: 0.5, conflictLevel: 0.0, humorIndex: 0.2, heatMap: "NEUTRAL" };
  }
}

/**
 * The core mathematical state transition for the Hive Entity.
 */
function calculateHiveEvolution(synergy: number, conflict: number, humor: number): HiveStateMetrics {
  let heatMap: HiveStateMetrics["heatMap"] = "NEUTRAL";

  // High conflict overwhelms standard synergy. 
  if (conflict > 0.6) {
    heatMap = "RED"; // Aggressive, argument state
  } 
  // High synergy + humor = peak collaboration state
  else if (synergy > 0.7 && humor > 0.5) {
    heatMap = "GOLDEN"; // Legendary/viral state
  } 
  // Standard collaboration
  else if (synergy > 0.5) {
    heatMap = "NEON_BLUE"; // Smooth, cooperative state
  }

  return {
    synergyLevel: Math.max(0, Math.min(1, synergy)),
    conflictLevel: Math.max(0, Math.min(1, conflict)),
    humorIndex: Math.max(0, Math.min(1, humor)),
    heatMap
  };
}
