"use client";

import { DeliveryStatusBadge, MessageReactions } from "@/components/MessageMeta";
import type { MessageStatus } from "@/lib/db";
import type { ReadReceiptMode } from "@/lib/useFrontendPreferences";

export interface HandoffPreview {
  text: string;
  targetLabel: string;
  status: MessageStatus;
  timestamp: number;
}

interface ConversationHandoffPanelProps {
  title: string;
  subtitle: string;
  preview: HandoffPreview;
  reactionsEnabled: boolean;
  readReceiptsEnabled: boolean;
  readReceiptMode?: ReadReceiptMode;
  compactLayout?: boolean;
  accent?: string;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ConversationHandoffPanel({
  title,
  subtitle,
  preview,
  reactionsEnabled,
  readReceiptsEnabled,
  readReceiptMode = "instant",
  compactLayout = false,
  accent = "#00a884",
}: ConversationHandoffPanelProps) {
  return (
    <div
      style={{
        borderRadius: 14,
        background: "rgba(11,20,26,0.84)",
        border: "1px solid rgba(255,255,255,0.14)",
        backdropFilter: "blur(14px)",
        padding: compactLayout ? "9px 10px" : "10px 11px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.32)",
      }}
    >
      <div style={{ fontSize: 10.5, color: accent, fontWeight: 700, letterSpacing: "0.05em" }}>
        {title.toUpperCase()}
      </div>
      <div style={{ marginTop: 2, fontSize: 11.5, color: "#aebac1", lineHeight: 1.4 }}>{subtitle}</div>

      <div
        style={{
          marginTop: compactLayout ? 6 : 8,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(32,44,51,0.82)",
          padding: compactLayout ? "7px 8px" : "8px 9px",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#e9edef",
            fontSize: compactLayout ? 12.5 : 13,
            lineHeight: 1.42,
            fontFamily: "-apple-system, sans-serif",
            wordBreak: "break-word",
          }}
        >
          {preview.text}
        </p>
        {reactionsEnabled && (
          <div style={{ marginTop: compactLayout ? 4 : 6 }}>
            <MessageReactions align="left" enabled={reactionsEnabled} />
          </div>
        )}
        <div
          style={{
            marginTop: compactLayout ? 4 : 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              color: "#8696a0",
              fontSize: 11,
              fontFamily: "-apple-system, sans-serif",
              whiteSpace: "nowrap",
            }}
          >
            {preview.targetLabel} - {formatTime(preview.timestamp)}
          </span>
          <DeliveryStatusBadge
            status={preview.status}
            readReceiptsEnabled={readReceiptsEnabled}
            readReceiptMode={readReceiptMode}
          />
        </div>
      </div>
    </div>
  );
}

