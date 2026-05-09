/**
 * PresencePingService — Lightweight "I'm here" signaling for Quantchat.
 * ReplyCoachService — AI-powered reply suggestions and coaching.
 * Fulfills TASKS.md: "Micro: Presence Ping, Reply Coach"
 *
 * PresencePing: Sub-second heartbeat that lets contacts know you're
 * online/typing/idle without sending a full message. Rendered as
 * ambient glow indicators in the chat UI.
 *
 * ReplyCoach: Analyzes conversation context and suggests optimal
 * reply strategies — timing, tone, and content recommendations.
 */

class StructuredLogger {
  constructor(private readonly scope: string, private readonly level: "info" | "debug" | "warn" | "error" = "info") {}
  info(message: string, meta?: unknown): void {
    if (this.level === "info" || this.level === "debug") console.info(`[${this.scope}] ${message}`, meta ?? "");
  }
  debug(message: string, meta?: unknown): void {
    if (this.level === "debug") console.debug(`[${this.scope}] ${message}`, meta ?? "");
  }
  warn(message: string, meta?: unknown): void {
    console.warn(`[${this.scope}] ${message}`, meta ?? "");
  }
  error(message: string, meta?: unknown): void {
    console.error(`[${this.scope}] ${message}`, meta ?? "");
  }
}

// ─── Presence Ping Types ────────────────────────────────────────────

export type PresenceState = 'online' | 'typing' | 'idle' | 'away' | 'dnd' | 'offline';

export interface PresencePing {
  userId: string;
  state: PresenceState;
  conversationId: string;
  lastActiveAt: Date;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'web';
  batteryLevel?: number;      // 0-100, mobile only
  networkQuality?: 'good' | 'fair' | 'poor';
}

export interface PresenceSnapshot {
  conversationId: string;
  participants: Map<string, PresencePing>;
  activeCount: number;
  typingUsers: string[];
  lastActivity: Date;
}

// ─── Reply Coach Types ──────────────────────────────────────────────

export type ReplyTone = 'warm' | 'professional' | 'casual' | 'urgent' | 'empathetic' | 'playful';
export type ReplyTiming = 'immediate' | 'wait_5min' | 'wait_1hr' | 'wait_until_morning' | 'no_rush';

export interface ConversationContext {
  conversationId: string;
  lastMessages: Array<{ senderId: string; text: string; timestamp: Date; isFromUser: boolean }>;
  relationshipType: 'close_friend' | 'acquaintance' | 'professional' | 'family' | 'new_contact';
  averageReplyTimeMs: number;
  unreadCount: number;
}

export interface ReplyCoachSuggestion {
  suggestionId: string;
  conversationId: string;
  suggestedTone: ReplyTone;
  suggestedTiming: ReplyTiming;
  timingReason: string;
  contentSuggestions: string[];
  avoidTopics: string[];
  sentimentOfThread: number;   // -1 to 1
  confidence: number;          // 0-1
  generatedAt: Date;
}

// ─── Presence Ping Service ──────────────────────────────────────────

const PRESENCE_TTL_MS = 30_000;  // 30 seconds
const TYPING_TTL_MS = 5_000;     // 5 seconds

export class PresencePingService {
  private readonly log = new StructuredLogger('presence-ping', 'info');
  private readonly pings = new Map<string, Map<string, PresencePing>>(); // convId → userId → ping

  sendPing(ping: PresencePing): void {
    if (!this.pings.has(ping.conversationId)) {
      this.pings.set(ping.conversationId, new Map());
    }
    this.pings.get(ping.conversationId)!.set(ping.userId, {
      ...ping,
      lastActiveAt: new Date(),
    });
  }

  getSnapshot(conversationId: string): PresenceSnapshot {
    const now = Date.now();
    const participants = this.pings.get(conversationId) ?? new Map();

    // Prune stale pings
    for (const [uid, ping] of participants) {
      const age = now - ping.lastActiveAt.getTime();
      if (age > PRESENCE_TTL_MS) {
        ping.state = 'offline';
      } else if (ping.state === 'typing' && age > TYPING_TTL_MS) {
        ping.state = 'online';
      }
    }

    const active = Array.from(participants.values()).filter(
      p => p.state !== 'offline' && p.state !== 'away'
    );
    const typing = active.filter(p => p.state === 'typing').map(p => p.userId);
    const lastActivity = active.reduce(
      (latest, p) => p.lastActiveAt > latest ? p.lastActiveAt : latest,
      new Date(0)
    );

    return {
      conversationId,
      participants,
      activeCount: active.length,
      typingUsers: typing,
      lastActivity,
    };
  }

  setUserOffline(userId: string): void {
    for (const [, participants] of this.pings) {
      const ping = participants.get(userId);
      if (ping) ping.state = 'offline';
    }
  }

  getOnlineUsers(): string[] {
    const online = new Set<string>();
    for (const [, participants] of this.pings) {
      for (const [uid, ping] of participants) {
        if (ping.state !== 'offline' && Date.now() - ping.lastActiveAt.getTime() < PRESENCE_TTL_MS) {
          online.add(uid);
        }
      }
    }
    return Array.from(online);
  }
}

// ─── Reply Coach Service ────────────────────────────────────────────

export class ReplyCoachService {
  private readonly log = new StructuredLogger('reply-coach', 'info');

