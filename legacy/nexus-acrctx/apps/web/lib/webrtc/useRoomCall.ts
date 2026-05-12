"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSignalSocket } from "../useSignalSocket";
import { MediaStreamHandler, DEFAULT_MEDIA_PROFILE, type MediaConstraintsProfile } from "./MediaStreamHandler";
import {
  PeerConnectionManager,
  type ConnectionStats,
  type OutboundSignal,
} from "./PeerConnectionManager";
import { QualityMonitor, type QualityEvent, type QualityTier } from "./QualityMonitor";

// ═══════════════════════════════════════════════════════════════
// useRoomCall — multi-party group call hook
// ═══════════════════════════════════════════════════════════════
//
// Composes MediaStreamHandler + PeerConnectionManager (per-peer) +
// QualityMonitor on top of the encrypted signaling socket.
//
// Topology:
//   Mesh only, up to 8 participants (server enforces the cap).
//   Each peer pair gets its own RTCPeerConnection.
//   The lexicographically-smaller userId is the "impolite" side
//   (drives initial offer); the other side is "polite" — this gives
//   us deterministic glare resolution per Perfect Negotiation.
//
// ═══════════════════════════════════════════════════════════════

export interface RoomRemotePeer {
  userId: string;
  stream: MediaStream | null;
  stats: ConnectionStats | null;
  quality: QualityTier;
}

export interface UseRoomCallOptions {
  profile?: MediaConstraintsProfile;
  iceServers?: RTCIceServer[];
}

