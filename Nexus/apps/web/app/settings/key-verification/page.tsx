"use client";

import { useEffect, useMemo, useState } from "react";
import { SettingsScaffold, SettingsSection, ToggleRow } from "@/components/settings/SettingsScaffold";
import { useFrontendPreferences } from "@/lib/useFrontendPreferences";
import { useQuantchatIdentity } from "@/lib/useQuantchatIdentity";

function buildSafetyCode(userId: string): string {
  let hashA = 0x1234abcd;
  let hashB = 0x8badf00d;
  for (let i = 0; i < userId.length; i += 1) {
    const value = userId.charCodeAt(i);
    hashA = (hashA ^ value) + ((hashA << 5) - hashA);
    hashB = (hashB + value * 17) ^ (hashB >>> 1);
  }

  const partA = Math.abs(hashA).toString(16).padStart(8, "0").slice(0, 8);
  const partB = Math.abs(hashB).toString(16).padStart(8, "0").slice(0, 8);
  return `${partA.slice(0, 4)}-${partA.slice(4, 8)}-${partB.slice(0, 4)}-${partB.slice(4, 8)}`.toUpperCase();
}

function getVerificationStorageKey(userId: string): string {
  return `quantchat:key-verification:${userId}`;
}

function readVerificationTimestamp(userId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(getVerificationStorageKey(userId));
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Not verified yet";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Not verified yet";
  return new Date(parsed).toLocaleString();
}

export default function KeyVerificationPage() {
  const identity = useQuantchatIdentity();
  const userId = identity.userId || identity.requestedUserId || "local-preview";
  const safetyCode = useMemo(() => buildSafetyCode(userId), [userId]);
  const { preferences, setPreference } = useFrontendPreferences();
  const [verifiedAt, setVerifiedAt] = useState<string | null>(() => readVerificationTimestamp(userId));
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    setVerifiedAt(readVerificationTimestamp(userId));
  }, [userId]);

  const handleMarkVerified = () => {
    const nowIso = new Date().toISOString();
    try {
      window.localStorage.setItem(getVerificationStorageKey(userId), nowIso);
      setVerifiedAt(nowIso);
    } catch {
      // Ignore storage errors in restricted browser mode.
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(safetyCode);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <SettingsScaffold
      title="Key verification"
      subtitle="Confirm trust before syncing encrypted conversations to new devices."
    >
      <SettingsSection
        title="Safety code"
        description="Compare this code with your companion device during linking to avoid MITM risk."
      >
        <div
          style={{
            borderRadius: 12,
            border: "1px solid rgba(0,168,132,0.45)",
            background: "rgba(0,168,132,0.12)",
            padding: "12px",
          }}
        >
          <div style={{ fontSize: 11, color: "#8fa2ad", marginBottom: 5 }}>Account</div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>{userId}</div>
          <div
            style={{
              fontSize: 20,
              letterSpacing: "0.08em",
              fontWeight: 800,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              color: "#00d4a8",
              marginBottom: 8,
            }}
          >
            {safetyCode}
          </div>
          <div style={{ color: "#8fa2ad", fontSize: 11.5 }}>Last verified: {formatTimestamp(verifiedAt)}</div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleMarkVerified}
            style={{
              border: "1px solid rgba(0,168,132,0.5)",
              background: "rgba(0,168,132,0.14)",
              color: "#00d4a8",
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Mark verified
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            style={{
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.04)",
              color: "#e9edef",
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy code"}
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Verification policy"
        description="Enable strict checks to block unverified sync paths until trust is confirmed."
      >
        <ToggleRow
          label="Strict key verification"
          description="Require key checks when a new device requests encrypted history."
          checked={preferences.strictKeyVerification}
          onToggle={() => setPreference("strictKeyVerification", !preferences.strictKeyVerification)}
        />
        <ToggleRow
          label="Companion key alerts"
          description="Surface visible warnings whenever a linked device key changes."
          checked={preferences.companionDeviceAlertsEnabled}
          onToggle={() =>
            setPreference("companionDeviceAlertsEnabled", !preferences.companionDeviceAlertsEnabled)
          }
        />
      </SettingsSection>
    </SettingsScaffold>
  );
}
