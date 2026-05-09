/**
 * QuantChat Features API Routes
 * Exposes all billion-dollar messaging features
 */

import express from 'express';
import { messageIntelligenceService } from '../services/MessageIntelligenceService';
import { realtimeCollaborationService } from '../services/RealtimeCollaborationService';

const router = express.Router();

// ============================================================================
// MESSAGE INTELLIGENCE ROUTES
// ============================================================================

/**
 * POST /api/messages/moderate
 * Moderate message content for spam/abuse
 */
router.post('/moderate', async (req, res) => {
  try {
    const { content, senderId, recipientId, chatId } = req.body;

    if (!content || !senderId || !recipientId || !chatId) {
      return res.status(400).json({ error: 'content, senderId, recipientId, and chatId are required' });
    }

    const result = await messageIntelligenceService.moderateMessage({
      content,
      senderId,
      recipientId,
      chatId,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/messages/batch-moderate
 * Batch moderate multiple messages
 */
router.post('/batch-moderate', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const result = await messageIntelligenceService.batchModerateMessages(messages);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/messages/analyze-sentiment
 * Analyze message sentiment
 */
router.post('/analyze-sentiment', async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const result = await messageIntelligenceService.analyzeMessageSentiment(content);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/messages/smart-replies
 * Generate smart reply suggestions
 */
router.post('/smart-replies', async (req, res) => {
  try {
    const { message, context } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const result = await messageIntelligenceService.generateSmartReplies(message, context);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/messages/summarize
 * Summarize long messages
 */
router.post('/summarize', async (req, res) => {
  try {
    const { content, maxLength = 100 } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const result = await messageIntelligenceService.summarizeMessage(content, maxLength);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/messages/detect-language
 * Detect message language
 */
router.post('/detect-language', async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const result = await messageIntelligenceService.detectMessageLanguage(content);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/messages/extract-entities
 * Extract entities from message
 */
router.post('/extract-entities', async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const result = await messageIntelligenceService.extractMessageEntities(content);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/messages/recommendations
 * Get conversation recommendations
 */
router.get('/recommendations', async (req, res) => {
  try {
    const { userId, limit = 10 } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const limitValue = parseInt(limit as string, 10);
    const validLimit = !isNaN(limitValue) && limitValue > 0 ? limitValue : 10;

    const result = await messageIntelligenceService.getConversationRecommendations(
      userId as string,
      validLimit
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/messages/track-interaction
 * Track message interaction
 */
router.post('/track-interaction', async (req, res) => {
  try {
    const { userId, chatId, action } = req.body;

    if (!userId || !chatId || !action) {
      return res.status(400).json({ error: 'userId, chatId, and action are required' });
    }

    const result = await messageIntelligenceService.trackMessageInteraction(userId, chatId, action);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/messages/search
 * Smart search in messages
 */
router.post('/search', async (req, res) => {
  try {
    const { query, messages, options } = req.body;

    if (!query || !messages) {
      return res.status(400).json({ error: 'query and messages are required' });
    }

    const result = await messageIntelligenceService.searchMessages(query, messages, options);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/messages/detect-intent
 * Detect message intent
 */
router.post('/detect-intent', async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const result = messageIntelligenceService.detectMessageIntent(content);

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/chats/:chatId/statistics
 * Get chat statistics
 */
router.get('/chats/:chatId/statistics', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { messages } = req.body;

    if (!messages) {
      return res.status(400).json({ error: 'messages are required' });
    }

    const result = await messageIntelligenceService.getChatStatistics(chatId, messages);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================================================
// REAL-TIME COLLABORATION ROUTES
// ============================================================================

/**
 * POST /api/chats/initialize-session
 * Initialize real-time chat session
 */
router.post('/chats/initialize-session', async (req, res) => {
  try {
    const { chatId, userId } = req.body;

    if (!chatId || !userId) {
      return res.status(400).json({ error: 'chatId and userId are required' });
    }

    const result = await realtimeCollaborationService.initializeChatSession(chatId, userId);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/chats/update-presence
 * Update user presence
 */
router.post('/chats/update-presence', async (req, res) => {
  try {
    const { chatId, userId, status } = req.body;

    if (!chatId || !userId || !status) {
      return res.status(400).json({ error: 'chatId, userId, and status are required' });
    }

    const result = await realtimeCollaborationService.updateUserPresence(chatId, userId, status);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/chats/:chatId/active-users
 * Get active users in chat
 */
router.get('/chats/:chatId/active-users', async (req, res) => {
  try {
    const { chatId } = req.params;

    const result = await realtimeCollaborationService.getActiveChatUsers(chatId);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/chats/typing-indicator
 * Broadcast typing indicator
 */
router.post('/chats/typing-indicator', async (req, res) => {
  try {
    const { chatId, userId, isTyping } = req.body;

    if (!chatId || !userId || typeof isTyping !== 'boolean') {
      return res.status(400).json({ error: 'chatId, userId, and isTyping are required' });
    }

    const result = await realtimeCollaborationService.broadcastTypingIndicator(chatId, userId, isTyping);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/chats/:chatId/typing-users
 * Get typing users
 */
router.get('/chats/:chatId/typing-users', async (req, res) => {
  try {
    const { chatId } = req.params;

    const result = await realtimeCollaborationService.getTypingUsers(chatId);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/chats/apply-edit
 * Apply message edit with operational transformation
 */
router.post('/chats/apply-edit', async (req, res) => {
  try {
    const { chatId, messageId, userId, operation } = req.body;

    if (!chatId || !messageId || !userId || !operation) {
      return res.status(400).json({ error: 'chatId, messageId, userId, and operation are required' });
    }

    const result = await realtimeCollaborationService.applyMessageEdit(
      chatId,
      messageId,
      userId,
      operation
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/chats/sync-state
 * Sync message state
 */
router.post('/chats/sync-state', async (req, res) => {
  try {
    const { chatId, messageId, state } = req.body;

    if (!chatId || !messageId || !state) {
      return res.status(400).json({ error: 'chatId, messageId, and state are required' });
    }

    const result = await realtimeCollaborationService.syncMessageState(chatId, messageId, state);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/chats/resolve-conflict
 * Resolve edit conflicts
 */
router.post('/chats/resolve-conflict', async (req, res) => {
  try {
    const { chatId, messageId, conflicts } = req.body;

    if (!chatId || !messageId || !conflicts) {
      return res.status(400).json({ error: 'chatId, messageId, and conflicts are required' });
    }

    const result = await realtimeCollaborationService.resolveEditConflict(chatId, messageId, conflicts);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/chats/update-cursor
 * Update cursor position
 */
router.post('/chats/update-cursor', async (req, res) => {
  try {
    const { chatId, userId, position } = req.body;

    if (!chatId || !userId || !position) {
      return res.status(400).json({ error: 'chatId, userId, and position are required' });
    }

    const result = await realtimeCollaborationService.updateCursorPosition(chatId, userId, position);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/chats/:chatId/cursors
 * Get cursor positions
 */
router.get('/chats/:chatId/cursors', async (req, res) => {
  try {
    const { chatId } = req.params;

    const result = await realtimeCollaborationService.getCursorPositions(chatId);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/chats/broadcast-event
 * Broadcast real-time event
 */
router.post('/chats/broadcast-event', async (req, res) => {
  try {
    const { chatId, event } = req.body;

    if (!chatId || !event) {
      return res.status(400).json({ error: 'chatId and event are required' });
    }

    const result = await realtimeCollaborationService.broadcastChatEvent(chatId, event);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/chats/:chatId/history
 * Get chat session history
 */
router.get('/chats/:chatId/history', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { limit = 100 } = req.query;

    const limitValue = parseInt(limit as string, 10);
    const validLimit = !isNaN(limitValue) && limitValue > 0 ? limitValue : 100;

    const result = await realtimeCollaborationService.getChatSessionHistory(
      chatId,
      validLimit
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/chats/read-receipts
 * Toggle read receipts
 */
router.post('/chats/read-receipts', async (req, res) => {
  try {
    const { chatId, userId, enabled } = req.body;

    if (!chatId || !userId || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'chatId, userId, and enabled are required' });
    }

    const result = await realtimeCollaborationService.toggleReadReceipts(chatId, userId, enabled);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/chats/mark-read
 * Mark message as read
 */
router.post('/chats/mark-read', async (req, res) => {
  try {
    const { chatId, messageId, userId } = req.body;

    if (!chatId || !messageId || !userId) {
      return res.status(400).json({ error: 'chatId, messageId, and userId are required' });
    }

    const result = await realtimeCollaborationService.markMessageAsRead(chatId, messageId, userId);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/chats/:chatId/messages/:messageId/read-status
 * Get message read status
 */
router.get('/chats/:chatId/messages/:messageId/read-status', async (req, res) => {
  try {
    const { chatId, messageId } = req.params;

    const result = await realtimeCollaborationService.getMessageReadStatus(chatId, messageId);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/chats/call-signaling
 * Handle voice/video call signaling
 */
router.post('/chats/call-signaling', async (req, res) => {
  try {
    const { chatId, userId, signal } = req.body;

    if (!chatId || !userId || !signal) {
      return res.status(400).json({ error: 'chatId, userId, and signal are required' });
    }

    const result = await realtimeCollaborationService.handleCallSignaling(chatId, userId, signal);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/chats/:chatId/analytics
 * Get chat analytics
 */
router.get('/chats/:chatId/analytics', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { period = 'day' } = req.query;

    const result = await realtimeCollaborationService.getChatAnalytics(
      chatId,
      period as 'day' | 'week' | 'month'
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/chats/close-session
 * Close chat session
 */
router.post('/chats/close-session', async (req, res) => {
  try {
    const { chatId, userId } = req.body;

    if (!chatId || !userId) {
      return res.status(400).json({ error: 'chatId and userId are required' });
    }

    const result = await realtimeCollaborationService.closeChatSession(chatId, userId);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;

// Made with Bob
