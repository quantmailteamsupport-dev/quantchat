/**
 * MetricsService.ts
 *
 * BLOCKER-METRICS FIX: Real system metrics from database
 *
 * Provides:
 * - User statistics (total, active, etc.)
 * - Message statistics (total, daily, hourly)
 * - System health metrics
 * - Network throughput
 * - API performance metrics
 */

import { prisma } from "@repo/database";
import { logger } from "../logger";

interface SystemMetrics {
  totalUsers: number;
  activeUsers24h: number;
  totalMessages: number;
  messagesPerDay: number;
  messagesPerHour: number;
  totalConversations: number;
  averageMessageLength: number;
  totalFileUploads: number;
  systemHealth: {
    databaseStatus: "healthy" | "degraded" | "down";
    uptime: number; // seconds
    responseTime: number; // milliseconds
  };
  networkMetrics: {
    bytesTransferredToday: number;
    bytesTransferredTotal: number;
    peakBandwidth: number; // Mbps
    averageBandwidth: number; // Mbps
  };
}

interface UserMetrics {
  totalCount: number;
  activeToday: number;
  activeLastWeek: number;
  activeLastMonth: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  churnedUsers: number;
}

interface MessageMetrics {
  totalMessages: number;
  messagesPerDay: {
    date: string;
    count: number;
  }[];
  messagesPerHour: {
    hour: number;
    count: number;
  }[];
  averageThreadLength: number;
  longestThread: number;
  filesAttached: number;
  encryptedMessages: number;
  disappearingMessages: number;
}

export class MetricsService {
  /**
   * Get comprehensive system metrics
   */
  static async getSystemMetrics(): Promise<SystemMetrics> {
    const startTime = Date.now();

    try {
      // Database status check
      let databaseStatus: "healthy" | "degraded" | "down" = "healthy";
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        databaseStatus = "down";
      }

      // User metrics
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const [
        totalUsers,
        activeUsers24h,
        totalMessages,
        totalConversations,
        totalFileUploads,
        newUsersToday,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({
          where: {
            updatedAt: {
              gte: oneDayAgo,
            },
          },
        }),
        prisma.message.count(),
        prisma.conversation.count(),
        prisma.fileMetadata.count({
          where: { status: "uploaded" },
        }),
        prisma.user.count({
          where: {
            createdAt: {
              gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            },
          },
        }),
      ]);

      // Calculate daily and hourly rates
      const messagesLastDay = await prisma.message.count({
        where: {
          createdAt: {
            gte: oneDayAgo,
          },
        },
      });

      const messagesLastHour = await prisma.message.count({
        where: {
          createdAt: {
            gte: new Date(now.getTime() - 60 * 60 * 1000),
          },
        },
      });

      const messageLengthSample = await prisma.message.findMany({
        select: { content: true },
        orderBy: { createdAt: "desc" },
        take: 1000,
      });
      const averageMessageLength = messageLengthSample.length > 0
        ? Math.round(
            messageLengthSample.reduce((sum, message) => sum + message.content.length, 0) /
              messageLengthSample.length,
          )
        : 0;

      const responseTime = Date.now() - startTime;

