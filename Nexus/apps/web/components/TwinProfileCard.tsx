"use client";

/**
 * components/TwinProfileCard.tsx
 *
 * The Digital Twin profile card — a self-contained React component that
 * renders the personality traits, stats, and configuration controls for a
 * user's AI clone. Drops into any surface that has access to a
 * {@link TwinProfileView} (e.g. the /profile page, the chat info panel,
 * or a Settings modal).
 *
 * Design language:
 *   - Glassmorphic pitch-black card, consistent with PremiumPaywall and
 *     other shells in apps/web/components.
 *   - Framer Motion entry animations; lucide-react iconography.
 *   - No network calls or data fetching inside the component — callers
 *     pass the already-loaded view and an `onSettingsChange` callback.
 *   - Fully controlled: this component never mutates state on its own.
 */

import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Brain,
  MessageSquare,
  Clock,
  Users,
  ShieldCheck,
  Bot,
  Zap,
  ChevronRight,
  ChevronDown,
  Settings2,
  Volume2,
  Smile,
  Quote,
  BookOpen,
  BarChart3,
  AlertTriangle,
  Check,
} from "lucide-react";

import type { TwinProfileView, TwinSettings } from "../lib/ai/DigitalTwinService";
import type { TwinAllowance } from "../lib/ai/AutoReplyEngine";

// ─── Props ────────────────────────────────────────────────────────────────

export interface TwinProfileCardProps {
  /** Pre-computed UI view model from DigitalTwinService.getProfileView. */
  view: TwinProfileView;
  /**
   * Called with a partial settings patch whenever the user toggles a
   * control. The caller decides whether/when to persist.
   */
  onSettingsChange?: (patch: Partial<TwinSettings>) => void;
  /** Called when the user clicks the "retrain" action. */
  onRetrainRequest?: () => void;
  /** Called when the user clicks "delete twin". */
  onDeleteRequest?: () => void;
  /** Compact mode — hides the secondary sections. */
  compact?: boolean;
  /** Optional header title override. */
  title?: string;
  /** Optional subtitle. */
  subtitle?: string;
  /** Extra className hook. */
  className?: string;
}

// ─── Shared styles ────────────────────────────────────────────────────────

const COLORS = {
  bg: "linear-gradient(145deg, #0d0d0d 0%, #111 60%, #0a0a0f 100%)",
  border: "1px solid rgba(139,92,246,0.35)",
  shadow:
    "0 0 0 1px rgba(139,92,246,0.15), 0 24px 80px rgba(0,0,0,0.8), 0 0 60px rgba(139,92,246,0.12)",
  text: "#f5f5f7",
  muted: "#a0a0ad",
  accent: "#8b5cf6",
  accentDim: "rgba(139,92,246,0.18)",
  chipBg: "rgba(255,255,255,0.05)",
  chipBorder: "1px solid rgba(255,255,255,0.08)",
  success: "#10b981",
  warn: "#f59e0b",
  danger: "#ef4444",
};

const CARD_RADIUS = 24;

// ─── Component ────────────────────────────────────────────────────────────

