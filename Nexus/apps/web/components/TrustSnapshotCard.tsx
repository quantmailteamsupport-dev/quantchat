"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuantchatIdentity } from "@/lib/useQuantchatIdentity";
import { useFrontendPreferences } from "@/lib/useFrontendPreferences";

type SessionStatus = "active" | "offline";
type RiskLevel = "low" | "medium" | "high";
type KeyState = "verified" | "stale" | "unverified";

interface CompanionSessionRecord {
  sessionId: string;
  userId: string;
  tokenId: string | null;
  deviceId: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  transport: "http" | "socket";
  socketId: string | null;
  status: SessionStatus;
  createdAt: string;
  lastSeenAt: string;
}

interface CompanionSessionResponse {
  currentSessionId: string | null;
  sessions: CompanionSessionRecord[];
}

interface TrustSnapshotCardProps {
  context: "compose" | "settings";
  draftText?: string;
  recipientName?: string;
}

const API_BASE = (process.env.NEXT_PUBLIC_WS_URL ?? "").replace(/\/$/, "");
const KEY_STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
const SENSITIVE_DRAFT_PATTERN =
  /\b(password|passcode|pin|otp|one[- ]time|bank|routing|ssn|tax|confidential|secret|private key|seed phrase|wallet|card|cvv)\b/i;

function getVerificationStorageKey(userId: string): string {
  return `quantchat:key-verification:${userId}`;
}

function readVerificationTimestamp(userId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(getVerificationStorageKey(userId));
}

function buildFallbackSessions(userId: string): CompanionSessionResponse {
  const now = new Date();
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60_000).toISOString();
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60_000).toISOString();
  const nowIso = now.toISOString();

  return {
    currentSessionId: "local-preview-web",
    sessions: [
      {
        sessionId: "local-preview-web",
        userId,
        tokenId: null,
        deviceId: "web-preview",
        userAgent:
          typeof window !== "undefined" ? window.navigator.userAgent : "Mozilla/5.0 (local-preview)",
        ipAddress: null,
        transport: "socket",
        socketId: "local-preview-socket",
        status: "active",
        createdAt: fifteenMinutesAgo,
        lastSeenAt: nowIso,
      },
      {
        sessionId: "local-preview-companion",
        userId,
        tokenId: null,
        deviceId: "phone-preview",
        userAgent: "QuantChat Companion/1.0 (Android)",
        ipAddress: null,
        transport: "http",
        socketId: null,
        status: "offline",
        createdAt: threeHoursAgo,
        lastSeenAt: threeHoursAgo,
      },
    ],
  };
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return "unknown";
  const parsed = Date.parse(isoDate);
  if (!Number.isFinite(parsed)) return "unknown";

  const diffMs = Date.now() - parsed;
  if (diffMs < 60_000) return "just now";
  if (diffMs < 60 * 60_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 24 * 60 * 60_000) return `${Math.floor(diffMs / (60 * 60_000))}h ago`;
  return `${Math.floor(diffMs / (24 * 60 * 60_000))}d ago`;
}

function resolveForwardRisk(
  privateForwardGuardEnabled: boolean,
  trustedMediaOnlyEnabled: boolean,
): { level: RiskLevel; label: string; summary: string } {
  if (privateForwardGuardEnabled && trustedMediaOnlyEnabled) {
    return {
      level: "low",
      label: "Low",
      summary: "Forward guard and trusted-media checks are both active.",
    };
  }

  if (privateForwardGuardEnabled || trustedMediaOnlyEnabled) {
    return {
      level: "medium",
      label: "Guarded",
      summary: "Only one sharing protection is active. Enable both for stronger safety.",
    };
  }

  return {
    level: "high",
    label: "High",
    summary: "Private-forward guard and trusted-media checks are disabled.",
  };
}

function resolveKeyStatus(verifiedAt: string | null): { state: KeyState; label: string; detail: string } {
  if (!verifiedAt) {
    return {
      state: "unverified",
      label: "Not verified",
      detail: "No recent key verification recorded for this account.",
    };
  }

  const parsed = Date.parse(verifiedAt);
  if (!Number.isFinite(parsed)) {
    return {
      state: "unverified",
      label: "Not verified",
      detail: "Key verification timestamp is invalid; verify on a trusted companion device.",
    };
  }

  const ageMs = Date.now() - parsed;
  if (ageMs > KEY_STALE_AFTER_MS) {
    return {
      state: "stale",
      label: "Verification stale",
      detail: `Last key check was ${formatRelativeTime(verifiedAt)}. Re-verify for sensitive shares.`,
    };
  }

  return {
    state: "verified",
    label: "Verified",
    detail: `Last key check ${formatRelativeTime(verifiedAt)}.`,
  };
}

