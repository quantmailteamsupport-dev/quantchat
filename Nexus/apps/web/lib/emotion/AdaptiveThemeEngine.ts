/**
 * lib/emotion/AdaptiveThemeEngine.ts
 *
 * Applies emotion-driven themes to the DOM via CSS custom properties on
 * `:root`. Because every style consumer reads the variables live, a theme
 * switch triggers zero JS re-render and only a paint-level transition, so
 * this is safe to call tens of times per session on low-end devices.
 *
 * Integration contract with issue #46:
 *   happy    → warm gradients (#FFD700 → #FF6B6B), bouncy easing, rounded
 *   calm     → cool gradients (#4FC3F7 → #B2EBF2), slow ease-in-out, soft shadows
 *   stressed → monochrome palette, minimal animations, larger text
 *   sad      → warm amber tones, gentle fade, comfort-mode spacing
 *   excited  → neon accents, fast spring animations, pulse effects
 *   neutral  → the app's standard dark palette
 *
 * Persistence: the last-known emotion and palette are cached in
 * localStorage so that on next launch the UI paints correctly on first
 * frame, before the detector has accumulated any signal.
 */

import type { Emotion } from "./EmotionDetectionService";

// ─── Palette type ─────────────────────────────────────────────────────────

/**
 * Snapshot of every CSS custom property we ever touch. Keeping the full
 * set on every theme means consumers never have to worry about a fallback
 * being missing after a theme switch.
 */
export interface EmotionPalette {
  readonly name: Emotion;

  /** Display-friendly label. */
  readonly label: string;
  /** Short mood description, used in the dashboard. */
  readonly description: string;
  /** Emoji that represents this emotion in UI chrome. */
  readonly icon: string;

  // ── Surfaces ─────────────────────────────────────────
  readonly background: string;
  readonly backgroundGradient: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly surfaceOverlay: string;
  readonly border: string;
  readonly divider: string;

  // ── Foreground ───────────────────────────────────────
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly textInverse: string;

  // ── Accents ──────────────────────────────────────────
  readonly accent: string;
  readonly accentSoft: string;
  readonly accentStrong: string;
  readonly accentGradient: string;
  readonly accentOnDark: string;

  // ── Semantic ─────────────────────────────────────────
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly info: string;

  // ── Motion & shape ───────────────────────────────────
  readonly radiusSm: string;
  readonly radiusMd: string;
  readonly radiusLg: string;
  readonly radiusPill: string;
  readonly easing: string;
  readonly easingEnter: string;
  readonly easingExit: string;
  readonly durationFast: string;
  readonly duration: string;
  readonly durationSlow: string;
  readonly springStiffness: string;
  readonly springDamping: string;

  // ── Shadows ──────────────────────────────────────────
  readonly shadowSm: string;
  readonly shadowMd: string;
  readonly shadowLg: string;
  readonly shadowGlow: string;

  // ── Spacing & typography ────────────────────────────
  readonly spaceScale: string;
  readonly fontScale: string;
  readonly letterSpacing: string;
  readonly lineHeight: string;

  // ── Ambient ──────────────────────────────────────────
  /** Intensity 0..1 for decorative particles (confetti, pulses). */
  readonly particleIntensity: string;
  /** Hex used by glow/pulse effects. */
  readonly particleColor: string;
  /** Preferred bias for the micro-animation library. */
  readonly animationBias:
    | "bounce"
    | "pulse"
    | "fade"
    | "slide"
    | "shake"
    | "glow";
  /** When true, the theme is explicitly low-motion (e.g. stressed). */
  readonly reducedMotion: boolean;
}

// ─── Concrete palettes ────────────────────────────────────────────────────

/**
 * Why hand-tuned palettes and not a HSL ramp?
 *  1. Designers get final say over the exact accents. We shouldn't
 *     synthesize "#FFD7FF" and call it happy because math said so.
 *  2. Each emotion has its own *shape* (radii, easing), not just color.
 *  3. The spec calls out specific gradients we want to honor verbatim.
 */
