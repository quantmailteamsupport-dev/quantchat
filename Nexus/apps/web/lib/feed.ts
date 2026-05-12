"use client";

import { useCallback, useEffect, useState } from "react";

export type FeedItemType = "snap" | "reel" | "story";

export interface FeedItem {
  id: string;
  type: FeedItemType;
  username: string;
  handle: string;
  caption: string;
  song?: string;
  likes: number;
  comments: number;
  shares: number;
  avatarColor: string;
  avatarLetter: string;
  bg: string;
  neonAccent: string;
  following: boolean;
  isNew?: boolean;
  snapExpiry?: number;
  liked: boolean;
  createdAt: number;
}

export interface Reel {
  id: string;
  username: string;
  handle: string;
  caption: string;
  song: string;
  likes: number;
  comments: number;
  shares: number;
  sends: number;
  saves: number;
  avatarColor: string;
  avatarLetter: string;
  bg: string;
  neonAccent: string;
  following: boolean;
  liked: boolean;
  createdAt: number;
}

type FetchState<T> = {
  data: T[];
  loading: boolean;
  error: string | null;
};

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

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function useFeed() {
  const [state, setState] = useState<FetchState<FeedItem>>({
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/feed`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await safeJson(res)) as { items?: FeedItem[] } | null;
        if (cancelled) return;
        setState({ data: body?.items ?? [], loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          data: [],
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load feed",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleLike = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      data: s.data.map((item) =>
        item.id === id
          ? {
              ...item,
              liked: !item.liked,
              likes: item.liked ? Math.max(0, item.likes - 1) : item.likes + 1,
            }
          : item,
      ),
    }));
    void fetch(`${apiBase()}/api/feed/${encodeURIComponent(id)}/like`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {
      // Best-effort: optimistic update stays. A real reconciler would re-fetch.
    });
  }, []);

  return { ...state, toggleLike };
}

export function useReels() {
  const [state, setState] = useState<FetchState<Reel>>({
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/reels`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await safeJson(res)) as { items?: Reel[] } | null;
        if (cancelled) return;
        setState({ data: body?.items ?? [], loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          data: [],
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load reels",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleLike = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      data: s.data.map((item) =>
        item.id === id
          ? {
              ...item,
              liked: !item.liked,
              likes: item.liked ? Math.max(0, item.likes - 1) : item.likes + 1,
            }
          : item,
      ),
    }));
    void fetch(`${apiBase()}/api/reels/${encodeURIComponent(id)}/like`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, []);

  return { ...state, toggleLike };
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toString();
}
