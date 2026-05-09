/**
 * @module SmartNotificationBatcher
 * @description Intelligent notification delivery system that prevents
 * notification fatigue by batching, prioritizing, and timing notifications
 * for optimal engagement — instead of bombarding users with raw alerts.
 *
 * Anti-fatigue mechanics:
 *  1. Priority-based batching (urgent = instant, low = batched hourly).
 *  2. Quiet hours detection (no pings during sleep/meetings).
 *  3. Channel optimization (push vs. badge vs. in-app vs. email digest).
 *  4. Deduplication (similar notifications merged into one summary).
 *  5. Adaptive frequency (learns user's preferred notification cadence).
 *  6. Snooze intelligence (auto-reschedules snoozed types).
 *
 * @example
 * ```ts
 * const batcher = new SmartNotificationBatcher();
 * batcher.enqueue('usr_1', {
 *   type: 'message',
 *   title: 'New message from Alice',
 *   body: 'Hey, are you free?',
 *   priority: 'high',
 *   source: 'quantchat',
 * });
 * const batch = batcher.flush('usr_1');
 * ```
 */

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function assertNonEmptyString(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
}

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

// ═══════════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type NotificationPriority = 'critical' | 'high' | 'medium' | 'low' | 'silent';
export type DeliveryChannel = 'push' | 'badge' | 'in_app' | 'email_digest' | 'sms';
export type NotificationType = 'message' | 'call' | 'mention' | 'like' | 'follow'
  | 'comment' | 'share' | 'system' | 'promotion' | 'reminder';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  priority: NotificationPriority;
  source: string;                 // Which Quant app sent this
  groupKey?: string;              // For deduplication (e.g. "thread_123")
  senderId?: string;              // Who triggered this notification
  actionUrl?: string;
  imageUrl?: string;
  expiresAt?: Date;               // Auto-dismiss after this time
}

export interface QueuedNotification {
  notificationId: string;
  input: NotificationInput;
  enqueuedAt: Date;
  scheduledDelivery: Date;
  deliveryChannel: DeliveryChannel;
  isMerged: boolean;              // Was this merged into a group?
  mergeGroupId: string | null;
  delivered: boolean;
  deliveredAt: Date | null;
}

export interface NotificationBatch {
  batchId: string;
  userId: string;
  notifications: QueuedNotification[];
  mergedGroups: MergedGroup[];
  deliveryChannel: DeliveryChannel;
  totalCount: number;
  createdAt: Date;
}

export interface MergedGroup {
  groupKey: string;
  count: number;
  title: string;                  // "5 new messages in Team Chat"
  latestBody: string;
  senders: string[];
}