export const PALETTES: Record<Emotion, EmotionPalette> = {
  happy: {
    name: "happy",
    label: "Happy",
    description: "Warm, bright, a little playful.",
    icon: "😊",
    background: "#201305",
    backgroundGradient:
      "radial-gradient(120% 120% at 0% 0%, #3b1e07 0%, #1a0d03 55%, #0f0802 100%)",
    surface: "rgba(255, 196, 92, 0.08)",
    surfaceRaised: "rgba(255, 196, 92, 0.14)",
    surfaceOverlay: "rgba(255, 235, 200, 0.05)",
    border: "rgba(255, 215, 120, 0.22)",
    divider: "rgba(255, 215, 120, 0.12)",
    textPrimary: "#fff6e2",
    textSecondary: "#f4d39a",
    textMuted: "#c9a56c",
    textInverse: "#1a0d03",
    accent: "#ff6b6b",
    accentSoft: "#ffd27a",
    accentStrong: "#ffd700",
    accentGradient: "linear-gradient(135deg, #ffd700 0%, #ff6b6b 100%)",
    accentOnDark: "#ffd700",
    success: "#7ed957",
    warning: "#ffb74d",
    danger: "#ff5370",
    info: "#ffd27a",
    radiusSm: "10px",
    radiusMd: "18px",
    radiusLg: "26px",
    radiusPill: "9999px",
    easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    easingEnter: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    easingExit: "cubic-bezier(0.4, 0, 0.2, 1)",
    durationFast: "150ms",
    duration: "260ms",
    durationSlow: "420ms",
    springStiffness: "420",
    springDamping: "18",
    shadowSm: "0 2px 6px rgba(255, 107, 107, 0.18)",
    shadowMd: "0 10px 24px rgba(255, 107, 107, 0.22)",
    shadowLg: "0 24px 48px rgba(255, 107, 107, 0.28)",
    shadowGlow: "0 0 24px rgba(255, 215, 0, 0.35)",
    spaceScale: "1",
    fontScale: "1",
    letterSpacing: "0em",
    lineHeight: "1.4",
    particleIntensity: "0.85",
    particleColor: "#ffd700",
    animationBias: "bounce",
    reducedMotion: false,
  },

  calm: {
    name: "calm",
    label: "Calm",
    description: "Cool, unhurried, quiet.",
    icon: "🌊",
    background: "#0b1a24",
    backgroundGradient:
      "radial-gradient(120% 120% at 100% 0%, #102b3a 0%, #0b1a24 55%, #060f16 100%)",
    surface: "rgba(79, 195, 247, 0.08)",
    surfaceRaised: "rgba(79, 195, 247, 0.14)",
    surfaceOverlay: "rgba(178, 235, 242, 0.05)",
    border: "rgba(178, 235, 242, 0.2)",
    divider: "rgba(178, 235, 242, 0.1)",
    textPrimary: "#eaf6fb",
    textSecondary: "#a9d4e3",
    textMuted: "#6b95a6",
    textInverse: "#06131a",
    accent: "#4fc3f7",
    accentSoft: "#b2ebf2",
    accentStrong: "#29b6f6",
    accentGradient: "linear-gradient(135deg, #4fc3f7 0%, #b2ebf2 100%)",
    accentOnDark: "#4fc3f7",
    success: "#80cbc4",
    warning: "#ffcc80",
    danger: "#ef9a9a",
    info: "#b2ebf2",
    radiusSm: "8px",
    radiusMd: "14px",
    radiusLg: "20px",
    radiusPill: "9999px",
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    easingEnter: "cubic-bezier(0.25, 0.1, 0.25, 1)",
    easingExit: "cubic-bezier(0.4, 0, 0.2, 1)",
    durationFast: "220ms",
    duration: "360ms",
    durationSlow: "540ms",
    springStiffness: "220",
    springDamping: "28",
    shadowSm: "0 1px 4px rgba(79, 195, 247, 0.12)",
    shadowMd: "0 6px 16px rgba(79, 195, 247, 0.14)",
    shadowLg: "0 18px 32px rgba(79, 195, 247, 0.18)",
    shadowGlow: "0 0 18px rgba(178, 235, 242, 0.24)",
    spaceScale: "1.02",
    fontScale: "1",
    letterSpacing: "0.005em",
    lineHeight: "1.5",
    particleIntensity: "0.25",
    particleColor: "#b2ebf2",
    animationBias: "fade",
    reducedMotion: false,
  },

  excited: {
    name: "excited",
    label: "Excited",
    description: "High energy, neon, sharp.",
    icon: "⚡",
    background: "#0a0620",
    backgroundGradient:
      "radial-gradient(130% 130% at 50% 0%, #1a0f3a 0%, #0a0620 50%, #03020b 100%)",
    surface: "rgba(138, 43, 226, 0.1)",
    surfaceRaised: "rgba(138, 43, 226, 0.18)",
    surfaceOverlay: "rgba(255, 0, 255, 0.06)",
    border: "rgba(255, 0, 255, 0.28)",
    divider: "rgba(138, 43, 226, 0.2)",
    textPrimary: "#f5efff",
    textSecondary: "#c9b6ff",
    textMuted: "#8a7fb8",
    textInverse: "#03020b",
    accent: "#ff00e5",
    accentSoft: "#b388ff",
    accentStrong: "#00e5ff",
    accentGradient: "linear-gradient(135deg, #ff00e5 0%, #00e5ff 100%)",
    accentOnDark: "#00e5ff",
    success: "#00e676",
    warning: "#ffea00",
    danger: "#ff1744",
    info: "#00e5ff",
    radiusSm: "6px",
    radiusMd: "12px",
    radiusLg: "18px",
    radiusPill: "9999px",
    easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    easingEnter: "cubic-bezier(0.16, 1, 0.3, 1)",
    easingExit: "cubic-bezier(0.7, 0, 0.84, 0)",
    durationFast: "90ms",
    duration: "180ms",
    durationSlow: "280ms",
    springStiffness: "600",
    springDamping: "14",
    shadowSm: "0 2px 8px rgba(255, 0, 229, 0.25)",
    shadowMd: "0 8px 22px rgba(0, 229, 255, 0.28)",
    shadowLg: "0 20px 44px rgba(255, 0, 229, 0.32)",
    shadowGlow: "0 0 28px rgba(255, 0, 229, 0.55)",
    spaceScale: "0.98",
    fontScale: "1",
    letterSpacing: "0.01em",
    lineHeight: "1.35",
    particleIntensity: "1",
    particleColor: "#ff00e5",
    animationBias: "pulse",
    reducedMotion: false,
  },

  stressed: {
    name: "stressed",
    label: "Stressed",
    description: "Monochrome, spacious, minimal motion.",
    icon: "🌫️",
    background: "#111114",
    backgroundGradient:
      "linear-gradient(180deg, #141418 0%, #0c0c0f 100%)",
    surface: "rgba(255, 255, 255, 0.04)",
    surfaceRaised: "rgba(255, 255, 255, 0.07)",
    surfaceOverlay: "rgba(255, 255, 255, 0.03)",
    border: "rgba(255, 255, 255, 0.1)",
    divider: "rgba(255, 255, 255, 0.06)",
    textPrimary: "#ececec",
    textSecondary: "#bdbdbd",
    textMuted: "#8c8c8c",
    textInverse: "#111114",
    accent: "#c5cbd3",
    accentSoft: "#9aa0a8",
    accentStrong: "#ffffff",
    accentGradient: "linear-gradient(135deg, #c5cbd3 0%, #7d828a 100%)",
    accentOnDark: "#ececec",
    success: "#8fb08c",
    warning: "#c7b17a",
    danger: "#c48a8a",
    info: "#9aa0a8",
    radiusSm: "4px",
    radiusMd: "8px",
    radiusLg: "12px",
    radiusPill: "9999px",
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    easingEnter: "cubic-bezier(0.4, 0, 0.2, 1)",
    easingExit: "cubic-bezier(0.4, 0, 0.2, 1)",
    durationFast: "120ms",
    duration: "200ms",
    durationSlow: "320ms",
    springStiffness: "180",
    springDamping: "32",
    shadowSm: "0 1px 2px rgba(0, 0, 0, 0.25)",
    shadowMd: "0 4px 10px rgba(0, 0, 0, 0.3)",
    shadowLg: "0 10px 22px rgba(0, 0, 0, 0.35)",
    shadowGlow: "none",
    spaceScale: "1.15",
    fontScale: "1.08",
    letterSpacing: "0.01em",
    lineHeight: "1.6",
    particleIntensity: "0",
    particleColor: "#8c8c8c",
    animationBias: "fade",
    reducedMotion: true,
  },

  sad: {
    name: "sad",
    label: "Sad",
    description: "Warm amber, softened edges, comfort spacing.",
    icon: "🫂",
    background: "#1b120a",
    backgroundGradient:
      "radial-gradient(120% 120% at 50% 100%, #2a1a0f 0%, #1b120a 55%, #0f0905 100%)",
    surface: "rgba(255, 176, 90, 0.06)",
    surfaceRaised: "rgba(255, 176, 90, 0.12)",
    surfaceOverlay: "rgba(255, 220, 170, 0.05)",
    border: "rgba(255, 176, 90, 0.2)",
    divider: "rgba(255, 176, 90, 0.1)",
    textPrimary: "#fbead3",
    textSecondary: "#d9b890",
    textMuted: "#a3825a",
    textInverse: "#1b120a",
    accent: "#ffb074",
    accentSoft: "#ffd8a8",
    accentStrong: "#d98a4c",
    accentGradient: "linear-gradient(135deg, #ffb074 0%, #d98a4c 100%)",
    accentOnDark: "#ffb074",
    success: "#9ac18b",
    warning: "#ffd8a8",
    danger: "#d98a8a",
    info: "#ffd8a8",
    radiusSm: "12px",
    radiusMd: "20px",
    radiusLg: "28px",
    radiusPill: "9999px",
    easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    easingEnter: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    easingExit: "cubic-bezier(0.55, 0.085, 0.68, 0.53)",
    durationFast: "260ms",
    duration: "420ms",
    durationSlow: "620ms",
    springStiffness: "160",
    springDamping: "30",
    shadowSm: "0 1px 4px rgba(255, 176, 90, 0.14)",
    shadowMd: "0 8px 20px rgba(255, 176, 90, 0.18)",
    shadowLg: "0 20px 36px rgba(255, 176, 90, 0.22)",
    shadowGlow: "0 0 22px rgba(255, 216, 168, 0.3)",
    spaceScale: "1.12",
    fontScale: "1.05",
    letterSpacing: "0.005em",
    lineHeight: "1.6",
    particleIntensity: "0.2",
    particleColor: "#ffd8a8",
    animationBias: "fade",
    reducedMotion: false,
  },

  neutral: {
    name: "neutral",
    label: "Balanced",
    description: "The default WhatsApp-adjacent dark palette.",
    icon: "•",
    background: "#111b21",
    backgroundGradient: "linear-gradient(180deg, #111b21 0%, #0b141a 100%)",
    surface: "rgba(255, 255, 255, 0.04)",
    surfaceRaised: "rgba(255, 255, 255, 0.08)",
    surfaceOverlay: "rgba(255, 255, 255, 0.03)",
    border: "rgba(255, 255, 255, 0.09)",
    divider: "rgba(255, 255, 255, 0.06)",
    textPrimary: "#e9edef",
    textSecondary: "#8696a0",
    textMuted: "#667781",
    textInverse: "#111b21",
    accent: "#6d4aff",
    accentSoft: "#a28bff",
    accentStrong: "#00a884",
    accentGradient: "linear-gradient(135deg, #6d4aff 0%, #00a884 100%)",
    accentOnDark: "#00a884",
    success: "#00a884",
    warning: "#f1c40f",
    danger: "#f15c6d",
    info: "#6d4aff",
    radiusSm: "8px",
    radiusMd: "14px",
    radiusLg: "20px",
    radiusPill: "9999px",
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    easingEnter: "cubic-bezier(0, 0, 0.2, 1)",
    easingExit: "cubic-bezier(0.4, 0, 1, 1)",
    durationFast: "160ms",
    duration: "240ms",
    durationSlow: "360ms",
    springStiffness: "320",
    springDamping: "22",
    shadowSm: "0 1px 2px rgba(0, 0, 0, 0.35)",
    shadowMd: "0 6px 16px rgba(0, 0, 0, 0.4)",
    shadowLg: "0 16px 32px rgba(0, 0, 0, 0.45)",
    shadowGlow: "0 0 18px rgba(109, 74, 255, 0.28)",
    spaceScale: "1",
    fontScale: "1",
    letterSpacing: "0em",
    lineHeight: "1.45",
    particleIntensity: "0.35",
    particleColor: "#6d4aff",
    animationBias: "slide",
    reducedMotion: false,
  },
};

