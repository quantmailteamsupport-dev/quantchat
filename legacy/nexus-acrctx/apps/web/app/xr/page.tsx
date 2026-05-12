"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring } from "framer-motion";
import { Zap, Heart, Star, Sparkles, ArrowLeft, Info, Wifi, WifiOff, Video } from "lucide-react";
import Link from "next/link";
import type { SharedIdentityState, EntityStage } from "../../lib/ai/LudicLoopEngine";
import { LudicLoopEngine } from "../../lib/ai/LudicLoopEngine";
import { useEntitySync } from "../../lib/sync/useEntitySync";
import { HologramCanvas } from "../../components/HologramCanvas";
import { useAudioAnalyser } from "../../lib/useAudioAnalyser";
import type { AudioBands } from "../../lib/useAudioAnalyser";
import { useSentimentShader, type SentimentShaderParams } from "../../lib/ai/gemma_engine";

// ─── Demo seed for visual preview ────────────────────────────────
const DEMO_ENTITY: SharedIdentityState = LudicLoopEngine.createSeed("you", "aryan");

// Apply a "bloom" stage demo state so it looks visually rich
const INITIAL_ENTITY: SharedIdentityState = {
  ...DEMO_ENTITY,
  stage: "bloom",
  bondStrength: 0.52,
  emotionalResonance: 0.64,
  trustIndex: 0.48,
  creativityScore: 0.71,
  hue: 220,
  luminosity: 0.65,
  complexity: 0.45,
};

async function triggerJackpotHaptics() {
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    [0, 150, 300].forEach((delayMs) => {
      setTimeout(() => {
        void Haptics.impact({ style: ImpactStyle.Heavy });
      }, delayMs);
    });
  } catch (err) {
    console.log("Haptics unlinked in Web View:", err);
  }
}

// ─── Stage Metadata ────────────────────────────────────────────────
const STAGE_META: Record<EntityStage, { label: string; description: string; color: string; nextHint: string }> = {
  seed: {
    label: "Seed",
    description: "A glowing orb of pure potential. You've just connected.",
    color: "#00f3ff",
    nextHint: "Have 3 meaningful conversations to evolve.",
  },
  sprout: {
    label: "Sprout",
    description: "A small form emerges. Your bond is taking shape.",
    color: "#7fff00",
    nextHint: "Share something personal to grow deeper.",
  },
  bloom: {
    label: "Bloom",
    description: "Your entity reflects your friendship's unique character.",
    color: "#ff7fff",
    nextHint: "Resolve a disagreement to unlock trust growth.",
  },
  radiant: {
    label: "Radiant",
    description: "Full holographic form achieved. Deep trust established.",
    color: "#ffe066",
    nextHint: "Only 22% of pairs reach Transcendent. Keep going.",
  },
  transcendent: {
    label: "Transcendent",
    description: "Legendary bond. You are in the top 2% of all Nexus connections.",
    color: "#ff007f",
    nextHint: "You've unlocked exclusive Holographic Twin voice features.",
  },
};

// ─── The Animated Orb (WebGL / audio-reactive + sentiment-driven) ─
// Thin wrapper that delegates to the HologramCanvas WebGL component.
// Both the live audio frequency bands and the Gemma sentiment shader
// parameters drive the hologram visuals simultaneously.
function HolographicOrb({
  entity,
  audioBands,
  shaderParams,
}: {
  entity: SharedIdentityState;
  audioBands: AudioBands;
  shaderParams: SentimentShaderParams;
}) {
  return (
    <HologramCanvas
      entity={entity}
      audioBands={audioBands}
      sentimentParams={shaderParams}
      width={380}
      height={380}
      className="w-full max-w-[380px] mx-auto"
    />
  );
}

// ─── Bond Progress Bar ─────────────────────────────────────────────
function BondBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-gray-500 uppercase tracking-widest w-24 text-right flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value * 100}%` }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}aa, ${color})`, boxShadow: `0 0 8px ${color}88` }}
        />
      </div>
      <span className="text-[10px] text-gray-600 w-8">{Math.round(value * 100)}%</span>
    </div>
  );
}

