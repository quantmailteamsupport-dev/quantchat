/**
 * lib/emotion/MicroAnimationLibrary.ts
 *
 * Performance-first micro-animation system for the Emotion-Responsive UI
 * (issue #46). All animations restrict themselves to `transform` and
 * `opacity` so the browser can composite them on the GPU without
 * triggering layout or paint thrash.
 *
 * Authoring model
 * ───────────────
 * Authors annotate interactive elements with a `data-animate` attribute
 * describing *intent*, not a specific keyframe. For example:
 *
 *     <button data-animate="tap">Send</button>
 *     <div   data-animate="enter">…</div>
 *
 * The library watches for these elements (MutationObserver) and attaches
 * the right handler for the currently active emotion. When the theme
 * switches — say from `calm` to `excited` — the library swaps the
 * underlying keyframes without requiring a re-render on the React side.
 *
 * Six built-in primitives: bounce, fade, slide, pulse, shake, glow.
 * Each emotion declares which primitive wins for ambiguous intents like
 * "tap" or "enter".
 */

import type { Emotion } from "./EmotionDetectionService";

// ─── Primitives ───────────────────────────────────────────────────────────

export type AnimationPrimitive =
  | "bounce"
  | "fade"
  | "slide"
  | "pulse"
  | "shake"
  | "glow";

export type AnimationIntent =
  | "tap"
  | "hover"
  | "enter"
  | "exit"
  | "success"
  | "error"
  | "attention"
  | "idle";

/**
 * Per-primitive, per-intent keyframe set plus timing hints. Kept simple
 * and explicit so it's obvious what runs when.
 */
export interface KeyframeSpec {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
}

// ─── Easing catalog ──────────────────────────────────────────────────────

const EASE = {
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
  sharp: "cubic-bezier(0.16, 1, 0.3, 1)",
  soft: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  linear: "linear",
} as const;

// ─── Primitive definitions ───────────────────────────────────────────────

/**
 * We ship primitive → keyframes tables rather than per-intent tables
 * because every intent maps cleanly to a primitive once the emotion's
 * bias is applied. The mapping is:
 *
 *   tap        → attention-grabbing micro-gesture (bias primitive)
 *   hover      → quick emphasis (always fade or pulse)
 *   enter      → element appears on screen
 *   exit       → element leaves
 *   success    → positive confirmation (bounce/pulse)
 *   error      → negative feedback (shake/glow-red tint not themed)
 *   attention  → "look here" loop
 *   idle       → resting micro-loop (only when bias is pulse/glow)
 */

interface PrimitiveSet {
  tap: KeyframeSpec;
  hover: KeyframeSpec;
  enter: KeyframeSpec;
  exit: KeyframeSpec;
  success: KeyframeSpec;
  error: KeyframeSpec;
  attention: KeyframeSpec;
  idle: KeyframeSpec | null;
}

// NOTE: every keyframe list below touches only transform / opacity / filter.
// We deliberately never animate width/height/top/left to avoid layout.

const BOUNCE: PrimitiveSet = {
  tap: {
    keyframes: [
      { transform: "scale(1)" },
      { transform: "scale(0.9)" },
      { transform: "scale(1.06)" },
      { transform: "scale(1)" },
    ],
    options: { duration: 260, easing: EASE.spring },
  },
  hover: {
    keyframes: [{ transform: "scale(1)" }, { transform: "scale(1.04)" }],
    options: { duration: 180, easing: EASE.spring, fill: "forwards" },
  },
  enter: {
    keyframes: [
      { transform: "translateY(8px) scale(0.96)", opacity: 0 },
      { transform: "translateY(0) scale(1)", opacity: 1 },
    ],
    options: { duration: 320, easing: EASE.spring, fill: "both" },
  },
  exit: {
    keyframes: [
      { transform: "translateY(0) scale(1)", opacity: 1 },
      { transform: "translateY(6px) scale(0.96)", opacity: 0 },
    ],
    options: { duration: 220, easing: EASE.smooth, fill: "both" },
  },
  success: {
    keyframes: [
      { transform: "scale(1)" },
      { transform: "scale(1.15)" },
      { transform: "scale(0.97)" },
      { transform: "scale(1)" },
    ],
    options: { duration: 420, easing: EASE.spring },
  },
  error: {
    keyframes: [
      { transform: "translateX(0)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(6px)" },
      { transform: "translateX(-4px)" },
      { transform: "translateX(0)" },
    ],
    options: { duration: 280, easing: EASE.smooth },
  },
  attention: {
    keyframes: [
      { transform: "scale(1)" },
      { transform: "scale(1.08)" },
      { transform: "scale(1)" },
    ],
    options: { duration: 800, iterations: Infinity, easing: EASE.spring },
  },
  idle: null,
};

