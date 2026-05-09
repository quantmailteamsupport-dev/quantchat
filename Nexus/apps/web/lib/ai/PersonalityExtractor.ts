/**
 * PersonalityExtractor.ts
 *
 * Part of the Quantchat Digital Twin subsystem.
 *
 * This module analyses a corpus of messages authored by a single user and
 * distills a compact, deterministic "style fingerprint" that downstream
 * components (AutoReplyEngine, TwinProfileCard) can use to imitate the user
 * or render their profile.
 *
 * Design goals:
 *  - Zero network calls. All analysis is pure + local.
 *  - Deterministic: identical inputs produce identical outputs.
 *  - Incremental: profiles can be merged so we do not have to re-scan the
 *    entire conversation history on every update.
 *  - Privacy-friendly: the fingerprint never stores raw plaintext sentences
 *    beyond short exemplars (<= 140 chars), and frequency tables are capped.
 *
 * The features extracted are intentionally simple statistical/lexical
 * signals — a far cry from a real LoRA fine-tune — but they're rich enough
 * to drive convincing prompt conditioning and a fun profile UI.
 */

// ─── Public Types ───────────────────────────────────────────────────────────

/**
 * A single message from the user's history.
 *
 * `authorId` is required so the extractor can safely be fed mixed
 * conversations — it will ignore messages not authored by the target.
 */
export interface TwinMessage {
  id: string;
  authorId: string;
  text: string;
  /** Epoch ms; used for cadence / reply-latency features. */
  timestamp: number;
  /** Optional — id of the message this one replied to. */
  replyTo?: string;
  /** Optional — conversation / channel identifier. */
  conversationId?: string;
}

/**
 * Frequency map keyed by token / emoji / phrase.
 * Values are raw counts.
 */
export type FrequencyMap = Record<string, number>;

/**
 * A single categorical trait inferred from the corpus.
 * Scores are normalised to [0,1] where 1 means "very strong".
 */
export interface PersonalityTrait {
  /** Canonical key (e.g. "playful", "formal"). */
  key: string;
  /** Human readable name for the UI. */
  label: string;
  /** 0-1 score. */
  score: number;
  /** Optional short description used as a tooltip. */
  description?: string;
}

/**
 * The complete style fingerprint.
 *
 * This object is stable, serialisable, and safe to persist to Dexie /
 * ship across the wire for the purposes of rendering a profile card.
 */
export interface PersonalityProfile {
  /** User this profile describes. */
  userId: string;
  /** Schema version for forward compatibility. */
  version: number;
  /** Total number of messages that went into this fingerprint. */
  sampleSize: number;
  /** Total tokens consumed. */
  tokenCount: number;
  /** First / last timestamp seen, epoch ms. */
  timeRange: { firstSeen: number; lastSeen: number };
  /** Aggregate writing style. */
  style: StyleFeatures;
  /** Emoji usage patterns. */
  emoji: EmojiFeatures;
  /** Lexical habits — top words, catchphrases, slang. */
  lexicon: LexiconFeatures;
  /** Response latency / cadence. */
  cadence: CadenceFeatures;
  /** Sentiment / emotional skew. */
  sentiment: SentimentFeatures;
  /** Ranked high level traits (for the UI). */
  traits: PersonalityTrait[];
  /** Short example messages (sanitised, <=140 chars). */
  exemplars: string[];
  /** When this profile was produced. */
  updatedAt: number;
}

export interface StyleFeatures {
  /** Average character length of a message. */
  avgLength: number;
  /** Average word count per message. */
  avgWords: number;
  /** Standard deviation of word count. */
  wordStdDev: number;
  /** 0-1 — how often the user uses uppercase shouting. */
  shoutiness: number;
  /** 0-1 — ratio of ALL-lower-case messages (casualness). */
  lowerCaseRatio: number;
  /** 0-1 — punctuation density. */
  punctuationDensity: number;
  /** 0-1 — question mark usage. */
  inquisitiveness: number;
  /** 0-1 — exclamation usage. */
  enthusiasm: number;
  /** 0-1 — ellipsis / trailing dots. */
  trailiness: number;
  /** 0-1 — contractions (e.g. "don't", "can't"). */
  contractionRate: number;
  /** 0-1 — expletives / profanity. */
  profanity: number;
  /** 0-1 — formality score (presence of formal connectors vs slang). */
  formality: number;
  /** 0-1 — verbosity (tends to long messages). */
  verbosity: number;
}

export interface EmojiFeatures {
  /** 0-1 — probability that any given message contains at least one emoji. */
  usageRate: number;
  /** 0-1 — average emojis per message, soft-capped to 1.0. */
  densityPerMessage: number;
  /** Top emojis with counts. */
  top: { emoji: string; count: number }[];
  /** Emotional skew from emoji set alone. */
  emojiSentiment: number; // -1..1
}

