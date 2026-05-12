/**
 * metricsClient.ts
 *
 * Client for fetching real metrics from API gateway
 * Used by admin dashboard to display live system metrics
 */

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
    uptime: number;
    responseTime: number;
  };
  networkMetrics: {
    bytesTransferredToday: number;
    bytesTransferredTotal: number;
    peakBandwidth: number;
    averageBandwidth: number;
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
  messagesPerDay: Array<{ date: string; count: number }>;
  messagesPerHour: Array<{ hour: number; count: number }>;
  averageThreadLength: number;
  longestThread: number;
  filesAttached: number;
  encryptedMessages: number;
  disappearingMessages: number;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

class MetricsClient {
  /**
   * Fetch system metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      const response = await fetch(`${API_BASE}/api/v1/metrics/system`, {
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return (await response.json()) as SystemMetrics;
    } catch (err) {
      console.error("[MetricsClient] Failed to fetch system metrics:", err);
      // Return default/empty metrics on error
      return {
        totalUsers: 0,
        activeUsers24h: 0,
        totalMessages: 0,
        messagesPerDay: 0,
        messagesPerHour: 0,
        totalConversations: 0,
        averageMessageLength: 0,
        totalFileUploads: 0,
        systemHealth: {
          databaseStatus: "down",
          uptime: 0,
          responseTime: 0,
        },
        networkMetrics: {
          bytesTransferredToday: 0,
          bytesTransferredTotal: 0,
          peakBandwidth: 0,
          averageBandwidth: 0,
        },
      };
    }
  }

  /**
   * Fetch user metrics
   */
  async getUserMetrics(): Promise<UserMetrics> {
    try {
      const response = await fetch(`${API_BASE}/api/v1/metrics/users`, {
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return (await response.json()) as UserMetrics;
    } catch (err) {
      console.error("[MetricsClient] Failed to fetch user metrics:", err);
      return {
        totalCount: 0,
        activeToday: 0,
        activeLastWeek: 0,
        activeLastMonth: 0,
        newUsersToday: 0,
        newUsersThisWeek: 0,
        churnedUsers: 0,
      };
    }
  }

  /**
   * Fetch message metrics
   */
  async getMessageMetrics(): Promise<MessageMetrics> {
    try {
      const response = await fetch(`${API_BASE}/api/v1/metrics/messages`, {
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return (await response.json()) as MessageMetrics;
    } catch (err) {
      console.error("[MetricsClient] Failed to fetch message metrics:", err);
      return {
        totalMessages: 0,
        messagesPerDay: [],
        messagesPerHour: [],
        averageThreadLength: 0,
        longestThread: 0,
        filesAttached: 0,
        encryptedMessages: 0,
        disappearingMessages: 0,
      };
    }
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  /**
   * Format large numbers with commas
   */
  formatNumber(num: number): string {
    return num.toLocaleString();
  }

  /**
   * Format uptime to human readable
   */
  formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }
}

export const metricsClient = new MetricsClient();
export type { SystemMetrics, UserMetrics, MessageMetrics };
