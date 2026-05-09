/**
 * lib/emotion/EmotionDetectionService.ts
 *
 * On-device emotion inference for the Emotion-Responsive UI (issue #46).
 *
 * Privacy contract
 * ────────────────
 * Every signal, every derived feature, and every emotion estimate stays on
 * this device. Nothing here ever touches the network. There is no fetch(),
 * no WebSocket, no beacon, no analytics call. If this file ever grows one,
 * delete it. The user paid for their own feelings; we do not resell them.
 *
 * Architecture
 * ────────────
 *   ┌──────────────┐   keystrokes    ┌──────────────────────┐
 *   │ ChatInput.tsx│ ──────────────▶ │ EmotionDetection     │
 *   └──────────────┘                 │   ingestKeystroke()  │
 *   ┌──────────────┐   sent msg      │   ingestMessage()    │
 *   │ ChatInput.tsx│ ──────────────▶ │   ingestTap()        │
 *   └──────────────┘                 │                      │
 *   ┌──────────────┐   pointer taps  │   compute()          │
 *   │ AppShell.tsx │ ──────────────▶ │   subscribe()        │
 *   └──────────────┘                 └──────┬───────────────┘
 *                                           │ EmotionEstimate
 *                                           ▼
 *                                 AdaptiveThemeEngine + dashboard
 *
 * The classifier is a small hand-tuned logistic-ish blend rather than a
 * neural net because (a) we want to run inside a 200ms slice on a budget
 * phone, and (b) the features are well correlated with the six canonical
 * states we care about. Confidence below 0.6 is intentionally discarded
 * per the issue spec so the UI does not flip on noise.
 */

// ─── Public types ─────────────────────────────────────────────────────────

/**
 * The six emotional states we expose to the rest of the app. `neutral` is
 * the fallback when no other state crosses the 0.6 confidence threshold.
 */
export type Emotion =
  | "happy"
  | "calm"
  | "excited"
  | "stressed"
  | "sad"
  | "neutral";

export const ALL_EMOTIONS: readonly Emotion[] = [
  "happy",
  "calm",
  "excited",
  "stressed",
  "sad",
  "neutral",
] as const;

export interface EmotionEstimate {
  /** The emotion we are currently reporting to consumers. */
  emotion: Emotion;
  /** 0..1 confidence in the reported emotion. */
  confidence: number;
  /** Per-emotion scores (pre-threshold, softmax-like). Sums to ~1. */
  scores: Record<Emotion, number>;
  /** Epoch ms at which this estimate was computed. */
  at: number;
  /** Snapshot of features that produced this estimate, for debugging. */
  features: EmotionFeatures;
}

export interface EmotionFeatures {
  /** Median inter-keystroke interval, ms. `null` if insufficient data. */
  typingIntervalMedianMs: number | null;
  /** Standard deviation of inter-keystroke intervals, ms. */
  typingIntervalStdMs: number | null;
  /** Keystrokes per minute in the recent window. */
  keystrokesPerMinute: number;
  /** Backspace ratio (0..1) over the recent window. */
  backspaceRatio: number;
  /** CAPS ratio (0..1) over the recent window. */
  capsRatio: number;
  /** Exclamation + question ratio (0..1). */
  exclamationRatio: number;
  /** Net sentiment score in [-1, 1]. */
  sentiment: number;
  /** Positive-emoji density per 100 chars. */
  positiveEmojiRate: number;
  /** Negative-emoji density per 100 chars. */
  negativeEmojiRate: number;
  /** Erratic-tap score (0..1) — coefficient of variation of tap gaps. */
  tapErraticism: number;
  /** Taps per minute in the recent tap window. */
  tapsPerMinute: number;
  /** Local hour of day, 0..23. Used only as a weak prior. */
  hourOfDay: number;
  /** Total number of messages sent during this session. */
  messagesSent: number;
}

