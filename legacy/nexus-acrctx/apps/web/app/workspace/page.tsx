"use client";

/**
 * /workspace — 3-Pane Slack-Killer Workspace UI
 *
 * Layout:
 *   [1] Workspace rail (far left, 64px) — server/workspace icons
 *   [2] Channel sidebar (240px)         — channel list + DMs
 *   [3] Chat pane (flex)                — messages + AI summarise
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Hash,
  Lock,
  Plus,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Send,
  SmilePlus,
  Paperclip,
  Search,
  Bell,
  Settings,
  MessageSquare,
  Users,
  X,
} from "lucide-react";
import PremiumPaywall from "@/components/PremiumPaywall";

// ─── Static seed data (replace with real DB/socket in production) ───────────

interface Workspace {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

interface Channel {
  id: string;
  name: string;
  isPrivate: boolean;
  unread: number;
  workspaceId: string;
}

interface ChatMsg {
  id: string;
  senderId: string;
  senderName: string;
  senderInitial: string;
  senderColor: string;
  content: string;
  ts: string;
}

const WORKSPACES: Workspace[] = [
  { id: "w1", name: "Quant Builders", emoji: "⚡", color: "#7c3aed" },
  { id: "w2", name: "Design Lab",     emoji: "🎨", color: "#0ea5e9" },
  { id: "w3", name: "Investors",      emoji: "💰", color: "#10b981" },
];

const CHANNELS: Channel[] = [
  { id: "c1", name: "general",          isPrivate: false, unread: 3,  workspaceId: "w1" },
  { id: "c2", name: "engineering",      isPrivate: false, unread: 0,  workspaceId: "w1" },
  { id: "c3", name: "design-reviews",   isPrivate: true,  unread: 7,  workspaceId: "w1" },
  { id: "c4", name: "announcements",    isPrivate: false, unread: 1,  workspaceId: "w1" },
  { id: "c5", name: "random",           isPrivate: false, unread: 0,  workspaceId: "w1" },
  { id: "c6", name: "brand-identity",   isPrivate: false, unread: 2,  workspaceId: "w2" },
  { id: "c7", name: "investor-updates", isPrivate: true,  unread: 0,  workspaceId: "w3" },
];

const SEED_MESSAGES: Record<string, ChatMsg[]> = {
  c1: [
    { id: "m1", senderId: "u1", senderName: "Aryan Sharma",   senderInitial: "A", senderColor: "#7c3aed", content: "Hey team, shipping the new AI summarise feature today 🚀",      ts: "10:02 AM" },
    { id: "m2", senderId: "u2", senderName: "Priya K",        senderInitial: "P", senderColor: "#0ea5e9", content: "Amazing! Should we also add smart replies in this sprint?",        ts: "10:04 AM" },
    { id: "m3", senderId: "u3", senderName: "Rohan Dev",      senderInitial: "R", senderColor: "#10b981", content: "I can take that ticket. Just need the API spec.",                  ts: "10:05 AM" },
    { id: "m4", senderId: "u1", senderName: "Aryan Sharma",   senderInitial: "A", senderColor: "#7c3aed", content: "Rohan, I'll drop the spec in #engineering by noon.",               ts: "10:07 AM" },
    { id: "m5", senderId: "u4", senderName: "Sunita Reddy",   senderInitial: "S", senderColor: "#f59e0b", content: "UI mocks for the paywall are done btw. Loom link coming.",         ts: "10:11 AM" },
    { id: "m6", senderId: "u2", senderName: "Priya K",        senderInitial: "P", senderColor: "#0ea5e9", content: "Paywall looks insane. Purple gradient 🔥",                         ts: "10:13 AM" },
    { id: "m7", senderId: "u3", senderName: "Rohan Dev",      senderInitial: "R", senderColor: "#10b981", content: "Can we A/B test the CTA copy? '$15/mo' vs 'Just $15/month'?",     ts: "10:15 AM" },
    { id: "m8", senderId: "u1", senderName: "Aryan Sharma",   senderInitial: "A", senderColor: "#7c3aed", content: "Yes — I'll set that up in Posthog after the deploy.",              ts: "10:17 AM" },
  ],
  c2: [
    { id: "m1", senderId: "u3", senderName: "Rohan Dev", senderInitial: "R", senderColor: "#10b981", content: "Prisma migration for Workspace/Channel models is merged ✅", ts: "9:30 AM" },
    { id: "m2", senderId: "u1", senderName: "Aryan Sharma", senderInitial: "A", senderColor: "#7c3aed", content: "Nice. Next up: wire the summarise endpoint to Stripe webhook.", ts: "9:33 AM" },
  ],
  c3: [
    { id: "m1", senderId: "u4", senderName: "Sunita Reddy", senderInitial: "S", senderColor: "#f59e0b", content: "Design review for the premium modal at 3pm today.", ts: "8:00 AM" },
  ],
  default: [
    { id: "m1", senderId: "u1", senderName: "Quant Bot", senderInitial: "Q", senderColor: "#7c3aed", content: "Welcome to this channel! Start the conversation. ✨", ts: "Now" },
  ],
};

const MY_USER = { id: "u1", name: "Aryan Sharma", initial: "A", color: "#7c3aed" };

// ─── Sub-components ──────────────────────────────────────────────────────────

function WorkspaceRail({
  workspaces,
  activeId,
  onSelect,
}: {
  workspaces: Workspace[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      style={{
        width: 64,
        background: "#000",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "12px 0",
        gap: 8,
        flexShrink: 0,
      }}
    >
      {workspaces.map((ws) => (
        <motion.button
          key={ws.id}
          onClick={() => onSelect(ws.id)}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          title={ws.name}
          style={{
            width: 44,
            height: 44,
            borderRadius: activeId === ws.id ? 14 : "50%",
            background: activeId === ws.id ? ws.color : "rgba(255,255,255,0.07)",
            border: activeId === ws.id
              ? `2px solid ${ws.color}`
              : "2px solid transparent",
            boxShadow: activeId === ws.id
              ? `0 0 16px ${ws.color}60`
              : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            cursor: "pointer",
            transition: "border-radius 0.2s, background 0.2s, box-shadow 0.2s",
          }}
        >
          {ws.emoji}
        </motion.button>
      ))}

      {/* Add workspace */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        title="Add workspace"
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.05)",
          border: "2px dashed rgba(255,255,255,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: "rgba(255,255,255,0.35)",
          marginTop: 4,
        }}
      >
        <Plus size={18} />
      </motion.button>
    </div>
  );
}