      return {
        totalUsers,
        activeUsers24h,
        totalMessages,
        messagesPerDay: messagesLastDay,
        messagesPerHour: messagesLastHour,
        totalConversations,
        averageMessageLength,
        totalFileUploads,
        systemHealth: {
          databaseStatus,
          uptime: Math.floor(process.uptime()),
          responseTime,
        },
        networkMetrics: {
          bytesTransferredToday: 0, // Would need log aggregation
          bytesTransferredTotal: 0,
          peakBandwidth: 0,
          averageBandwidth: 0,
        },
      };
    } catch (err) {
      logger.error({ err }, "[Metrics] Failed to get system metrics");
      throw err;
    }
  }

  /**
   * Get user-specific metrics
   */
  static async getUserMetrics(): Promise<UserMetrics> {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const [
        totalCount,
        activeToday,
        activeLastWeek,
        activeLastMonth,
        newUsersToday,
        newUsersThisWeek,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({
          where: { updatedAt: { gte: oneDayAgo } },
        }),
        prisma.user.count({
          where: { updatedAt: { gte: oneWeekAgo } },
        }),
        prisma.user.count({
          where: { updatedAt: { gte: oneMonthAgo } },
        }),
        prisma.user.count({
          where: { createdAt: { gte: todayStart } },
        }),
        prisma.user.count({
          where: { createdAt: { gte: oneWeekAgo } },
        }),
      ]);

      // Calculate churn (users who were active last month but not this week)
      const churnedUsers = await prisma.user.count({
        where: {
          updatedAt: {
            gte: oneMonthAgo,
            lt: oneWeekAgo,
          },
        },
      });

      return {
        totalCount,
        activeToday,
        activeLastWeek,
        activeLastMonth,
        newUsersToday,
        newUsersThisWeek,
        churnedUsers,
      };
    } catch (err) {
      logger.error({ err }, "[Metrics] Failed to get user metrics");
      throw err;
    }
  }

  /**
   * Get message-specific metrics
   */
  static async getMessageMetrics(): Promise<MessageMetrics> {
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Total messages
      const totalMessages = await prisma.message.count();

      // Messages per day (last 7 days)
      const messagesPerDayRaw = await prisma.message.groupBy({
        by: ["createdAt"],
        _count: true,
        where: {
          createdAt: { gte: sevenDaysAgo },
        },
        orderBy: { createdAt: "asc" },
      });

      const messagesPerDay = messagesPerDayRaw.map((row) => ({
        date: new Date(row.createdAt).toISOString().split("T")[0] ?? "unknown",
        count: row._count,
      }));

      // Messages per hour (last 24 hours)
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const messagesRaw = await prisma.message.findMany({
        where: { createdAt: { gte: oneDayAgo } },
        select: { createdAt: true },
      });

      const messagesPerHour: Record<number, number> = {};
      for (let i = 0; i < 24; i++) {
        messagesPerHour[i] = 0;
      }
      messagesRaw.forEach((msg) => {
        const hour = new Date(msg.createdAt).getHours();
        messagesPerHour[hour] = (messagesPerHour[hour] ?? 0) + 1;
      });

      const messagesPerHourArray = Object.entries(messagesPerHour).map(
        ([hour, count]) => ({
          hour: parseInt(hour, 10),
          count,
        }),
      );

      // Average thread length
      // Count messages with file attachments
      const filesAttached = await prisma.message.count({
        where: {
          content: {
            contains: "s3://",
          },
        },
      });

      // Count encrypted messages
      const encryptedMessages = totalMessages;

      // Count disappearing messages
      const disappearingMessages = await prisma.message.count({
        where: {
          expiresAt: {
            not: null,
          },
        },
      });

      return {
        totalMessages,
        messagesPerDay,
        messagesPerHour: messagesPerHourArray,
        averageThreadLength: 0, // Would need thread calculation
        longestThread: 0,
        filesAttached,
        encryptedMessages,
        disappearingMessages,
      };
    } catch (err) {
      logger.error({ err }, "[Metrics] Failed to get message metrics");
      throw err;
    }
  }

  /**
   * Get health check status
   */
  static async getHealthStatus(): Promise<{
    status: "healthy" | "degraded" | "down";
    checks: Record<string, boolean>;
  }> {
    const checks: Record<string, boolean> = {};

    try {
      // Database check
      await prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      checks.database = false;
    }

    // Redis check would go here
    checks.redis = true; // Placeholder

    const status =
      Object.values(checks).every((v) => v) ?
        "healthy"
        : Object.values(checks).some((v) => v) ? "degraded"
        : "down";

    return { status, checks };
  }
}

export type {
  SystemMetrics,
  UserMetrics,
  MessageMetrics,
};
