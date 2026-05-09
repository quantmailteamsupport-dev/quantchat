"use client";

import { useState } from "react";
import type { MessageStatus } from "@/lib/db";
import type { ReadReceiptMode } from "@/lib/useFrontendPreferences";

type ReactionKey = "heart" | "thumbsUp" | "laugh";
type Align = "left" | "right";

const REACTION_OPTIONS: Array<{ key: ReactionKey; emoji: string; label: string }> = [
  { key: "heart", emoji: "❤️", label: "Love" },
  { key: "thumbsUp", emoji: "👍", label: "Like" },
  { key: "laugh", emoji: "😂", label: "Funny" },
];

const STATUS_META: Record<MessageStatus, { icon: string; label: string; color: string }> = {
  sending: { icon: "•", label: "Sending", color: "rgba(233,237,239,0.45)" },
  failed: { icon: "x", label: "Failed", color: "#ff5722" },
  sent: { icon: "✓", label: "Sent", color: "rgba(233,237,239,0.58)" },
  delivered: { icon: "✓✓", label: "Delivered", color: "rgba(233,237,239,0.58)" },
  read: { icon: "✓✓", label: "Read", color: "#53bdeb" },
};

interface ReactionState {
  selected: ReactionKey | null;
  counts: Record<ReactionKey, number>;
}

const INITIAL_REACTIONS: ReactionState = {
  selected: null,
  counts: {
    heart: 0,
    thumbsUp: 0,
    laugh: 0,
  },
};

export function MessageReactions({
  align = "left",
  enabled = true,
}: {
  align?: Align;
  enabled?: boolean;
}) {
  const [state, setState] = useState<ReactionState>(INITIAL_REACTIONS);

  if (!enabled) return null;

  const handleToggle = (reaction: ReactionKey) => {
    setState((current) => {
      const nextCounts = { ...current.counts };

      if (current.selected === reaction) {
        nextCounts[reaction] = Math.max(0, nextCounts[reaction] - 1);
        return { selected: null, counts: nextCounts };
      }

      if (current.selected) {
        nextCounts[current.selected] = Math.max(0, nextCounts[current.selected] - 1);
      }

      nextCounts[reaction] += 1;
      return { selected: reaction, counts: nextCounts };
    });
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: align === "right" ? "flex-end" : "flex-start",
        gap: 6,
        flexWrap: "wrap",
      }}
    >
      {REACTION_OPTIONS.map((reaction) => {
        const isActive = state.selected === reaction.key;
        const count = state.counts[reaction.key];

        return (
          <button
            key={reaction.key}
            type="button"
            aria-label={`React with ${reaction.label}`}
            onClick={() => handleToggle(reaction.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              borderRadius: 999,
              border: isActive ? "1px solid rgba(83,189,235,0.75)" : "1px solid rgba(255,255,255,0.14)",
              background: isActive ? "rgba(83,189,235,0.2)" : "rgba(0,0,0,0.14)",
              color: "#e9edef",
              padding: "2px 7px",
              fontSize: 11,
              lineHeight: 1.2,
              cursor: "pointer",
              fontFamily: "-apple-system, sans-serif",
            }}
          >
            <span>{reaction.emoji}</span>
            {count > 0 && <span style={{ fontWeight: 700 }}>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function DeliveryStatusBadge({
  status,
  labelOverride,
  readReceiptsEnabled = true,
  readReceiptMode = "instant",
}: {
  status: MessageStatus;
  labelOverride?: string;
  readReceiptsEnabled?: boolean;
  readReceiptMode?: ReadReceiptMode;
}) {
  const effectiveStatus = !readReceiptsEnabled && status === "read" ? "delivered" : status;
  const meta = STATUS_META[effectiveStatus];
  const modeLabel = readReceiptMode === "delayed" ? "Delayed" : readReceiptMode === "batch" ? "Batch" : "Instant";

  let effectiveLabel = readReceiptsEnabled ? labelOverride : undefined;
  if (!effectiveLabel && readReceiptsEnabled && readReceiptMode !== "instant") {
    if (effectiveStatus === "read") {
      effectiveLabel = `Read (${modeLabel})`;
    } else if (effectiveStatus === "delivered") {
      effectiveLabel = `Delivered (${modeLabel})`;
    }
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        color: meta.color,
        fontSize: 10.5,
        fontFamily: "-apple-system, sans-serif",
        whiteSpace: "nowrap",
      }}
      aria-label={effectiveLabel ?? meta.label}
    >
      <span>{meta.icon}</span>
      <span>{effectiveLabel ?? meta.label}</span>
    </span>
  );
}
