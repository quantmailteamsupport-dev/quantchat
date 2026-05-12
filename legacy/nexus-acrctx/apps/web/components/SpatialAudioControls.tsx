"use client";

/**
 * SpatialAudioControls — UI panel for the Spatial Audio Engine.
 *
 * Sections
 * ────────
 *   1. 2D minimap   Top-down view of avatar positions relative to the listener.
 *                   Coloured rings show whisper / normal / broadcast zones.
 *                   Participant dots move in real-time.
 *
 *   2. Participants  Per-participant row: name, zone badge, distance label,
 *                   volume slider, and individual mute toggle.
 *
 *   3. Voice effects  Pill selector for the six VoiceEffect modes with a
 *                    live description.
 *
 *   4. Zone controls  Toggle mute on each zone.  Master volume slider.
 *
 * Props
 * ─────
 *   participants    Array of participant descriptors (id, name, position).
 *   listenerPos     Your own 3D position (metres, Y-up).
 *   engine          SpatialAudioEngine singleton reference.
 *   zoneManager     AudioZoneManager singleton reference.
 *   effectProcessor VoiceEffectsProcessor reference (optional).
 *   onClose         Dismiss callback.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  X,
  Radio,
  Users,
  Sliders,
  Map,
} from "lucide-react";
import { SpatialAudioEngine, type Vec3 } from "@/lib/spatial/SpatialAudioEngine";
import {
  AudioZoneManager,
  ZONE_LABELS,
  ZONE_COLORS,
  type ZoneType,
} from "@/lib/spatial/AudioZones";
import {
  VoiceEffectsProcessor,
  VOICE_EFFECT_LABELS,
  VOICE_EFFECT_DESCRIPTIONS,
  ALL_VOICE_EFFECTS,
  type VoiceEffect,
} from "@/lib/spatial/VoiceEffects";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpatialParticipant {
  id: string;
  name: string;
  position: Vec3;
  /** Optional avatar colour for the minimap dot. Defaults to auto. */
  color?: string;
}

export interface SpatialAudioControlsProps {
  participants: SpatialParticipant[];
  listenerPos?: Vec3;
  engine: SpatialAudioEngine;
  zoneManager: AudioZoneManager;
  /** Pass a VoiceEffectsProcessor to show the voice-effects section. */
  effectProcessor?: VoiceEffectsProcessor | null;
  onClose?: () => void;
  className?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MINIMAP_SIZE = 200;
const MINIMAP_HALF = MINIMAP_SIZE / 2;
/** World metres per minimap pixel. */
const WORLD_SCALE = 8; // 8 m = full half-map

// ─── Colour helpers ───────────────────────────────────────────────────────────

const PARTICIPANT_COLORS = [
  "#00f3ff", // cyan
  "#ff3da0", // pink
  "#8a2be2", // purple
  "#ffd700", // gold
  "#00ff87", // mint
  "#ff6b35", // orange
];

function autoColor(index: number): string {
  return PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length] ?? "#00f3ff";
}

// ─── SpatialAudioControls ─────────────────────────────────────────────────────

