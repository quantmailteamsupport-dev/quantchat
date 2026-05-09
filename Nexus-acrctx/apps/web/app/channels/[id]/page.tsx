"use client";

/**
 * app/channels/[id]/page.tsx
 *
 * Smart Contextual Group Chat — Family / School / Work
 *
 * Features:
 *   - "Highlights" bar — AI-pinned important items (Homework, Events, Bills)
 *   - "Background Noise" collapsible section for spam (Good Morning forwards)
 *   - Group type detection (family | school | work | default)
 *   - Rich glassmorphic group header with member avatars
 *   - Full chat message list with AI annotations
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { DeliveryStatusBadge, MessageReactions } from "@/components/MessageMeta";
import SpoilerShieldText, { encodeSpoilerShieldText, type SpoilerShieldMode } from "@/components/SpoilerShieldText";
import SurfaceSwitchRail from "@/components/SurfaceSwitchRail";
import type { MessageStatus } from "@/lib/db";
import { useFrontendPreferences, type ReadReceiptMode } from "@/lib/useFrontendPreferences";

// ── Types ─────────────────────────────────────────────────────
type GroupType = "family" | "school" | "work" | "default";

interface GroupMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  senderLetter: string;
  text: string;
  ts: number;
  isNoise?: boolean;
  highlight?: { type: string; label: string; accent: string };
  viewOnce?: boolean;
  deliveryStatus?: MessageStatus;
  readByCount?: number;
}

interface Highlight {
  id: string;
  icon: string;
  title: string;
  detail: string;
  accent: string;
  type: string;
}

interface GroupInfo {
  id: string;
  name: string;
  type: GroupType;
  memberCount: number;
  description: string;
  members: Array<{ id: string; letter: string; color: string; name: string }>;
}

// ── Mock group data ────────────────────────────────────────────
const GROUPS: Record<string, GroupInfo> = {
  family: {
    id: "family",
    name: "🏠 Kumar Family",
    type: "family",
    memberCount: 8,
    description: "Family group • 8 members",
    members: [
      { id: "m1", letter: "P", color: "#6d4aff", name: "Papa" },
      { id: "m2", letter: "M", color: "#e91e8c", name: "Mummy" },
      { id: "m3", letter: "K", color: "#00a884", name: "Kundan" },
      { id: "m4", letter: "S", color: "#0288b0", name: "Sunita" },
    ],
  },
  school: {
    id: "school",
    name: "📚 CS Batch 2025",
    type: "school",
    memberCount: 47,
    description: "Class group • 47 students",
    members: [
      { id: "m1", letter: "A", color: "#6d4aff", name: "Aryan" },
      { id: "m2", letter: "P", color: "#e91e8c", name: "Priya" },
      { id: "m3", letter: "R", color: "#ff6b35", name: "Rahul" },
      { id: "m4", letter: "N", color: "#0288b0", name: "Noor" },
    ],
  },
  work: {
    id: "work",
    name: "💼 Quant Dev Team",
    type: "work",
    memberCount: 12,
    description: "Work group • 12 members",
    members: [
      { id: "m1", letter: "C", color: "#bf5af2", name: "CEO" },
      { id: "m2", letter: "D", color: "#00f5ff", name: "Dev Lead" },
      { id: "m3", letter: "U", color: "#ff6b35", name: "UX" },
      { id: "m4", letter: "Q", color: "#00a884", name: "QA" },
    ],
  },
};

const GROUP_MESSAGES: Record<string, GroupMessage[]> = {
  family: [
    { id: "gm1", senderId: "m2", senderName: "Mummy", senderColor: "#e91e8c", senderLetter: "M", text: "Good morning everyone! 🌞🙏", ts: Date.now() - 7200000, isNoise: true },
    { id: "gm2", senderId: "m4", senderName: "Sunita", senderColor: "#0288b0", senderLetter: "S", text: "Good morning didi 😊", ts: Date.now() - 7100000, isNoise: true },
    { id: "gm3", senderId: "m1", senderName: "Papa", senderColor: "#6d4aff", senderLetter: "P", text: "Reminder: Dada's birthday party is this Sunday at 6 PM. Everyone must come! 🎂", ts: Date.now() - 3600000, highlight: { type: "event", label: "📅 Event", accent: "#6d4aff" } },
    { id: "gm4", senderId: "m2", senderName: "Mummy", senderColor: "#e91e8c", senderLetter: "M", text: "Electricity bill of ₹2,840 is due by 15th. Kundan please pay online.", ts: Date.now() - 1800000, highlight: { type: "bill", label: "💸 Bill Due", accent: "#ff5722" } },
    { id: "gm5", senderId: "m3", senderName: "Kundan", senderColor: "#00a884", senderLetter: "K", text: "Okay mummy, will pay today evening ✓", ts: Date.now() - 900000 },
    { id: "gm6", senderId: "m4", senderName: "Sunita", senderColor: "#0288b0", senderLetter: "S", text: "Good night 🌙", ts: Date.now() - 500000, isNoise: true },
  ],
  school: [
    { id: "gm1", senderId: "m1", senderName: "Aryan", senderColor: "#6d4aff", senderLetter: "A", text: "Good morning class! 🙏", ts: Date.now() - 8200000, isNoise: true },
    { id: "gm2", senderId: "m2", senderName: "Priya", senderColor: "#e91e8c", senderLetter: "P", text: "GM bro 😊", ts: Date.now() - 8100000, isNoise: true },
    { id: "gm3", senderId: "m3", senderName: "Rahul", senderColor: "#ff6b35", senderLetter: "R", text: "DATA STRUCTURES assignment submission deadline is TOMORROW 11:59 PM. Upload on portal!", ts: Date.now() - 4600000, highlight: { type: "homework", label: "📝 Homework Due", accent: "#ffc107" } },
    { id: "gm4", senderId: "m4", senderName: "Noor", senderColor: "#0288b0", senderLetter: "N", text: "Unit 4 exam on Friday — chapters 7-12. Practice trees and graphs!", ts: Date.now() - 2800000, highlight: { type: "exam", label: "📖 Exam Alert", accent: "#ff5722" } },
    { id: "gm5", senderId: "m1", senderName: "Aryan", senderColor: "#6d4aff", senderLetter: "A", text: "Does anyone have notes for chapter 9?", ts: Date.now() - 900000 },
    { id: "gm6", senderId: "m2", senderName: "Priya", senderColor: "#e91e8c", senderLetter: "P", text: "Sharing mine 📎", ts: Date.now() - 800000 },
  ],
  work: [
    { id: "gm1", senderId: "m1", senderName: "CEO", senderColor: "#bf5af2", senderLetter: "C", text: "Good morning team! Let's crush it today 🚀", ts: Date.now() - 6200000, isNoise: true },
    { id: "gm2", senderId: "m2", senderName: "Dev Lead", senderColor: "#00f5ff", senderLetter: "D", text: "SPRINT REVIEW today at 4 PM sharp. Please have your demos ready.", ts: Date.now() - 3600000, highlight: { type: "meeting", label: "📅 Meeting", accent: "#00f5ff" } },
    { id: "gm3", senderId: "m3", senderName: "UX", senderColor: "#ff6b35", senderLetter: "U", text: "Design system v3 is ready for review. Figma link: figma.com/quantchat-ds-v3", ts: Date.now() - 1800000, highlight: { type: "task", label: "✅ Action Item", accent: "#00a884" } },
    { id: "gm4", senderId: "m4", senderName: "QA", senderColor: "#00a884", senderLetter: "Q", text: "Good morning everyone! ☀️", ts: Date.now() - 1000000, isNoise: true },
    { id: "gm5", senderId: "m1", senderName: "CEO", senderColor: "#bf5af2", senderLetter: "C", text: "Deploy deadline for QuantFeed v2 is this FRIDAY. Critical priority! 🔴", ts: Date.now() - 600000, highlight: { type: "deadline", label: "🚨 Deadline", accent: "#ff5722" } },
  ],
};

function getHighlights(messages: GroupMessage[]): Highlight[] {
  return messages
    .filter((m) => m.highlight)
    .map((m) => {
      const parts = m.highlight!.label.split(" ");
      const icon = parts[0] ?? "📌";
      const title = parts.slice(1).join(" ");
      return {
        id: m.id,
        icon,
        title,
        detail: m.text,
        accent: m.highlight!.accent,
        type: m.highlight!.type,
      };
    });
}

// ── Group type accent colors ───────────────────────────────────
const TYPE_ACCENT: Record<GroupType, string> = {
  family: "#e91e8c",
  school: "#ffc107",
  work: "#00f5ff",
  default: "#6d4aff",
};

function formatReceiptMode(mode: ReadReceiptMode): string {
  if (mode === "delayed") return "Delayed";
  if (mode === "batch") return "Batch";
  return "Instant";
}

// ── Highlight Card ────────────────────────────────────────────
function HighlightCard({ item }: { item: Highlight }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      style={{
        flexShrink: 0,
        background: `${item.accent}12`,
        border: `1.5px solid ${item.accent}40`,
        borderRadius: 14,
        padding: "10px 14px",
        minWidth: 180,
        maxWidth: 220,
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2.5,
          background: item.accent,
          borderRadius: "14px 14px 0 0",
        }}
      />
      <div
        style={{
          fontSize: 11,
          color: item.accent,
          fontWeight: 700,
          marginBottom: 5,
          letterSpacing: "0.04em",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {item.icon} {item.title.toUpperCase()}
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: "#e9edef",
          lineHeight: 1.45,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {item.detail}
      </div>
    </motion.div>
  );
}

// ── Message Bubble ────────────────────────────────────────────
function GroupMessageBubble({
  msg,
  isNoise,
  showReactions,
  readReceiptsEnabled,
  readReceiptMode,
  compactLayout,
}: {
  msg: GroupMessage;
  isNoise?: boolean;
  showReactions: boolean;
  readReceiptsEnabled: boolean;
  readReceiptMode: ReadReceiptMode;
  compactLayout: boolean;
}) {
  const isMine = msg.senderId === "me";
  const receiptLabel =
    readReceiptsEnabled && msg.deliveryStatus === "read" && typeof msg.readByCount === "number"
      ? `Read by ${msg.readByCount}`
      : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isNoise ? 0.5 : 1, y: 0 }}
      style={{
        display: "flex",
        justifyContent: isMine ? "flex-end" : "flex-start",
        marginBottom: compactLayout ? 4 : 6,
        filter: isNoise ? "grayscale(30%)" : "none",
      }}
    >
      {!isMine && (
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: msg.senderColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            color: "#fff",
            flexShrink: 0,
            marginRight: 8,
          }}
        >
          {msg.senderLetter}
        </div>
      )}

      {/* Bubble */}
      <div style={{ maxWidth: compactLayout ? "82%" : "78%" }}>
        {!isMine && (
          <div
            style={{
              fontSize: 11,
              color: msg.senderColor,
              fontWeight: 600,
              marginBottom: 3,
              fontFamily: "-apple-system, sans-serif",
            }}
          >
            {msg.senderName}
          </div>
        )}
        <div
          style={{
            background: isMine ? "#005c4b" : "#202c33",
            borderRadius: isMine ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
            padding: compactLayout ? "6px 9px" : "8px 11px",
            position: "relative",
          }}
        >
          {msg.highlight && !isMine && (
            <div
              style={{
                position: "absolute",
                left: -3,
                top: 0,
                bottom: 0,
                width: 3,
                background: msg.highlight.accent,
                borderRadius: "3px 0 0 3px",
              }}
            />
          )}
          <SpoilerShieldText rawText={msg.text} compact={compactLayout} />
          {showReactions && (
            <div style={{ marginTop: compactLayout ? 4 : 6 }}>
              <MessageReactions align={isMine ? "right" : "left"} enabled={showReactions} />
            </div>
          )}
          <div
            style={{
              marginTop: compactLayout ? 3 : 4,
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 6,
            }}
          >
            {msg.highlight && (
              <span
                style={{
                  fontSize: 10,
                  color: msg.highlight.accent,
                  fontWeight: 700,
                  background: `${msg.highlight.accent}18`,
                  borderRadius: 6,
                  padding: "1px 6px",
                }}
              >
                {msg.highlight.label}
              </span>
            )}
            <span
              style={{
                color: "#8696a0",
                fontSize: 11,
                fontFamily: "-apple-system, sans-serif",
              }}
            >
              {new Date(msg.ts).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {isMine && (
              <DeliveryStatusBadge
                status={msg.deliveryStatus ?? "sent"}
                labelOverride={receiptLabel}
                readReceiptsEnabled={readReceiptsEnabled}
                readReceiptMode={readReceiptMode}
              />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function ChannelPage() {
  const params = useParams();
  const router = useRouter();
  const { preferences } = useFrontendPreferences();
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? "family");

  const group = useMemo(() => GROUPS[id as string] ?? GROUPS.family!, [id]);
  const allMessages = useMemo(() => GROUP_MESSAGES[id as string] ?? GROUP_MESSAGES.family!, [id]);
  const highlights = useMemo(() => getHighlights(allMessages), [allMessages]);
  const noiseMessages = useMemo(() => allMessages.filter((m) => m.isNoise), [allMessages]);
  const cleanMessages = useMemo(() => allMessages.filter((m) => !m.isNoise), [allMessages]);

  const [showNoise, setShowNoise] = useState(false);
  const [input, setInput] = useState("");
  const [spoilerShieldEnabled, setSpoilerShieldEnabled] = useState(false);
  const [spoilerShieldMode, setSpoilerShieldMode] = useState<SpoilerShieldMode>("auto");
  const [messages, setMessages] = useState<GroupMessage[]>(cleanMessages);
  const bottomRef = useRef<HTMLDivElement>(null);
  const accent = TYPE_ACCENT[group.type];
  const compactLayout = preferences.compactChatLayout;
  const callHref = `/call/${encodeURIComponent(group.id)}?name=${encodeURIComponent(group.name)}`;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setMessages(cleanMessages);
    setShowNoise(false);
  }, [cleanMessages]);

  function handleSend() {
    const baseText = input.trim();
    if (!baseText) return;

    const text = spoilerShieldEnabled
      ? encodeSpoilerShieldText(baseText, spoilerShieldMode)
      : baseText;
    const canShowReadReceipts = preferences.readReceiptsEnabled && preferences.readReceiptMode === "instant";
    const newMsg: GroupMessage = {
      id: `local-${Date.now()}`,
      senderId: "me",
      senderName: "You",
      senderColor: "#00a884",
      senderLetter: "Y",
      text,
      ts: Date.now(),
      deliveryStatus: canShowReadReceipts ? "read" : "delivered",
      readByCount: canShowReadReceipts ? Math.max(1, Math.min(group.memberCount - 1, 4)) : undefined,
    };
    setMessages((prev) => [...prev, newMsg]);
    setInput("");
    setSpoilerShieldEnabled(false);
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#111b21",
        fontFamily: "-apple-system, 'Segoe UI', sans-serif",
        color: "#e9edef",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#202c33",
          padding: "12px 14px 10px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderBottom: "1px solid #1f2c34",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => router.back()}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 20,
            color: "#aebac1",
            padding: 0,
          }}
        >
          ←
        </button>

        {/* Group avatar */}
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            background: `${accent}30`,
            border: `2px solid ${accent}60`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {group.name.split(" ")[0]}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#e9edef",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {group.name.split(" ").slice(1).join(" ")}
          </div>
          <div style={{ fontSize: 11, color: "#8696a0" }}>
            {group.description}
          </div>
          <div style={{ fontSize: 10.5, color: "#53bdeb", marginTop: 2 }}>
            {`Receipts ${preferences.readReceiptsEnabled ? formatReceiptMode(preferences.readReceiptMode) : "Off"}`}
          </div>
        </div>

        {/* Member stacks */}
        <div style={{ display: "flex", alignItems: "center" }}>
          {group.members.slice(0, 3).map((m, i) => (
            <div
              key={m.id}
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: m.color,
                border: "2px solid #202c33",
                marginLeft: i === 0 ? 0 : -8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                color: "#fff",
                zIndex: 4 - i,
              }}
            >
              {m.letter}
            </div>
          ))}
          {group.memberCount > 3 && (
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: "#374248",
                border: "2px solid #202c33",
                marginLeft: -8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                fontWeight: 700,
                color: "#aebac1",
                zIndex: 0,
              }}
            >
              +{group.memberCount - 3}
            </div>
          )}
        </div>
      </div>

      {/* ── AI Highlights Bar ─────────────────────────── */}
      {/* Surface switch rail */}
      <div
        style={{
          padding: compactLayout ? "8px 10px 6px" : "9px 12px 7px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(17,27,33,0.95)",
          flexShrink: 0,
        }}
      >
        <SurfaceSwitchRail
          active="channels"
          callHref={callHref}
          channelHref={`/channels/${group.id}`}
          compact={compactLayout}
        />
      </div>

      {highlights.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          style={{
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(10px)",
            borderBottom: `1px solid ${accent}25`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px 4px",
            }}
          >
            <motion.span
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{ fontSize: 13 }}
            >
              ✨
            </motion.span>
            <span
              style={{ fontSize: 11, color: accent, fontWeight: 700, letterSpacing: "0.05em" }}
            >
              AI HIGHLIGHTS
            </span>
            <span style={{ fontSize: 10, color: "#8696a0", marginLeft: "auto" }}>
              Auto-pinned by AI
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              overflowX: "auto",
              padding: "4px 14px 12px",
              scrollbarWidth: "none",
            }}
          >
            {highlights.map((h) => (
              <HighlightCard key={h.id} item={h} />
            ))}
          </div>
        </motion.div>
      )}

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: compactLayout ? "8px 10px" : "10px 12px",
          scrollbarWidth: "none",
        }}
      >
        {/* Clean messages */}
        {messages.map((msg) => (
          <GroupMessageBubble
            key={msg.id}
            msg={msg}
            showReactions={preferences.reactionsEnabled}
            readReceiptsEnabled={preferences.readReceiptsEnabled}
            readReceiptMode={preferences.readReceiptMode}
            compactLayout={compactLayout}
          />
        ))}

        {/* Background Noise Toggle */}
        {noiseMessages.length > 0 && (
          <div style={{ margin: "8px 0" }}>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowNoise((s) => !s)}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.03)",
                border: "1px dashed rgba(255,255,255,0.1)",
                borderRadius: 10,
                padding: "10px 14px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "-apple-system, sans-serif",
              }}
            >
              <span style={{ fontSize: 14 }}>{showNoise ? "🔇" : "🔕"}</span>
              <span style={{ fontSize: 12, color: "#8696a0", flex: 1, textAlign: "left" }}>
                Background Noise — {noiseMessages.length} hidden messages
              </span>
              <span style={{ fontSize: 10, color: "#8696a0" }}>
                (Good mornings, GM forwards, etc.)
              </span>
              <motion.span
                animate={{ rotate: showNoise ? 180 : 0 }}
                style={{ fontSize: 14, color: "#8696a0" }}
              >
                ▾
              </motion.span>
            </motion.button>

            <AnimatePresence>
              {showNoise && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: "hidden", paddingTop: 8 }}
                >
                  {noiseMessages.map((msg) => (
                    <GroupMessageBubble
                      key={msg.id}
                      msg={msg}
                      isNoise
                      showReactions={preferences.reactionsEnabled}
                      readReceiptsEnabled={preferences.readReceiptsEnabled}
                      readReceiptMode={preferences.readReceiptMode}
                      compactLayout={compactLayout}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: "8px 10px 10px",
          background: "#0b141a",
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "#202c33",
            borderRadius: 26,
            padding: "9px 14px",
            minHeight: 46,
          }}
        >
          <button
            type="button"
            onClick={() => setSpoilerShieldEnabled((enabled) => !enabled)}
            title={spoilerShieldEnabled ? "Spoiler shield on" : "Spoiler shield off"}
            style={{
              background: spoilerShieldEnabled ? "rgba(83,189,235,0.2)" : "none",
              border: spoilerShieldEnabled ? "1px solid rgba(83,189,235,0.55)" : "none",
              color: spoilerShieldEnabled ? "#53bdeb" : "#aebac1",
              borderRadius: 999,
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.03em",
              padding: "4px 8px",
              whiteSpace: "nowrap",
            }}
          >
            SPOILER
          </button>
          {spoilerShieldEnabled && (
            <button
              type="button"
              onClick={() => setSpoilerShieldMode((mode) => (mode === "auto" ? "hold" : "auto"))}
              title={spoilerShieldMode === "auto" ? "Auto re-hide enabled" : "Manual hide mode"}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "#cfd7dc",
                borderRadius: 999,
                cursor: "pointer",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.03em",
                padding: "4px 8px",
                whiteSpace: "nowrap",
              }}
            >
              {spoilerShieldMode === "auto" ? "AUTO" : "HOLD"}
            </button>
          )}
          <button
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 22,
            }}
          >
            😊
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Message ${group.name.split(" ").slice(1).join(" ")}…`}
            style={{
              background: "none",
              border: "none",
              outline: "none",
              color: "#e9edef",
              fontSize: 15,
              flex: 1,
              fontFamily: "-apple-system, sans-serif",
            }}
          />
          <button
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 22,
            }}
          >
            📎
          </button>
        </div>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={handleSend}
          animate={{
            background: input.trim() ? "#00a884" : "#374248",
            boxShadow: input.trim() ? "0 2px 8px rgba(0,168,132,0.4)" : "none",
          }}
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          {input.trim() ? "➤" : "🎤"}
        </motion.button>
      </div>
    </div>
  );
}
