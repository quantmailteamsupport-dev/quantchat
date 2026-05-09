"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ───────────────────────────────────────────────────────
interface Reel {
  id: string;
  username: string;
  handle: string;
  caption: string;
  song: string;
  likes: string;
  comments: string;
  shares: string;
  sends: string;
  saves: string;
  avatarColor: string;
  avatarLetter: string;
  bg: string;
  /** Per-reel accent hex color used for neon glow effects (e.g. "#bf5af2") */
  neonAccent: string;
  following: boolean;
}

// ─── Data ────────────────────────────────────────────────────────
const REELS: Reel[] = [
  {
    id: "r1",
    username: "Aryan Sharma",
    handle: "aryan.sharma",
    caption: "Just shipped the NativeAI Core. 🧠⚡ Running fully offline on-device. No cloud needed. #QuantAI #OfflineFirst",
    song: "Kesariya — Arijit Singh",
    likes: "4,012", comments: "847", shares: "1.2K", sends: "318", saves: "906",
    avatarColor: "#6d4aff", avatarLetter: "A",
    bg: "radial-gradient(ellipse at 20% 80%, #1a003380 0%, transparent 60%), radial-gradient(ellipse at 80% 10%, #00f5ff18 0%, transparent 55%), linear-gradient(180deg,#0d001a 0%,#040008 100%)",
    neonAccent: "#bf5af2",
    following: false,
  },
  {
    id: "r2",
    username: "Noor",
    handle: "noor.ai.twin",
    caption: "My AI Twin replied before I could 😂 The future is weird. #DigitalTwin #Quantchat",
    song: "Original Sound — Noor",
    likes: "22.3K", comments: "750", shares: "2,560", sends: "15.4K", saves: "18.2K",
    avatarColor: "#e91e8c", avatarLetter: "N",
    bg: "radial-gradient(ellipse at 75% 85%, #ff2d7830 0%, transparent 55%), radial-gradient(ellipse at 20% 15%, #bf5af218 0%, transparent 50%), linear-gradient(180deg,#120009 0%,#000 100%)",
    neonAccent: "#ff2d78",
    following: true,
  },
  {
    id: "r3",
    username: "Priya Mehta",
    handle: "priya.creates",
    caption: "POV: You built a whole social platform from scratch in a month 💪 @Quantchat #BuildInPublic",
    song: "Raataan Lambiyan — Jubin Nautiyal",
    likes: "1,565", comments: "27", shares: "431", sends: "232", saves: "189",
    avatarColor: "#0288b0", avatarLetter: "P",
    bg: "radial-gradient(ellipse at 30% 70%, #00f5ff22 0%, transparent 55%), radial-gradient(ellipse at 70% 20%, #39ff1412 0%, transparent 50%), linear-gradient(180deg,#000d12 0%,#000 100%)",
    neonAccent: "#00f5ff",
    following: false,
  },
  {
    id: "r4",
    username: "Nexus Dev",
    handle: "nexus.official",
    caption: "E2EE + WebRTC + AI Twin. One app. Zero servers reading your messages. 🔐 #Privacy #Quantchat",
    song: "Trending Sound — Quantchat",
    likes: "8.7K", comments: "1.2K", shares: "940", sends: "2.1K", saves: "3.4K",
    avatarColor: "#ff6b35", avatarLetter: "N",
    bg: "radial-gradient(ellipse at 60% 80%, #ff6b3525 0%, transparent 55%), radial-gradient(ellipse at 20% 20%, #bf5af215 0%, transparent 50%), linear-gradient(180deg,#120600 0%,#000 100%)",
    neonAccent: "#ff6b35",
    following: true,
  },
];

// ─── Neon Orb (background art) ───────────────────────────────────
function NeonOrbs({ accent }: { accent: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* large ambient orb */}
      <motion.div
        style={{
          position: "absolute",
          width: 340, height: 340,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}28 0%, transparent 70%)`,
          top: "15%", left: "50%", transform: "translateX(-50%)",
          filter: "blur(40px)",
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.9, 0.6] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* secondary orb */}
      <motion.div
        style={{
          position: "absolute",
          width: 180, height: 180,
          borderRadius: "50%",
          background: `radial-gradient(circle, #00f5ff18 0%, transparent 70%)`,
          bottom: "28%", right: "8%",
          filter: "blur(30px)",
        }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
      {/* corner flare */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: 180,
        background: `linear-gradient(135deg, ${accent}0f 0%, transparent 60%)`,
        pointerEvents: "none",
      }} />
    </div>
  );
}

