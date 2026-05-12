/**
 * AutoReplyEngine.ts
 *
 * The AutoReplyEngine is the reply-generation side of the Digital Twin.
 *
 * Given a user's {@link PersonalityProfile}, an incoming message and a
 * rolling conversation window, it produces:
 *
 *   1. An offline auto-reply (one full message that imitates the user).
 *   2. A ranked list of suggestions to show in-call or while typing.
 *   3. A decision about whether the twin *should* speak in a group chat
 *      right now (autonomy gating).
 *
 * The engine is model-agnostic. A caller may pass in any
 * {@link LanguageModelAdapter} (WebLLM, server-side OpenAI, mock, etc.).
 * When no adapter is provided a deterministic "style-mimicking" fallback
 * based purely on the profile is used, which keeps the engine useful
 * even before the LLM finishes loading on device.
 */

import {
  PersonalityProfile,
  TwinMessage,
  summarizeProfile,
} from "./PersonalityExtractor";

// ─── Public Types ───────────────────────────────────────────────────────────

export type TwinAllowance = "strict" | "casual" | "autonomous";

export interface RelationshipContext {
  /** Who the counterparty is to the owner. */
  counterpartyId: string;
  /** E.g. "best friend", "boss", "mom", "unknown stranger". */
  relationship?: string;
  /** Optional per-relationship allowance override. */
  allowance?: TwinAllowance;
  /** 0-1 — how important/sensitive this relationship is. */
  sensitivity?: number;
}

export interface ReplyRequest {
  profile: PersonalityProfile;
  /** The message to respond to. */
  incoming: TwinMessage;
  /**
   * Recent window of messages in the same conversation, oldest first.
   * Typically last 10-30 messages.
   */
  history: TwinMessage[];
  relationship: RelationshipContext;
  /** Global allowance for the twin (can be overridden by relationship). */
  allowance?: TwinAllowance;
  /** If true the engine may be slower/more expensive. */
  highQuality?: boolean;
  /** 0-1 — explicit creativity knob. 0 = conservative, 1 = wild. */
  creativity?: number;
}

export interface Suggestion {
  text: string;
  /** Score 0-1 — higher means the engine is more confident it matches the user. */
  score: number;
  /** Human readable label for why this suggestion was chosen. */
  rationale: string;
  /** True if this suggestion is pure style-based fallback. */
  fallback: boolean;
}

export interface AutoReplyResult {
  /** The final chosen auto-reply text. */
  text: string;
  /** Top-k suggestions, sorted by score desc. */
  suggestions: Suggestion[];
  /** Typing simulation: how long the UI should pretend to be typing. */
  typingDelayMs: number;
  /** True if the engine refused to produce a reply (too sensitive). */
  suppressed: boolean;
  /** Reason when suppressed; otherwise short debug note. */
  reason: string;
  /** The model adapter that actually produced the reply, or "fallback". */
  modelName: string;
}

export interface GroupParticipationDecision {
  speak: boolean;
  suggestedMessage?: string;
  /** How confident the twin is that it *should* chime in, 0-1. */
  confidence: number;
  /** Brief rationale for logging / debugging. */
  reason: string;
}

export interface GroupParticipationRequest {
  profile: PersonalityProfile;
  /** Last N messages in the group, oldest first. */
  recent: TwinMessage[];
  /** Our own userId (so we don't reply to ourselves). */
  selfId: string;
  /** Global allowance. */
  allowance?: TwinAllowance;
  /** Optional per-group allowance override. */
  groupAllowance?: TwinAllowance;
  /** How long ago the user was last active, ms. */
  userIdleMs?: number;
}

/**
 * Minimal contract for a language model adapter. This is intentionally
 * smaller than a full OpenAI client so it's trivial to mock, wrap
 * WebLLM, or point at a server proxy.
 */