const FADE: PrimitiveSet = {
  tap: {
    keyframes: [{ opacity: 1 }, { opacity: 0.65 }, { opacity: 1 }],
    options: { duration: 240, easing: EASE.smooth },
  },
  hover: {
    keyframes: [{ opacity: 0.85 }, { opacity: 1 }],
    options: { duration: 220, easing: EASE.smooth, fill: "forwards" },
  },
  enter: {
    keyframes: [{ opacity: 0 }, { opacity: 1 }],
    options: { duration: 360, easing: EASE.smooth, fill: "both" },
  },
  exit: {
    keyframes: [{ opacity: 1 }, { opacity: 0 }],
    options: { duration: 280, easing: EASE.smooth, fill: "both" },
  },
  success: {
    keyframes: [
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0.85, transform: "scale(1.02)" },
      { opacity: 1, transform: "scale(1)" },
    ],
    options: { duration: 420, easing: EASE.smooth },
  },
  error: {
    keyframes: [{ opacity: 1 }, { opacity: 0.5 }, { opacity: 1 }],
    options: { duration: 320, iterations: 2, easing: EASE.smooth },
  },
  attention: {
    keyframes: [{ opacity: 0.7 }, { opacity: 1 }, { opacity: 0.7 }],
    options: { duration: 1600, iterations: Infinity, easing: EASE.smooth },
  },
  idle: null,
};

const SLIDE: PrimitiveSet = {
  tap: {
    keyframes: [
      { transform: "translateY(0)" },
      { transform: "translateY(2px)" },
      { transform: "translateY(0)" },
    ],
    options: { duration: 220, easing: EASE.smooth },
  },
  hover: {
    keyframes: [
      { transform: "translateY(0)" },
      { transform: "translateY(-2px)" },
    ],
    options: { duration: 200, easing: EASE.smooth, fill: "forwards" },
  },
  enter: {
    keyframes: [
      { transform: "translateY(12px)", opacity: 0 },
      { transform: "translateY(0)", opacity: 1 },
    ],
    options: { duration: 320, easing: EASE.sharp, fill: "both" },
  },
  exit: {
    keyframes: [
      { transform: "translateY(0)", opacity: 1 },
      { transform: "translateY(-8px)", opacity: 0 },
    ],
    options: { duration: 240, easing: EASE.smooth, fill: "both" },
  },
  success: {
    keyframes: [
      { transform: "translateY(0)" },
      { transform: "translateY(-4px)" },
      { transform: "translateY(0)" },
    ],
    options: { duration: 360, easing: EASE.smooth },
  },
  error: {
    keyframes: [
      { transform: "translateX(0)" },
      { transform: "translateX(-5px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(0)" },
    ],
    options: { duration: 260, easing: EASE.smooth },
  },
  attention: {
    keyframes: [
      { transform: "translateY(0)" },
      { transform: "translateY(-3px)" },
      { transform: "translateY(0)" },
    ],
    options: { duration: 1400, iterations: Infinity, easing: EASE.smooth },
  },
  idle: null,
};