export default function TwinProfileCard({
  view,
  onSettingsChange,
  onRetrainRequest,
  onDeleteRequest,
  compact = false,
  title,
  subtitle,
  className,
}: TwinProfileCardProps) {
  const [expanded, setExpanded] = useState<{
    traits: boolean;
    lexicon: boolean;
    cadence: boolean;
    exemplars: boolean;
    advanced: boolean;
  }>({
    traits: true,
    lexicon: !compact,
    cadence: !compact,
    exemplars: !compact,
    advanced: false,
  });

  const toggle = (key: keyof typeof expanded) =>
    setExpanded((s) => ({ ...s, [key]: !s[key] }));

  const settings = view.settings;
  const emit = (patch: Partial<TwinSettings>) => {
    if (onSettingsChange) onSettingsChange(patch);
  };

  const hourPeak = useMemo(() => peakHour(view.hourHistogram), [view.hourHistogram]);
  const lastActiveLabel = useMemo(
    () => formatRelativeTime(view.stats.lastOwnerActivity),
    [view.stats.lastOwnerActivity]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className={className}
      style={{
        background: COLORS.bg,
        border: COLORS.border,
        boxShadow: COLORS.shadow,
        borderRadius: CARD_RADIUS,
        color: COLORS.text,
        padding: "24px 22px 20px",
        maxWidth: 560,
        width: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <GlowOrb />

      <Header
        view={view}
        title={title}
        subtitle={subtitle}
        lastActiveLabel={lastActiveLabel}
      />

      <ConfidenceBanner view={view} />

      <Section
        icon={<Sparkles size={16} />}
        title="Personality traits"
        expanded={expanded.traits}
        onToggle={() => toggle("traits")}
      >
        <TraitGrid traits={view.traits} />
        <Summary text={view.summary} />
      </Section>

      {!compact && (
        <>
          <Section
            icon={<BookOpen size={16} />}
            title="Lexicon"
            expanded={expanded.lexicon}
            onToggle={() => toggle("lexicon")}
          >
            <LexiconSection view={view} />
          </Section>

          <Section
            icon={<Clock size={16} />}
            title={`Cadence — most active ${hourPeak}`}
            expanded={expanded.cadence}
            onToggle={() => toggle("cadence")}
          >
            <Histogram values={view.hourHistogram} />
            <StatsRow stats={view.stats} />
          </Section>

          <Section
            icon={<Quote size={16} />}
            title="Example messages"
            expanded={expanded.exemplars}
            onToggle={() => toggle("exemplars")}
          >
            <Exemplars items={view.exemplars} />
          </Section>
        </>
      )}

      <Section
        icon={<Settings2 size={16} />}
        title="Twin behaviour"
        expanded={expanded.advanced}
        onToggle={() => toggle("advanced")}
      >
        <SettingsPanel
          settings={settings}
          onChange={emit}
          onRetrainRequest={onRetrainRequest}
          onDeleteRequest={onDeleteRequest}
        />
      </Section>

      <Footer view={view} />
    </motion.div>
  );
}

// ─── Decorative ───────────────────────────────────────────────────────────

function GlowOrb() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: -80,
        right: -60,
        width: 240,
        height: 240,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(139,92,246,0.22) 0%, transparent 70%)",
        pointerEvents: "none",
      }}
    />
  );
}

// ─── Header ───────────────────────────────────────────────────────────────

function Header({
  view,
  title,
  subtitle,
  lastActiveLabel,
}: {
  view: TwinProfileView;
  title?: string;
  subtitle?: string;
  lastActiveLabel: string;
}) {
  const displayTitle = title ?? "Digital Twin";
  const displaySubtitle =
    subtitle ??
    `Learned from ${view.sampleSize.toLocaleString()} message${view.sampleSize === 1 ? "" : "s"} · last active ${lastActiveLabel}`;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: "linear-gradient(135deg, #8b5cf6, #3b82f6)",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 10px 30px rgba(139,92,246,0.35)",
        }}
      >
        <Bot size={24} color="#fff" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.2 }}>{displayTitle}</div>
        <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{displaySubtitle}</div>
      </div>
      <StatusPill view={view} />
    </div>
  );
}

function StatusPill({ view }: { view: TwinProfileView }) {
  const on = view.settings.enabled;
  return (
    <div
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: on ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.06)",
        border: on ? "1px solid rgba(16,185,129,0.45)" : COLORS.chipBorder,
        color: on ? COLORS.success : COLORS.muted,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: on ? COLORS.success : COLORS.muted,
          boxShadow: on ? `0 0 8px ${COLORS.success}` : "none",
        }}
      />
      {on ? "Active" : "Dormant"}
    </div>
  );
}

// ─── Confidence Banner ────────────────────────────────────────────────────

function ConfidenceBanner({ view }: { view: TwinProfileView }) {
  if (view.confident) return null;
  return (
    <div
      role="status"
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "10px 12px",
        borderRadius: 12,
        background: "rgba(245,158,11,0.08)",
        border: "1px solid rgba(245,158,11,0.35)",
        margin: "4px 0 18px",
      }}
    >
      <AlertTriangle size={16} color={COLORS.warn} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ fontSize: 12, color: "#fde1a1", lineHeight: 1.4 }}>
        <strong style={{ color: "#fff" }}>Still learning.</strong>{" "}
        Personality insights become accurate after ~20 messages. Currently observed:{" "}
        <strong>{view.sampleSize}</strong>.
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────

