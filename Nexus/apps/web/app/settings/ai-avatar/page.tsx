"use client";

/**
 * app/settings/ai-avatar/page.tsx
 *
 * The "Offline-You" AI Avatar settings panel.
 *
 * Features:
 *   - Toggle AI Clone on / off
 *   - BYOK (Bring Your Own Key) — OpenAI API key input
 *   - If no key → deduct from aiCount (premium tier loop)
 *   - Avatar persona description
 *   - Allowance level: strict | casual | autonomous
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

// ── Local storage key for persisting settings ──────────────────
const LS_KEY = "quantchat_ai_avatar_settings";

interface AvatarSettings {
  enabled: boolean;
  byokKey: string;
  allowanceLevel: "strict" | "casual" | "autonomous";
  persona: string;
  aiCount: number;
}

const DEFAULT_SETTINGS: AvatarSettings = {
  enabled: false,
  byokKey: "",
  allowanceLevel: "strict",
  persona: "",
  aiCount: 20,
};

// ── Neon line divider ──────────────────────────────────────────
function NeonDivider({ color = "#6d4aff" }: { color?: string }) {
  return (
    <div
      style={{
        height: 1,
        background: `linear-gradient(90deg, transparent, ${color}60, transparent)`,
        margin: "4px 0",
      }}
    />
  );
}

// ── Glassmorphic card ──────────────────────────────────────────
function GlassCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 18,
        padding: "20px 18px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Neon toggle switch ─────────────────────────────────────────
function NeonToggle({
  value,
  onChange,
  accent = "#00a884",
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  accent?: string;
}) {
  return (
    <motion.div
      onClick={() => onChange(!value)}
      animate={{
        background: value ? accent : "#374248",
        boxShadow: value ? `0 0 12px ${accent}80` : "none",
      }}
      transition={{ duration: 0.2 }}
      style={{
        width: 52,
        height: 28,
        borderRadius: 14,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        padding: "0 3px",
        flexShrink: 0,
      }}
    >
      <motion.div
        animate={{ x: value ? 24 : 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
        }}
      />
    </motion.div>
  );
}

// ── Main page ──────────────────────────────────────────────────
export default function AIAvatarSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<AvatarSettings>(DEFAULT_SETTINGS);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setSettings(JSON.parse(raw) as AvatarSettings);
    } catch {
      // ignore parse error
    }
  }, []);

  function update<K extends keyof AvatarSettings>(key: K, value: AvatarSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    // If no BYOK key and aiCount is 0, show paywall
    if (settings.enabled && !settings.byokKey.trim() && settings.aiCount <= 0) {
      setShowPaywall(true);
      return;
    }
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  function handleToggleEnabled(v: boolean) {
    // Deduct aiCount if no BYOK when enabling
    if (v && !settings.byokKey.trim()) {
      if (settings.aiCount <= 0) {
        setShowPaywall(true);
        return;
      }
      update("aiCount", settings.aiCount - 1);
    }
    update("enabled", v);
  }

  const allowanceLevels: Array<{
    key: AvatarSettings["allowanceLevel"];
    label: string;
    desc: string;
    color: string;
  }> = [
    {
      key: "strict",
      label: "🛡️ Strict",
      desc: "Only acknowledge receipt, never commit",
      color: "#0288b0",
    },
    {
      key: "casual",
      label: "💬 Casual",
      desc: "Reply naturally in your style",
      color: "#00a884",
    },
    {
      key: "autonomous",
      label: "🤖 Autonomous",
      desc: "Full auto-pilot — makes decisions",
      color: "#bf5af2",
    },
  ];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#0b0f14",
        overflowY: "auto",
        scrollbarWidth: "none",
        fontFamily: "-apple-system, 'Segoe UI', sans-serif",
        color: "#e9edef",
        position: "relative",
      }}
    >
      {/* Ambient background orbs */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
          zIndex: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-10%",
            left: "-10%",
            width: 420,
            height: 420,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(109,74,255,0.15) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "5%",
            right: "-5%",
            width: 300,
            height: 300,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(0,168,132,0.12) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 520,
          margin: "0 auto",
          padding: "0 16px 40px",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 0 20px",
          }}
        >
          <button
            onClick={() => router.back()}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              width: 38,
              height: 38,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#e9edef",
              fontSize: 18,
            }}
          >
            ←
          </button>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
                background: "linear-gradient(135deg, #bf5af2, #6d4aff)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              AI Avatar
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: "#8696a0" }}>
              Your digital twin — replies when you&apos;re offline
            </p>
          </div>
        </div>

        {/* Main Enable Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <GlassCard
            style={{
              marginBottom: 16,
              border: settings.enabled
                ? "1px solid rgba(109,74,255,0.4)"
                : "1px solid rgba(255,255,255,0.08)",
              boxShadow: settings.enabled
                ? "0 0 24px rgba(109,74,255,0.15)"
                : "none",
              transition: "border-color 0.3s, box-shadow 0.3s",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {/* Avatar pulse indicator */}
                <div style={{ position: "relative" }}>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: "50%",
                      background:
                        "linear-gradient(135deg, #6d4aff, #bf5af2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 24,
                    }}
                  >
                    🤖
                  </div>
                  {settings.enabled && (
                    <motion.div
                      animate={{ scale: [1, 1.5, 1], opacity: [0.8, 0, 0.8] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      style={{
                        position: "absolute",
                        inset: -4,
                        borderRadius: "50%",
                        border: "2px solid #6d4aff",
                      }}
                    />
                  )}
                </div>
                <div>
                  <div
                    style={{ fontSize: 16, fontWeight: 700, color: "#e9edef" }}
                  >
                    AI Clone
                  </div>
                  <div style={{ fontSize: 12, color: "#8696a0", marginTop: 2 }}>
                    {settings.enabled ? (
                      <span style={{ color: "#00a884" }}>● Active — watching your DMs</span>
                    ) : (
                      "Off — you reply manually"
                    )}
                  </div>
                </div>
              </div>
              <NeonToggle
                value={settings.enabled}
                onChange={handleToggleEnabled}
                accent="#6d4aff"
              />
            </div>

            {settings.enabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                transition={{ duration: 0.25 }}
                style={{ overflow: "hidden" }}
              >
                <NeonDivider color="#6d4aff" />
                <p style={{ margin: "12px 0 0", fontSize: 13, color: "#aebac1", lineHeight: 1.55 }}>
                  When you go offline, your AI Clone will respond on your behalf
                  in DMs — in your exact tone and style.
                </p>
              </motion.div>
            )}
          </GlassCard>
        </motion.div>

        {/* BYOK Section */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <GlassCard style={{ marginBottom: 16 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 14,
              }}
            >
              <div>
                <div
                  style={{ fontSize: 15, fontWeight: 700, color: "#e9edef" }}
                >
                  🔑 Bring Your Own Key (BYOK)
                </div>
                <div style={{ fontSize: 12, color: "#8696a0", marginTop: 3 }}>
                  Use your OpenAI API key for unlimited AI replies
                </div>
              </div>
              <div
                style={{
                  fontSize: 10,
                  background: "rgba(0,168,132,0.15)",
                  color: "#00a884",
                  border: "1px solid rgba(0,168,132,0.3)",
                  borderRadius: 6,
                  padding: "3px 7px",
                  fontWeight: 700,
                }}
              >
                RECOMMENDED
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#111b21",
                borderRadius: 12,
                padding: "10px 14px",
                border: settings.byokKey
                  ? "1px solid rgba(0,168,132,0.5)"
                  : "1px solid rgba(255,255,255,0.08)",
                transition: "border-color 0.2s",
              }}
            >
              <input
                type={showKey ? "text" : "password"}
                value={settings.byokKey}
                onChange={(e) => update("byokKey", e.target.value)}
                placeholder="sk-proj-…"
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  outline: "none",
                  color: "#e9edef",
                  fontSize: 14,
                  fontFamily: "monospace",
                  letterSpacing: showKey ? "normal" : "0.12em",
                }}
              />
              <button
                onClick={() => setShowKey((s) => !s)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 16,
                  opacity: 0.6,
                }}
              >
                {showKey ? "🙈" : "👁️"}
              </button>
            </div>

            {!settings.byokKey && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  background: "rgba(255,193,7,0.08)",
                  border: "1px solid rgba(255,193,7,0.2)",
                  borderRadius: 10,
                  fontSize: 12,
                  color: "#ffc107",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>⚡</span>
                <span>
                  Without a BYOK key, each AI reply uses{" "}
                  <strong>1 Quant AI credit</strong>. You have{" "}
                  <strong
                    style={{
                      color:
                        settings.aiCount > 5 ? "#00a884" : "#ff5722",
                    }}
                  >
                    {settings.aiCount} credits
                  </strong>{" "}
                  remaining.
                </span>
              </motion.div>
            )}
          </GlassCard>
        </motion.div>

        {/* Persona Section */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <GlassCard style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              🎭 Avatar Persona
            </div>
            <div style={{ fontSize: 12, color: "#8696a0", marginBottom: 12 }}>
              Describe your texting style so the AI sounds exactly like you
            </div>
            <textarea
              value={settings.persona}
              onChange={(e) => update("persona", e.target.value)}
              rows={3}
              placeholder="e.g. Casual, uses emojis often, replies short, sometimes ignores msgs when busy, says 'bhai' a lot…"
              style={{
                width: "100%",
                background: "#111b21",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                padding: "10px 12px",
                color: "#e9edef",
                fontSize: 13,
                fontFamily: "-apple-system, sans-serif",
                outline: "none",
                resize: "none",
                lineHeight: 1.6,
                boxSizing: "border-box",
              }}
            />
          </GlassCard>
        </motion.div>

        {/* Allowance Level */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <GlassCard style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              🎚️ Autonomy Level
            </div>
            <div style={{ fontSize: 12, color: "#8696a0", marginBottom: 14 }}>
              How much freedom does your AI Clone have?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {allowanceLevels.map((lvl) => (
                <motion.button
                  key={lvl.key}
                  onClick={() => update("allowanceLevel", lvl.key)}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    background:
                      settings.allowanceLevel === lvl.key
                        ? `rgba(${lvl.key === "strict" ? "2,136,176" : lvl.key === "casual" ? "0,168,132" : "191,90,242"},0.12)`
                        : "rgba(255,255,255,0.03)",
                    border:
                      settings.allowanceLevel === lvl.key
                        ? `1.5px solid ${lvl.color}60`
                        : "1.5px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    textAlign: "left",
                    transition: "background 0.2s, border-color 0.2s",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: `${lvl.color}20`,
                      border: `1.5px solid ${lvl.color}40`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                      flexShrink: 0,
                    }}
                  >
                    {lvl.label.split(" ")[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color:
                          settings.allowanceLevel === lvl.key
                            ? lvl.color
                            : "#e9edef",
                      }}
                    >
                      {lvl.label.split(" ").slice(1).join(" ")}
                    </div>
                    <div style={{ fontSize: 12, color: "#8696a0", marginTop: 2 }}>
                      {lvl.desc}
                    </div>
                  </div>
                  {settings.allowanceLevel === lvl.key && (
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: lvl.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        flexShrink: 0,
                      }}
                    >
                      ✓
                    </div>
                  )}
                </motion.button>
              ))}
            </div>
          </GlassCard>
        </motion.div>

        {/* Save Button */}
        <motion.button
          onClick={handleSave}
          whileTap={{ scale: 0.97 }}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: 16,
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 700,
            background: saved
              ? "linear-gradient(135deg, #00a884, #00876a)"
              : "linear-gradient(135deg, #6d4aff, #bf5af2)",
            color: "#fff",
            boxShadow: saved
              ? "0 4px 20px rgba(0,168,132,0.4)"
              : "0 4px 20px rgba(109,74,255,0.4)",
            transition: "background 0.3s, box-shadow 0.3s",
            fontFamily: "-apple-system, sans-serif",
          }}
        >
          {saved ? "✓ Settings Saved!" : "Save AI Avatar Settings"}
        </motion.button>
      </div>

      {/* Paywall Modal */}
      <AnimatePresence>
        {showPaywall && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.8)",
              backdropFilter: "blur(10px)",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              zIndex: 200,
              padding: "0 16px 24px",
            }}
            onClick={() => setShowPaywall(false)}
          >
            <motion.div
              initial={{ y: 120, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 120, opacity: 0 }}
              transition={{ type: "spring", stiffness: 350, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 480,
                background:
                  "linear-gradient(135deg, #120023 0%, #0b0f14 100%)",
                border: "1px solid rgba(191,90,242,0.3)",
                borderRadius: 24,
                padding: "28px 22px",
                textAlign: "center",
                boxShadow: "0 8px 60px rgba(109,74,255,0.3)",
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
              <h2
                style={{
                  margin: "0 0 8px",
                  fontSize: 22,
                  fontWeight: 800,
                  background: "linear-gradient(135deg, #bf5af2, #6d4aff)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Unlock AI Avatar
              </h2>
              <p style={{ color: "#aebac1", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
                You&apos;ve used all your free AI credits. Add your own OpenAI
                key for unlimited auto-replies, or upgrade to{" "}
                <strong style={{ color: "#bf5af2" }}>Quant Premium</strong>.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button
                  onClick={() => {
                    setShowPaywall(false);
                    const el = document.querySelector<HTMLInputElement>(
                      'input[type="password"]'
                    );
                    el?.focus();
                  }}
                  style={{
                    padding: "14px",
                    borderRadius: 14,
                    border: "1.5px solid rgba(0,168,132,0.5)",
                    background: "rgba(0,168,132,0.1)",
                    color: "#00a884",
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "-apple-system, sans-serif",
                  }}
                >
                  🔑 Add OpenAI Key (Free)
                </button>
                <button
                  style={{
                    padding: "14px",
                    borderRadius: 14,
                    border: "none",
                    background: "linear-gradient(135deg, #6d4aff, #bf5af2)",
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "-apple-system, sans-serif",
                    boxShadow: "0 4px 20px rgba(109,74,255,0.4)",
                  }}
                >
                  ⚡ Upgrade to Quant Premium — $15/mo
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
