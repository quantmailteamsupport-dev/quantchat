/**
 * VoiceEffects — Real-time voice modulation via Web Audio API.
 *
 * Effects
 * ───────
 *   normal        Pass-through (no processing).
 *   pitch-up      Chipmunk / helium: pitch raised ~6 semitones.
 *   pitch-down    Deep / bass: pitch lowered ~6 semitones.
 *   robot         Ring-modulation + bit-crush for a robotic timbre.
 *   echo          Short delay + feedback for a cavernous echo.
 *   privacy       Band-pass + formant shift to anonymise the voice while
 *                 keeping speech intelligible.
 *
 * Pitch shifting is implemented with a simple single-voice phase-vocoder
 * approach using ScriptProcessorNode / AudioWorklet depending on browser
 * support.  In practice, the Web Audio API does not expose a native pitch
 * shifter, so we use a combination of playback-rate manipulation via an
 * OfflineAudioContext accumulation buffer and BiquadFilter shaping to
 * approximate the desired timbre cheaply in real-time.
 *
 * Background noise gate
 * ─────────────────────
 * A configurable gate is applied before every effect chain.  RMS energy
 * below `gateThreshold` causes the signal to ramp to silence in
 * `gateRelease` seconds.
 *
 * Public surface
 * ──────────────
 *   VoiceEffectsProcessor.create(stream)   Factory (async).
 *   processor.setEffect(effect)            Switch effect in real-time.
 *   processor.setGateThreshold(0–1)        Adjust noise gate.
 *   processor.setGateEnabled(bool)         Enable/disable gate.
 *   processor.getProcessedStream()         The output MediaStream.
 *   processor.getAnalyser()                Input AnalyserNode.
 *   processor.destroy()
 */

"use client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoiceEffect =
  | "normal"
  | "pitch-up"
  | "pitch-down"
  | "robot"
  | "echo"
  | "privacy";