export interface EmotionDetectionOptions {
  /** Polling period in ms. Spec says "every 30 seconds". */
  updateIntervalMs?: number;
  /** Alpha for the exponential smoother. 0 = no smoothing, 1 = instant. */
  smoothingAlpha?: number;
  /** Minimum confidence to emit a non-neutral emotion. */
  confidenceThreshold?: number;
  /** Window for recent keystrokes, ms. */
  keystrokeWindowMs?: number;
  /** Window for recent taps, ms. */
  tapWindowMs?: number;
  /** Window for recent messages, ms. */
  messageWindowMs?: number;
  /** Inject a clock for tests. */
  now?: () => number;
}

export type Unsubscribe = () => void;
export type Listener = (estimate: EmotionEstimate) => void;

// ─── Sentiment / emoji lexicons (small, on-device) ────────────────────────

/**
 * A deliberately small sentiment lexicon. It is not meant to rival a
 * transformer model; it exists so a device with no network can still pick
 * up obvious cues like "ugh" vs "yay" without shipping 80MB of weights.
 *
 * Words are lower-cased matched as whole tokens after stripping basic
 * punctuation. Values are [-1, 1].
 */
const SENTIMENT_LEXICON: Record<string, number> = {
  // Positive
  love: 0.9,
  loved: 0.8,
  loves: 0.8,
  amazing: 0.85,
  awesome: 0.85,
  great: 0.7,
  good: 0.6,
  nice: 0.55,
  yay: 0.8,
  yes: 0.4,
  happy: 0.85,
  excited: 0.85,
  thanks: 0.6,
  thank: 0.6,
  cool: 0.55,
  fun: 0.65,
  perfect: 0.8,
  wonderful: 0.85,
  lol: 0.45,
  lmao: 0.55,
  haha: 0.5,
  win: 0.6,
  winning: 0.65,
  cheers: 0.55,
  congrats: 0.8,
  congratulations: 0.85,

  // Negative
  hate: -0.9,
  hated: -0.8,
  hates: -0.8,
  terrible: -0.85,
  awful: -0.85,
  bad: -0.6,
  sad: -0.8,
  depressed: -0.9,
  crying: -0.8,
  tired: -0.5,
  exhausted: -0.65,
  stressed: -0.8,
  anxious: -0.75,
  angry: -0.85,
  mad: -0.7,
  upset: -0.75,
  hurt: -0.7,
  lonely: -0.8,
  alone: -0.45,
  sorry: -0.3,
  ugh: -0.65,
  damn: -0.5,
  sucks: -0.75,
  broke: -0.5,
  broken: -0.6,
  nope: -0.3,
  no: -0.15,
  fail: -0.65,
  failed: -0.7,
  failing: -0.7,
  cant: -0.25,
  wont: -0.2,
};

/** Lightweight negation inverters. Applied to the next token. */
const NEGATORS = new Set(["not", "never", "no", "nope", "dont", "don't", "cant", "can't"]);

/** Intensifiers bump the magnitude of the next token's sentiment. */
const INTENSIFIERS: Record<string, number> = {
  very: 1.4,
  really: 1.4,
  super: 1.5,
  so: 1.2,
  extremely: 1.7,
  "f***ing": 1.6,
  totally: 1.3,
  absolutely: 1.5,
};

/**
 * Emoji buckets for affective signal. Anything missing falls through and
 * contributes neither positive nor negative evidence.
 */
const POSITIVE_EMOJI = new Set([
  "😀", "😃", "😄", "😁", "😆", "😊", "🙂", "😉", "😍", "🥰", "😘", "🤗",
  "🤩", "🥳", "😌", "😎", "🤠", "😇", "🙌", "👏", "👍", "💪", "🔥", "✨",
  "🌟", "⭐", "💖", "❤", "❤️", "💕", "💞", "💓", "🎉", "🎊", "🫶", "🫡",
  "🤝", "😻", "☀️", "🌈", "🌸", "🌻",
]);