const PULSE: PrimitiveSet = {
  tap: {
    keyframes: [
      { transform: "scale(1)" },
      { transform: "scale(0.94)" },
      { transform: "scale(1.02)" },
      { transform: "scale(1)" },
    ],
    options: { duration: 240, easing: EASE.sharp },
  },
  hover: {
    keyframes: [{ transform: "scale(1)" }, { transform: "scale(1.03)" }],
    options: { duration: 160, easing: EASE.sharp, fill: "forwards" },
  },
  enter: {
    keyframes: [
      { transform: "scale(0.92)", opacity: 0 },
      { transform: "scale(1)", opacity: 1 },
    ],
    options: { duration: 260, easing: EASE.sharp, fill: "both" },
  },
  exit: {
    keyframes: [
      { transform: "scale(1)", opacity: 1 },
      { transform: "scale(0.94)", opacity: 0 },
    ],
    options: { duration: 200, easing: EASE.smooth, fill: "both" },
  },
  success: {
    keyframes: [
      { transform: "scale(1)" },
      { transform: "scale(1.18)" },
      { transform: "scale(1)" },
    ],
    options: { duration: 360, easing: EASE.spring },
  },
  error: {
    keyframes: [
      { transform: "scale(1)" },
      { transform: "scale(1.08)" },
      { transform: "scale(0.96)" },
      { transform: "scale(1)" },
    ],
    options: { duration: 280, easing: EASE.smooth },
  },
  attention: {
    keyframes: [
      { transform: "scale(1)" },
      { transform: "scale(1.06)" },
      { transform: "scale(1)" },
    ],
    options: { duration: 900, iterations: Infinity, easing: EASE.sharp },
  },
  idle: {
    keyframes: [
      { transform: "scale(1)" },
      { transform: "scale(1.02)" },
      { transform: "scale(1)" },
    ],
    options: { duration: 2400, iterations: Infinity, easing: EASE.smooth },
  },
};

const SHAKE: PrimitiveSet = {
  tap: {
    keyframes: [
      { transform: "translateX(0)" },
      { transform: "translateX(-2px)" },
      { transform: "translateX(2px)" },
      { transform: "translateX(0)" },
    ],
    options: { duration: 180, easing: EASE.smooth },
  },
  hover: {
    keyframes: [{ transform: "translateX(0)" }, { transform: "translateX(1px)" }],
    options: { duration: 140, easing: EASE.smooth, fill: "forwards" },
  },
  enter: {
    keyframes: [
      { transform: "translateX(-6px)", opacity: 0 },
      { transform: "translateX(0)", opacity: 1 },
    ],
    options: { duration: 220, easing: EASE.sharp, fill: "both" },
  },
  exit: {
    keyframes: [
      { transform: "translateX(0)", opacity: 1 },
      { transform: "translateX(6px)", opacity: 0 },
    ],
    options: { duration: 200, easing: EASE.smooth, fill: "both" },
  },
  success: {
    keyframes: [
      { transform: "translateY(0)" },
      { transform: "translateY(-3px)" },
      { transform: "translateY(0)" },
    ],
    options: { duration: 300, easing: EASE.spring },
  },
  error: {
    keyframes: [
      { transform: "translateX(0)" },
      { transform: "translateX(-8px)" },
      { transform: "translateX(8px)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(6px)" },
      { transform: "translateX(0)" },
    ],
    options: { duration: 360, easing: EASE.smooth },
  },
  attention: {
    keyframes: [
      { transform: "translateX(0)" },
      { transform: "translateX(-2px)" },
      { transform: "translateX(2px)" },
      { transform: "translateX(0)" },
    ],
    options: { duration: 1200, iterations: Infinity, easing: EASE.smooth },
  },
  idle: null,
};

