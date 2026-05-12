"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, MessageSquare, Brain, Sparkles, Check } from "lucide-react";

interface PremiumPaywallProps {
  open: boolean;
  onClose: () => void;
}

const FEATURES = [
  { icon: <Brain size={18} />, text: "Unlimited AI Thread Summaries" },
  { icon: <Sparkles size={18} />, text: "Smart AI Reply Suggestions" },
  { icon: <MessageSquare size={18} />, text: "AI-Powered Message Search" },
  { icon: <Zap size={18} />, text: "Priority Processing & Faster Responses" },
  { icon: <Check size={18} />, text: "Remove 'Sent via Quant Chat' watermark" },
];

export default function PremiumPaywall({ open, onClose }: PremiumPaywallProps) {
  const checkoutUrl = process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_URL;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.75)",
              backdropFilter: "blur(8px)",
              zIndex: 9998,
            }}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            style={{
              position: "fixed",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              pointerEvents: "none",
              padding: "16px",
            }}
          >
            <div
              style={{
                pointerEvents: "auto",
                background: "linear-gradient(145deg, #0d0d0d 0%, #111 60%, #0a0a0f 100%)",
                border: "1px solid rgba(139,92,246,0.35)",
                boxShadow:
                  "0 0 0 1px rgba(139,92,246,0.15), 0 24px 80px rgba(0,0,0,0.8), 0 0 60px rgba(139,92,246,0.12)",
                borderRadius: 24,
                width: "100%",
                maxWidth: 420,
                padding: "36px 32px 32px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Neon glow orb (decorative) */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: -60,
                  right: -40,
                  width: 200,
                  height: 200,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 70%)",
                  pointerEvents: "none",
                }}
              />

              {/* Close button */}
              <button
                onClick={onClose}
                aria-label="Close"
                style={{
                  position: "absolute",
                  top: 16,
                  right: 16,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "50%",
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "#9ca3af",
                  transition: "all 0.15s",
                }}
              >
                <X size={16} />
              </button>

              {/* Badge */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(139,92,246,0.15)",
                  border: "1px solid rgba(139,92,246,0.4)",
                  borderRadius: 100,
                  padding: "4px 12px",
                  marginBottom: 20,
                }}
              >
                <Sparkles size={13} color="#a78bfa" />
                <span style={{ color: "#a78bfa", fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>
                  QUANT CHAT PREMIUM
                </span>
              </div>

              {/* Heading */}
              <h2
                style={{
                  margin: "0 0 10px",
                  fontSize: 26,
                  fontWeight: 800,
                  lineHeight: 1.25,
                  color: "#fff",
                  letterSpacing: -0.5,
                }}
              >
                Unlock Unlimited AI&nbsp;
                <span
                  style={{
                    background: "linear-gradient(90deg, #a78bfa, #60a5fa)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  Summaries &amp; Smart Replies
                </span>
              </h2>

              <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
                You&apos;ve used your 20 free AI summaries. Upgrade to Premium and supercharge
                your team&apos;s productivity.
              </p>

              {/* Feature list */}
              <ul style={{ listStyle: "none", margin: "0 0 28px", padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {FEATURES.map((f, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        background: "rgba(139,92,246,0.15)",
                        border: "1px solid rgba(139,92,246,0.25)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#a78bfa",
                        flexShrink: 0,
                      }}
                    >
                      {f.icon}
                    </span>
                    <span style={{ color: "#d1d5db", fontSize: 14 }}>{f.text}</span>
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (!checkoutUrl) return;
                  window.location.href = checkoutUrl;
                }}
                disabled={!checkoutUrl}
                style={{
                  width: "100%",
                  padding: "14px 0",
                  borderRadius: 14,
                  border: "none",
                  cursor: checkoutUrl ? "pointer" : "not-allowed",
                  background: checkoutUrl
                    ? "linear-gradient(90deg, #7c3aed 0%, #4f46e5 100%)"
                    : "rgba(107,114,128,0.35)",
                  boxShadow: checkoutUrl ? "0 0 24px rgba(124,58,237,0.5)" : "none",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 16,
                  letterSpacing: -0.2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Zap size={18} />
                Upgrade to Premium — $15/month
              </motion.button>

              <p style={{ textAlign: "center", color: "#4b5563", fontSize: 12, marginTop: 14, marginBottom: 0 }}>
                Cancel anytime · No hidden fees · Billed monthly
              </p>
              {!checkoutUrl && (
                <p style={{ textAlign: "center", color: "#fca5a5", fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                  Premium checkout is not configured yet. Set NEXT_PUBLIC_STRIPE_CHECKOUT_URL to enable upgrades.
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
