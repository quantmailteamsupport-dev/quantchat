"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface BiometricHandshakeProps {
  onVerified: () => void;
  onCancel: () => void;
  partnerName: string;
}

/**
 * BiometricHandshake — The "Obsidian-Class" Resonance Protocol
 * 
 * A high-fidelity, real-time shared UI that requires both users to maintain 
 * synchronous "resonance" (simultaneous screen contact) to unlock high-stakes threads.
 */
export default function BiometricHandshake({ onVerified, onCancel, partnerName }: BiometricHandshakeProps) {
  const [myResonance, setMyResonance] = useState(0); // 0 to 1
  const [partnerResonance, setPartnerResonance] = useState(0); // 0 to 1
  const [syncProgress, setSyncProgress] = useState(0); // 0 to 100
  const [isPressing, setIsPressing] = useState(false);
  const [touchPos, setTouchPos] = useState({ x: 0, y: 0 });
  const [isVerified, setIsVerified] = useState(false);
  
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Trigger haptic feedback if available
  const triggerHaptic = useCallback((intensity: number) => {
    if (typeof window !== "undefined" && window.navigator.vibrate) {
      window.navigator.vibrate(intensity);
    }
  }, []);

  // Handle local touch/press
  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsPressing(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setTouchPos({ x: clientX, y: clientY });
    setMyResonance(1);
    triggerHaptic(10);
  };

  const handleEnd = () => {
    setIsPressing(false);
    setMyResonance(0);
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isPressing) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.touches[0]?.clientX ?? (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.touches[0]?.clientY ?? (e as React.MouseEvent).clientY;
    setTouchPos({ x: clientX, y: clientY });
  };

  // Simulate partner resonance for the UI demo (In prod: this comes from Socket.io)
  useEffect(() => {
    if (isPressing) {
      const interval = setInterval(() => {
        // Partner "joins" after a brief delay if we are pressing
        setPartnerResonance(prev => Math.min(prev + 0.1, 1));
      }, 100);
      return () => clearInterval(interval);
    } else {
      setPartnerResonance(0);
    }
  }, [isPressing]);

  // Sync logic: Both must be at resonance 1
  useEffect(() => {
    if (myResonance === 1 && partnerResonance === 1) {
      const interval = setInterval(() => {
        setSyncProgress(prev => {
          const next = prev + 1.5;
          if (next >= 100) {
            clearInterval(interval);
            setIsVerified(true);
            triggerHaptic([30, 50, 80]);
            setTimeout(onVerified, 1200);
            return 100;
          }
          if (next % 10 < 1.5) triggerHaptic(5);
          return next;
        });
      }, 30);
      return () => clearInterval(interval);
    } else {
      setSyncProgress(prev => Math.max(0, prev - 2));
    }
  }, [myResonance, partnerResonance, onVerified, triggerHaptic]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#000",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      overflow: "hidden",
      fontFamily: "Inter, sans-serif",
    }}>
      {/* Background Gradients */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(circle at 50% 50%, #1a0033 0%, #000 70%)",
        opacity: 0.8,
      }} />

      {/* Resonance Rings (Visualizer) */}
      <AnimatePresence>
        {isPressing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute",
              left: touchPos.x, top: touchPos.y,
              width: 0, height: 0,
              pointerEvents: "none",
            }}
          >
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                initial={{ scale: 0, opacity: 0.8 }}
                animate={{ scale: 4 + i * 2, opacity: 0 }}
                transition={{
                  repeat: Infinity,
                  duration: 2 / (1 + syncProgress / 100),
                  delay: i * 0.4,
                  ease: "easeOut",
                }}
                style={{
                  position: "absolute",
                  left: -50, top: -50,
                  width: 100, height: 100,
                  borderRadius: "50%",
                  border: `2px solid ${syncProgress > 50 ? "#00f5ff" : "#bf5af2"}`,
                  boxShadow: `0 0 20px ${syncProgress > 50 ? "#00f5ff" : "#bf5af2"}60`,
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Partner's Ghost Resonance (Simulated) */}
      <AnimatePresence>
        {partnerResonance > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute",
              left: "50%", top: "30%",
              width: 0, height: 0,
              pointerEvents: "none",
            }}
          >
            {[1, 2].map((i) => (
              <motion.div
                key={i}
                initial={{ scale: 2, opacity: 0.5 }}
                animate={{ scale: 6, opacity: 0 }}
                transition={{
                  repeat: Infinity,
                  duration: 2.5,
                  delay: i * 0.6,
                  ease: "easeOut",
                }}
                style={{
                  position: "absolute",
                  left: -50, top: -50,
                  width: 100, height: 100,
                  borderRadius: "50%",
                  border: "1px dashed #00f5ff",
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main UI Overlay */}
      <div style={{ position: "relative", zIndex: 10, textAlign: "center", width: "100%", padding: "0 40px" }}>
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          style={{ marginBottom: 60 }}
        >
          <div style={{ fontSize: 12, fontWeight: 900, color: "#bf5af2", letterSpacing: 4, textTransform: "uppercase", marginBottom: 8 }}>
            Resonance Protocol
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "#fff", margin: 0 }}>
            Obsidian-Class Unlock
          </h1>
          <p style={{ color: "#8696a0", fontSize: 14, marginTop: 12, lineHeight: 1.5 }}>
            Synchronous biometric handshake required with <span style={{ color: "#00f5ff", fontWeight: 700 }}>{partnerName}</span>.
          </p>
        </motion.div>

        {/* The Touch Target */}
        <div style={{ position: "relative", height: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <motion.div
            onPointerDown={handleStart}
            onPointerUp={handleEnd}
            onPointerMove={handleMove}
            onPointerLeave={handleEnd}
            whileTap={{ scale: 0.95 }}
            style={{
              width: 140, height: 140, borderRadius: "50%",
              background: "rgba(255,255,255,0.03)",
              border: `2px solid ${isPressing ? "#00f5ff" : "rgba(255,255,255,0.1)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              boxShadow: isPressing ? "0 0 40px rgba(0,245,255,0.2)" : "none",
              transition: "border-color 0.3s, box-shadow 0.3s",
              touchAction: "none",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: 32, display: "block", marginBottom: 4 }}>
                {isVerified ? "✓" : "👆"}
              </span>
              <span style={{ fontSize: 10, fontWeight: 800, color: isPressing ? "#00f5ff" : "#8696a0" }}>
                {isPressing ? "RESONATING" : "HOLD HERE"}
              </span>
            </div>
          </motion.div>
          
          {/* Progress ring around the target */}
          <svg style={{ position: "absolute", width: 180, height: 180, transform: "rotate(-90deg)", pointerEvents: "none" }}>
            <circle
              cx="90" cy="90" r="80"
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="4"
            />
            <motion.circle
              cx="90" cy="90" r="80"
              fill="none"
              stroke="#00f5ff"
              strokeWidth="4"
              strokeDasharray="502.6"
              animate={{ strokeDashoffset: 502.6 - (502.6 * syncProgress) / 100 }}
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Sync Status */}
        <div style={{ marginTop: 60 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 800, color: "#8696a0", marginBottom: 12, letterSpacing: 1 }}>
            <span>SYNC PROGRESS</span>
            <span style={{ color: "#00f5ff" }}>{Math.floor(syncProgress)}%</span>
          </div>
          <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${syncProgress}%` }}
              style={{
                height: "100%",
                background: "linear-gradient(90deg, #bf5af2, #00f5ff)",
                boxShadow: "0 0 10px #00f5ff",
              }}
            />
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div style={{ position: "absolute", bottom: 40, left: 0, right: 0, textAlign: "center" }}>
        <button
          onClick={onCancel}
          style={{
            background: "none", border: "none",
            color: "#64748b", fontSize: 13, fontWeight: 600,
            cursor: "pointer",
            padding: "10px 20px",
          }}
        >
          Cancel Protocol
        </button>
      </div>

      {/* Success Overlay */}
      <AnimatePresence>
        {isVerified && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              position: "absolute", inset: 0, zIndex: 100,
              background: "rgba(0,245,255,0.15)",
              backdropFilter: "blur(40px)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 12 }}
              style={{ textAlign: "center" }}
            >
              <div style={{ 
                width: 100, height: 100, borderRadius: "50%", 
                background: "#00f5ff", color: "#000",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 48, margin: "0 auto 24px",
                boxShadow: "0 0 60px rgba(0,245,255,0.6)",
              }}>
                ✓
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 900, color: "#fff", margin: 0 }}>Verified</h2>
              <p style={{ color: "#fff", opacity: 0.8, marginTop: 8 }}>Thread unlocked successfully.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
