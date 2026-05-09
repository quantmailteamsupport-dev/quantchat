"use client";

import { type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export interface SettingsPalette {
  pageBg: string;
  cardBg: string;
  cardBgSoft: string;
  border: string;
  text: string;
  mutedText: string;
  accent: string;
  accentSoft: string;
}

export const SETTINGS_PALETTE: SettingsPalette = {
  pageBg: "#0f171d",
  cardBg: "#182229",
  cardBgSoft: "#132029",
  border: "rgba(255,255,255,0.08)",
  text: "#e9edef",
  mutedText: "#8fa2ad",
  accent: "#00a884",
  accentSoft: "rgba(0,168,132,0.16)",
};

interface SettingsScaffoldProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  palette?: SettingsPalette;
}

export function SettingsScaffold({
  title,
  subtitle,
  children,
  palette = SETTINGS_PALETTE,
}: SettingsScaffoldProps) {
  const router = useRouter();

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflowY: "auto",
        scrollbarWidth: "none",
        background: palette.pageBg,
        color: palette.text,
        fontFamily: "-apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          backdropFilter: "blur(10px)",
          background: "rgba(15, 23, 29, 0.88)",
          borderBottom: `1px solid ${palette.border}`,
          padding: "14px 16px 12px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            border: `1px solid ${palette.border}`,
            background: palette.cardBg,
            color: palette.text,
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
          }}
          aria-label="Go back"
        >
          {"<"}
        </button>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{title}</h1>
          {subtitle && (
            <p style={{ margin: "2px 0 0", fontSize: 12, color: palette.mutedText, lineHeight: 1.3 }}>
              {subtitle}
            </p>
          )}
        </div>
      </header>

      <main style={{ padding: "14px 14px 20px" }}>{children}</main>
    </div>
  );
}

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  palette?: SettingsPalette;
}

export function SettingsSection({
  title,
  description,
  children,
  palette = SETTINGS_PALETTE,
}: SettingsSectionProps) {
  return (
    <section
      style={{
        borderRadius: 14,
        border: `1px solid ${palette.border}`,
        background: palette.cardBg,
        padding: "12px",
        marginBottom: 12,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: palette.text }}>{title}</h2>
      {description && (
        <p style={{ margin: "4px 0 10px", fontSize: 12, color: palette.mutedText, lineHeight: 1.4 }}>
          {description}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </section>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  palette?: SettingsPalette;
}

export function ToggleRow({
  label,
  description,
  checked,
  onToggle,
  disabled = false,
  palette = SETTINGS_PALETTE,
}: ToggleRowProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      style={{
        width: "100%",
        borderRadius: 12,
        border: `1px solid ${palette.border}`,
        background: palette.cardBgSoft,
        color: palette.text,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.65 : 1,
        textAlign: "left",
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 11.5, color: palette.mutedText, marginTop: 2, lineHeight: 1.35 }}>
          {description}
        </div>
      </div>
      <div
        aria-hidden="true"
        style={{
          width: 40,
          height: 22,
          borderRadius: 999,
          border: `1px solid ${checked ? palette.accent : palette.border}`,
          background: checked ? palette.accentSoft : "rgba(255,255,255,0.02)",
          position: "relative",
          flexShrink: 0,
          transition: "all 140ms ease",
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: checked ? palette.accent : "#7d8d96",
            position: "absolute",
            top: 2,
            left: checked ? 20 : 2,
            transition: "left 140ms ease",
          }}
        />
      </div>
    </button>
  );
}

interface SettingsLinkRowProps {
  title: string;
  subtitle: string;
  badge?: string;
  palette?: SettingsPalette;
}

export function SettingsLinkRow({
  title,
  subtitle,
  badge,
  palette = SETTINGS_PALETTE,
}: SettingsLinkRowProps) {
  return (
    <div
      style={{
        width: "100%",
        borderRadius: 12,
        border: `1px solid ${palette.border}`,
        background: palette.cardBgSoft,
        color: palette.text,
        padding: "11px 12px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: palette.mutedText, marginTop: 2, lineHeight: 1.35 }}>
          {subtitle}
        </div>
      </div>
      {badge && (
        <span
          style={{
            borderRadius: 999,
            border: `1px solid ${palette.accent}`,
            padding: "1px 7px",
            fontSize: 10,
            color: palette.accent,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {badge}
        </span>
      )}
      <span style={{ color: palette.mutedText, fontWeight: 700 }}>{">"}</span>
    </div>
  );
}

export const subtleDividerStyle: CSSProperties = {
  height: 1,
  width: "100%",
  background: "rgba(255,255,255,0.08)",
};
