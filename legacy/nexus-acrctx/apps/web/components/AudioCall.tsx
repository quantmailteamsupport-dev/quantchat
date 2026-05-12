"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWebRTC } from "@/lib/useWebRTC";

interface AudioCallProps {
  myUserId: string;
  peerId: string;
  peerName: string;
  open: boolean;
  onClose: () => void;
}

const AUDIO_THRESHOLD = 0.045;
const NOISE_GATE_ATTENUATION = 0.2;
const NOISE_GATE_RAMP_TIME = 0.05;
const NOISE_METER_SCALE_FACTOR = 420;

type ManagedAudioContext = AudioContext & {
  webkitAudioContext?: typeof AudioContext;
};

export default function AudioCall({
  myUserId,
  peerId,
  peerName,
  open,
  onClose,
}: AudioCallProps) {
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCleanupRef = useRef<(() => void) | null>(null);

  const [callStarted, setCallStarted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [noiseLevel, setNoiseLevel] = useState(0);

  const createNoiseSuppressedStream = useCallback(async (): Promise<MediaStream> => {
    audioCleanupRef.current?.();

    const rawStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: true,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });

    const AudioContextConstructor = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextConstructor) {
      return rawStream;
    }

    const audioContext = new AudioContextConstructor() as ManagedAudioContext;
    const source = audioContext.createMediaStreamSource(rawStream);
    const highPassFilter = audioContext.createBiquadFilter();
    const analyser = audioContext.createAnalyser();
    const compressor = audioContext.createDynamicsCompressor();
    const noiseGate = audioContext.createGain();
    const destination = audioContext.createMediaStreamDestination();

    highPassFilter.type = "highpass";
    highPassFilter.frequency.value = 120;
    highPassFilter.Q.value = 0.7;

    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.75;

    compressor.threshold.value = -50;
    compressor.knee.value = 24;
    compressor.ratio.value = 10;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    noiseGate.gain.value = 1;

    source.connect(highPassFilter);
    highPassFilter.connect(compressor);
    compressor.connect(analyser);
    analyser.connect(noiseGate);
    noiseGate.connect(destination);

    await audioContext.resume().catch(() => undefined);

    let animationFrameId: number | null = null;
    const sampleBuffer = new Uint8Array(analyser.fftSize);

    const updateNoiseGate = () => {
      analyser.getByteTimeDomainData(sampleBuffer);

      let total = 0;
      for (const sample of sampleBuffer) {
        const centered = (sample - 128) / 128;
        total += centered * centered;
      }

      const rms = Math.sqrt(total / sampleBuffer.length);
      setNoiseLevel(rms);
      noiseGate.gain.setTargetAtTime(
        rms < AUDIO_THRESHOLD ? NOISE_GATE_ATTENUATION : 1,
        audioContext.currentTime,
        NOISE_GATE_RAMP_TIME
      );

      animationFrameId = window.requestAnimationFrame(updateNoiseGate);
    };

    updateNoiseGate();

    const processedStream = destination.stream;

    audioCleanupRef.current = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      processedStream.getTracks().forEach((track) => track.stop());
      rawStream.getTracks().forEach((track) => track.stop());
      setNoiseLevel(0);
      void audioContext.close().catch(() => undefined);
    };

    return processedStream;
  }, []);

  const { isConnected, localStream, remoteStream, isCalling, callError, startCall, endCall } = useWebRTC(
    myUserId,
    peerId,
    { createLocalStream: createNoiseSuppressedStream }
  );

  const secureStatus = useMemo(() => {
    if (callError) return callError;
    if (remoteStream) return "Connected with end-to-end encrypted WebRTC audio";
    if (isCalling) return "Securing channel and suppressing background noise…";
    return "Ready to establish a secure voice channel";
  }, [callError, isCalling, remoteStream]);

  useEffect(() => {
    if (!remoteAudioRef.current) return;
    remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    if (!localAudioRef.current) return;
    localAudioRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
  }, [isMuted, localStream]);

  useEffect(() => {
    if (!open || callStarted) return;

    let isActive = true;

    void startCall().then((started) => {
      if (isActive && started) {
        setCallStarted(true);
      }
    });

    return () => {
      isActive = false;
      endCall();
      audioCleanupRef.current?.();
      audioCleanupRef.current = null;
    };
  }, [callStarted, endCall, open, startCall]);

  useEffect(() => {
    if (!open) {
      setCallStarted(false);
    }
  }, [open]);

  const handleClose = useCallback(() => {
    endCall();
    audioCleanupRef.current?.();
    audioCleanupRef.current = null;
    setCallStarted(false);
    setIsMuted(false);
    onClose();
  }, [endCall, onClose]);

  useEffect(() => () => {
    endCall();
    audioCleanupRef.current?.();
    audioCleanupRef.current = null;
  }, [endCall]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 40,
          background: "linear-gradient(180deg, rgba(17,27,33,0.97), rgba(11,20,26,0.98))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          backdropFilter: "blur(10px)",
        }}
      >
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          style={{
            width: "100%",
            maxWidth: 360,
            borderRadius: 28,
            background: "#182229",
            border: "1px solid #27353d",
            boxShadow: "0 24px 48px rgba(0,0,0,0.35)",
            padding: "28px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
          }}
        >
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #00a884, #008069)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              color: "#fff",
              boxShadow: remoteStream ? "0 0 0 14px rgba(0,168,132,0.12)" : "none",
            }}
          >
            {peerName[0]?.toUpperCase() ?? "?"}
          </div>

          <div style={{ textAlign: "center" }}>
            <div
              style={{
                color: "#e9edef",
                fontSize: 24,
                fontWeight: 700,
                fontFamily: "-apple-system, sans-serif",
              }}
            >
              {peerName}
            </div>
            <div
              style={{
                marginTop: 8,
                color: callError ? "#ff8a80" : "#aebac1",
                fontSize: 13,
                lineHeight: 1.5,
                fontFamily: "-apple-system, sans-serif",
              }}
            >
              {secureStatus}
            </div>
          </div>

          <div
            style={{
              width: "100%",
              borderRadius: 18,
              background: "#111b21",
              padding: "14px 16px",
              display: "grid",
              gap: 10,
            }}
          >
            <StatusRow label="Signal" value={isConnected ? "Encrypted signaling ready" : "Reconnecting…"} />
            <StatusRow
              label="Noise filter"
              value={noiseLevel < AUDIO_THRESHOLD ? "Filtering ambient background noise" : "Voice detected"}
            />
            <StatusRow label="Mic" value={isMuted ? "Muted locally" : "Live"} />
          </div>

          <div style={{ width: "100%" }}>
            <div
              style={{
                height: 8,
                borderRadius: 999,
                background: "#243038",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(noiseLevel * NOISE_METER_SCALE_FACTOR, 100)}%`,
                  height: "100%",
                  background: noiseLevel < AUDIO_THRESHOLD ? "#00a884" : "#ffd54f",
                  transition: "width 120ms ease, background 120ms ease",
                }}
              />
            </div>
            <div
              style={{
                marginTop: 6,
                color: "#8696a0",
                fontSize: 11,
                textAlign: "center",
                fontFamily: "-apple-system, sans-serif",
              }}
            >
              Live input meter used to gate low-level background noise before sending audio
            </div>
          </div>

          <div style={{ display: "flex", gap: 14 }}>
            <ControlButton
              label={isMuted ? "Unmute" : "Mute"}
              color={isMuted ? "#00a884" : "#36414a"}
              onClick={() => setIsMuted((current) => !current)}
            />
            <ControlButton
              label="End"
              color="#e53935"
              onClick={handleClose}
            />
          </div>

          <audio ref={remoteAudioRef} autoPlay />
          <audio ref={localAudioRef} autoPlay muted />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ControlButton({
  label,
  color,
  onClick,
}: {
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        minWidth: 108,
        height: 48,
        borderRadius: 999,
        border: "none",
        background: color,
        color: "#fff",
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "-apple-system, sans-serif",
      }}
    >
      {label}
    </button>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span
        style={{
          color: "#8696a0",
          fontSize: 12,
          fontFamily: "-apple-system, sans-serif",
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: "#e9edef",
          fontSize: 12,
          textAlign: "right",
          fontFamily: "-apple-system, sans-serif",
        }}
      >
        {value}
      </span>
    </div>
  );
}
