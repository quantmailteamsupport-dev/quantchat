"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import ChillRoomModal from "@/components/ChillRoomModal";

// ─── Types & Data ─────────────────────────────────────────
interface Community {
  id: string;
  name: string;
  desc: string;
  time?: string;
  preview?: string;
  avatarColor: string;
  avatarLetter: string;
  members?: number;
  unread?: number;
  isSub?: boolean;
  hasChillRoom?: boolean;
}

const COMMUNITIES: Community[] = [
  {
    id: "c1", name: "Quantchat Builders", desc: "The main builder community",
    avatarColor: "#6d4aff", avatarLetter: "Q", members: 142, time: "10:24 AM",
    preview: "AI Summary ready ✓", unread: 3, hasChillRoom: true,
  },
  {
    id: "c2", name: "Neural Hive — Goa 2026", desc: "Goa trip planning hive",
    avatarColor: "#00897b", avatarLetter: "G", members: 8, time: "Yesterday",
    preview: "Aryan: Confirm hotel?", unread: 0, hasChillRoom: true,
  },
  {
    id: "c3", name: "Night Owls Hub", desc: "Late night dev grind",
    avatarColor: "#0288b0", avatarLetter: "N", members: 3401, time: "3/18/26",
    preview: "🔥 New drop shipped!", unread: 0, hasChillRoom: true,
  },
  {
    id: "c4", name: "Nexus Dev Announcements", desc: "Official announcements",
    avatarColor: "#ff6b35", avatarLetter: "N", members: 500, time: "3/17/26",
    preview: "🚀 v2.1 released", unread: 7, isSub: true,
  },
  {
    id: "c5", name: "AI Research Circle", desc: "Papers & models discussion",
    avatarColor: "#e91e8c", avatarLetter: "A", members: 89, time: "3/16/26",
    preview: "GPT-5 paper dropped", unread: 0, hasChillRoom: true,
  },
];

// ─── Avatar ─────────────────────────────────────────────
function CAvatar({ c, size = 52 }: { c: Community; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 14,
      background: c.avatarColor,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 700, color: "#fff",
      flexShrink: 0, fontFamily: "-apple-system, sans-serif",
      userSelect: "none",
    }}>
      {c.avatarLetter}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────
export default function HivesPage() {
  const [search, setSearch] = useState("");
  const [chillRoomTarget, setChillRoomTarget] = useState<Community | null>(null);

  const filtered = COMMUNITIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      background: "#111b21", overflow: "hidden",
    }}>
      {/* Chill Room Modal */}
      <ChillRoomModal
        isOpen={chillRoomTarget !== null}
        onClose={() => setChillRoomTarget(null)}
        spaceName={chillRoomTarget ? `${chillRoomTarget.name} Chill Room` : "Chill Room"}
        participantCount={chillRoomTarget?.members ? Math.min(8, Math.floor(Math.random() * 8)) : 0}
      />

      {/* Header */}
      <div style={{
        padding: "14px 16px 8px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "#111b21", flexShrink: 0,
      }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: "#e9edef", fontFamily: "-apple-system, sans-serif" }}>
          Hives
        </span>
        <span style={{ fontSize: 20, cursor: "pointer", color: "#aebac1" }}>⋮</span>
      </div>

      {/* Search */}
      <div style={{ padding: "0 12px 12px", flexShrink: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "#202c33", borderRadius: 12, padding: "9px 14px",
        }}>
          <span style={{ color: "#8696a0", fontSize: 16 }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search hives"
            style={{
              background: "none", border: "none", outline: "none",
              color: "#e9edef", fontSize: 15, flex: 1,
              fontFamily: "-apple-system, sans-serif",
            }}
          />
        </div>
      </div>

      {/* New Hive button */}
      <motion.div
        whileTap={{ scale: 0.97 }}
        style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "12px 16px", borderBottom: "1px solid #1f2c34",
          cursor: "pointer", flexShrink: 0,
        }}
      >
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: "#202c33",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26, position: "relative",
        }}>
          ⬡
          <div style={{
            position: "absolute", bottom: -2, right: -2,
            width: 18, height: 18, borderRadius: "50%",
            background: "#00a884",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, color: "#111", fontWeight: 900,
            border: "2px solid #111b21",
          }}>
            +
          </div>
        </div>
        <span style={{ color: "#00a884", fontWeight: 600, fontSize: 16, fontFamily: "-apple-system, sans-serif" }}>
          New Hive
        </span>
      </motion.div>

      {/* Community list */}
      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none" }}>
        {filtered.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            style={{
              borderBottom: "1px solid #1f2c34",
              background: "#111b21",
            }}
          >
            {/* Main row */}
            <motion.div
              whileTap={{ background: "#202c33" }}
              style={{
                display: "flex", alignItems: "center",
                padding: "12px 16px", gap: 14,
                cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              <CAvatar c={c} size={52} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{
                    color: "#e9edef", fontWeight: 600, fontSize: 15.5,
                    fontFamily: "-apple-system, sans-serif",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    maxWidth: "70%",
                  }}>
                    {c.name}
                  </span>
                  {c.time && (
                    <span style={{ color: c.unread! > 0 ? "#00a884" : "#8696a0", fontSize: 12 }}>
                      {c.time}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{
                    color: "#8696a0", fontSize: 13.5,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    maxWidth: c.unread ? "80%" : "100%",
                    fontFamily: "-apple-system, sans-serif",
                  }}>
                    {c.preview || `${c.members?.toLocaleString()} members`}
                  </span>
                  {c.unread! > 0 && (
                    <div style={{
                      minWidth: 20, height: 20, borderRadius: 10,
                      background: "#00a884",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, marginLeft: 8,
                    }}>
                      <span style={{ color: "#111", fontSize: 11, fontWeight: 700 }}>
                        {c.unread}
                      </span>
                    </div>
                  )}
                </div>
                {/* Sub-communities */}
                {c.isSub && (
                  <div style={{
                    marginTop: 6, display: "flex", gap: 4, overflow: "hidden",
                  }}>
                    {["📢", "💬", "🎨"].map((e, j) => (
                      <div key={j} style={{
                        width: 24, height: 24, borderRadius: 6,
                        background: "#202c33",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13,
                      }}>
                        {e}
                      </div>
                    ))}
                    <span style={{ color: "#8696a0", fontSize: 12, alignSelf: "center", marginLeft: 4 }}>
                      View all
                    </span>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Enter Chill Room button (only for communities with a chill room) */}
            {c.hasChillRoom && (
              <div style={{ padding: "0 16px 12px", paddingLeft: 82 }}>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setChillRoomTarget(c)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 14px",
                    borderRadius: 20,
                    border: "1px solid rgba(109, 74, 255, 0.4)",
                    background: "linear-gradient(135deg, rgba(109, 74, 255, 0.15) 0%, rgba(0, 243, 255, 0.08) 100%)",
                    cursor: "pointer",
                    color: "#a78bfa",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    boxShadow: "0 0 10px rgba(109, 74, 255, 0.2)",
                  }}
                >
                  <span>🌌</span>
                  Enter Chill Room
                </motion.button>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