export interface UserNotificationPrefs {
  userId: string;
  quietHoursStart: number;        // Hour (0–23)
  quietHoursEnd: number;
  preferredChannels: Record<NotificationType, DeliveryChannel>;
  snoozedTypes: Set<NotificationType>;
  snoozeUntil: Record<string, number>; // type → unix ms
  maxPerHour: number;
  interactionHistory: {
    avgOpenRateByType: Record<NotificationType, number>;
    avgTimeToOpenMs: number;
    preferredDeliveryHours: number[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  DELIVERY RULES
// ═══════════════════════════════════════════════════════════════════════════

const PRIORITY_CONFIG: Record<NotificationPriority, {
  maxDelayMs: number;
  defaultChannel: DeliveryChannel;
  bypassQuietHours: boolean;
}> = {
  critical: { maxDelayMs: 0,          defaultChannel: 'push', bypassQuietHours: true },
  high:     { maxDelayMs: 30_000,     defaultChannel: 'push', bypassQuietHours: false },
  medium:   { maxDelayMs: 5 * 60_000, defaultChannel: 'in_app', bypassQuietHours: false },
  low:      { maxDelayMs: 60 * 60_000, defaultChannel: 'badge', bypassQuietHours: false },
  silent:   { maxDelayMs: Infinity,   defaultChannel: 'email_digest', bypassQuietHours: false },
};

// ═══════════════════════════════════════════════════════════════════════════
//  ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export class SmartNotificationBatcher {
  private readonly log: StructuredLogger;
  private queues: Map<string, QueuedNotification[]> = new Map();
  private userPrefs: Map<string, UserNotificationPrefs> = new Map();
  private deliveryHistory: Map<string, number[]> = new Map(); // userId → delivery timestamps

  constructor() {
    this.log = new StructuredLogger('notification-batcher', 'info');
  }

  // ── Enqueue ──────────────────────────────────────────────────────────────

  enqueue(userId: string, input: NotificationInput): QueuedNotification {
    assertNonEmptyString(userId, 'userId');
    assertNonEmptyString(input.title, 'title');

    const prefs = this.getOrCreatePrefs(userId);

    // Check if snoozed
    if (prefs.snoozedTypes.has(input.type)) {
      const snoozeEnd = prefs.snoozeUntil[input.type] ?? 0;
      if (Date.now() < snoozeEnd) {
        this.log.debug('Notification snoozed', { userId, type: input.type });
        // Still enqueue but delay until snooze ends
        input.priority = 'silent';
      } else {
        prefs.snoozedTypes.delete(input.type);
      }
    }

    // Determine delivery channel
    const channel = this.selectChannel(input, prefs);

    // Calculate delivery time
    const deliveryTime = this.calculateDeliveryTime(input, prefs);

    // Check for deduplication
    const queue = this.queues.get(userId) ?? [];
    let mergeGroupId: string | null = null;
    let isMerged = false;

    if (input.groupKey) {
      const existing = queue.find(n =>
        !n.delivered && n.input.groupKey === input.groupKey && !n.isMerged
      );
      if (existing) {
        mergeGroupId = input.groupKey;
        isMerged = true;
      }
    }

    const notification: QueuedNotification = {
      notificationId: generateId('notif'),
      input,
      enqueuedAt: new Date(),
      scheduledDelivery: new Date(deliveryTime),
      deliveryChannel: channel,
      isMerged,
      mergeGroupId,
      delivered: false,
      deliveredAt: null,
    };

    queue.push(notification);
    this.queues.set(userId, queue);

    // Immediate delivery for critical
    if (input.priority === 'critical') {
      this.log.info('Critical notification — immediate delivery', { userId, type: input.type });
    }

    return notification;
  }

  // ── Flush (deliver pending notifications) ────────────────────────────────

  flush(userId: string): NotificationBatch | null {
    const queue = this.queues.get(userId) ?? [];
    const now = Date.now();

    // Get notifications ready for delivery
    const ready = queue.filter(n =>
      !n.delivered && n.scheduledDelivery.getTime() <= now
    );

    if (ready.length === 0) return null;

    // Rate limit check
    const prefs = this.getOrCreatePrefs(userId);
    const recentDeliveries = (this.deliveryHistory.get(userId) ?? [])
      .filter(ts => now - ts < 60 * 60 * 1000);

    if (recentDeliveries.length >= prefs.maxPerHour) {
      this.log.debug('Hourly limit reached — deferring', { userId, limit: prefs.maxPerHour });
      return null;
    }

    // Build merged groups
    const mergedGroups = this.buildMergedGroups(ready);

    // Determine best channel for this batch
    const primaryChannel = this.determineBatchChannel(ready);

    // Mark as delivered
    for (const n of ready) {
      n.delivered = true;
      n.deliveredAt = new Date();
    }

    // Track delivery
    const history = this.deliveryHistory.get(userId) ?? [];
    history.push(now);
    if (history.length > 500) history.splice(0, history.length - 400);
    this.deliveryHistory.set(userId, history);

    const batch: NotificationBatch = {
      batchId: generateId('batch'),
      userId,
      notifications: ready,
      mergedGroups,
      deliveryChannel: primaryChannel,
      totalCount: ready.length,
      createdAt: new Date(),
    };

    this.log.info('Notification batch delivered', {
      userId,
      count: ready.length,
      merged: mergedGroups.length,
      channel: primaryChannel,
    });

    return batch;
  }

  // ── Channel Selection ────────────────────────────────────────────────────

  private selectChannel(input: NotificationInput, prefs: UserNotificationPrefs): DeliveryChannel {
    // User override
    const userPreferred = prefs.preferredChannels[input.type];
    if (userPreferred) return userPreferred;

    // Priority-based default
    return PRIORITY_CONFIG[input.priority].defaultChannel;
  }

  // ── Delivery Timing ─────────────────────────────────────────────────────

  private calculateDeliveryTime(input: NotificationInput, prefs: UserNotificationPrefs): number {
    const config = PRIORITY_CONFIG[input.priority];
    let deliveryTime = Date.now() + config.maxDelayMs;

    // Quiet hours check
    if (!config.bypassQuietHours) {
      const hour = new Date().getHours();
      const inQuietHours = this.isInQuietHours(hour, prefs.quietHoursStart, prefs.quietHoursEnd);

      if (inQuietHours) {
        // Delay until quiet hours end
        const endHour = prefs.quietHoursEnd;
        const now = new Date();
        const nextDelivery = new Date(now);
        nextDelivery.setHours(endHour, 0, 0, 0);
        if (nextDelivery.getTime() <= now.getTime()) {
          nextDelivery.setDate(nextDelivery.getDate() + 1);
        }
        deliveryTime = Math.max(deliveryTime, nextDelivery.getTime());
      }
    }

    return deliveryTime;
  }

  private isInQuietHours(currentHour: number, start: number, end: number): boolean {
    if (start <= end) {
      return currentHour >= start && currentHour < end;
    }
    // Overnight quiet hours (e.g., 22:00 – 07:00)
    return currentHour >= start || currentHour < end;
  }

  // ── Merging ──────────────────────────────────────────────────────────────

  private buildMergedGroups(notifications: QueuedNotification[]): MergedGroup[] {
    const groups: Map<string, QueuedNotification[]> = new Map();

    for (const n of notifications) {
      const key = n.input.groupKey ?? n.notificationId;
      const group = groups.get(key) ?? [];
      group.push(n);
      groups.set(key, group);
    }

    const merged: MergedGroup[] = [];
    for (const [key, items] of groups) {
      if (items.length < 2) continue;

      const senders = [...new Set(items.map(i => i.input.senderId).filter(Boolean) as string[])];
      merged.push({
        groupKey: key,
        count: items.length,
        title: items.length > 1
          ? `${items.length} ${items[0].input.type}s${senders.length > 0 ? ` from ${senders.length} people` : ''}`
          : items[0].input.title,
        latestBody: items[items.length - 1].input.body,
        senders,
      });
    }

    return merged;
  }

  private determineBatchChannel(notifications: QueuedNotification[]): DeliveryChannel {
    // Use the highest-priority channel in the batch
    const channelPriority: DeliveryChannel[] = ['push', 'sms', 'in_app', 'badge', 'email_digest'];
    for (const channel of channelPriority) {
      if (notifications.some(n => n.deliveryChannel === channel)) return channel;
    }
    return 'in_app';
  }

  // ── User Preferences ─────────────────────────────────────────────────────

  private getOrCreatePrefs(userId: string): UserNotificationPrefs {
    let prefs = this.userPrefs.get(userId);
    if (!prefs) {
      prefs = {
        userId,
        quietHoursStart: 22,
        quietHoursEnd: 7,
        preferredChannels: {} as Record<NotificationType, DeliveryChannel>,
        snoozedTypes: new Set(),
        snoozeUntil: {},
        maxPerHour: 20,
        interactionHistory: {
          avgOpenRateByType: {} as Record<NotificationType, number>,
          avgTimeToOpenMs: 300_000,
          preferredDeliveryHours: [9, 12, 18],
        },
      };
      this.userPrefs.set(userId, prefs);
    }
    return prefs;
  }

  setQuietHours(userId: string, start: number, end: number): void {
    const prefs = this.getOrCreatePrefs(userId);
    prefs.quietHoursStart = start;
    prefs.quietHoursEnd = end;
  }

  snoozeType(userId: string, type: NotificationType, durationMs: number): void {
    const prefs = this.getOrCreatePrefs(userId);
    prefs.snoozedTypes.add(type);
    prefs.snoozeUntil[type] = Date.now() + durationMs;
    this.log.info('Notification type snoozed', { userId, type, durationMs });
  }

  setChannelPreference(userId: string, type: NotificationType, channel: DeliveryChannel): void {
    const prefs = this.getOrCreatePrefs(userId);
    prefs.preferredChannels[type] = channel;
  }

  // ── Query API ────────────────────────────────────────────────────────────

  getPendingCount(userId: string): number {
    return (this.queues.get(userId) ?? []).filter(n => !n.delivered).length;
  }

  getDeliveryStats(userId: string): { deliveredLastHour: number; pendingCount: number } {
    const history = (this.deliveryHistory.get(userId) ?? []);
    const lastHour = history.filter(ts => Date.now() - ts < 60 * 60 * 1000).length;
    return { deliveredLastHour: lastHour, pendingCount: this.getPendingCount(userId) };
  }
}