function riskColor(level: RiskLevel): string {
  if (level === "low") return "#00d4a8";
  if (level === "medium") return "#ffd166";
  return "#ff9a86";
}

function keyColor(state: KeyState): string {
  if (state === "verified") return "#00d4a8";
  if (state === "stale") return "#ffd166";
  return "#ff9a86";
}

export function TrustSnapshotCard({
  context,
  draftText = "",
  recipientName,
}: TrustSnapshotCardProps) {
  const { preferences, setPreference } = useFrontendPreferences();
  const identity = useQuantchatIdentity();
  const [state, setState] = useState<CompanionSessionResponse | null>(null);
  const [usingFallbackData, setUsingFallbackData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const effectiveUserId = identity.userId || identity.requestedUserId || "local-preview";

  const loadSnapshot = useCallback(async () => {
    setLoading(true);

    try {
      const endpoint = `${API_BASE}/api/v1/auth/sessions?limit=25`;
      const headers: Record<string, string> = {};
      if (identity.token) {
        headers.authorization = `Bearer ${identity.token}`;
      }
      if (effectiveUserId) {
        headers["x-quantchat-device-id"] = `web:${effectiveUserId}`;
      }

      const response = await fetch(endpoint, {
        method: "GET",
        headers,
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`sessions endpoint returned ${response.status}`);
      }

      const payload = (await response.json()) as CompanionSessionResponse;
      setState(payload);
      setUsingFallbackData(false);
    } catch {
      setState(buildFallbackSessions(effectiveUserId));
      setUsingFallbackData(true);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, identity.token]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    const syncVerification = () => {
      setVerifiedAt(readVerificationTimestamp(effectiveUserId));
    };

    syncVerification();
    window.addEventListener("storage", syncVerification);
    window.addEventListener("focus", syncVerification);
    return () => {
      window.removeEventListener("storage", syncVerification);
      window.removeEventListener("focus", syncVerification);
    };
  }, [effectiveUserId]);

  const sessions = state?.sessions ?? [];
  const activeSessions = useMemo(
    () => sessions.filter((session) => session.status === "active").length,
    [sessions],
  );
  const offlineSessions = Math.max(sessions.length - activeSessions, 0);
  const companionSessions = Math.max(sessions.length - 1, 0);
  const latestCompanionSeenAt = useMemo(() => {
    const companion = sessions
      .filter((session) => session.sessionId !== state?.currentSessionId)
      .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))[0];
    return companion?.lastSeenAt ?? null;
  }, [sessions, state?.currentSessionId]);

  const forwardRisk = useMemo(
    () =>
      resolveForwardRisk(
        preferences.privateForwardGuardEnabled,
        preferences.trustedMediaOnlyEnabled,
      ),
    [preferences.privateForwardGuardEnabled, preferences.trustedMediaOnlyEnabled],
  );

  const keyStatus = useMemo(() => resolveKeyStatus(verifiedAt), [verifiedAt]);
  const containsSensitiveDraft = useMemo(
    () => SENSITIVE_DRAFT_PATTERN.test(draftText),
    [draftText],
  );

  const shouldRenderCard =
    context === "settings" ||
    containsSensitiveDraft ||
    keyStatus.state !== "verified" ||
    forwardRisk.level !== "low";

  if (!shouldRenderCard) return null;

  return (
    <section
      style={{
        borderRadius: 12,
        border: "1px solid rgba(0,168,132,0.34)",
        background: "linear-gradient(135deg, rgba(0,168,132,0.12) 0%, rgba(17,27,33,0.9) 72%)",
        padding: "10px 12px",
        margin: context === "compose" ? "0 10px 8px" : "0 0 12px",
      }}
      aria-label="Trust snapshot"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#d8fff5", letterSpacing: "0.03em" }}>
          Trust Snapshot
        </span>
        <span
          style={{
            borderRadius: 999,
            border: "1px solid rgba(83,189,235,0.65)",
            color: "#53bdeb",
            fontSize: 10,
            fontWeight: 700,
            padding: "1px 7px",
          }}
        >
          {"tokenUserId" in identity && identity.tokenUserId ? "Token-authenticated" : "Local identity"}
        </span>
        <span
          style={{
            borderRadius: 999,
            border: `1px solid ${(identity as any).behavioralConfidence < 0.6 ? "rgba(255,154,134,0.65)" : "rgba(0,168,132,0.65)"}`,
            color: (identity as any).behavioralConfidence < 0.6 ? "#ffb49e" : "#00d4a8",
            fontSize: 10,
            fontWeight: 700,
            padding: "1px 7px",
          }}
        >
          Confidence: {Math.round(((identity as any).behavioralConfidence || 1) * 100)}%
        </span>
        {usingFallbackData && (
          <span
            style={{
              borderRadius: 999,
              border: "1px solid rgba(255,154,134,0.6)",
              color: "#ffb49e",
              fontSize: 10,
              fontWeight: 700,
              padding: "1px 7px",
            }}
          >
            Preview session data
          </span>
        )}
      </div>

      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ fontSize: 11.5, color: "#d7e8ee", lineHeight: 1.35 }}>
          Companion devices:{" "}
          <strong>
            {loading ? "checking..." : `${activeSessions} active / ${offlineSessions} offline`}
          </strong>
          {companionSessions > 0 && (
            <span style={{ color: "#9cc2cf" }}> (last companion seen {formatRelativeTime(latestCompanionSeenAt)})</span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: "#d7e8ee", lineHeight: 1.35 }}>
          Recent key changes:{" "}
          <strong style={{ color: keyColor(keyStatus.state) }}>{keyStatus.label}</strong>
          <span style={{ color: "#9cc2cf" }}> - {keyStatus.detail}</span>
        </div>
        <div style={{ fontSize: 11.5, color: "#d7e8ee", lineHeight: 1.35 }}>
          Media-forward risk:{" "}
          <strong style={{ color: riskColor(forwardRisk.level) }}>{forwardRisk.label}</strong>
          <span style={{ color: "#9cc2cf" }}> - {forwardRisk.summary}</span>
        </div>
      </div>

      {context === "compose" && containsSensitiveDraft && (
        <div
          style={{
            marginTop: 8,
            borderRadius: 9,
            border: "1px solid rgba(255,161,122,0.5)",
            background: "rgba(255,161,122,0.14)",
            color: "#ffd9cc",
            fontSize: 11.5,
            lineHeight: 1.35,
            padding: "7px 9px",
          }}
        >
          Sensitive draft detected{recipientName ? ` for ${recipientName}` : ""}. Review trust and forwarding controls before send.
        </div>
      )}

      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={() =>
            setPreference("privateForwardGuardEnabled", !preferences.privateForwardGuardEnabled)
          }
          style={{
            borderRadius: 999,
            border: `1px solid ${preferences.privateForwardGuardEnabled ? "rgba(0,212,168,0.7)" : "rgba(255,255,255,0.22)"}`,
            background: preferences.privateForwardGuardEnabled ? "rgba(0,212,168,0.14)" : "rgba(255,255,255,0.04)",
            color: preferences.privateForwardGuardEnabled ? "#00d4a8" : "#e9edef",
            fontSize: 11,
            fontWeight: 700,
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          {preferences.privateForwardGuardEnabled ? "Forward guard on" : "Enable forward guard"}
        </button>
        <button
          type="button"
          onClick={() => setPreference("trustedMediaOnlyEnabled", !preferences.trustedMediaOnlyEnabled)}
          style={{
            borderRadius: 999,
            border: `1px solid ${preferences.trustedMediaOnlyEnabled ? "rgba(0,212,168,0.7)" : "rgba(255,255,255,0.22)"}`,
            background: preferences.trustedMediaOnlyEnabled ? "rgba(0,212,168,0.14)" : "rgba(255,255,255,0.04)",
            color: preferences.trustedMediaOnlyEnabled ? "#00d4a8" : "#e9edef",
            fontSize: 11,
            fontWeight: 700,
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          {preferences.trustedMediaOnlyEnabled ? "Trusted media on" : "Enable trusted media"}
        </button>
        <Link
          href="/settings/devices"
          style={{
            fontSize: 11,
            color: "#8fd8ff",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Review devices
        </Link>
      </div>
    </section>
  );
}
