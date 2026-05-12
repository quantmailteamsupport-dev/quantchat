"use client";

import { SettingsScaffold, SettingsSection, ToggleRow } from "@/components/settings/SettingsScaffold";
import {
  useFrontendPreferences,
  type FrontendBooleanPreferenceKey,
  type ReadReceiptMode,
} from "@/lib/useFrontendPreferences";

interface PrivacyControl {
  key: FrontendBooleanPreferenceKey;
  title: string;
  description: string;
}

interface ReadReceiptModeOption {
  key: ReadReceiptMode;
  title: string;
  description: string;
}

const PRIVACY_CONTROLS: PrivacyControl[] = [
  {
    key: "readReceiptsEnabled",
    title: "Read receipts",
    description: "Share message read-state updates instead of delivery-only status.",
  },
  {
    key: "reactionsEnabled",
    title: "Message reactions",
    description: "Enable reaction chips in conversations and channel timelines.",
  },
  {
    key: "privateForwardGuardEnabled",
    title: "Private forward guard",
    description: "Prompt before forwarding to avoid accidental oversharing.",
  },
  {
    key: "trustedMediaOnlyEnabled",
    title: "Trusted media previews",
    description: "Blur unknown attachments until the sender is trusted.",
  },
  {
    key: "compactChatLayout",
    title: "Compact message layout",
    description: "Use denser spacing for smaller screens and quicker scanning.",
  },
];

const READ_RECEIPT_MODES: ReadReceiptModeOption[] = [
  {
    key: "instant",
    title: "Instant",
    description: "Read updates appear immediately after opening the conversation.",
  },
  {
    key: "delayed",
    title: "Delayed",
    description: "Hold read updates briefly so seen-state is less time-revealing.",
  },
  {
    key: "batch",
    title: "Batch",
    description: "Group read updates into quieter windows across devices.",
  },
];

export default function PrivacySettingsPage() {
  const { preferences, setPreference } = useFrontendPreferences();

  return (
    <SettingsScaffold
      title="Privacy controls"
      subtitle="Tune read-state, forwarding, trusted media, and chat visibility behavior."
    >
      <SettingsSection
        title="Message privacy"
        description="These controls sync with DM and channel surfaces to keep behavior consistent."
      >
        {PRIVACY_CONTROLS.map((control) => (
          <ToggleRow
            key={control.key}
            label={control.title}
            description={control.description}
            checked={preferences[control.key]}
            onToggle={() => setPreference(control.key, !preferences[control.key])}
          />
        ))}
      </SettingsSection>

      <SettingsSection
        title="Read receipt mode"
        description="Use the privacy ladder to tune how quickly recipients see read state."
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {READ_RECEIPT_MODES.map((mode) => {
            const selected = preferences.readReceiptMode === mode.key;
            return (
              <button
                key={mode.key}
                type="button"
                onClick={() => setPreference("readReceiptMode", mode.key)}
                disabled={!preferences.readReceiptsEnabled}
                style={{
                  border: selected ? "1px solid rgba(0,168,132,0.65)" : "1px solid rgba(255,255,255,0.16)",
                  borderRadius: 999,
                  background: selected ? "rgba(0,168,132,0.18)" : "rgba(255,255,255,0.03)",
                  color: selected ? "#00d4a8" : "#e9edef",
                  padding: "5px 11px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: preferences.readReceiptsEnabled ? "pointer" : "not-allowed",
                  opacity: preferences.readReceiptsEnabled ? 1 : 0.55,
                }}
                aria-label={`Set ${mode.title} read receipt mode`}
              >
                {mode.title}
              </button>
            );
          })}
        </div>
        {READ_RECEIPT_MODES.map((mode) => (
          <p
            key={mode.key}
            style={{
              margin: 0,
              fontSize: 11.5,
              lineHeight: 1.35,
              color: preferences.readReceiptMode === mode.key ? "#8fa2ad" : "rgba(143,162,173,0.72)",
            }}
          >
            <strong style={{ color: "#e9edef" }}>{mode.title}:</strong> {mode.description}
          </p>
        ))}
      </SettingsSection>
    </SettingsScaffold>
  );
}