// ─── Engagement Button ────────────────────────────────────────────
function EngBtn({
  icon, count, active, onTap,
}: { icon: string; count: string; active?: boolean; onTap?: () => void }) {
  const [pressed, setPressed] = useState(false);
  const isActive = active || pressed;

  const tap = () => {
    setPressed(p => !p);
    onTap?.();
  };

  return (
    <button
      onClick={tap}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 3, background: "none", border: "none", cursor: "pointer",
        padding: "5px 0",
      }}
    >
      <motion.span
        whileTap={{ scale: 1.35 }}
        style={{
          fontSize: 26,
          display: "block",
          transition: "filter 0.15s ease",
          filter: isActive
            ? "drop-shadow(0 0 6px rgba(255,45,120,0.95)) drop-shadow(0 0 14px rgba(255,45,120,0.5))"
            : "drop-shadow(0 0 3px rgba(255,255,255,0.25))",
        }}
      >
        {icon}
      </motion.span>
      {count && (
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: isActive ? "#ff2d78" : "rgba(255,255,255,0.9)",
          fontFamily: "Inter, -apple-system, sans-serif",
          lineHeight: 1,
          textShadow: isActive ? "0 0 6px rgba(255,45,120,0.7)" : "none",
          transition: "color 0.15s, text-shadow 0.15s",
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Single Reel Card ─────────────────────────────────────────────
function ReelCard({ reel, isActive }: { reel: Reel; isActive: boolean }) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [following, setFollowing] = useState(reel.following);
  const [muted, setMuted] = useState(false);

  return (
    <div style={{
      position: "relative",
      width: "100%",
      height: "100%",
      background: reel.bg,
      overflow: "hidden",
      flexShrink: 0,
    }}>
      {/* ── Animated neon orb background ── */}
      <NeonOrbs accent={reel.neonAccent} />

      {/* ── Center visual art (large ghost letter) ── */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "none",
      }}>
        <motion.div
          style={{
            width: 200, height: 200, borderRadius: "50%",
            background: `radial-gradient(circle, ${reel.avatarColor}22 0%, transparent 70%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 96, fontWeight: 900,
            color: reel.avatarColor,
            opacity: isActive ? 0.12 : 0.06,
            filter: `blur(1px) drop-shadow(0 0 32px ${reel.neonAccent}60)`,
            userSelect: "none",
          }}
          animate={isActive ? { opacity: [0.10, 0.14, 0.10] } : { opacity: 0.06 }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          {reel.avatarLetter}
        </motion.div>
      </div>

      {/* ── Scanline texture overlay ── */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)",
        zIndex: 1,
      }} />

      {/* ── Gradient overlay (bottom darkening) ── */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "72%",
        background: "linear-gradient(to top, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.65) 42%, rgba(0,0,0,0.15) 72%, transparent 100%)",
        pointerEvents: "none",
        zIndex: 2,
      }} />

      {/* ── Top bar ── */}
      <div style={{
        position: "absolute", top: 14, left: 0, right: 0, zIndex: 10,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 16px",
      }}>
        {/* Reels title */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className="reels-title">Reels</span>
          <span style={{
            color: "rgba(255,255,255,0.5)", fontSize: 11,
            textShadow: "0 0 6px rgba(255,255,255,0.3)",
          }}>▾</span>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{
            color: "rgba(255,255,255,0.75)", fontSize: 13,
            fontFamily: "Inter, -apple-system, sans-serif",
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}>
            Friends
          </span>
          {/* Glass mute button */}
          <button
            onClick={() => setMuted(m => !m)}
            className="neon-mute-btn"
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      </div>

      {/* ── Right side engagement strip (glass panel) ── */}
      <div style={{
        position: "absolute", right: 10, bottom: 110, zIndex: 10,
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 2,
        padding: "12px 8px",
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderRadius: 24,
        border: `1px solid ${reel.neonAccent}30`,
        boxShadow: `0 0 18px ${reel.neonAccent}18, inset 0 0 12px rgba(255,255,255,0.03)`,
      }}>
        {/* Creator avatar with neon ring */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <div style={{
            width: 46, height: 46, borderRadius: "50%",
            background: `radial-gradient(circle at 35% 35%, ${reel.avatarColor}ee, ${reel.avatarColor}88)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 19, fontWeight: 800, color: "#fff",
            fontFamily: "Inter, -apple-system, sans-serif",
            boxShadow: `0 0 0 2px ${reel.neonAccent}, 0 0 12px ${reel.neonAccent}90, 0 0 24px ${reel.neonAccent}40`,
            letterSpacing: "-0.01em",
          }}>
            {reel.avatarLetter}
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
                fontSize: 14, color: "#fff", fontWeight: 900,
                border: "2px solid #000",
                boxShadow: "0 0 8px rgba(255,45,120,0.7)",
                cursor: "pointer",
              }}
            >
              +
            </motion.div>
          )}
        </div>

        <EngBtn
          icon={liked ? "❤️" : "🤍"}
          count={reel.likes}
          active={liked}
          onTap={() => setLiked(l => !l)}
        />
        <EngBtn icon="💬" count={reel.comments} />
        <EngBtn icon="🔁" count={reel.shares} />
        <EngBtn icon="📨" count={reel.sends} />
        <EngBtn
          icon={saved ? "🔖" : "📑"}
          count={reel.saves}
          active={saved}
          onTap={() => setSaved(s => !s)}
        />
        <EngBtn icon="⋯" count="" />
      </div>

      {/* ── Bottom-left creator info (glass overlay) ── */}
      <div style={{
        position: "absolute", bottom: 82, left: 12, right: 76, zIndex: 10,
      }}>
        {/* Username + Follow */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{
            color: "#fff", fontWeight: 800, fontSize: 14,
            fontFamily: "Inter, -apple-system, sans-serif",
            letterSpacing: "0.01em",
            textShadow: `0 0 8px ${reel.neonAccent}80, 0 1px 3px rgba(0,0,0,0.9)`,
          }}>
            @{reel.handle}
          </span>
          {!following && (
            <button
              onClick={() => setFollowing(true)}
              className="neon-follow-btn"
            >
              Follow
            </button>
          )}
        </div>

        {/* Caption */}
        <p style={{
          color: "rgba(255,255,255,0.88)",
          fontSize: 13, lineHeight: 1.55, margin: "0 0 8px 0",
          fontFamily: "Inter, -apple-system, sans-serif",
          textShadow: "0 1px 4px rgba(0,0,0,0.9)",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          fontWeight: 400,
        }}>
          {reel.caption}
        </p>

        {/* Song — glass pill */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 12px",
          background: "rgba(255,255,255,0.07)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.12)",
          maxWidth: "100%",
          overflow: "hidden",
        }}>
          <motion.span
            style={{ fontSize: 12, display: "block" }}
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          >
            🎵
          </motion.span>
          <span style={{
            color: "rgba(255,255,255,0.8)", fontSize: 11.5,
            fontFamily: "Inter, -apple-system, sans-serif",
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {reel.song}
          </span>
        </div>
      </div>

      {/* ── Neon progress bar at bottom ── */}
      <div
        className="neon-progress-track"
        style={{ position: "absolute", bottom: 68, left: 0, right: 0, zIndex: 10 }}
      >
        <motion.div
          className="neon-progress-bar"
          style={{ width: "0%" }}
          animate={isActive ? { width: "100%" } : { width: "0%" }}
          transition={isActive ? { duration: 15, ease: "linear" } : { duration: 0 }}
        />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
export default function ReelsPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const startY = useRef<number>(0);
  const isDragging = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0]?.clientY ?? 0;
    isDragging.current = true;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const delta = startY.current - (e.changedTouches[0]?.clientY ?? 0);
    if (delta > 60 && currentIndex < REELS.length - 1) setCurrentIndex(i => i + 1);
    if (delta < -60 && currentIndex > 0) setCurrentIndex(i => i - 1);
    isDragging.current = false;
  };

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (e.deltaY > 40 && currentIndex < REELS.length - 1) setCurrentIndex(i => i + 1);
    if (e.deltaY < -40 && currentIndex > 0) setCurrentIndex(i => i - 1);
  }, [currentIndex]);

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      style={{
        width: "100%", height: "100%",
        overflow: "hidden", position: "relative",
        background: "#000",
        userSelect: "none",
      }}
    >
      {/* Reel stack */}
      <AnimatePresence initial={false} custom={currentIndex}>
        <motion.div
          key={currentIndex}
          style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}
          initial={{ y: "100%", opacity: 0.6 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0.6 }}
          transition={{ type: "spring", stiffness: 280, damping: 32 }}
        >
          <ReelCard reel={REELS[currentIndex]!} isActive={true} />
        </motion.div>
      </AnimatePresence>

      {/* Neon scroll indicator dots */}
      <div style={{
        position: "absolute", right: 4, top: "50%",
        transform: "translateY(-50%)",
        display: "flex", flexDirection: "column", gap: 5, zIndex: 20,
      }}>
        {REELS.map((r, i) => (
          <motion.div
            key={i}
            onClick={() => setCurrentIndex(i)}
            animate={{
              width: i === currentIndex ? 4 : 3,
              height: i === currentIndex ? 20 : 6,
              opacity: i === currentIndex ? 1 : 0.4,
            }}
            transition={{ duration: 0.2 }}
            style={{
              borderRadius: 3,
              cursor: "pointer",
              background: i === currentIndex
                ? (REELS[i]?.neonAccent ?? "#00f5ff")
                : "rgba(255,255,255,0.35)",
              boxShadow: i === currentIndex
                ? `0 0 6px ${REELS[i]?.neonAccent ?? "#00f5ff"}cc, 0 0 12px ${REELS[i]?.neonAccent ?? "#00f5ff"}66`
                : "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}