// ─── CSS variable mapping ────────────────────────────────────────────────

/**
 * Map from EmotionPalette keys to the CSS custom properties we expose.
 * Anything not in this map is metadata (label, description, icon, etc).
 */
const CSS_VAR_MAP: Partial<Record<keyof EmotionPalette, string>> = {
  background: "--emotion-bg",
  backgroundGradient: "--emotion-bg-gradient",
  surface: "--emotion-surface",
  surfaceRaised: "--emotion-surface-raised",
  surfaceOverlay: "--emotion-surface-overlay",
  border: "--emotion-border",
  divider: "--emotion-divider",

  textPrimary: "--emotion-text",
  textSecondary: "--emotion-text-secondary",
  textMuted: "--emotion-text-muted",
  textInverse: "--emotion-text-inverse",

  accent: "--emotion-accent",
  accentSoft: "--emotion-accent-soft",
  accentStrong: "--emotion-accent-strong",
  accentGradient: "--emotion-accent-gradient",
  accentOnDark: "--emotion-accent-on-dark",

  success: "--emotion-success",
  warning: "--emotion-warning",
  danger: "--emotion-danger",
  info: "--emotion-info",

  radiusSm: "--emotion-radius-sm",
  radiusMd: "--emotion-radius-md",
  radiusLg: "--emotion-radius-lg",
  radiusPill: "--emotion-radius-pill",
  easing: "--emotion-easing",
  easingEnter: "--emotion-easing-enter",
  easingExit: "--emotion-easing-exit",
  durationFast: "--emotion-duration-fast",
  duration: "--emotion-duration",
  durationSlow: "--emotion-duration-slow",
  springStiffness: "--emotion-spring-stiffness",
  springDamping: "--emotion-spring-damping",

  shadowSm: "--emotion-shadow-sm",
  shadowMd: "--emotion-shadow-md",
  shadowLg: "--emotion-shadow-lg",
  shadowGlow: "--emotion-shadow-glow",

  spaceScale: "--emotion-space-scale",
  fontScale: "--emotion-font-scale",
  letterSpacing: "--emotion-letter-spacing",
  lineHeight: "--emotion-line-height",

  particleIntensity: "--emotion-particle-intensity",
  particleColor: "--emotion-particle-color",
};

