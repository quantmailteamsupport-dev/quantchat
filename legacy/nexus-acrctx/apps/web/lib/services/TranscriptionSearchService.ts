/**
 * TranscriptionSearchService
 *
 * Full-text fuzzy search across all transcribed voice messages.  Transcriptions
 * are persisted in IndexedDB via Dexie so they survive page reloads.
 *
 * Features
 * ─────────
 * • Full-text search with an in-memory inverted token index
 * • Fuzzy matching — Levenshtein distance ≤ 2 for short queries
 * • Phonetic matching via a Soundex implementation for "sounds-like" search
 * • Filters: date range, contactId, groupId, language
 * • Results include surrounding context with matched tokens highlighted
 * • Jump-to-timestamp: each result carries the exact audio offset
 */

import Dexie, { type Table } from "dexie";
import type { TranscriptionResult, TranscribedWord, SupportedLanguage } from "./VoiceTranscriber";

// ─── Persisted record schema ──────────────────────────────────────────────────

export interface StoredTranscription {
  /** Auto-incremented primary key. */
  id?: number;
  /** The message ID that links back to the chat message. */
  messageId: string;
  /** Display name / ID of the sender. */
  contactId: string;
  /** Group ID for group messages (empty string for DMs). */
  groupId: string;
  /** ISO 8601 timestamp of when the message was received. */
  receivedAt: string;
  /** Primary detected language. */
  language: SupportedLanguage;
  /** Full plain-text transcript (used for FTS). */
  fullText: string;
  /** Serialised word array (JSON string to keep Dexie schema simple). */
  wordsJson: string;
  /** Total audio duration in seconds. */
  durationSeconds: number;
  /** Wall-clock timestamp when transcription completed. */
  completedAt: number;
  /** Number of detected speakers. */
  speakerCount: number;
}

// ─── Search types ─────────────────────────────────────────────────────────────

export interface SearchFilters {
  /** Only return messages from this contact. */
  contactId?: string;
  /** Only return messages from this group. */
  groupId?: string;
  /** Only return messages after this ISO date string. */
  dateFrom?: string;
  /** Only return messages before this ISO date string. */
  dateTo?: string;
  /** Only return messages in this language. */
  language?: SupportedLanguage;
  /** Maximum number of results to return (default: 20). */
  limit?: number;
}

export interface HighlightSpan {
  text: string;
  isMatch: boolean;
}

export interface SearchResult {
  /** Stored transcription record. */
  transcription: StoredTranscription;
  /** How well this result matches the query (higher = better). */
  score: number;
  /** Which words matched (for jump-to-timestamp). */
  matchedWords: TranscribedWord[];
  /** Context around the first match (up to 40 chars on each side). */
  contextSnippet: string;
  /** The snippet broken into highlight spans for rendering. */
  highlightSpans: HighlightSpan[];
  /** Audio offset in seconds for the first matched word. */
  jumpToSeconds: number;
}

// ─── Dexie schema ─────────────────────────────────────────────────────────────

class TranscriptionDatabase extends Dexie {
  transcriptions!: Table<StoredTranscription, number>;

  constructor() {
    super("quantchat_transcriptions");
    this.version(1).stores({
      transcriptions:
        "++id, messageId, contactId, groupId, receivedAt, language, completedAt",
    });
  }
}

// ─── Levenshtein distance ─────────────────────────────────────────────────────

/** Classic dynamic-programming Levenshtein distance. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp   = new Uint16Array(rows * cols);

  for (let i = 0; i < rows; i++) dp[i * cols + 0] = i;
  for (let j = 0; j < cols; j++) dp[0 * cols + j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i * cols + j] = Math.min(
        (dp[(i - 1) * cols + j    ] ?? 0) + 1,   // deletion
        (dp[ i      * cols + j - 1] ?? 0) + 1,   // insertion
        (dp[(i - 1) * cols + j - 1] ?? 0) + cost // substitution
      );
    }
  }

  return dp[(rows - 1) * cols + (cols - 1)] ?? 0;
}

/** Returns true when `token` approximately matches `query`. */
function fuzzyMatch(token: string, query: string): boolean {
  if (token === query) return true;
  if (token.startsWith(query)) return true;
  const maxDist = query.length <= 4 ? 1 : 2;
  return levenshtein(token.toLowerCase(), query.toLowerCase()) <= maxDist;
}

// ─── Soundex ──────────────────────────────────────────────────────────────────

/**
 * American Soundex algorithm — maps words that sound alike to the same code.
 * Limited to ASCII/Latin characters; non-Latin scripts skip phonetic matching.
 */
