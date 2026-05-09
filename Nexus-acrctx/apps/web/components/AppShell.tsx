"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { initializeNoExitMatrix } from "../lib/system/NoExitMatrix";
import { useBiometricBlur } from "../lib/system/useBiometricBlur";
import { useDisappearingSweeper } from "../lib/useDisappearingSweeper";
import {
  getAdaptiveThemeEngine,
  getEmotionDetectionService,
  getMicroAnimationLibrary,
} from "../lib/emotion";
import {
  MessageCircle,
  Hash,
  Phone,
  Bell,
  Settings,
  FlaskConical,
  Compass,
  Film,
} from "lucide-react";

// Redesigned navigation: 5 primary + "Labs" overflow
const NAV_ITEMS = [
  { name: "Chat", path: "/chat", Icon: MessageCircle },
  { name: "Channels", path: "/channels", Icon: Hash },
  { name: "Calls", path: "/call", Icon: Phone },
  { name: "Feed", path: "/feed", Icon: Bell },
  { name: "Settings", path: "/settings", Icon: Settings },
];

const LABS_ITEMS = [
  { name: "Echoes", path: "/echoes", Icon: Compass },
  { name: "Hives", path: "/hives", Icon: FlaskConical },
  { name: "Reels", path: "/reels", Icon: Film },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isBiometricLive = useBiometricBlur();
  const [isLabsOpen, setIsLabsOpen] = React.useState(false);

  useEffect(() => {
    initializeNoExitMatrix();
  }, []);

  // Local self-destruct sweeper for disappearing messages. Runs as long
  // as the app shell is mounted, deleting decrypted plaintext once TTL
  // expires even if the server hasn't notified us yet.
  useDisappearingSweeper();

  // ── Emotion-Responsive UI: start the three services and wire them.
  // Detector produces estimates → ThemeEngine applies CSS custom
  // properties → MicroAnimationLibrary picks its per-emotion bias.
  // Pointer taps anywhere in the app also feed the detector's
  // erratic-interaction signal. Everything stays on-device.
  useEffect(() => {
    const detector = getEmotionDetectionService();
    const theme = getAdaptiveThemeEngine();
    const animations = getMicroAnimationLibrary();

    theme.start();
    animations.start();
    animations.setEmotion(theme.getCurrentEmotion());

    const unsub = detector.subscribe((estimate) => {
      theme.applyFromDetector(estimate.emotion);
      animations.setEmotion(theme.getCurrentEmotion());
    });
    detector.start();

    const onPointer = () => detector.ingestTap();
    window.addEventListener("pointerdown", onPointer, { passive: true });

    return () => {
      unsub();
      detector.stop();
      theme.stop();
      animations.stop();
      window.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  // Auth pages and full-screen pages get no shell nav
  const isAuthPage = pathname === "/" || pathname === "/login" || pathname === "/claim";
  const isFullScreen = pathname.startsWith("/feed") || pathname.startsWith("/settings");
  if (isAuthPage || isFullScreen) return <>{children}</>;

  // Workspace uses a full 3-pane desktop layout — skip the mobile bottom nav
  const isWorkspacePage = pathname.startsWith("/workspace");

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100dvh",
      width: "100%",
      background: "#0B1220",
      color: "#E6EDF7",
      overflow: "hidden",
      fontFamily: "'Inter', -apple-system, 'Segoe UI', sans-serif",
    }}>

      {/* ── BIOMETRIC OVERRIDE — gated behind feature flag ── */}
      {!isBiometricLive && (
        <div style={{
          position: "absolute", zIndex: 9999, top: 0, left: 0, width: "100%", height: "100%",
          background: "rgba(11, 18, 32, 0.95)", backdropFilter: "blur(30px)",
          display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
          gap: 12,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: "rgba(239, 68, 68, 0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid rgba(239, 68, 68, 0.3)",
          }}>
            <span style={{ fontSize: 28 }}>🔒</span>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: "#E6EDF7", letterSpacing: "0.05em" }}>
            Identity Verification Required
          </h1>
          <p style={{ fontSize: 13, color: "#93A1BC", maxWidth: 320, textAlign: "center", lineHeight: 1.6 }}>
            Liveness check failed. Please authenticate to continue.
          </p>
        </div>
      )}

      {/* ── Content ── */}
      <main style={{
        flex: 1, overflow: "hidden", position: "relative",
        filter: isBiometricLive ? "none" : "blur(30px)",
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            style={{ width: "100%", height: "100%" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Bottom Nav (hidden on workspace) ── */}
      {!isWorkspacePage && (
        <nav style={{
          height: 56,
          width: "100%",
          background: "#0B1220",
          borderTop: "1px solid rgba(148, 163, 184, 0.12)",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-around",
          flexShrink: 0,
          zIndex: 100,
        }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.path);
            const isLabsItem = item.name === "Settings"; // We reuse Settings button for Labs
            
            return (
              <div key={item.name} style={{ flex: 1, position: "relative" }}>
                {isLabsItem ? (
                  <div
                    onClick={() => setIsLabsOpen(!isLabsOpen)}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      height: 54, cursor: "pointer", position: "relative",
                    }}
                  >
                    <FlaskConical size={20} strokeWidth={1.8} style={{ marginBottom: 3, opacity: 0.45, color: "#93A1BC" }} />
                    <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.02em", color: "#93A1BC", fontFamily: "'Inter', -apple-system, sans-serif" }}>Labs</span>
                  </div>
                ) : (
                  <Link href={item.path} style={{ textDecoration: "none", display: "block", height: "100%" }}>
                    <div style={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      height: 54, cursor: "pointer", position: "relative",
                    }}>
                      <item.Icon
                        size={20}
                        strokeWidth={isActive ? 2.2 : 1.8}
                        style={{ marginBottom: 3, opacity: isActive ? 1 : 0.45, color: isActive ? "#2DD4BF" : "#93A1BC", transition: "opacity 0.2s, color 0.2s" }}
                      />
                      <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, letterSpacing: "0.02em", color: isActive ? "#2DD4BF" : "#93A1BC", fontFamily: "'Inter', -apple-system, sans-serif", transition: "color 0.2s" }}>
                        {item.name}
                      </span>
                      {isActive && <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: 2, background: "#2DD4BF", borderRadius: "0 0 2px 2px" }} />}
                    </div>
                  </Link>
                )}
                
                {/* Labs Flyout */}
                {isLabsItem && isLabsOpen && (
                  <div style={{
                    position: "absolute", bottom: "100%", right: 10, marginBottom: 8,
                    background: "#16233A", border: "1px solid rgba(45, 212, 191, 0.2)",
                    borderRadius: 12, padding: 8, minWidth: 140, boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                    display: "flex", flexDirection: "column", gap: 4, zIndex: 200,
                  }}>
                    {LABS_ITEMS.map(lab => (
                      <Link key={lab.name} href={lab.path} style={{ textDecoration: "none" }} onClick={() => setIsLabsOpen(false)}>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                          borderRadius: 8, color: "#E6EDF7", fontSize: 13, fontWeight: 500,
                          cursor: "pointer"
                        }}>
                          <lab.Icon size={16} color="#2DD4BF" />
                          {lab.name}
                        </div>
                      </Link>
                    ))}
                    <div style={{ height: 1, background: "rgba(148, 163, 184, 0.12)", margin: "4px 0" }} />
                    <Link href="/settings" style={{ textDecoration: "none" }} onClick={() => setIsLabsOpen(false)}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                        borderRadius: 8, color: "#93A1BC", fontSize: 13, fontWeight: 500, cursor: "pointer"
                      }}>
                        <Settings size={16} />
                        Settings
                      </div>
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      )}
    </div>
  );
}