function Section({
  icon,
  title,
  expanded,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 18 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "transparent",
          border: "none",
          color: COLORS.text,
          cursor: "pointer",
          padding: "8px 0",
          textAlign: "left",
        }}
      >
        <span style={{ color: COLORS.accent, display: "inline-flex" }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{title}</span>
        <span style={{ color: COLORS.muted, display: "inline-flex" }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ paddingTop: 8 }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Traits ──────────────────────────────────────────────────────────────

function TraitGrid({ traits }: { traits: TwinProfileView["traits"] }) {
  if (!traits.length) {
    return <EmptyHint text="Traits will appear once the twin has seen enough messages." />;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {traits.map((t) => (
        <TraitPill key={t.key} label={t.label} score={t.score} description={t.description} />
      ))}
    </div>
  );
}

function TraitPill({
  label,
  score,
  description,
}: {
  label: string;
  score: number;
  description?: string;
}) {
  const intensity = Math.max(0.15, Math.min(1, score));
  const hue = 265; // violet base
  return (
    <motion.div
      whileHover={{ y: -1 }}
      title={description}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: "#fff",
        background: `hsla(${hue}, 70%, ${18 + intensity * 10}%, 0.9)`,
        border: `1px solid hsla(${hue}, 90%, ${50 + intensity * 10}%, ${0.35 + intensity * 0.4})`,
        boxShadow: `0 0 ${8 * intensity}px hsla(${hue}, 90%, 60%, ${0.15 * intensity})`,
      }}
    >
      <span>{label}</span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          opacity: 0.75,
          background: "rgba(0,0,0,0.35)",
          padding: "2px 6px",
          borderRadius: 999,
        }}
      >
        {Math.round(score * 100)}
      </span>
    </motion.div>
  );
}

function Summary({ text }: { text: string }) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 12px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.03)",
        border: COLORS.chipBorder,
        fontSize: 12.5,
        color: "#d4d4dc",
        lineHeight: 1.55,
      }}
    >
      {text}
    </div>
  );
}

// ─── Lexicon ─────────────────────────────────────────────────────────────

function LexiconSection({ view }: { view: TwinProfileView }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <ChipRow
        icon={<Smile size={14} />}
        label="Top emojis"
        items={view.topEmojis.map((e) => ({ key: e.emoji, label: `${e.emoji} ${e.count}` }))}
        emptyHint="No emojis observed."
      />
      <ChipRow
        icon={<MessageSquare size={14} />}
        label="Top words"
        items={view.topWords.map((w) => ({ key: w.word, label: `${w.word} · ${w.count}` }))}
        emptyHint="Not enough vocabulary yet."
      />
      <ChipRow
        icon={<Sparkles size={14} />}
        label="Slang"
        items={view.slang.map((s) => ({ key: s.word, label: `${s.word} · ${s.count}` }))}
        emptyHint="No slang detected."
      />
      <ChipRow
        icon={<Zap size={14} />}
        label="Abbreviations"
        items={view.abbreviations.map((s) => ({ key: s.word, label: `${s.word} · ${s.count}` }))}
        emptyHint="None yet."
      />
      <ChipRow
        icon={<Quote size={14} />}
        label="Catchphrases"
        items={view.catchphrases.map((p) => ({ key: p.phrase, label: `"${p.phrase}" · ${p.count}` }))}
        emptyHint="No repeated phrases yet."
      />
    </div>
  );
}

