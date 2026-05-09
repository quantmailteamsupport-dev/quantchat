/**
 * SpatialAudioEngine — 3D positional audio for holographic calls.
 *
 * Uses the Web Audio API PannerNode configured with the "HRTF" panning model
 * so that each remote participant's voice is spatialised relative to the
 * listener's head position.  Distance attenuation follows the inverse-square
 * law via the "inverse" distance model.  On browsers/devices that do not
 * support HRTF the engine falls back to "equalpower" stereo panning silently.
 *
 * Head-tracking is achieved through the DeviceOrientationEvent API (mobile) or
 * a pointer-delta heuristic (desktop) and is used to update the AudioListener
 * orientation each animation frame.
 *
 * Public surface
 * ──────────────
 *   SpatialAudioEngine.getInstance()          Singleton accessor.
 *   engine.addParticipant(id, stream)         Route a remote MediaStream into 3D space.
 *   engine.removeParticipant(id)              Disconnect and destroy a participant's node graph.
 *   engine.setParticipantPosition(id, pos)    Update 3D position (metres, Y-up).
 *   engine.setListenerPosition(pos)           Update listener world position.
 *   engine.setParticipantVolume(id, 0–1)      Per-participant gain.
 *   engine.setMasterVolume(0–1)               Global gain.
 *   engine.getAnalyserNode(id)                Expose analyser for VU meters.
 *   engine.destroy()                          Tear down everything.
 */

"use client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ParticipantAudioState {
  id: string;
  position: Vec3;
  volume: number;
  muted: boolean;
  /** Current perceived distance in metres (updated each render tick). */
  distance: number;
}

export interface ListenerOrientation {
  /** Forward direction unit vector. */
  forward: Vec3;
  /** Up direction unit vector. */
  up: Vec3;
}

type HeadTrackingMode = "device-orientation" | "pointer-delta" | "none";

interface ParticipantNodes {
  source: MediaStreamAudioSourceNode;
  panner: PannerNode;
  gain: GainNode;
  analyser: AnalyserNode;
  stream: MediaStream;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Reference distance: inside this sphere the source is at full volume (metres). */
const REF_DISTANCE = 1;
/** Maximum audible distance (metres).  Beyond this point gain is zero. */
const MAX_DISTANCE = 40;
/** Rolloff factor for the inverse model. Higher = faster dropoff. */
const ROLLOFF_FACTOR = 1.8;
/** FFT size for AnalyserNodes. */
const ANALYSER_FFT = 2048;
/** How quickly (seconds) the gain node ramps to new values. */
const GAIN_RAMP_TIME = 0.04;
/** Smoothing applied when the listener rotates. */
const ORIENTATION_LERP = 0.12;
/** Degrees → radians. */
const DEG2RAD = Math.PI / 180;

// ─── SpatialAudioEngine ───────────────────────────────────────────────────────

export class SpatialAudioEngine {
  private static _instance: SpatialAudioEngine | null = null;

  private _ctx: AudioContext | null = null;
  private _masterGain: GainNode | null = null;
  private _participants = new Map<string, ParticipantNodes>();
  private _states = new Map<string, ParticipantAudioState>();

  private _listenerPos: Vec3 = { x: 0, y: 0, z: 0 };
  private _listenerOrientation: ListenerOrientation = {
    forward: { x: 0, y: 0, z: -1 },
    up: { x: 0, y: 1, z: 0 },
  };
  private _targetOrientation: ListenerOrientation = {
    forward: { x: 0, y: 0, z: -1 },
    up: { x: 0, y: 1, z: 0 },
  };

  private _headTrackingMode: HeadTrackingMode = "none";
  private _rafId: number | null = null;
  private _destroyed = false;

  // Pointer-delta state for desktop head-tracking approximation.
  private _lastPointerX = 0;
  private _pointerYaw = 0; // accumulated yaw from pointer in radians

  private constructor() {}

  // ── Singleton ────────────────────────────────────────────────────────────

  static getInstance(): SpatialAudioEngine {
    if (!SpatialAudioEngine._instance || SpatialAudioEngine._instance._destroyed) {
      SpatialAudioEngine._instance = new SpatialAudioEngine();
    }
    return SpatialAudioEngine._instance;
  }

  // ── Initialisation ───────────────────────────────────────────────────────

  /**
   * Lazily create the AudioContext.  Must be called from a user-gesture handler
   * to comply with the browser autoplay policy.
   */
  async ensureContext(): Promise<AudioContext> {
    if (this._ctx && this._ctx.state !== "closed") {
      if (this._ctx.state === "suspended") {
        await this._ctx.resume().catch(() => undefined);
      }
      return this._ctx;
    }

    const Ctor =
      (typeof window !== "undefined" && window.AudioContext) ||
      (typeof window !== "undefined" &&
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext);

    if (!Ctor) {
      throw new Error("Web Audio API is not supported in this environment.");
    }

    this._ctx = new Ctor() as AudioContext;
    this._masterGain = this._ctx.createGain();
    this._masterGain.gain.value = 1;
    this._masterGain.connect(this._ctx.destination);

    this._applyListenerOrientation();
    this._applyListenerPosition();

    this._startRenderLoop();
    this._setupHeadTracking();

    return this._ctx;
  }

