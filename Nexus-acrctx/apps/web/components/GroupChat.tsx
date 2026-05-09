"use client";

/**
 * components/GroupChat.tsx
 *
 * Smart Contextual Groups — Professional Redesign
 *
 * Features:
 *  - AI Auto-Sorting: "Highlights" (homework, events, notices) vs "Background Noise" (spam, good-mornings)
 *  - Strict Mode toggle: AI automatically hides off-topic chatter in professional/school groups
 *  - Clean professional UI with teal accent and minimal animations
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ChevronDown, Sparkles, Filter, Users } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────

export type GroupType = "family" | "school" | "work" | "friends";

export interface GroupMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  text: string;
  timestamp: string;
  /** AI classification — injected client-side */
  category?: "highlight" | "noise" | "normal";
  replyTo?: string;
  reactions?: Record<string, number>;
}

interface GroupInfo {
  id: string;
  name: string;
  type: GroupType;
  memberCount: number;
  avatarColor: string;
  avatarLetter: string;
}

// ─── AI Classifier (heuristic — replace with LLM call in prod) ──

const NOISE_PATTERNS = [
  /^good\s*morning/i,
  /^gm\b/i,
  /^good\s*night/i,
  /^happy\s+(birthday|anniversary|diwali|holi|eid|new year)/i,
  /^🌅|^☀️|^🌙/,
  /^forwarded/i,
  /please\s+share/i,
  /forward\s+this/i,
];

const HIGHLIGHT_PATTERNS = [
  /homework|assignment|submission|deadline/i,
  /exam|test|quiz|marks|result/i,
  /meeting|call\s+at|zoom|teams\s+link/i,
  /event|party|trip|plan/i,
  /notice|announcement|important|urgent/i,
  /invoice|payment|bill|due/i,
  /birthday.*tomorrow|reminder/i,
];

export function classifyMessage(text: string): GroupMessage["category"] {
  if (HIGHLIGHT_PATTERNS.some((p) => p.test(text))) return "highlight";
  if (NOISE_PATTERNS.some((p) => p.test(text))) return "noise";
  return "normal";
}

// ─── Demo data ───────────────────────────────────────────────────

const DEMO_MESSAGES: GroupMessage[] = [
  {
    id: "m1", senderId: "u1", senderName: "Aryan", senderColor: "#2DD4BF",
    text: "Good morning everyone! ☀️ Have a great day!",
    timestamp: "8:04 AM",
  },
  {
    id: "m2", senderId: "u2", senderName: "Priya", senderColor: "#A78BFA",
    text: "📌 IMPORTANT: Math assignment due tomorrow by 5 PM. Submit to portal.",
    timestamp: "8:12 AM",
  },
  {
    id: "m3", senderId: "u3", senderName: "Raj", senderColor: "#22C55E",
    text: "Good morning 🌅🌅🌅",
    timestamp: "8:15 AM",
  },
  {
    id: "m4", senderId: "u4", senderName: "Sneha", senderColor: "#F472B6",
    text: "Please share this forward — very important for health! 🙏",
    timestamp: "8:18 AM",
  },
  {
    id: "m5", senderId: "u2", senderName: "Priya", senderColor: "#A78BFA",
    text: "Parent-teacher meeting on Friday at 4 PM. Attendance mandatory.",
    timestamp: "9:01 AM",
  },
  {
    id: "m6", senderId: "u5", senderName: "Dev", senderColor: "#F59E0B",
    text: "hahaha ok",
    timestamp: "9:04 AM",
  },
  {
    id: "m7", senderId: "u1", senderName: "Aryan", senderColor: "#2DD4BF",
    text: "Good night everyone 🌙",
    timestamp: "9:45 AM",
  },
  {
    id: "m8", senderId: "u3", senderName: "Raj", senderColor: "#22C55E",
    text: "Exam schedule posted! Physics on Mon, Chemistry on Wed. See notice board.",
    timestamp: "10:02 AM",
  },
  {
    id: "m9", senderId: "u5", senderName: "Dev", senderColor: "#F59E0B",
    text: "Zoom link for today's meeting: https://zoom.us/j/123456 at 3 PM",
    timestamp: "10:30 AM",
  },
  {
    id: "m10", senderId: "u4", senderName: "Sneha", senderColor: "#F472B6",
    text: "forward this message to 10 friends for good luck 🍀",
    timestamp: "11:00 AM",
  },
];

