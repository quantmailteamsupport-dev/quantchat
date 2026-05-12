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

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import AICamera from "@/components/AICamera";
import ConversationHandoffPanel, { type HandoffPreview } from "@/components/ConversationHandoffPanel";
import SurfaceSwitchRail from "@/components/SurfaceSwitchRail";
import { useFrontendPreferences, type ReadReceiptMode } from "@/lib/useFrontendPreferences";
import type { MessageStatus } from "@/lib/db";
import { useFeed, formatCount, type FeedItem as ApiFeedItem } from "@/lib/feed";

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
  liked?: boolean;
}

function adaptApiFeedItem(item: ApiFeedItem): FeedItem {
  return {
    id: item.id,
    type: item.type === "story" ? "story" : item.type,
    username: item.username,
    handle: item.handle,
    caption: item.caption,
    song: item.song,
    likes: formatCount(item.likes),
    comments: formatCount(item.comments),
    shares: formatCount(item.shares),
    avatarColor: item.avatarColor,
    avatarLetter: item.avatarLetter,
    bg: item.bg,
    neonAccent: item.neonAccent,
    following: item.following,
    isNew: item.isNew,
    snapExpiry: item.snapExpiry,
    liked: item.liked,
  };
}

// Feed items are fetched from /api/feed via useFeed() inside SwipeDownFeed.
// The previous hardcoded FEED_ITEMS array was migrated to the API-backed
// store at apps/api-gateway/src/services/FeedStore.ts.

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

function FeedCard({ item, isActive, onLike }: { item: FeedItem; isActive: boolean; onLike?: () => void }) {
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
        <button
          onClick={onLike}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 3, background: "none", border: "none", cursor: "pointer", padding: "4px 0",
          }}
        >
          <motion.span
            whileTap={{ scale: 1.35 }}
            style={{
              fontSize: 26, display: "block",
              filter: item.liked
                ? "drop-shadow(0 0 6px rgba(255,45,120,0.95))"
                : "drop-shadow(0 0 3px rgba(255,255,255,0.25))",
              transition: "filter 0.15s",
            }}
          >
            {item.liked ? "❤️" : "🤍"}
          </motion.span>
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: item.liked ? "#ff2d78" : "rgba(255,255,255,0.9)",
            fontFamily: "Inter, sans-serif",
          }}>
            {item.likes}
          </span>
        </button>
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

const PLACEHOLDER_FEED_ITEM: FeedItem = {
  id: "__placeholder__",
  type: "snap",
  username: "",
  handle: "",
  caption: "",
  likes: "0",
  comments: "0",
  shares: "0",
  avatarColor: "#222",
  avatarLetter: "?",
  bg: "#000",
  neonAccent: "#00f5ff",
  following: false,
};

export function SwipeDownFeed({ onClose }: SwipeDownFeedProps) {
  const router = useRouter();
  const { preferences } = useFrontendPreferences();
  const { data: apiItems, loading, error, toggleLike } = useFeed();
  const FEED_ITEMS = useMemo(() => apiItems.map(adaptApiFeedItem), [apiItems]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [handoffDraft, setHandoffDraft] = useState("");
  const [handoffPreview, setHandoffPreview] = useState<HandoffPreview | null>(null);
  const startY = useRef(0);
  const isDragging = useRef(false);
  const lastNavigationAtRef = useRef(0);

  // Initialize handoff preview once data has loaded.
  useEffect(() => {
    if (!handoffPreview && FEED_ITEMS[0]) {
      setHandoffPreview(buildHandoffPreview(FEED_ITEMS[0], "chat", true, "instant"));
    }
  }, [FEED_ITEMS, handoffPreview]);

  // Clamp the index if the feed shrinks under us.
  useEffect(() => {
    if (FEED_ITEMS.length > 0 && currentIndex >= FEED_ITEMS.length) {
      setCurrentIndex(FEED_ITEMS.length - 1);
    }
  }, [FEED_ITEMS.length, currentIndex]);

  const currentItem = FEED_ITEMS[currentIndex] ?? PLACEHOLDER_FEED_ITEM;
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
    setHandoffPreview((existing) =>
      existing === null
        ? null
        : { ...existing, status: makeDeliveryStatus(preferences.readReceiptsEnabled, preferences.readReceiptMode) },
    );
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

  if (loading && FEED_ITEMS.length === 0) {
    return (
      <div style={{ width: "100%", height: "100%", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <motion.div
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", fontFamily: "Inter, sans-serif" }}>
            Loading feed…
          </span>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ width: "100%", height: "100%", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", fontFamily: "Inter, sans-serif" }}>
          Couldn't load feed
        </span>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "rgba(109,74,255,0.2)", border: "1px solid rgba(109,74,255,0.5)",
            borderRadius: 20, padding: "8px 20px",
            color: "#bf5af2", fontSize: 13, fontFamily: "Inter, sans-serif", cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!loading && FEED_ITEMS.length === 0) {
    return (
      <div style={{ width: "100%", height: "100%", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <span style={{ fontSize: 32 }}>📭</span>
        <span style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", fontFamily: "Inter, sans-serif" }}>
          Nothing in your feed yet
        </span>
      </div>
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
          <FeedCard item={currentItem} isActive={true} onLike={() => toggleLike(currentItem.id)} />
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
          preview={handoffPreview ?? buildHandoffPreview(currentItem, "chat", preferences.readReceiptsEnabled, preferences.readReceiptMode)}
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
