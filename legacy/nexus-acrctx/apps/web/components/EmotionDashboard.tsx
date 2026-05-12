"use client";

/**
 * components/EmotionDashboard.tsx
 *
 * Optional "Mood Journal" dashboard surfaced from settings. Shows the
 * user:
 *   1. What the detector thinks they're feeling right now and why.
 *   2. A rolling history of detected emotions over this session.
 *   3. A manual override picker so they can force any palette.
 *   4. A privacy notice making clear nothing leaves the device.
 *
 * The dashboard is a pure consumer of the singleton services — it never
 * mutates the detector buffer, only reads estimates and writes overrides.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ALL_EMOTIONS,
  getAdaptiveThemeEngine,
  getEmotionDetectionService,
  getMicroAnimationLibrary,
  paletteFor,
  type Emotion,
  type EmotionEstimate,
  type EmotionPalette,
} from "../lib/emotion";

// ─── Session-scoped history store ─────────────────────────────────────────

interface HistoryEntry {
  at: number;
  emotion: Emotion;
  confidence: number;
}

/** Upper bound on how many data points we keep in the rolling journal. */
const MAX_HISTORY = 240;

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatRelative(ts: number): string {
  const delta = Math.max(0, Date.now() - ts);
  const s = Math.floor(delta / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

// ─── UI atoms ─────────────────────────────────────────────────────────────

function ConfidenceBar({
  value,
  color,
}: {
  value: number;
  color: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      style={{
        height: 6,
        width: "100%",
        borderRadius: 4,
        background: "var(--emotion-surface, rgba(255,255,255,0.08))",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          transition:
            "width var(--emotion-duration, 240ms) var(--emotion-easing, ease)",
        }}
      />
    </div>
  );
}

function EmotionChip({
  palette,
  active,
  onClick,
}: {
  palette: EmotionPalette;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-animate="tap"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        borderRadius: "var(--emotion-radius-pill, 9999px)",
        border: `1.5px solid ${active ? palette.accent : palette.border}`,
        background: active ? palette.accentGradient : palette.surface,
        color: active ? palette.textInverse : palette.textPrimary,
        fontFamily: "Inter, -apple-system, sans-serif",
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        boxShadow: active ? palette.shadowMd : "none",
        transition:
          "background var(--emotion-duration, 240ms) ease, color var(--emotion-duration, 240ms) ease",
      }}
    >
      <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>
        {palette.icon}
      </span>
      <span>{palette.label}</span>
    </button>
  );
}

// ─── Timeline ────────────────────────────────────────────────────────────

