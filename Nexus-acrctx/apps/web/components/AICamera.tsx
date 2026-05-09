"use client";

/**
 * components/AICamera.tsx
 *
 * AI Camera — Phase 2 Social Engine
 *
 * Features:
 *  - Snap / photo capture UI (camera preview placeholder)
 *  - Generative AI filter text input (e.g., "Make me look cyberpunk")
 *  - Timer, flash, and flip controls
 *  - Glassmorphic pitch-black UI with Framer Motion transitions
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ───────────────────────────────────────────────────────

interface AIFilter {
  id: string;
  label: string;
  icon: string;
  gradient: string;
  neon: string;
}

// ─── Preset AI Filters ───────────────────────────────────────────

const PRESET_FILTERS: AIFilter[] = [
  { id: "none",      label: "None",       icon: "○",  gradient: "transparent",                                  neon: "#ffffff" },
  { id: "cyberpunk", label: "Cyberpunk",  icon: "⚡",  gradient: "linear-gradient(135deg,#00f5ff30,#bf5af230)", neon: "#00f5ff" },
  { id: "neon_god",  label: "Neon God",   icon: "👾",  gradient: "linear-gradient(135deg,#6d4aff30,#ff2d7830)", neon: "#6d4aff" },
  { id: "anime",     label: "Anime",      icon: "✨",  gradient: "linear-gradient(135deg,#e91e8c30,#ff6b3530)", neon: "#e91e8c" },
  { id: "glitch",    label: "Glitch",     icon: "📡",  gradient: "linear-gradient(135deg,#ff2d7830,#00f5ff30)", neon: "#ff2d78" },
  { id: "vaporwave", label: "Vaporwave",  icon: "🌆",  gradient: "linear-gradient(135deg,#bf5af230,#e91e8c30)", neon: "#bf5af2" },
];

// ─── Main Component ──────────────────────────────────────────────

interface AICameraProps {
  onClose?: () => void;
  onSendSnap?: (imageDataUrl: string, filterPrompt: string) => void;
}

export default function AICamera({ onClose, onSendSnap }: AICameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<AIFilter>(PRESET_FILTERS[0]!);
  const [customPrompt, setCustomPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedFilter, setGeneratedFilter] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [flash, setFlash] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [capturedSnap, setCapturedSnap] = useState<string | null>(null);
  const [snapSent, setSnapSent] = useState(false);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      });
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      setCameraError(null);
    } catch {
      setCameraError("Camera access denied or not available.");
    }
  }, [facingMode, stream]);

  useEffect(() => {
    startCamera();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  // Capture snap
  const captureSnap = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedSnap(dataUrl);
  }, []);

  const handleCapture = () => {
    if (timerSeconds > 0) {
      let t = timerSeconds;
      setCountdown(t);
      const tick = setInterval(() => {
        t -= 1;
        if (t === 0) {
          clearInterval(tick);
          setCountdown(null);
          if (flash) triggerFlash();
          captureSnap();
        } else {
          setCountdown(t);
        }
      }, 1000);
    } else {
      if (flash) triggerFlash();
      captureSnap();
    }
  };

  const triggerFlash = () => {
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 200);
  };

  const handleGenerateFilter = async () => {
    if (!customPrompt.trim()) return;
    setIsGenerating(true);
    // Simulate AI filter generation (in prod: call AI API with frame)
    await new Promise((r) => setTimeout(r, 1400));
    setGeneratedFilter(customPrompt.trim());
    setActiveFilter({
      id: "custom",
      label: customPrompt.trim().slice(0, 18),
      icon: "🤖",
      gradient: "linear-gradient(135deg,#00f5ff20,#6d4aff20,#ff2d7820)",
      neon: "#00f5ff",
    });
    setIsGenerating(false);
  };

  const handleSend = () => {
    if (!capturedSnap) return;
    onSendSnap?.(capturedSnap, generatedFilter ?? activeFilter.label);
    setSnapSent(true);
    setTimeout(() => {
      setSnapSent(false);
      setCapturedSnap(null);
      setGeneratedFilter(null);
    }, 1200);
  };

  const NEON = activeFilter.neon;

  return (
    <div style={{
      position: "relative",
      width: "100%",
      height: "100%",
      background: "#000",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* ── Flash overlay ── */}
      <AnimatePresence>
        {flashActive && (
          <motion.div
            key="flash"
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: "absolute", inset: 0, background: "#fff", zIndex: 100, pointerEvents: "none" }}
          />
        )}
      </AnimatePresence>

      {/* ── Camera preview / captured snap ── */}
      <div style={{
        flex: 1,
        position: "relative",
        overflow: "hidden",
        background: "#0a0a0a",
      }}>
        {/* Video element */}
        {!capturedSnap && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: facingMode === "user" ? "scaleX(-1)" : "none",
              display: cameraError ? "none" : "block",
            }}
          />
        )}

        {/* Hidden canvas for capture */}
        <canvas ref={canvasRef} style={{ display: "none" }} />

        {/* Captured snap preview */}
        {capturedSnap && (
          <img
            src={capturedSnap}
            alt="Snap preview"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: facingMode === "user" ? "scaleX(-1)" : "none",
            }}
          />
        )}

        {/* Camera error placeholder */}
        {cameraError && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "radial-gradient(ellipse at 50% 40%, #1a003380 0%, #000 70%)",
          }}>
            <span style={{ fontSize: 56 }}>📷</span>
            <p style={{
              color: "#8696a0", fontSize: 13, fontFamily: "Inter, sans-serif",
              textAlign: "center", padding: "0 24px", marginTop: 12,
            }}>
              {cameraError}
            </p>
          </div>
        )}

        {/* Active filter overlay */}
        {activeFilter.id !== "none" && (
          <div style={{
            position: "absolute", inset: 0,
            background: activeFilter.gradient,
            mixBlendMode: "screen",
            pointerEvents: "none",
          }} />
        )}

        {/* Generated filter label */}
        {generatedFilter && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              position: "absolute", top: 60, left: "50%", transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(16px)",
              border: `1px solid ${NEON}60`,
              borderRadius: 20,
              padding: "5px 14px",
              zIndex: 20,
            }}
          >
            <span style={{ fontSize: 11.5, color: NEON, fontFamily: "Inter, sans-serif", fontWeight: 600 }}>
              🤖 {generatedFilter}
            </span>
          </motion.div>
        )}

        {/* Countdown overlay */}
        <AnimatePresence>
          {countdown !== null && (
            <motion.div
              key={countdown}
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                zIndex: 30,
              }}
            >
              <span style={{
                fontSize: 96, fontWeight: 900, color: "#fff",
                textShadow: `0 0 40px ${NEON}, 0 0 80px ${NEON}60`,
                fontFamily: "Inter, sans-serif",
              }}>
                {countdown}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top controls */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0,
          padding: "14px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          zIndex: 20,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)",
        }}>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: "rgba(0,0,0,0.4)", backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "50%", width: 38, height: 38,
                cursor: "pointer", color: "#fff", fontSize: 18,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              ✕
            </button>
          )}

          <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
            {/* Flash toggle */}
            <button
              onClick={() => setFlash((v) => !v)}
              style={{
                background: flash ? "rgba(255,220,0,0.25)" : "rgba(0,0,0,0.4)",
                backdropFilter: "blur(12px)",
                border: `1px solid ${flash ? "rgba(255,220,0,0.5)" : "rgba(255,255,255,0.15)"}`,
                borderRadius: "50%", width: 38, height: 38,
                cursor: "pointer", fontSize: 18,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {flash ? "⚡" : "🔦"}
            </button>

            {/* Timer */}
            <button
              onClick={() => setTimerSeconds((t) => (t === 0 ? 3 : t === 3 ? 10 : 0))}
              style={{
                background: timerSeconds > 0 ? "rgba(109,74,255,0.3)" : "rgba(0,0,0,0.4)",
                backdropFilter: "blur(12px)",
                border: `1px solid ${timerSeconds > 0 ? "rgba(109,74,255,0.5)" : "rgba(255,255,255,0.15)"}`,
                borderRadius: "50%", width: 38, height: 38,
                cursor: "pointer", color: timerSeconds > 0 ? "#bf5af2" : "#fff",
                fontSize: 13, fontWeight: 700, fontFamily: "Inter, sans-serif",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {timerSeconds > 0 ? `${timerSeconds}s` : "⏱"}
            </button>

            {/* Flip camera */}
            <button
              onClick={() => setFacingMode((m) => (m === "user" ? "environment" : "user"))}
              style={{
                background: "rgba(0,0,0,0.4)", backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "50%", width: 38, height: 38,
                cursor: "pointer", fontSize: 18,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              🔄
            </button>
          </div>
        </div>
      </div>

      {/* ── Bottom controls ── */}
      <div style={{
        flexShrink: 0,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        padding: "12px 16px 20px",
      }}>
        {/* Filter strip */}
        <div style={{
          display: "flex", gap: 10, overflowX: "auto",
          paddingBottom: 12, marginBottom: 12,
        }}>
          {PRESET_FILTERS.map((f) => (
            <motion.button
              key={f.id}
              whileTap={{ scale: 0.9 }}
              onClick={() => { setActiveFilter(f); setGeneratedFilter(null); }}
              style={{
                flexShrink: 0,
                width: 56, height: 56, borderRadius: 14,
                background: f.gradient || "rgba(255,255,255,0.05)",
                border: `2px solid ${activeFilter.id === f.id ? f.neon : "rgba(255,255,255,0.08)"}`,
                cursor: "pointer",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 3,
                boxShadow: activeFilter.id === f.id ? `0 0 12px ${f.neon}60` : "none",
              }}
            >
              <span style={{ fontSize: 20 }}>{f.icon}</span>
              <span style={{
                fontSize: 8.5, fontWeight: 700, color: activeFilter.id === f.id ? f.neon : "#8696a0",
                fontFamily: "Inter, sans-serif",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                maxWidth: 52, textAlign: "center",
              }}>
                {f.label}
              </span>
            </motion.button>
          ))}
        </div>

        {/* AI Prompt input */}
        <div style={{
          display: "flex", gap: 8, marginBottom: 14,
        }}>
          <div style={{
            flex: 1,
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${isGenerating ? "#00f5ff60" : "rgba(255,255,255,0.1)"}`,
            borderRadius: 22,
            padding: "9px 14px",
            display: "flex", alignItems: "center", gap: 8,
            transition: "border-color 0.2s",
          }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>🤖</span>
            <input
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleGenerateFilter(); }}
              placeholder='Try "Make me cyberpunk" or "Anime style"'
              style={{
                background: "none", border: "none", outline: "none",
                color: "#e9edef", fontSize: 13, width: "100%",
                fontFamily: "Inter, sans-serif",
              }}
            />
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleGenerateFilter}
            disabled={!customPrompt.trim() || isGenerating}
            style={{
              background: customPrompt.trim() ? "linear-gradient(135deg, #00f5ff, #6d4aff)" : "rgba(255,255,255,0.07)",
              border: "none", borderRadius: 22,
              padding: "9px 16px",
              cursor: customPrompt.trim() ? "pointer" : "default",
              color: "#fff", fontSize: 12.5, fontWeight: 700,
              fontFamily: "Inter, sans-serif",
              whiteSpace: "nowrap",
              boxShadow: customPrompt.trim() ? "0 0 14px rgba(0,245,255,0.4)" : "none",
            }}
          >
            {isGenerating ? "…" : "Apply ✨"}
          </motion.button>
        </div>

        {/* Capture / Send row */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 20,
        }}>
          {/* Gallery (placeholder) */}
          <button style={{
            width: 44, height: 44, borderRadius: 12,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            cursor: "pointer", fontSize: 22,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            🖼️
          </button>

          {/* Capture button */}
          <AnimatePresence mode="wait">
            {!capturedSnap ? (
              <motion.button
                key="capture"
                whileTap={{ scale: 0.93 }}
                onClick={handleCapture}
                style={{
                  width: 72, height: 72, borderRadius: "50%",
                  background: "transparent",
                  border: `3px solid ${NEON}`,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 0 20px ${NEON}60, 0 0 40px ${NEON}30`,
                  position: "relative",
                }}
              >
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: "#fff",
                }} />
              </motion.button>
            ) : (
              <motion.button
                key="retake"
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                whileTap={{ scale: 0.93 }}
                onClick={() => { setCapturedSnap(null); setGeneratedFilter(null); }}
                style={{
                  width: 72, height: 72, borderRadius: "50%",
                  background: "rgba(255,255,255,0.07)",
                  border: "2px solid rgba(255,255,255,0.2)",
                  cursor: "pointer", color: "#e9edef", fontSize: 13,
                  fontFamily: "Inter, sans-serif", fontWeight: 600,
                }}
              >
                Retake
              </motion.button>
            )}
          </AnimatePresence>

          {/* Send snap button */}
          <AnimatePresence>
            {capturedSnap ? (
              <motion.button
                key="send"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleSend}
                style={{
                  width: 52, height: 52, borderRadius: "50%",
                  background: snapSent
                    ? "linear-gradient(135deg, #00a884, #00f5ff)"
                    : "linear-gradient(135deg, #6d4aff, #bf5af2)",
                  border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22,
                  boxShadow: "0 0 18px rgba(109,74,255,0.6)",
                }}
              >
                {snapSent ? "✓" : "📤"}
              </motion.button>
            ) : (
              <div style={{ width: 44, height: 44 }} />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
