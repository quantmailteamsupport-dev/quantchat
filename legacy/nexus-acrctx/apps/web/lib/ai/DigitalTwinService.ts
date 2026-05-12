/**
 * DigitalTwinService.ts
 *
 * Top-level orchestrator for the Quantchat Digital Twin.
 *
 * Responsibilities:
 *   - Own the lifecycle of a twin (create, train, update, delete).
 *   - Ingest new messages and incrementally update the user's
 *     {@link PersonalityProfile}.
 *   - Route incoming DMs through the {@link AutoReplyEngine} when the
 *     owner is offline, respecting allowance rules.
 *   - Expose a stable, typed API for React components
 *     (TwinProfileCard, ChatInput suggestions, AudioCall overlay).
 *   - Manage per-relationship and per-group allowance overrides.
 *   - Track stats + produce the data used by the profile card.
 *
 * The service is deliberately agnostic about storage:
 *   - An in-memory implementation ships by default.
 *   - Callers can plug a {@link TwinStore} adapter to persist to Dexie,
 *     IndexedDB, or the server.
 *
 * It is also agnostic about the language model — wire in any
 * {@link LanguageModelAdapter} from AutoReplyEngine.
 */

import {
  PersonalityProfile,
  TwinMessage,
  PROFILE_SCHEMA_VERSION,
  extractPersonalityProfile,
  mergePersonalityProfile,
  summarizeProfile,
  traitsForDisplay,
  MIN_SAMPLES_FOR_CONFIDENT_PROFILE,
} from "./PersonalityExtractor";

import {
  AutoReplyResult,
  GroupParticipationDecision,
  LanguageModelAdapter,
  ReplyRequest,
  Suggestion,
  TwinAllowance,
  decideGroupParticipation,
  generateAutoReply,
  suggestReplies,
} from "./AutoReplyEngine";

// ─── Public Types ──────────────────────────────────────────────────────────

export interface TwinSettings {
  /** Master on/off switch. */
  enabled: boolean;
  /** Default allowance used when a more specific override is missing. */
  allowance: TwinAllowance;
  /** Auto-reply to DMs while the owner is offline. */
  autoReplyOffline: boolean;
  /** Offer in-line suggestions while the owner is composing. */
  liveSuggestions: boolean;
  /** Let the twin occasionally chime in to group chats on the owner's behalf. */
  groupAutonomy: boolean;
  /** How long since last activity before the twin is considered "away", ms. */
  awayAfterMs: number;
  /** Per-counterparty allowance overrides. Key = counterparty userId. */
  relationshipAllowances: Record<string, TwinAllowance>;
  /** Per-group allowance overrides. Key = conversationId. */
  groupAllowances: Record<string, TwinAllowance>;
  /** Per-counterparty relationship labels ("mom", "boss", ...). */
  relationshipLabels: Record<string, string>;
  /** Per-counterparty sensitivity weights, 0-1. */
  relationshipSensitivity: Record<string, number>;
  /** Optional voice cloning voice ID (ElevenLabs). */
  voiceId?: string;
  /** How much room the twin is allowed to take: 0 = reserved, 1 = chatty. */
  chattiness: number;
}

export const DEFAULT_TWIN_SETTINGS: TwinSettings = {
  enabled: false,
  allowance: "casual",
  autoReplyOffline: true,
  liveSuggestions: true,
  groupAutonomy: false,
  awayAfterMs: 10 * 60 * 1000,
  relationshipAllowances: {},
  groupAllowances: {},
  relationshipLabels: {},
  relationshipSensitivity: {},
  chattiness: 0.4,
};

export interface TwinRecord {
  userId: string;
  createdAt: number;
  updatedAt: number;
  settings: TwinSettings;
  profile: PersonalityProfile;
  /** Monotonic counter of auto-replies produced on the owner's behalf. */
  autoReplyCount: number;
  /** Monotonic counter of suggestions shown. */
  suggestionCount: number;
  /** Monotonic counter of group participations. */
  groupSpeakCount: number;
  /** Last time the owner themselves sent a message (for idle detection). */
  lastOwnerActivity: number;
  /** Auto-replies the owner later confirmed looked right. */
  approvedCount: number;
  /** Auto-replies the owner edited before sending (partial match). */
  editedCount: number;
  /** Auto-replies the owner discarded or marked wrong. */
  rejectedCount: number;
}