function ChipRow({
  icon,
  label,
  items,
  emptyHint,
}: {
  icon: React.ReactNode;
  label: string;
  items: { key: string; label: string }[];
  emptyHint: string;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: COLORS.muted,
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        <span style={{ color: COLORS.accent, display: "inline-flex" }}>{icon}</span>
        {label}
      </div>
      {items.length === 0 ? (
        <EmptyHint text={emptyHint} />
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {items.map((it) => (
            <span
              key={it.key}
              style={{
                padding: "4px 10px",
                background: COLORS.chipBg,
                border: COLORS.chipBorder,
                borderRadius: 999,
                fontSize: 12,
                color: "#ddd",
              }}
            >
              {it.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Cadence ─────────────────────────────────────────────────────────────

function Histogram({ values }: { values: number[] }) {
  const max = Math.max(0.0001, ...values);
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(24, 1fr)`,
          gap: 2,
          alignItems: "end",
          height: 64,
        }}
      >
        {values.map((v, i) => {
          const h = Math.max(3, (v / max) * 64);
          const isPeak = v === max && max > 0;
          return (
            <div
              key={i}
              title={`${i}:00 — ${(v * 100).toFixed(1)}%`}
              style={{
                height: h,
                borderRadius: 3,
                background: isPeak
                  ? "linear-gradient(180deg, #a78bfa, #7c3aed)"
                  : "rgba(139,92,246,0.35)",
                transition: "height 0.3s ease",
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: COLORS.muted,
          marginTop: 4,
        }}
      >
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
    </div>
  );
}

function StatsRow({ stats }: { stats: TwinProfileView["stats"] }) {
  const accuracyLabel =
    stats.twinAccuracy === null ? "—" : `${stats.twinAccuracy}%`;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
        marginTop: 12,
      }}
    >
      <Stat label="Auto-replies" value={stats.autoRepliesSent.toLocaleString()} icon={<Bot size={12} />} />
      <Stat label="Suggestions" value={stats.suggestionsOffered.toLocaleString()} icon={<Sparkles size={12} />} />
      <Stat label="Group chimes" value={stats.groupChimes.toLocaleString()} icon={<Users size={12} />} />
      <Stat
        label="Twin accuracy"
        value={accuracyLabel}
        icon={<Check size={12} />}
        highlight={stats.twinAccuracy !== null}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        background: highlight ? "rgba(139,92,246,0.12)" : COLORS.chipBg,
        border: highlight ? "1px solid rgba(139,92,246,0.4)" : COLORS.chipBorder,
        borderRadius: 12,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: COLORS.muted,
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        <span style={{ color: highlight ? COLORS.accent : COLORS.accent, display: "inline-flex" }}>{icon}</span>
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          marginTop: 4,
          color: highlight ? COLORS.accent : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Exemplars ───────────────────────────────────────────────────────────

function Exemplars({ items }: { items: string[] }) {
  if (!items.length) {
    return <EmptyHint text="Example messages will appear as the twin learns." />;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((e, i) => (
        <div
          key={`${i}-${e.slice(0, 16)}`}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.03)",
            border: COLORS.chipBorder,
            fontSize: 13,
            color: "#d4d4dc",
            lineHeight: 1.5,
            fontStyle: "italic",
          }}
        >
          “{e}”
        </div>
      ))}
    </div>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────

function SettingsPanel({
  settings,
  onChange,
  onRetrainRequest,
  onDeleteRequest,
}: {
  settings: TwinSettings;
  onChange: (patch: Partial<TwinSettings>) => void;
  onRetrainRequest?: () => void;
  onDeleteRequest?: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Toggle
        label="Twin enabled"
        description="Master switch. When off, the twin never speaks."
        icon={<Bot size={14} />}
        checked={settings.enabled}
        onChange={(v) => onChange({ enabled: v })}
      />
      <Toggle
        label="Auto-reply while offline"
        description="Respond to DMs in your style when you're away."
        icon={<MessageSquare size={14} />}
        disabled={!settings.enabled}
        checked={settings.autoReplyOffline}
        onChange={(v) => onChange({ autoReplyOffline: v })}
      />
      <Toggle
        label="Live suggestions"
        description="Offer reply suggestions while you type or during calls."
        icon={<Sparkles size={14} />}
        disabled={!settings.enabled}
        checked={settings.liveSuggestions}
        onChange={(v) => onChange({ liveSuggestions: v })}
      />
      <Toggle
        label="Group autonomy"
        description="Let the twin chime in to group chats when you're idle."
        icon={<Users size={14} />}
        disabled={!settings.enabled}
        checked={settings.groupAutonomy}
        onChange={(v) => onChange({ groupAutonomy: v })}
      />
      <AllowanceSelector
        value={settings.allowance}
        disabled={!settings.enabled}
        onChange={(allowance) => onChange({ allowance })}
      />
      <ChattinessSlider
        value={settings.chattiness}
        disabled={!settings.enabled}
        onChange={(chattiness) => onChange({ chattiness })}
      />
      <VoiceLabel voiceId={settings.voiceId} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {onRetrainRequest && (
          <ActionButton variant="neutral" onClick={onRetrainRequest}>
            <Brain size={14} /> Retrain
          </ActionButton>
        )}
        {onDeleteRequest && (
          <ActionButton variant="danger" onClick={onDeleteRequest}>
            <AlertTriangle size={14} /> Delete twin
          </ActionButton>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  icon,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.03)",
        border: COLORS.chipBorder,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{ color: COLORS.accent, display: "inline-flex" }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{description}</div>
      </div>
      <SwitchControl checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}

function SwitchControl({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 38,
        height: 22,
        borderRadius: 999,
        border: "none",
        background: checked ? COLORS.accent : "rgba(255,255,255,0.14)",
        position: "relative",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.2s ease",
        padding: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s ease",
          boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
        }}
      />
    </button>
  );
}

function AllowanceSelector({
  value,
  onChange,
  disabled,
}: {
  value: TwinAllowance;
  onChange: (v: TwinAllowance) => void;
  disabled?: boolean;
}) {
  const options: { key: TwinAllowance; label: string; description: string }[] = [
    { key: "strict", label: "Strict", description: "Acknowledge only." },
    { key: "casual", label: "Casual", description: "Light back-and-forth." },
    { key: "autonomous", label: "Autonomous", description: "Acts like you." },
  ];
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.03)",
        border: COLORS.chipBorder,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <ShieldCheck size={14} color={COLORS.accent} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Allowance</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {options.map((o) => {
          const active = o.key === value;
          return (
            <button
              type="button"
              key={o.key}
              disabled={disabled}
              onClick={() => onChange(o.key)}
              style={{
                padding: "8px",
                borderRadius: 8,
                border: active
                  ? `1px solid ${COLORS.accent}`
                  : "1px solid rgba(255,255,255,0.08)",
                background: active ? COLORS.accentDim : "rgba(255,255,255,0.02)",
                color: active ? "#fff" : "#d4d4dc",
                fontSize: 11.5,
                fontWeight: 600,
                cursor: disabled ? "not-allowed" : "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 2,
                alignItems: "flex-start",
                textAlign: "left",
              }}
            >
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                {active && <Check size={12} />}
                {o.label}
              </span>
              <span style={{ fontSize: 10, color: COLORS.muted, fontWeight: 500 }}>
                {o.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChattinessSlider({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.03)",
        border: COLORS.chipBorder,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <BarChart3 size={14} color={COLORS.accent} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Chattiness</span>
        </div>
        <span style={{ fontSize: 11, color: COLORS.muted }}>{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        style={{ width: "100%", accentColor: COLORS.accent }}
        aria-label="Chattiness"
      />
    </div>
  );
}

function VoiceLabel({ voiceId }: { voiceId?: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.03)",
        border: COLORS.chipBorder,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Volume2 size={14} color={COLORS.accent} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Voice clone</div>
        <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
          {voiceId ? `Active voice: ${voiceId}` : "No voice clone configured."}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant: "neutral" | "danger";
}) {
  const isDanger = variant === "danger";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 12px",
        borderRadius: 10,
        border: isDanger
          ? "1px solid rgba(239,68,68,0.45)"
          : "1px solid rgba(255,255,255,0.1)",
        background: isDanger ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.04)",
        color: isDanger ? "#fca5a5" : "#e5e5ea",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      {children}
    </button>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────

function Footer({ view }: { view: TwinProfileView }) {
  return (
    <div
      style={{
        marginTop: 18,
        paddingTop: 12,
        borderTop: "1px solid rgba(255,255,255,0.05)",
        display: "flex",
        justifyContent: "space-between",
        fontSize: 10.5,
        color: COLORS.muted,
      }}
    >
      <span>
        Schema v{view.schemaVersion} · {view.tokenCount.toLocaleString()} tokens analysed
      </span>
      <span>Updated {formatRelativeTime(view.updatedAt)}</span>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function EmptyHint({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: 12,
        color: COLORS.muted,
        fontStyle: "italic",
      }}
    >
      {text}
    </div>
  );
}

function peakHour(values: number[]): string {
  if (!values.length) return "—";
  let maxIdx = 0;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] ?? 0;
    if (v > max) {
      max = v;
      maxIdx = i;
    }
  }
  if (max <= 0) return "—";
  const pad = (n: number) => n.toString().padStart(2, "0");
  const next = (maxIdx + 1) % 24;
  return `${pad(maxIdx)}:00–${pad(next)}:00`;
}

function formatRelativeTime(epochMs: number): string {
  if (!epochMs || !Number.isFinite(epochMs)) return "—";
  const deltaMs = Date.now() - epochMs;
  if (deltaMs < 0) return "just now";
  const sec = Math.floor(deltaMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(mo / 12);
  return `${yr}y ago`;
}