  // ── Participant management ────────────────────────────────────────────────

  /**
   * Route a remote participant's MediaStream into a 3D HRTF panner.
   * Safe to call multiple times with the same id (idempotent).
   */
  async addParticipant(id: string, stream: MediaStream): Promise<void> {
    if (this._participants.has(id)) {
      this.removeParticipant(id);
    }

    const ctx = await this.ensureContext();

    const source = ctx.createMediaStreamSource(stream);

    const panner = ctx.createPanner();
    this._configurePanner(panner);

    const gain = ctx.createGain();
    gain.gain.value = 1;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = ANALYSER_FFT;
    analyser.smoothingTimeConstant = 0.8;

    source.connect(panner);
    panner.connect(gain);
    gain.connect(analyser);
    analyser.connect(this._masterGain!);

    this._participants.set(id, { source, panner, gain, analyser, stream });

    if (!this._states.has(id)) {
      this._states.set(id, {
        id,
        position: { x: 0, y: 0, z: 0 },
        volume: 1,
        muted: false,
        distance: 0,
      });
    }

    this._syncPannerPosition(id);
  }

  removeParticipant(id: string): void {
    const nodes = this._participants.get(id);
    if (!nodes) return;

    try {
      nodes.gain.disconnect();
      nodes.panner.disconnect();
      nodes.source.disconnect();
      nodes.analyser.disconnect();
    } catch {
      // Nodes may already be disconnected; safe to ignore.
    }

    this._participants.delete(id);
    this._states.delete(id);
  }

  // ── Positioning ──────────────────────────────────────────────────────────

  setParticipantPosition(id: string, position: Vec3): void {
    const state = this._getOrCreateState(id);
    state.position = position;
    this._syncPannerPosition(id);
  }

  setListenerPosition(position: Vec3): void {
    this._listenerPos = { ...position };
    this._applyListenerPosition();
    // Recompute distances for all participants.
    for (const id of this._states.keys()) {
      this._syncPannerPosition(id);
    }
  }

  setListenerOrientation(orientation: ListenerOrientation): void {
    this._targetOrientation = {
      forward: normalise(orientation.forward),
      up: normalise(orientation.up),
    };
  }

  // ── Volume ───────────────────────────────────────────────────────────────

  setParticipantVolume(id: string, volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    const state = this._getOrCreateState(id);
    state.volume = clamped;
    const nodes = this._participants.get(id);
    if (nodes && this._ctx) {
      nodes.gain.gain.setTargetAtTime(
        state.muted ? 0 : clamped,
        this._ctx.currentTime,
        GAIN_RAMP_TIME
      );
    }
  }

  setParticipantMuted(id: string, muted: boolean): void {
    const state = this._getOrCreateState(id);
    state.muted = muted;
    const nodes = this._participants.get(id);
    if (nodes && this._ctx) {
      nodes.gain.gain.setTargetAtTime(
        muted ? 0 : state.volume,
        this._ctx.currentTime,
        GAIN_RAMP_TIME
      );
    }
  }

