"use client";

import { useCallback, useEffect, useState } from "react";

export type NotifType = "message" | "call_missed" | "security" | "system" | "mention";

export interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
  avatarLetter?: string;
  avatarColor?: string;
  href?: string;
}

function apiBase(): string {
  if (typeof process !== "undefined") {
    return (
      process.env.NEXT_PUBLIC_QUANTCHAT_API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      ""
    );
  }
  return "";
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase()}/api/notifications`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json() as { items: Notification[]; unread: number };
      setNotifications(body.items ?? []);
      setUnread(body.unread ?? 0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const markAllRead = useCallback(async () => {
    setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
    setUnread(0);
    void fetch(`${apiBase()}/api/notifications/read-all`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((ns) =>
      ns.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    setUnread((u) => Math.max(0, u - 1));
    void fetch(`${apiBase()}/api/notifications/${encodeURIComponent(id)}/read`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, []);

  return { notifications, unread, loading, error, markAllRead, markRead, reload: load };
}
