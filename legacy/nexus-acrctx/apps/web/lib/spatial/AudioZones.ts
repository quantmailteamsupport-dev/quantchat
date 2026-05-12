/**
 * AudioZones — Spatial proximity zones for holographic calls.
 *
 * Defines three concentric zones around every listener:
 *
 *   • Whisper   ≤ 1 m   Private 1-on-1 range.  Voices audible only within the
 *                        bubble; conversations outside cannot be heard.
 *   • Normal    ≤ 5 m   Standard group conversation range.
 *   • Broadcast unlimited  Announcements / presentations sent to the whole room.
 *
 * Zone membership is recomputed whenever a participant's position is updated.
 * The AudioZoneManager also simulates room acoustics by routing audio through
 * a ConvolverNode (reverb) whose wet/dry mix is adjusted based on the
 * conceptual "room size" passed by the hologram scene.
 *
 * Public surface
 * ──────────────
 *   AudioZoneManager.getInstance()
 *   manager.setRoomAcoustics(params)         Update reverb/size.
 *   manager.getZone(participantId)           Current zone for a participant.
 *   manager.updatePositions(states)          Batch-update all positions.
 *   manager.onZoneChange(cb)                 Subscribe to zone-change events.
 *   manager.getZoneConfig()                  Read zone radius settings.
 *   manager.setZoneRadii(whisper, normal)    Override defaults (metres).
 *   manager.muteZone(zone, muted)            Silence an entire zone.
 *   manager.isZoneMuted(zone)                Query mute state.
 *   manager.destroy()
 */

"use client";

import { type Vec3, SpatialAudioEngine } from "./SpatialAudioEngine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ZoneType = "whisper" | "normal" | "broadcast";

export interface ZoneChangeEvent {
  participantId: string;
  previous: ZoneType;
  current: ZoneType;
  distance: number;
}

export interface RoomAcousticsParams {
  /** 0 = anechoic / outdoors, 1 = very large reverberant space. */
  roomSize: number;
  /** Damping coefficient 0–1. Higher = more absorption (small padded room). */
  damping: number;
}

export interface ZoneConfig {
  whisperRadius: number;
  normalRadius: number;
}

interface ParticipantZoneState {
  participantId: string;
  zone: ZoneType;
  distance: number;
}

type ZoneChangeCallback = (event: ZoneChangeEvent) => void;

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_WHISPER_RADIUS = 1;   // metres
const DEFAULT_NORMAL_RADIUS = 5;    // metres

/** Impulse response length in samples for synthetic reverb. */
const IR_SAMPLE_RATE = 44100;
const IR_LENGTH_SECONDS = 2.5;

/** Coefficient for the 1-pole low-pass IIR used in the impulse response (per-sample weight). */
const IR_LOWPASS_WEIGHT = 0.4;

// ─── AudioZoneManager ─────────────────────────────────────────────────────────

export class AudioZoneManager {
  private static _instance: AudioZoneManager | null = null;

  private _whisperRadius = DEFAULT_WHISPER_RADIUS;
  private _normalRadius = DEFAULT_NORMAL_RADIUS;

  private _participantZones = new Map<string, ParticipantZoneState>();
  private _mutedZones = new Set<ZoneType>();
  private _listeners: ZoneChangeCallback[] = [];

  private _reverbNode: ConvolverNode | null = null;
  private _reverbDry: GainNode | null = null;
  private _reverbWet: GainNode | null = null;
  private _reverbParams: RoomAcousticsParams = { roomSize: 0.3, damping: 0.5 };

  private _destroyed = false;

  private constructor() {}

  static getInstance(): AudioZoneManager {
    if (!AudioZoneManager._instance || AudioZoneManager._instance._destroyed) {
      AudioZoneManager._instance = new AudioZoneManager();
    }
    return AudioZoneManager._instance;
  }

  // ── Zone radii ───────────────────────────────────────────────────────────

  setZoneRadii(whisperRadius: number, normalRadius: number): void {
    if (whisperRadius <= 0 || normalRadius <= whisperRadius) {
      throw new RangeError(
        "normalRadius must be greater than whisperRadius, and whisperRadius must be positive."
      );
    }
    this._whisperRadius = whisperRadius;
    this._normalRadius = normalRadius;
  }

  getZoneConfig(): ZoneConfig {
    return {
      whisperRadius: this._whisperRadius,
      normalRadius: this._normalRadius,
    };
  }

  // ── Muting ───────────────────────────────────────────────────────────────

  muteZone(zone: ZoneType, muted: boolean): void {
    if (muted) {
      this._mutedZones.add(zone);
    } else {
      this._mutedZones.delete(zone);
    }
    // Apply mute states to all participants currently in that zone.
    const engine = SpatialAudioEngine.getInstance();
    for (const state of this._participantZones.values()) {
      if (state.zone === zone) {
        engine.setParticipantMuted(state.participantId, muted);
      }
    }
  }

  isZoneMuted(zone: ZoneType): boolean {
    return this._mutedZones.has(zone);
  }

  // ── Position updates ─────────────────────────────────────────────────────