export function useRoomCall(myUserId: string, options: UseRoomCallOptions = {}) {
  const {
    userId: socketUserId,
    isConnected,
    socket,
    sendWebRTCSignal,
    subscribeToWebRTCSignal,
  } = useSignalSocket(myUserId);
  const localUserId = socketUserId || myUserId;

  const [roomId, setRoomId] = useState<string | null>(null);
  const [peers, setPeers] = useState<Record<string, RoomRemotePeer>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRef = useRef<MediaStreamHandler | null>(null);
  const pcsRef = useRef<Map<string, PeerConnectionManager>>(new Map());
  const monitorsRef = useRef<Map<string, QualityMonitor>>(new Map());
  const roomIdRef = useRef<string | null>(null);
  const iceServers = useMemo(() => options.iceServers, [options.iceServers]);

  const updatePeer = useCallback((userId: string, patch: Partial<RoomRemotePeer>) => {
    setPeers((prev) => ({
      ...prev,
      [userId]: {
        userId,
        stream: null,
        stats: null,
        quality: "good" as QualityTier,
        ...prev[userId],
        ...patch,
      },
    }));
  }, []);

  const removePeer = useCallback((userId: string) => {
    const pc = pcsRef.current.get(userId);
    if (pc) {
      pc.dispose();
      pcsRef.current.delete(userId);
    }
    const monitor = monitorsRef.current.get(userId);
    if (monitor) {
      monitor.dispose();
      monitorsRef.current.delete(userId);
    }
    setPeers((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }, []);

  const ensurePeer = useCallback(
    (peerUserId: string, asInitiator: boolean): PeerConnectionManager => {
      const existing = pcsRef.current.get(peerUserId);
      if (existing) return existing;

      const polite = localUserId > peerUserId;
      const pc = new PeerConnectionManager({
        polite,
        iceServers,
        onLocalSignal: async (signal: OutboundSignal) => {
          if (!roomIdRef.current) return;
          try {
            await sendWebRTCSignal(peerUserId, signal.payload, signal.type);
          } catch (err) {
            console.error("[RoomCall] signal send failed", err);
          }
        },
        onRemoteTrack: (ev) => {
          const stream = ev.streams[0] ?? null;
          updatePeer(peerUserId, { stream });
        },
        onConnectionStateChange: (state) => {
          if (state === "failed" || state === "closed") {
            // PeerConnectionManager handles ICE restart internally for "failed"
          }
        },
        onNegotiationError: (err) => {
          console.error("[RoomCall] negotiation error", err);
        },
      });

      // Attach our local tracks
      const local = mediaRef.current?.getStream();
      if (local) {
        for (const t of local.getTracks()) pc.addTrack(t, local);
      }

      // Quality monitor per peer
      const monitor = new QualityMonitor(pc, {
        intervalMs: 2000,
        mediaHandler: mediaRef.current ?? undefined,
        onChange: (event: QualityEvent) => {
          updatePeer(peerUserId, { quality: event.tier });
        },
        onSample: (stats) => {
          updatePeer(peerUserId, { stats });
        },
        onReconnectRequested: () => {
          void pc.restartIce();
        },
      });
      monitor.start();

      pcsRef.current.set(peerUserId, pc);
      monitorsRef.current.set(peerUserId, monitor);
      updatePeer(peerUserId, {});

      if (asInitiator) {
        void pc.createOffer();
      }
      return pc;
    },
    [iceServers, localUserId, sendWebRTCSignal, updatePeer],
  );

  // ─── Inbound WebRTC signals ───────────────────────────────
  useEffect(() => {
    const unsub = subscribeToWebRTCSignal(async (data) => {
      if (!roomIdRef.current) return;
      const pc = ensurePeer(data.fromUserId, false);
      await pc.handleSignal({
        type: data.type,
        payload: data.signal as RTCSessionDescriptionInit | RTCIceCandidateInit,
      });
    });
    return unsub;
  }, [ensurePeer, subscribeToWebRTCSignal]);

  // ─── Room lifecycle events ────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onJoined = (data: {
      roomId: string;
      participant: { userId: string };
    }) => {
      if (data.roomId !== roomIdRef.current) return;
      if (data.participant.userId === localUserId) return;
      // The "impolite" (smaller userId) side initiates
      const asInitiator = localUserId < data.participant.userId;
      ensurePeer(data.participant.userId, asInitiator);
    };

    const onLeft = (data: { roomId: string; userId: string }) => {
      if (data.roomId !== roomIdRef.current) return;
      removePeer(data.userId);
    };

    socket.on("room-peer-joined", onJoined);
    socket.on("room-peer-left", onLeft);
    return () => {
      socket.off("room-peer-joined", onJoined);
      socket.off("room-peer-left", onLeft);
    };
  }, [socket, ensurePeer, removePeer, localUserId]);

  // ─── Public API ───────────────────────────────────────────
  const joinRoom = useCallback(
    async (
      id: string,
      publish: { audio?: boolean; video?: boolean } = { audio: true, video: true },
    ): Promise<void> => {
      if (!socket) throw new Error("Socket not connected");
      setError(null);

      // Acquire local media
      if (!mediaRef.current) {
        mediaRef.current = new MediaStreamHandler(options.profile ?? DEFAULT_MEDIA_PROFILE);
      }
      const stream = await mediaRef.current.acquire({
        video: publish.video !== false,
        audio: publish.audio !== false,
      });
      setLocalStream(stream);

      roomIdRef.current = id;
      setRoomId(id);

      // Ask server to join us & tell us the current roster
      const response: {
        ok: boolean;
        room?: { participants: { userId: string }[] };
        error?: string;
      } = await new Promise((resolve) => {
        socket.emit(
          "join-room",
          { roomId: id, audio: publish.audio !== false, video: publish.video !== false },
          (res: {
            ok: boolean;
            room?: { participants: { userId: string }[] };
            error?: string;
          }) => resolve(res),
        );
      });

      if (!response.ok) {
        setError(response.error ?? "Failed to join room");
        roomIdRef.current = null;
        setRoomId(null);
        return;
      }

      // Connect to existing participants. We initiate connections to peers
      // with lexicographically larger userIds — this makes us the impolite
      // side and them the polite side per the WebRTC Perfect Negotiation
      // pattern, giving us deterministic glare resolution.
      const existing =
        response.room?.participants.filter((p) => p.userId !== localUserId) ?? [];
      for (const p of existing) {
        const asInitiator = localUserId < p.userId;
        ensurePeer(p.userId, asInitiator);
      }
    },
    [socket, localUserId, options.profile, ensurePeer],
  );

  const leaveRoom = useCallback(async () => {
    const id = roomIdRef.current;
    roomIdRef.current = null;
    setRoomId(null);

    if (socket && id) {
      await new Promise<void>((resolve) => {
        socket.emit("leave-room", { roomId: id }, () => resolve());
        setTimeout(resolve, 1500); // don't block on missing ack
      });
    }

    // Tear down all peer connections
    for (const [userId] of pcsRef.current) removePeer(userId);
    pcsRef.current.clear();
    monitorsRef.current.clear();
    setPeers({});

    mediaRef.current?.dispose();
    mediaRef.current = null;
    setLocalStream(null);
  }, [socket, removePeer]);

  const toggleScreenShare = useCallback(async (): Promise<boolean> => {
    if (!mediaRef.current) return false;
    const handler = mediaRef.current;
    if (handler.isScreenSharing()) {
      const oldTrack = handler.getVideoTrack();
      await handler.stopScreenShare();
      const newTrack = handler.getVideoTrack();
      for (const pc of pcsRef.current.values()) {
        await pc.replaceTrack(oldTrack, newTrack);
      }
      if (socket && roomIdRef.current) {
        socket.emit("room-publish-state", { roomId: roomIdRef.current, screen: false });
      }
      return false;
    }
    const oldTrack = handler.getVideoTrack();
    const newTrack = await handler.startScreenShare();
    for (const pc of pcsRef.current.values()) {
      await pc.replaceTrack(oldTrack, newTrack);
    }
    if (socket && roomIdRef.current) {
      socket.emit("room-publish-state", { roomId: roomIdRef.current, screen: true });
    }
    return true;
  }, [socket]);

  const toggleMute = useCallback((kind: "audio" | "video"): boolean => {
    const track =
      kind === "audio" ? mediaRef.current?.getAudioTrack() : mediaRef.current?.getVideoTrack();
    if (!track) return false;
    track.enabled = !track.enabled;
    if (socket && roomIdRef.current) {
      const patch: Record<string, boolean> = {};
      patch[kind] = track.enabled;
      socket.emit("room-publish-state", { roomId: roomIdRef.current, ...patch });
    }
    return track.enabled;
  }, [socket]);

  // Cleanup on unmount
  useEffect(() => {
    const pcs = pcsRef.current;
    const monitors = monitorsRef.current;
    const media = mediaRef;
    return () => {
      for (const pc of pcs.values()) pc.dispose();
      pcs.clear();
      for (const m of monitors.values()) m.dispose();
      monitors.clear();
      media.current?.dispose();
      media.current = null;
    };
  }, []);

  return {
    isConnected,
    roomId,
    peers,
    localStream,
    error,
    joinRoom,
    leaveRoom,
    toggleScreenShare,
    toggleMute,
    mediaHandler: mediaRef.current,
  };
}