const NEGATIVE_EMOJI = new Set([
  "😢", "😭", "😞", "😔", "😟", "🙁", "☹️", "😩", "😫", "😖", "😣", "😓",
  "😰", "😨", "😱", "😡", "🤬", "😤", "😠", "💔", "😪", "🥺", "😮‍💨",
  "🫠", "😵", "😵‍💫", "🤢", "🤮", "🤕", "🤒",
]);

const EXCITED_EMOJI = new Set(["🤩", "🥳", "🎉", "🎊", "🔥", "🚀", "💥", "⚡"]);

// ─── Ring buffers ────────────────────────────────────────────────────────

/**
 * Fixed-capacity ring buffer with timestamp-based eviction. Cheap, no GC
 * pressure, and ideal for the high-frequency keystroke stream.
 */
class RingBuffer<T extends { t: number }> {
  private buf: T[] = [];
  private cap: number;

  constructor(capacity: number) {
    this.cap = Math.max(8, capacity | 0);
  }

  push(item: T): void {
    this.buf.push(item);
    if (this.buf.length > this.cap) {
      this.buf.splice(0, this.buf.length - this.cap);
    }
  }

  pruneOlderThan(tMin: number): void {
    if (this.buf.length === 0) return;
    // Buffer is monotonic in t, so we can do a single linear prune from head.
    let drop = 0;
    while (drop < this.buf.length && this.buf[drop]!.t < tMin) drop++;
    if (drop > 0) this.buf.splice(0, drop);
  }

  snapshot(): T[] {
    return this.buf.slice();
  }

  size(): number {
    return this.buf.length;
  }

  clear(): void {
    this.buf.length = 0;
  }
}

interface KeyEvent {
  t: number;
  /** Raw key string. We only retain category flags, not characters, for privacy. */
  kind: "char" | "backspace" | "enter" | "other";
  /** True if the character was uppercase. */
  upper: boolean;
  /** True if it was `!` or `?`. */
  emphasis: boolean;
}

interface TapEvent {
  t: number;
}

interface MessageEvent {
  t: number;
  length: number;
  sentiment: number;
  positiveEmoji: number;
  negativeEmoji: number;
  excitedEmoji: number;
  exclaim: number;
  caps: number;
}

// ─── Utility: tokenization and sentiment ─────────────────────────────────

/**
 * Split a string into roughly whitespace tokens, stripping trailing
 * punctuation that would otherwise block lexicon matches.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[,.;:()"“”‘’`~]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Iterate through a string's code-point graphemes, yielding surrogate-aware pieces. */
function graphemes(text: string): string[] {
  // Array.from handles most surrogate pairs. Skin-tone modifiers and ZWJs
  // get split, but for our emoji buckets that is fine: we check membership
  // of the base emoji, which already covers the face/hand family we use.
  return Array.from(text);
}

/**
 * Very small sentiment analyser: token lookup, negation flip, intensifier
 * scale. Designed to be decisive on clear cases and silent on ambiguous
 * ones rather than overconfident across the board.
 *
 * Returns a signed score in roughly [-1, 1].
 */
export function scoreSentiment(text: string): number {
  const toks = tokenize(text);
  if (toks.length === 0) return 0;

  let total = 0;
  let hits = 0;
  let negate = false;
  let intensify = 1;

  for (const tok of toks) {
    if (NEGATORS.has(tok)) {
      negate = true;
      continue;
    }
    if (INTENSIFIERS[tok] !== undefined) {
      intensify = INTENSIFIERS[tok]!;
      continue;
    }
    const base = SENTIMENT_LEXICON[tok];
    if (base !== undefined) {
      let v = base * intensify;
      if (negate) v = -v * 0.85;
      total += v;
      hits++;
      negate = false;
      intensify = 1;
    } else {
      // Reset decorators if they don't land on a sentiment word within 1 step.
      negate = false;
      intensify = 1;
    }
  }

  if (hits === 0) return 0;
  // Normalize by sqrt(hits) so a single strong word still registers but a
  // single word in a long rant doesn't dominate.
  const norm = total / Math.sqrt(hits);
  return clamp(norm, -1, 1);
}

