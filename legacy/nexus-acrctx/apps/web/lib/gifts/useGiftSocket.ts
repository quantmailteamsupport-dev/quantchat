"use client";

// ═══════════════════════════════════════════════════════════════
// useGiftSocket
// ═══════════════════════════════════════════════════════════════
//
// Thin client-side hook around the socket.io gift events. Keeps the
// local token balance, catalog and live-gift overlay queue in sync.
//
// This hook is deliberately UI-framework-agnostic in shape (returns a
// plain state object + callbacks) so it can be used inside the chat,
// call and profile views without re-implementing socket wiring.
// ═══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { resolveSocketIdentity } from "../socketIdentity";

const API_URL =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_WS_URL) ||
  "http://localhost:4000";

export interface GiftCatalogEntry {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  costTokens: number;
  rendererKind: "rose" | "heart" | "bolt" | "crown" | string;
  modelUrl: string | null;
  palette: string[];
  isActive: boolean;
}

export interface IncomingGift {
  transactionId: string;
  fromUserId: string;
  giftSlug: string;
  displayName: string;
  rendererKind: string;
  palette: string[];
  costTokens: number;
  note: string | null;
  callId: string | null;
  conversationId: string | null;
  createdAt: string | Date;
}

export interface GiftBalance {
  balance: number;
  earnedLifetime: number;
  spentLifetime: number;
  earnedToday: number;
  dailyEarnCap: number;
  earnFromCallsEnabled: boolean;
}

export type GiftErrorCode =
  | "invalid_payload"
  | "self_gift"
  | "gift_not_found"
  | "recipient_refuses_gifts"
  | "rate_limited"
  | "insufficient_balance"
  | "invalid_amount"
  | "internal";

export interface GiftErrorEvent {
  code: GiftErrorCode;
  scope?: "recipient" | "global";
  required?: number;
  available?: number;
}

export interface UseGiftSocketOptions {
  userId: string;
  authToken: string;
  /** Fires when a gift should be rendered on the viewport */
  onIncomingGift?: (gift: IncomingGift) => void;
  /** Fires on error payloads from the server */
  onError?: (err: GiftErrorEvent) => void;
}

export interface SendGiftArgs {
  recipientId: string;
  giftSlug: string;
  note?: string;
  callId?: string;
  conversationId?: string;
}

export interface UseGiftSocketResult {
  connected: boolean;
  catalog: GiftCatalogEntry[];
  balance: GiftBalance | null;
  recentIncoming: IncomingGift[];
  sendGift: (args: SendGiftArgs) => Promise<void>;
  recordCallMinute: (callId: string) => void;
  refreshBalance: () => Promise<void>;
  refreshCatalog: () => Promise<void>;
}

async function fetchJson<T>(
  path: string,
  authToken: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${authToken}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const MAX_RECENT_INCOMING = 20;

export function useGiftSocket(opts: UseGiftSocketOptions): UseGiftSocketResult {
  const { userId, authToken, onIncomingGift, onError } = opts;
  const identity = resolveSocketIdentity(userId, authToken);
  const effectiveUserId = identity.userId;
  const resolvedAuthToken = identity.token;
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [catalog, setCatalog] = useState<GiftCatalogEntry[]>([]);
  const [balance, setBalance] = useState<GiftBalance | null>(null);
  const [recentIncoming, setRecentIncoming] = useState<IncomingGift[]>([]);

  // Stable callback refs so effect deps stay minimal
  const onIncomingGiftRef = useRef(onIncomingGift);
  const onErrorRef = useRef(onError);
  useEffect(() => { onIncomingGiftRef.current = onIncomingGift; }, [onIncomingGift]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const refreshBalance = useCallback(async () => {
    try {
      const snap = await fetchJson<GiftBalance>("/api/gifts/balance", resolvedAuthToken);
      setBalance(snap);
    } catch {
      /* network errors are surfaced via the error callback elsewhere */
    }
  }, [resolvedAuthToken]);

  const refreshCatalog = useCallback(async () => {
    try {
      const data = await fetchJson<{ gifts: GiftCatalogEntry[] }>("/api/gifts/catalog", resolvedAuthToken);
      setCatalog(data.gifts);
    } catch { /* ignore */ }
  }, [resolvedAuthToken]);

  useEffect(() => {
    if (!effectiveUserId) return;
    const s: Socket = io(API_URL, {
      transports: ["websocket"],
      auth: resolvedAuthToken ? { token: resolvedAuthToken } : undefined,
    });
    socketRef.current = s;

    s.on("connect", () => {
      setConnected(false);
      s.off("authenticated");
      s.once("authenticated", () => setConnected(true));
      s.emit("auth", {
        userId: effectiveUserId,
        token: resolvedAuthToken || undefined,
      });
    });
    s.on("disconnect", () => setConnected(false));

    s.on("gift-received", (evt: IncomingGift) => {
      setRecentIncoming((prev) => {
        const next = [evt, ...prev];
        return next.slice(0, MAX_RECENT_INCOMING);
      });
      onIncomingGiftRef.current?.(evt);
    });

    s.on("gift-sent", (evt: { newBalance: number }) => {
      setBalance((prev) => (prev ? { ...prev, balance: evt.newBalance } : prev));
    });

    s.on("call-minute-recorded", (evt: { dailyTotal: number; dailyCap: number }) => {
      setBalance((prev) =>
        prev ? { ...prev, earnedToday: evt.dailyTotal, dailyEarnCap: evt.dailyCap } : prev,
      );
    });

    s.on("gift-error", (err: GiftErrorEvent) => {
      onErrorRef.current?.(err);
    });

    return () => {
      s.removeAllListeners();
      s.disconnect();
      socketRef.current = null;
    };
  }, [effectiveUserId, resolvedAuthToken]);

  // Initial load
  useEffect(() => {
    if (!resolvedAuthToken) return;
    void refreshBalance();
    void refreshCatalog();
  }, [resolvedAuthToken, refreshBalance, refreshCatalog]);

  const sendGift = useCallback(
    async (args: SendGiftArgs) => {
      const s = socketRef.current;
      if (!s || !s.connected) throw new Error("Gift socket not connected");
      s.emit("send-gift", args);
    },
    [],
  );

  const recordCallMinute = useCallback((callId: string) => {
    const s = socketRef.current;
    if (!s || !s.connected) return;
    s.emit("record-call-minute", { callId });
  }, []);

  return useMemo(
    () => ({
      connected,
      catalog,
      balance,
      recentIncoming,
      sendGift,
      recordCallMinute,
      refreshBalance,
      refreshCatalog,
    }),
    [connected, catalog, balance, recentIncoming, sendGift, recordCallMinute, refreshBalance, refreshCatalog],
  );
}

export default useGiftSocket;
