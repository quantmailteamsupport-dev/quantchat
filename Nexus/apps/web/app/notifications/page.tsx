"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useNotifications, type Notification, type NotifType } from "@/lib/useNotifications";

// ─── Helpers ─────────────────────────────────────────────────────

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function notifColor(type: NotifType): string {
  switch (type) {
    case "message": return "#6d4aff";
    case "call_missed": return "#ff3355";
    case "mention": return "#00f5ff";
    case "security": return "#ff6b35";
    case "system": return "#8696a0";
  }
}

function notifIcon(type: NotifType): string {
  switch (type) {
    case "message": return "💬";
    case "call_missed": return "📵";
    case "mention": return "@";
    case "security": return "🔐";
    case "system": return "⚙️";
  }
}

type TabId = "all" | "messages" | "calls" | "security";

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "messages", label: "Messages" },
  { id: "calls", label: "Calls" },
  { id: "security", label: "Security" },
];

function matchesTab(notif: Notification, tab: TabId): boolean {
  if (tab === "all") return true;
  if (tab === "messages") return notif.type === "message" || notif.type === "mention";
  if (tab === "calls") return notif.type === "call_missed";
  if (tab === "security") return notif.type === "security" || notif.type === "system";
  return false;
}

// ─── Notification Row ─────────────────────────────────────────────

function NotifRow({
  notif,
  onTap,
}: {
  notif: Notification;
  onTap: (notif: Notification) => void;
}) {
  const accent = notif.avatarColor ?? notifColor(notif.type);

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12 }}
      onClick={() => onTap(notif)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        width: "100%",
        padding: "12px 14px",
        borderRadius: 12,
        background: notif.read ? "transparent" : "rgba(109,74,255,0.06)",
        border: `1px solid ${notif.read ? "rgba(255,255,255,0.06)" : "rgba(109,74,255,0.18)"}`,
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      {/* Avatar */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            background: `radial-gradient(circle at 35% 35%, ${accent}ee, ${accent}88)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: notif.avatarLetter && notif.avatarLetter.length > 1 ? 16 : 17,
            fontWeight: 800,
            color: "#fff",
            boxShadow: notif.read ? "none" : `0 0 10px ${accent}60`,
          }}
        >
          {notif.avatarLetter ?? notifIcon(notif.type)}
        </div>
        {/* Type badge */}
        <div
          style={{
            position: "absolute",
            bottom: -2,
            right: -2,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#0b141a",
            border: "1.5px solid #0b141a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
          }}
        >
          {notifIcon(notif.type)}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 2 }}>
          <span style={{
            fontSize: 13.5,
            fontWeight: notif.read ? 500 : 700,
            color: notif.read ? "rgba(255,255,255,0.7)" : "#fff",
            fontFamily: "Inter, -apple-system, sans-serif",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {notif.title}
          </span>
          <span style={{
            fontSize: 10.5,
            color: "rgba(255,255,255,0.35)",
            fontFamily: "Inter, -apple-system, sans-serif",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}>
            {relativeTime(notif.createdAt)}
          </span>
        </div>
        <p style={{
          margin: 0,
          fontSize: 12.5,
          color: notif.read ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.65)",
          fontFamily: "Inter, -apple-system, sans-serif",
          lineHeight: 1.45,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}>
          {notif.body}
        </p>
      </div>

      {/* Unread dot */}
      {!notif.read && (
        <div style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#6d4aff",
          flexShrink: 0,
          marginTop: 6,
          boxShadow: "0 0 6px #6d4aff",
        }} />
      )}
    </motion.button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter();
  const { notifications, unread, loading, error, markAllRead, markRead, reload } = useNotifications();
  const [activeTab, setActiveTab] = useState<TabId>("all");

  const visible = notifications.filter((n) => matchesTab(n, activeTab));

  const handleTap = (notif: Notification) => {
    if (!notif.read) markRead(notif.id);
    if (notif.href) router.push(notif.href);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at 50% 0%, rgba(109,74,255,0.12) 0%, #0b141a 50%)",
        fontFamily: "Inter, -apple-system, sans-serif",
        color: "#fff",
      }}
    >
      {/* Header */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "rgba(11,20,26,0.85)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "14px 16px 0",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => router.back()}
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "50%",
                width: 34,
                height: 34,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "#fff",
                fontSize: 15,
              }}
            >
              ←
            </button>
            <div>
              <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em" }}>
                Notifications
              </h1>
              {unread > 0 && (
                <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                  {unread} unread
                </p>
              )}
            </div>
          </div>

          {unread > 0 && (
            <button
              onClick={() => void markAllRead()}
              style={{
                background: "rgba(109,74,255,0.2)",
                border: "1px solid rgba(109,74,255,0.4)",
                borderRadius: 20,
                padding: "6px 14px",
                color: "#bf5af2",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, overflowX: "auto" }}>
          {TABS.map((tab) => {
            const count = tab.id === "all"
              ? notifications.filter((n) => !n.read).length
              : notifications.filter((n) => !n.read && matchesTab(n, tab.id)).length;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "8px 14px",
                  paddingBottom: 10,
                  borderRadius: "8px 8px 0 0",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  color: isActive ? "#fff" : "rgba(255,255,255,0.4)",
                  fontWeight: isActive ? 700 : 500,
                  fontSize: 13,
                  borderBottom: isActive ? "2px solid #6d4aff" : "2px solid transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  whiteSpace: "nowrap",
                  transition: "color 0.15s",
                }}
              >
                {tab.label}
                {count > 0 && (
                  <span style={{
                    background: "#6d4aff",
                    borderRadius: 999,
                    fontSize: 9.5,
                    fontWeight: 800,
                    padding: "1px 5px",
                    color: "#fff",
                    lineHeight: 1.5,
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "12px 12px 32px", maxWidth: 640, margin: "0 auto" }}>
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
            <motion.div
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Loading…</span>
            </motion.div>
          </div>
        )}

        {error && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 0", gap: 12 }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Couldn't load notifications</span>
            <button
              onClick={() => void reload()}
              style={{
                background: "rgba(109,74,255,0.2)",
                border: "1px solid rgba(109,74,255,0.4)",
                borderRadius: 20,
                padding: "7px 18px",
                color: "#bf5af2",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "64px 0", gap: 10 }}>
            <span style={{ fontSize: 36 }}>🔔</span>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.35)" }}>
              {activeTab === "all" ? "You're all caught up" : `No ${activeTab} notifications`}
            </span>
          </div>
        )}

        {!loading && !error && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <AnimatePresence mode="popLayout">
              {visible.map((notif) => (
                <NotifRow key={notif.id} notif={notif} onTap={handleTap} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