/** Count positive / negative emoji occurrences in a string. */
export function scoreEmoji(text: string): {
  positive: number;
  negative: number;
  excited: number;
} {
  let positive = 0;
  let negative = 0;
  let excited = 0;
  for (const g of graphemes(text)) {
    if (POSITIVE_EMOJI.has(g)) positive++;
    if (NEGATIVE_EMOJI.has(g)) negative++;
    if (EXCITED_EMOJI.has(g)) excited++;
  }
  return { positive, negative, excited };
}

// ─── Numeric helpers ─────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function stddev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function softmax(scores: Record<Emotion, number>): Record<Emotion, number> {
  // Subtract max for numeric stability.
  let mx = -Infinity;
  for (const e of ALL_EMOTIONS) if (scores[e] > mx) mx = scores[e];
  let sum = 0;
  const out: Record<Emotion, number> = {
    happy: 0, calm: 0, excited: 0, stressed: 0, sad: 0, neutral: 0,
  };
  for (const e of ALL_EMOTIONS) {
    const v = Math.exp(scores[e] - mx);
    out[e] = v;
    sum += v;
  }
  for (const e of ALL_EMOTIONS) out[e] = sum > 0 ? out[e] / sum : 0;
  return out;
}

// ─── The service ─────────────────────────────────────────────────────────

const DEFAULTS: Required<EmotionDetectionOptions> = {
  updateIntervalMs: 30_000,
  smoothingAlpha: 0.35,
  confidenceThreshold: 0.6,
  keystrokeWindowMs: 90_000,
  tapWindowMs: 60_000,
  messageWindowMs: 5 * 60_000,
  now: () => Date.now(),
};

/**
 * EmotionDetectionService is a singleton-friendly, testable emotion
 * inference pipeline. It accepts low-level interaction events, maintains
 * bounded windows of recent activity, and emits smoothed EmotionEstimate
 * objects to subscribers on a fixed cadence.
 */
export class EmotionDetectionService {
  private readonly opts: Required<EmotionDetectionOptions>;
  private readonly keys = new RingBuffer<KeyEvent>(2048);
  private readonly taps = new RingBuffer<TapEvent>(1024);
  private readonly messages = new RingBuffer<MessageEvent>(256);
  private readonly listeners = new Set<Listener>();

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastEstimate: EmotionEstimate | null = null;
  private smoothed: Record<Emotion, number> = {
    happy: 0, calm: 0, excited: 0, stressed: 0, sad: 0, neutral: 1,
  };
  private messagesSent = 0;