// ─── Persistence ─────────────────────────────────────────────────────────

const STORAGE_KEY = "quantchat:emotion-theme";

interface PersistedTheme {
  emotion: Emotion;
  savedAt: number;
  manualOverride: Emotion | null;
}

function loadPersisted(): PersistedTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedTheme>;
    if (parsed && typeof parsed.emotion === "string" && parsed.emotion in PALETTES) {
      return {
        emotion: parsed.emotion as Emotion,
        savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
        manualOverride:
          parsed.manualOverride && parsed.manualOverride in PALETTES
            ? (parsed.manualOverride as Emotion)
            : null,
      };
    }
  } catch {
    // Corrupt storage — ignore and fall back to neutral.
  }
  return null;
}

function savePersisted(p: PersistedTheme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Quota/private mode — not fatal.
  }
}

// ─── System reduced-motion detection ─────────────────────────────────────

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ─── Engine ──────────────────────────────────────────────────────────────

export interface AdaptiveThemeEngineOptions {
  /** Transition between palettes rather than snapping. Default true. */
  animateTransitions?: boolean;
  /** Per-variable transition duration during a palette swap, ms. */
  transitionDurationMs?: number;
  /** Callback fired after a palette apply. */
  onApply?: (palette: EmotionPalette, source: ThemeSource) => void;
}