export default function SpatialAudioControls({
  participants,
  listenerPos = { x: 0, y: 0, z: 0 },
  engine,
  zoneManager,
  effectProcessor,
  onClose,
  className = "",
}: SpatialAudioControlsProps) {
  const [activeTab, setActiveTab] = useState<"map" | "participants" | "effects" | "zones">("map");
  const [masterVolume, setMasterVolume] = useState(1);
  const [participantVolumes, setParticipantVolumes] = useState<Record<string, number>>({});
  const [participantMutes, setParticipantMutes] = useState<Record<string, boolean>>({});
  const [mutedZones, setMutedZones] = useState<Record<ZoneType, boolean>>({
    whisper: false,
    normal: false,
    broadcast: false,
  });
  const [currentEffect, setCurrentEffect] = useState<VoiceEffect>(
    effectProcessor?.getCurrentEffect() ?? "normal"
  );
  const [distances, setDistances] = useState<Record<string, number>>({});
  const [zones, setZones] = useState<Record<string, ZoneType>>({});
  const animFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── Sync zone manager → distances & zones ─────────────────────────────────

  useEffect(() => {
    const unsub = zoneManager.onZoneChange(() => {
      const newZones: Record<string, ZoneType> = {};
      for (const state of zoneManager.getAllZoneStates()) {
        newZones[state.participantId] = state.zone;
      }
      setZones(newZones);
    });
    return unsub;
  }, [zoneManager]);

  // Update positions and distances each frame.
  useEffect(() => {
    const tick = () => {
      zoneManager.updatePositions(
        participants.map((p) => ({ id: p.id, position: p.position })),
        listenerPos
      );

      const newDistances: Record<string, number> = {};
      for (const p of participants) {
        const state = engine.getParticipantState(p.id);
        newDistances[p.id] = state?.distance ?? 0;
      }
      setDistances(newDistances);

      const newZones: Record<string, ZoneType> = {};
      for (const p of participants) {
        const z = zoneManager.getZone(p.id);
        if (z) newZones[p.id] = z;
      }
      setZones(newZones);

      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    };
  }, [participants, listenerPos, engine, zoneManager]);

  // ── Canvas minimap ────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = MINIMAP_SIZE * dpr;
    canvas.height = MINIMAP_SIZE * dpr;
    canvas.style.width = `${MINIMAP_SIZE}px`;
    canvas.style.height = `${MINIMAP_SIZE}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // Background.
    ctx.fillStyle = "rgba(8, 10, 18, 0.9)";
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // Zone rings (world-to-canvas: metres → pixels).
    const metersToPx = MINIMAP_HALF / WORLD_SCALE;
    const zoneConfig = zoneManager.getZoneConfig();
    const zoneRings: Array<{ radius: number; color: string; label: string }> = [
      { radius: zoneConfig.whisperRadius * metersToPx, color: ZONE_COLORS.whisper, label: "W" },
      { radius: zoneConfig.normalRadius * metersToPx, color: ZONE_COLORS.normal, label: "N" },
      { radius: MINIMAP_HALF * 0.92, color: ZONE_COLORS.broadcast, label: "B" },
    ];

    for (const ring of zoneRings) {
      ctx.beginPath();
      ctx.arc(MINIMAP_HALF, MINIMAP_HALF, ring.radius, 0, Math.PI * 2);
      ctx.strokeStyle = ring.color + "55";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label at top of ring.
      ctx.fillStyle = ring.color + "99";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(ring.label, MINIMAP_HALF, MINIMAP_HALF - ring.radius + 12);
    }

    // Crosshair.
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(MINIMAP_HALF, 0);
    ctx.lineTo(MINIMAP_HALF, MINIMAP_SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, MINIMAP_HALF);
    ctx.lineTo(MINIMAP_SIZE, MINIMAP_HALF);
    ctx.stroke();

    // Listener dot.
    ctx.beginPath();
    ctx.arc(MINIMAP_HALF, MINIMAP_HALF, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.font = "8px monospace";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText("YOU", MINIMAP_HALF, MINIMAP_HALF + 16);

    // Participant dots.
    participants.forEach((p, idx) => {
      const relX = (p.position.x - listenerPos.x) * metersToPx;
      const relZ = (p.position.z - listenerPos.z) * metersToPx;
      const px = MINIMAP_HALF + relX;
      const py = MINIMAP_HALF - relZ; // Z is forward in Y-up world; flip for 2D map.

      const clampedPx = Math.max(8, Math.min(MINIMAP_SIZE - 8, px));
      const clampedPy = Math.max(8, Math.min(MINIMAP_SIZE - 8, py));
      const color = p.color ?? autoColor(idx);
      const muted = participantMutes[p.id] ?? false;

      ctx.beginPath();
      ctx.arc(clampedPx, clampedPy, 5, 0, Math.PI * 2);
      ctx.fillStyle = muted ? "#555" : color;
      ctx.fill();
      ctx.strokeStyle = muted ? "#333" : color + "bb";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Name label.
      ctx.fillStyle = muted ? "#666" : color;
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "center";
      ctx.fillText(p.name.slice(0, 6), clampedPx, clampedPy - 9);
    });
  }, [participants, listenerPos, zoneManager, participantMutes]);

  // ── Volume handlers ───────────────────────────────────────────────────────

  const handleMasterVolume = useCallback((v: number) => {
    setMasterVolume(v);
    engine.setMasterVolume(v);
  }, [engine]);

  const handleParticipantVolume = useCallback((id: string, v: number) => {
    setParticipantVolumes((prev) => ({ ...prev, [id]: v }));
    engine.setParticipantVolume(id, v);
  }, [engine]);

  const handleParticipantMute = useCallback((id: string) => {
    setParticipantMutes((prev) => {
      const next = !prev[id];
      engine.setParticipantMuted(id, next);
      return { ...prev, [id]: next };
    });
  }, [engine]);

  const handleZoneMute = useCallback((zone: ZoneType) => {
    setMutedZones((prev) => {
      const next = !prev[zone];
      zoneManager.muteZone(zone, next);
      return { ...prev, [zone]: next };
    });
  }, [zoneManager]);

  const handleEffectChange = useCallback((effect: VoiceEffect) => {
    setCurrentEffect(effect);
    effectProcessor?.setEffect(effect);
  }, [effectProcessor]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      className={className}
      style={{
        width: 360,
        borderRadius: 20,
        background: "rgba(10, 14, 22, 0.96)",
        border: "1px solid rgba(0, 243, 255, 0.18)",
        boxShadow: "0 24px 48px rgba(0,0,0,0.5), 0 0 60px rgba(0,243,255,0.08)",
        overflow: "hidden",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Radio size={16} style={{ color: "#00f3ff" }} />
          <span
            style={{
              color: "#e0f7ff",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Spatial Audio
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close spatial audio controls"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#8696a0",
              display: "flex",
              alignItems: "center",
              padding: 4,
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div
        style={{
          display: "flex",
          padding: "8px 12px 0",
          gap: 4,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {(
          [
            { key: "map", icon: <Map size={13} />, label: "Map" },
            { key: "participants", icon: <Users size={13} />, label: "Voices" },
            { key: "effects", icon: <Mic size={13} />, label: "Effects" },
            { key: "zones", icon: <Sliders size={13} />, label: "Zones" },
          ] as const
        ).map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              flex: 1,
              padding: "6px 4px",
              borderRadius: "8px 8px 0 0",
              border: "none",
              background:
                activeTab === key ? "rgba(0,243,255,0.10)" : "transparent",
              borderBottom:
                activeTab === key
                  ? "2px solid #00f3ff"
                  : "2px solid transparent",
              color: activeTab === key ? "#00f3ff" : "#8696a0",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div style={{ padding: "16px 18px 20px", overflowY: "auto", maxHeight: 460 }}>
        <AnimatePresence mode="wait">
          {activeTab === "map" && (
            <motion.div
              key="map"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}
            >
              <canvas
                ref={canvasRef}
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(0,243,255,0.15)",
                  boxShadow: "0 0 24px rgba(0,243,255,0.08)",
                }}
              />
              <ZoneLegend mutedZones={mutedZones} />
              <MasterVolumeControl volume={masterVolume} onChange={handleMasterVolume} />
            </motion.div>
          )}

          {activeTab === "participants" && (
            <motion.div
              key="participants"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              {participants.length === 0 && (
                <EmptyState message="No remote participants yet." />
              )}
              {participants.map((p, idx) => (
                <ParticipantRow
                  key={p.id}
                  participant={p}
                  color={p.color ?? autoColor(idx)}
                  volume={participantVolumes[p.id] ?? 1}
                  muted={participantMutes[p.id] ?? false}
                  zone={zones[p.id] ?? "broadcast"}
                  distance={distances[p.id] ?? 0}
                  onVolumeChange={(v) => handleParticipantVolume(p.id, v)}
                  onMuteToggle={() => handleParticipantMute(p.id)}
                />
              ))}
            </motion.div>
          )}

          {activeTab === "effects" && (
            <motion.div
              key="effects"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              {!effectProcessor && (
                <div
                  style={{
                    color: "#8696a0",
                    fontSize: 12,
                    textAlign: "center",
                    padding: "12px 0",
                  }}
                >
                  Voice effects require an active microphone session.
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {ALL_VOICE_EFFECTS.map((effect) => (
                  <VoiceEffectPill
                    key={effect}
                    effect={effect}
                    active={currentEffect === effect}
                    disabled={!effectProcessor}
                    onClick={() => handleEffectChange(effect)}
                  />
                ))}
              </div>
              <EffectDescription effect={currentEffect} />
            </motion.div>
          )}

          {activeTab === "zones" && (
            <motion.div
              key="zones"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              {(["whisper", "normal", "broadcast"] as ZoneType[]).map((zone) => (
                <ZoneRow
                  key={zone}
                  zone={zone}
                  muted={mutedZones[zone]}
                  participantCount={
                    Object.values(zones).filter((z) => z === zone).length
                  }
                  onToggleMute={() => handleZoneMute(zone)}
                />
              ))}
              <MasterVolumeControl volume={masterVolume} onChange={handleMasterVolume} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ParticipantRow({
  participant,
  color,
  volume,
  muted,
  zone,
  distance,
  onVolumeChange,
  onMuteToggle,
}: {
  participant: SpatialParticipant;
  color: string;
  volume: number;
  muted: boolean;
  zone: ZoneType;
  distance: number;
  onVolumeChange: (v: number) => void;
  onMuteToggle: () => void;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Avatar dot */}
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: muted ? "#243038" : `${color}33`,
            border: `2px solid ${muted ? "#36414a" : color}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            color: muted ? "#8696a0" : color,
            flexShrink: 0,
          }}
        >
          {participant.name[0]?.toUpperCase() ?? "?"}
        </div>

        {/* Name + zone */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: muted ? "#8696a0" : "#e9edef",
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {participant.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <ZoneBadge zone={zone} />
            <span style={{ color: "#8696a0", fontSize: 10 }}>
              {distance.toFixed(1)} m
            </span>
          </div>
        </div>

        {/* Mute button */}
        <button
          onClick={onMuteToggle}
          aria-label={muted ? `Unmute ${participant.name}` : `Mute ${participant.name}`}
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: `1px solid ${muted ? "#36414a" : color + "55"}`,
            background: muted ? "rgba(255,255,255,0.04)" : `${color}15`,
            color: muted ? "#8696a0" : color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {muted ? <MicOff size={13} /> : <Mic size={13} />}
        </button>
      </div>

      {/* Volume slider */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {volume === 0 || muted ? (
          <VolumeX size={12} style={{ color: "#8696a0", flexShrink: 0 }} />
        ) : (
          <Volume2 size={12} style={{ color, flexShrink: 0 }} />
        )}
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          disabled={muted}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: color, cursor: muted ? "not-allowed" : "pointer" }}
          aria-label={`Volume for ${participant.name}`}
        />
        <span style={{ color: "#8696a0", fontSize: 10, minWidth: 28, textAlign: "right" }}>
          {Math.round(volume * 100)}%
        </span>
      </div>
    </div>
  );
}