function Timeline({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <div
        style={{
          padding: "18px 0",
          fontSize: 12,
          color: "var(--emotion-text-muted, #8696a0)",
          fontFamily: "Inter, sans-serif",
        }}
      >
        No mood data yet. Keep using the app — the first reading will appear
        shortly.
      </div>
    );
  }

  // Render a compact band where each cell is colored by that reading's emotion.
  const cellW = Math.max(3, Math.floor(320 / Math.max(1, history.length)));
  return (
    <div
      aria-label="Mood timeline"
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 1,
        height: 44,
        padding: "6px 0",
      }}
    >
      {history.map((h, i) => {
        const p = paletteFor(h.emotion);
        const height = 8 + Math.round(h.confidence * 32);
        return (
          <div
            key={`${h.at}-${i}`}
            title={`${p.label} · ${Math.round(h.confidence * 100)}% · ${formatTime(
              h.at,
            )}`}
            style={{
              width: cellW,
              height,
              borderRadius: 2,
              background: p.accent,
              opacity: 0.55 + 0.45 * h.confidence,
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Feature breakdown ───────────────────────────────────────────────────

function FeatureRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
        padding: "6px 0",
        borderBottom:
          "1px solid var(--emotion-divider, rgba(255,255,255,0.06))",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
      }}
    >
      <span style={{ color: "var(--emotion-text-secondary, #8696a0)" }}>
        {label}
      </span>
      <span
        style={{
          color: "var(--emotion-text, #e9edef)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function fmtNum(n: number | null, digits = 1): string {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

// ─── Dashboard component ─────────────────────────────────────────────────

export interface EmotionDashboardProps {
  /** Called when the user dismisses the dashboard. Optional. */
  onClose?: () => void;
  /** Compact mode hides the feature breakdown table. */
  compact?: boolean;
}

export default function EmotionDashboard({
  onClose,
  compact = false,
}: EmotionDashboardProps) {
  const detector = useMemo(() => getEmotionDetectionService(), []);
  const theme = useMemo(() => getAdaptiveThemeEngine(), []);
  const animations = useMemo(() => getMicroAnimationLibrary(), []);

  const [estimate, setEstimate] = useState<EmotionEstimate | null>(() =>
    detector.current(),
  );
  const [override, setOverride] = useState<Emotion | null>(() =>
    theme.getManualOverride(),
  );
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const lastEmotionRef = useRef<Emotion | null>(null);

  // Subscribe to detector updates, push into history (dedup by emotion).
  useEffect(() => {
    const unsub = detector.subscribe((e) => {
      setEstimate(e);
      if (lastEmotionRef.current !== e.emotion) {
        lastEmotionRef.current = e.emotion;
        setHistory((prev) => {
          const next = [
            ...prev,
            { at: e.at, emotion: e.emotion, confidence: e.confidence },
          ];
          if (next.length > MAX_HISTORY) next.splice(0, next.length - MAX_HISTORY);
          return next;
        });
      } else if (history.length > 0) {
        // Same emotion: just update the confidence of the most recent slot.
        setHistory((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1]!;
          if (Math.abs(last.confidence - e.confidence) < 0.02) return prev;
          const next = prev.slice();
          next[next.length - 1] = { ...last, confidence: e.confidence, at: e.at };
          return next;
        });
      }
    });
    return () => {
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detector]);

  const handleOverride = useCallback(
    (emotion: Emotion | null) => {
      setOverride(emotion);
      theme.setManualOverride(emotion);
      animations.setEmotion(emotion ?? estimate?.emotion ?? "neutral");
    },
    [theme, animations, estimate?.emotion],
  );

  const current = override ?? estimate?.emotion ?? "neutral";
  const palette = paletteFor(current);
  const scores = estimate?.scores;
  const features = estimate?.features;

  return (
    <section
      role="dialog"
      aria-label="Mood Journal"
      data-animate="enter"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        padding: 20,
        borderRadius: "var(--emotion-radius-lg, 20px)",
        background: "var(--emotion-bg-gradient, #111b21)",
        border: "1px solid var(--emotion-border, rgba(255,255,255,0.09))",
        color: "var(--emotion-text, #e9edef)",
        boxShadow: "var(--emotion-shadow-lg, 0 16px 32px rgba(0,0,0,0.45))",
        maxWidth: 520,
        width: "100%",
        fontFamily: "Inter, -apple-system, sans-serif",
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--emotion-text-muted, #667781)",
            }}
          >
            Mood Journal
          </span>
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: "var(--emotion-text, #e9edef)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span aria-hidden style={{ fontSize: 26 }}>
              {palette.icon}
            </span>
            {palette.label}
            {override !== null && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: palette.accent,
                  color: palette.textInverse,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                Manual
              </span>
            )}
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "var(--emotion-text-secondary, #8696a0)",
            }}
          >
            {palette.description}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close mood journal"
            data-animate="tap"
            style={{
              background: "none",
              border: "none",
              color: "var(--emotion-text-muted, #8696a0)",
              fontSize: 20,
              cursor: "pointer",
              padding: 4,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </header>

      {/* ── Current confidence ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            color: "var(--emotion-text-secondary, #8696a0)",
          }}
        >
          <span>Confidence</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {estimate ? `${Math.round(estimate.confidence * 100)}%` : "—"}
          </span>
        </div>
        <ConfidenceBar
          value={estimate?.confidence ?? 0}
          color={palette.accent}
        />
        {estimate && (
          <div
            style={{
              fontSize: 11,
              color: "var(--emotion-text-muted, #667781)",
            }}
          >
            Last reading {formatRelative(estimate.at)}
          </div>
        )}
      </div>

      {/* ── Per-emotion scores ── */}
      {scores && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--emotion-text-muted, #667781)",
            }}
          >
            Breakdown
          </div>
          {ALL_EMOTIONS.map((e) => {
            const p = paletteFor(e);
            const s = scores[e] ?? 0;
            return (
              <div
                key={e}
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr 42px",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 12 }}>
                  <span aria-hidden style={{ marginRight: 6 }}>
                    {p.icon}
                  </span>
                  {p.label}
                </span>
                <ConfidenceBar value={s} color={p.accent} />
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--emotion-text-muted, #667781)",
                    fontVariantNumeric: "tabular-nums",
                    textAlign: "right",
                  }}
                >
                  {Math.round(s * 100)}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Override picker ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--emotion-text-muted, #667781)",
          }}
        >
          Override
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {ALL_EMOTIONS.map((e) => (
            <EmotionChip
              key={e}
              palette={paletteFor(e)}
              active={override === e}
              onClick={() => handleOverride(override === e ? null : e)}
            />
          ))}
          {override !== null && (
            <button
              type="button"
              data-animate="tap"
              onClick={() => handleOverride(null)}
              style={{
                padding: "8px 14px",
                borderRadius: "var(--emotion-radius-pill, 9999px)",
                border: "1px dashed var(--emotion-border, rgba(255,255,255,0.2))",
                background: "transparent",
                color: "var(--emotion-text-secondary, #8696a0)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Clear override
            </button>
          )}
        </div>
      </div>

      {/* ── Timeline ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--emotion-text-muted, #667781)",
          }}
        >
          Timeline
        </div>
        <Timeline history={history} />
      </div>

      {/* ── Feature breakdown ── */}
      {!compact && features && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--emotion-text-muted, #667781)",
              marginBottom: 4,
            }}
          >
            Signals
          </div>
          <FeatureRow
            label="Typing median"
            value={
              features.typingIntervalMedianMs === null
                ? "—"
                : `${fmtNum(features.typingIntervalMedianMs, 0)} ms`
            }
          />
          <FeatureRow
            label="Typing variability"
            value={
              features.typingIntervalStdMs === null
                ? "—"
                : `${fmtNum(features.typingIntervalStdMs, 0)} ms`
            }
          />
          <FeatureRow
            label="Keystrokes / min"
            value={fmtNum(features.keystrokesPerMinute, 0)}
          />
          <FeatureRow
            label="Backspace ratio"
            value={`${fmtNum(features.backspaceRatio * 100, 0)}%`}
          />
          <FeatureRow
            label="Caps ratio"
            value={`${fmtNum(features.capsRatio * 100, 0)}%`}
          />
          <FeatureRow
            label="Sentiment"
            value={fmtNum(features.sentiment, 2)}
          />
          <FeatureRow
            label="Positive emoji / 100 chars"
            value={fmtNum(features.positiveEmojiRate, 2)}
          />
          <FeatureRow
            label="Negative emoji / 100 chars"
            value={fmtNum(features.negativeEmojiRate, 2)}
          />
          <FeatureRow
            label="Tap erraticism"
            value={fmtNum(features.tapErraticism, 2)}
          />
          <FeatureRow
            label="Messages this session"
            value={String(features.messagesSent)}
          />
        </div>
      )}

      {/* ── Privacy notice ── */}
      <footer
        aria-label="Privacy notice"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: 12,
          borderRadius: "var(--emotion-radius-md, 14px)",
          background: "var(--emotion-surface, rgba(255,255,255,0.04))",
          border: "1px solid var(--emotion-border, rgba(255,255,255,0.09))",
        }}
      >
        <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
          🔒
        </span>
        <div
          style={{
            fontSize: 11.5,
            lineHeight: 1.55,
            color: "var(--emotion-text-secondary, #8696a0)",
          }}
        >
          <strong style={{ color: "var(--emotion-text, #e9edef)" }}>
            100% on-device.
          </strong>{" "}
          Your emotion readings are inferred locally and never uploaded,
          logged, or shared. Closing this dashboard or clearing your session
          wipes every stored signal.
        </div>
      </footer>
    </section>
  );
}