  suggest(context: ConversationContext): ReplyCoachSuggestion {
    const lastMsg = context.lastMessages[context.lastMessages.length - 1];
    const sentiment = this.analyzeSentiment(context.lastMessages);
    const tone = this.suggestTone(context, sentiment);
    const timing = this.suggestTiming(context);
    const content = this.generateContentSuggestions(context, tone, sentiment);

    return {
      suggestionId: `rc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      conversationId: context.conversationId,
      suggestedTone: tone,
      suggestedTiming: timing.timing,
      timingReason: timing.reason,
      contentSuggestions: content,
      avoidTopics: this.detectAvoidTopics(context),
      sentimentOfThread: sentiment,
      confidence: this.calculateConfidence(context),
      generatedAt: new Date(),
    };
  }

  private suggestTone(ctx: ConversationContext, sentiment: number): ReplyTone {
    if (sentiment < -0.5) return 'empathetic';
    if (ctx.relationshipType === 'professional') return 'professional';
    if (ctx.relationshipType === 'close_friend') return sentiment > 0.3 ? 'playful' : 'warm';
    if (ctx.relationshipType === 'family') return 'warm';
    if (ctx.unreadCount > 5) return 'urgent';
    return 'casual';
  }

  private suggestTiming(ctx: ConversationContext): { timing: ReplyTiming; reason: string } {
    const lastMsg = ctx.lastMessages[ctx.lastMessages.length - 1];
    if (!lastMsg) return { timing: 'no_rush', reason: 'No messages to reply to' };

    const timeSinceMs = Date.now() - lastMsg.timestamp.getTime();
    const avgReply = ctx.averageReplyTimeMs;

    // If they just sent it, match their energy
    if (timeSinceMs < 60_000) {
      return { timing: 'immediate', reason: 'Active conversation — respond now to maintain momentum' };
    }

    // If it's been a while, don't look too eager
    if (timeSinceMs > avgReply * 2 && ctx.relationshipType !== 'professional') {
      return { timing: 'wait_5min', reason: 'Match their response cadence — don\'t reply too fast' };
    }

    // Professional contexts: be prompt
    if (ctx.relationshipType === 'professional' && timeSinceMs > 30 * 60_000) {
      return { timing: 'immediate', reason: 'Professional context — prompt reply expected' };
    }

    // Late night: wait until morning
    const hour = new Date().getHours();
    if (hour >= 23 || hour < 7) {
      return { timing: 'wait_until_morning', reason: 'Late night — schedule for morning delivery' };
    }

    return { timing: 'immediate', reason: 'Good time to reply' };
  }

  private generateContentSuggestions(ctx: ConversationContext, tone: ReplyTone, sentiment: number): string[] {
    const suggestions: string[] = [];
    const lastMsg = ctx.lastMessages[ctx.lastMessages.length - 1];
    if (!lastMsg) return ['Start the conversation with a friendly greeting!'];

    const text = lastMsg.text.toLowerCase();

    // Question detection
    if (text.includes('?')) {
      suggestions.push('Address their question directly before adding context');
    }

    // Emotional support
    if (sentiment < -0.3) {
      suggestions.push('Acknowledge their feelings before offering solutions');
      suggestions.push('Use validating language ("I understand", "That makes sense")');
    }

    // Tone-specific
    switch (tone) {
      case 'professional':
        suggestions.push('Keep it concise and action-oriented');
        suggestions.push('End with a clear next step or question');
        break;
      case 'playful':
        suggestions.push('Use humor or a fun reference to keep the energy up');
        suggestions.push('React to something specific they said');
        break;
      case 'empathetic':
        suggestions.push('Show you\'re listening by referencing their specific words');
        suggestions.push('Offer help without being pushy');
        break;
      default:
        suggestions.push('Be genuine and match their energy level');
    }

    return suggestions;
  }

  private analyzeSentiment(messages: ConversationContext['lastMessages']): number {
    if (messages.length === 0) return 0;
    const positiveWords = ['great', 'awesome', 'love', 'happy', 'excited', 'thanks', 'amazing', 'perfect', 'wonderful'];
    const negativeWords = ['sad', 'angry', 'upset', 'frustrated', 'annoyed', 'terrible', 'awful', 'worried', 'stressed'];

    let score = 0;
    for (const msg of messages.slice(-5)) {
      const words = msg.text.toLowerCase().split(/\s+/);
      for (const w of words) {
        if (positiveWords.includes(w)) score += 0.1;
        if (negativeWords.includes(w)) score -= 0.1;
      }
    }
    return Math.max(-1, Math.min(1, score));
  }

  private detectAvoidTopics(ctx: ConversationContext): string[] {
    const avoid: string[] = [];
    const recentText = ctx.lastMessages.map(m => m.text.toLowerCase()).join(' ');
    if (recentText.includes('breakup') || recentText.includes('divorce')) avoid.push('relationships');
    if (recentText.includes('fired') || recentText.includes('laid off')) avoid.push('career pressure');
    if (recentText.includes('loss') || recentText.includes('passed away')) avoid.push('trivial topics');
    return avoid;
  }

  private calculateConfidence(ctx: ConversationContext): number {
    let conf = 0.5;
    if (ctx.lastMessages.length > 3) conf += 0.15;
    if (ctx.averageReplyTimeMs > 0) conf += 0.1;
    if (ctx.relationshipType !== 'new_contact') conf += 0.15;
    return Math.min(1, conf);
  }
}

export const presencePing = new PresencePingService();
export const replyCoach = new ReplyCoachService();