function ChannelSidebar({
  workspace,
  channels,
  activeChannelId,
  onSelect,
}: {
  workspace: Workspace;
  channels: Channel[];
  activeChannelId: string;
  onSelect: (id: string) => void;
}) {
  const [channelsOpen, setChannelsOpen] = useState(true);

  return (
    <div
      style={{
        width: 240,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(12px)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* Workspace header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, overflow: "hidden" }}>
          <span style={{ fontSize: 20 }}>{workspace.emoji}</span>
          <span style={{ color: "#e5e7eb", fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {workspace.name}
          </span>
        </div>
        <ChevronDown size={16} color="rgba(255,255,255,0.4)" />
      </div>

      {/* Search */}
      <div style={{ padding: "8px 10px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,255,255,0.06)",
            borderRadius: 8,
            padding: "7px 10px",
          }}
        >
          <Search size={13} color="rgba(255,255,255,0.3)" />
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Search channels…</span>
        </div>
      </div>

      {/* Channel list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {/* Section header */}
        <button
          onClick={() => setChannelsOpen((p) => !p)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 12px",
            width: "100%",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.4)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            marginTop: 8,
          }}
        >
          {channelsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Channels
        </button>

        <AnimatePresence initial={false}>
          {channelsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{ overflow: "hidden" }}
            >
              {channels.map((ch) => {
                const isActive = ch.id === activeChannelId;
                return (
                  <motion.button
                    key={ch.id}
                    onClick={() => onSelect(ch.id)}
                    whileHover={{ background: "rgba(255,255,255,0.06)" }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      width: "100%",
                      padding: "5px 14px",
                      background: isActive ? `${workspace.color}22` : "transparent",
                      border: "none",
                      borderLeft: isActive ? `2px solid ${workspace.color}` : "2px solid transparent",
                      cursor: "pointer",
                      color: isActive ? "#fff" : "rgba(255,255,255,0.55)",
                      fontSize: 14,
                      fontWeight: isActive ? 600 : 400,
                      textAlign: "left",
                      transition: "background 0.12s, color 0.12s",
                    }}
                  >
                    {ch.isPrivate
                      ? <Lock size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
                      : <Hash size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
                    }
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ch.name}
                    </span>
                    {ch.unread > 0 && (
                      <span
                        style={{
                          background: workspace.color,
                          color: "#fff",
                          borderRadius: 100,
                          padding: "1px 6px",
                          fontSize: 11,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {ch.unread}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* DMs section placeholder */}
        <div
          style={{
            padding: "4px 12px",
            color: "rgba(255,255,255,0.4)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <MessageSquare size={12} />
          Direct Messages
        </div>
        {[
          { name: "Priya K",    initial: "P", color: "#0ea5e9" },
          { name: "Rohan Dev",  initial: "R", color: "#10b981" },
          { name: "Sunita R.",  initial: "S", color: "#f59e0b" },
        ].map((dm) => (
          <button
            key={dm.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              width: "100%",
              padding: "5px 14px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.55)",
              fontSize: 14,
              textAlign: "left",
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: dm.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                color: "#fff",
                flexShrink: 0,
              }}
            >
              {dm.initial}
            </span>
            {dm.name}
          </button>
        ))}
      </div>

      {/* User bar */}
      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: MY_USER.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            color: "#fff",
            flexShrink: 0,
            boxShadow: `0 0 8px ${MY_USER.color}80`,
          }}
        >
          {MY_USER.initial}
        </div>
        <span style={{ color: "#e5e7eb", fontSize: 13, fontWeight: 600, flex: 1 }}>
          {MY_USER.name}
        </span>
        <Settings size={15} color="rgba(255,255,255,0.35)" style={{ cursor: "pointer" }} />
      </div>
    </div>
  );
}

function AISummaryBanner({
  summary,
  onClose,
}: {
  summary: string;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      style={{
        margin: "12px 16px 0",
        padding: "14px 16px",
        background: "rgba(139,92,246,0.12)",
        border: "1px solid rgba(139,92,246,0.35)",
        borderRadius: 14,
        backdropFilter: "blur(8px)",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Sparkles size={16} color="#a78bfa" style={{ flexShrink: 0, marginTop: 2 }} />
        <p style={{ margin: 0, color: "#d1d5db", fontSize: 14, lineHeight: 1.55 }}>
          <span style={{ fontWeight: 700, color: "#a78bfa" }}>AI Summary · </span>
          {summary}
        </p>
      </div>
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "rgba(255,255,255,0.3)",
          padding: 2,
        }}
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

// ─── Main chat pane ──────────────────────────────────────────────────────────

function ChatPane({
  workspace,
  channel,
  messages,
  onSend,
}: {
  workspace: Workspace;
  channel: Channel;
  messages: ChatMsg[];
  onSend: (text: string) => void;
}) {
  const [input, setInput] = useState("");
  const [summarising, setSummarising] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [aiUsed, setAiUsed] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
  };

  const handleSummarise = useCallback(async () => {
    setSummarising(true);
    setSummary(null);
    try {
      const resp = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages.map((m) => `${m.senderName}: ${m.content}`),
          channelName: channel.name,
        }),
      });
      const data = await resp.json();

      if (resp.status === 402 || data.error === "PAYWALL") {
        setAiUsed(data.used ?? 20);
        setShowPaywall(true);
        return;
      }

      if (!resp.ok) throw new Error(data.error ?? "Unknown error");

      setSummary(data.summary);
      setAiUsed(data.used ?? aiUsed + 1);
    } catch {
      setSummary("Our AI is currently overloaded. Please try again in a moment.");
    } finally {
      setSummarising(false);
    }
  }, [messages, channel.name, aiUsed]);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "#000",
        overflow: "hidden",
      }}
    >
      {/* ── Channel header ── */}
      <div
        style={{
          padding: "0 20px",
          height: 56,
          flexShrink: 0,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(12px)",
          background: "rgba(0,0,0,0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {channel.isPrivate ? <Lock size={16} color="rgba(255,255,255,0.5)" /> : <Hash size={16} color="rgba(255,255,255,0.5)" />}
          <span style={{ color: "#e5e7eb", fontWeight: 700, fontSize: 16 }}>{channel.name}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* AI usage badge */}
          {aiUsed > 0 && (
            <span style={{ color: "rgba(167,139,250,0.7)", fontSize: 12 }}>
              {Math.max(0, 20 - aiUsed)} AI uses left
            </span>
          )}

          {/* ✨ Summarise button */}
          <motion.button
            whileHover={{ scale: 1.04, boxShadow: `0 0 20px rgba(139,92,246,0.5)` }}
            whileTap={{ scale: 0.96 }}
            onClick={handleSummarise}
            disabled={summarising}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              borderRadius: 10,
              border: "1px solid rgba(139,92,246,0.5)",
              background: "rgba(139,92,246,0.12)",
              color: "#a78bfa",
              fontWeight: 600,
              fontSize: 13,
              cursor: summarising ? "wait" : "pointer",
              backdropFilter: "blur(6px)",
              transition: "opacity 0.15s",
              opacity: summarising ? 0.6 : 1,
            }}
          >
            <Sparkles size={14} />
            {summarising ? "Summarising…" : "✨ Summarise Thread"}
          </motion.button>

          <Bell size={18} color="rgba(255,255,255,0.35)" style={{ cursor: "pointer" }} />
          <Users size={18} color="rgba(255,255,255,0.35)" style={{ cursor: "pointer" }} />
        </div>
      </div>

      {/* ── AI Summary banner ── */}
      <AnimatePresence>
        {summary && (
          <AISummaryBanner summary={summary} onClose={() => setSummary(null)} />
        )}
      </AnimatePresence>

      {/* ── Messages ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 0 8px",
          scrollbarWidth: "none",
        }}
      >
        {messages.map((msg, i) => {
          const isMe = msg.senderId === MY_USER.id;
          const showAvatar = i === 0 || messages[i - 1]?.senderId !== msg.senderId;
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: Math.min(i * 0.03, 0.3) }}
              style={{
                display: "flex",
                gap: 10,
                padding: showAvatar ? "10px 20px 2px" : "2px 20px 2px",
                alignItems: "flex-start",
              }}
            >
              {/* Avatar */}
              <div style={{ width: 36, flexShrink: 0 }}>
                {showAvatar && (
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: msg.senderColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 14,
                      color: "#fff",
                      boxShadow: `0 0 10px ${msg.senderColor}60`,
                    }}
                  >
                    {msg.senderInitial}
                  </div>
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {showAvatar && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
                    <span
                      style={{
                        color: isMe ? workspace.color : "#e5e7eb",
                        fontWeight: 700,
                        fontSize: 14,
                      }}
                    >
                      {msg.senderName}
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>{msg.ts}</span>
                  </div>
                )}
                <div
                  style={{
                    color: "#d1d5db",
                    fontSize: 14.5,
                    lineHeight: 1.55,
                    wordBreak: "break-word",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            </motion.div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ── */}
      <div style={{ padding: "8px 16px 16px", flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 14,
            padding: "8px 12px",
            backdropFilter: "blur(8px)",
          }}
        >
          <Paperclip size={17} color="rgba(255,255,255,0.3)" style={{ cursor: "pointer", flexShrink: 0 }} />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={`Message #${channel.name}`}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              color: "#e5e7eb",
              fontSize: 14.5,
              caretColor: workspace.color,
            }}
          />
          <SmilePlus size={17} color="rgba(255,255,255,0.3)" style={{ cursor: "pointer", flexShrink: 0 }} />
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={handleSend}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: input.trim() ? workspace.color : "rgba(255,255,255,0.08)",
              border: "none",
              cursor: input.trim() ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: input.trim() ? `0 0 12px ${workspace.color}60` : "none",
              transition: "background 0.15s, box-shadow 0.15s",
            }}
          >
            <Send size={15} color={input.trim() ? "#fff" : "rgba(255,255,255,0.3)"} />
          </motion.button>
        </div>
        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.15)", fontSize: 11, margin: "6px 0 0" }}>
          Sent via <span style={{ color: workspace.color }}>Quant Chat</span>
        </p>
      </div>

      {/* Premium Paywall Modal */}
      <PremiumPaywall open={showPaywall} onClose={() => setShowPaywall(false)} />
    </div>
  );
}