export type ThemeSource = "detector" | "override" | "persisted" | "initial";

const DEFAULT_ENGINE_OPTS: Required<
  Omit<AdaptiveThemeEngineOptions, "onApply">
> & { onApply?: AdaptiveThemeEngineOptions["onApply"] } = {
  animateTransitions: true,
  transitionDurationMs: 600,
  onApply: undefined,
};

/**
 * Primary adapter between EmotionEstimate updates and visible CSS state.
 *
 * Not a singleton by construction — tests can spin up their own — but the
 * module exposes `getAdaptiveThemeEngine()` for app-level code that wants
 * a shared instance.
 */
export class AdaptiveThemeEngine {
  private readonly opts: typeof DEFAULT_ENGINE_OPTS;
  private currentEmotion: Emotion;
  private currentPalette: EmotionPalette;
  private manualOverride: Emotion | null = null;
  private started = false;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: AdaptiveThemeEngineOptions = {}) {
    this.opts = { ...DEFAULT_ENGINE_OPTS, ...options };
    const persisted = loadPersisted();
    this.currentEmotion = persisted?.emotion ?? "neutral";
    this.currentPalette = PALETTES[this.currentEmotion];
    this.manualOverride = persisted?.manualOverride ?? null;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  /**
   * Install the initial palette on the DOM. Idempotent and SSR-safe
   * (a no-op on the server). Usually called once inside AppShell.
   */
  start(): void {
    if (this.started || typeof document === "undefined") return;
    this.started = true;
    // Write an instant paint first, then let the next applies animate.
    this.applyPalette(this.currentPalette, "initial", /* animate */ false);
  }

  stop(): void {
    this.started = false;
    if (this.transitionTimer !== null) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
  }

  // ── Public state ──────────────────────────────────────────────────

  getCurrentEmotion(): Emotion {
    return this.currentEmotion;
  }

  getCurrentPalette(): EmotionPalette {
    return this.currentPalette;
  }

  getManualOverride(): Emotion | null {
    return this.manualOverride;
  }

  // ── Update paths ─────────────────────────────────────────────────

  /**
   * Apply a detector-driven update. Silently deferred if a manual override
   * is active; the override wins until the user clears it.
   */
  applyFromDetector(emotion: Emotion): void {
    if (this.manualOverride !== null) return;
    this.setEmotion(emotion, "detector");
  }

  /** User-initiated override. Pass `null` to clear. */
  setManualOverride(emotion: Emotion | null): void {
    this.manualOverride = emotion;
    const target = emotion ?? this.currentEmotion;
    this.setEmotion(target, "override");
    savePersisted({
      emotion: this.currentEmotion,
      savedAt: Date.now(),
      manualOverride: this.manualOverride,
    });
  }

  /** Clear any manual override. Equivalent to `setManualOverride(null)`. */
  clearManualOverride(): void {
    this.setManualOverride(null);
  }

  // ── Internal ─────────────────────────────────────────────────────

  private setEmotion(emotion: Emotion, source: ThemeSource): void {
    if (!(emotion in PALETTES)) emotion = "neutral";
    if (emotion === this.currentEmotion && source !== "override") return;

    this.currentEmotion = emotion;
    this.currentPalette = PALETTES[emotion];

    this.applyPalette(this.currentPalette, source, this.opts.animateTransitions);

    if (source !== "persisted" && source !== "initial") {
      savePersisted({
        emotion: this.currentEmotion,
        savedAt: Date.now(),
        manualOverride: this.manualOverride,
      });
    }
  }

  private applyPalette(
    palette: EmotionPalette,
    source: ThemeSource,
    animate: boolean,
  ): void {
    if (typeof document === "undefined") return;
    const root = document.documentElement;

    const reducedMotion = palette.reducedMotion || prefersReducedMotion();

    // Enable a short transition on colors/shadows/radii for a smooth swap.
    // We remove it after a tick so it never interferes with component-level
    // animations that use their own durations.
    if (animate && !reducedMotion) {
      root.style.setProperty(
        "transition",
        `background-color ${this.opts.transitionDurationMs}ms ease, color ${this.opts.transitionDurationMs}ms ease`,
      );
      if (this.transitionTimer !== null) clearTimeout(this.transitionTimer);
      this.transitionTimer = setTimeout(() => {
        root.style.removeProperty("transition");
        this.transitionTimer = null;
      }, this.opts.transitionDurationMs + 50);
    }

    for (const key of Object.keys(CSS_VAR_MAP) as (keyof EmotionPalette)[]) {
      const cssName = CSS_VAR_MAP[key];
      if (!cssName) continue;
      const value = palette[key];
      if (typeof value === "string") {
        root.style.setProperty(cssName, value);
      } else if (typeof value === "number") {
        root.style.setProperty(cssName, String(value));
      }
    }

    // Body-level hints (attribute selectors can target these).
    root.dataset.emotion = palette.name;
    root.dataset.emotionBias = palette.animationBias;
    if (reducedMotion) root.dataset.reducedMotion = "true";
    else delete root.dataset.reducedMotion;

    this.opts.onApply?.(palette, source);
  }
}

