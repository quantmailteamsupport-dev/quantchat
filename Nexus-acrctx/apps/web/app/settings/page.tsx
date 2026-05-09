"use client";

import Link from "next/link";
import { TrustSnapshotCard } from "@/components/TrustSnapshotCard";
import {
  SettingsLinkRow,
  SettingsScaffold,
  SettingsSection,
  ToggleRow,
} from "@/components/settings/SettingsScaffold";
import {
  useFrontendPreferences,
  type FrontendBooleanPreferenceKey,
  type ReadReceiptMode,
} from "@/lib/useFrontendPreferences";

interface QuickControl {
  key: FrontendBooleanPreferenceKey;
  title: string;
  subtitle: string;
}

interface ReceiptModeOption {
  key: ReadReceiptMode;
  title: string;
  subtitle: string;
}

const QUICK_CONTROLS: QuickControl[] = [
  {
    key: "readReceiptsEnabled",
    title: "Read receipts",
    subtitle: "Share seen status in DM and channel conversations.",
  },
  {
    key: "reactionsEnabled",
    title: "Message reactions",
    subtitle: "Show reaction chips in all chat surfaces.",
  },
  {
    key: "aiReplySuggestionsEnabled",
    title: "AI reply suggestions",
    subtitle: "Allow composer suggestion hints while typing.",
  },
  {
    key: "strictKeyVerification",
    title: "Strict key verification",
    subtitle: "Require trust checks before new-device sync.",
  },
];

const SETTINGS_ROUTES: Array<{ href: string; title: string; subtitle: string; badge?: string }> = [
  {
    href: "/settings/devices",
    title: "Linked devices",
    subtitle: "Review companion sessions and revoke access quickly.",
    badge: "SYNC",
  },
  {
    href: "/settings/key-verification",
    title: "Key verification",
    subtitle: "Track safety code and enforce verification prompts.",
  },
  {
    href: "/settings/ai-consent",
    title: "AI reply consent",
    subtitle: "Control smart reply usage and retention behavior.",
    badge: "AI",
  },
  {
    href: "/settings/privacy",
    title: "Privacy controls",
    subtitle: "Manage forwarding guard, trusted media, and receipts.",
  },
  {
    href: "/settings/ai-avatar",
    title: "AI avatar",
    subtitle: "Configure digital twin behavior and auto-replies.",
  },
];

const RECEIPT_MODE_OPTIONS: ReceiptModeOption[] = [
  {
    key: "instant",
    title: "Instant",
    subtitle: "Show read state as soon as messages are opened.",
  },
  {
    key: "delayed",
    title: "Delayed",
    subtitle: "Hold read updates briefly before sharing seen state.",
  },
  {
    key: "batch",
    title: "Batch",
    subtitle: "Share grouped read updates in larger privacy-friendly windows.",
  },
];

export default function SettingsPage() {
  const { preferences, setPreference } = useFrontendPreferences();

  return (
    <SettingsScaffold
      title="Settings"
      subtitle="Cross-device privacy and consent controls for QuantChat."
    >
      <TrustSnapshotCard context="settings" />

      <SettingsSection
        title="Quick controls"
        description="These apply instantly across chat, channels, feed handoff, and call surfaces."
      >
        {QUICK_CONTROLS.map((control) => (
          <ToggleRow
            key={control.key}
            label={control.title}
            description={control.subtitle}
            checked={preferences[control.key]}
            onToggle={() => setPreference(control.key, !preferences[control.key])}
          />
        ))}
      </SettingsSection>

      <SettingsSection
        title="Receipt privacy ladder"
        description="Choose how quickly read status appears to recipients when receipts are enabled."
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {RECEIPT_MODE_OPTIONS.map((mode) => {
            const selected = preferences.readReceiptMode === mode.key;
            return (
              <button
                key={mode.key}
                type="button"
                onClick={() => setPreference("readReceiptMode", mode.key)}
                disabled={!preferences.readReceiptsEnabled}
                style={{
                  border: selected ? "1px solid rgba(0,168,132,0.7)" : "1px solid rgba(255,255,255,0.16)",
                  borderRadius: 999,
                  background: selected ? "rgba(0,168,132,0.18)" : "rgba(255,255,255,0.03)",
                  color: selected ? "#00d4a8" : "#e9edef",
                  padding: "5px 11px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: preferences.readReceiptsEnabled ? "pointer" : "not-allowed",
                  opacity: preferences.readReceiptsEnabled ? 1 : 0.55,
                }}
                aria-label={`Use ${mode.title} read receipt mode`}
              >
                {mode.title}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {RECEIPT_MODE_OPTIONS.map((mode) => {
            if (preferences.readReceiptMode !== mode.key) return null;
            return (
              <p key={mode.key} style={{ margin: 0, fontSize: 11.5, color: "#8fa2ad", lineHeight: 1.35 }}>
                {mode.subtitle}
              </p>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Security and privacy"
        description="Open dedicated routes for device-link, key trust, AI consent, and message privacy."
      >
        {SETTINGS_ROUTES.map((route) => (
          <Link key={route.href} href={route.href} style={{ textDecoration: "none" }}>
            <SettingsLinkRow title={route.title} subtitle={route.subtitle} badge={route.badge} />
          </Link>
        ))}
      </SettingsSection>
    </SettingsScaffold>
  );
}