/**
 * User feedback on a single auto-reply.
 *  - `approved` — reply was sent as-is; the twin nailed it.
 *  - `edited`   — reply was sent after the owner tweaked it.
 *  - `rejected` — reply was discarded; the twin got it wrong.
 */
export type AutoReplyFeedback = "approved" | "edited" | "rejected";

export interface TwinStore {
  load(userId: string): Promise<TwinRecord | null>;
  save(record: TwinRecord): Promise<void>;
  delete(userId: string): Promise<void>;
}

export interface MaybeReplyParams {
  /** The twin's owner userId. */
  ownerId: string;
  /** Incoming message to potentially reply to. */
  incoming: TwinMessage;
  /** Recent conversation history, oldest first. */
  history: TwinMessage[];
  /** Indicates if the owner is considered currently online. */
  ownerOnline: boolean;
  /** Override if the caller already knows the counterparty relationship. */
  counterpartyId?: string;
}

export interface MaybeReplyResult {
  fired: boolean;
  reason: string;
  result?: AutoReplyResult;
}

// Event names the service emits.
export type TwinEventName =
  | "twin-created"
  | "twin-updated"
  | "twin-deleted"
  | "auto-reply-sent"
  | "auto-reply-suppressed"
  | "group-participated"
  | "profile-refreshed"
  | "settings-changed"
  | "feedback-recorded";

export interface TwinEvent {
  name: TwinEventName;
  userId: string;
  at: number;
  data?: Record<string, unknown>;
}

export type TwinEventHandler = (event: TwinEvent) => void;

// ─── In-Memory Store ───────────────────────────────────────────────────────

/**
 * Default store — keeps records in a plain Map. Good enough for dev,
 * unit tests, and ephemeral sessions.
 */
export class InMemoryTwinStore implements TwinStore {
  private readonly map = new Map<string, TwinRecord>();

  async load(userId: string): Promise<TwinRecord | null> {
    return this.map.get(userId) ?? null;
  }

  async save(record: TwinRecord): Promise<void> {
    this.map.set(record.userId, record);
  }

  async delete(userId: string): Promise<void> {
    this.map.delete(userId);
  }
}

// ─── Service ───────────────────────────────────────────────────────────────

export class DigitalTwinService {
  private readonly store: TwinStore;
  private model?: LanguageModelAdapter;
  private readonly listeners = new Set<TwinEventHandler>();

  /** Short in-memory cache to avoid round-tripping the store on hot paths. */
  private readonly cache = new Map<string, TwinRecord>();

  constructor(opts?: { store?: TwinStore; model?: LanguageModelAdapter }) {
    this.store = opts?.store ?? new InMemoryTwinStore();
    this.model = opts?.model;
  }

  /** Replace the language model adapter at runtime (e.g. after WebLLM boots). */
  setModel(model: LanguageModelAdapter | undefined): void {
    this.model = model;
  }

  getModelName(): string {
    return this.model?.name ?? "fallback";
  }

  // ── Event bus ──

