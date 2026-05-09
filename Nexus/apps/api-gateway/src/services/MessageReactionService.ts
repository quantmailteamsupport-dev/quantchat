/**
 * Message Reaction Service
 * 
 * Handles emoji reactions, custom reactions, and reaction analytics for messages.
 * Supports real-time updates via Socket.io.
 */

export interface Reaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: Date;
  metadata?: {
    deviceType?: string;
    location?: string;
  };
}

export interface ReactionSummary {
  messageId: string;
  reactions: Map<string, ReactionCount>;
  totalCount: number;
  userReaction?: string;
}

export interface ReactionCount {
  emoji: string;
  count: number;
  users: string[];
  latestAt: Date;
}

export interface ReactionEvent {
  type: 'added' | 'removed';
  reaction: Reaction;
  summary: ReactionSummary;
}

export class MessageReactionService {
  private reactions: Map<string, Reaction[]>; // messageId -> reactions
  private userReactions: Map<string, Map<string, string>>; // userId -> messageId -> emoji

  // Popular emoji reactions
  private readonly QUICK_REACTIONS = [
    '👍', '❤️', '😂', '😮', '😢', '🙏',
    '🎉', '🔥', '👏', '💯', '✨', '💪'
  ];

  constructor() {
    this.reactions = new Map();
    this.userReactions = new Map();
  }