function ZoneBadge({ zone }: { zone: ZoneType }) {
  const color = ZONE_COLORS[zone];
  const short: Record<ZoneType, string> = {
    whisper: "Whisper",
    normal: "Normal",
    broadcast: "Broadcast",
  };
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color,
        background: `${color}18`,
        border: `1px solid ${color}44`,
        borderRadius: 4,
        padding: "1px 5px",
      }}
    >
      {short[zone]}
    </span>
  );
}

function ZoneLegend({ mutedZones }: { mutedZones: Record<ZoneType, boolean> }) {
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
      {(["whisper", "normal", "broadcast"] as ZoneType[]).map((zone) => (
        <div key={zone} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              border: `2px solid ${ZONE_COLORS[zone]}`,
              opacity: mutedZones[zone] ? 0.35 : 1,
            }}
          />
          <span style={{ color: "#8696a0", fontSize: 9, letterSpacing: "0.05em" }}>
            {zone.toUpperCase()}
          </span>
        </div>
      ))}
    </div>
  );
}

function ZoneRow({
  zone,
  muted,
  participantCount,
  onToggleMute,
}: {
  zone: ZoneType;
  muted: boolean;
  participantCount: number;
  onToggleMute: () => void;
}) {
  const color = ZONE_COLORS[zone];
  return (
    <div
      style={{
        borderRadius: 12,
        background: muted ? "rgba(255,255,255,0.02)" : `${color}0d`,
        border: `1px solid ${muted ? "rgba(255,255,255,0.06)" : color + "33"}`,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: muted ? "#36414a" : color,
          boxShadow: muted ? "none" : `0 0 8px ${color}99`,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            color: muted ? "#8696a0" : "#e9edef",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {ZONE_LABELS[zone]}
        </div>
        <div style={{ color: "#8696a0", fontSize: 10, marginTop: 2 }}>
          {participantCount} participant{participantCount !== 1 ? "s" : ""}
        </div>
      </div>
      <button
        onClick={onToggleMute}
        aria-label={muted ? `Unmute ${zone} zone` : `Mute ${zone} zone`}
        style={{
          padding: "5px 12px",
          borderRadius: 999,
          border: `1px solid ${muted ? "#36414a" : color + "66"}`,
          background: muted ? "rgba(255,255,255,0.04)" : `${color}18`,
          color: muted ? "#8696a0" : color,
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {muted ? "Unmute" : "Mute"}
      </button>
    </div>
  );
}

function VoiceEffectPill({
  effect,
  active,
  disabled,
  onClick,
}: {
  effect: VoiceEffect;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      style={{
        borderRadius: 10,
        border: `1px solid ${active ? "#00f3ff" : "rgba(255,255,255,0.1)"}`,
        background: active ? "rgba(0,243,255,0.12)" : "rgba(255,255,255,0.03)",
        color: active ? "#00f3ff" : disabled ? "#3a4a55" : "#aebac1",
        fontSize: 12,
        fontWeight: 600,
        padding: "9px 6px",
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "center",
        transition: "all 150ms ease",
        boxShadow: active ? "0 0 12px rgba(0,243,255,0.2)" : "none",
      }}
    >
      {VOICE_EFFECT_LABELS[effect]}
    </button>
  );
}

function EffectDescription({ effect }: { effect: VoiceEffect }) {
  return (
    <div
      style={{
        marginTop: 4,
        padding: "10px 12px",
        borderRadius: 10,
        background: "rgba(0,243,255,0.06)",
        border: "1px solid rgba(0,243,255,0.12)",
        color: "#8fe4ff",
        fontSize: 11,
        lineHeight: 1.6,
      }}
    >
      {VOICE_EFFECT_DESCRIPTIONS[effect]}
    </div>
  );
}

function MasterVolumeControl({
  volume,
  onChange,
}: {
  volume: number;
  onChange: (v: number) => void;
}) {
  return (
    <div
      style={{
        width: "100%",
        padding: "10px 14px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      {volume === 0 ? (
        <VolumeX size={14} style={{ color: "#8696a0", flexShrink: 0 }} />
      ) : (
        <Volume2 size={14} style={{ color: "#00f3ff", flexShrink: 0 }} />
      )}
      <span style={{ color: "#8696a0", fontSize: 11, flexShrink: 0 }}>Master</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: "#00f3ff" }}
        aria-label="Master volume"
      />
      <span style={{ color: "#8696a0", fontSize: 10, minWidth: 28, textAlign: "right" }}>
        {Math.round(volume * 100)}%
      </span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        color: "#8696a0",
        fontSize: 12,
        textAlign: "center",
        padding: "20px 0",
        fontStyle: "italic",
      }}
    >
      {message}
    </div>
  );
}
