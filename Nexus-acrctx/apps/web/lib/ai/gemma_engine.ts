/**
 * gemma_engine.ts
 * ═══════════════════════════════════════════════════════════════════
 * ON-DEVICE SENTIMENT ANALYSIS ENGINE  (Phase 3 — Google Gemma)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Runs Google Gemma-class inference locally via the WebGPU/WASM
 * pipeline already powering the EdgeAIEngine (MLC Web-LLM).
 *
 * Responsibilities:
 *   1. Expose `analyzeMessageSentiment(text)` — zero-latency, zero-cost.
 *   2. Map raw SentimentResult scores to visual shader parameters for
 *      the HolographicOrb renderer in apps/web/app/xr/page.tsx.
 *   3. Provide `useSentimentShader` — a React hook that manages
 *      per-message analysis and returns time-decaying shader overrides.
 *
 * Architecture note:
 *   This module is a pure facade over `WebLLMService.ts` (EdgeAIEngine).
 *   Swap the underlying model by changing SELECTED_MODEL in WebLLMWorker.ts;
 *   this file never needs to change.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { edgeAI } from "./WebLLMService";
import type { SentimentResult } from "./AITypes";

// ─── Shader Parameter Contract ────────────────────────────────────

/**
 * Visual overrides passed to the HolographicOrb Canvas renderer.
 * All values are ADDITIVE/MULTIPLICATIVE on top of the base entity state
 * so that the base bond-strength visuals are never destroyed.
 */
export interface SentimentShaderParams {
  /** Degrees to add to the base entity hue. Range: -180 to +180. */
  hueShift: number;
  /** Extra glow intensity multiplier. Range: 0.0 – 1.0. */
  glowBoost: number;
  /** Chromatic-aberration/glitch strength. Range: 0.0 – 1.0. */
  glitchIntensity: number;
  /** Pulse-rate multiplier (1.0 = normal speed). Range: 0.5 – 2.5. */
  pulseRate: number;
  /** Opacity of the mood-tint overlay drawn over the orb. Range: 0.0 – 0.35. */
  tintOpacity: number;
  /** HSL color string for the mood-tint overlay. */
  tintColor: string;
}

/** Neutral baseline — no visual change. */
export const NEUTRAL_SHADER: SentimentShaderParams = {
  hueShift: 0,
  glowBoost: 0,
  glitchIntensity: 0,
  pulseRate: 1.0,
  tintOpacity: 0,
  tintColor: "hsl(0,0%,0%)",
};

// ─── Sentiment → Shader Mapping ───────────────────────────────────

/**
 * Maps a SentimentResult produced by the on-device LLM to visual
 * shader parameters.  The mapping is designed so that:
 *   • Positive moods → warm, fast, bright
 *   • Negative moods → cool or hot, slow or erratic
 *   • Neutral         → no change (preserves base entity state)
 *
 * Valence & arousal scores fine-tune within each label for a smooth
 * continuum rather than abrupt jumps.
 */
export function sentimentToShaderParams(sentiment: SentimentResult): SentimentShaderParams {
  const { label, valence, arousal } = sentiment;

  // arousal-modulated pulse: higher energy → faster pulse
  const pulseRate = 0.7 + arousal * 1.8;

  switch (label) {
    case "joyful":
      return {
        hueShift: 30 + valence * 20,      // warm gold-yellow
        glowBoost: 0.4 + arousal * 0.3,
        glitchIntensity: 0,
        pulseRate: Math.min(2.5, pulseRate),
        tintOpacity: 0.15,
        tintColor: "hsl(50,100%,70%)",
      };

    case "positive":
      return {
        hueShift: 15 + valence * 10,      // cyan-teal shift
        glowBoost: 0.2 + arousal * 0.2,
        glitchIntensity: 0,
        pulseRate: Math.min(2.0, pulseRate),
        tintOpacity: 0.10,
        tintColor: "hsl(185,100%,65%)",
      };

    case "angry":
      return {
        hueShift: -110 + valence * 15,    // deep red
        glowBoost: 0.1,
        glitchIntensity: 0.5 + arousal * 0.4,
        pulseRate: Math.min(2.5, pulseRate),
        tintOpacity: 0.25,
        tintColor: "hsl(0,90%,55%)",
      };

    case "sad":
      return {
        hueShift: -30 + valence * 10,     // desaturated blue
        glowBoost: 0,
        glitchIntensity: 0.1,
        pulseRate: Math.max(0.5, 0.7 - arousal * 0.2),
        tintOpacity: 0.18,
        tintColor: "hsl(220,60%,45%)",
      };

    case "negative":
      return {
        hueShift: -20 + valence * 10,
        glowBoost: 0,
        glitchIntensity: 0.3 + arousal * 0.25,
        pulseRate: Math.max(0.6, 0.9 - arousal * 0.2),
        tintOpacity: 0.15,
        tintColor: "hsl(20,80%,50%)",
      };

    default: // "neutral"
      return { ...NEUTRAL_SHADER };
  }
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Analyzes the emotional sentiment of a single message using the
 * on-device LLM worker.  Falls back to a neutral result if the AI
 * engine is not yet loaded or encounters an error.
 */
export async function analyzeMessageSentiment(text: string): Promise<SentimentResult> {
  try {
    return await edgeAI.analyzeSentiment(text);
  } catch {
    // Graceful degradation: return neutral when engine is offline/loading.
    return { label: "neutral", valence: 0, arousal: 0.5, confidence: 0 };
  }
}

// ─── React Hook ───────────────────────────────────────────────────

/** How long the sentiment shader effect stays visible (milliseconds). */
const SHADER_TTL_MS = 4000;

/**
 * `useSentimentShader`
 *
 * Accepts a stream of chat messages and runs on-device sentiment analysis
 * on each new message.  Returns time-decaying `SentimentShaderParams`
 * that the HolographicOrb can apply as a visual overlay.
 *
 * Usage:
 * ```tsx
 * const { shaderParams, analyzePending } = useSentimentShader();
 * // Call triggerAnalysis(text) whenever a new message arrives.
 * ```
 */
export function useSentimentShader() {
  const [shaderParams, setShaderParams] = useState<SentimentShaderParams>(NEUTRAL_SHADER);
  const [lastSentiment, setLastSentiment] = useState<SentimentResult | null>(null);
  const [analyzePending, setAnalyzePending] = useState(false);
  const decayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the decay timer on unmount to prevent state updates after unmount.
  useEffect(() => {
    return () => {
      if (decayTimerRef.current !== null) {
        clearTimeout(decayTimerRef.current);
      }
    };
  }, []);

  const triggerAnalysis = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setAnalyzePending(true);

    const sentiment = await analyzeMessageSentiment(text);
    const params = sentimentToShaderParams(sentiment);

    setLastSentiment(sentiment);
    setShaderParams(params);
    setAnalyzePending(false);

    // Auto-reset to neutral after TTL so the base entity state re-asserts.
    if (decayTimerRef.current !== null) clearTimeout(decayTimerRef.current);
    decayTimerRef.current = setTimeout(() => {
      setShaderParams(NEUTRAL_SHADER);
    }, SHADER_TTL_MS);
  }, []);

  return { shaderParams, lastSentiment, analyzePending, triggerAnalysis };
}