const GLOW: PrimitiveSet = {
  tap: {
    keyframes: [
      { filter: "brightness(1) drop-shadow(0 0 0 var(--emotion-particle-color, #fff0))" },
      { filter: "brightness(1.15) drop-shadow(0 0 10px var(--emotion-particle-color, #fff))" },
      { filter: "brightness(1) drop-shadow(0 0 0 var(--emotion-particle-color, #fff0))" },
    ],
    options: { duration: 320, easing: EASE.smooth },
  },
  hover: {
    keyframes: [
      { filter: "brightness(1)" },
      { filter: "brightness(1.08) drop-shadow(0 0 6px var(--emotion-particle-color, #fff8))" },
    ],
    options: { duration: 220, easing: EASE.smooth, fill: "forwards" },
  },
  enter: {
    keyframes: [
      { opacity: 0, filter: "brightness(1.4) blur(2px)" },
      { opacity: 1, filter: "brightness(1) blur(0)" },
    ],
    options: { duration: 340, easing: EASE.smooth, fill: "both" },
  },
  exit: {
    keyframes: [
      { opacity: 1, filter: "brightness(1) blur(0)" },
      { opacity: 0, filter: "brightness(0.8) blur(2px)" },
    ],
    options: { duration: 260, easing: EASE.smooth, fill: "both" },
  },
  success: {
    keyframes: [
      { filter: "brightness(1)" },
      { filter: "brightness(1.3) drop-shadow(0 0 12px var(--emotion-particle-color, #fff))" },
      { filter: "brightness(1)" },
    ],
    options: { duration: 480, easing: EASE.smooth },
  },
  error: {
    keyframes: [
      { filter: "brightness(1)" },
      { filter: "brightness(1.1) drop-shadow(0 0 8px #ff4d6d)" },
      { filter: "brightness(1)" },
    ],
    options: { duration: 320, iterations: 2, easing: EASE.smooth },
  },
  attention: {
    keyframes: [
      { filter: "brightness(1) drop-shadow(0 0 0 var(--emotion-particle-color, #fff0))" },
      { filter: "brightness(1.1) drop-shadow(0 0 10px var(--emotion-particle-color, #fff8))" },
      { filter: "brightness(1) drop-shadow(0 0 0 var(--emotion-particle-color, #fff0))" },
    ],
    options: { duration: 1600, iterations: Infinity, easing: EASE.smooth },
  },
  idle: {
    keyframes: [
      { filter: "brightness(1)" },
      { filter: "brightness(1.05) drop-shadow(0 0 6px var(--emotion-particle-color, #fff6))" },
      { filter: "brightness(1)" },
    ],
    options: { duration: 2800, iterations: Infinity, easing: EASE.smooth },
  },
};

const PRIMITIVES: Record<AnimationPrimitive, PrimitiveSet> = {
  bounce: BOUNCE,
  fade: FADE,
  slide: SLIDE,
  pulse: PULSE,
  shake: SHAKE,
  glow: GLOW,
};

// ─── Emotion → primitive bias ────────────────────────────────────────────

/**
 * For any given emotion, what primitive should we use when the author
 * asked for a generic intent like "tap" or "enter"? This is the table
 * that gives each emotional state its motion personality.
 */
const EMOTION_BIAS: Record<Emotion, AnimationPrimitive> = {
  happy: "bounce",
  calm: "fade",
  excited: "pulse",
  stressed: "fade",
  sad: "fade",
  neutral: "slide",
};

/**
 * Some intents should override the emotion bias. "error" for instance is
 * almost always a shake regardless of mood — we never want a user's
 * stressed state to *hide* a validation error by fading it in gently.
 */
const INTENT_OVERRIDES: Partial<Record<AnimationIntent, AnimationPrimitive>> = {
  error: "shake",
};

// ─── Configuration ───────────────────────────────────────────────────────

export interface MicroAnimationOptions {
  /** Attribute name to scan for. Default "data-animate". */
  attr?: string;
  /** When true, uses reduced-motion-safe fallbacks for every animation. */
  reducedMotion?: boolean;
  /** Document root to scan. Defaults to document.body. */
  root?: HTMLElement | null;
}

const DEFAULT_OPTS: Required<Omit<MicroAnimationOptions, "root">> & {
  root: HTMLElement | null;
} = {
  attr: "data-animate",
  reducedMotion: false,
  root: null,
};

// ─── Reduced-motion fallback ─────────────────────────────────────────────

const REDUCED_MOTION_SPEC: KeyframeSpec = {
  keyframes: [{ opacity: 0.85 }, { opacity: 1 }],
  options: { duration: 120, easing: "linear" },
};

// ─── Bookkeeping ─────────────────────────────────────────────────────────

interface AttachedHandlers {
  element: HTMLElement;
  intent: AnimationIntent;
  onPointerDown?: (e: Event) => void;
  onPointerEnter?: (e: Event) => void;
  onPointerLeave?: (e: Event) => void;
}