// ─── Shared instance ─────────────────────────────────────────────────────

let _engine: AdaptiveThemeEngine | null = null;

export function getAdaptiveThemeEngine(): AdaptiveThemeEngine {
  if (_engine === null) _engine = new AdaptiveThemeEngine();
  return _engine;
}

export function __resetAdaptiveThemeEngineForTests(): void {
  if (_engine) _engine.stop();
  _engine = null;
}

// ─── Convenience: safe palette lookup ────────────────────────────────────

export function paletteFor(emotion: Emotion): EmotionPalette {
  return PALETTES[emotion] ?? PALETTES.neutral;
}

// ─── CSS helper: initial :root rules ─────────────────────────────────────

/**
 * Returns a CSS string snapshot suitable for embedding in a <style> tag or
 * global stylesheet so the neutral palette paints before JS runs. We only
 * ship the neutral palette here because that matches the app's existing
 * default and avoids a FOUC on first load.
 */
export function initialRootCss(): string {
  const p = PALETTES.neutral;
  const lines: string[] = [":root {"];
  for (const key of Object.keys(CSS_VAR_MAP) as (keyof EmotionPalette)[]) {
    const cssName = CSS_VAR_MAP[key];
    if (!cssName) continue;
    const v = p[key];
    if (typeof v === "string") lines.push(`  ${cssName}: ${v};`);
  }
  lines.push("}");
  return lines.join("\n");
}
