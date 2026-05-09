"use client";

/**
 * components/ChillRoomModal.tsx
 *
 * AR/VR "Chill Room" entry point modal.
 * Displays a visually striking portal for entering a shared XR space
 * (designed to eventually link with Godot WebXR).
 */

import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, Users, Wifi } from "lucide-react";

interface ChillRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceName?: string;
  participantCount?: number;
}

export default function ChillRoomModal({
  isOpen,
  onClose,
  spaceName = "Chill Room",
  participantCount = 0,
}: ChillRoomModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(8px)",
              zIndex: 200,
            }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 40 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            style={{
              position: "fixed",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 201,
              padding: "20px",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 420,
                borderRadius: 28,
                overflow: "hidden",
                pointerEvents: "all",
                border: "1px solid rgba(109, 74, 255, 0.4)",
                boxShadow:
                  "0 0 60px rgba(109, 74, 255, 0.3), 0 0 120px rgba(0, 243, 255, 0.1), 0 24px 64px rgba(0,0,0,0.8)",
              }}
            >
              {/* Portal visual */}
              <div
                style={{
                  position: "relative",
                  background:
                    "linear-gradient(160deg, #0d0d1f 0%, #1a0533 40%, #000d1f 100%)",
                  padding: "40px 32px 32px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 16,
                  overflow: "hidden",
                }}
              >
                {/* Animated glow rings */}
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{
                      scale: [1, 1.15 + i * 0.08, 1],
                      opacity: [0.6, 0.2, 0.6],
                    }}
                    transition={{
                      duration: 2.5 + i * 0.5,
                      repeat: Infinity,
                      delay: i * 0.6,
                    }}
                    style={{
                      position: "absolute",
                      width: 160 + i * 60,
                      height: 160 + i * 60,
                      borderRadius: "50%",
                      border: `1.5px solid ${i === 0 ? "#6d4aff" : i === 1 ? "#00f3ff" : "#ff007f"}`,
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      pointerEvents: "none",
                    }}
                  />
                ))}

                {/* Portal icon */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle, #6d4aff 0%, #00f3ff 60%, transparent 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 36,
                    boxShadow: "0 0 40px rgba(109, 74, 255, 0.6)",
                    position: "relative",
                    zIndex: 1,
                    flexShrink: 0,
                  }}
                >
                  🌌
                </motion.div>

                {/* Close button */}
                <button
                  onClick={onClose}
                  style={{
                    position: "absolute",
                    top: 16,
                    right: 16,
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "50%",
                    width: 36,
                    height: 36,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: "#8696a0",
                    zIndex: 2,
                  }}
                >
                  <X size={16} />
                </button>

                {/* Title */}
                <div
                  style={{
                    position: "relative",
                    zIndex: 1,
                    textAlign: "center",
                  }}
                >
                  <h2
                    style={{
                      fontSize: 22,
                      fontWeight: 900,
                      color: "#fff",
                      margin: 0,
                      letterSpacing: "-0.02em",
                      fontFamily: "-apple-system, sans-serif",
                      textShadow: "0 0 20px rgba(109, 74, 255, 0.8)",
                    }}
                  >
                    {spaceName}
                  </h2>
                  <p
                    style={{
                      fontSize: 11,
                      color: "#8696a0",
                      marginTop: 4,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      fontWeight: 700,
                    }}
                  >
                    AR / VR Shared Space
                  </p>
                </div>

                {/* Stats */}
                <div
                  style={{
                    position: "relative",
                    zIndex: 1,
                    display: "flex",
                    gap: 24,
                    marginTop: 4,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      color: "#aebac1",
                    }}
                  >
                    <Users size={13} color="#00a884" />
                    <span>
                      {participantCount > 0
                        ? `${participantCount} inside`
                        : "Be the first"}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      color: "#aebac1",
                    }}
                  >
                    <Wifi size={13} color="#6d4aff" />
                    <span>Low latency</span>
                  </div>
                </div>
              </div>

              {/* Action section */}
              <div
                style={{
                  background: "#111b21",
                  padding: "24px 32px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => {
                    // Future: link to Godot WebXR
                    onClose();
                  }}
                  style={{
                    width: "100%",
                    padding: "14px 0",
                    borderRadius: 16,
                    border: "none",
                    cursor: "pointer",
                    background:
                      "linear-gradient(135deg, #6d4aff 0%, #00f3ff 100%)",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 14,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    boxShadow: "0 4px 20px rgba(109, 74, 255, 0.4)",
                  }}
                >
                  <Zap size={16} />
                  Enter Chill Room
                </motion.button>

                <p
                  style={{
                    fontSize: 11,
                    color: "#8696a0",
                    textAlign: "center",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  Immersive XR space via Godot WebXR — coming soon.
                  <br />
                  Browser mode active for now.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