// ─── Sub-components ──────────────────────────────────────────────

function MessageBubble({
  msg,
  strictMode,
}: {
  msg: GroupMessage;
  strictMode: boolean;
}) {
  const category = msg.category ?? "normal";
  const isLocal = msg.senderId === "local-user";

  // In strict mode, noise messages are collapsed to a tiny indicator
  if (strictMode && category === "noise") {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 0.5, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 16px",
          marginBottom: 1,
        }}
      >
        <Filter size={10} style={{ color: "#5B6B82" }} />
        <span style={{ fontSize: 11, color: "#5B6B82", fontFamily: "'Inter', sans-serif" }}>
          1 filtered message
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, height: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      style={{
        display: "flex",
        gap: 10,
        padding: "6px 14px",
        marginBottom: 2,
        borderRadius: 8,
        background: isLocal
          ? "rgba(45, 212, 191, 0.08)"
          : category === "highlight"
            ? "rgba(45, 212, 191, 0.06)"
            : "transparent",
        borderLeft: isLocal
          ? "2px solid #2DD4BF"
          : category === "highlight"
            ? "2px solid rgba(45, 212, 191, 0.5)"
            : "2px solid transparent",
        transition: "background 0.15s",
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: msg.senderColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700, color: "#0B1220",
        flexShrink: 0,
      }}>
        {msg.senderName[0]}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: msg.senderColor,
            fontFamily: "'Inter', sans-serif",
          }}>
            {msg.senderName}
          </span>
          {category === "highlight" && (
            <span style={{
              fontSize: 9.5, fontWeight: 700,
              color: "#2DD4BF",
              background: "rgba(45, 212, 191, 0.12)",
              border: "1px solid rgba(45, 212, 191, 0.25)",
              borderRadius: 4,
              padding: "1px 6px",
              display: "flex", alignItems: "center", gap: 3,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              <Sparkles size={9} /> Important
            </span>
          )}
          {category === "noise" && (
            <span style={{
              fontSize: 9.5, fontWeight: 600,
              color: "#5B6B82",
              background: "rgba(91, 107, 130, 0.12)",
              borderRadius: 4,
              padding: "1px 6px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              Noise
            </span>
          )}
          <span style={{
            fontSize: 10.5, color: "#5B6B82",
            marginLeft: "auto", flexShrink: 0,
          }}>
            {msg.timestamp}
          </span>
        </div>

        {/* Message text */}
        <p style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.55,
          color: category === "noise" ? "rgba(230, 237, 247, 0.4)" : "#E6EDF7",
          fontFamily: "'Inter', sans-serif",
          wordBreak: "break-word",
        }}>
          {msg.text}
        </p>
      </div>
    </motion.div>
  );
}

// ─── Main Component ──────────────────────────────────────────────

interface GroupChatProps {
  group?: GroupInfo;
  onBack?: () => void;
}

const DEFAULT_GROUP: GroupInfo = {
  id: "g1",
  name: "Class 10-A Parents",
  type: "school",
  memberCount: 47,
  avatarColor: "#2DD4BF",
  avatarLetter: "C",
};