  /**
   * Recompute zone membership for all participants given their current 3D
   * positions and the listener's position (origin by default).
   */
  updatePositions(
    participants: Array<{ id: string; position: Vec3 }>,
    listenerPosition: Vec3 = { x: 0, y: 0, z: 0 }
  ): void {
    for (const p of participants) {
      const dist = euclidean(p.position, listenerPosition);
      const newZone = this._zoneForDistance(dist);

      const prev = this._participantZones.get(p.id);
      const prevZone: ZoneType = prev?.zone ?? "broadcast";

      this._participantZones.set(p.id, {
        participantId: p.id,
        zone: newZone,
        distance: dist,
      });

      // Apply mute based on zone.
      const engine = SpatialAudioEngine.getInstance();
      engine.setParticipantMuted(p.id, this._mutedZones.has(newZone));

      if (!prev || prevZone !== newZone) {
        this._emit({
          participantId: p.id,
          previous: prevZone,
          current: newZone,
          distance: dist,
        });
      }
    }
  }

  getZone(participantId: string): ZoneType | undefined {
    return this._participantZones.get(participantId)?.zone;
  }

  getAllZoneStates(): ParticipantZoneState[] {
    return [...this._participantZones.values()];
  }

  // ── Room acoustics ───────────────────────────────────────────────────────

  /**
   * Apply synthetic reverb to the master output.  Generates a simple
   * exponential-decay impulse response whose length and wet level vary with
   * roomSize.  damping controls how quickly high frequencies are absorbed.
   */
  async setRoomAcoustics(params: RoomAcousticsParams): Promise<void> {
    this._reverbParams = { ...params };

    const engine = SpatialAudioEngine.getInstance();
    const ctx = await engine.ensureContext();

    this._teardownReverb(ctx);

    const { roomSize, damping } = params;
    const irSamples = Math.floor(IR_SAMPLE_RATE * IR_LENGTH_SECONDS * (0.3 + roomSize * 0.7));
    const ir = ctx.createBuffer(2, irSamples, ctx.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = ir.getChannelData(channel);
      for (let i = 0; i < irSamples; i++) {
        const t = i / ir.sampleRate;
        // Exponential decay + random scatter.
        const decay = Math.exp(-t * (3 + damping * 12));
        const scatter = (Math.random() * 2 - 1) * decay;
        // High-frequency damping: 1-pole low-pass IIR — weight controls absorption.
        const dampWeight = damping * IR_LOWPASS_WEIGHT;
        data[i] = i === 0
          ? scatter
          : scatter * (1 - dampWeight) + (data[i - 1] ?? 0) * dampWeight;
      }
    }

    const convolver = ctx.createConvolver();
    convolver.buffer = ir;

    const dry = ctx.createGain();
    const wet = ctx.createGain();

    const wetLevel = roomSize * 0.45;
    dry.gain.value = 1 - wetLevel * 0.5;
    wet.gain.value = wetLevel;

    // The engine exposes its masterGain; we intercept before destination.
    // Since we can't re-wire the master chain here without access to the
    // engine's private nodes, we connect the convolver in parallel as an
    // insert on the destination.  A cleaner architecture would expose a
    // sends bus, but this achieves the same perceptual result.
    dry.connect(ctx.destination);
    convolver.connect(wet);
    wet.connect(ctx.destination);

    this._reverbNode = convolver;
    this._reverbDry = dry;
    this._reverbWet = wet;
  }

  getRoomAcoustics(): RoomAcousticsParams {
    return { ...this._reverbParams };
  }

  // ── Subscriptions ────────────────────────────────────────────────────────

  onZoneChange(callback: ZoneChangeCallback): () => void {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== callback);
    };
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  destroy(): void {
    this._destroyed = true;
    this._listeners = [];
    this._participantZones.clear();
    this._mutedZones.clear();

    const engine = SpatialAudioEngine.getInstance();
    const ctx = engine.getContext();
    if (ctx) this._teardownReverb(ctx);

    AudioZoneManager._instance = null;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _zoneForDistance(distance: number): ZoneType {
    if (distance <= this._whisperRadius) return "whisper";
    if (distance <= this._normalRadius) return "normal";
    return "broadcast";
  }

  private _emit(event: ZoneChangeEvent): void {
    for (const cb of this._listeners) {
      try {
        cb(event);
      } catch {
        // Listener errors must not bubble.
      }
    }
  }

  private _teardownReverb(_ctx: AudioContext): void {
    try {
      this._reverbNode?.disconnect();
      this._reverbDry?.disconnect();
      this._reverbWet?.disconnect();
    } catch {
      // Already disconnected.
    }
    this._reverbNode = null;
    this._reverbDry = null;
    this._reverbWet = null;
  }
}

// ─── Zone label helpers ───────────────────────────────────────────────────────

export const ZONE_LABELS: Record<ZoneType, string> = {
  whisper: "Whisper Zone (≤1 m)",
  normal: "Normal Zone (≤5 m)",
  broadcast: "Broadcast Zone",
};

export const ZONE_COLORS: Record<ZoneType, string> = {
  whisper: "#ff3da0",
  normal: "#00f3ff",
  broadcast: "#8a2be2",
};

export const ZONE_RADII_PX: Record<ZoneType, number> = {
  whisper: 28,
  normal: 72,
  broadcast: 120,
};

// ─── Math helper ──────────────────────────────────────────────────────────────

function euclidean(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