// ─── Root Page ───────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(WORKSPACES[0]?.id ?? "w1");
  const [activeChannelId, setActiveChannelId] = useState<string>(CHANNELS[0]?.id ?? "c1");
  const [messages, setMessages] = useState<Record<string, ChatMsg[]>>(SEED_MESSAGES);

  const activeWorkspace: Workspace =
    WORKSPACES.find((w) => w.id === activeWorkspaceId) ??
    ({ id: "w1", name: "Quant Builders", emoji: "⚡", color: "#7c3aed" } as Workspace);
  const visibleChannels = CHANNELS.filter((c) => c.workspaceId === activeWorkspaceId);
  const activeChannel: Channel | undefined =
    visibleChannels.find((c) => c.id === activeChannelId) ?? visibleChannels[0];
  const channelMessages: ChatMsg[] =
    (activeChannel ? messages[activeChannel.id] : undefined) ?? SEED_MESSAGES.default ?? [];

  const handleWorkspaceSelect = (id: string) => {
    setActiveWorkspaceId(id);
    const firstCh = CHANNELS.find((c) => c.workspaceId === id);
    if (firstCh) setActiveChannelId(firstCh.id);
  };

  const handleSend = (text: string) => {
    if (!activeChannel) return;
    const newMsg: ChatMsg = {
      id: `m${Date.now()}`,
      senderId: MY_USER.id,
      senderName: MY_USER.name,
      senderInitial: MY_USER.initial,
      senderColor: MY_USER.color,
      content: text,
      ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => ({
      ...prev,
      [activeChannel.id]: [...(prev[activeChannel.id] ?? []), newMsg],
    }));
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#000",
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}
    >
      {/* Pane 1: Workspace rail */}
      <WorkspaceRail
        workspaces={WORKSPACES}
        activeId={activeWorkspaceId}
        onSelect={handleWorkspaceSelect}
      />

      {/* Pane 2: Channel sidebar */}
      <ChannelSidebar
        workspace={activeWorkspace}
        channels={visibleChannels}
        activeChannelId={activeChannel?.id ?? ""}
        onSelect={setActiveChannelId}
      />

      {/* Pane 3: Chat pane */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeChannel?.id ?? "empty"}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.18 }}
          style={{ flex: 1, display: "flex", overflow: "hidden" }}
        >
          {activeChannel ? (
            <ChatPane
              workspace={activeWorkspace}
              channel={activeChannel}
              messages={channelMessages}
              onSend={handleSend}
            />
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.2)",
                fontSize: 16,
              }}
            >
              Select a channel to start chatting
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