  /**
   * Add reaction to a message
   */
  async addReaction(
    messageId: string,
    userId: string,
    emoji: string,
    metadata?: Reaction['metadata']
  ): Promise<ReactionEvent> {
    // Validate emoji
    if (!this.isValidEmoji(emoji)) {
      throw new Error('Invalid emoji');
    }

    // Check if user already reacted to this message
    const existingReaction = this.getUserReaction(userId, messageId);
    
    if (existingReaction) {
      // If same emoji, remove it (toggle)
      if (existingReaction === emoji) {
        return this.removeReaction(messageId, userId);
      }
      // If different emoji, remove old one first
      await this.removeReaction(messageId, userId);
    }

    // Create new reaction
    const reaction: Reaction = {
      id: `reaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      messageId,
      userId,
      emoji,
      createdAt: new Date(),
      metadata,
    };

    // Store reaction
    const messageReactions = this.reactions.get(messageId) || [];
    messageReactions.push(reaction);
    this.reactions.set(messageId, messageReactions);

    // Update user reactions map
    const userReactionsMap = this.userReactions.get(userId) || new Map();
    userReactionsMap.set(messageId, emoji);
    this.userReactions.set(userId, userReactionsMap);

    // Get updated summary
    const summary = this.getReactionSummary(messageId, userId);

    return {
      type: 'added',
      reaction,
      summary,
    };
  }

  /**
   * Remove reaction from a message
   */
  async removeReaction(messageId: string, userId: string): Promise<ReactionEvent> {
    const messageReactions = this.reactions.get(messageId) || [];
    const reactionIndex = messageReactions.findIndex(r => r.userId === userId);

    if (reactionIndex === -1) {
      throw new Error('Reaction not found');
    }

    const removedReaction = messageReactions[reactionIndex];
    if (!removedReaction) {
      throw new Error('Reaction not found');
    }
    messageReactions.splice(reactionIndex, 1);

    if (messageReactions.length === 0) {
      this.reactions.delete(messageId);
    } else {
      this.reactions.set(messageId, messageReactions);
    }

    // Update user reactions map
    const userReactionsMap = this.userReactions.get(userId);
    if (userReactionsMap) {
      userReactionsMap.delete(messageId);
      if (userReactionsMap.size === 0) {
        this.userReactions.delete(userId);
      }
    }

    // Get updated summary
    const summary = this.getReactionSummary(messageId, userId);

    return {
      type: 'removed',
      reaction: removedReaction,
      summary,
    };
  }

  /**
   * Get reaction summary for a message
   */
  getReactionSummary(messageId: string, currentUserId?: string): ReactionSummary {
    const messageReactions = this.reactions.get(messageId) || [];
    const reactionMap = new Map<string, ReactionCount>();

    // Group reactions by emoji
    messageReactions.forEach(reaction => {
      const existing = reactionMap.get(reaction.emoji);
      
      if (existing) {
        existing.count++;
        existing.users.push(reaction.userId);
        if (reaction.createdAt > existing.latestAt) {
          existing.latestAt = reaction.createdAt;
        }
      } else {
        reactionMap.set(reaction.emoji, {
          emoji: reaction.emoji,
          count: 1,
          users: [reaction.userId],
          latestAt: reaction.createdAt,
        });
      }
    });

    // Get current user's reaction
    let userReaction: string | undefined;
    if (currentUserId) {
      userReaction = this.getUserReaction(currentUserId, messageId);
    }

    return {
      messageId,
      reactions: reactionMap,
      totalCount: messageReactions.length,
      userReaction,
    };
  }

  /**
   * Get user's reaction for a message
   */
  private getUserReaction(userId: string, messageId: string): string | undefined {
    return this.userReactions.get(userId)?.get(messageId);
  }

  /**
   * Get all reactions for multiple messages
   */
  getBulkReactionSummaries(
    messageIds: string[],
    currentUserId?: string
  ): Map<string, ReactionSummary> {
    const summaries = new Map<string, ReactionSummary>();

    messageIds.forEach(messageId => {
      summaries.set(messageId, this.getReactionSummary(messageId, currentUserId));
    });

    return summaries;
  }

  /**
   * Get top reactors for a message
   */
  getTopReactors(messageId: string, limit: number = 10): Array<{
    userId: string;
    reactions: string[];
    count: number;
  }> {
    const messageReactions = this.reactions.get(messageId) || [];
    const userReactionMap = new Map<string, string[]>();

    // Group by user
    messageReactions.forEach(reaction => {
      const existing = userReactionMap.get(reaction.userId) || [];
      existing.push(reaction.emoji);
      userReactionMap.set(reaction.userId, existing);
    });

    // Convert to array and sort
    const topReactors = Array.from(userReactionMap.entries())
      .map(([userId, reactions]) => ({
        userId,
        reactions,
        count: reactions.length,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return topReactors;
  }

  /**
   * Get reaction analytics
   */
  getReactionAnalytics(messageId: string): {
    totalReactions: number;
    uniqueUsers: number;
    mostPopularEmoji: string;
    reactionDistribution: Map<string, number>;
    averageReactionsPerUser: number;
  } {
    const messageReactions = this.reactions.get(messageId) || [];
    const uniqueUsers = new Set(messageReactions.map(r => r.userId));
    const emojiCounts = new Map<string, number>();

    messageReactions.forEach(reaction => {
      emojiCounts.set(reaction.emoji, (emojiCounts.get(reaction.emoji) || 0) + 1);
    });

    let mostPopularEmoji = '';
    let maxCount = 0;
    emojiCounts.forEach((count, emoji) => {
      if (count > maxCount) {
        maxCount = count;
        mostPopularEmoji = emoji;
      }
    });

    return {
      totalReactions: messageReactions.length,
      uniqueUsers: uniqueUsers.size,
      mostPopularEmoji,
      reactionDistribution: emojiCounts,
      averageReactionsPerUser: uniqueUsers.size > 0 
        ? messageReactions.length / uniqueUsers.size 
        : 0,
    };
  }

  /**
   * Get quick reaction suggestions
   */
  getQuickReactions(): string[] {
    return [...this.QUICK_REACTIONS];
  }

  /**
   * Get trending reactions (most used recently)
   */
  getTrendingReactions(limit: number = 6): string[] {
    const recentReactions = new Map<string, number>();
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    // Count reactions from last 24 hours
    this.reactions.forEach(messageReactions => {
      messageReactions.forEach(reaction => {
        if (reaction.createdAt.getTime() > oneDayAgo) {
          recentReactions.set(
            reaction.emoji,
            (recentReactions.get(reaction.emoji) || 0) + 1
          );
        }
      });
    });

    // Sort by count and return top N
    return Array.from(recentReactions.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([emoji]) => emoji);
  }

  /**
   * Validate emoji
   */
  private isValidEmoji(emoji: string): boolean {
    // Basic emoji validation (can be enhanced)
    const emojiRegex = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u;
    return emojiRegex.test(emoji) || this.QUICK_REACTIONS.includes(emoji);
  }

  /**
   * Get reaction history for a user
   */
  getUserReactionHistory(userId: string, limit: number = 50): Reaction[] {
    const userReactions: Reaction[] = [];

    this.reactions.forEach(messageReactions => {
      messageReactions.forEach(reaction => {
        if (reaction.userId === userId) {
          userReactions.push(reaction);
        }
      });
    });

    return userReactions
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get most used emojis by a user
   */
  getUserFavoriteEmojis(userId: string, limit: number = 5): Array<{
    emoji: string;
    count: number;
  }> {
    const emojiCounts = new Map<string, number>();

    this.reactions.forEach(messageReactions => {
      messageReactions.forEach(reaction => {
        if (reaction.userId === userId) {
          emojiCounts.set(
            reaction.emoji,
            (emojiCounts.get(reaction.emoji) || 0) + 1
          );
        }
      });
    });

    return Array.from(emojiCounts.entries())
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Clear all reactions for a message (when message is deleted)
   */
  clearMessageReactions(messageId: string): void {
    const messageReactions = this.reactions.get(messageId) || [];
    
    // Remove from user reactions map
    messageReactions.forEach(reaction => {
      const userReactionsMap = this.userReactions.get(reaction.userId);
      if (userReactionsMap) {
        userReactionsMap.delete(messageId);
        if (userReactionsMap.size === 0) {
          this.userReactions.delete(reaction.userId);
        }
      }
    });

    // Remove from reactions map
    this.reactions.delete(messageId);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalReactions: number;
    totalMessages: number;
    totalUsers: number;
    averageReactionsPerMessage: number;
  } {
    let totalReactions = 0;
    this.reactions.forEach(reactions => {
      totalReactions += reactions.length;
    });

    return {
      totalReactions,
      totalMessages: this.reactions.size,
      totalUsers: this.userReactions.size,
      averageReactionsPerMessage: this.reactions.size > 0 
        ? totalReactions / this.reactions.size 
        : 0,
    };
  }
}

// Export singleton
export const messageReactionService = new MessageReactionService();

// Made with Bob
