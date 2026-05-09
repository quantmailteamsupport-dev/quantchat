"use client";

/**
 * app/feed/page.tsx
 *
 * QuantFeed — Phase 2 Social Engine
 *
 * Features:
 *  - TikTok/Reels-style vertical video feed with swipe gesture
 *  - SwipeDownFeed component — accessible via swipe down from chat
 *  - AI Camera entry point (Snap creation)
 *  - Integrated with chat (send to chat, reply)
 *  - Pitch-black glassmorphic UI with Framer Motion
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import AICamera from "@/components/AICamera";
import ConversationHandoffPanel, { type HandoffPreview } from "@/components/ConversationHandoffPanel";
import SurfaceSwitchRail from "@/components/SurfaceSwitchRail";
import { useFrontendPreferences, type ReadReceiptMode } from "@/lib/useFrontendPreferences";
import type { MessageStatus } from "@/lib/db";

// ─── Types ───────────────────────────────────────────────────────

interface FeedItem {
  id: string;
  type: "snap" | "reel" | "story";
  username: string;
  handle: string;
  caption: string;
  song?: string;
  likes: string;
  comments: string;
  shares: string;
  avatarColor: string;
  avatarLetter: string;
  bg: string;
  neonAccent: string;
  following: boolean;
  isNew?: boolean;
  snapExpiry?: number; // seconds before snap disappears
}

// ─── Feed data ────────────────────────────────────────────────────

const FEED_ITEMS: FeedItem[] = [
  {
    id: "f1", type: "snap",
    username: "Riya Kapoor", handle: "riya.k",
    caption: "Living in 2030 while others are stuck in 2024 🚀✨",
    likes: "2.1K", comments: "84", shares: "312",
    avatarColor: "#e91e8c", avatarLetter: "R",
    bg: "radial-gradient(ellipse at 30% 20%, #e91e8c28, transparent 55%), radial-gradient(ellipse at 70% 80%, #6d4aff20, transparent 60%), #000",
    neonAccent: "#e91e8c",
    following: true,
    isNew: true, snapExpiry: 24,
  },
  {
    id: "f2", type: "reel",
    username: "Aryan Nexus", handle: "aryan.builds",
    caption: "Shipped the BCI typing module in QuantChat 🧠⚡ Tab to accept AI ghost text. The future is HERE.",
    song: "Kesariya — Arijit Singh",
    likes: "8.7K", comments: "1.2K", shares: "940",
    avatarColor: "#6d4aff", avatarLetter: "A",
    bg: "radial-gradient(ellipse at 20% 70%, #6d4aff28, transparent 60%), radial-gradient(ellipse at 80% 20%, #00f5ff18, transparent 55%), #000",
    neonAccent: "#6d4aff",
    following: false,
  },
  {
    id: "f3", type: "reel",
    username: "Noor AI Twin", handle: "noor.twin",
    caption: "My offline AI Avatar replied to 23 messages while I slept 😂 This is insane. #QuantChat",
    song: "Original Sound — Noor",
    likes: "22.3K", comments: "750", shares: "2.5K",
    avatarColor: "#00897b", avatarLetter: "N",
    bg: "radial-gradient(ellipse at 60% 80%, #00897b28, transparent 55%), radial-gradient(ellipse at 20% 20%, #bf5af218, transparent 50%), #000",
    neonAccent: "#00f5ff",
    following: true,
  },
  {
    id: "f4", type: "snap",
    username: "Dev Singh", handle: "dev.s",
    caption: "Family group with AI Strict Mode = pure bliss. No more good morning spam. 🙏",
    likes: "4.0K", comments: "210", shares: "880",
    avatarColor: "#ff6b35", avatarLetter: "D",
    bg: "radial-gradient(ellipse at 75% 25%, #ff6b3525, transparent 55%), radial-gradient(ellipse at 25% 75%, #bf5af215, transparent 50%), #000",
    neonAccent: "#ff6b35",
    following: false,
    isNew: true, snapExpiry: 8,
  },
  {
    id: "f5", type: "reel",
    username: "Priya Creates", handle: "priya.creates",
    caption: "POV: AI camera filter — typed 'Make me look like a neon warrior' and this happened 🤯 #QuantSnap",
    song: "Raataan Lambiyan — Jubin Nautiyal",
    likes: "1.6K", comments: "27", shares: "431",
    avatarColor: "#0288b0", avatarLetter: "P",
    bg: "radial-gradient(ellipse at 40% 60%, #0288b028, transparent 55%), radial-gradient(ellipse at 80% 10%, #39ff1412, transparent 50%), #000",
    neonAccent: "#00f5ff",
    following: false,
  },
];

type HandoffTarget = "chat" | "channel" | "call";

function summarizeCaption(caption: string): string {
  if (caption.length <= 72) return caption;
  return `${caption.slice(0, 69)}...`;
}

function resolveChannelHref(item: FeedItem): string {
  if (item.type === "snap") return "/channels/family";
  if (item.handle.includes("build") || item.handle.includes("dev")) return "/channels/work";
  return "/channels/school";
}

function makeDeliveryStatus(readReceiptsEnabled: boolean, readReceiptMode: ReadReceiptMode): MessageStatus {
  return readReceiptsEnabled && readReceiptMode === "instant" ? "read" : "delivered";
}

function buildHandoffPreview(
  item: FeedItem,
  target: HandoffTarget,
  readReceiptsEnabled: boolean,
  readReceiptMode: ReadReceiptMode,
  customText?: string,
): HandoffPreview {
  const labelByTarget: Record<HandoffTarget, string> = {
    chat: "Shared to DM",
    channel: "Shared to channel",
    call: "Shared to call",
  };

  return {
    text: customText?.trim() || `Shared @${item.handle}: ${summarizeCaption(item.caption)}`,
    targetLabel: labelByTarget[target],
    status: makeDeliveryStatus(readReceiptsEnabled, readReceiptMode),
    timestamp: Date.now(),
  };
}

// ─── Neon Orbs (ambient background art) ─────────────────────────

function NeonOrbs({ accent }: { accent: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <motion.div
        style={{
          position: "absolute",
          width: 300, height: 300, borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}25 0%, transparent 70%)`,
          top: "10%", left: "50%", transform: "translateX(-50%)",
          filter: "blur(50px)",
        }}
        animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        style={{
          position: "absolute",
          width: 160, height: 160, borderRadius: "50%",
          background: `radial-gradient(circle, #00f5ff18 0%, transparent 70%)`,
          bottom: "22%", right: "6%",
          filter: "blur(28px)",
        }}
        animate={{ scale: [1, 1.18, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
    </div>
  );
}

// ─── Engagement Button ───────────────────────────────────────────

function EngBtn({
  icon, count, active, onTap,
}: { icon: string; count: string; active?: boolean; onTap?: () => void }) {
  const [pressed, setPressed] = useState(false);
  const isActive = active || pressed;
  return (
    <button
      onClick={() => { setPressed((p) => !p); onTap?.(); }}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 3, background: "none", border: "none", cursor: "pointer", padding: "4px 0",
      }}
    >
      <motion.span
        whileTap={{ scale: 1.35 }}
        style={{
          fontSize: 26, display: "block",
          filter: isActive
            ? "drop-shadow(0 0 6px rgba(255,45,120,0.95))"
            : "drop-shadow(0 0 3px rgba(255,255,255,0.25))",
          transition: "filter 0.15s",
        }}
      >
        {icon}
      </motion.span>
      {count && (
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: isActive ? "#ff2d78" : "rgba(255,255,255,0.9)",
          fontFamily: "Inter, sans-serif",
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Single Feed Card ────────────────────────────────────────────

function FeedCard({ item, isActive }: { item: FeedItem; isActive: boolean }) {
  const [liked, setLiked] = useState(false);
  const [following, setFollowing] = useState(item.following);
  const [snapViewed, setSnapViewed] = useState(false);

  return (
    <div style={{
      position: "relative", width: "100%", height: "100%",
      background: item.bg, overflow: "hidden", flexShrink: 0,
    }}>
      <NeonOrbs accent={item.neonAccent} />

      {/* Center visual */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "none",
      }}>
        <motion.div
          style={{
            width: 180, height: 180, borderRadius: "50%",
            background: `radial-gradient(circle, ${item.avatarColor}25 0%, transparent 70%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 88, fontWeight: 900, color: item.avatarColor,
            opacity: isActive ? 0.12 : 0.06,
            filter: `blur(1px) drop-shadow(0 0 28px ${item.neonAccent}60)`,
          }}
          animate={isActive ? { opacity: [0.10, 0.14, 0.10] } : { opacity: 0.06 }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          {item.avatarLetter}
        </motion.div>
      </div>

      {/* Scanlines */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1,
        background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)",
      }} />

      {/* Gradient overlay */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "70%",
        background: "linear-gradient(to top, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.55) 45%, transparent 100%)",
        pointerEvents: "none", zIndex: 2,
      }} />

      {/* Snap / Reel type badge + timer */}
      <div style={{
        position: "absolute", top: 14, left: 16, zIndex: 10,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        {item.type === "snap" && (
          <div style={{
            background: `${item.neonAccent}30`,
            backdropFilter: "blur(16px)",
            border: `1px solid ${item.neonAccent}50`,
            borderRadius: 20,
            padding: "4px 10px",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{ fontSize: 12 }}>👻</span>
            <span style={{
              fontSize: 10.5, fontWeight: 700, color: item.neonAccent,
              fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              Snap · {item.snapExpiry}h
            </span>
          </div>
        )}
        {item.isNew && (
          <div style={{
            background: "rgba(255,45,120,0.3)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,45,120,0.5)",
            borderRadius: 20,
            padding: "4px 10px",
          }}>
            <span style={{
              fontSize: 10.5, fontWeight: 700, color: "#ff2d78",
              fontFamily: "Inter, sans-serif",
            }}>
              NEW
            </span>
          </div>
        )}
      </div>

      {/* Right engagement strip */}
      <div style={{
        position: "absolute", right: 10, bottom: 110, zIndex: 10,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
        padding: "12px 8px",
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderRadius: 24,
        border: `1px solid ${item.neonAccent}28`,
        boxShadow: `0 0 18px ${item.neonAccent}18`,
      }}>
        {/* Avatar */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <div style={{
            width: 46, height: 46, borderRadius: "50%",
            background: item.avatarColor,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 800, color: "#fff",
            boxShadow: `0 0 0 2px ${item.neonAccent}, 0 0 12px ${item.neonAccent}90`,
          }}>
            {item.avatarLetter}
          </div>
          {!following && (
            <motion.div
              whileTap={{ scale: 0.85 }}
              onClick={() => setFollowing(true)}
              style={{
                position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)",
                width: 20, height: 20, borderRadius: "50%",
                background: "linear-gradient(135deg, #ff2d78, #bf5af2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, color: "#fff", fontWeight: 900,
                border: "2px solid #000",
                cursor: "pointer",
              }}
            >
              +
            </motion.div>
          )}
        </div>
        <EngBtn icon={liked ? "❤️" : "🤍"} count={item.likes} active={liked} onTap={() => setLiked((l) => !l)} />
        <EngBtn icon="💬" count={item.comments} />
        <EngBtn icon="🔁" count={item.shares} />
        <EngBtn icon="📨" count="" />
        {item.type === "snap" && (
          <EngBtn
            icon={snapViewed ? "👁️" : "👻"}
            count=""
            active={snapViewed}
            onTap={() => setSnapViewed(true)}
          />
        )}
        <EngBtn icon="⋯" count="" />
      </div>

      {/* Bottom creator info */}
      <div style={{ position: "absolute", bottom: 82, left: 12, right: 76, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{
            color: "#fff", fontWeight: 800, fontSize: 14,
            fontFamily: "Inter, sans-serif",
            textShadow: `0 0 8px ${item.neonAccent}80`,
          }}>
            @{item.handle}
          </span>
          {!following && (
            <button
              onClick={() => setFollowing(true)}
              style={{
                background: "rgba(255,255,255,0.12)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: 20, padding: "3px 12px",
                cursor: "pointer", color: "#fff", fontSize: 12, fontWeight: 700,
                fontFamily: "Inter, sans-serif",
              }}
            >
              Follow
            </button>
          )}
        </div>
        <p style={{
          margin: "0 0 8px 0", fontSize: 13, lineHeight: 1.55,
          color: "rgba(255,255,255,0.88)",
          fontFamily: "Inter, sans-serif",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textShadow: "0 1px 4px rgba(0,0,0,0.9)",
        }}>
          {item.caption}
        </p>
        {item.song && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 12px",
            background: "rgba(255,255,255,0.07)",
            backdropFilter: "blur(16px)",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.12)",
          }}>
            <motion.span
              style={{ fontSize: 12 }}
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            >
              🎵
            </motion.span>
            <span style={{
              color: "rgba(255,255,255,0.8)", fontSize: 11.5,
              fontFamily: "Inter, sans-serif", fontWeight: 500,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {item.song}
            </span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{
        position: "absolute", bottom: 68, left: 0, right: 0, height: 2,
        background: "rgba(255,255,255,0.1)", zIndex: 10,
      }}>
        <motion.div
          style={{
            height: "100%",
            background: `linear-gradient(90deg, ${item.neonAccent}, #fff)`,
            boxShadow: `0 0 6px ${item.neonAccent}`,
            width: "0%",
          }}
          animate={isActive ? { width: "100%" } : { width: "0%" }}
          transition={isActive ? { duration: item.type === "snap" ? 8 : 15, ease: "linear" } : { duration: 0 }}
        />
      </div>
    </div>
  );
}

