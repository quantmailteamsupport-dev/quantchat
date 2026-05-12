import { createHmac } from "crypto";
import { logger } from "../logger";

const BLIND_INDEX_HEX_LEN = 64;
const MAX_DOCUMENTS = 100_000;
const MAX_HASHED_TERMS_PER_MESSAGE = 48;
const MAX_METADATA_TAGS_PER_MESSAGE = 12;
const MAX_TAG_LENGTH = 64;

export interface IndexableMessage {
  messageId: string;
  threadId: string;
  senderId: string;
  senderName?: string;
  timestamp: number;
  messageType?: "text" | "caption" | "link" | string;
  hashedTerms?: string[];
  metadataTags?: string[];
}

export interface SearchResult {
  messageId: string;
  threadId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  score: number;
  highlights: Array<{ start: number; end: number }>;
}

export interface SearchOptions {
  limit?: number;
  threadId?: string;
  senderId?: string;
  dateFrom?: number;
  dateTo?: number;
  fuzzy?: boolean;
  termHashes?: string[];
  tags?: string[];
}

export interface SearchSuggestion {
  term: string;
  frequency: number;
}

interface MessageDoc {
  message: IndexableMessage;
  hashedTerms: string[];
  metadataTags: string[];
}

export class MessageSearchEngine {
  private readonly docs = new Map<string, MessageDoc>();
  private readonly hashedTermIndex = new Map<string, Set<string>>();
  private readonly tagIndex = new Map<string, Set<string>>();
  private readonly tagFrequency = new Map<string, number>();
  private readonly blindIndexKey?: string;

  constructor(blindIndexKey?: string) {
    this.blindIndexKey = blindIndexKey?.trim() || undefined;
  }

  // Helper for clients that need deterministic metadata hashing.
  static blindIndex(term: string, secret: string): string {
    return createHmac("sha256", Buffer.from(secret))
      .update(term.trim().toLowerCase())
      .digest("hex");
  }

  static isBlindIndexHash(value: string): boolean {
    return /^[a-f0-9]{64}$/i.test(value);
  }

  indexMessage(message: IndexableMessage): void {
    if (this.docs.size >= MAX_DOCUMENTS) {
      this.evictOldest();
    }

    const hashedTerms = this.normalizeHashedTerms([
      ...(message.hashedTerms ?? []),
      ...this.legacyHashedTerms(message),
    ]);
    const metadataTags = this.normalizeTags(message.metadataTags ?? []);

    const existing = this.docs.get(message.messageId);
    if (existing) {
      this.removeMessage(message.messageId);
    }

    this.docs.set(message.messageId, {
      message: {
        ...message,
        senderName: message.senderName ?? "unknown",
      },
      hashedTerms,
      metadataTags,
    });

    for (const hash of hashedTerms) {
      if (!this.hashedTermIndex.has(hash)) {
        this.hashedTermIndex.set(hash, new Set());
      }
      this.hashedTermIndex.get(hash)!.add(message.messageId);
    }

    for (const tag of metadataTags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(message.messageId);
      this.tagFrequency.set(tag, (this.tagFrequency.get(tag) ?? 0) + 1);
    }
  }

  removeMessage(messageId: string): void {
    const doc = this.docs.get(messageId);
    if (!doc) return;

    for (const hash of doc.hashedTerms) {
      const postings = this.hashedTermIndex.get(hash);
      if (!postings) continue;
      postings.delete(messageId);
      if (postings.size === 0) {
        this.hashedTermIndex.delete(hash);
      }
    }

    for (const tag of doc.metadataTags) {
      const postings = this.tagIndex.get(tag);
      if (postings) {
        postings.delete(messageId);
        if (postings.size === 0) {
          this.tagIndex.delete(tag);
        }
      }

      const nextFrequency = (this.tagFrequency.get(tag) ?? 1) - 1;
      if (nextFrequency <= 0) {
        this.tagFrequency.delete(tag);
      } else {
        this.tagFrequency.set(tag, nextFrequency);
      }
    }

    this.docs.delete(messageId);
  }

