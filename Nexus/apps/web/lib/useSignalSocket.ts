import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { SessionManager, type EncryptedEnvelope, type PreKeyBundle } from "@repo/security";
import { resolveSocketIdentity } from "./socketIdentity";

// ═══════════════════════════════════════════════════════════════
// useSignalSocket — Production E2EE Socket Hook (Signal Protocol)
// ═══════════════════════════════════════════════════════════════
//
// CRYPTO UPGRADE:
//   Old: static ECDH shared secret cached forever (no forward secrecy)
//   New: X3DH + Double Ratchet per-message key rotation
//
// The SessionManager handles all crypto internally:
//   encrypt(recipientId, plaintext) → EncryptedEnvelope
//   decrypt(senderId, envelope)     → plaintext
//
// Backend stays fully blind — it routes opaque EncryptedEnvelopes.
// ═══════════════════════════════════════════════════════════════

const API_URL = process.env.NEXT_PUBLIC_WS_URL;
const KEY_ROTATION_INTERVAL_MS = 24 * 3600 * 1000;

export interface IncomingMessage {
  id: string;
  senderId: string;
  plaintext: string;
  createdAt: string;
  /** Absolute expiry epoch millis. Undefined = does not disappear. */
  expiresAt?: number;
  conversationId?: string | null;
}

export interface MessagePurgedEvent {
  messageId: string;
  conversationId?: string | null;
  purgedAt: string;
  reason: string;
}

export interface DisappearingUpdatedEvent {
  conversationId: string;
  /** null = disappearing messages OFF. */
  ttlSecs: number | null;
  changedBy: string;
  changedAt: string;
}

export type WebRTCSignalType = "offer" | "answer" | "ice-candidate";

type WebRTCSignalMessage =
  | {
      fromUserId: string;
      signal: RTCSessionDescriptionInit;
      type: "offer" | "answer";
    }
  | {
      fromUserId: string;
      signal: RTCIceCandidateInit;
      type: "ice-candidate";
    };

type WebRTCSignalPayload =
  | {
      signal: RTCSessionDescriptionInit;
      type: "offer" | "answer";
    }
  | {
      signal: RTCIceCandidateInit;
      type: "ice-candidate";
    };

function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<EncryptedEnvelope>;

  return (
    typeof candidate.ciphertext === "string" &&
    typeof candidate.iv === "string" &&
    typeof candidate.header === "object" &&
    candidate.header !== null
  );
}

function isPreKeyBundle(value: unknown): value is PreKeyBundle {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<PreKeyBundle>;
  const hasValidJwkShape = (jwk: JsonWebKey | undefined): boolean => (
    !!jwk &&
    typeof jwk === "object" &&
    typeof jwk.kty === "string"
  );

  return (
    typeof candidate.signedPreKeyId === "string" &&
    typeof candidate.signature === "string" &&
    hasValidJwkShape(candidate.identityKey) &&
    hasValidJwkShape(candidate.signedPreKey)
  );
}

