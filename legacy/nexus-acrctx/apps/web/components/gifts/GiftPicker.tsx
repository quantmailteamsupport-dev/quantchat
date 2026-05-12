"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState, type ReactElement } from "react";
import type {
  GiftBalance,
  GiftCatalogEntry,
  GiftErrorEvent,
  SendGiftArgs,
} from "../../lib/gifts/useGiftSocket";

// ═══════════════════════════════════════════════════════════════
// GiftPicker
// ═══════════════════════════════════════════════════════════════
//
// Modal UI for choosing and sending a gift. Designed for:
//   • clear price display — no hidden costs
//   • an explicit "Send" confirmation — the click that moves tokens
//     is the same click the user sees labeled "Send {Gift} — {N} tokens"
//   • graceful degradation when the balance is too low: the Send
//     button becomes a "Not enough tokens" label rather than an
//     upsell dialog (we do not surface paid top-up flow from here)
//   • no reciprocity guilt: this picker knows nothing about whether
//     the user "owes" anyone a gift
//
// Framer Motion is used sparingly — 150ms ease transitions on
// selection/dialog, no auto-playing hype animations.
// ═══════════════════════════════════════════════════════════════

export interface GiftPickerProps {
  open: boolean;
  onClose: () => void;
  catalog: GiftCatalogEntry[];
  balance: GiftBalance | null;
  recipientId: string;
  recipientDisplayName?: string;
  callId?: string;
  conversationId?: string;
  onSend: (args: SendGiftArgs) => Promise<void>;
  /** Last server-side error (so we can render a friendly message) */
  lastError?: GiftErrorEvent | null;
  onClearError?: () => void;
}

const NOTE_MAX = 140;

