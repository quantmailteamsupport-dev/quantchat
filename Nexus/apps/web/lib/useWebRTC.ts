"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSignalSocket } from "./useSignalSocket";

// WebRTC signaling now uses the dedicated signaling channel
// instead of piggybacking onto encrypted chat messages.

interface UseWebRTCOptions {
  createLocalStream?: (withVideo: boolean) => Promise<MediaStream>;
}

interface StartCallOptions {
  stream?: MediaStream;
  withVideo?: boolean;
}

export function useWebRTC(myId: string, peerId: string, options?: UseWebRTCOptions) {
  const { isConnected, sendWebRTCSignal, subscribeToWebRTCSignal } = useSignalSocket(myId);
  const createLocalStream = options?.createLocalStream;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isCalling, setIsCalling] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localStreamPromiseRef = useRef<Promise<MediaStream> | null>(null);
  // Buffer for ICE candidates that arrive before setRemoteDescription is called.
  // This is a well-known WebRTC race condition: the answerer/offerer may receive
  // remote ICE candidates before the remote description has been applied.
  const iceCandidateBufferRef = useRef<RTCIceCandidateInit[]>([]);
  const hasRemoteDescriptionRef = useRef(false);

  const attachLocalStream = useCallback((stream: MediaStream) => {
    if (!pcRef.current) return;

    const existingTrackIds = new Set(
      pcRef.current.getSenders().map((sender) => sender.track?.id).filter(Boolean)
    );

    stream.getTracks().forEach((track) => {
      if (!existingTrackIds.has(track.id)) {
        pcRef.current?.addTrack(track, stream);
      }
    });
  }, []);

  const ensureLocalStream = useCallback(async (startOptions?: StartCallOptions): Promise<MediaStream> => {
    if (localStreamRef.current && pcRef.current) {
      attachLocalStream(localStreamRef.current);
      return localStreamRef.current;
    }

    if (localStreamPromiseRef.current) {
      return localStreamPromiseRef.current;
    }

    if (localStreamRef.current && !pcRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }

    localStreamPromiseRef.current = (async () => {
      const stream = startOptions?.stream
        ?? await createLocalStream?.(startOptions?.withVideo ?? false)
        ?? await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: startOptions?.withVideo ?? false,
        });

      localStreamRef.current = stream;
      setLocalStream(stream);
      attachLocalStream(stream);

      return stream;
    })();

    try {
      return await localStreamPromiseRef.current;
    } finally {
      localStreamPromiseRef.current = null;
    }
  }, [attachLocalStream, createLocalStream]);

  useEffect(() => {
    // Reset ICE state for this PeerConnection lifecycle.
    iceCandidateBufferRef.current = [];
    hasRemoteDescriptionRef.current = false;

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        // Only add TURN server if credentials are properly configured
        ...(process.env.NEXT_PUBLIC_TURN_USER && process.env.NEXT_PUBLIC_TURN_CRED
          ? [{
              urls: "turn:global.turn.twilio.com:3478?transport=udp",
              username: process.env.NEXT_PUBLIC_TURN_USER,
              credential: process.env.NEXT_PUBLIC_TURN_CRED,
            }]
          : []),
      ],
      iceTransportPolicy: "all",
    });
    pcRef.current = pc;

    // Send ICE candidates via the dedicated WebRTC signaling channel (not chat messages)
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void sendWebRTCSignal(peerId, event.candidate.toJSON(), "ice-candidate")
          .catch((err) => console.error("[WebRTC] ICE signal failed:", err));
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0] ?? null);
    };

    /**
     * Flush any buffered ICE candidates once the remote description is set.
     * Candidates received before setRemoteDescription are queued because
     * the browser rejects addIceCandidate calls made before the remote
     * description is available (spec §4.4.1.6).
     */
    const flushIceCandidates = async () => {
      const buffered = iceCandidateBufferRef.current.splice(0);
      for (const init of buffered) {
        await pc.addIceCandidate(new RTCIceCandidate(init));
      }
    };

    // Subscribe to incoming WebRTC signals from the peer
    const unsub = subscribeToWebRTCSignal(async (data) => {
      if (data.fromUserId !== peerId) return;
      const { signal, type } = data;

      if (type === "offer") {
        setIsCalling(true);
        setCallError(null);
        await ensureLocalStream();
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        hasRemoteDescriptionRef.current = true;
        await flushIceCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendWebRTCSignal(peerId, answer, "answer");
      } else if (type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        hasRemoteDescriptionRef.current = true;
        await flushIceCandidates();
      } else if (type === "ice-candidate") {
        if (hasRemoteDescriptionRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(signal));
        } else {
          // Queue the candidate until setRemoteDescription is called.
          iceCandidateBufferRef.current.push(signal);
        }
      }
    });

    return () => {
      pc.close();
      unsub();
    };
  }, [ensureLocalStream, peerId, sendWebRTCSignal, subscribeToWebRTCSignal]);

  const startCall = async (startOptions: StartCallOptions = {}): Promise<boolean> => {
    if (!pcRef.current) return false;

    setCallError(null);
    try {
      await ensureLocalStream(startOptions);
      setIsCalling(true);
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      await sendWebRTCSignal(peerId, offer, "offer");
      return true;
    } catch (err) {
      console.error("[WebRTC] Device access failed:", err);
      setCallError(err instanceof Error ? err.message : "Unable to access audio device");
      setIsCalling(false);
      return false;
    }
  };

  const endCall = () => {
    localStream?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    localStreamRef.current = null;
    localStreamPromiseRef.current = null;
    setRemoteStream(null);
    setIsCalling(false);
    pcRef.current?.close();
    pcRef.current = null;
    // Clear ICE state so it is clean if the PC is ever recreated.
    iceCandidateBufferRef.current = [];
    hasRemoteDescriptionRef.current = false;
  };

  return { isConnected, localStream, remoteStream, isCalling, callError, startCall, endCall };
}
