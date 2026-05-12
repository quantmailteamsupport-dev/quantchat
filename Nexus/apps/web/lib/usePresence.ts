"use client";

import { useCallback, useEffect, useState } from "react";
import type { Socket } from "socket.io-client";

export interface PresenceState {
  onlineUsers: Set<string>;
  subscribeToPresence: (userIds: string[]) => void;
  unsubscribeFromPresence: (userIds: string[]) => void;
}

/**
 * usePresence — tracks real-time online/offline state for a set of users.
 *
 * Wires to the existing signal socket. The server emits "presence-update"
 * events whenever a subscribed user connects or disconnects. Subscribe to
 * specific user IDs to start receiving their events.
 *
 * Gracefully degrades when the server doesn't emit these events yet.
 */
export function usePresence(socket: Socket | null): PresenceState {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!socket) return;

    const handlePresenceUpdate = ({
      userId,
      online,
    }: {
      userId: string;
      online: boolean;
    }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (online) {
          next.add(userId);
        } else {
          next.delete(userId);
        }
        return next;
      });
    };

    const handleBulkPresence = (users: Array<{ userId: string; online: boolean }>) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        for (const { userId, online } of users) {
          if (online) {
            next.add(userId);
          } else {
            next.delete(userId);
          }
        }
        return next;
      });
    };

    socket.on("presence-update", handlePresenceUpdate);
    socket.on("presence-snapshot", handleBulkPresence);

    return () => {
      socket.off("presence-update", handlePresenceUpdate);
      socket.off("presence-snapshot", handleBulkPresence);
    };
  }, [socket]);

  const subscribeToPresence = useCallback(
    (userIds: string[]) => {
      if (!socket || userIds.length === 0) return;
      socket.emit("subscribe-presence", { userIds });
    },
    [socket],
  );

  const unsubscribeFromPresence = useCallback(
    (userIds: string[]) => {
      if (!socket || userIds.length === 0) return;
      socket.emit("unsubscribe-presence", { userIds });
    },
    [socket],
  );

  return { onlineUsers, subscribeToPresence, unsubscribeFromPresence };
}

/**
 * formatPresenceLabel — returns "Online", "Last seen X ago", or "" for unknown.
 */
export function formatPresenceLabel(
  userId: string,
  onlineUsers: Set<string>,
  lastSeenAt?: number,
): string {
  if (onlineUsers.has(userId)) return "Online";
  if (!lastSeenAt) return "";
  const diff = Date.now() - lastSeenAt;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