  constructor(options: EmotionDetectionOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  /** Start the periodic compute loop. Safe to call multiple times. */
  start(): void {
    if (this.timer !== null) return;
    // Fire one initial estimate so subscribers don't sit blind for 30s.
    this.tick();
    this.timer = setInterval(() => this.tick(), this.opts.updateIntervalMs);
  }

  /** Stop the periodic loop and clear any buffered interval. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Clear all retained interaction data. The user can invoke this manually. */
  reset(): void {
    this.keys.clear();
    this.taps.clear();
    this.messages.clear();
    this.messagesSent = 0;
    this.smoothed = { happy: 0, calm: 0, excited: 0, stressed: 0, sad: 0, neutral: 1 };
    this.lastEstimate = null;
  }

  // ── Ingestion ──────────────────────────────────────────────────────

  /**
   * Record a single keystroke. We deliberately do not store the character
   * itself; only category flags survive the call so there is nothing
   * meaningful to exfiltrate even if an adversary compromises the buffer.
   */
  ingestKeystroke(key: string): void {
    const t = this.opts.now();
    let kind: KeyEvent["kind"] = "other";
    if (key === "Backspace") kind = "backspace";
    else if (key === "Enter") kind = "enter";
    else if (key.length === 1) kind = "char";

    const isLetter = kind === "char" && /[A-Za-z]/.test(key);
    const upper = isLetter && key.toUpperCase() === key && key.toLowerCase() !== key;
    const emphasis = key === "!" || key === "?";

    this.keys.push({ t, kind, upper, emphasis });
  }

  /** Record a pointer / touch tap. Used for erratic-interaction detection. */
  ingestTap(): void {
    this.taps.push({ t: this.opts.now() });
  }

  /**
   * Record an outgoing message. We run sentiment + emoji locally and only
   * retain the aggregate numbers; the text itself is discarded.
   */
  ingestMessage(text: string): void {
    const t = this.opts.now();
    const len = text.length;
    const sentiment = scoreSentiment(text);
    const emoji = scoreEmoji(text);

    let caps = 0;
    let letters = 0;
    let exclaim = 0;
    for (const ch of text) {
      if (/[A-Za-z]/.test(ch)) {
        letters++;
        if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) caps++;
      }
      if (ch === "!" || ch === "?") exclaim++;
    }

    this.messages.push({
      t,
      length: len,
      sentiment,
      positiveEmoji: emoji.positive,
      negativeEmoji: emoji.negative,
      excitedEmoji: emoji.excited,
      exclaim,
      caps: letters > 0 ? caps / letters : 0,
    });
    this.messagesSent++;
  }

  // ── Subscription ──────────────────────────────────────────────────