export function useSignalSocket(userId: string | null | undefined, authToken?: string) {
  const normalizedUserId =
    typeof userId === "string" && userId.trim().length > 0 ? userId.trim() : null;
  const identity = normalizedUserId
    ? resolveSocketIdentity(normalizedUserId, authToken)
    : { userId: null, token: authToken ?? null };
  const effectiveUserId = identity.userId;
  const resolvedToken = identity.token;
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const sessionManagerRef = useRef<SessionManager | null>(null);
  const lastRotationAtRef = useRef<number>(0);

  useEffect(() => {
    if (!effectiveUserId) {
      sessionManagerRef.current = null;
      return;
    }
    sessionManagerRef.current = new SessionManager(effectiveUserId);
    lastRotationAtRef.current = 0;
  }, [effectiveUserId]);

  const rotateKeys = useCallback(async (forceSignedPreKeyRotation: boolean = false): Promise<void> => {
    if (!socket || !sessionManagerRef.current) {
      throw new Error("Socket not connected or session manager not initialized");
    }
    const { bundle, oneTimePreKeys } = await sessionManagerRef.current.prepareLocalPreKeys(
      forceSignedPreKeyRotation
    );
    socket.emit("rotate-prekeys", { userId: effectiveUserId, bundle, oneTimePreKeys });
    lastRotationAtRef.current = Date.now();
  }, [socket, effectiveUserId]);

  useEffect(() => {
    if (!socket) return;
    const listener = () => {
      rotateKeys().catch((err) => {
        console.error("[Signal] Pre-key low rotation failed:", err);
      });
    };
    socket.on("prekeys-low", listener);
    return () => {
      socket.off("prekeys-low", listener);
    };
  }, [socket, rotateKeys]);

  useEffect(() => {
    if (!effectiveUserId || !API_URL) {
      setSocket(null);
      setIsConnected(false);
      return;
    }

    const newSocket = io(API_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 7000,
      randomizationFactor: 0.5, // Jitter for exponential backoff (WhatsApp/Telegram level resilience)
      timeout: 10000, // Faster failure detection
      auth: resolvedToken ? { token: resolvedToken } : undefined,
    });

    newSocket.on("connect", () => {
      setIsConnected(false);
      console.log(`[Signal] Connected as ${effectiveUserId}`);

      // Authenticate first; upload keys only after the server confirms auth.
      newSocket.off("authenticated");
      newSocket.once("authenticated", async () => {
        setIsConnected(true);
        try {
          const { bundle, oneTimePreKeys } = await sessionManagerRef.current!.prepareLocalPreKeys();
          newSocket.emit("upload-prekeys", { userId: effectiveUserId, bundle, oneTimePreKeys });
          lastRotationAtRef.current = Date.now();
        } catch (err) {
          console.error("[Signal] Key bootstrap failed:", err);
        }
      });

      newSocket.emit("auth", {
        userId: effectiveUserId,
        token: resolvedToken || undefined,
      });
    });

    newSocket.on("disconnect", () => {
      setIsConnected(false);
      console.log("[Signal] Disconnected, will auto-reconnect");
    });

    setSocket(newSocket);
    return () => { newSocket.disconnect(); };
  }, [effectiveUserId, resolvedToken]);

  // ─── SEND ENCRYPTED MESSAGE ──────────────────────────────
  const sendEncryptedMessage = useCallback(async (
    recipientId: string,
    plaintext: string,
    options?: { ttlSecs?: number | null; conversationId?: string },
  ): Promise<void> => {
    if (!socket || !sessionManagerRef.current) {
      throw new Error("Socket not connected or session manager not initialized");
    }

    const sm = sessionManagerRef.current;

    // Check if we already have a session
    let envelope: EncryptedEnvelope;
    try {
      envelope = await sm.encrypt(recipientId, plaintext);
    } catch {
      // No session yet — fetch their PreKeyBundle from server
      const bundle = await new Promise<unknown>((resolve) => {
        socket.emit("get-prekey-bundle", recipientId, resolve);
      });

      if (!isPreKeyBundle(bundle)) {
        throw new Error(`Cannot get keys for ${recipientId}`);
      }

      envelope = await sm.encrypt(recipientId, plaintext, bundle);
    }

    // Send over socket (server sees only encrypted envelope)
    socket.emit("send-message", {
      senderId: effectiveUserId,
      receiverId: recipientId,
      envelope,
      ttlSecs: options?.ttlSecs ?? null,
      conversationId: options?.conversationId,
    });
  }, [socket, effectiveUserId]);

  // ─── SUBSCRIBE TO INCOMING MESSAGES ──────────────────────
  const subscribeToMessages = useCallback((
    callback: (msg: IncomingMessage) => void
  ): (() => void) => {
    if (!socket) return () => {};

    const listener = async (data: {
      id: string; senderId: string; envelope: EncryptedEnvelope;
      createdAt: string;
      expiresAt?: string | null;
      conversationId?: string | null;
    }) => {
      let plaintext: string;

      if (!sessionManagerRef.current) {
        plaintext = "[Session not initialized]";
      } else {
        try {
          plaintext = await sessionManagerRef.current.decrypt(
            data.senderId,
            data.envelope
          );
        } catch (err) {
          console.error("[Signal] Decryption failed:", err);
          plaintext = "[Encrypted message — decryption failed]";
        }
      }

      // Acknowledge delivery (triggers double-tick on sender's UI)
      socket.emit("message-delivered", { messageId: data.id });

      // Opportunistic key rotation every 24h of active messaging
      if (Date.now() - lastRotationAtRef.current > KEY_ROTATION_INTERVAL_MS) {
        rotateKeys().catch((err) => {
          console.error("[Signal] Background key rotation failed:", err);
        });
      }

      const expiresAtMs = data.expiresAt ? Date.parse(data.expiresAt) : undefined;

      callback({
        id: data.id,
        senderId: data.senderId,
        plaintext,
        createdAt: data.createdAt,
        expiresAt: Number.isFinite(expiresAtMs) ? (expiresAtMs as number) : undefined,
        conversationId: data.conversationId ?? null,
      });
    };

    socket.on("receive-message", listener);
    return () => { socket.off("receive-message", listener); };
  }, [socket, rotateKeys]);

  // ─── MARK MESSAGE AS READ (blue tick) ────────────────────
  const markAsRead = useCallback((messageId: string) => {
    if (!socket) return;
    socket.emit("message-read", { messageId });
  }, [socket]);

  // ─── SUBSCRIBE TO DELIVERY RECEIPTS ──────────────────────
  const subscribeToReceipts = useCallback((
    callback: (receipt: { messageId: string; status: string; deliveredAt?: string; readAt?: string }) => void
  ): (() => void) => {
    if (!socket) return () => {};
    const listener = (data: { messageId: string; status: string; deliveredAt?: string; readAt?: string }) => {
      callback(data);
    };
    socket.on("delivery-receipt", listener);
    return () => { socket.off("delivery-receipt", listener); };
  }, [socket]);

  // ─── TYPING INDICATOR ───────────────────────────────────
  const sendTyping = useCallback((receiverId: string, isTyping: boolean) => {
    if (!socket) return;
    socket.emit("typing", { receiverId, isTyping });
  }, [socket]);

  // ─── WEBRTC SIGNALING ───────────────────────────────────
  const sendWebRTCSignal = useCallback(
    async (
      targetUserId: string,
      signal: RTCSessionDescriptionInit | RTCIceCandidateInit,
      type: WebRTCSignalType
    ): Promise<void> => {
      if (!socket || !sessionManagerRef.current) {
        throw new Error("Socket not connected or session manager not initialized");
      }

      const sm = sessionManagerRef.current;
      const payload: WebRTCSignalPayload = type === "ice-candidate"
        ? { signal: signal as RTCIceCandidateInit, type }
        : { signal: signal as RTCSessionDescriptionInit, type };
      const serializedSignal = JSON.stringify(payload);

      let envelope: EncryptedEnvelope;
      try {
        envelope = await sm.encrypt(targetUserId, serializedSignal);
      } catch {
        const bundle = await new Promise<unknown>((resolve) => {
          socket.emit("get-prekey-bundle", targetUserId, resolve);
        });

        if (!isPreKeyBundle(bundle)) {
          throw new Error(`Cannot get keys for ${targetUserId}`);
        }

        envelope = await sm.encrypt(targetUserId, serializedSignal, bundle);
      }

      socket.emit("webrtc-signal", { targetUserId, signal: envelope, type });
    },
    [socket]
  );

  const subscribeToWebRTCSignal = useCallback((
    callback: (data: WebRTCSignalMessage) => void | Promise<void>
  ): (() => void) => {
    if (!socket) return () => {};
    const listener = async (data: {
      fromUserId: string;
      signal: EncryptedEnvelope | RTCSessionDescriptionInit | RTCIceCandidateInit;
      type: WebRTCSignalType;
    }) => {
      if (!isEncryptedEnvelope(data.signal) || !sessionManagerRef.current) {
        console.error("[Signal] Rejected unencrypted WebRTC signal");
        return;
      }

      try {
        const decryptedSignalPayload = await sessionManagerRef.current.decrypt(data.fromUserId, data.signal);
        const decryptedPayload = JSON.parse(decryptedSignalPayload) as WebRTCSignalPayload;
        await callback({ fromUserId: data.fromUserId, ...decryptedPayload });
      } catch (err) {
        console.error("[Signal] WebRTC signal decryption failed:", err);
      }
    };
    socket.on("webrtc-signal", listener);
    return () => { socket.off("webrtc-signal", listener); };
  }, [socket]);

  // ─── DISAPPEARING MESSAGES ───────────────────────────────
  const subscribeToPurges = useCallback((
    callback: (ev: MessagePurgedEvent) => void,
  ): (() => void) => {
    if (!socket) return () => {};
    const listener = (data: MessagePurgedEvent) => callback(data);
    socket.on("message-purged", listener);
    return () => { socket.off("message-purged", listener); };
  }, [socket]);

  const subscribeToDisappearingUpdates = useCallback((
    callback: (ev: DisappearingUpdatedEvent) => void,
  ): (() => void) => {
    if (!socket) return () => {};
    const listener = (data: DisappearingUpdatedEvent) => callback(data);
    socket.on("disappearing-updated", listener);
    return () => { socket.off("disappearing-updated", listener); };
  }, [socket]);

  const setDisappearing = useCallback((
    conversationId: string,
    ttlSecs: number | null,
  ): Promise<{ success: boolean; error?: string; ttlSecs?: number | null }> => {
    return new Promise((resolve) => {
      if (!socket) {
        resolve({ success: false, error: "Socket not connected" });
        return;
      }
      socket.emit("set-disappearing", { conversationId, ttlSecs }, resolve);
    });
  }, [socket]);

  const getDisappearing = useCallback((
    conversationId: string,
  ): Promise<{ success: boolean; error?: string; ttlSecs?: number | null }> => {
    return new Promise((resolve) => {
      if (!socket) {
        resolve({ success: false, error: "Socket not connected" });
        return;
      }
      socket.emit("get-disappearing", { conversationId }, resolve);
    });
  }, [socket]);

  return {
    isConnected,
    socket,
    userId: effectiveUserId,
    sendEncryptedMessage,
    rotateKeys,
    subscribeToMessages,
    markAsRead,
    subscribeToReceipts,
    sendTyping,
    sendWebRTCSignal,
    subscribeToWebRTCSignal,
    subscribeToPurges,
    subscribeToDisappearingUpdates,
    setDisappearing,
    getDisappearing,
  };
}