  setMasterVolume(volume: number): void {
    if (!this._masterGain || !this._ctx) return;
    const clamped = Math.max(0, Math.min(1, volume));
    this._masterGain.gain.setTargetAtTime(
      clamped,
      this._ctx.currentTime,
      GAIN_RAMP_TIME
    );
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  getParticipantState(id: string): ParticipantAudioState | undefined {
    return this._states.get(id);
  }

  getAllParticipantStates(): ParticipantAudioState[] {
    return [...this._states.values()];
  }

  getAnalyserNode(id: string): AnalyserNode | undefined {
    return this._participants.get(id)?.analyser;
  }

  getContext(): AudioContext | null {
    return this._ctx;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  destroy(): void {
    this._destroyed = true;

    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    this._teardownHeadTracking();

    for (const id of [...this._participants.keys()]) {
      this.removeParticipant(id);
    }

    if (this._ctx) {
      void this._ctx.close().catch(() => undefined);
      this._ctx = null;
      this._masterGain = null;
    }

    SpatialAudioEngine._instance = null;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private _configurePanner(panner: PannerNode): void {
    // Try HRTF; browsers that don't support it will silently use equalpower.
    try {
      panner.panningModel = "HRTF";
    } catch {
      panner.panningModel = "equalpower";
    }
    panner.distanceModel = "inverse";
    panner.refDistance = REF_DISTANCE;
    panner.maxDistance = MAX_DISTANCE;
    panner.rolloffFactor = ROLLOFF_FACTOR;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 0;
    panner.coneOuterGain = 0;
  }

  private _syncPannerPosition(id: string): void {
    const state = this._states.get(id);
    const nodes = this._participants.get(id);
    if (!state || !nodes || !this._ctx) return;

    const { x, y, z } = state.position;

    if (nodes.panner.positionX) {
      // Modern API
      const t = this._ctx.currentTime;
      nodes.panner.positionX.setTargetAtTime(x, t, GAIN_RAMP_TIME);
      nodes.panner.positionY.setTargetAtTime(y, t, GAIN_RAMP_TIME);
      nodes.panner.positionZ.setTargetAtTime(z, t, GAIN_RAMP_TIME);
    } else {
      // Legacy API
      (nodes.panner as PannerNode & { setPosition: (x: number, y: number, z: number) => void })
        .setPosition(x, y, z);
    }

    // Update cached distance.
    state.distance = euclidean(state.position, this._listenerPos);
  }

  private _applyListenerPosition(): void {
    if (!this._ctx) return;
    const { x, y, z } = this._listenerPos;
    const listener = this._ctx.listener;
    if (listener.positionX) {
      listener.positionX.value = x;
      listener.positionY.value = y;
      listener.positionZ.value = z;
    } else {
      (listener as AudioListener & { setPosition: (x: number, y: number, z: number) => void })
        .setPosition(x, y, z);
    }
  }

  private _applyListenerOrientation(): void {
    if (!this._ctx) return;
    const { forward: f, up: u } = this._listenerOrientation;
    const listener = this._ctx.listener;
    if (listener.forwardX) {
      listener.forwardX.value = f.x;
      listener.forwardY.value = f.y;
      listener.forwardZ.value = f.z;
      listener.upX.value = u.x;
      listener.upY.value = u.y;
      listener.upZ.value = u.z;
    } else {
      (listener as AudioListener & { setOrientation: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void })
        .setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }

  private _startRenderLoop(): void {
    const tick = () => {
      if (this._destroyed) return;
      this._interpolateOrientation();
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  private _interpolateOrientation(): void {
    const o = this._listenerOrientation;
    const t = this._targetOrientation;

    const newForward = lerpVec3(o.forward, t.forward, ORIENTATION_LERP);
    const newUp = lerpVec3(o.up, t.up, ORIENTATION_LERP);

    this._listenerOrientation = {
      forward: normalise(newForward),
      up: normalise(newUp),
    };

    this._applyListenerOrientation();
  }

  // ── Head tracking ─────────────────────────────────────────────────────────

  private _onDeviceOrientation = (event: DeviceOrientationEvent): void => {
    const alpha = (event.alpha ?? 0) * DEG2RAD; // yaw  (Z)
    const beta = (event.beta ?? 0) * DEG2RAD;   // pitch (X)

    // Convert Euler angles to a forward vector (simplified; no roll).
    const forward: Vec3 = {
      x: Math.sin(alpha) * Math.cos(beta),
      y: -Math.sin(beta),
      z: -Math.cos(alpha) * Math.cos(beta),
    };
    this._targetOrientation = {
      forward: normalise(forward),
      up: { x: 0, y: 1, z: 0 },
    };
  };

  private _onPointerMove = (event: PointerEvent): void => {
    const dx = event.clientX - this._lastPointerX;
    this._lastPointerX = event.clientX;
    this._pointerYaw += dx * 0.002; // sensitivity

    const forward: Vec3 = {
      x: Math.sin(this._pointerYaw),
      y: 0,
      z: -Math.cos(this._pointerYaw),
    };
    this._targetOrientation = {
      forward: normalise(forward),
      up: { x: 0, y: 1, z: 0 },
    };
  };

  private _setupHeadTracking(): void {
    if (typeof window === "undefined") return;

    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof (DeviceOrientationEvent as { requestPermission?: () => Promise<string> })
        .requestPermission !== "function"
    ) {
      // Non-iOS: just listen.
      window.addEventListener("deviceorientation", this._onDeviceOrientation, {
        passive: true,
      });
      this._headTrackingMode = "device-orientation";
    } else {
      // Desktop fallback: pointer movement.
      window.addEventListener("pointermove", this._onPointerMove, {
        passive: true,
      });
      this._headTrackingMode = "pointer-delta";
    }
  }

  /**
   * On iOS 13+ you must call this from a user-gesture handler to receive
   * DeviceOrientationEvent data.
   */
  async requestIOSHeadTrackingPermission(): Promise<boolean> {
    const DOE = DeviceOrientationEvent as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DOE.requestPermission !== "function") return true;

    try {
      const result = await DOE.requestPermission();
      if (result === "granted") {
        window.removeEventListener("pointermove", this._onPointerMove);
        window.addEventListener("deviceorientation", this._onDeviceOrientation, {
          passive: true,
        });
        this._headTrackingMode = "device-orientation";
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private _teardownHeadTracking(): void {
    if (typeof window === "undefined") return;
    window.removeEventListener("deviceorientation", this._onDeviceOrientation);
    window.removeEventListener("pointermove", this._onPointerMove);
    this._headTrackingMode = "none";
  }

  private _getOrCreateState(id: string): ParticipantAudioState {
    if (!this._states.has(id)) {
      this._states.set(id, {
        id,
        position: { x: 0, y: 0, z: 0 },
        volume: 1,
        muted: false,
        distance: 0,
      });
    }
    return this._states.get(id)!;
  }
}

// ─── Math helpers ──────────────────────────────────────────────────────────────

function euclidean(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function normalise(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 1e-9) return { x: 0, y: 0, z: -1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