  subscribe(listener: Listener): Unsubscribe {
    this.listeners.add(listener);
    // Replay the last estimate so new subscribers are never blank.
    if (this.lastEstimate) listener(this.lastEstimate);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Synchronously return the most recent estimate, or null if none yet. */
  current(): EmotionEstimate | null {
    return this.lastEstimate;
  }

  /** Force an immediate recompute outside of the polling cadence. */
  computeNow(): EmotionEstimate {
    return this.tick();
  }

  // ── Feature extraction ────────────────────────────────────────────

  private extractFeatures(): EmotionFeatures {
    const now = this.opts.now();
    this.keys.pruneOlderThan(now - this.opts.keystrokeWindowMs);
    this.taps.pruneOlderThan(now - this.opts.tapWindowMs);
    this.messages.pruneOlderThan(now - this.opts.messageWindowMs);

    const keys = this.keys.snapshot();
    const taps = this.taps.snapshot();
    const msgs = this.messages.snapshot();

    // Typing intervals
    const charKeys = keys.filter((k) => k.kind === "char");
    const intervals: number[] = [];
    for (let i = 1; i < charKeys.length; i++) {
      const dt = charKeys[i]!.t - charKeys[i - 1]!.t;
      if (dt > 0 && dt < 4000) intervals.push(dt); // ignore idle gaps
    }
    const tMed = median(intervals);
    const tStd = stddev(intervals);

    // KPM
    const windowMin = this.opts.keystrokeWindowMs / 60_000;
    const kpm = charKeys.length / windowMin;

    // Backspace / caps / emphasis
    const totalKeys = keys.length || 1;
    const bsRatio = keys.filter((k) => k.kind === "backspace").length / totalKeys;
    const upperChars = charKeys.filter((k) => k.upper).length;
    const capsRatio = charKeys.length > 0 ? upperChars / charKeys.length : 0;
    const emphasis = keys.filter((k) => k.emphasis).length;
    const exclaimRatio = totalKeys > 0 ? emphasis / totalKeys : 0;

    // Sentiment / emoji rates (message-weighted)
    let sentSum = 0;
    let sentW = 0;
    let posEmoji = 0;
    let negEmoji = 0;
    let totalChars = 0;
    for (const m of msgs) {
      const w = Math.max(1, m.length);
      sentSum += m.sentiment * w;
      sentW += w;
      posEmoji += m.positiveEmoji;
      negEmoji += m.negativeEmoji;
      totalChars += m.length;
    }
    const sentiment = sentW > 0 ? sentSum / sentW : 0;
    const posRate = totalChars > 0 ? (posEmoji * 100) / totalChars : 0;
    const negRate = totalChars > 0 ? (negEmoji * 100) / totalChars : 0;

    // Tap erraticism: CV of inter-tap intervals.
    const tapIntervals: number[] = [];
    for (let i = 1; i < taps.length; i++) {
      const dt = taps[i]!.t - taps[i - 1]!.t;
      if (dt > 0 && dt < 10_000) tapIntervals.push(dt);
    }
    const tapStd = stddev(tapIntervals);
    const tapMean =
      tapIntervals.length > 0
        ? tapIntervals.reduce((a, b) => a + b, 0) / tapIntervals.length
        : 0;
    const tapErratic =
      tapStd !== null && tapMean > 0 ? clamp(tapStd / tapMean, 0, 3) / 3 : 0;
    const tapsPerMin = taps.length / (this.opts.tapWindowMs / 60_000);

    const hour = new Date(now).getHours();

    return {
      typingIntervalMedianMs: tMed,
      typingIntervalStdMs: tStd,
      keystrokesPerMinute: kpm,
      backspaceRatio: bsRatio,
      capsRatio,
      exclamationRatio: exclaimRatio,
      sentiment,
      positiveEmojiRate: posRate,
      negativeEmojiRate: negRate,
      tapErraticism: tapErratic,
      tapsPerMinute: tapsPerMin,
      hourOfDay: hour,
      messagesSent: this.messagesSent,
    };
  }

  // ── Classifier ────────────────────────────────────────────────────

  /**
   * Hand-tuned emotion scorer. Each emotion has a set of weighted
   * conditions; we accumulate raw scores and then push through softmax to
   * produce a probability-like distribution. Weights are intentionally
   * mild so no single feature can single-handedly trigger a flip.
   */
  private scoreEmotions(f: EmotionFeatures): Record<Emotion, number> {
    const scores: Record<Emotion, number> = {
      happy: 0,
      calm: 0,
      excited: 0,
      stressed: 0,
      sad: 0,
      neutral: 0.3, // baseline so we don't starve toward zero
    };

    // Typing speed shape.
    if (f.typingIntervalMedianMs !== null) {
      const med = f.typingIntervalMedianMs;
      if (med < 120) {
        scores.excited += 0.7;
        scores.stressed += 0.3;
      } else if (med < 200) {
        scores.excited += 0.3;
        scores.happy += 0.3;
      } else if (med < 350) {
        scores.calm += 0.4;
        scores.neutral += 0.2;
      } else if (med < 600) {
        scores.calm += 0.3;
        scores.sad += 0.2;
      } else {
        scores.sad += 0.5;
      }
    }

    // Variability: erratic typing (high std) hints at stress / excitement.
    if (f.typingIntervalStdMs !== null && f.typingIntervalMedianMs !== null) {
      const cv = f.typingIntervalStdMs / Math.max(1, f.typingIntervalMedianMs);
      if (cv > 1.2) {
        scores.stressed += 0.4;
        scores.excited += 0.2;
      } else if (cv < 0.4) {
        scores.calm += 0.2;
      }
    }

    // Backspaces: more deletes ⇒ more frustration / uncertainty.
    if (f.backspaceRatio > 0.2) scores.stressed += 0.5;
    else if (f.backspaceRatio > 0.1) scores.stressed += 0.2;

    // CAPS and emphasis.
    if (f.capsRatio > 0.4) {
      scores.excited += 0.4;
      scores.stressed += 0.25;
    }
    if (f.exclamationRatio > 0.04) {
      scores.excited += 0.35;
      scores.happy += 0.2;
    }

    // Sentiment pulls happy/sad directly.
    if (f.sentiment > 0.3) {
      scores.happy += 0.6 + 0.4 * f.sentiment;
      scores.excited += 0.2 * f.sentiment;
    } else if (f.sentiment < -0.3) {
      scores.sad += 0.6 + 0.4 * -f.sentiment;
      scores.stressed += 0.25 * -f.sentiment;
    } else {
      scores.neutral += 0.2;
    }

    // Emoji rates.
    if (f.positiveEmojiRate > 1.0) scores.happy += 0.35;
    if (f.positiveEmojiRate > 2.5) scores.excited += 0.3;
    if (f.negativeEmojiRate > 0.5) scores.sad += 0.4;
    if (f.negativeEmojiRate > 1.5) scores.stressed += 0.25;

    // Tap patterns.
    if (f.tapErraticism > 0.6) scores.stressed += 0.45;
    if (f.tapsPerMinute > 40) scores.excited += 0.25;
    if (f.tapsPerMinute < 4) scores.calm += 0.2;

    // Very mild circadian prior. Late night ⇒ slightly more calm/sad;
    // midday ⇒ slightly more neutral. This is a nudge, not a verdict.
    const h = f.hourOfDay;
    if (h >= 0 && h < 6) {
      scores.calm += 0.1;
      scores.sad += 0.1;
    } else if (h >= 22) {
      scores.calm += 0.15;
    } else if (h >= 9 && h <= 17) {
      scores.neutral += 0.1;
    }

    // If we have basically no signal at all, lean neutral hard.
    const anySignal =
      f.typingIntervalMedianMs !== null ||
      f.messagesSent > 0 ||
      f.tapsPerMinute > 0;
    if (!anySignal) scores.neutral += 1.2;

    return softmax(scores);
  }

  // ── Tick ──────────────────────────────────────────────────────────

  private tick(): EmotionEstimate {
    const features = this.extractFeatures();
    const raw = this.scoreEmotions(features);

    // Exponential smoothing to avoid visual flicker between polls.
    const a = this.opts.smoothingAlpha;
    const next: Record<Emotion, number> = {
      happy: 0, calm: 0, excited: 0, stressed: 0, sad: 0, neutral: 0,
    };
    for (const e of ALL_EMOTIONS) {
      next[e] = a * raw[e] + (1 - a) * this.smoothed[e];
    }
    this.smoothed = next;

    // Pick argmax from the *smoothed* distribution.
    let best: Emotion = "neutral";
    let bestV = -Infinity;
    for (const e of ALL_EMOTIONS) {
      if (next[e] > bestV) {
        bestV = next[e];
        best = e;
      }
    }

    // Apply the confidence threshold: below it we report neutral but keep
    // the scores so consumers can still see what was almost a match.
    const chosen: Emotion = bestV >= this.opts.confidenceThreshold ? best : "neutral";
    const confidence = bestV;

    const estimate: EmotionEstimate = {
      emotion: chosen,
      confidence,
      scores: next,
      at: this.opts.now(),
      features,
    };

    this.lastEstimate = estimate;
    for (const l of this.listeners) {
      try {
        l(estimate);
      } catch {
        // Swallow listener errors — a buggy consumer must not kill the loop.
      }
    }
    return estimate;
  }
}

// ─── Module-level singleton (browser only) ────────────────────────────────

let _singleton: EmotionDetectionService | null = null;

/**
 * Return (and lazily construct) the shared EmotionDetectionService. On the
 * server we still return an instance; it just never gets ticks because
 * callers don't call start() outside of the client shell.
 */
export function getEmotionDetectionService(): EmotionDetectionService {
  if (_singleton === null) _singleton = new EmotionDetectionService();
  return _singleton;
}

/** Test-only reset hook. */
export function __resetEmotionSingletonForTests(): void {
  if (_singleton) _singleton.stop();
  _singleton = null;
}
