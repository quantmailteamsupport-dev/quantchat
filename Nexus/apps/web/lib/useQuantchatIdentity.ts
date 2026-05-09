"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import {
  persistQuantmailBridgeSession,
  readStoredQuantmailBridgeSession,
  resolveFallbackQuantchatUserId,
  resolveFallbackQuantmailToken,
} from "./quantmailBridge";
import { resolveSocketIdentity } from "./socketIdentity";

type SessionStatus = "authenticated" | "loading" | "unauthenticated";

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

export function useQuantchatIdentity() {
  const { data: session, status } = useSession();
  const [revision, setRevision] = useState(0);

  // BLOCKER-AUTH: Redirect to login if not authenticated in production
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isProduction = process.env.NODE_ENV === "production";
    const isUnauthenticated = status === "unauthenticated";

    if (isProduction && isUnauthenticated) {
      // Redirect to NextAuth login page
      window.location.href = "/api/auth/signin?callbackUrl=" + encodeURIComponent(window.location.href);
    }
  }, [status]);

  useEffect(() => {
    const syncIdentity = () => {
      setRevision((current) => current + 1);
    };

    window.addEventListener("storage", syncIdentity);
    window.addEventListener("focus", syncIdentity);
    window.addEventListener("quantchat:identity-changed", syncIdentity);

    return () => {
      window.removeEventListener("storage", syncIdentity);
      window.removeEventListener("focus", syncIdentity);
      window.removeEventListener("quantchat:identity-changed", syncIdentity);
    };
  }, []);

  const storedSession = useMemo(() => readStoredQuantmailBridgeSession(), [revision]);

  const sessionUserId = readString(session?.user?.id);
  const sessionAccessToken = readString(session?.accessToken);
  const sessionRefreshToken = readString(session?.refreshToken);
  const sessionEmail = readString(session?.user?.email);
  const sessionDisplayName = readString(session?.user?.name);

  useEffect(() => {
    if (!sessionUserId || !sessionAccessToken) {
      return;
    }

    persistQuantmailBridgeSession({
      userId: sessionUserId,
      accessToken: sessionAccessToken,
      refreshToken: sessionRefreshToken ?? undefined,
      email: sessionEmail ?? undefined,
      displayName: sessionDisplayName ?? undefined,
    });
  }, [
    sessionAccessToken,
    sessionDisplayName,
    sessionEmail,
    sessionRefreshToken,
    sessionUserId,
  ]);

  // BLOCKER-AUTH: Ensure we have a valid user ID
  const fallbackUserId = resolveFallbackQuantchatUserId();
  const requestedUserId = sessionUserId ?? storedSession?.userId ?? fallbackUserId ?? null;

  const authToken =
    sessionAccessToken ??
    storedSession?.accessToken ??
    (resolveFallbackQuantmailToken() || undefined);

  const identity = useMemo(
    () => {
      // If no user ID available, return a placeholder identity
      // (actual chat operations will fail until authentication is complete)
      if (!requestedUserId) {
        return { userId: null, isAuthenticated: false, token: null };
      }
      return resolveSocketIdentity(requestedUserId, authToken);
    },
    [authToken, requestedUserId],
  );

  return {
    ...identity,
    requestedUserId,
    authToken: identity.token || undefined,
    refreshToken: sessionRefreshToken ?? storedSession?.refreshToken,
    displayName: sessionDisplayName ?? storedSession?.displayName ?? null,
    email: sessionEmail ?? storedSession?.email ?? null,
    behavioralConfidence: storedSession?.behavioralConfidence ?? 1.0,
    sessionId: storedSession?.sessionId ?? null,
    authSource: sessionAccessToken
      ? "next-auth"
      : storedSession?.accessToken
        ? "local-storage"
        : "fallback",
    sessionStatus: status as SessionStatus,
  };
}