// ─── Library ─────────────────────────────────────────────────────────────

export class MicroAnimationLibrary {
  private readonly opts: typeof DEFAULT_OPTS;
  private emotion: Emotion = "neutral";
  private bias: AnimationPrimitive = "slide";
  private observer: MutationObserver | null = null;
  private readonly attached = new WeakMap<HTMLElement, AttachedHandlers>();
  /** Elements currently playing a looping "attention"/"idle" animation. */
  private readonly loops = new WeakMap<HTMLElement, Animation>();
  private started = false;
  private systemReducedMotion = false;

  constructor(options: MicroAnimationOptions = {}) {
    this.opts = { ...DEFAULT_OPTS, ...options };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  start(): void {
    if (this.started || typeof document === "undefined") return;
    this.started = true;

    this.systemReducedMotion =
      typeof window !== "undefined" && !!window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;

    const root = this.opts.root ?? document.body;
    if (!root) return;

    // Initial scan.
    this.scan(root);

    // Observe for future additions/removals.
    this.observer = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (n.nodeType === 1) this.scan(n as HTMLElement);
        });
        r.removedNodes.forEach((n) => {
          if (n.nodeType === 1) this.detachAll(n as HTMLElement);
        });
        if (
          r.type === "attributes" &&
          r.target.nodeType === 1 &&
          (r.target as HTMLElement).getAttribute(this.opts.attr) !== null
        ) {
          this.attach(r.target as HTMLElement);
        }
      }
    });
    this.observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [this.opts.attr],
    });
  }

  stop(): void {
    this.started = false;
    this.observer?.disconnect();
    this.observer = null;
  }

  // ── Emotion hook ──────────────────────────────────────────────────

  /**
   * Called by AppShell whenever the theme engine applies a new emotion.
   * We record the bias and refresh any running loops.
   */
  setEmotion(emotion: Emotion): void {
    if (this.emotion === emotion) return;
    this.emotion = emotion;
    this.bias = EMOTION_BIAS[emotion] ?? "slide";
    this.refreshLoops();
  }

  getEmotion(): Emotion {
    return this.emotion;
  }

  // ── Imperative API ────────────────────────────────────────────────

  /**
   * Fire a one-shot animation on a given element. Useful for React
   * callers that don't want to set data-animate attributes.
   */
  play(
    element: HTMLElement,
    intent: AnimationIntent,
    overridePrimitive?: AnimationPrimitive,
  ): Animation | null {
    const spec = this.resolveSpec(intent, overridePrimitive);
    if (!spec) return null;
    try {
      return element.animate(spec.keyframes, spec.options);
    } catch {
      return null;
    }
  }

  /**
   * Start an infinite attention/idle loop on the element. Calling this
   * again replaces the current loop. Pass `null` to stop.
   */
  setLoop(element: HTMLElement, intent: "attention" | "idle" | null): void {
    const existing = this.loops.get(element);
    if (existing) {
      try {
        existing.cancel();
      } catch {
        /* noop */
      }
      this.loops.delete(element);
    }
    if (intent === null) return;
    const spec = this.resolveSpec(intent);
    if (!spec) return;
    try {
      const a = element.animate(spec.keyframes, spec.options);
      this.loops.set(element, a);
    } catch {
      /* noop */
    }
  }

  // ── Attribute scanning ────────────────────────────────────────────

  private scan(root: HTMLElement): void {
    if (root.getAttribute?.(this.opts.attr) !== null) this.attach(root);
    const nodes = root.querySelectorAll?.(`[${this.opts.attr}]`);
    if (nodes) {
      nodes.forEach((n) => this.attach(n as HTMLElement));
    }
  }

  private attach(element: HTMLElement): void {
    // Already attached with the same intent? Then do nothing.
    const intent = this.readIntent(element);
    if (!intent) return;

    const existing = this.attached.get(element);
    if (existing && existing.intent === intent) return;
    if (existing) this.detach(element);

    const handlers: AttachedHandlers = { element, intent };

    // Map intent → DOM event.
    switch (intent) {
      case "tap": {
        const h = () => this.play(element, "tap");
        element.addEventListener("pointerdown", h, { passive: true });
        handlers.onPointerDown = h;
        break;
      }
      case "hover": {
        const hIn = () => this.play(element, "hover");
        const hOut = () => {
          // Reverse the hover by replaying fade-down — cheap and fine.
          this.play(element, "exit", "fade");
        };
        element.addEventListener("pointerenter", hIn, { passive: true });
        element.addEventListener("pointerleave", hOut, { passive: true });
        handlers.onPointerEnter = hIn;
        handlers.onPointerLeave = hOut;
        break;
      }
      case "enter": {
        // Play once on attach.
        this.play(element, "enter");
        break;
      }
      case "attention":
      case "idle": {
        this.setLoop(element, intent);
        break;
      }
      default: {
        // success / error / exit are explicit imperative plays; we just
        // register the element so stop/loop bookkeeping stays consistent.
        break;
      }
    }

    this.attached.set(element, handlers);
  }

  private detach(element: HTMLElement): void {
    const h = this.attached.get(element);
    if (!h) return;
    if (h.onPointerDown) element.removeEventListener("pointerdown", h.onPointerDown);
    if (h.onPointerEnter) element.removeEventListener("pointerenter", h.onPointerEnter);
    if (h.onPointerLeave) element.removeEventListener("pointerleave", h.onPointerLeave);
    this.attached.delete(element);
    this.setLoop(element, null);
  }

  private detachAll(root: HTMLElement): void {
    if (root.nodeType !== 1) return;
    this.detach(root);
    const nodes = root.querySelectorAll?.(`[${this.opts.attr}]`);
    if (nodes) nodes.forEach((n) => this.detach(n as HTMLElement));
  }

  private readIntent(element: HTMLElement): AnimationIntent | null {
    const raw = element.getAttribute(this.opts.attr);
    if (!raw) return null;
    const v = raw.trim().toLowerCase();
    switch (v) {
      case "tap":
      case "hover":
      case "enter":
      case "exit":
      case "success":
      case "error":
      case "attention":
      case "idle":
        return v;
      default:
        return "tap"; // sensible default for unrecognized values
    }
  }

  // ── Spec resolution ───────────────────────────────────────────────

  private resolveSpec(
    intent: AnimationIntent,
    overridePrimitive?: AnimationPrimitive,
  ): KeyframeSpec | null {
    if (this.opts.reducedMotion || this.systemReducedMotion) {
      return REDUCED_MOTION_SPEC;
    }
    const prim =
      overridePrimitive ?? INTENT_OVERRIDES[intent] ?? this.bias;
    const set = PRIMITIVES[prim];
    const spec = set[intent];
    return spec ?? null;
  }

  private refreshLoops(): void {
    // We can't enumerate a WeakMap; instead rescan the DOM and re-apply
    // attention/idle loops so they pick up the new bias.
    if (typeof document === "undefined") return;
    const root = this.opts.root ?? document.body;
    if (!root) return;
    const loopers = root.querySelectorAll<HTMLElement>(
      `[${this.opts.attr}="attention"], [${this.opts.attr}="idle"]`,
    );
    loopers.forEach((el) => {
      const intent = this.readIntent(el);
      if (intent === "attention" || intent === "idle") this.setLoop(el, intent);
    });
  }
}

// ─── Shared instance ─────────────────────────────────────────────────────

let _library: MicroAnimationLibrary | null = null;

export function getMicroAnimationLibrary(): MicroAnimationLibrary {
  if (_library === null) _library = new MicroAnimationLibrary();
  return _library;
}

export function __resetMicroAnimationLibraryForTests(): void {
  if (_library) _library.stop();
  _library = null;
}

// ─── Raw spec access for tests / imperative callers ──────────────────────

export function specFor(
  primitive: AnimationPrimitive,
  intent: AnimationIntent,
): KeyframeSpec | null {
  return PRIMITIVES[primitive][intent];
}

export function biasFor(emotion: Emotion): AnimationPrimitive {
  return EMOTION_BIAS[emotion] ?? "slide";
}