function soundex(str: string): string {
  if (!str) return "";
  const s = str.toUpperCase().replace(/[^A-Z]/g, "");
  if (!s) return "";

  const MAP: Record<string, string> = {
    B: "1", F: "1", P: "1", V: "1",
    C: "2", G: "2", J: "2", K: "2", Q: "2", S: "2", X: "2", Z: "2",
    D: "3", T: "3",
    L: "4",
    M: "5", N: "5",
    R: "6",
  };

  const first  = s[0] ?? "";
  let code     = first;
  let prevCode = MAP[first] ?? "0";

  for (let i = 1; i < s.length && code.length < 4; i++) {
    const c = MAP[s.charAt(i)] ?? "0";
    if (c !== "0" && c !== prevCode) {
      code += c;
    }
    prevCode = c;
  }

  return code.padEnd(4, "0").slice(0, 4);
}

// ─── Inverted index ───────────────────────────────────────────────────────────

interface IndexEntry {
  messageId: string;
  /** Word index within the message's words array. */
  wordPosition: number;
  /** The exact token (lowercase). */
  token: string;
  /** Soundex code for phonetic search. */
  soundexCode: string;
}

class InvertedIndex {
  /** token → list of entries */
  private readonly byToken   = new Map<string, IndexEntry[]>();
  /** soundex → list of entries */
  private readonly bySoundex = new Map<string, IndexEntry[]>();

  add(messageId: string, words: TranscribedWord[]): void {
    for (let i = 0; i < words.length; i++) {
      // Strip punctuation while preserving Latin-extended (ÀÿU+00C0–U+024F),
      // CJK unified ideographs (U+4E00–U+9FFF), and Hangul syllables (U+AC00–U+D7AF).
      const token      = (words[i]?.word ?? "").toLowerCase().replace(/[^a-z0-9\u00c0-\u024f\u4e00-\u9fff\uac00-\ud7af]/g, "");
      if (!token) continue;
      const sdx        = soundex(token);
      const entry: IndexEntry = { messageId, wordPosition: i, token, soundexCode: sdx };

      if (!this.byToken.has(token))    this.byToken.set(token, []);
      if (!this.bySoundex.has(sdx))   this.bySoundex.set(sdx, []);
      this.byToken.get(token)!.push(entry);
      this.bySoundex.get(sdx)!.push(entry);
    }
  }

  remove(messageId: string): void {
    for (const [token, entries] of this.byToken) {
      const filtered = entries.filter((e) => e.messageId !== messageId);
      if (filtered.length === 0) this.byToken.delete(token);
      else this.byToken.set(token, filtered);
    }
    for (const [sdx, entries] of this.bySoundex) {
      const filtered = entries.filter((e) => e.messageId !== messageId);
      if (filtered.length === 0) this.bySoundex.delete(sdx);
      else this.bySoundex.set(sdx, filtered);
    }
  }

  /**
   * Look up all entries matching `query` (exact, fuzzy, or phonetic).
   * Returns a map of messageId → matching word positions.
   */
  lookup(query: string): Map<string, Set<number>> {
    const q       = query.toLowerCase().trim();
    const qSoundex = soundex(q);
    const result   = new Map<string, Set<number>>();

    const addEntries = (entries: IndexEntry[]) => {
      for (const e of entries) {
        if (!result.has(e.messageId)) result.set(e.messageId, new Set());
        result.get(e.messageId)!.add(e.wordPosition);
      }
    };

    // 1. Exact token match
    const exactEntries = this.byToken.get(q);
    if (exactEntries) addEntries(exactEntries);

    // 2. Fuzzy match on all indexed tokens
    for (const [token, entries] of this.byToken) {
      if (token === q) continue; // already handled
      if (fuzzyMatch(token, q))  addEntries(entries);
    }

    // 3. Phonetic (Soundex) match
    if (qSoundex) {
      const phoneticEntries = this.bySoundex.get(qSoundex);
      if (phoneticEntries) addEntries(phoneticEntries);
    }

    return result;
  }
}

// ─── Context snippet generation ───────────────────────────────────────────────

const CONTEXT_CHARS = 40;

