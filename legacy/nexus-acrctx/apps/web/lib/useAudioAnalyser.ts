"use client";

import { useEffect, useRef, useState } from "react";

// ═══════════════════════════════════════════════════════════════
// useAudioAnalyser
// ═══════════════════════════════════════════════════════════════
//
// Wraps the Web Audio API AnalyserNode to extract per-band frequency
// magnitude data from a MediaStream on every animation frame.
//
// The returned `frequencyBands` array partitions the FFT output into
// four perceptual bands:
//   [0] sub-bass   20–80 Hz   — felt in chest; drives core orb scale
//   [1] bass       80–300 Hz  — kick/voice fundamentals
//   [2] mid        300–3k Hz  — speech presence; drives ring distortion
//   [3] treble     3k–20k Hz  — sibilance/brightness; drives glitch
//
// All values are normalised to [0, 1].
//
// The hook tolerates a null/undefined stream gracefully; when the
// stream disappears (e.g. packet loss / call ended) the last good
// values decay exponentially so the hologram fades out instead of
// snapping to zero.
// ═══════════════════════════════════════════════════════════════

const FFT_SIZE = 1024;
const SMOOTHING = 0.72;
// Decay factor applied per frame when there is no live audio data.
const PACKET_LOSS_DECAY = 0.94;

export interface AudioBands {
  subBass: number;
  bass: number;
  mid: number;
  treble: number;
  /** Raw normalised frequency array (length = FFT_SIZE / 2). */
  raw: Float32Array;
}

const NEUTRAL_BANDS: AudioBands = {
  subBass: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  raw: new Float32Array(FFT_SIZE / 2),
};

export { NEUTRAL_BANDS };

/**
 * Average the dB magnitudes of a sub-range of the frequency array
 * and return a value normalised to [0, 1] (0 dB = 1, –100 dB = 0).
 */
function bandAverage(data: Float32Array, fromBin: number, toBin: number): number {
  let sum = 0;
  const count = toBin - fromBin;
  if (count <= 0) return 0;
  for (let i = fromBin; i < toBin; i++) {
    sum += data[i] ?? -100;
  }
  const avgDb = sum / count;
  return Math.max(0, Math.min(1, (avgDb + 100) / 100));
}

export function useAudioAnalyser(stream: MediaStream | null | undefined): AudioBands {
  const [bands, setBands] = useState<AudioBands>(NEUTRAL_BANDS);

  // Keep mutable refs for the audio graph so it survives re-renders.
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const decayRef = useRef<AudioBands>({ ...NEUTRAL_BANDS, raw: new Float32Array(FFT_SIZE / 2) });

  useEffect(() => {
    if (!stream) {
      // No stream: decay the last-known values toward zero each frame.
      const decay = () => {
        const d = decayRef.current;
        const next: AudioBands = {
          subBass: d.subBass * PACKET_LOSS_DECAY,
          bass: d.bass * PACKET_LOSS_DECAY,
          mid: d.mid * PACKET_LOSS_DECAY,
          treble: d.treble * PACKET_LOSS_DECAY,
          raw: Float32Array.from(d.raw, (v) => v * PACKET_LOSS_DECAY),
        };
        decayRef.current = next;
        setBands({ ...next });
        rafRef.current = requestAnimationFrame(decay);
      };
      rafRef.current = requestAnimationFrame(decay);
      return () => cancelAnimationFrame(rafRef.current);
    }

    // Build the audio graph.
    const AudioContextCtor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const ctx = new AudioContextCtor();
    ctxRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = SMOOTHING;
    analyserRef.current = analyser;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    // Do NOT connect analyser to destination — we don't want to play back
    // the remote audio through this path; AudioCall already handles that.

    void ctx.resume().catch(() => undefined);

    const freqData = new Float32Array(analyser.frequencyBinCount);
    const sampleRate = ctx.sampleRate;
    const binCount = analyser.frequencyBinCount;
    const hzPerBin = sampleRate / (binCount * 2);

    const hz2bin = (hz: number) =>
      Math.min(binCount - 1, Math.max(0, Math.round(hz / hzPerBin)));

    const subBassRange = [hz2bin(20), hz2bin(80)] as const;
    const bassRange = [hz2bin(80), hz2bin(300)] as const;
    const midRange = [hz2bin(300), hz2bin(3000)] as const;
    const trebleRange = [hz2bin(3000), hz2bin(20000)] as const;

    const tick = () => {
      analyser.getFloatFrequencyData(freqData);
      const next: AudioBands = {
        subBass: bandAverage(freqData, subBassRange[0], subBassRange[1]),
        bass: bandAverage(freqData, bassRange[0], bassRange[1]),
        mid: bandAverage(freqData, midRange[0], midRange[1]),
        treble: bandAverage(freqData, trebleRange[0], trebleRange[1]),
        raw: freqData.slice(),
      };
      decayRef.current = next;
      setBands(next);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      source.disconnect();
      analyser.disconnect();
      void ctx.close().catch(() => undefined);
      ctxRef.current = null;
      analyserRef.current = null;
    };
  }, [stream]);

  return bands;
}