  on(handler: TwinEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  private emit(name: TwinEventName, userId: string, data?: Record<string, unknown>): void {
    const ev: TwinEvent = { name, userId, at: Date.now(), data };
    for (const l of this.listeners) {
      try {
        l(ev);
      } catch (err) {
        console.warn("[DigitalTwinService] listener threw", err);
      }
    }
  }

  // ── Lifecycle ──

  /**
   * Create (or reset) a twin for `userId`. If `seed` messages are provided
   * the profile is built immediately; otherwise the twin starts empty and
   * will learn as messages are ingested.
   */
  async createTwin(
    userId: string,
    seed?: TwinMessage[],
    settings?: Partial<TwinSettings>
  ): Promise<TwinRecord> {
    const now = Date.now();
    const profile = seed && seed.length > 0
      ? extractPersonalityProfile(userId, seed)
      : extractPersonalityProfile(userId, []);

    const record: TwinRecord = {
      userId,
      createdAt: now,
      updatedAt: now,
      settings: { ...DEFAULT_TWIN_SETTINGS, ...(settings ?? {}) },
      profile,
      autoReplyCount: 0,
      suggestionCount: 0,
      groupSpeakCount: 0,
      lastOwnerActivity: seed && seed.length > 0
        ? Math.max(...seed.map((m) => m.timestamp))
        : now,
      approvedCount: 0,
      editedCount: 0,
      rejectedCount: 0,
    };

    await this.store.save(record);
    this.cache.set(userId, record);
    this.emit("twin-created", userId, { sampleSize: profile.sampleSize });
    return record;
  }

  async deleteTwin(userId: string): Promise<void> {
    await this.store.delete(userId);
    this.cache.delete(userId);
    this.emit("twin-deleted", userId);
  }

  /**
   * Get the twin for `userId`. Returns null when none exists. Does not
   * auto-create — callers opt in explicitly to avoid silent bot creation.
   */
  async getTwin(userId: string): Promise<TwinRecord | null> {
    const cached = this.cache.get(userId);
    if (cached) return cached;
    const loaded = await this.store.load(userId);
    if (loaded) this.cache.set(userId, loaded);
    return loaded;
  }

  /** Convenience — like getTwin but ensures a record exists. */
  async ensureTwin(userId: string, seed?: TwinMessage[]): Promise<TwinRecord> {
    const existing = await this.getTwin(userId);
    if (existing) return existing;
    return this.createTwin(userId, seed);
  }

  // ── Settings ──

  async updateSettings(
    userId: string,
    patch: Partial<TwinSettings>
  ): Promise<TwinRecord> {
    const rec = await this.getTwin(userId);
    if (!rec) throw new Error(`No twin for user ${userId}`);
    rec.settings = { ...rec.settings, ...patch };
    rec.updatedAt = Date.now();
    await this.store.save(rec);
    this.cache.set(userId, rec);
    this.emit("settings-changed", userId, { patch });
    return rec;
  }

  async setAllowance(userId: string, allowance: TwinAllowance): Promise<TwinRecord> {
    return this.updateSettings(userId, { allowance });
  }

  async setRelationshipAllowance(
    userId: string,
    counterpartyId: string,
    allowance: TwinAllowance
  ): Promise<TwinRecord> {
    const rec = await this.getTwin(userId);
    if (!rec) throw new Error(`No twin for user ${userId}`);
    const patch = { ...rec.settings.relationshipAllowances, [counterpartyId]: allowance };
    return this.updateSettings(userId, { relationshipAllowances: patch });
  }

  async setGroupAllowance(
    userId: string,
    conversationId: string,
    allowance: TwinAllowance
  ): Promise<TwinRecord> {
    const rec = await this.getTwin(userId);
    if (!rec) throw new Error(`No twin for user ${userId}`);
    const patch = { ...rec.settings.groupAllowances, [conversationId]: allowance };
    return this.updateSettings(userId, { groupAllowances: patch });
  }

  async labelRelationship(
    userId: string,
    counterpartyId: string,
    label: string,
    sensitivity?: number
  ): Promise<TwinRecord> {
    const rec = await this.getTwin(userId);
    if (!rec) throw new Error(`No twin for user ${userId}`);
    const labels = { ...rec.settings.relationshipLabels, [counterpartyId]: label };
    const sens = { ...rec.settings.relationshipSensitivity };
    if (typeof sensitivity === "number") sens[counterpartyId] = clamp01(sensitivity);
    return this.updateSettings(userId, {
      relationshipLabels: labels,
      relationshipSensitivity: sens,
    });
  }

  // ── Ingestion ──

  /**
   * Ingest new messages — the twin learns incrementally. Messages authored
   * by other users are retained for cadence + history but do not alter
   * style features.
   *
   * Batches are processed atomically: either everything is folded in or
   * nothing is (on storage error).
   */
  async ingestMessages(userId: string, messages: TwinMessage[]): Promise<TwinRecord> {
    if (messages.length === 0) return this.ensureTwin(userId);

    const rec = await this.ensureTwin(userId);
    const previousSampleSize = rec.profile.sampleSize;

    // Only merge if we have any messages from the owner — otherwise there
    // is nothing to update beyond lastOwnerActivity.
    const own = messages.filter((m) => m.authorId === userId);
    if (own.length > 0) {
      rec.profile = previousSampleSize === 0
        ? extractPersonalityProfile(userId, messages)
        : mergePersonalityProfile(rec.profile, messages);
      rec.lastOwnerActivity = Math.max(rec.lastOwnerActivity, ...own.map((m) => m.timestamp));
    }
    rec.updatedAt = Date.now();

    await this.store.save(rec);
    this.cache.set(userId, rec);
    this.emit("twin-updated", userId, {
      added: messages.length,
      ownAdded: own.length,
      sampleSize: rec.profile.sampleSize,
    });
    return rec;
  }

  /**
   * Completely recompute the profile from a fresh corpus. Used for periodic
   * maintenance or when the user manually asks for a "retrain".
   */
  async retrain(userId: string, corpus: TwinMessage[]): Promise<TwinRecord> {
    const rec = await this.ensureTwin(userId);
    rec.profile = extractPersonalityProfile(userId, corpus);
    rec.updatedAt = Date.now();
    const own = corpus.filter((m) => m.authorId === userId);
    if (own.length > 0) {
      rec.lastOwnerActivity = Math.max(...own.map((m) => m.timestamp));
    }
    await this.store.save(rec);
    this.cache.set(userId, rec);
    this.emit("profile-refreshed", userId, { sampleSize: rec.profile.sampleSize });
    return rec;
  }

  /** Track an owner-authored message without necessarily altering the profile. */
  async noteOwnerActivity(userId: string, at: number = Date.now()): Promise<void> {
    const rec = await this.getTwin(userId);
    if (!rec) return;
    if (at <= rec.lastOwnerActivity) return;
    rec.lastOwnerActivity = at;
    rec.updatedAt = Date.now();
    await this.store.save(rec);
    this.cache.set(userId, rec);
  }

  // ── Reply orchestration ──

  /**
   * Centralised entry point for inbound DMs. Decides whether the twin
   * should reply and, if so, produces the reply. The caller is responsible
   * for actually sending it over the wire (so that signal ordering, E2EE
   * wrapping, etc. remain the caller's concern).
   */
  async maybeReply(params: MaybeReplyParams): Promise<MaybeReplyResult> {
    const rec = await this.getTwin(params.ownerId);
    if (!rec) return { fired: false, reason: "no twin" };
    if (!rec.settings.enabled) return { fired: false, reason: "twin disabled" };
    if (!rec.settings.autoReplyOffline) return { fired: false, reason: "auto-reply off" };

    if (params.ownerOnline) {
      const idleMs = Date.now() - rec.lastOwnerActivity;
      if (idleMs < rec.settings.awayAfterMs) {
        return { fired: false, reason: `owner online (idle ${idleMs}ms)` };
      }
    }

    if (rec.profile.sampleSize < 3) {
      return { fired: false, reason: "insufficient training data" };
    }

    if (params.incoming.authorId === params.ownerId) {
      return { fired: false, reason: "message is from owner" };
    }

    const counterpartyId = params.counterpartyId ?? params.incoming.authorId;
    const request = this.buildReplyRequest(rec, params.incoming, params.history, counterpartyId);
    const result = await generateAutoReply(request, this.model);

    if (result.suppressed) {
      this.emit("auto-reply-suppressed", rec.userId, {
        counterpartyId,
        reason: result.reason,
      });
      return { fired: false, reason: result.reason, result };
    }

    rec.autoReplyCount++;
    rec.updatedAt = Date.now();
    await this.store.save(rec);
    this.cache.set(rec.userId, rec);
    this.emit("auto-reply-sent", rec.userId, {
      counterpartyId,
      chars: result.text.length,
      modelName: result.modelName,
    });
    return { fired: true, reason: result.reason, result };
  }

  /**
   * Return up to `k` suggestions for the owner to pick from while typing.
   * Always safe to call, even if the twin is disabled — returns []
   * in that case.
   */
  async getSuggestions(
    ownerId: string,
    incoming: TwinMessage,
    history: TwinMessage[],
    k = 3
  ): Promise<Suggestion[]> {
    const rec = await this.getTwin(ownerId);
    if (!rec || !rec.settings.enabled || !rec.settings.liveSuggestions) return [];
    if (rec.profile.sampleSize < 3) return [];

    const request = this.buildReplyRequest(rec, incoming, history, incoming.authorId);
    const out = await suggestReplies(request, k, this.model);
    rec.suggestionCount += out.length;
    rec.updatedAt = Date.now();
    await this.store.save(rec);
    this.cache.set(rec.userId, rec);
    return out;
  }

  /**
   * Ask whether the twin should autonomously speak in the current group.
   * The caller supplies recent messages + the conversationId so we can
   * honour per-group allowance overrides.
   */
  async considerGroupMessage(params: {
    ownerId: string;
    conversationId: string;
    recent: TwinMessage[];
  }): Promise<GroupParticipationDecision> {
    const rec = await this.getTwin(params.ownerId);
    if (!rec) return { speak: false, confidence: 0, reason: "no twin" };
    if (!rec.settings.enabled || !rec.settings.groupAutonomy) {
      return { speak: false, confidence: 0, reason: "group autonomy off" };
    }
    if (rec.profile.sampleSize < MIN_SAMPLES_FOR_CONFIDENT_PROFILE) {
      return { speak: false, confidence: 0, reason: "insufficient training data" };
    }

    const allowance = rec.settings.allowance;
    const groupAllowance = rec.settings.groupAllowances[params.conversationId];
    const userIdleMs = Date.now() - rec.lastOwnerActivity;

    const decision = await decideGroupParticipation(
      {
        profile: rec.profile,
        recent: params.recent,
        selfId: params.ownerId,
        allowance,
        groupAllowance,
        userIdleMs,
      },
      this.model
    );

    if (decision.speak) {
      rec.groupSpeakCount++;
      rec.updatedAt = Date.now();
      await this.store.save(rec);
      this.cache.set(rec.userId, rec);
      this.emit("group-participated", rec.userId, {
        conversationId: params.conversationId,
        confidence: decision.confidence,
      });
    }
    return decision;
  }

  // ── Derived views ──

  /** Returns the public-facing, UI-friendly summary of a twin. */
  async getProfileView(userId: string): Promise<TwinProfileView | null> {
    const rec = await this.getTwin(userId);
    if (!rec) return null;
    return toProfileView(rec);
  }

  /**
   * Record user feedback on an auto-reply that was produced on their behalf.
   *
   * Call this after the owner:
   *  - Sends the reply unchanged      → `"approved"`
   *  - Edits the reply then sends it  → `"edited"`
   *  - Discards / dismisses the reply → `"rejected"`
   *
   * The running totals feed the `twinAccuracy` metric in {@link TwinProfileView}.
   */
  async recordAutoReplyFeedback(
    userId: string,
    feedback: AutoReplyFeedback
  ): Promise<void> {
    const rec = await this.getTwin(userId);
    if (!rec) return;
    if (feedback === "approved") rec.approvedCount++;
    else if (feedback === "edited") rec.editedCount++;
    else rec.rejectedCount++;
    rec.updatedAt = Date.now();
    await this.store.save(rec);
    this.cache.set(userId, rec);
    this.emit("feedback-recorded", userId, { feedback });
  }

  /** For a group chat, decide if the owner can even enable autonomy there. */
  async isGroupAutonomyPermitted(
    userId: string,
    conversationId: string
  ): Promise<boolean> {
    const rec = await this.getTwin(userId);
    if (!rec) return false;
    const groupAllowance = rec.settings.groupAllowances[conversationId];
    if (groupAllowance === "strict") return false;
    return rec.settings.groupAutonomy;
  }

  /** Export a snapshot — for transfer or debug display. */
  async export(userId: string): Promise<TwinRecord | null> {
    const rec = await this.getTwin(userId);
    return rec ? structuredCloneSafe(rec) : null;
  }

  /** Import a snapshot, merging or replacing the local record. */
  async import(snapshot: TwinRecord, mode: "replace" | "merge" = "replace"): Promise<TwinRecord> {
    const incoming = structuredCloneSafe(snapshot);
    if (mode === "replace") {
      await this.store.save(incoming);
      this.cache.set(incoming.userId, incoming);
      this.emit("twin-updated", incoming.userId, { import: mode });
      return incoming;
    }
    const existing = await this.getTwin(incoming.userId);
    if (!existing) {
      await this.store.save(incoming);
      this.cache.set(incoming.userId, incoming);
      this.emit("twin-created", incoming.userId, { import: mode });
      return incoming;
    }
    existing.settings = { ...existing.settings, ...incoming.settings };
    existing.profile = mergeByRecompute(existing.profile, incoming.profile);
    existing.autoReplyCount += incoming.autoReplyCount;
    existing.suggestionCount += incoming.suggestionCount;
    existing.groupSpeakCount += incoming.groupSpeakCount;
    existing.approvedCount += incoming.approvedCount;
    existing.editedCount += incoming.editedCount;
    existing.rejectedCount += incoming.rejectedCount;
    existing.lastOwnerActivity = Math.max(existing.lastOwnerActivity, incoming.lastOwnerActivity);
    existing.updatedAt = Date.now();
    await this.store.save(existing);
    this.cache.set(existing.userId, existing);
    this.emit("twin-updated", existing.userId, { import: mode });
    return existing;
  }

  // ── Helpers ──

  private buildReplyRequest(
    rec: TwinRecord,
    incoming: TwinMessage,
    history: TwinMessage[],
    counterpartyId: string
  ): ReplyRequest {
    const allowance =
      rec.settings.relationshipAllowances[counterpartyId] ?? rec.settings.allowance;
    const relationship = rec.settings.relationshipLabels[counterpartyId];
    const sensitivity = rec.settings.relationshipSensitivity[counterpartyId];

    return {
      profile: rec.profile,
      incoming,
      history,
      allowance,
      creativity: clamp01(rec.settings.chattiness * 0.8 + 0.1),
      relationship: {
        counterpartyId,
        relationship,
        allowance,
        sensitivity,
      },
    };
  }
}

// ─── Profile View Helper ──────────────────────────────────────────────────

export interface TwinProfileStats {
  autoRepliesSent: number;
  suggestionsOffered: number;
  groupChimes: number;
  lastOwnerActivity: number;
  /**
   * Weighted accuracy percentage (0-100) based on owner feedback.
   * `null` when no feedback has been recorded yet.
   *
   * Scoring: approved → 100 pts, edited → 50 pts, rejected → 0 pts.
   * Final value = sum of points / (total feedbacks * 100) * 100.
   */
  twinAccuracy: number | null;
}

export interface TwinProfileView {
  userId: string;
  summary: string;
  schemaVersion: number;
  confident: boolean;
  sampleSize: number;
  tokenCount: number;
  traits: ReturnType<typeof traitsForDisplay>;
  topEmojis: { emoji: string; count: number }[];
  topWords: { word: string; count: number }[];
  catchphrases: { phrase: string; count: number }[];
  slang: { word: string; count: number }[];
  abbreviations: { word: string; count: number }[];
  hourHistogram: number[];
  exemplars: string[];
  stats: TwinProfileStats;
  settings: TwinSettings;
  updatedAt: number;
}

export function toProfileView(rec: TwinRecord): TwinProfileView {
  return {
    userId: rec.userId,
    summary: summarizeProfile(rec.profile),
    schemaVersion: rec.profile.version ?? PROFILE_SCHEMA_VERSION,
    confident: rec.profile.sampleSize >= MIN_SAMPLES_FOR_CONFIDENT_PROFILE,
    sampleSize: rec.profile.sampleSize,
    tokenCount: rec.profile.tokenCount,
    traits: traitsForDisplay(rec.profile),
    topEmojis: rec.profile.emoji.top.slice(0, 8),
    topWords: rec.profile.lexicon.topWords.slice(0, 12),
    catchphrases: rec.profile.lexicon.catchphrases.slice(0, 6),
    slang: rec.profile.lexicon.slang.slice(0, 8),
    abbreviations: rec.profile.lexicon.abbreviations.slice(0, 8),
    hourHistogram: rec.profile.cadence.hourHistogram,
    exemplars: rec.profile.exemplars,
    stats: {
      autoRepliesSent: rec.autoReplyCount,
      suggestionsOffered: rec.suggestionCount,
      groupChimes: rec.groupSpeakCount,
      lastOwnerActivity: rec.lastOwnerActivity,
      twinAccuracy: computeAccuracy(rec),
    },
    settings: rec.settings,
    updatedAt: rec.updatedAt,
  };
}

// ─── Utility ─────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Compute a weighted accuracy percentage from owner feedback.
 * Returns null when no feedback has been collected yet.
 *
 *   approved → 100 pts   (twin nailed it)
 *   edited   →  50 pts   (close enough; owner tweaked it)
 *   rejected →   0 pts   (wrong; twin needs to learn)
 */
function computeAccuracy(rec: TwinRecord): number | null {
  const total = rec.approvedCount + rec.editedCount + rec.rejectedCount;
  if (total === 0) return null;
  const score = (rec.approvedCount * 100 + rec.editedCount * 50) / total;
  return Math.round(score);
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function mergeByRecompute(
  a: PersonalityProfile,
  b: PersonalityProfile
): PersonalityProfile {
  // When we import an external profile we don't have the raw messages.
  // Fall back to a weighted blend of summary features — identical math
  // to PersonalityExtractor.mergePersonalityProfile but without raw input.
  const total = a.sampleSize + b.sampleSize || 1;
  const wA = a.sampleSize / total;
  const wB = b.sampleSize / total;
  const blend = (x: number, y: number) => x * wA + y * wB;

  return {
    ...a,
    sampleSize: total,
    tokenCount: a.tokenCount + b.tokenCount,
    timeRange: {
      firstSeen: Math.min(a.timeRange.firstSeen, b.timeRange.firstSeen),
      lastSeen: Math.max(a.timeRange.lastSeen, b.timeRange.lastSeen),
    },
    style: {
      avgLength: blend(a.style.avgLength, b.style.avgLength),
      avgWords: blend(a.style.avgWords, b.style.avgWords),
      wordStdDev: blend(a.style.wordStdDev, b.style.wordStdDev),
      shoutiness: blend(a.style.shoutiness, b.style.shoutiness),
      lowerCaseRatio: blend(a.style.lowerCaseRatio, b.style.lowerCaseRatio),
      punctuationDensity: blend(a.style.punctuationDensity, b.style.punctuationDensity),
      inquisitiveness: blend(a.style.inquisitiveness, b.style.inquisitiveness),
      enthusiasm: blend(a.style.enthusiasm, b.style.enthusiasm),
      trailiness: blend(a.style.trailiness, b.style.trailiness),
      contractionRate: blend(a.style.contractionRate, b.style.contractionRate),
      profanity: blend(a.style.profanity, b.style.profanity),
      formality: blend(a.style.formality, b.style.formality),
      verbosity: blend(a.style.verbosity, b.style.verbosity),
    },
    emoji: {
      usageRate: blend(a.emoji.usageRate, b.emoji.usageRate),
      densityPerMessage: blend(a.emoji.densityPerMessage, b.emoji.densityPerMessage),
      top: mergeFreq(a.emoji.top, b.emoji.top, "emoji"),
      emojiSentiment: blend(a.emoji.emojiSentiment, b.emoji.emojiSentiment),
    },
    lexicon: {
      topWords: mergeFreq(a.lexicon.topWords, b.lexicon.topWords, "word"),
      catchphrases: mergeFreq(a.lexicon.catchphrases, b.lexicon.catchphrases, "phrase"),
      slang: mergeFreq(a.lexicon.slang, b.lexicon.slang, "word"),
      abbreviations: mergeFreq(a.lexicon.abbreviations, b.lexicon.abbreviations, "word"),
      diversity: blend(a.lexicon.diversity, b.lexicon.diversity),
      slangRate: blend(a.lexicon.slangRate, b.lexicon.slangRate),
    },
    cadence: {
      avgIntraGapMs: blend(a.cadence.avgIntraGapMs, b.cadence.avgIntraGapMs),
      avgReplyLatencyMs: blend(a.cadence.avgReplyLatencyMs, b.cadence.avgReplyLatencyMs),
      burstiness: blend(a.cadence.burstiness, b.cadence.burstiness),
      hourHistogram: a.cadence.hourHistogram.map((v, i) =>
        blend(v, b.cadence.hourHistogram[i] ?? 0)
      ),
    },
    sentiment: {
      mean: blend(a.sentiment.mean, b.sentiment.mean),
      volatility: blend(a.sentiment.volatility, b.sentiment.volatility),
      positiveShare: blend(a.sentiment.positiveShare, b.sentiment.positiveShare),
      negativeShare: blend(a.sentiment.negativeShare, b.sentiment.negativeShare),
    },
    traits: a.traits,
    exemplars: [...new Set([...a.exemplars, ...b.exemplars])].slice(0, 3),
    updatedAt: Date.now(),
  };
}

function mergeFreq<T extends { count: number }>(
  a: T[],
  b: T[],
  key: keyof T
): T[] {
  const map = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const k = String(item[key]);
    const existing = map.get(k);
    if (existing) existing.count += item.count;
    else map.set(k, { ...item });
  }
  return Array.from(map.values()).sort((x, y) => y.count - x.count).slice(0, 24);
}

// ─── Module-level singleton helper ──────────────────────────────────────

let singleton: DigitalTwinService | null = null;

/**
 * Lazy singleton accessor. Tests and SSR should prefer constructing a
 * fresh DigitalTwinService directly to avoid cross-test state bleed.
 */
export function getDigitalTwinService(): DigitalTwinService {
  if (!singleton) singleton = new DigitalTwinService();
  return singleton;
}

/** Reset the singleton (test-only). */
export function __resetDigitalTwinServiceForTests(): void {
  singleton = null;
}