export interface LexiconFeatures {
  /** Top non-stopword tokens. */
  topWords: { word: string; count: number }[];
  /** Phrases (2-3 grams) that repeat. */
  catchphrases: { phrase: string; count: number }[];
  /** Slang terms found in the corpus. */
  slang: { word: string; count: number }[];
  /** Internet abbreviations (lol, lmao, omg...). */
  abbreviations: { word: string; count: number }[];
  /** 0-1 — lexical diversity (type/token ratio, capped). */
  diversity: number;
  /** 0-1 — slang intensity. */
  slangRate: number;
}

export interface CadenceFeatures {
  /** Average time between this user's consecutive messages (ms). */
  avgIntraGapMs: number;
  /** Average reply latency when responding to someone (ms). */
  avgReplyLatencyMs: number;
  /** Number of double-text bursts (two or more msgs within 60s). */
  burstiness: number; // 0-1 normalised
  /** Hour-of-day histogram (0-23) normalised. */
  hourHistogram: number[];
}

export interface SentimentFeatures {
  /** -1..1 — average sentiment. */
  mean: number;
  /** 0..1 — stdev of sentiment across messages. */
  volatility: number;
  /** 0..1 — share of clearly positive messages. */
  positiveShare: number;
  /** 0..1 — share of clearly negative messages. */
  negativeShare: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const PROFILE_SCHEMA_VERSION = 1;

/** Upper bound on how many items we keep in top-N tables. */
const MAX_TOP_ITEMS = 24;

/** Minimum samples required to produce a high-confidence profile. */
export const MIN_SAMPLES_FOR_CONFIDENT_PROFILE = 20;

// A compact English stopword list. We keep it intentionally short so that
// common but *meaningful-in-style* words like "literally" still surface.
const STOPWORDS = new Set<string>([
  "the", "a", "an", "and", "or", "but", "if", "then", "of", "to", "in",
  "on", "at", "is", "are", "was", "were", "be", "been", "being", "am",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us",
  "them", "my", "your", "his", "its", "our", "their", "this", "that",
  "these", "those", "for", "with", "as", "by", "from", "so", "do", "does",
  "did", "have", "has", "had", "not", "no", "yes", "can", "just", "will",
  "would", "should", "could", "about", "up", "down", "out", "there",
  "here", "when", "what", "who", "how", "why", "also", "all", "some",
  "any", "one", "two", "like", "now", "get", "got", "go", "going",
  "yeah", "yep", "ok", "okay", "well", "really", "very",
]);

// Slang / internet lexicon. The list is not exhaustive but captures the
// kind of tokens that wildly change the tone of a twin's generated reply.
const SLANG_DICTIONARY = new Set<string>([
  "bruh", "bet", "lowkey", "highkey", "slay", "vibe", "vibes", "goated",
  "bussin", "cap", "nocap", "deadass", "fr", "ngl", "mid", "sus",
  "yeet", "based", "cringe", "fam", "dope", "lit", "rizz", "sheesh",
  "gyatt", "aura", "drip", "salty", "finna", "wya", "wyd", "hbu",
  "imo", "tbh", "imho", "gl", "hf", "gg", "oomf", "mood", "flex",
]);

const ABBREVIATIONS = new Set<string>([
  "lol", "lmao", "lmfao", "rofl", "omg", "omfg", "wtf", "idk", "idc",
  "ik", "tbh", "ngl", "brb", "afk", "rn", "ur", "u", "w", "l",
  "btw", "smh", "ffs", "tf", "fyi", "imo", "imho", "ily", "iykyk",
  "bff", "bffr", "bffl", "nvm", "np", "gtg", "ttyl", "ig", "pls",
  "plz", "thx", "ty", "tysm", "yw", "ofc", "jk", "dm", "dms",
]);

const PROFANITY = new Set<string>([
  "fuck", "shit", "damn", "bitch", "crap", "bastard", "ass", "asshole",
  "dick", "piss", "hell", "bollocks",
]);

const CONTRACTIONS = [
  /\bdon['’]t\b/i, /\bcan['’]t\b/i, /\bwon['’]t\b/i, /\bisn['’]t\b/i,
  /\baren['’]t\b/i, /\bwasn['’]t\b/i, /\bweren['’]t\b/i, /\bdidn['’]t\b/i,
  /\bhasn['’]t\b/i, /\bhaven['’]t\b/i, /\bhadn['’]t\b/i, /\bshouldn['’]t\b/i,
  /\bwouldn['’]t\b/i, /\bcouldn['’]t\b/i, /\bi['’]m\b/i, /\byou['’]re\b/i,
  /\bthey['’]re\b/i, /\bwe['’]re\b/i, /\bit['’]s\b/i, /\bthat['’]s\b/i,
  /\bi['’]ll\b/i, /\byou['’]ll\b/i, /\bi['’]ve\b/i, /\byou['’]ve\b/i,
];

const FORMAL_CONNECTORS = [
  "however", "therefore", "furthermore", "moreover", "consequently",
  "nevertheless", "accordingly", "additionally", "regarding", "pursuant",
];

const POSITIVE_LEXICON = new Set<string>([
  "love", "great", "amazing", "awesome", "cool", "nice", "fun", "happy",
  "glad", "excited", "thanks", "thank", "beautiful", "perfect", "wonderful",
  "fantastic", "best", "win", "winning", "lit", "dope", "goated", "based",
  "yay", "hype", "good",
]);

const NEGATIVE_LEXICON = new Set<string>([
  "hate", "bad", "awful", "terrible", "worst", "annoying", "sucks",
  "angry", "sad", "upset", "tired", "bored", "cringe", "mid",
  "ugh", "ew", "gross", "boring", "depressed", "stressed",
]);

// Emoji detection regex — matches a pragmatic union of emoji ranges.
// We avoid `\p{Emoji}` Unicode property escape to stay compatible with
// older TS targets; this is intentionally permissive.
const EMOJI_REGEX = /[\u{1F1E6}-\u{1F1FF}]|[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{2700}-\u{27BF}]/gu;

// A best-effort emoji-sentiment map. Positive > 0, negative < 0.
const EMOJI_SENTIMENT: Record<string, number> = {
  "😀": 0.8, "😁": 0.8, "😂": 0.7, "🤣": 0.7, "😊": 0.7, "😍": 0.9,
  "🥰": 0.9, "😘": 0.8, "😎": 0.5, "🤩": 0.9, "😇": 0.6, "😄": 0.8,
  "😆": 0.7, "🙂": 0.3, "🙃": 0.1, "😉": 0.4, "😌": 0.4, "😋": 0.5,
  "🤗": 0.6, "❤️": 0.9, "💖": 0.9, "💗": 0.8, "💙": 0.7, "💚": 0.7,
  "💛": 0.7, "💜": 0.7, "🧡": 0.7, "🤍": 0.5, "🔥": 0.6, "✨": 0.6,
  "🎉": 0.8, "🙌": 0.7, "👏": 0.6, "👍": 0.5, "💪": 0.5,
  "😞": -0.6, "😔": -0.6, "😢": -0.7, "😭": -0.6, "😿": -0.5, "☹️": -0.6,
  "😠": -0.7, "😡": -0.8, "🤬": -0.9, "🙁": -0.4, "😒": -0.4, "😕": -0.3,
  "😩": -0.5, "😫": -0.5, "😣": -0.4, "🥺": -0.2, "💔": -0.8, "👎": -0.6,
  "😬": -0.2, "🤢": -0.6, "🤮": -0.8,
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Build a PersonalityProfile for `userId` from a heterogeneous message list.
 *
 * Messages authored by other users are ignored (but may be used as context
 * in future iterations for relationship modelling).
 */
export function extractPersonalityProfile(
  userId: string,
  messages: TwinMessage[]
): PersonalityProfile {
  const own = messages.filter((m) => m.authorId === userId && m.text && m.text.trim().length > 0);

  const now = Date.now();
  if (own.length === 0) {
    return emptyProfile(userId, now);
  }

  const style = computeStyleFeatures(own);
  const emoji = computeEmojiFeatures(own);
  const lexicon = computeLexiconFeatures(own);
  const cadence = computeCadenceFeatures(userId, messages);
  const sentiment = computeSentimentFeatures(own, emoji);

  const traits = deriveTraits({ style, emoji, lexicon, cadence, sentiment });
  const exemplars = pickExemplars(own);

  const tokenCount = own.reduce((sum, m) => sum + tokenize(m.text).length, 0);
  const times = own.map((m) => m.timestamp);

  return {
    userId,
    version: PROFILE_SCHEMA_VERSION,
    sampleSize: own.length,
    tokenCount,
    timeRange: {
      firstSeen: Math.min(...times),
      lastSeen: Math.max(...times),
    },
    style,
    emoji,
    lexicon,
    cadence,
    sentiment,
    traits,
    exemplars,
    updatedAt: now,
  };
}

/**
 * Merge an existing profile with *new* messages without re-processing the
 * original corpus. This is a weighted average — useful when a twin has been
 * running for weeks and you just want to fold in today's messages.
 *
 * The merge is approximate: higher-order features (stdev, histogram shape)
 * will drift slightly vs. a full recompute, but the error is bounded and
 * shrinks as sampleSize grows. For periodic full rebuilds, call
 * {@link extractPersonalityProfile} directly with the full corpus.
 */
export function mergePersonalityProfile(
  previous: PersonalityProfile,
  newMessages: TwinMessage[]
): PersonalityProfile {
  const freshProfile = extractPersonalityProfile(previous.userId, newMessages);
  if (freshProfile.sampleSize === 0) return previous;
  if (previous.sampleSize === 0) return freshProfile;

  const a = previous.sampleSize;
  const b = freshProfile.sampleSize;
  const total = a + b;
  const wA = a / total;
  const wB = b / total;

  const blend = (x: number, y: number) => x * wA + y * wB;

  const style: StyleFeatures = {
    avgLength: blend(previous.style.avgLength, freshProfile.style.avgLength),
    avgWords: blend(previous.style.avgWords, freshProfile.style.avgWords),
    wordStdDev: blend(previous.style.wordStdDev, freshProfile.style.wordStdDev),
    shoutiness: blend(previous.style.shoutiness, freshProfile.style.shoutiness),
    lowerCaseRatio: blend(previous.style.lowerCaseRatio, freshProfile.style.lowerCaseRatio),
    punctuationDensity: blend(previous.style.punctuationDensity, freshProfile.style.punctuationDensity),
    inquisitiveness: blend(previous.style.inquisitiveness, freshProfile.style.inquisitiveness),
    enthusiasm: blend(previous.style.enthusiasm, freshProfile.style.enthusiasm),
    trailiness: blend(previous.style.trailiness, freshProfile.style.trailiness),
    contractionRate: blend(previous.style.contractionRate, freshProfile.style.contractionRate),
    profanity: blend(previous.style.profanity, freshProfile.style.profanity),
    formality: blend(previous.style.formality, freshProfile.style.formality),
    verbosity: blend(previous.style.verbosity, freshProfile.style.verbosity),
  };

  const emoji: EmojiFeatures = {
    usageRate: blend(previous.emoji.usageRate, freshProfile.emoji.usageRate),
    densityPerMessage: blend(previous.emoji.densityPerMessage, freshProfile.emoji.densityPerMessage),
    top: mergeTop(previous.emoji.top, freshProfile.emoji.top, "emoji"),
    emojiSentiment: blend(previous.emoji.emojiSentiment, freshProfile.emoji.emojiSentiment),
  };

  const lexicon: LexiconFeatures = {
    topWords: mergeTop(previous.lexicon.topWords, freshProfile.lexicon.topWords, "word"),
    catchphrases: mergeTop(previous.lexicon.catchphrases, freshProfile.lexicon.catchphrases, "phrase"),
    slang: mergeTop(previous.lexicon.slang, freshProfile.lexicon.slang, "word"),
    abbreviations: mergeTop(previous.lexicon.abbreviations, freshProfile.lexicon.abbreviations, "word"),
    diversity: blend(previous.lexicon.diversity, freshProfile.lexicon.diversity),
    slangRate: blend(previous.lexicon.slangRate, freshProfile.lexicon.slangRate),
  };

  const cadence: CadenceFeatures = {
    avgIntraGapMs: blend(previous.cadence.avgIntraGapMs, freshProfile.cadence.avgIntraGapMs),
    avgReplyLatencyMs: blend(previous.cadence.avgReplyLatencyMs, freshProfile.cadence.avgReplyLatencyMs),
    burstiness: blend(previous.cadence.burstiness, freshProfile.cadence.burstiness),
    hourHistogram: previous.cadence.hourHistogram.map((v, i) =>
      blend(v, freshProfile.cadence.hourHistogram[i] ?? 0)
    ),
  };

  const sentiment: SentimentFeatures = {
    mean: blend(previous.sentiment.mean, freshProfile.sentiment.mean),
    volatility: blend(previous.sentiment.volatility, freshProfile.sentiment.volatility),
    positiveShare: blend(previous.sentiment.positiveShare, freshProfile.sentiment.positiveShare),
    negativeShare: blend(previous.sentiment.negativeShare, freshProfile.sentiment.negativeShare),
  };

  const merged: PersonalityProfile = {
    userId: previous.userId,
    version: PROFILE_SCHEMA_VERSION,
    sampleSize: total,
    tokenCount: previous.tokenCount + freshProfile.tokenCount,
    timeRange: {
      firstSeen: Math.min(previous.timeRange.firstSeen, freshProfile.timeRange.firstSeen),
      lastSeen: Math.max(previous.timeRange.lastSeen, freshProfile.timeRange.lastSeen),
    },
    style,
    emoji,
    lexicon,
    cadence,
    sentiment,
    traits: deriveTraits({ style, emoji, lexicon, cadence, sentiment }),
    exemplars: mergeExemplars(previous.exemplars, freshProfile.exemplars),
    updatedAt: Date.now(),
  };

  return merged;
}

/**
 * Return a short English summary of the top traits. Useful for prompt
 * conditioning ("You are a twin whose style is: casual, playful, …").
 */
export function summarizeProfile(profile: PersonalityProfile): string {
  if (profile.sampleSize === 0) {
    return "No conversation history available yet.";
  }
  const topTraits = profile.traits.slice(0, 4).map((t) => t.label.toLowerCase());
  const emojiBits = profile.emoji.top.slice(0, 3).map((e) => e.emoji).join(" ");
  const slang = profile.lexicon.slang.slice(0, 3).map((s) => s.word).join(", ");

  const parts: string[] = [];
  parts.push(`Style: ${topTraits.join(", ") || "balanced"}.`);
  parts.push(
    `Typical message ~${Math.round(profile.style.avgWords)} words, ${
      profile.emoji.usageRate > 0.5 ? "emoji-heavy" : "emoji-light"
    }${emojiBits ? ` (${emojiBits})` : ""}.`
  );
  if (slang) parts.push(`Slang of choice: ${slang}.`);
  if (profile.style.contractionRate > 0.4) parts.push("Uses contractions often.");
  if (profile.style.formality > 0.5) parts.push("Leans formal.");
  else if (profile.style.formality < 0.2) parts.push("Very casual.");

  return parts.join(" ");
}

/**
 * Render the set of traits as a compact pill array suitable for a profile
 * card. Scores are already in 0-1; this just formats them.
 */
export function traitsForDisplay(profile: PersonalityProfile): PersonalityTrait[] {
  return profile.traits
    .filter((t) => t.score >= 0.15)
    .slice(0, 10)
    .map((t) => ({ ...t, score: Math.round(t.score * 100) / 100 }));
}

// ─── Internals ──────────────────────────────────────────────────────────────

function emptyProfile(userId: string, now: number): PersonalityProfile {
  return {
    userId,
    version: PROFILE_SCHEMA_VERSION,
    sampleSize: 0,
    tokenCount: 0,
    timeRange: { firstSeen: now, lastSeen: now },
    style: {
      avgLength: 0,
      avgWords: 0,
      wordStdDev: 0,
      shoutiness: 0,
      lowerCaseRatio: 0,
      punctuationDensity: 0,
      inquisitiveness: 0,
      enthusiasm: 0,
      trailiness: 0,
      contractionRate: 0,
      profanity: 0,
      formality: 0.5,
      verbosity: 0,
    },
    emoji: { usageRate: 0, densityPerMessage: 0, top: [], emojiSentiment: 0 },
    lexicon: {
      topWords: [],
      catchphrases: [],
      slang: [],
      abbreviations: [],
      diversity: 0,
      slangRate: 0,
    },
    cadence: {
      avgIntraGapMs: 0,
      avgReplyLatencyMs: 0,
      burstiness: 0,
      hourHistogram: new Array(24).fill(0) as number[],
    },
    sentiment: { mean: 0, volatility: 0, positiveShare: 0, negativeShare: 0 },
    traits: [],
    exemplars: [],
    updatedAt: now,
  };
}

function computeStyleFeatures(msgs: TwinMessage[]): StyleFeatures {
  const n = msgs.length;
  let totalChars = 0;
  let totalWords = 0;
  let shoutCount = 0;
  let lowerCount = 0;
  let punctChars = 0;
  let qCount = 0;
  let exclCount = 0;
  let trailCount = 0;
  let contractionMatches = 0;
  let profanityHits = 0;
  let formalHits = 0;
  let longCount = 0;

  const wordCounts: number[] = [];

  for (const m of msgs) {
    const t = m.text;
    totalChars += t.length;
    const words = tokenize(t);
    totalWords += words.length;
    wordCounts.push(words.length);

    if (words.length > 20) longCount++;

    const letters = t.replace(/[^A-Za-z]/g, "");
    if (letters.length >= 4 && letters === letters.toUpperCase()) shoutCount++;
    if (letters.length >= 4 && letters === letters.toLowerCase()) lowerCount++;

    punctChars += (t.match(/[.,!?;:…\-—]/g) || []).length;
    qCount += (t.match(/\?/g) || []).length > 0 ? 1 : 0;
    exclCount += (t.match(/!/g) || []).length > 0 ? 1 : 0;
    trailCount += /(\.{2,}|…)\s*$/.test(t) ? 1 : 0;

    for (const rx of CONTRACTIONS) {
      if (rx.test(t)) {
        contractionMatches++;
        break;
      }
    }

    const lower = t.toLowerCase();
    for (const w of words) {
      if (PROFANITY.has(w.toLowerCase())) profanityHits++;
    }
    for (const f of FORMAL_CONNECTORS) {
      if (lower.includes(f)) formalHits++;
    }
  }

  const avgWords = totalWords / n;
  const wordStdDev = stddev(wordCounts, avgWords);

  const slangHits = countMatching(msgs, SLANG_DICTIONARY) + countMatching(msgs, ABBREVIATIONS);
  const formality = clamp01(
    0.5 + 0.05 * formalHits - 0.02 * slangHits - 0.02 * profanityHits
  );

  return {
    avgLength: totalChars / n,
    avgWords,
    wordStdDev,
    shoutiness: clamp01(shoutCount / n),
    lowerCaseRatio: clamp01(lowerCount / n),
    punctuationDensity: clamp01(punctChars / Math.max(1, totalChars) * 10),
    inquisitiveness: clamp01(qCount / n),
    enthusiasm: clamp01(exclCount / n),
    trailiness: clamp01(trailCount / n),
    contractionRate: clamp01(contractionMatches / n),
    profanity: clamp01(profanityHits / Math.max(1, totalWords) * 20),
    formality,
    verbosity: clamp01(longCount / n),
  };
}

function computeEmojiFeatures(msgs: TwinMessage[]): EmojiFeatures {
  const counts: FrequencyMap = {};
  let msgsWithEmoji = 0;
  let totalEmoji = 0;
  let sentimentSum = 0;
  let sentimentSamples = 0;

  for (const m of msgs) {
    const matches = m.text.match(EMOJI_REGEX);
    if (!matches || matches.length === 0) continue;
    msgsWithEmoji++;
    totalEmoji += matches.length;
    for (const e of matches) {
      counts[e] = (counts[e] ?? 0) + 1;
      if (EMOJI_SENTIMENT[e] !== undefined) {
        sentimentSum += EMOJI_SENTIMENT[e];
        sentimentSamples++;
      }
    }
  }

  const top = toTopN(counts, MAX_TOP_ITEMS).map(([emoji, count]) => ({ emoji, count }));

  return {
    usageRate: clamp01(msgsWithEmoji / msgs.length),
    densityPerMessage: clamp01(totalEmoji / msgs.length / 3),
    top,
    emojiSentiment: sentimentSamples > 0 ? clampRange(sentimentSum / sentimentSamples, -1, 1) : 0,
  };
}

function computeLexiconFeatures(msgs: TwinMessage[]): LexiconFeatures {
  const wordCounts: FrequencyMap = {};
  const slangCounts: FrequencyMap = {};
  const abbrevCounts: FrequencyMap = {};
  const bigramCounts: FrequencyMap = {};
  const trigramCounts: FrequencyMap = {};
  let totalTokens = 0;

  for (const m of msgs) {
    const tokens = tokenize(m.text).map((t) => t.toLowerCase());
    totalTokens += tokens.length;
    for (let i = 0; i < tokens.length; i++) {
      const w = tokens[i]!;
      if (!w) continue;
      if (SLANG_DICTIONARY.has(w)) slangCounts[w] = (slangCounts[w] ?? 0) + 1;
      if (ABBREVIATIONS.has(w)) abbrevCounts[w] = (abbrevCounts[w] ?? 0) + 1;
      if (!STOPWORDS.has(w) && w.length >= 3) {
        wordCounts[w] = (wordCounts[w] ?? 0) + 1;
      }
      if (i + 1 < tokens.length) {
        const bg = `${tokens[i]} ${tokens[i + 1]}`;
        if (!isStopBigram(tokens[i]!, tokens[i + 1]!)) {
          bigramCounts[bg] = (bigramCounts[bg] ?? 0) + 1;
        }
      }
      if (i + 2 < tokens.length) {
        const tg = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
        trigramCounts[tg] = (trigramCounts[tg] ?? 0) + 1;
      }
    }
  }

  const topWords = toTopN(wordCounts, MAX_TOP_ITEMS).map(([word, count]) => ({ word, count }));
  const slang = toTopN(slangCounts, MAX_TOP_ITEMS).map(([word, count]) => ({ word, count }));
  const abbreviations = toTopN(abbrevCounts, MAX_TOP_ITEMS).map(([word, count]) => ({ word, count }));

  const phrases: { phrase: string; count: number }[] = [];
  for (const [phrase, count] of toTopN(trigramCounts, MAX_TOP_ITEMS)) {
    if (count >= 2) phrases.push({ phrase, count });
  }
  for (const [phrase, count] of toTopN(bigramCounts, MAX_TOP_ITEMS)) {
    if (count >= 3 && !phrases.some((p) => p.phrase.includes(phrase))) {
      phrases.push({ phrase, count });
    }
  }
  phrases.sort((a, b) => b.count - a.count);

  const slangTotal = sumValues(slangCounts) + sumValues(abbrevCounts);
  const slangRate = totalTokens > 0 ? slangTotal / totalTokens : 0;
  const uniqueTokens = Object.keys(wordCounts).length;
  const diversity = totalTokens > 0 ? clamp01((uniqueTokens / totalTokens) * 2) : 0;

  return {
    topWords,
    catchphrases: phrases.slice(0, MAX_TOP_ITEMS),
    slang,
    abbreviations,
    diversity,
    slangRate: clamp01(slangRate * 8),
  };
}

function computeCadenceFeatures(userId: string, allMessages: TwinMessage[]): CadenceFeatures {
  const sorted = [...allMessages].sort((a, b) => a.timestamp - b.timestamp);
  const hourHist = new Array(24).fill(0) as number[];
  const intraGaps: number[] = [];
  const replyLatencies: number[] = [];
  let bursts = 0;

  let prevOwn: TwinMessage | undefined;
  let prevOther: TwinMessage | undefined;
  let ownCount = 0;

  for (const m of sorted) {
    const isOwn = m.authorId === userId;
    if (isOwn) {
      ownCount++;
      const h = new Date(m.timestamp).getHours();
      hourHist[h] = (hourHist[h] ?? 0) + 1;

      if (prevOwn) {
        const gap = m.timestamp - prevOwn.timestamp;
        if (gap > 0 && gap < 1000 * 60 * 60 * 6) {
          intraGaps.push(gap);
          if (gap <= 60 * 1000) bursts++;
        }
      }
      if (prevOther) {
        const lat = m.timestamp - prevOther.timestamp;
        if (lat > 0 && lat < 1000 * 60 * 60 * 48) {
          replyLatencies.push(lat);
        }
        prevOther = undefined;
      }
      prevOwn = m;
    } else {
      prevOther = m;
    }
  }

  const normHist = hourHist.map((v) => (ownCount > 0 ? v / ownCount : 0));
  const avgIntraGapMs = mean(intraGaps);
  const avgReplyLatencyMs = mean(replyLatencies);
  const burstiness = ownCount > 0 ? clamp01(bursts / ownCount) : 0;

  return { avgIntraGapMs, avgReplyLatencyMs, burstiness, hourHistogram: normHist };
}

function computeSentimentFeatures(
  msgs: TwinMessage[],
  emoji: EmojiFeatures
): SentimentFeatures {
  const perMsg: number[] = [];
  let positive = 0;
  let negative = 0;

  for (const m of msgs) {
    const tokens = tokenize(m.text).map((t) => t.toLowerCase());
    let score = 0;
    let denom = 0;
    for (const t of tokens) {
      if (POSITIVE_LEXICON.has(t)) {
        score += 1;
        denom++;
      } else if (NEGATIVE_LEXICON.has(t)) {
        score -= 1;
        denom++;
      }
    }
    const emojiMatches = m.text.match(EMOJI_REGEX);
    if (emojiMatches) {
      for (const e of emojiMatches) {
        const s = EMOJI_SENTIMENT[e];
        if (s !== undefined) {
          score += s;
          denom++;
        }
      }
    }
    const normalized = denom === 0 ? 0 : clampRange(score / denom, -1, 1);
    perMsg.push(normalized);
    if (normalized > 0.3) positive++;
    else if (normalized < -0.3) negative++;
  }

  const meanVal = mean(perMsg);
  const vol = stddev(perMsg, meanVal);
  // Fold in emoji sentiment a little to smooth the result.
  const blendedMean = clampRange(meanVal * 0.75 + emoji.emojiSentiment * 0.25, -1, 1);

  return {
    mean: blendedMean,
    volatility: clamp01(vol),
    positiveShare: clamp01(positive / Math.max(1, msgs.length)),
    negativeShare: clamp01(negative / Math.max(1, msgs.length)),
  };
}

function deriveTraits(f: {
  style: StyleFeatures;
  emoji: EmojiFeatures;
  lexicon: LexiconFeatures;
  cadence: CadenceFeatures;
  sentiment: SentimentFeatures;
}): PersonalityTrait[] {
  const { style, emoji, lexicon, sentiment, cadence } = f;

  const candidates: PersonalityTrait[] = [];

  candidates.push({
    key: "playful",
    label: "Playful",
    score: clamp01(emoji.usageRate * 0.5 + style.enthusiasm * 0.3 + lexicon.slangRate * 0.2),
    description: "Lots of emojis, exclamations, and slang.",
  });

  candidates.push({
    key: "formal",
    label: "Formal",
    score: clamp01(style.formality * 0.7 + (1 - lexicon.slangRate) * 0.3 - emoji.usageRate * 0.4),
    description: "Uses complete sentences and formal connectors.",
  });

  candidates.push({
    key: "casual",
    label: "Casual",
    score: clamp01(style.lowerCaseRatio * 0.4 + style.contractionRate * 0.3 + lexicon.slangRate * 0.3),
    description: "All-lowercase, contractions, and abbreviations dominate.",
  });

  candidates.push({
    key: "enthusiastic",
    label: "Enthusiastic",
    score: clamp01(style.enthusiasm * 0.6 + sentiment.positiveShare * 0.4),
    description: "Exclamation marks and positive vibes.",
  });

  candidates.push({
    key: "inquisitive",
    label: "Inquisitive",
    score: clamp01(style.inquisitiveness * 0.9),
    description: "Asks a lot of questions.",
  });

  candidates.push({
    key: "concise",
    label: "Concise",
    score: clamp01(1 - Math.min(1, style.avgWords / 30)),
    description: "Short, to-the-point messages.",
  });

  candidates.push({
    key: "verbose",
    label: "Verbose",
    score: clamp01(style.verbosity),
    description: "Long form thoughts and explanations.",
  });

  candidates.push({
    key: "chatty",
    label: "Chatty",
    score: clamp01(cadence.burstiness),
    description: "Double and triple texts frequently.",
  });

  candidates.push({
    key: "expressive",
    label: "Expressive",
    score: clamp01(emoji.densityPerMessage * 0.6 + style.trailiness * 0.2 + style.enthusiasm * 0.2),
    description: "Paints tone with emojis and punctuation.",
  });

  candidates.push({
    key: "dry",
    label: "Dry wit",
    score: clamp01(
      (1 - emoji.usageRate) * 0.4 + (1 - style.enthusiasm) * 0.3 + style.trailiness * 0.3
    ),
    description: "Minimal emojis, deadpan delivery.",
  });

  candidates.push({
    key: "sarcastic",
    label: "Sarcastic",
    score: clamp01(
      style.trailiness * 0.3 +
        (sentiment.volatility > 0.3 ? 0.4 : 0) +
        (lexicon.abbreviations.some((a) => a.word === "lol") ? 0.3 : 0)
    ),
    description: "Oscillating sentiment with ironic markers.",
  });

  candidates.push({
    key: "warm",
    label: "Warm",
    score: clamp01(sentiment.positiveShare * 0.6 + emoji.emojiSentiment * 0.2 + 0.2),
    description: "Friendly and supportive tone.",
  });

  candidates.push({
    key: "edgy",
    label: "Edgy",
    score: clamp01(style.profanity * 0.7 + (1 - sentiment.positiveShare) * 0.3),
    description: "Profanity and blunt takes.",
  });

  candidates.push({
    key: "thoughtful",
    label: "Thoughtful",
    score: clamp01(
      (style.verbosity * 0.4) + (lexicon.diversity * 0.3) + (1 - style.enthusiasm) * 0.3
    ),
    description: "Measured, varied vocabulary.",
  });

  candidates.push({
    key: "meme-fluent",
    label: "Meme-fluent",
    score: clamp01(lexicon.slangRate * 0.7 + emoji.usageRate * 0.3),
    description: "Speaks internet natively.",
  });

  candidates.push({
    key: "nocturnal",
    label: "Nocturnal",
    score: clamp01(
      (cadence.hourHistogram.slice(0, 5).reduce((a, b) => a + b, 0) +
        cadence.hourHistogram.slice(22, 24).reduce((a, b) => a + b, 0))
    ),
    description: "Most active late at night.",
  });

  candidates.push({
    key: "morning-bird",
    label: "Early bird",
    score: clamp01(cadence.hourHistogram.slice(5, 10).reduce((a, b) => a + b, 0)),
    description: "Most active in the early morning.",
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

function pickExemplars(msgs: TwinMessage[]): string[] {
  // Pick three exemplars: shortest, most average-length, and most "typical"
  // (i.e., closest to mean length and containing no URLs / long code).
  const valid = msgs.filter((m) => !/https?:\/\//.test(m.text) && m.text.length <= 140);
  if (valid.length === 0) return [];

  const sortedByLen = [...valid].sort((a, b) => a.text.length - b.text.length);
  const mid = sortedByLen[Math.floor(sortedByLen.length / 2)];
  const shortest = sortedByLen[0];
  const longest = sortedByLen[sortedByLen.length - 1];

  const picks = [shortest, mid, longest].filter((m): m is TwinMessage => Boolean(m));
  const unique: string[] = [];
  for (const p of picks) {
    const t = p.text.trim();
    if (t && !unique.includes(t)) unique.push(t);
  }
  return unique.slice(0, 3);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .replace(EMOJI_REGEX, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .split(/[^A-Za-z0-9'’]+/g)
    .filter(Boolean);
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function clampRange(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function stddev(xs: number[], m: number): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / xs.length);
}

function sumValues(freq: FrequencyMap): number {
  let s = 0;
  for (const k in freq) s += freq[k] ?? 0;
  return s;
}

function toTopN(freq: FrequencyMap, n: number): [string, number][] {
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function countMatching(msgs: TwinMessage[], dict: Set<string>): number {
  let c = 0;
  for (const m of msgs) {
    for (const tok of tokenize(m.text)) {
      if (dict.has(tok.toLowerCase())) c++;
    }
  }
  return c;
}

function isStopBigram(a: string, b: string): boolean {
  return STOPWORDS.has(a) && STOPWORDS.has(b);
}

function mergeTop<T extends { count: number }>(
  a: T[],
  b: T[],
  key: keyof T
): T[] {
  const map = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const k = String(item[key]);
    const existing = map.get(k);
    if (existing) {
      existing.count += item.count;
    } else {
      map.set(k, { ...item });
    }
  }
  return Array.from(map.values())
    .sort((x, y) => y.count - x.count)
    .slice(0, MAX_TOP_ITEMS);
}

function mergeExemplars(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...b, ...a]) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
    if (out.length >= 3) break;
  }
  return out;
}
