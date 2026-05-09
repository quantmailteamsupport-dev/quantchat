"use client";

import { useEffect, useState } from "react";
import { SettingsScaffold, SettingsSection, ToggleRow } from "@/components/settings/SettingsScaffold";
import { useFrontendPreferences } from "@/lib/useFrontendPreferences";

const RETENTION_STORAGE_KEY = "quantchat:ai-consent:retention-hours";
const DELETE_ON_SEND_STORAGE_KEY = "quantchat:ai-consent:delete-on-send";

function readRetentionHours(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(RETENTION_STORAGE_KEY);
  const parsed = Number.parseInt(raw ?? "0", 10);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed <= 0) return 0;
  return Math.min(parsed, 24);
}

function readDeleteOnSend(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(DELETE_ON_SEND_STORAGE_KEY) !== "0";
}

export default function AiConsentPage() {
  const { preferences, setPreference } = useFrontendPreferences();
  const [retentionHours, setRetentionHours] = useState<number>(0);
  const [deleteOnSend, setDeleteOnSend] = useState<boolean>(true);
  const [clearState, setClearState] = useState<"idle" | "done">("idle");

  useEffect(() => {
    setRetentionHours(readRetentionHours());
    setDeleteOnSend(readDeleteOnSend());
  }, []);

  const updateRetention = (next: number) => {
    setRetentionHours(next);
    try {
      window.localStorage.setItem(RETENTION_STORAGE_KEY, String(next));
    } catch {
      // Ignore storage errors in restricted browser mode.
    }
  };

  const updateDeleteOnSend = (next: boolean) => {
    setDeleteOnSend(next);
    try {
      window.localStorage.setItem(DELETE_ON_SEND_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Ignore storage errors in restricted browser mode.
    }
  };

  const clearAiLocalState = () => {
    setClearState("done");
    try {
      window.localStorage.removeItem(RETENTION_STORAGE_KEY);
      window.localStorage.removeItem(DELETE_ON_SEND_STORAGE_KEY);
      setRetentionHours(0);
      setDeleteOnSend(true);
    } catch {
      // Ignore storage errors in restricted browser mode.
    }
  };

  return (
    <SettingsScaffold
      title="AI reply consent"
      subtitle="Control if smart suggestions are generated, stored, and reused."
    >
      <SettingsSection
        title="Consent controls"
        description="Disable this to fully stop smart reply generation in the composer."
      >
        <ToggleRow
          label="Smart reply suggestions"
          description="Allow on-the-fly AI suggestions while typing a message."
          checked={preferences.aiReplySuggestionsEnabled}
          onToggle={() =>
            setPreference("aiReplySuggestionsEnabled", !preferences.aiReplySuggestionsEnabled)
          }
        />
        <ToggleRow
          label="Delete generated text after send"
          description="Drop local AI suggestion traces as soon as the message is sent."
          checked={deleteOnSend}
          onToggle={() => updateDeleteOnSend(!deleteOnSend)}
        />
      </SettingsSection>

      <SettingsSection
        title="Retention window"
        description="Set 0h for strict privacy or keep up to 24h for quicker drafting."
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[0, 1, 4, 24].map((hours) => {
            const selected = retentionHours === hours;
            return (
              <button
                key={hours}
                type="button"
                onClick={() => updateRetention(hours)}
                style={{
                  border: selected ? "1px solid rgba(0,168,132,0.65)" : "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 999,
                  background: selected ? "rgba(0,168,132,0.16)" : "rgba(255,255,255,0.03)",
                  color: selected ? "#00d4a8" : "#e9edef",
                  padding: "5px 11px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {hours === 0 ? "0h (strict)" : `${hours}h`}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={clearAiLocalState}
          style={{
            border: "1px solid rgba(255,128,128,0.45)",
            borderRadius: 999,
            background: "rgba(255,128,128,0.12)",
            color: "#ffc2c2",
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 700,
            width: "fit-content",
            cursor: "pointer",
          }}
        >
          {clearState === "done" ? "Local AI state cleared" : "Clear local AI state"}
        </button>
      </SettingsSection>
    </SettingsScaffold>
  );
}