// ─── SwipeDownFeed ────────────────────────────────────────────────

interface SwipeDownFeedProps {
  onClose?: () => void;
}

export function SwipeDownFeed({ onClose }: SwipeDownFeedProps) {
  const router = useRouter();
  const { preferences } = useFrontendPreferences();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [handoffDraft, setHandoffDraft] = useState("");
  const [handoffPreview, setHandoffPreview] = useState<HandoffPreview>(() =>
    buildHandoffPreview(FEED_ITEMS[0]!, "chat", true, "instant"),
  );
  const startY = useRef(0);
  const isDragging = useRef(false);
  const lastNavigationAtRef = useRef(0);

  const currentItem = FEED_ITEMS[currentIndex]!;
  const channelHref = resolveChannelHref(currentItem);
  const callHref = `/call/${encodeURIComponent(currentItem.handle)}?name=${encodeURIComponent(currentItem.username)}`;
  const compactLayout = preferences.compactChatLayout;
  const cardBottomOffset = compactLayout ? 6 : 8;

  const moveFeed = useCallback((direction: 1 | -1) => {
    const now = Date.now();
    if (now - lastNavigationAtRef.current < 220) return;
    lastNavigationAtRef.current = now;

    setCurrentIndex((index) => {
      const next = Math.min(FEED_ITEMS.length - 1, Math.max(0, index + direction));
      return next;
    });
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0]?.clientY ?? 0;
    isDragging.current = true;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const delta = startY.current - (e.changedTouches[0]?.clientY ?? 0);
    if (delta > 55) moveFeed(1);
    if (delta < -55) moveFeed(-1);
    isDragging.current = false;
  };

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.deltaY > 40) moveFeed(1);
      if (e.deltaY < -40) moveFeed(-1);
    },
    [moveFeed],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveFeed(1);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveFeed(-1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveFeed]);

  useEffect(() => {
    setHandoffPreview((existing) => ({
      ...existing,
      status: makeDeliveryStatus(preferences.readReceiptsEnabled, preferences.readReceiptMode),
    }));
  }, [preferences.readReceiptMode, preferences.readReceiptsEnabled]);

  const shareToSurface = useCallback((target: HandoffTarget) => {
    setHandoffPreview(
      buildHandoffPreview(
        currentItem,
        target,
        preferences.readReceiptsEnabled,
        preferences.readReceiptMode,
        handoffDraft,
      ),
    );
    setHandoffDraft("");
  }, [currentItem, handoffDraft, preferences.readReceiptMode, preferences.readReceiptsEnabled]);

  if (showCamera) {
    return (
      <AICamera
        onClose={() => setShowCamera(false)}
        onSendSnap={(_, filterPrompt) => {
          console.log("Snap sent with filter:", filterPrompt);
          setShowCamera(false);
        }}
      />
    );
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      style={{
        width: "100%", height: "100%",
        overflow: "hidden", position: "relative",
        background: "#000", userSelect: "none",
      }}
    >
      {/* Feed cards */}
      <AnimatePresence initial={false} custom={currentIndex}>
        <motion.div
          key={currentIndex}
          style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}
          initial={{ y: "100%", opacity: 0.6 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0.5 }}
          transition={{ type: "spring", stiffness: 300, damping: 32 }}
        >
          <FeedCard item={currentItem} isActive={true} />
        </motion.div>
      </AnimatePresence>

      {/* Top bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
        padding: "12px 16px 0",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: "rgba(0,0,0,0.4)", backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "50%", width: 36, height: 36,
                cursor: "pointer", color: "#fff", fontSize: 16,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              ←
            </button>
          )}
          <span style={{
            fontSize: 17, fontWeight: 800, color: "#fff",
            fontFamily: "Inter, sans-serif",
            textShadow: "0 0 20px rgba(109,74,255,0.5)",
          }}>
            QuantFeed
          </span>
        </div>

        {/* Camera button */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowCamera(true)}
          style={{
            background: "linear-gradient(135deg, #6d4aff, #bf5af2)",
            border: "none", borderRadius: 22,
            padding: "8px 14px",
            cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
            boxShadow: "0 0 16px rgba(109,74,255,0.6)",
          }}
        >
          <span style={{ fontSize: 16 }}>📸</span>
          <span style={{
            fontSize: 12.5, fontWeight: 700, color: "#fff",
            fontFamily: "Inter, sans-serif",
          }}>
            Snap
          </span>
        </motion.button>
      </div>

      <div style={{ position: "absolute", left: 12, right: 12, top: 56, zIndex: 21 }}>
        <SurfaceSwitchRail
          active="feed"
          channelHref={channelHref}
          callHref={callHref}
          compact={compactLayout}
        />
      </div>

      {/* Scroll position dots */}
      <div style={{
        position: "absolute", right: 4, top: "50%",
        transform: "translateY(-50%)",
        display: "flex", flexDirection: "column", gap: 5, zIndex: 20,
      }}>
        {FEED_ITEMS.map((_, i) => (
          <motion.div
            key={i}
            onClick={() => {
              lastNavigationAtRef.current = Date.now();
              setCurrentIndex(i);
            }}
            animate={{
              width: i === currentIndex ? 4 : 3,
              height: i === currentIndex ? 20 : 6,
              opacity: i === currentIndex ? 1 : 0.35,
            }}
            transition={{ duration: 0.2 }}
            style={{
              borderRadius: 3, cursor: "pointer",
              background: i === currentIndex
                ? (FEED_ITEMS[i]?.neonAccent ?? "#00f5ff")
                : "rgba(255,255,255,0.3)",
              boxShadow: i === currentIndex
                ? `0 0 6px ${FEED_ITEMS[i]?.neonAccent ?? "#00f5ff"}`
                : "none",
            }}
          />
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: 10,
          right: 10,
          bottom: cardBottomOffset,
          zIndex: 24,
          display: "flex",
          flexDirection: "column",
          gap: compactLayout ? 6 : 8,
        }}
      >
        <ConversationHandoffPanel
          title="Conversation Handoff"
          subtitle="Share this moment into chat, channels, or a live call with consistent receipts."
          preview={handoffPreview}
          reactionsEnabled={preferences.reactionsEnabled}
          readReceiptsEnabled={preferences.readReceiptsEnabled}
          readReceiptMode={preferences.readReceiptMode}
          compactLayout={compactLayout}
          accent={currentItem.neonAccent}
        />

        <div
          style={{
            borderRadius: 12,
            background: "rgba(11,20,26,0.8)",
            border: "1px solid rgba(255,255,255,0.12)",
            backdropFilter: "blur(14px)",
            padding: compactLayout ? "8px 9px" : "9px 10px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <input
            value={handoffDraft}
            onChange={(event) => setHandoffDraft(event.target.value)}
            placeholder="Add a note before sharing"
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              outline: "none",
              color: "#e9edef",
              padding: compactLayout ? "7px 10px" : "8px 11px",
              fontSize: compactLayout ? 12 : 12.5,
              fontFamily: "-apple-system, sans-serif",
              minWidth: 0,
            }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => {
                shareToSurface("chat");
                router.push("/chat");
              }}
              style={{
                borderRadius: 10,
                border: "1px solid rgba(0,168,132,0.55)",
                background: "rgba(0,168,132,0.24)",
                color: "#d9fff4",
                padding: compactLayout ? "7px 9px" : "8px 10px",
                fontSize: compactLayout ? 11 : 11.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              DM
            </button>
            <button
              type="button"
              onClick={() => {
                shareToSurface("channel");
                router.push(channelHref);
              }}
              style={{
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.08)",
                color: "#e9edef",
                padding: compactLayout ? "7px 9px" : "8px 10px",
                fontSize: compactLayout ? 11 : 11.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Channel
            </button>
            <button
              type="button"
              onClick={() => {
                shareToSurface("call");
                router.push(callHref);
              }}
              style={{
                borderRadius: 10,
                border: `1px solid ${currentItem.neonAccent}80`,
                background: `${currentItem.neonAccent}30`,
                color: "#f8fbff",
                padding: compactLayout ? "7px 9px" : "8px 10px",
                fontSize: compactLayout ? 11 : 11.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Call
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────

export default function FeedPage() {
  return (
    <div style={{ width: "100%", height: "100%", background: "#000" }}>
      <SwipeDownFeed onClose={() => { window.history.back(); }} />
    </div>
  );
}
