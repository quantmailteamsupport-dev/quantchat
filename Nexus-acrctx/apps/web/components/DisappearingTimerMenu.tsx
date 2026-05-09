"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ═══════════════════════════════════════════════════════════════
// DisappearingTimerMenu
// ═══════════════════════════════════════════════════════════════
//
// Per-conversation "disappearing messages" TTL selector, styled to
// match the rest of ChatInput's glassmorphic dark UI.
//
// • Off (null)  • 30s  • 5m  • 1h  • 24h  • 7d  • 30d
//
// Ranges are the canonical presets; any value in [10s, 30d] is
// accepted by the backend's normalizeTtlSecs().
// ═══════════════════════════════════════════════════════════════

export interface DisappearingTimerMenuProps {
  /** Current TTL in seconds. null = disappearing OFF. */
  value: number | null;
  /** Called when the user picks a preset. */
  onChange: (ttlSecs: number | null) => void;
  disabled?: boolean;
}

const PRESETS: ReadonlyArray<{ label: string; value: number | null }> = [
  { label: "Off", value: null },
  { label: "30s", value: 30 },
  { label: "5 min", value: 5 * 60 },
  { label: "1 hour", value: 60 * 60 },
  { label: "24 hours", value: 24 * 60 * 60 },
  { label: "7 days", value: 7 * 24 * 60 * 60 },
  { label: "30 days", value: 30 * 24 * 60 * 60 },
];

export function formatTtl(ttlSecs: number | null | undefined): string {
  if (ttlSecs == null) return "Off";
  if (ttlSecs < 60) return `${ttlSecs}s`;
  if (ttlSecs < 3600) return `${Math.round(ttlSecs / 60)}m`;
  if (ttlSecs < 86_400) return `${Math.round(ttlSecs / 3600)}h`;
  return `${Math.round(ttlSecs / 86_400)}d`;
}

export default function DisappearingTimerMenu({ value, onChange, disabled }: DisappearingTimerMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = value != null;

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (ev: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(ev.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const accent = "#ff8a00"; // 🔥 tone — signals ephemerality
  const label = active ? formatTtl(value) : "Off";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Disappearing message timer"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={{
          background: active ? `${accent}1a` : "none",
          border: active ? `1px solid ${accent}55` : "none",
          borderRadius: 999,
          cursor: disabled ? "not-allowed" : "pointer",
          padding: active ? "2px 8px 2px 6px" : "4px 0",
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 12,
          lineHeight: 1,
          color: active ? accent : "#8696a0",
          fontFamily: "Inter, -apple-system, sans-serif",
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>{active ? "🔥" : "⏱️"}</span>
        {active && <span style={{ fontWeight: 600 }}>{label}</span>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.12 }}
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              left: 0,
              background: "rgba(17,27,33,0.96)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: 4,
              minWidth: 140,
              boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
              zIndex: 30,
              fontFamily: "Inter, -apple-system, sans-serif",
            }}
          >
            <div style={{ padding: "6px 10px 4px", fontSize: 10.5, color: "#8696a0", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Disappearing
            </div>
            {PRESETS.map((preset) => {
              const isSelected = preset.value === value;
              return (
                <button
                  key={preset.label}
                  role="menuitemradio"
                  aria-checked={isSelected}
                  onClick={() => {
                    onChange(preset.value);
                    setOpen(false);
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: isSelected ? `${accent}22` : "transparent",
                    color: isSelected ? accent : "#e9edef",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    padding: "7px 10px",
                    fontSize: 13,
                    fontFamily: "Inter, -apple-system, sans-serif",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{preset.label}</span>
                  {isSelected && <span style={{ fontSize: 12 }}>✓</span>}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
