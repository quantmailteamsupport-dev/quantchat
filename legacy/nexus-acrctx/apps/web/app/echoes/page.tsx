"use client";

import { useState } from "react";
import { motion } from "framer-motion";

// ─── Types & Data ─────────────────────────────────────────
const STATUS_USERS = [
  { id: "me",  label: "My Status", sub: "Tap to add status update", avatarColor: "#202c33", letter: "N", isMe: true },
  { id: "u1",  label: "Aryan Sharma",  sub: "2 minutes ago", avatarColor: "#6d4aff", letter: "A", ring: true },
  { id: "u2",  label: "Priya Mehta",   sub: "18 minutes ago", avatarColor: "#e91e8c", letter: "P", ring: true },
  { id: "u3",  label: "Noor AI Twin",  sub: "1 hour ago",    avatarColor: "#ff6b35", letter: "N", ring: false },
  { id: "u4",  label: "Kumar Kishor",  sub: "3 hours ago",   avatarColor: "#f44336", letter: "K", ring: false },
];

const CHANNELS = [
  { id: "ch1", name: "Quantchat Official", preview: "🚀 v2.2 ships Friday — changelog below", time: "9:36 AM", avatarColor: "#6d4aff", letter: "Q", unread: 8 },
  { id: "ch2", name: "AI Research Daily",  preview: "🔬 New DeepMind paper: AlphaFold 4", time: "Yesterday", avatarColor: "#00897b", letter: "A", unread: 8 },
  { id: "ch3", name: "Web3 Pulse",          preview: "ETH gas fees dropped 40% today 📉", time: "3/18/26", avatarColor: "#ff6b35", letter: "W", unread: 3 },
  { id: "ch4", name: "Product Hunt Daily",  preview: "🥇 Today's #1: QuantNote — AI notebook", time: "3/18/26", avatarColor: "#0288b0", letter: "P", unread: 0 },
  { id: "ch5", name: "Dev Memes 😂",        preview: "This bug only happens in prod 💀", time: "3/17/26", avatarColor: "#795548", letter: "D", unread: 0 },
];

function StatusAvatar({
  letter, color, size = 52, ring = false, isMe = false,
}: { letter: string; color: string; size?: number; ring?: boolean; isMe?: boolean }) {
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {/* Ring */}
      {ring && (
        <div style={{
          position: "absolute", inset: -2.5, borderRadius: "50%",
          border: "2.5px solid #00a884", zIndex: 0,
        }} />
      )}
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: color,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.38, fontWeight: 700, color: "#fff",
        fontFamily: "-apple-system, sans-serif", userSelect: "none",
        position: "relative", zIndex: 1,
      }}>
        {isMe ? "+" : letter}
      </div>
    </div>
  );
}

export default function EchoesPage() {
  const [activeTab] = useState("updates");

  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      background: "#111b21", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 16px 8px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "#111b21", flexShrink: 0,
      }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: "#e9edef", fontFamily: "-apple-system, sans-serif" }}>
          Echoes
        </span>
        <div style={{ display: "flex", gap: 18, color: "#aebac1" }}>
          <span style={{ fontSize: 20, cursor: "pointer" }}>🔍</span>
          <span style={{ fontSize: 20, cursor: "pointer" }}>⋮</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none" }}>
        {/* ── Status Section ──────────────────────────────────── */}
        <div style={{ padding: "8px 0 4px 16px" }}>
          <span style={{ color: "#e9edef", fontWeight: 600, fontSize: 16, fontFamily: "-apple-system, sans-serif" }}>
            Status
          </span>
        </div>

        {/* Status thumbnails row */}
        <div style={{ display: "flex", gap: 8, padding: "8px 12px 16px", overflowX: "auto", scrollbarWidth: "none" }}>
          {STATUS_USERS.map((u, i) => (
            <motion.div
              key={u.id}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                cursor: "pointer", flexShrink: 0, width: 70,
              }}
            >
              {/* Thumbnail card */}
              <div style={{
                width: 66, height: 90, borderRadius: 12,
                background: u.avatarColor,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
                position: "relative", overflow: "hidden",
                border: u.ring ? "2.5px solid #00a884" : "2.5px solid transparent",
              }}>
                {u.isMe ? (
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 32, color: "#8696a0",
                  }}>
                    +
                  </div>
                ) : (
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 28, color: "rgba(255,255,255,0.3)",
                  }}>
                    {u.letter}
                  </div>
                )}
                {/* Bottom overlay with name */}
                <div style={{
                  width: "100%", background: "rgba(0,0,0,0.55)",
                  padding: "3px 4px",
                }}>
                  <span style={{
                    color: "#fff", fontSize: 10, fontWeight: 600,
                    fontFamily: "-apple-system, sans-serif",
                    display: "block", textAlign: "center",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {u.isMe ? "Add status" : u.label.split(" ")[0]}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#1f2c34", margin: "0 0 0 0" }} />

        {/* ── Channels Section ──────────────────────────────── */}
        <div style={{
          padding: "12px 16px 8px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ color: "#e9edef", fontWeight: 600, fontSize: 16, fontFamily: "-apple-system, sans-serif" }}>
            Channels
          </span>
          <div style={{
            background: "#202c33", borderRadius: 20, padding: "4px 12px", cursor: "pointer",
          }}>
            <span style={{ color: "#00a884", fontSize: 13, fontWeight: 600, fontFamily: "-apple-system, sans-serif" }}>
              Explore
            </span>
          </div>
        </div>

        {/* Channel list */}
        {CHANNELS.map((ch, i) => (
          <motion.div
            key={ch.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.05 }}
            whileTap={{ background: "#202c33" }}
            style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "12px 16px", borderBottom: "1px solid #1f2c34",
              cursor: "pointer", background: "#111b21", transition: "background 0.15s",
            }}
          >
            {/* Channel avatar */}
            <div style={{
              width: 50, height: 50, borderRadius: "50%",
              background: ch.avatarColor,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontWeight: 700, color: "#fff",
              fontFamily: "-apple-system, sans-serif", flexShrink: 0,
            }}>
              {ch.letter}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{
                  color: "#e9edef", fontWeight: ch.unread > 0 ? 700 : 400,
                  fontSize: 15, fontFamily: "-apple-system, sans-serif",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  maxWidth: "70%",
                }}>
                  {ch.name}
                </span>
                <span style={{ color: ch.unread > 0 ? "#00a884" : "#8696a0", fontSize: 12 }}>
                  {ch.time}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {/* Link icon prefix if URL */}
                <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
                  {ch.preview.includes("http") && (
                    <span style={{ fontSize: 12, color: "#8696a0" }}>🔗</span>
                  )}
                  <span style={{
                    color: "#8696a0", fontSize: 13.5,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    fontFamily: "-apple-system, sans-serif",
                  }}>
                    {ch.preview}
                  </span>
                </div>
                {ch.unread > 0 && (
                  <div style={{
                    minWidth: 20, height: 20, borderRadius: 10,
                    background: "#00a884",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, marginLeft: 8,
                  }}>
                    <span style={{ color: "#111", fontSize: 11, fontWeight: 700 }}>
                      {ch.unread}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}

        {/* Bottom padding for nav */}
        <div style={{ height: 20 }} />
      </div>

      {/* FAB */}
      <button style={{
        position: "absolute", bottom: 80, right: 18,
        width: 56, height: 56, borderRadius: "50%",
        background: "#00a884", border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 22, boxShadow: "0 4px 16px rgba(0,168,132,0.5)",
        zIndex: 20,
      }}>
        📡
      </button>
    </div>
  );
}
