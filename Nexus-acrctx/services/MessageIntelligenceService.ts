/**
 * Message Intelligence Service for QuantChat
 * Uses shared-kernel AI/ML engines for smart messaging
 * Powers WhatsApp/Telegram-level features with AI
 */

import { nlpEngine } from '@infinity-trinity/shared-kernel/AdvancedNLPEngine';
import { recommendationEngine } from '@infinity-trinity/shared-kernel/AdvancedRecommendationEngine';

export class MessageIntelligenceService {
  /**
   * Moderate message content for spam/abuse
   */
  async moderateMessage(message: {
    content: string;
    senderId: string;
    recipientId: string;
    chatId: string;
  }) {
    try {
      const moderation = await nlpEngine.moderateContent(message.content);

      // Check for spam patterns
      const isSpam = await this.detectSpamMessage(message.content);

      // Analyze sentiment
      const sentiment = await nlpEngine.analyzeSentiment(message.content);

      return {
        success: true,
        isAppropriate: moderation.isAppropriate && !isSpam,
        isSpam,
        categories: moderation.categories,
        confidence: moderation.confidence,
        severity: moderation.severity,
        sentiment: sentiment.label,
        sentimentScore: sentiment.score,
        suggestions: moderation.suggestions,
      };
    } catch (error) {
      console.error('Error moderating message:', error);
      return {
        success: false,
        isAppropriate: true,
        isSpam: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Detect spam in messages
   */
  private async detectSpamMessage(content: string): Promise<boolean> {
    const spamPatterns = [
      /\b(click|visit|check out)\s+(this|my|our)\s+(link|website|channel)/i,
      /\b(free|win|prize|giveaway|lottery)\b/i,
      /(http|https):\/\/[^\s]+/g, // Multiple URLs
      /\b(whatsapp|telegram|discord)\s*[:@+]/i,
      /\b(earn|make)\s+\$?\d+\s*(per|a)\s*(day|hour|week)/i,
      /\b(limited time|act now|hurry|urgent)/i,
      /\b(congratulations|you've won|claim your)/i,
    ];

    const hasSpamPattern = spamPatterns.some(pattern => pattern.test(content));
    
    // Check for excessive caps (prevent division by zero)
    const capsCount = (content.match(/[A-Z]/g) || []).length;
    const capsRatio = content.length > 0 ? capsCount / content.length : 0;
    const excessiveCaps = capsRatio > 0.6 && content.length > 10;

    // Check for repeated characters
    const hasRepeatedChars = /(.)\1{5,}/.test(content);

    // Check for excessive emojis
    const emojiCount = (content.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length;
    const excessiveEmojis = emojiCount > 10;

    return hasSpamPattern || excessiveCaps || hasRepeatedChars || excessiveEmojis;
  }

  /**
   * Analyze message sentiment
   */
  async analyzeMessageSentiment(content: string) {
    try {
      const sentiment = await nlpEngine.analyzeSentiment(content);

      return {
        success: true,
        sentiment: sentiment.label,
        score: sentiment.score,
        confidence: sentiment.confidence,
        emotions: sentiment.emotions,
      };
    } catch (error) {
      console.error('Error analyzing message sentiment:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Generate smart reply suggestions
   */
  async generateSmartReplies(message: string, context?: string[]) {
    try {
      // Analyze message sentiment and intent
      const sentiment = await nlpEngine.analyzeSentiment(message);
      
      // Generate contextual replies based on sentiment
      const replies = this.generateContextualReplies(message, sentiment.label);

      return {
        success: true,
        replies,
        sentiment: sentiment.label,
      };
    } catch (error) {
      console.error('Error generating smart replies:', error);
      return {
        success: false,
        replies: [],
        error: (error as Error).message,
      };
    }
  }

  /**
   * Generate contextual reply suggestions
   */
  private generateContextualReplies(message: string, sentiment: string): string[] {
    const lowerMessage = message.toLowerCase();

    // Question responses
    if (lowerMessage.includes('?')) {
      return [
        "Let me think about that...",
        "That's a great question!",
        "I'll get back to you on that.",
      ];
    }

    // Positive sentiment
    if (sentiment === 'positive') {
      return [
        "That's awesome! 🎉",
        "I'm so happy to hear that!",
        "Sounds great!",
      ];
    }

    // Negative sentiment
    if (sentiment === 'negative') {
      return [
        "I'm sorry to hear that.",
        "That's unfortunate. How can I help?",
        "I understand how you feel.",
      ];
    }

    // Greeting
    if (lowerMessage.match(/\b(hi|hello|hey|good morning|good evening)\b/)) {
      return [
        "Hey! How are you?",
        "Hi there! 👋",
        "Hello! What's up?",
      ];
    }

    // Thanks
    if (lowerMessage.match(/\b(thanks|thank you|thx)\b/)) {
      return [
        "You're welcome! 😊",
        "Happy to help!",
        "Anytime!",
      ];
    }

    // Default responses
    return [
      "Got it!",
      "Okay, understood.",
      "Thanks for letting me know.",
    ];
  }

  /**
   * Summarize long messages
   */
  async summarizeMessage(content: string, maxLength = 100) {
    try {
      if (content.length <= maxLength) {
        return {
          success: true,
          summary: content,
          originalLength: content.length,
          summaryLength: content.length,
        };
      }

      const summary = await nlpEngine.summarizeText(content, maxLength);

      return {
        success: true,
        summary,
        originalLength: content.length,
        summaryLength: summary.length,
      };
    } catch (error) {
      console.error('Error summarizing message:', error);
      return {
        success: false,
        summary: '',
        error: (error as Error).message,
      };
    }
  }

  /**
   * Detect message language
   */
  async detectMessageLanguage(content: string) {
    try {
      const language = await nlpEngine.detectLanguage(content);

      return {
        success: true,
        language: language.language,
        confidence: language.confidence,
        alternatives: language.alternatives,
      };
    } catch (error) {
      console.error('Error detecting language:', error);
      return {
        success: false,
        language: 'unknown',
        error: (error as Error).message,
      };
    }
  }

  /**
   * Extract entities from message (people, places, dates, etc.)
   */
  async extractMessageEntities(content: string) {
    try {
      const entities = await nlpEngine.extractEntities(content);

      return {
        success: true,
        entities: entities.entities,
        count: entities.entities.length,
        categories: {
          people: entities.entities.filter(e => e.type === 'PERSON'),
          places: entities.entities.filter(e => e.type === 'LOCATION'),
          organizations: entities.entities.filter(e => e.type === 'ORGANIZATION'),
          dates: entities.entities.filter(e => e.type === 'DATE'),
          other: entities.entities.filter(e => e.type === 'OTHER'),
        },
      };
    } catch (error) {
      console.error('Error extracting entities:', error);
      return {
        success: false,
        entities: [],
        count: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get conversation recommendations (similar chats, suggested contacts)
   */
  async getConversationRecommendations(userId: string, limit = 10) {
    try {
      const recommendations = await recommendationEngine.getRecommendations({
        userId,
        itemType: 'conversation',
        limit,
        algorithm: 'collaborative',
      });

      return {
        success: true,
        recommendations,
        count: recommendations.length,
      };
    } catch (error) {
      console.error('Error getting conversation recommendations:', error);
      return {
        success: false,
        recommendations: [],
        count: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Track message interaction for recommendations
   */
  async trackMessageInteraction(
    userId: string,
    chatId: string,
    action: 'send' | 'read' | 'react' | 'reply' | 'forward'
  ) {
    try {
      const interactionTypeMap: Record<string, 'view' | 'like' | 'share' | 'click'> = {
        send: 'click',
        read: 'view',
        react: 'like',
        reply: 'click',
        forward: 'share',
      };

      await recommendationEngine.trackInteraction({
        userId,
        itemId: chatId,
        itemType: 'conversation',
        interactionType: interactionTypeMap[action],
        timestamp: new Date(),
        metadata: { action },
      });

      return { success: true };
    } catch (error) {
      console.error('Error tracking message interaction:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Smart search in messages
   */
  async searchMessages(query: string, messages: any[], options?: {
    fields?: string[];
    limit?: number;
    threshold?: number;
  }) {
    try {
      const results = await nlpEngine.smartSearch(query, messages, {
        fields: options?.fields || ['content', 'sender', 'metadata'],
        limit: options?.limit || 50,
        threshold: options?.threshold || 0.3,
      });

      return {
        success: true,
        results,
        count: results.length,
        query,
      };
    } catch (error) {
      console.error('Error searching messages:', error);
      return {
        success: false,
        results: [],
        count: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Batch moderate multiple messages
   */
  async batchModerateMessages(messages: Array<{
    id: string;
    content: string;
    senderId: string;
    recipientId: string;
    chatId: string;
  }>) {
    try {
      const results = await Promise.all(
        messages.map(async msg => ({
          id: msg.id,
          senderId: msg.senderId,
          moderation: await this.moderateMessage(msg),
        }))
      );

      const inappropriate = results.filter(r => !r.moderation.isAppropriate);
      const spam = results.filter(r => r.moderation.isSpam);

      return {
        success: true,
        total: results.length,
        inappropriate: inappropriate.length,
        spam: spam.length,
        results,
      };
    } catch (error) {
      console.error('Error batch moderating messages:', error);
      return {
        success: false,
        total: 0,
        inappropriate: 0,
        spam: 0,
        results: [],
        error: (error as Error).message,
      };
    }
  }

  /**
   * Detect message intent (question, statement, command, etc.)
   */
  detectMessageIntent(content: string): {
    intent: 'question' | 'statement' | 'command' | 'greeting' | 'farewell' | 'thanks' | 'unknown';
    confidence: number;
  } {
    const lowerContent = content.toLowerCase().trim();

    // Question
    if (lowerContent.includes('?') || lowerContent.match(/\b(what|when|where|who|why|how|can|could|would|should)\b/)) {
      return { intent: 'question', confidence: 0.9 };
    }

    // Greeting
    if (lowerContent.match(/\b(hi|hello|hey|good morning|good afternoon|good evening)\b/)) {
      return { intent: 'greeting', confidence: 0.95 };
    }

    // Farewell
    if (lowerContent.match(/\b(bye|goodbye|see you|take care|later)\b/)) {
      return { intent: 'farewell', confidence: 0.95 };
    }

    // Thanks
    if (lowerContent.match(/\b(thanks|thank you|thx|appreciate)\b/)) {
      return { intent: 'thanks', confidence: 0.9 };
    }

    // Command
    if (lowerContent.match(/\b(please|can you|could you|would you|send|show|tell)\b/)) {
      return { intent: 'command', confidence: 0.8 };
    }

    // Statement (default)
    return { intent: 'statement', confidence: 0.7 };
  }

  /**
   * Get message statistics for a chat
   */
  async getChatStatistics(chatId: string, messages: any[]) {
    try {
      const sentiments = await Promise.all(
        messages.map(m => nlpEngine.analyzeSentiment(m.content))
      );

      const positive = sentiments.filter(s => s.label === 'positive').length;
      const negative = sentiments.filter(s => s.label === 'negative').length;
      const neutral = sentiments.filter(s => s.label === 'neutral').length;

      // Prevent division by zero
      const averageSentiment = sentiments.length > 0
        ? sentiments.reduce((sum, s) => sum + s.score, 0) / sentiments.length
        : 0;
      
      const totalLength = messages.reduce((sum, m) => sum + m.content.length, 0);
      const averageMessageLength = messages.length > 0 ? totalLength / messages.length : 0;

      return {
        success: true,
        chatId,
        statistics: {
          totalMessages: messages.length,
          sentimentDistribution: {
            positive,
            negative,
            neutral,
          },
          averageSentiment,
          averageMessageLength,
        },
      };
    } catch (error) {
      console.error('Error getting chat statistics:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}

export const messageIntelligenceService = new MessageIntelligenceService();

// Made with Bob
