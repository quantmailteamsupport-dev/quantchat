"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SettingsScaffold,
  SettingsSection,
  ToggleRow,
  subtleDividerStyle,
} from "@/components/settings/SettingsScaffold";
import { useQuantchatIdentity } from "@/lib/useQuantchatIdentity";
import { useFrontendPreferences } from "@/lib/useFrontendPreferences";

type SessionStatus = "active" | "offline";

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

const API_BASE = (process.env.NEXT_PUBLIC_WS_URL ?? "").replace(/\/$/, "");

function getDeviceKindLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const normalized = userAgent.toLowerCase();
  if (normalized.includes("iphone") || normalized.includes("android")) return "Mobile";
  if (normalized.includes("ipad") || normalized.includes("tablet")) return "Tablet";
  if (normalized.includes("windows") || normalized.includes("mac") || normalized.includes("linux")) {
    return "Desktop";
  }
  return "Browser";
}

function formatSeenLabel(isoDate: string): string {
  const parsed = Date.parse(isoDate);
  if (!Number.isFinite(parsed)) return "unknown";
  const diffMs = Date.now() - parsed;

  if (diffMs < 60_000) return "just now";
  if (diffMs < 60 * 60_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 24 * 60 * 60_000) return `${Math.floor(diffMs / (60 * 60_000))}h ago`;
  return `${Math.floor(diffMs / (24 * 60 * 60_000))}d ago`;
}

function buildFallbackSessions(userId: string): CompanionSessionResponse {
  const now = new Date();
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60_000).toISOString();
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60_000).toISOString();
  const nowIso = now.toISOString();

  const localSession: CompanionSessionRecord = {
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
  };

  const companionSession: CompanionSessionRecord = {
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
  };

  return {
    currentSessionId: localSession.sessionId,
    sessions: [localSession, companionSession],
  };
}

export default function LinkedDevicesPage() {
  const { preferences, setPreference } = useFrontendPreferences();
  const identity = useQuantchatIdentity();
  const [state, setState] = useState<CompanionSessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [usingFallbackData, setUsingFallbackData] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const effectiveUserId = identity.userId || identity.requestedUserId || "local-preview";

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setErrorText("");

    try {
      const endpointBase = API_BASE || "";
      const endpoint = `${endpointBase}/api/v1/auth/sessions?limit=25`;
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
      setErrorText("Live companion sessions unavailable in this environment; showing local preview data.");
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, identity.token]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleRevoke = useCallback(
    async (sessionId: string) => {
      const existing = state;
      if (!existing) return;

      setRevokingSessionId(sessionId);
      setErrorText("");

      try {
        if (!usingFallbackData) {
          const endpointBase = API_BASE || "";
          const endpoint = `${endpointBase}/api/v1/auth/sessions/${encodeURIComponent(sessionId)}`;
          const headers: Record<string, string> = {};
          if (identity.token) {
            headers.authorization = `Bearer ${identity.token}`;
          }

          const response = await fetch(endpoint, {
            method: "DELETE",
            headers,
          });

          if (!response.ok) {
            throw new Error(`revoke endpoint returned ${response.status}`);
          }
        }

        setState({
          ...existing,
          sessions: existing.sessions.filter((session) => session.sessionId !== sessionId),
        });
      } catch {
        setErrorText("Failed to revoke that session. Retry after confirming gateway auth.");
      } finally {
        setRevokingSessionId(null);
      }
    },
    [identity.token, state, usingFallbackData],
  );

  const sessions = state?.sessions ?? [];

  return (
    <SettingsScaffold
      title="Linked devices"
      subtitle="Review active companion sessions and revoke stale access."
    >
      <SettingsSection
        title="Link policy"
        description="Keep alerts enabled so new companion links stay visible across web and mobile."
      >
        <ToggleRow
          label="Companion device alerts"
          description="Notify when new sessions appear or old sessions reconnect."
          checked={preferences.companionDeviceAlertsEnabled}
          onToggle={() =>
            setPreference("companionDeviceAlertsEnabled", !preferences.companionDeviceAlertsEnabled)
          }
        />

        <button
          type="button"
          onClick={() => void loadSessions()}
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "8px 12px",
            background: "rgba(255,255,255,0.02)",
            color: "#e9edef",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            width: "fit-content",
          }}
        >
          Refresh sessions
        </button>
      </SettingsSection>

      <SettingsSection
        title="Active sessions"
        description="Session history is ordered by last seen time to simplify revoke decisions."
      >
        {loading && (
          <div style={{ color: "#8fa2ad", fontSize: 12 }}>Loading linked-device sessions...</div>
        )}

        {!loading && sessions.length === 0 && (
          <div style={{ color: "#8fa2ad", fontSize: 12 }}>No companion sessions found yet.</div>
        )}

        {!loading &&
          sessions.map((session) => {
            const isCurrent = state?.currentSessionId === session.sessionId;
            const canRevoke = !isCurrent;
            const badgeText = isCurrent ? "CURRENT" : session.status.toUpperCase();
            const badgeColor = isCurrent ? "#00a884" : session.status === "active" ? "#53bdeb" : "#8fa2ad";

            return (
              <article
                key={session.sessionId}
                style={{
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                      {getDeviceKindLabel(session.userAgent)} - {session.transport.toUpperCase()}
                    </div>
                    <div style={{ marginTop: 2, color: "#8fa2ad", fontSize: 11.5 }}>
                      Last seen {formatSeenLabel(session.lastSeenAt)} - {session.deviceId ?? "unknown-device-id"}
                    </div>
                  </div>
                  <span
                    style={{
                      borderRadius: 999,
                      border: `1px solid ${badgeColor}`,
                      color: badgeColor,
                      padding: "1px 7px",
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    {badgeText}
                  </span>
                </div>

                <div style={{ ...subtleDividerStyle, margin: "8px 0" }} />

                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ color: "#8fa2ad", fontSize: 11 }}>
                    Session: {session.sessionId.slice(0, 10)}...
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRevoke(session.sessionId)}
                    disabled={!canRevoke || revokingSessionId === session.sessionId}
                    style={{
                      marginLeft: "auto",
                      border: "1px solid rgba(255,99,71,0.45)",
                      borderRadius: 999,
                      padding: "4px 10px",
                      background: "rgba(255,99,71,0.1)",
                      color: "#ff9a86",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: canRevoke ? "pointer" : "not-allowed",
                      opacity: canRevoke ? 1 : 0.55,
                    }}
                  >
                    {revokingSessionId === session.sessionId ? "Revoking..." : "Revoke"}
                  </button>
                </div>
              </article>
            );
          })}
      </SettingsSection>

      {errorText && (
        <div
          style={{
            borderRadius: 10,
            border: "1px solid rgba(255,160,122,0.5)",
            background: "rgba(255,160,122,0.1)",
            color: "#ffb49e",
            padding: "9px 11px",
            fontSize: 11.5,
            lineHeight: 1.4,
          }}
        >
          {errorText}
        </div>
      )}
    </SettingsScaffold>
  );
}