  search(query: string, options: SearchOptions = {}): SearchResult[] {
    const limit = options.limit ?? 20;
    const queryHashes = new Set<string>([
      ...this.extractQueryHashes(query),
      ...this.normalizeHashedTerms(options.termHashes ?? []),
    ]);
    const queryTags = this.normalizeTags(options.tags ?? []);

    if (queryHashes.size === 0 && queryTags.length === 0) {
      return [];
    }

    const candidateScores = new Map<string, { score: number; hashMatches: number; tagMatches: number }>();

    for (const hash of queryHashes) {
      const postings = this.hashedTermIndex.get(hash);
      if (!postings) continue;

      const idf = Math.log((this.docs.size + 1) / (postings.size + 1)) + 1;
      for (const messageId of postings) {
        const state = candidateScores.get(messageId) ?? { score: 0, hashMatches: 0, tagMatches: 0 };
        state.score += idf;
        state.hashMatches += 1;
        candidateScores.set(messageId, state);
      }
    }

    if (queryTags.length > 0) {
      for (const tag of queryTags) {
        const postings = this.tagIndex.get(tag);
        if (!postings) continue;

        for (const messageId of postings) {
          const state = candidateScores.get(messageId) ?? { score: 0, hashMatches: 0, tagMatches: 0 };
          state.score += 0.5;
          state.tagMatches += 1;
          candidateScores.set(messageId, state);
        }
      }
    }

    const results: SearchResult[] = [];

    for (const [messageId, candidate] of candidateScores) {
      const doc = this.docs.get(messageId);
      if (!doc) continue;

      if (options.threadId && doc.message.threadId !== options.threadId) continue;
      if (options.senderId && doc.message.senderId !== options.senderId) continue;
      if (options.dateFrom && doc.message.timestamp < options.dateFrom) continue;
      if (options.dateTo && doc.message.timestamp > options.dateTo) continue;

      if (queryTags.length > 0) {
        const tagSet = new Set(doc.metadataTags);
        const hasAllTags = queryTags.every((tag) => tagSet.has(tag));
        if (!hasAllTags) continue;
      }

      const ageHours = Math.max(0, (Date.now() - doc.message.timestamp) / (60 * 60 * 1000));
      const recencyBoost = 1 / (1 + Math.log1p(ageHours / 24));
      const matchBoost = 1 + candidate.hashMatches * 0.2 + candidate.tagMatches * 0.1;

      results.push({
        messageId,
        threadId: doc.message.threadId,
        senderId: doc.message.senderId,
        senderName: doc.message.senderName ?? "unknown",
        // Server never stores plaintext for searchable message bodies.
        content: "",
        timestamp: doc.message.timestamp,
        score: candidate.score * recencyBoost * matchBoost,
        highlights: [],
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  getSuggestions(prefix: string, limit: number = 5): SearchSuggestion[] {
    const normalizedPrefix = this.normalizeTag(prefix);
    if (!normalizedPrefix) return [];

    const suggestions: SearchSuggestion[] = [];
    for (const [tag, frequency] of this.tagFrequency) {
      if (!tag.startsWith(normalizedPrefix) || tag === normalizedPrefix) continue;
      suggestions.push({ term: tag, frequency });
    }

    suggestions.sort((a, b) => b.frequency - a.frequency);
    return suggestions.slice(0, limit);
  }

  getStats() {
    return {
      totalDocuments: this.docs.size,
      blindIndexTerms: this.hashedTermIndex.size,
      metadataTags: this.tagIndex.size,
      memoryEstimateMb:
        Math.round(
          (this.docs.size * 320 + this.hashedTermIndex.size * 140 + this.tagIndex.size * 100) /
            1_048_576 *
            100,
        ) / 100,
    };
  }

  private extractQueryHashes(query: string): string[] {
    if (!query || typeof query !== "string") return [];

    return query
      .split(/[\s,]+/)
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length > 0 && MessageSearchEngine.isBlindIndexHash(part));
  }

  private normalizeHashedTerms(terms: string[]): string[] {
    const unique = new Set<string>();

    for (const term of terms) {
      if (typeof term !== "string") continue;
      const normalized = term.trim().toLowerCase();
      if (!MessageSearchEngine.isBlindIndexHash(normalized)) continue;
      unique.add(normalized);
      if (unique.size >= MAX_HASHED_TERMS_PER_MESSAGE) break;
    }

    return Array.from(unique);
  }

  private normalizeTags(tags: string[]): string[] {
    const unique = new Set<string>();

    for (const tag of tags) {
      const normalized = this.normalizeTag(tag);
      if (!normalized) continue;
      unique.add(normalized);
      if (unique.size >= MAX_METADATA_TAGS_PER_MESSAGE) break;
    }

    return Array.from(unique);
  }

  private normalizeTag(tag: string): string | null {
    if (typeof tag !== "string") return null;
    const normalized = tag.trim().toLowerCase();
    if (!normalized || normalized.length > MAX_TAG_LENGTH) return null;
    if (!/^[a-z0-9:_-]+$/.test(normalized)) return null;
    return normalized;
  }

  private evictOldest(): void {
    let oldest: { id: string; timestamp: number } | null = null;

    for (const [id, doc] of this.docs) {
      if (!oldest || doc.message.timestamp < oldest.timestamp) {
        oldest = { id, timestamp: doc.message.timestamp };
      }
    }

    if (oldest) {
      this.removeMessage(oldest.id);
    }
  }

  private legacyHashedTerms(message: IndexableMessage): string[] {
    const rawContent = (message as { content?: unknown }).content;
    if (typeof rawContent !== "string" || rawContent.trim().length === 0) {
      return [];
    }

    if (!this.blindIndexKey) {
      logger.warn(
        {
          messageId: message.messageId,
        },
        "[MessageSearchEngine] Received plaintext content without blind-index key; content was ignored",
      );
      return [];
    }

    const tokens = rawContent
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 2)
      .slice(0, MAX_HASHED_TERMS_PER_MESSAGE);

    return tokens.map((token) => MessageSearchEngine.blindIndex(token, this.blindIndexKey!));
  }
}