/** Build a plain-text context snippet around the first matched word. */
function buildContextSnippet(
  fullText: string,
  words: TranscribedWord[],
  matchedPositions: Set<number>
): { snippet: string; spans: HighlightSpan[] } {
  if (matchedPositions.size === 0 || words.length === 0) {
    const snippet = fullText.slice(0, CONTEXT_CHARS * 2);
    return { snippet, spans: [{ text: snippet, isMatch: false }] };
  }

  // Find first matched position
  const firstPos    = Math.min(...matchedPositions);
  const firstWord   = words[firstPos];
  if (!firstWord) {
    const snippet = fullText.slice(0, CONTEXT_CHARS * 2);
    return { snippet, spans: [{ text: snippet, isMatch: false }] };
  }

  // Build word-boundary context
  const start = Math.max(0, firstPos - 4);
  const end   = Math.min(words.length, firstPos + 8);
  const contextWords = words.slice(start, end);

  const spans: HighlightSpan[] = contextWords.map((w, localIdx) => {
    const globalIdx = start + localIdx;
    const sep = localIdx < contextWords.length - 1 ? " " : "";
    return {
      text:    w.word + sep,
      isMatch: matchedPositions.has(globalIdx),
    };
  });

  const snippet = contextWords.map((w) => w.word).join(" ");
  return { snippet, spans };
}

// ─── TranscriptionSearchService ───────────────────────────────────────────────

export class TranscriptionSearchService {
  private readonly db: TranscriptionDatabase;
  private readonly index = new InvertedIndex();
  private indexReady     = false;
  private indexBuilding  = false;

  constructor() {
    this.db = new TranscriptionDatabase();
  }

  // ── Index management ──

  /** Populate the in-memory index from IndexedDB. Call once at startup. */
  async buildIndex(): Promise<void> {
    if (this.indexReady || this.indexBuilding) return;
    this.indexBuilding = true;
    try {
      const all = await this.db.transcriptions.toArray();
      for (const record of all) {
        const words = this.parseWords(record.wordsJson);
        this.index.add(record.messageId, words);
      }
      this.indexReady = true;
    } finally {
      this.indexBuilding = false;
    }
  }

  private async ensureIndex(): Promise<void> {
    if (!this.indexReady) await this.buildIndex();
  }

  // ── Storage ──

  /** Persist a TranscriptionResult and add it to the search index. */
  async store(
    result: TranscriptionResult,
    contactId: string,
    groupId = ""
  ): Promise<StoredTranscription> {
    await this.ensureIndex();

    const record: StoredTranscription = {
      messageId:       result.messageId,
      contactId,
      groupId,
      receivedAt:      new Date().toISOString(),
      language:        result.language,
      fullText:        result.fullText,
      wordsJson:       JSON.stringify(result.words),
      durationSeconds: result.durationSeconds,
      completedAt:     result.completedAt,
      speakerCount:    result.speakerCount,
    };

    // Upsert: remove stale entry first
    await this.db.transcriptions.where("messageId").equals(result.messageId).delete();
    this.index.remove(result.messageId);

    await this.db.transcriptions.add(record);
    this.index.add(result.messageId, result.words);

    return record;
  }

  /** Remove all transcriptions for a given message ID. */
  async delete(messageId: string): Promise<void> {
    await this.db.transcriptions.where("messageId").equals(messageId).delete();
    this.index.remove(messageId);
  }

  /** Retrieve the stored transcription for a given message. */
  async get(messageId: string): Promise<StoredTranscription | undefined> {
    return this.db.transcriptions.where("messageId").equals(messageId).first();
  }

  /** List all stored transcriptions, newest first. */
  async listAll(limit = 100): Promise<StoredTranscription[]> {
    return this.db.transcriptions
      .orderBy("completedAt")
      .reverse()
      .limit(limit)
      .toArray();
  }

  // ── Search ──

  /**
   * Full-text search with fuzzy + phonetic fallback.
   *
   * Multi-word queries require ALL tokens to match (AND semantics).
   */
  async search(query: string, filters: SearchFilters = {}): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    await this.ensureIndex();

    const limit   = filters.limit ?? 20;
    const tokens  = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

    // Find message IDs that match ALL tokens (AND)
    let candidateIds: Set<string> | null = null;
    const matchedPositionsByMsg = new Map<string, Set<number>>();

    for (const token of tokens) {
      const tokenMatches = this.index.lookup(token);

      if (candidateIds === null) {
        candidateIds = new Set(tokenMatches.keys());
        for (const [msgId, positions] of tokenMatches) {
          matchedPositionsByMsg.set(msgId, new Set(positions));
        }
      } else {
        // Intersect with current candidates
        for (const id of candidateIds) {
          if (!tokenMatches.has(id)) {
            candidateIds.delete(id);
            matchedPositionsByMsg.delete(id);
          } else {
            // Union of matched positions across tokens
            const existing = matchedPositionsByMsg.get(id)!;
            for (const pos of tokenMatches.get(id)!) {
              existing.add(pos);
            }
          }
        }
      }
    }

    if (!candidateIds || candidateIds.size === 0) return [];