export interface LanguageModelAdapter {
  name: string;
  /**
   * Generate a short chat reply given a system prompt and a chat history.
   * `maxTokens` is a soft cap; adapters may ignore it.
   */
  generate(params: {
    system: string;
    messages: { role: "user" | "assistant" | "system"; content: string }[];
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<string>;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_ALLOWANCE: TwinAllowance = "casual";

/** Phrases we will never allow the twin to send on the user's behalf. */
const FORBIDDEN_COMMITMENTS = [
  "i'll transfer",
  "i'll send you money",
  "here's my password",
  "here is my password",
  "send me the code",
  "share the code",
  "wire the funds",
  "pin is",
  "my social security",
  "ssn is",
  "credit card number",
];

/** Topics where even `autonomous` allowance falls back to acknowledgement only. */
const SENSITIVE_TOPICS = [
  "loan", "mortgage", "contract", "legal", "lawyer", "diagnosis",
  "test result", "breakup", "funeral", "died", "passed away", "fired",
  "layoff", "salary", "compensation", "equity", "custody", "divorce",
];

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Produce an auto-reply for an offline user.
 *
 * Flow:
 *   1. Gate check — if the situation is too sensitive, suppress.
 *   2. Generate candidate messages (LLM + fallback heuristics).
 *   3. Score candidates against the profile.
 *   4. Restyle the winner to match cadence / casing / emoji use.
 *   5. Compute a realistic typing delay so the UI doesn't feel bot-like.
 */
export async function generateAutoReply(
  req: ReplyRequest,
  model?: LanguageModelAdapter
): Promise<AutoReplyResult> {
  const allowance: TwinAllowance =
    req.relationship.allowance ?? req.allowance ?? DEFAULT_ALLOWANCE;

  const suppression = shouldSuppress(req, allowance);
  if (suppression) {
    return {
      text: "",
      suggestions: [],
      typingDelayMs: 0,
      suppressed: true,
      reason: suppression,
      modelName: "gate",
    };
  }

  const candidates: Suggestion[] = [];

  // 1. Fallback candidates (always present; they form a safety net).
  for (const c of buildFallbackCandidates(req)) candidates.push(c);

  // 2. LLM candidates if an adapter is wired up.
  let modelName = "fallback";
  if (model) {
    try {
      const llmCandidates = await buildLLMCandidates(req, model, allowance);
      for (const c of llmCandidates) candidates.push(c);
      modelName = model.name;
    } catch (err) {
      // We never let LLM failures break the reply path; log and keep going.
      console.warn("[AutoReplyEngine] LLM adapter failed:", err);
    }
  }

  // 3. Rank.
  const ranked = rankCandidates(candidates, req.profile, allowance);

  // 4. Restyle + pick winner.
  const winner = ranked[0];
  if (!winner) {
    return {
      text: defaultPolite(req.profile, allowance),
      suggestions: [],
      typingDelayMs: 1500,
      suppressed: false,
      reason: "no-candidates",
      modelName,
    };
  }

  const styled = restyleForUser(winner.text, req.profile, allowance);
  const typingDelayMs = estimateTypingDelay(styled, req.profile);

  return {
    text: styled,
    suggestions: ranked.slice(0, 5).map((s) => ({ ...s, text: restyleForUser(s.text, req.profile, allowance) })),
    typingDelayMs,
    suppressed: false,
    reason: winner.rationale,
    modelName,
  };
}

/**
 * Produce up to `k` live reply suggestions for an *online* user.
 * Used in the call overlay and in ChatInput for smart replies.
 */
export async function suggestReplies(
  req: ReplyRequest,
  k = 3,
  model?: LanguageModelAdapter
): Promise<Suggestion[]> {
  const allowance = req.relationship.allowance ?? req.allowance ?? "casual";
  const candidates: Suggestion[] = [];

  for (const c of buildFallbackCandidates(req)) candidates.push(c);

  if (model) {
    try {
      const llm = await buildLLMCandidates(req, model, allowance, 4);
      for (const c of llm) candidates.push(c);
    } catch {
      // swallow — fallback is enough for suggestions.
    }
  }

  const ranked = rankCandidates(candidates, req.profile, allowance);
  return dedupe(ranked).slice(0, k).map((s) => ({
    ...s,
    text: restyleForUser(s.text, req.profile, allowance),
  }));
}

/**
 * Decide whether the twin should speak in a group chat. This is the
 * autonomy gate — we want the twin to occasionally chime in for offline
 * users but to avoid being annoying or derailing conversation.
 */
export async function decideGroupParticipation(
  req: GroupParticipationRequest,
  model?: LanguageModelAdapter
): Promise<GroupParticipationDecision> {
  const allowance = req.groupAllowance ?? req.allowance ?? DEFAULT_ALLOWANCE;
  if (allowance === "strict") {
    return { speak: false, confidence: 0, reason: "allowance=strict" };
  }

  // Don't speak if the group is already busy with a live human.
  const lastTs = req.recent[req.recent.length - 1]?.timestamp ?? 0;
  const sinceLast = Date.now() - lastTs;
  if (sinceLast < 60 * 1000) {
    return { speak: false, confidence: 0.1, reason: "conversation too recent" };
  }

  // Don't speak if we've already spoken recently (twin OR user).
  const ownInRecent = req.recent.filter((m) => m.authorId === req.selfId);
  if (ownInRecent.length > 0) {
    const lastOwn = ownInRecent[ownInRecent.length - 1]!;
    if (Date.now() - lastOwn.timestamp < 1000 * 60 * 10) {
      return { speak: false, confidence: 0.05, reason: "we just spoke" };
    }
  }

  // Check whether the last messages invite a response at all.
  const invitesResponse = looksLikeQuestion(req.recent.slice(-3));
  const topicMatches = topicAlignsWithUser(req.recent, req.profile);

  // Require autonomy for uninvited speech.
  if (!invitesResponse && allowance !== "autonomous") {
    return { speak: false, confidence: 0.2, reason: "no invitation and allowance<autonomous" };
  }

  // Enough idle to justify the twin speaking?
  const idleMs = req.userIdleMs ?? Infinity;
  if (idleMs < 5 * 60 * 1000 && allowance !== "autonomous") {
    return { speak: false, confidence: 0.1, reason: "user not idle enough" };
  }

  // Base confidence from features.
  let confidence = 0.2;
  if (invitesResponse) confidence += 0.35;
  if (topicMatches) confidence += 0.2;
  if (allowance === "autonomous") confidence += 0.15;
  confidence = Math.min(1, confidence);

  if (confidence < 0.45) {
    return { speak: false, confidence, reason: "low confidence" };
  }

  // Build a reply.
  const lastMsg = req.recent[req.recent.length - 1];
  if (!lastMsg) return { speak: false, confidence: 0, reason: "no recent" };

  const replyReq: ReplyRequest = {
    profile: req.profile,
    incoming: lastMsg,
    history: req.recent,
    relationship: {
      counterpartyId: lastMsg.authorId,
      relationship: "group member",
      allowance,
      sensitivity: 0.3,
    },
    allowance,
    creativity: 0.4,
  };

  const reply = await generateAutoReply(replyReq, model);
  if (reply.suppressed || !reply.text) {
    return { speak: false, confidence, reason: reply.reason };
  }

  return {
    speak: true,
    suggestedMessage: reply.text,
    confidence,
    reason: "eligible: " + reply.reason,
  };
}

// ─── Gating ─────────────────────────────────────────────────────────────────

function shouldSuppress(req: ReplyRequest, allowance: TwinAllowance): string | null {
  const lower = req.incoming.text.toLowerCase();

  for (const topic of SENSITIVE_TOPICS) {
    if (lower.includes(topic)) {
      return `sensitive topic detected: "${topic}"`;
    }
  }

  // Strict allowance refuses anything that looks like a question demanding
  // a real commitment.
  if (allowance === "strict") {
    const demanding = [
      "can you", "could you", "will you", "would you", "are you free",
      "is it ok if", "can i borrow", "lend me", "send me", "pay me",
      "what's your address", "whats your address",
    ];
    for (const d of demanding) {
      if (lower.includes(d)) {
        return `strict allowance; demanding phrasing: "${d}"`;
      }
    }
  }

  // Never echo commitments involving money / credentials, regardless of allowance.
  for (const bad of FORBIDDEN_COMMITMENTS) {
    if (lower.includes(bad)) return `contains unsafe commitment: "${bad}"`;
  }

  // High sensitivity + low allowance combo → suppress.
  const sens = req.relationship.sensitivity ?? 0;
  if (sens > 0.8 && allowance === "strict") {
    return "high sensitivity relationship under strict allowance";
  }

  return null;
}

// ─── Candidate Generation ──────────────────────────────────────────────────

function buildFallbackCandidates(req: ReplyRequest): Suggestion[] {
  const { profile, incoming, relationship } = req;
  const lower = incoming.text.toLowerCase().trim();
  const out: Suggestion[] = [];

  const add = (text: string, score: number, rationale: string) =>
    out.push({ text, score, rationale, fallback: true });

  // 1. Explicit question templates.
  if (/\?\s*$/.test(incoming.text) || looksLikeQuestion([incoming])) {
    if (/how.*you|u doin|how r u/.test(lower)) {
      add("doing alright, you?", 0.6, "greeting question");
      add("not bad! hbu", 0.55, "greeting question, casual");
    } else if (/where.*you|wya|where r u/.test(lower)) {
      add("out rn, catch you in a bit", 0.5, "location question");
    } else if (/when.*free|when.*you.*back|when will/.test(lower)) {
      add("should be around later today, will ping you", 0.55, "availability");
    } else {
      add("good q, lemme think 🤔", 0.4, "generic question");
    }
  }

  // 2. Greeting / pings.
  if (/^(hi|hey|hello|yo|sup|hru|hbu)\b/.test(lower)) {
    add("hey!", 0.55, "greeting");
    add("yoo", 0.5, "greeting, casual");
  }

  // 3. Thanks / gratitude.
  if (/thank|thx|ty|appreciate/.test(lower)) {
    add("np 🙌", 0.6, "gratitude ack");
    add("anytime!", 0.55, "gratitude ack");
  }

  // 4. Apology / bad news ack.
  if (/sorry|my bad|apologi/.test(lower)) {
    add("no worries", 0.6, "apology ack");
    add("all good", 0.55, "apology ack");
  }

  // 5. Affirmative request.
  if (/^(can|could|will|would).*\?*/.test(lower)) {
    add("yep, should work", 0.4, "request ack");
    add("let me check and get back to you", 0.45, "request deferral");
  }

  // 6. Safe acknowledgement as a last resort.
  add("got it, will reply properly soon", 0.3, "safe catchall");
  add("saw this, brb", 0.28, "safe catchall");

  // 7. Nudges borrowed from the user's own catchphrases.
  for (const ph of profile.lexicon.catchphrases.slice(0, 3)) {
    add(capitalizeFirstIfUserLikes(ph.phrase, profile), 0.35, `user catchphrase: ${ph.phrase}`);
  }

  // 8. Relationship modifier.
  if (relationship.relationship?.toLowerCase().includes("boss")) {
    add("Noted, will follow up shortly.", 0.6, "formal boss tone");
  } else if (relationship.relationship?.toLowerCase().includes("mom")) {
    add("love u ❤️ ttyl", 0.5, "family warmth");
  }

  return out;
}

async function buildLLMCandidates(
  req: ReplyRequest,
  model: LanguageModelAdapter,
  allowance: TwinAllowance,
  k = 2
): Promise<Suggestion[]> {
  const system = buildSystemPrompt(req.profile, req.relationship, allowance);
  const messages = buildChatMessages(req);

  const out: Suggestion[] = [];
  for (let i = 0; i < k; i++) {
    const temperature = 0.4 + (req.creativity ?? 0.3) * 0.5 + i * 0.1;
    try {
      const text = await model.generate({
        system,
        messages,
        temperature,
        maxTokens: 120,
      });
      const clean = sanitizeModelOutput(text);
      if (!clean) continue;
      out.push({
        text: clean,
        score: 0.7 - i * 0.05,
        rationale: `${model.name} @ t=${temperature.toFixed(2)}`,
        fallback: false,
      });
    } catch (err) {
      console.warn("[AutoReplyEngine] LLM call failed:", err);
    }
  }
  return out;
}

function buildSystemPrompt(
  profile: PersonalityProfile,
  rel: RelationshipContext,
  allowance: TwinAllowance
): string {
  const summary = summarizeProfile(profile);
  const topEmoji = profile.emoji.top.slice(0, 5).map((e) => e.emoji).join(" ");
  const slang = profile.lexicon.slang.slice(0, 6).map((s) => s.word).join(", ");
  const examples = profile.exemplars.map((e) => `- ${e}`).join("\n");

  return [
    `You are the Digital Twin of user ${profile.userId}. You are speaking on their behalf because they are offline or busy.`,
    `Relationship context: ${rel.relationship ?? "unknown"}. Counterparty: ${rel.counterpartyId}.`,
    `Allowance level: ${allowance}. Rules:`,
    `  - strict: acknowledge only; never commit to actions, money, meetings, or personal facts.`,
    `  - casual: answer lightly; defer hard commitments with "let me check".`,
    `  - autonomous: act like the user would act for routine social back-and-forth.`,
    ``,
    `Style profile: ${summary}`,
    topEmoji ? `Signature emojis: ${topEmoji}` : ``,
    slang ? `Slang often used: ${slang}` : ``,
    `Average message ~${Math.round(profile.style.avgWords)} words.`,
    `Mostly ${profile.style.lowerCaseRatio > 0.5 ? "lowercase" : "mixed case"}.`,
    `Emoji usage: ${Math.round(profile.emoji.usageRate * 100)}% of messages.`,
    examples ? `\nExample messages the user sent recently:\n${examples}` : ``,
    ``,
    `Hard rules:`,
    `  - Never share passwords, codes, or financial info.`,
    `  - Never promise specific dates, locations, or dollar amounts.`,
    `  - Never impersonate anyone except the owner.`,
    `  - Reply with a SINGLE short message only. No commentary. No quotes.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildChatMessages(
  req: ReplyRequest
): { role: "user" | "assistant" | "system"; content: string }[] {
  const out: { role: "user" | "assistant" | "system"; content: string }[] = [];
  const window = req.history.slice(-20);
  for (const m of window) {
    if (m.id === req.incoming.id) continue;
    out.push({
      role: m.authorId === req.profile.userId ? "assistant" : "user",
      content: m.text,
    });
  }
  out.push({ role: "user", content: req.incoming.text });
  return out;
}

// ─── Ranking + Restyling ───────────────────────────────────────────────────

function rankCandidates(
  candidates: Suggestion[],
  profile: PersonalityProfile,
  allowance: TwinAllowance
): Suggestion[] {
  const scored = candidates.map((c) => {
    let bonus = 0;
    const lower = c.text.toLowerCase();

    // Reward matching avg word count.
    const words = c.text.split(/\s+/).length;
    const diff = Math.abs(words - profile.style.avgWords);
    bonus += Math.max(0, 0.2 - diff / 50);

    // Reward emoji presence matching user.
    const hasEmoji = /[\p{Emoji}]/u.test(c.text);
    if (hasEmoji && profile.emoji.usageRate > 0.4) bonus += 0.08;
    if (!hasEmoji && profile.emoji.usageRate < 0.15) bonus += 0.04;

    // Reward casing matching user.
    if (profile.style.lowerCaseRatio > 0.5 && c.text === c.text.toLowerCase()) bonus += 0.05;

    // Reward slang that the user actually uses.
    for (const s of profile.lexicon.slang) {
      if (lower.includes(s.word)) bonus += 0.03;
    }

    // Penalise anything that looks like a commitment under strict allowance.
    if (allowance === "strict") {
      if (/(tomorrow|tonight|next week|\$\d+|i['’]?ll\s+(send|pay|bring|drop))/.test(lower)) {
        bonus -= 0.3;
      }
    }

    // Penalise too-long fallbacks.
    if (c.fallback && words > 25) bonus -= 0.15;

    return { ...c, score: clamp01(c.score + bonus) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function dedupe(list: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const s of list) {
    const k = s.text.trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/**
 * Rewrite `text` so it looks more like the user would have written it.
 * Non-semantic edits only: casing, emoji tail, trailing ellipsis, etc.
 */
export function restyleForUser(
  text: string,
  profile: PersonalityProfile,
  allowance: TwinAllowance = "casual"
): string {
  if (!text) return text;
  let out = text.trim();

  // Casing: all-lowercase if the user is a predominantly lowercase texter.
  if (profile.style.lowerCaseRatio > 0.55 && allowance !== "strict") {
    out = out.toLowerCase();
  } else if (profile.style.formality > 0.55) {
    // Keep initial capitalisation.
    out = out.charAt(0).toUpperCase() + out.slice(1);
  }

  // Trailing ellipsis tendency.
  if (
    profile.style.trailiness > 0.3 &&
    !/[!?…]$/.test(out) &&
    Math.random() < profile.style.trailiness
  ) {
    out = out.replace(/[.]+$/, "") + "...";
  }

  // Drop trailing period if the user rarely uses them.
  if (profile.style.punctuationDensity < 0.2 && /[.]$/.test(out) && !/\.\.\.$/.test(out)) {
    out = out.replace(/\.$/, "");
  }

  // Emoji tail: append a signature emoji some of the time.
  const topEmoji = profile.emoji.top[0]?.emoji;
  if (
    topEmoji &&
    profile.emoji.usageRate > 0.35 &&
    !containsEmoji(out) &&
    Math.random() < profile.emoji.usageRate * 0.6
  ) {
    out = `${out} ${topEmoji}`;
  }

  // Injection of a favourite slang term if we have one and there's room.
  const favSlang = profile.lexicon.slang[0]?.word;
  if (
    favSlang &&
    profile.lexicon.slangRate > 0.2 &&
    out.split(" ").length <= 8 &&
    !out.toLowerCase().includes(favSlang) &&
    Math.random() < 0.2
  ) {
    out = `${out} ${favSlang}`.trim();
  }

  return out.replace(/\s+/g, " ").trim();
}

function sanitizeModelOutput(raw: string): string {
  if (!raw) return "";
  let out = raw.trim();
  // Strip surrounding quotes.
  out = out.replace(/^["'`]+|["'`]+$/g, "");
  // Strip "Assistant:" or role prefixes that some local models emit.
  out = out.replace(/^(assistant|bot|twin|me)\s*:\s*/i, "");
  // Truncate to single message: chop at first double newline.
  const nn = out.indexOf("\n\n");
  if (nn > 0) out = out.slice(0, nn);
  // Trim extremely long outputs.
  if (out.length > 400) out = out.slice(0, 400).replace(/\s+\S*$/, "");
  return out.trim();
}

function defaultPolite(profile: PersonalityProfile, allowance: TwinAllowance): string {
  if (allowance === "strict") return "Got your message — will reply when I can.";
  if (profile.style.lowerCaseRatio > 0.5) return "saw this, will hit you back soon";
  return "Got it! I'll follow up soon.";
}

function capitalizeFirstIfUserLikes(phrase: string, profile: PersonalityProfile): string {
  if (profile.style.lowerCaseRatio > 0.5) return phrase;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function containsEmoji(text: string): boolean {
  return /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(text);
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ─── Cadence Simulation ────────────────────────────────────────────────────

/**
 * Approximate how long a human would take to type `text`, based on the
 * user's known average typing rate (derived from cadence features).
 *
 * We clamp to a sane range so bots don't sit silently for minutes.
 */
export function estimateTypingDelay(text: string, profile: PersonalityProfile): number {
  const chars = text.length;
  // Typical ~5 chars/sec mobile, faster on desktop.
  const baseRate = 5;

  // Nudge by user verbosity — verbose users are slower per char because
  // they're often composing thoughts, short-message users spam faster.
  const rate = baseRate * (1 - profile.style.verbosity * 0.3 + 0.2);
  const base = (chars / rate) * 1000;

  // Jitter ±25%.
  const jitter = base * 0.25 * (Math.random() * 2 - 1);
  const total = Math.max(700, Math.min(15000, base + jitter));
  return Math.round(total);
}

// ─── Context Inference ─────────────────────────────────────────────────────

function looksLikeQuestion(msgs: TwinMessage[]): boolean {
  for (const m of msgs) {
    const t = m.text.trim();
    if (!t) continue;
    if (/\?\s*$/.test(t)) return true;
    const lower = t.toLowerCase();
    if (/^(who|what|when|where|why|how|do you|did you|are you|is it)\b/.test(lower)) {
      return true;
    }
  }
  return false;
}

function topicAlignsWithUser(recent: TwinMessage[], profile: PersonalityProfile): boolean {
  if (recent.length === 0 || profile.lexicon.topWords.length === 0) return false;
  const vocab = new Set(profile.lexicon.topWords.map((w) => w.word.toLowerCase()));
  let hits = 0;
  for (const m of recent) {
    for (const w of m.text.toLowerCase().split(/[^a-z0-9]+/)) {
      if (vocab.has(w)) hits++;
    }
  }
  return hits >= 2;
}

// ─── Mock Adapter for Tests / Dev ──────────────────────────────────────────

/**
 * A lightweight LanguageModelAdapter for tests and storybook rendering.
 * It mirrors back a deterministic message based on the prompt.
 */
export function createEchoAdapter(name = "echo-mock"): LanguageModelAdapter {
  return {
    name,
    async generate({ messages }) {
      const last = messages[messages.length - 1]?.content ?? "";
      if (!last) return "k";
      if (last.endsWith("?")) return "hmm, depends — what are you thinking?";
      return `got it: ${last.slice(0, 60)}`;
    },
  };
}
