"use client";

/**
 * HolographicVideoCall — WebRTC video call surface rendered with a
 * "holographic" neon XR aesthetic. Reuses the existing useWebRTC hook
 * (which piggy-backs on the encrypted signaling channel) so no new
 * backend work is required.
 *
 * Visual language matches the /xr bond-orb page: deep background,
 * cyan/magenta neon edges, tilted CSS-3D planes, framer-motion
 * entrance, minimal glass panels. No three.js / WebXR deps so that
 * the component stays buildable inside the existing bundle budget.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Sparkles, Wifi, WifiOff } from "lucide-react";
import { useWebRTC } from "@/lib/useWebRTC";
import SpatialAudioControls from "@/components/SpatialAudioControls";
import {
  SpatialAudioEngine,
  type Vec3,
} from "@/lib/spatial/SpatialAudioEngine";
import { AudioZoneManager } from "@/lib/spatial/AudioZones";

interface HolographicVideoCallProps {
  myUserId: string;
  peerId: string;
  peerName: string;
  /** Called when the user ends the call. */
  onClose: () => void;
  /** If true, the call is initiated as soon as the component mounts. */
  autoStart?: boolean;
}

export default function HolographicVideoCall({
  myUserId,
  peerId,
  peerName,
  onClose,
  autoStart = true,
}: HolographicVideoCallProps) {
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const [callStarted, setCallStarted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  // Default peer position: 2m in front of the listener. The merged
  // SpatialAudioControls minimap is read-only, so this stays constant
  // for now; future work can expose a drag callback for repositioning.
  const peerPosition: Vec3 = useMemo(() => ({ x: 0, y: 0, z: -2 }), []);

  // Use the shared singletons from the merged Spatial Audio stack.
  const spatialEngine = useMemo(() => SpatialAudioEngine.getInstance(), []);
  const audioZones = useMemo(() => AudioZoneManager.getInstance(), []);

  const {
    isConnected,
    localStream,
    remoteStream,
    isCalling,
    callError,
    startCall,
    endCall,
  } = useWebRTC(myUserId, peerId);

  // ── Attach streams to <video> elements ──
  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // ── Keep track enabled state in sync with toggles ──
  useEffect(() => {
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
  }, [isMuted, localStream]);

  useEffect(() => {
    localStream?.getVideoTracks().forEach((track) => {
      track.enabled = videoEnabled;
    });
  }, [videoEnabled, localStream]);

  // ── Kick off the call once ──
  useEffect(() => {
    if (!autoStart || callStarted) return;
    let active = true;
    void startCall({ withVideo: true }).then(async (ok) => {
      if (!active || !ok) return;
      try {
        // Ensure the AudioContext exists — must be after a user gesture
        // (autoplay policy). `startCall` is invoked from a mount effect
        // following the user-initiated render of this component.
        await spatialEngine.ensureContext();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[HolographicVideoCall] spatial audio start failed", err);
      }
      setCallStarted(true);
    });
    return () => {
      active = false;
    };
    // startCall is stable per peer; we only want this to run once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // Keep a ref of peerPosition so the add-participant effect reads a
  // current value without taking peerPosition as a dependency.
  const peerPositionRef = useRef<Vec3>(peerPosition);

  // ── Spatial audio: attach remote stream once it exists ──
  // Intentionally NOT depending on peerPosition so we don't re-add the
  // participant every time the user drags them on the minimap. Position
  // updates are handled by the dedicated effect below via
  // setParticipantPosition for smooth motion.
  useEffect(() => {
    if (!callStarted || !remoteStream) return;
    let cancelled = false;
    void (async () => {
      try {
        await spatialEngine.addParticipant(peerId, remoteStream);
        if (cancelled) {
          spatialEngine.removeParticipant(peerId);
          return;
        }
        spatialEngine.setParticipantPosition(peerId, peerPositionRef.current);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[HolographicVideoCall] addParticipant(remote) failed", err);
      }
    })();
    return () => {
      cancelled = true;
      spatialEngine.removeParticipant(peerId);
    };
  }, [remoteStream, peerId, callStarted, spatialEngine]);

  useEffect(() => {
    peerPositionRef.current = peerPosition;
    if (!callStarted) return;
    if (spatialEngine.getParticipantState(peerId)) {
      spatialEngine.setParticipantPosition(peerId, peerPosition);
    }
  }, [peerPosition, peerId, callStarted, spatialEngine]);

  // ── Keep the zone manager in sync with positions so zone transitions
  //    and room-acoustics processing can react to the current scene. ──
  useEffect(() => {
    if (!callStarted) return;
    audioZones.updatePositions(
      [{ id: peerId, position: peerPosition }],
      { x: 0, y: 0, z: 0 },
    );
  }, [callStarted, peerPosition, peerId, audioZones]);

  // ── Always tear down the peer connection on unmount. We leave the
  //    singleton SpatialAudioEngine running so other call UIs can keep
  //    using it; we only remove the participants we added. ──
  useEffect(() => () => {
    endCall();
    spatialEngine.removeParticipant(peerId);
  }, [endCall, spatialEngine, peerId]);

  const handleClose = useCallback(() => {
    endCall();
    spatialEngine.removeParticipant(peerId);
    setCallStarted(false);
    setIsMuted(false);
    setVideoEnabled(true);
    onClose();
  }, [endCall, onClose, spatialEngine, peerId]);

  const statusText = useMemo(() => {
    if (callError) return callError;
    if (remoteStream) return "Holographic channel live · E2EE WebRTC";
    if (isCalling) return "Projecting hologram…";
    if (!isConnected) return "Reconnecting to signal grid…";
    return "Ready to project";
  }, [callError, isCalling, isConnected, remoteStream]);

  const peerInitial = peerName[0]?.toUpperCase() ?? "?";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col items-center justify-between"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, rgba(0,60,90,0.45) 0%, rgba(8,10,18,0.98) 60%, #05060b 100%)",
          backdropFilter: "blur(12px)",
          padding: "28px 20px",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        {/* ── Top status bar ── */}
        <div className="w-full max-w-lg flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {isConnected ? (
              <Wifi size={12} className="text-green-400" />
            ) : (
              <WifiOff size={12} className="text-red-400" />
            )}
            <span className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-bold">
              Holographic Call
            </span>
          </div>
          <span
            className="text-[10px] uppercase tracking-widest"
            style={{ color: callError ? "#ff8a80" : "#8fe4ff" }}
          >
            {statusText}
          </span>
        </div>

        {/* ── Remote holographic plane ── */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0, rotateX: -8 }}
          animate={{ scale: 1, opacity: 1, rotateX: -4 }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
          className="relative w-full max-w-md aspect-[3/4] rounded-3xl overflow-hidden"
          style={{
            perspective: 1200,
            border: "1px solid rgba(0, 243, 255, 0.35)",
            boxShadow:
              "0 0 60px rgba(0, 243, 255, 0.25), inset 0 0 80px rgba(138, 43, 226, 0.15)",
            background: "rgba(0,0,0,0.55)",
          }}
        >
          {/* Scanline / hologram overlay */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10"
            style={{
              background:
                "repeating-linear-gradient(0deg, rgba(0,243,255,0.05) 0px, rgba(0,243,255,0.05) 1px, transparent 2px, transparent 4px)",
              mixBlendMode: "screen",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10"
            style={{
              background:
                "radial-gradient(ellipse at 50% 100%, rgba(255,0,127,0.18) 0%, transparent 60%)",
            }}
          />

          {remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              // Muted intentionally: audio flows through SpatialAudioEngine
              // (HRTF-panned) rather than the native <video> element, which
              // would otherwise cause double playback.
              muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: "contrast(1.05) saturate(1.1)" }}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-black"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(0,243,255,0.8), rgba(138,43,226,0.8))",
                  color: "#fff",
                  boxShadow: "0 0 40px rgba(0,243,255,0.45)",
                }}
              >
                {peerInitial}
              </div>
              <p className="text-[12px] uppercase tracking-[0.3em] text-gray-400">
                Awaiting projection…
              </p>
            </div>
          )}

          {/* Peer label */}
          <div
            className="absolute left-4 bottom-4 z-20 px-3 py-1.5 rounded-full flex items-center gap-1.5"
            style={{
              background: "rgba(10,14,22,0.65)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(6px)",
            }}
          >
            <Sparkles size={11} className="text-[#00f3ff]" />
            <span className="text-[11px] font-bold text-white">{peerName}</span>
          </div>
        </motion.div>

        {/* ── Spatial audio controls (collapsed by default) ── */}
        {callStarted && (
          <div className="w-full max-w-md flex justify-center">
            <SpatialAudioControls
              engine={spatialEngine}
              zoneManager={audioZones}
              participants={[
                { id: peerId, name: peerName, position: peerPosition },
              ]}
              listenerPos={{ x: 0, y: 0, z: 0 }}
            />
          </div>
        )}

        {/* ── Local PIP + controls ── */}
        <div className="w-full max-w-md flex items-center justify-between gap-4">
          {/* Local preview */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="relative w-24 h-32 rounded-2xl overflow-hidden flex-shrink-0"
            style={{
              border: "1px solid rgba(255,0,127,0.4)",
              boxShadow: "0 0 24px rgba(255,0,127,0.25)",
              background: "#0a0d14",
            }}
          >
            {videoEnabled && localStream ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-widest text-gray-500">
                {videoEnabled ? "…" : "Off"}
              </div>
            )}
          </motion.div>

          {/* Control cluster */}
          <div className="flex items-center gap-3">
            <ControlButton
              active={!isMuted}
              onClick={() => setIsMuted((m) => !m)}
              ariaLabel={isMuted ? "Unmute microphone" : "Mute microphone"}
              accent="#00f3ff"
            >
              {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </ControlButton>
            <ControlButton
              active={videoEnabled}
              onClick={() => setVideoEnabled((v) => !v)}
              ariaLabel={videoEnabled ? "Disable camera" : "Enable camera"}
              accent="#8a2be2"
            >
              {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
            </ControlButton>
            <ControlButton
              active
              onClick={handleClose}
              ariaLabel="End call"
              accent="#ff3355"
              danger
            >
              <PhoneOff size={18} />
            </ControlButton>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

interface ControlButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
  active: boolean;
  accent: string;
  danger?: boolean;
}

function ControlButton({ children, onClick, ariaLabel, active, accent, danger }: ControlButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        width: 52,
        height: 52,
        borderRadius: "50%",
        border: `1px solid ${active ? accent : "rgba(255,255,255,0.15)"}`,
        background: danger
          ? "linear-gradient(135deg, #ff3355, #b3002d)"
          : active
            ? `${accent}22`
            : "rgba(255,255,255,0.04)",
        color: danger ? "#fff" : active ? accent : "#9aa5b4",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: active ? `0 0 18px ${accent}55` : "none",
        transition: "all 180ms ease",
      }}
    >
      {children}
    </button>
  );
}