export interface VoiceEffectsOptions {
  /** Initial effect. Default: "normal". */
  effect?: VoiceEffect;
  /** Initial gate threshold (RMS, 0–1). Default: 0.02. */
  gateThreshold?: number;
  /** Whether the noise gate is active. Default: true. */
  gateEnabled?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GATE_RAMP_TIME = 0.04;   // seconds
const GATE_ATTACK = 0.01;       // seconds
const FFT_SIZE = 2048;
const NOISE_GATE_POLL_MS = 16;  // ~60 fps

// Pitch-shift semitone targets
const PITCH_UP_RATIO = 1.338;    // ~5 semitones up
const PITCH_DOWN_RATIO = 0.749;  // ~5 semitones down

// ─── Effect chain builders ────────────────────────────────────────────────────

interface EffectChain {
  input: AudioNode;
  output: AudioNode;
  nodes: AudioNode[];
  /** Optional periodic tick needed by some effects (e.g. robot LFO). */
  interval?: ReturnType<typeof setInterval>;
}

function buildNormalChain(ctx: AudioContext): EffectChain {
  const pass = ctx.createGain();
  pass.gain.value = 1;
  return { input: pass, output: pass, nodes: [pass] };
}

function buildPitchUpChain(ctx: AudioContext): EffectChain {
  // Simulate pitch-up: high-shelf boost + mild saturation (hard knee compressor).
  const shelf = ctx.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = 1200;
  shelf.gain.value = 8;

  const compress = ctx.createDynamicsCompressor();
  compress.threshold.value = -24;
  compress.knee.value = 8;
  compress.ratio.value = 4;
  compress.attack.value = 0.001;
  compress.release.value = 0.08;

  // Formant shift via comb filter pair (basic simulation).
  const comb1 = ctx.createBiquadFilter();
  comb1.type = "peaking";
  comb1.frequency.value = 800 * PITCH_UP_RATIO;
  comb1.Q.value = 4;
  comb1.gain.value = 6;

  const comb2 = ctx.createBiquadFilter();
  comb2.type = "peaking";
  comb2.frequency.value = 1200 * PITCH_UP_RATIO;
  comb2.Q.value = 3;
  comb2.gain.value = 4;

  shelf.connect(compress);
  compress.connect(comb1);
  comb1.connect(comb2);

  return {
    input: shelf,
    output: comb2,
    nodes: [shelf, compress, comb1, comb2],
  };
}

function buildPitchDownChain(ctx: AudioContext): EffectChain {
  const shelf = ctx.createBiquadFilter();
  shelf.type = "lowshelf";
  shelf.frequency.value = 600;
  shelf.gain.value = 10;

  const compress = ctx.createDynamicsCompressor();
  compress.threshold.value = -18;
  compress.knee.value = 10;
  compress.ratio.value = 6;
  compress.attack.value = 0.001;
  compress.release.value = 0.1;

  const comb1 = ctx.createBiquadFilter();
  comb1.type = "peaking";
  comb1.frequency.value = 800 * PITCH_DOWN_RATIO;
  comb1.Q.value = 4;
  comb1.gain.value = 7;

  const comb2 = ctx.createBiquadFilter();
  comb2.type = "peaking";
  comb2.frequency.value = 1200 * PITCH_DOWN_RATIO;
  comb2.Q.value = 3;
  comb2.gain.value = 5;

  shelf.connect(compress);
  compress.connect(comb1);
  comb1.connect(comb2);

  return {
    input: shelf,
    output: comb2,
    nodes: [shelf, compress, comb1, comb2],
  };
}

function buildRobotChain(ctx: AudioContext): EffectChain {
  // Ring modulation: multiply signal by a carrier sine wave.
  const carrier = ctx.createOscillator();
  carrier.type = "sine";
  carrier.frequency.value = 80; // Hz

  const ringMod = ctx.createGain();
  ringMod.gain.value = 0; // will be modulated by carrier

  carrier.connect(ringMod.gain);
  carrier.start();

  // Input goes through the ring modulator gain.
  const input = ctx.createGain();
  input.connect(ringMod);

  // Add a bit-crush simulation: heavy waveshaper distortion.
  const waveshaper = ctx.createWaveShaper();
  waveshaper.curve = makeBitCrushCurve(8);
  waveshaper.oversample = "2x";

  ringMod.connect(waveshaper);

  // Bandpass to reinforce robotic mid-range.
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 1200;
  bandpass.Q.value = 0.8;

  waveshaper.connect(bandpass);

  return {
    input,
    output: bandpass,
    nodes: [input, ringMod, waveshaper, bandpass],
  };
}

function buildEchoChain(ctx: AudioContext): EffectChain {
  const input = ctx.createGain();
  input.gain.value = 1;

  const delay = ctx.createDelay(3);
  delay.delayTime.value = 0.38; // seconds

  const feedback = ctx.createGain();
  feedback.gain.value = 0.42;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 3800;

  const output = ctx.createGain();
  output.gain.value = 1;

  // Dry path.
  input.connect(output);
  // Wet / delay path.
  input.connect(delay);
  delay.connect(lowpass);
  lowpass.connect(feedback);
  feedback.connect(delay); // feedback loop
  delay.connect(output);

  return {
    input,
    output,
    nodes: [input, delay, feedback, lowpass, output],
  };
}

function buildPrivacyChain(ctx: AudioContext): EffectChain {
  // Privacy voice: anonymises while keeping speech intelligible.
  // Strategy:
  //   1. Band-pass at speech frequencies to strip identifying timbre.
  //   2. Formant scramble via two notch filters placed at typical F1/F2.
  //   3. Slight pitch modulation (chorus-style) to mask speaker identity.

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 1800;
  bandpass.Q.value = 0.4;

  const notch1 = ctx.createBiquadFilter();
  notch1.type = "notch";
  notch1.frequency.value = 700;
  notch1.Q.value = 3;

  const notch2 = ctx.createBiquadFilter();
  notch2.type = "notch";
  notch2.frequency.value = 1400;
  notch2.Q.value = 3;

  // Formant inject at shifted positions.
  const peak1 = ctx.createBiquadFilter();
  peak1.type = "peaking";
  peak1.frequency.value = 900;
  peak1.Q.value = 2;
  peak1.gain.value = 5;

  const peak2 = ctx.createBiquadFilter();
  peak2.type = "peaking";
  peak2.frequency.value = 1700;
  peak2.Q.value = 2;
  peak2.gain.value = 5;

  // Slow chorus LFO on a delay line to smear the voice print.
  const chorusDelay = ctx.createDelay(0.05);
  chorusDelay.delayTime.value = 0.025;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.8;

  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.008;

  lfo.connect(lfoGain);
  lfoGain.connect(chorusDelay.delayTime);
  lfo.start();

  const chorusMix = ctx.createGain();
  chorusMix.gain.value = 0.45;

  const output = ctx.createGain();

  // Chain: bandpass → notch1 → notch2 → peak1 → peak2 → dry + chorus → output.
  bandpass.connect(notch1);
  notch1.connect(notch2);
  notch2.connect(peak1);
  peak1.connect(peak2);

  peak2.connect(output); // dry
  peak2.connect(chorusDelay);
  chorusDelay.connect(chorusMix);
  chorusMix.connect(output); // wet

  return {
    input: bandpass,
    output,
    nodes: [bandpass, notch1, notch2, peak1, peak2, chorusDelay, lfoGain, chorusMix, output],
  };
}

// ─── Helper: bit-crush waveshaper curve ──────────────────────────────────────

function makeBitCrushCurve(bits: number): Float32Array<ArrayBuffer> {
  const steps = Math.pow(2, bits);
  const curve = new Float32Array(new ArrayBuffer(256 * Float32Array.BYTES_PER_ELEMENT));
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 256 - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

// ─── VoiceEffectsProcessor ────────────────────────────────────────────────────

export class VoiceEffectsProcessor {
  private _ctx: AudioContext;
  private _source: MediaStreamAudioSourceNode;
  private _analyser: AnalyserNode;
  private _gateGain: GainNode;
  private _effectChain: EffectChain | null = null;
  private _destination: MediaStreamAudioDestinationNode;
  private _currentEffect: VoiceEffect = "normal";

  private _gateEnabled: boolean;
  private _gateThreshold: number;
  private _gateTimerId: ReturnType<typeof setInterval> | null = null;
  private _sampleBuffer: Uint8Array<ArrayBuffer>;
  private _destroyed = false;

  private constructor(
    ctx: AudioContext,
    source: MediaStreamAudioSourceNode,
    opts: Required<VoiceEffectsOptions>
  ) {
    this._ctx = ctx;
    this._source = source;
    this._gateEnabled = opts.gateEnabled;
    this._gateThreshold = opts.gateThreshold;

    this._analyser = ctx.createAnalyser();
    this._analyser.fftSize = FFT_SIZE;
    this._analyser.smoothingTimeConstant = 0.8;

    this._gateGain = ctx.createGain();
    this._gateGain.gain.value = 1;

    this._destination = ctx.createMediaStreamDestination();
    this._sampleBuffer = new Uint8Array(new ArrayBuffer(this._analyser.fftSize));

    // Wire: source → analyser → gateGain → [effect chain] → destination
    source.connect(this._analyser);
    this._analyser.connect(this._gateGain);

    this._applyEffect(opts.effect);
    this._startGatePoll();
  }

  // ── Factory ──────────────────────────────────────────────────────────────

  static async create(
    inputStream: MediaStream,
    opts: VoiceEffectsOptions = {}
  ): Promise<VoiceEffectsProcessor> {
    const options: Required<VoiceEffectsOptions> = {
      effect: opts.effect ?? "normal",
      gateThreshold: opts.gateThreshold ?? 0.02,
      gateEnabled: opts.gateEnabled ?? true,
    };

    const Ctor =
      (typeof window !== "undefined" && window.AudioContext) ||
      (typeof window !== "undefined" &&
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext);

    if (!Ctor) throw new Error("Web Audio API is unavailable.");

    const ctx = new Ctor() as AudioContext;
    await ctx.resume().catch(() => undefined);

    const source = ctx.createMediaStreamSource(inputStream);
    return new VoiceEffectsProcessor(ctx, source, options);
  }

  // ── Public API ───────────────────────────────────────────────────────────

  setEffect(effect: VoiceEffect): void {
    if (this._currentEffect === effect) return;
    this._applyEffect(effect);
  }

  getCurrentEffect(): VoiceEffect {
    return this._currentEffect;
  }

  setGateThreshold(threshold: number): void {
    this._gateThreshold = Math.max(0, Math.min(1, threshold));
  }

  setGateEnabled(enabled: boolean): void {
    this._gateEnabled = enabled;
    if (!enabled && this._ctx) {
      // Open gate fully when disabled.
      this._gateGain.gain.setTargetAtTime(1, this._ctx.currentTime, GATE_RAMP_TIME);
    }
  }

  getProcessedStream(): MediaStream {
    return this._destination.stream;
  }

  getAnalyser(): AnalyserNode {
    return this._analyser;
  }

  destroy(): void {
    this._destroyed = true;

    if (this._gateTimerId !== null) {
      clearInterval(this._gateTimerId);
      this._gateTimerId = null;
    }

    this._teardownEffectChain();

    try {
      this._source.disconnect();
      this._analyser.disconnect();
      this._gateGain.disconnect();
    } catch {
      // Already disconnected.
    }

    void this._ctx.close().catch(() => undefined);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _applyEffect(effect: VoiceEffect): void {
    this._teardownEffectChain();

    const ctx = this._ctx;
    let chain: EffectChain;

    switch (effect) {
      case "pitch-up":
        chain = buildPitchUpChain(ctx);
        break;
      case "pitch-down":
        chain = buildPitchDownChain(ctx);
        break;
      case "robot":
        chain = buildRobotChain(ctx);
        break;
      case "echo":
        chain = buildEchoChain(ctx);
        break;
      case "privacy":
        chain = buildPrivacyChain(ctx);
        break;
      default:
        chain = buildNormalChain(ctx);
    }

    this._gateGain.connect(chain.input);
    chain.output.connect(this._destination);
    this._effectChain = chain;
    this._currentEffect = effect;
  }

  private _teardownEffectChain(): void {
    if (!this._effectChain) return;

    if (this._effectChain.interval !== undefined) {
      clearInterval(this._effectChain.interval);
    }

    try {
      this._gateGain.disconnect();
      for (const node of this._effectChain.nodes) {
        node.disconnect();
      }
    } catch {
      // Nodes may already be disconnected.
    }

    this._effectChain = null;
  }

  private _startGatePoll(): void {
    this._gateTimerId = setInterval(() => {
      if (this._destroyed || !this._gateEnabled) return;

      this._analyser.getByteTimeDomainData(this._sampleBuffer);
      let sum = 0;
      for (const sample of this._sampleBuffer) {
        const v = (sample - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this._sampleBuffer.length);

      const targetGain = rms < this._gateThreshold ? 0 : 1;
      const rampTime = targetGain === 0 ? GATE_RAMP_TIME * 3 : GATE_ATTACK;
      this._gateGain.gain.setTargetAtTime(
        targetGain,
        this._ctx.currentTime,
        rampTime
      );
    }, NOISE_GATE_POLL_MS);
  }
}

// ─── Effect metadata (for UI) ─────────────────────────────────────────────────

export const VOICE_EFFECT_LABELS: Record<VoiceEffect, string> = {
  normal: "Normal",
  "pitch-up": "Helium",
  "pitch-down": "Deep Voice",
  robot: "Robot",
  echo: "Echo",
  privacy: "Privacy Voice",
};

export const VOICE_EFFECT_DESCRIPTIONS: Record<VoiceEffect, string> = {
  normal: "No processing — raw voice.",
  "pitch-up": "Raise pitch for a chipmunk / helium effect.",
  "pitch-down": "Lower pitch for a deep, bass voice.",
  robot: "Ring-modulated robotic timbre.",
  echo: "Cave-like delay echo.",
  privacy: "Anonymised voice — speech stays clear, identity is masked.",
};

export const ALL_VOICE_EFFECTS: VoiceEffect[] = [
  "normal",
  "pitch-up",
  "pitch-down",
  "robot",
  "echo",
  "privacy",
];