// ─── Main XR Page ──────────────────────────────────────────────────
export default function XRPage() {
  // ── PHASE 12.2 [Opus]: P2P Synchronized Entity State ──
  // Both users see the EXACT same entity. Mutations are broadcast
  // through the E2EE SignalSocket tunnel in real-time.
  const {
    entity,
    syncStatus,
    evolveAndSync,
    isConnected,
  } = useEntitySync("you", "aryan", INITIAL_ENTITY);

  // ── PHASE 3 [Gemma]: Real-Time Sentiment → Shader ──
  const { shaderParams, lastSentiment, analyzePending, triggerAnalysis } = useSentimentShader();
  const [sentimentInput, setSentimentInput] = useState("");

  const [showInfo, setShowInfo] = useState(false);
  const [evolving, setEvolving] = useState(false);
  const [evolutionLog, setEvolutionLog] = useState<string[]>([]);

  // ── Audio-reactive hologram ──
  // When the user taps the mic button we acquire the local microphone and
  // feed it into the audio analyser so the hologram reacts to their voice.
  // In a full call the remote WebRTC stream would be passed here instead.
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [micActive, setMicActive] = useState(false);
  const audioBands = useAudioAnalyser(audioStream);

  const toggleMic = useCallback(async () => {
    if (micActive) {
      audioStream?.getTracks().forEach((t) => t.stop());
      setAudioStream(null);
      setMicActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        setAudioStream(stream);
        setMicActive(true);
      } catch {
        console.warn("[XR] Microphone access denied — hologram will animate without audio.");
      }
    }
  }, [micActive, audioStream]);

  // Clean up the mic stream on unmount.
  useEffect(() => {
    return () => {
      audioStream?.getTracks().forEach((t) => t.stop());
    };
  }, [audioStream]);

  const meta = STAGE_META[entity.stage];
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 80, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 80, damping: 20 });

  // Simulates one conversation session driving evolution —
  // now atomically evolves AND broadcasts to the peer
  const simulateDeepConversation = async () => {
    if (evolving) return;
    setEvolving(true);

    // ── THE LUDIC LOOP (SLOT MACHINE DOPAMINE ENGINE) ──
    const isJackpot = Math.random() < 0.18; // 18% Variable Reward Chance
    const dopamineMultiplier = isJackpot ? 4.5 : 1.0;

    // CEO OVERRIDE: PHYSICAL DOPAMINE TRIGGER (NATIVE HAPTICS)
    if (isJackpot && typeof window !== 'undefined') {
      void triggerJackpotHaptics();
    }

    const signals = {
      emotionalDepth: (0.72 + Math.random() * 0.15) * dopamineMultiplier,
      topicNovelty: (0.55 + Math.random() * 0.2) * dopamineMultiplier,
      reciprocity: 0.80 + Math.random() * 0.12,
      humor: (0.45 + Math.random() * 0.3) * dopamineMultiplier,
      conflictResolution: Math.random() < 0.3 ? (0.7 + Math.random() * 0.3) * dopamineMultiplier : 0,
      messageCount: Math.floor(20 + Math.random() * 40),
      sessionDurationMs: (15 + Math.random() * 30) * 60000,
    };

    await new Promise(r => setTimeout(r, 1800));
    const oldStage = entity.stage;
    const newEntity = await evolveAndSync(signals);

    const logEntry = `Bond +${((newEntity.bondStrength - entity.bondStrength) * 100).toFixed(1)}% · ${
      newEntity.stage !== oldStage ? `🎉 EVOLVED to ${STAGE_META[newEntity.stage].label}!` : `Stage: ${STAGE_META[newEntity.stage].label}`
    }${syncStatus.peerAcknowledged ? ' · ✓ Peer synced' : ''}`;
    setEvolutionLog(prev => [logEntry, ...prev].slice(0, 5));
    setEvolving(false);
  };

  return (
    <div
      className="relative w-full min-h-screen bg-[var(--background)] flex flex-col items-center justify-start overflow-hidden font-sans"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        mouseX.set((e.clientX - rect.width / 2) / 20);
        mouseY.set((e.clientY - rect.height / 2) / 20);
      }}
    >
      {/* ── Ambient BG ── */}
      <div className="ambient-bg" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 40%, hsla(${entity.hue}, 80%, 15%, 0.35) 0%, transparent 65%)`,
          transition: "background 2s ease",
        }}
      />

      {/* ── Top Nav ── */}
      <div className="relative z-10 w-full max-w-lg px-5 pt-8 pb-4 flex items-center justify-between">
        <a href="/chat" className="glass w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-[var(--color-neon-blue)] transition-colors border border-white/5">
          <ArrowLeft size={15} />
        </a>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 mb-0.5">
            <p className="text-[10px] uppercase tracking-[0.3em] text-gray-600 font-bold">Shared Identity</p>
            {/* P2P Sync Status Indicator */}
            {isConnected ? (
              <Wifi size={10} className="text-green-400" />
            ) : (
              <WifiOff size={10} className="text-red-400" />
            )}
          </div>
          <p className="text-[13px] font-black text-white">You & Aryan Sharma</p>
          {syncStatus.peerAcknowledged && (
            <p className="text-[8px] text-green-400/60 uppercase tracking-widest mt-0.5">Peer Synced ✓</p>
          )}
        </div>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="glass w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-[var(--color-neon-purple)] transition-colors border border-white/5"
        >
          <Info size={15} />
        </button>
      </div>

      {/* ── Entity Orb ── */}
      <motion.div
        className="relative z-10 mt-2"
        style={{ rotateX: springY, rotateY: springX, perspective: 800 }}
      >
        <HolographicOrb entity={entity} audioBands={audioBands} shaderParams={shaderParams} />

        {/* Stage Badge */}
        <motion.div
          key={entity.stage}
          initial={{ scale: 0.8, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full glass border text-[11px] font-black uppercase tracking-widest"
          style={{ borderColor: `${meta.color}44`, color: meta.color, boxShadow: `0 0 15px ${meta.color}44` }}
        >
          <Sparkles size={10} className="inline mr-1.5" />
          {meta.label}
        </motion.div>
      </motion.div>

      {/* ── Entity Description ── */}
      <AnimatePresence mode="wait">
        <motion.p
          key={entity.stage}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="relative z-10 text-center text-[13px] text-gray-400 max-w-xs px-6 mt-1 leading-relaxed"
        >
          {meta.description}
        </motion.p>
      </AnimatePresence>

      {/* ── Bond Metrics ── */}
      <div className="relative z-10 w-full max-w-md px-5 mt-6 space-y-3">
        <BondBar value={entity.bondStrength} label="Bond Strength" color={meta.color} />
        <BondBar value={entity.emotionalResonance} label="Resonance" color="#8a2be2" />
        <BondBar value={entity.trustIndex} label="Trust Index" color="#00f3ff" />
        <BondBar value={entity.creativityScore} label="Creativity" color="#ff007f" />
      </div>

      {/* ── Evolution Log ── */}
      {evolutionLog.length > 0 && (
        <div className="relative z-10 w-full max-w-md px-5 mt-5 space-y-1.5">
          {evolutionLog.map((log, i) => (
            <motion.p
              // HYDRATION FIX [Sonnet Audit Phase 7.3]: Use content-based key,
              // not index. Index keys cause React to reuse DOM nodes incorrectly
              // when items are prepended (we use unshift pattern via [logEntry, ...prev]).
              key={log}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1 - i * 0.18, x: 0 }}
              className="text-[10px] text-gray-600 font-mono"
            >
              {log}
            </motion.p>
          ))}
        </div>
      )}

      {/* ── Sentiment Analyzer (Phase 3 — Gemma) ── */}
      <div className="relative z-10 w-full max-w-md px-5 mt-5">
        <p className="text-[9px] uppercase tracking-[0.25em] text-gray-600 mb-2">
          <Sparkles size={8} className="inline mr-1" />
          Sentiment → Hologram
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={sentimentInput}
            onChange={(e) => setSentimentInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && sentimentInput.trim()) {
                void triggerAnalysis(sentimentInput);
                setSentimentInput("");
              }
            }}
            placeholder="Type a message to react the orb…"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[12px] text-white placeholder-gray-700 focus:outline-none focus:border-white/20"
          />
          <motion.button
            onClick={() => {
              if (sentimentInput.trim()) {
                void triggerAnalysis(sentimentInput);
                setSentimentInput("");
              }
            }}
            disabled={analyzePending || !sentimentInput.trim()}
            whileTap={{ scale: 0.95 }}
            className="px-3 py-2 glass border border-white/10 rounded-xl text-[11px] text-gray-400 hover:text-white transition-colors disabled:opacity-30"
          >
            {analyzePending ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                className="w-3 h-3 border border-white/30 border-t-white rounded-full"
              />
            ) : (
              <Heart size={13} />
            )}
          </motion.button>
        </div>
        {lastSentiment && (
          <motion.p
            key={lastSentiment.label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[9px] text-gray-600 mt-1.5 font-mono"
          >
            mood: <span className="text-gray-400">{lastSentiment.label}</span>
            {" · "}valence: <span className="text-gray-400">{lastSentiment.valence.toFixed(2)}</span>
            {" · "}arousal: <span className="text-gray-400">{lastSentiment.arousal.toFixed(2)}</span>
          </motion.p>
        )}
      </div>

      {/* ── Evolve Button ── */}
      <div className="relative z-10 w-full max-w-md px-5 mt-6 pb-12 space-y-3">
        <motion.button
          onClick={simulateDeepConversation}
          disabled={evolving}
          whileTap={{ scale: 0.97 }}
          className="w-full neon-glow-btn py-4 rounded-2xl font-black text-[13px] uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 transition-all"
        >
          {evolving ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
              />
              Analyzing Conversation...
            </>
          ) : (
            <>
              <Zap size={15} />
              Simulate Deep Conversation
            </>
          )}
        </motion.button>

        {/* ── Audio-reactive hologram mic toggle ── */}
        <motion.button
          onClick={toggleMic}
          whileTap={{ scale: 0.97 }}
          className="w-full py-3 rounded-2xl font-black text-[12px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all border"
          style={{
            background: micActive ? "rgba(0,168,132,0.15)" : "rgba(255,255,255,0.04)",
            borderColor: micActive ? "#00a884" : "rgba(255,255,255,0.08)",
            color: micActive ? "#00f3ff" : "#8696a0",
          }}
        >
          {micActive ? <Heart size={13} /> : <Star size={13} />}
          {micActive ? "Live Audio — Hologram Reacting" : "Activate Mic — Audio-Reactive Mode"}
        </motion.button>

        <p className="text-center text-[9px] text-gray-700 mt-2.5 uppercase tracking-widest">
          Next: {meta.nextHint}
        </p>

        {/* ── Holographic WebRTC call entrypoint ── */}
        <Link
          href={`/call/aryan?name=${encodeURIComponent("Aryan Sharma")}`}
          className="mt-4 w-full glass border border-white/10 rounded-2xl py-3 flex items-center justify-center gap-2 text-[11px] uppercase tracking-widest text-[var(--color-neon-blue)] hover:text-white transition-colors"
          style={{ boxShadow: "0 0 18px hsla(195, 100%, 50%, 0.15)" }}
        >
          <Video size={14} />
          Start Holographic Call
        </Link>
      </div>

      {/* ── Info Panel ── */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 glass-panel border-t border-white/10 p-6 max-w-lg mx-auto rounded-t-3xl"
          >
            <p className="text-[11px] font-black uppercase tracking-widest text-[var(--color-neon-purple)] mb-3">How It Works</p>
            <div className="space-y-2 text-[12px] text-gray-400 leading-relaxed">
              <p><span className="text-white font-bold">Quality, not quantity.</span> Spamming messages does nothing. Only meaningful conversations grow your entity.</p>
              <p><span className="text-white font-bold">No anxiety.</span> Missing a week barely costs 0.3% bond. This entity will never die.</p>
              <p><span className="text-white font-bold">Variable rewards.</span> 15% chance each session grants a surprise boost—keeping it exciting.</p>
              <p><span className="text-white font-bold">Conflict = growth.</span> Healthy disagreement followed by reconciliation is the single strongest evolution signal.</p>
            </div>
            <button onClick={() => setShowInfo(false)} className="mt-4 text-[10px] text-gray-600 uppercase tracking-widest">Close</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