    // Fetch candidate records from DB
    const candidateArray = Array.from(candidateIds);
    let records = await this.db.transcriptions
      .where("messageId")
      .anyOf(candidateArray)
      .toArray();

    // Apply filters
    records = this.applyFilters(records, filters);

    // Build SearchResult objects with scoring
    const results: SearchResult[] = [];

    for (const record of records) {
      const words   = this.parseWords(record.wordsJson);
      const positions = matchedPositionsByMsg.get(record.messageId) ?? new Set<number>();
      const matchedWords = Array.from(positions)
        .sort((a, b) => a - b)
        .map((i) => words[i])
        .filter((w): w is TranscribedWord => w !== undefined);

      const score    = this.computeScore(record, matchedWords, tokens);
      const { snippet, spans } = buildContextSnippet(record.fullText, words, positions);
      const jumpSecs = matchedWords[0]?.startTime ?? 0;

      results.push({
        transcription:  record,
        score,
        matchedWords,
        contextSnippet: snippet,
        highlightSpans: spans,
        jumpToSeconds:  jumpSecs,
      });
    }

    // Sort by descending score
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  // ── Filter helpers ──

  private applyFilters(
    records: StoredTranscription[],
    filters: SearchFilters
  ): StoredTranscription[] {
    return records.filter((r) => {
      if (filters.contactId && r.contactId !== filters.contactId)   return false;
      if (filters.groupId   && r.groupId   !== filters.groupId)     return false;
      if (filters.language  && r.language  !== filters.language)    return false;
      if (filters.dateFrom  && r.receivedAt < filters.dateFrom)     return false;
      if (filters.dateTo    && r.receivedAt > filters.dateTo)       return false;
      return true;
    });
  }

  // ── Scoring ──

  /**
   * Compute a relevance score for a result.
   *
   * Factors:
   * 1. Match density  — matched words / total words
   * 2. Recency bonus  — newer messages get a small boost
   * 3. Confidence sum — higher average transcription confidence scores better
   */
  private computeScore(
    record: StoredTranscription,
    matchedWords: TranscribedWord[],
    queryTokens: string[]
  ): number {
    const words        = this.parseWords(record.wordsJson);
    const totalWords   = Math.max(words.length, 1);
    const density      = matchedWords.length / totalWords;

    const now          = Date.now();
    const ageMs        = now - record.completedAt;
    const recencyBonus = Math.exp(-ageMs / (7 * 24 * 60 * 60 * 1000)); // halves every week

    const avgConf      = matchedWords.length > 0
      ? matchedWords.reduce((s, w) => s + w.confidence, 0) / matchedWords.length
      : 0;

    // Bonus for exact token matches vs. fuzzy matches
    let exactBonus = 0;
    for (const token of queryTokens) {
      for (const w of matchedWords) {
        if (w.word.toLowerCase() === token) { exactBonus += 0.1; break; }
      }
    }

    return density * 0.5 + recencyBonus * 0.2 + avgConf * 0.2 + exactBonus;
  }

  // ── Utilities ──

  private parseWords(wordsJson: string): TranscribedWord[] {
    try {
      const raw = JSON.parse(wordsJson) as Array<{
        word: string;
        startTime?: number;
        start?: number;
        endTime?: number;
        end?: number;
        confidence: number;
        speakerIndex?: number;
        speaker?: number;
      }>;
      return raw.map((w) => ({
        word:         w.word,
        startTime:    w.startTime ?? w.start ?? 0,
        endTime:      w.endTime   ?? w.end   ?? 0,
        confidence:   w.confidence,
        speakerIndex: w.speakerIndex ?? w.speaker ?? -1,
      }));
    } catch {
      return [];
    }
  }

  /** Clear all stored transcriptions and reset the index. */
  async clearAll(): Promise<void> {
    await this.db.transcriptions.clear();
    this.indexReady = false;
    await this.buildIndex();
  }

  /** Total number of stored transcriptions. */
  async count(): Promise<number> {
    return this.db.transcriptions.count();
  }

  /**
   * Return all unique contacts for which transcriptions are stored.
   * Useful for populating a filter dropdown.
   */
  async listContacts(): Promise<string[]> {
    const all = await this.db.transcriptions.toArray();
    return Array.from(new Set(all.map((r) => r.contactId))).sort();
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let searchServiceInstance: TranscriptionSearchService | null = null;

export function getTranscriptionSearchService(): TranscriptionSearchService {
  if (!searchServiceInstance) {
    searchServiceInstance = new TranscriptionSearchService();
  }
  return searchServiceInstance;
}

export function __resetTranscriptionSearchServiceForTests(): void {
  searchServiceInstance = null;
}