export function GiftPicker(props: GiftPickerProps): ReactElement | null {
  const {
    open,
    onClose,
    catalog,
    balance,
    recipientId,
    recipientDisplayName,
    callId,
    conversationId,
    onSend,
    lastError,
    onClearError,
  } = props;

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const selected = useMemo(
    () => catalog.find((g) => g.slug === selectedSlug) ?? null,
    [catalog, selectedSlug],
  );

  const availableBalance = balance?.balance ?? 0;
  const canAfford = selected ? availableBalance >= selected.costTokens : false;

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="gift-picker-backdrop"
        className="gift-picker-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(8, 8, 20, 0.6)",
          backdropFilter: "blur(6px)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onClick={onClose}
      >
        <motion.div
          key="gift-picker-panel"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Send a gift"
          style={{
            width: "min(560px, 92vw)",
            maxHeight: "86vh",
            overflow: "auto",
            background: "linear-gradient(180deg, #111827 0%, #0b0f1d 100%)",
            border: "1px solid #1f2937",
            borderRadius: 16,
            padding: 20,
            color: "#e5e7eb",
            boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                Send a gift
                {recipientDisplayName ? (
                  <span style={{ color: "#9ca3af", fontWeight: 400 }}> to {recipientDisplayName}</span>
                ) : null}
              </h2>
              <p style={{ margin: "4px 0 0", color: "#9ca3af", fontSize: 13 }}>
                Gifts are optional. They cost tokens from your balance.
              </p>
            </div>
            <div
              aria-label="Your token balance"
              style={{
                background: "#111827",
                border: "1px solid #1f2937",
                borderRadius: 10,
                padding: "6px 10px",
                fontSize: 13,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <strong>{availableBalance}</strong>{" "}
              <span style={{ color: "#9ca3af" }}>tokens</span>
            </div>
          </header>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
              gap: 10,
            }}
          >
            {catalog.map((g) => {
              const isSelected = g.slug === selectedSlug;
              const affordable = availableBalance >= g.costTokens;
              return (
                <button
                  key={g.slug}
                  type="button"
                  onClick={() => setSelectedSlug(g.slug)}
                  aria-pressed={isSelected}
                  disabled={!affordable}
                  style={{
                    position: "relative",
                    background: isSelected ? "#1e293b" : "#0f172a",
                    border: isSelected ? "1px solid #60a5fa" : "1px solid #1f2937",
                    borderRadius: 12,
                    padding: 12,
                    color: "#e5e7eb",
                    textAlign: "left",
                    cursor: affordable ? "pointer" : "not-allowed",
                    opacity: affordable ? 1 : 0.5,
                    transition: "border-color 120ms ease, background 120ms ease",
                  }}
                >
                  <div
                    aria-hidden
                    style={{
                      width: "100%",
                      height: 64,
                      borderRadius: 8,
                      background: `linear-gradient(135deg, ${g.palette[0] ?? "#374151"}, ${g.palette[1] ?? "#111827"})`,
                      marginBottom: 8,
                    }}
                  />
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{g.displayName}</div>
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 12,
                      color: "#9ca3af",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {g.costTokens} tokens
                  </div>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div style={{ marginTop: 16 }}>
              <label
                htmlFor="gift-note"
                style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#d1d5db" }}
              >
                Optional note <span style={{ color: "#6b7280" }}>({NOTE_MAX} max)</span>
              </label>
              <textarea
                id="gift-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                rows={2}
                placeholder="Say something kind…"
                style={{
                  width: "100%",
                  background: "#0b1220",
                  border: "1px solid #1f2937",
                  borderRadius: 8,
                  padding: 8,
                  color: "#e5e7eb",
                  fontFamily: "inherit",
                  fontSize: 14,
                  resize: "vertical",
                }}
              />
            </div>
          ) : null}

          {lastError ? (
            <div
              role="alert"
              onClick={onClearError}
              style={{
                marginTop: 12,
                padding: 10,
                borderRadius: 8,
                background: "#3f1d1d",
                border: "1px solid #7f1d1d",
                color: "#fecaca",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {renderErrorMessage(lastError)}
            </div>
          ) : null}

          <footer
            style={{
              marginTop: 16,
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "1px solid #1f2937",
                borderRadius: 8,
                padding: "8px 14px",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selected || !canAfford || sending}
              onClick={async () => {
                if (!selected || !canAfford) return;
                setSending(true);
                try {
                  await onSend({
                    recipientId,
                    giftSlug: selected.slug,
                    note: note.trim() || undefined,
                    callId,
                    conversationId,
                  });
                  setSelectedSlug(null);
                  setNote("");
                  onClose();
                } finally {
                  setSending(false);
                }
              }}
              style={{
                background: selected && canAfford ? "#2563eb" : "#1f2937",
                border: "none",
                borderRadius: 8,
                padding: "8px 14px",
                color: "#f9fafb",
                cursor: selected && canAfford && !sending ? "pointer" : "not-allowed",
                fontWeight: 600,
              }}
            >
              {sending
                ? "Sending…"
                : selected
                  ? canAfford
                    ? `Send ${selected.displayName} — ${selected.costTokens} tokens`
                    : "Not enough tokens"
                  : "Pick a gift"}
            </button>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function renderErrorMessage(err: GiftErrorEvent): string {
  switch (err.code) {
    case "recipient_refuses_gifts":
      return "This person has chosen not to receive gifts. Your tokens were not spent.";
    case "self_gift":
      return "You can't send a gift to yourself.";
    case "rate_limited":
      return err.scope === "recipient"
        ? "You've sent a lot of gifts to this person recently. Try again in an hour."
        : "You're sending gifts very quickly. Take a breather — this is to prevent spam.";
    case "insufficient_balance":
      return `You need ${err.required ?? "more"} tokens. You have ${err.available ?? 0}.`;
    case "gift_not_found":
      return "That gift is no longer available.";
    case "invalid_payload":
    case "invalid_amount":
      return "Something about that request was invalid. Please try again.";
    case "internal":
    default:
      return "A temporary server error prevented this gift from being sent. Your tokens were not spent.";
  }
}

export default GiftPicker;