export default function GroupChat({ group = DEFAULT_GROUP, onBack }: GroupChatProps) {
  const [activeTab, setActiveTab] = useState<"all" | "highlights" | "noise">("all");
  const [strictMode, setStrictMode] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<GroupMessage[]>(() =>
    DEMO_MESSAGES.map((m) => ({ ...m, category: classifyMessage(m.text) }))
  );
  const [aiSorting, setAiSorting] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

  const highlights = messages.filter((m) => m.category === "highlight");
  const noise = messages.filter((m) => m.category === "noise");

  const visibleMessages = (() => {
    if (!aiSorting) return messages;
    if (activeTab === "highlights") return highlights;
    if (activeTab === "noise") return noise;
    return messages;
  })();

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    const newMsg: GroupMessage = {
      id: `m${Date.now()}`,
      senderId: "local-user",
      senderName: "You",
      senderColor: "#2DD4BF",
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      category: classifyMessage(text),
    };
    setMessages((prev) => [...prev, newMsg]);
    setInput("");
  };

  const ACCENT = "#2DD4BF";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "#0B1220",
      position: "relative",
      overflow: "hidden",
    }}>

      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px",
        background: "#111B2E",
        borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
        flexShrink: 0,
        position: "relative", zIndex: 10,
      }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 18, color: "#93A1BC", padding: 4,
              display: "flex", alignItems: "center",
            }}
          >
            ←
          </button>
        )}

        {/* Group avatar */}
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: group.avatarColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 800, color: "#0B1220",
          flexShrink: 0,
        }}>
          {group.avatarLetter}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#E6EDF7", fontFamily: "'Inter', sans-serif" }}>
            {group.name}
          </div>
          <div style={{
            fontSize: 12, color: "#93A1BC", fontFamily: "'Inter', sans-serif",
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <Users size={11} />
            {group.memberCount} members · {group.type}
          </div>
        </div>

        {/* AI Sorting toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 11, color: aiSorting ? ACCENT : "#5B6B82",
            fontFamily: "'Inter', sans-serif", fontWeight: 600,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <Sparkles size={12} />
            AI
          </span>
          <button
            onClick={() => setAiSorting((v) => !v)}
            style={{
              width: 34, height: 18, borderRadius: 9,
              background: aiSorting ? ACCENT : "rgba(255, 255, 255, 0.08)",
              border: "none", cursor: "pointer",
              position: "relative", transition: "background 0.2s",
            }}
          >
            <motion.div
              animate={{ x: aiSorting ? 17 : 2 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              style={{
                position: "absolute", top: 2,
                width: 14, height: 14, borderRadius: 7,
                background: aiSorting ? "#0B1220" : "#93A1BC",
              }}
            />
          </button>
        </div>
      </div>

      {/* ── Filter Tabs ── */}
      <AnimatePresence>
        {aiSorting && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              overflow: "hidden",
              flexShrink: 0,
              background: "#0F1829",
              borderBottom: "1px solid rgba(148, 163, 184, 0.08)",
              zIndex: 9,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "0 14px", position: "relative" }}>
              {(
                [
                  { key: "all", label: "All", count: messages.length },
                  { key: "highlights", label: "Highlights", count: highlights.length },
                  { key: "noise", label: "Noise", count: noise.length },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    padding: "10px 14px",
                    fontSize: 13, fontWeight: activeTab === tab.key ? 700 : 500,
                    fontFamily: "'Inter', sans-serif",
                    color: activeTab === tab.key ? "#E6EDF7" : "#5B6B82",
                    position: "relative",
                    transition: "color 0.15s",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <span>{tab.label}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    background: activeTab === tab.key ? ACCENT : "rgba(255, 255, 255, 0.06)",
                    color: activeTab === tab.key ? "#0B1220" : "#5B6B82",
                    borderRadius: 99, padding: "1px 6px",
                  }}>
                    {tab.count}
                  </span>
                  {activeTab === tab.key && (
                    <motion.div
                      layoutId="group-tab-indicator"
                      style={{
                        position: "absolute", bottom: 0, left: "10%", right: "10%",
                        height: 2, background: ACCENT, borderRadius: "2px 2px 0 0",
                      }}
                    />
                  )}
                </button>
              ))}

              {/* Strict Mode */}
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "6px 0" }}>
                <span style={{
                  fontSize: 11, color: strictMode ? "#F59E0B" : "#5B6B82",
                  fontFamily: "'Inter', sans-serif", fontWeight: 600,
                }}>
                  Strict
                </span>
                <button
                  onClick={() => setStrictMode((v) => !v)}
                  style={{
                    width: 30, height: 16, borderRadius: 8,
                    background: strictMode ? "#F59E0B" : "rgba(255, 255, 255, 0.08)",
                    border: "none", cursor: "pointer",
                    position: "relative", transition: "background 0.2s",
                  }}
                >
                  <motion.div
                    animate={{ x: strictMode ? 15 : 2 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    style={{
                      position: "absolute", top: 2,
                      width: 12, height: 12, borderRadius: 6,
                      background: strictMode ? "#0B1220" : "#5B6B82",
                    }}
                  />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Strict mode banner ── */}
      <AnimatePresence>
        {strictMode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{
              background: "rgba(245, 158, 11, 0.08)",
              borderBottom: "1px solid rgba(245, 158, 11, 0.15)",
              padding: "6px 16px",
              flexShrink: 0,
              zIndex: 8,
            }}
          >
            <p style={{
              margin: 0, fontSize: 12, color: "#F59E0B",
              fontFamily: "'Inter', sans-serif", fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <Filter size={12} /> Strict Mode — off-topic messages are hidden
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Highlights summary (collapsible drawer) ── */}
      {aiSorting && highlights.length > 0 && activeTab === "all" && (
        <div style={{
          padding: "8px 14px",
          background: "rgba(45, 212, 191, 0.04)",
          borderBottom: "1px solid rgba(45, 212, 191, 0.1)",
          flexShrink: 0,
          zIndex: 7,
        }}>
          <div style={{
            fontSize: 12, color: ACCENT, fontWeight: 700,
            fontFamily: "'Inter', sans-serif",
            marginBottom: 6,
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <Sparkles size={12} />
            {highlights.length} highlighted message{highlights.length > 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
            {highlights.slice(0, 3).map((h) => (
              <div key={h.id} style={{
                flexShrink: 0,
                background: "rgba(45, 212, 191, 0.08)",
                border: "1px solid rgba(45, 212, 191, 0.18)",
                borderRadius: 8,
                padding: "5px 10px",
                maxWidth: 200,
              }}>
                <p style={{
                  margin: 0, fontSize: 12, color: "#E6EDF7",
                  fontFamily: "'Inter', sans-serif",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {h.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Messages ── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "10px 0",
        position: "relative", zIndex: 1,
      }}>
        <AnimatePresence initial={false}>
          {visibleMessages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} strictMode={strictMode} />
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px",
        background: "#111B2E",
        borderTop: "1px solid rgba(148, 163, 184, 0.12)",
        flexShrink: 0,
        position: "relative", zIndex: 10,
      }}>
        <div style={{
          flex: 1,
          background: "#16233A",
          border: "1px solid rgba(148, 163, 184, 0.12)",
          borderRadius: 8,
          padding: "10px 14px",
          display: "flex", alignItems: "center",
          transition: "border-color 0.15s",
        }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Message"
            style={{
              background: "none", border: "none", outline: "none",
              color: "#E6EDF7", fontSize: 14, width: "100%",
              fontFamily: "'Inter', sans-serif",
              caretColor: ACCENT,
            }}
          />
        </div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleSend}
          disabled={!input.trim()}
          style={{
            width: 38, height: 38, borderRadius: 10,
            background: input.trim() ? ACCENT : "rgba(255, 255, 255, 0.05)",
            border: input.trim() ? "none" : "1px solid rgba(148, 163, 184, 0.12)",
            cursor: input.trim() ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s",
            color: input.trim() ? "#0B1220" : "#5B6B82",
          }}
        >
          <Send size={17} />
        </motion.button>
      </div>
    </div>
  );
}
