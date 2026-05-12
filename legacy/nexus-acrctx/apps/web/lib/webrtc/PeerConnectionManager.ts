// ═══════════════════════════════════════════════════════════════
// PeerConnectionManager — Full RTCPeerConnection lifecycle
// ═══════════════════════════════════════════════════════════════
//
// Wraps an RTCPeerConnection with:
//   • Safe negotiation (glare-resistant polite/impolite pattern)
//   • Early ICE buffering (candidates before setRemoteDescription)
//   • Automatic ICE restart on failure
//   • Real-time connection stats (RTT, loss, jitter, bandwidth)
//   • EventEmitter-style subscriptions
//
// This class is transport-agnostic — callers wire the `onLocalSignal`
// callback to whatever signaling channel they use (socket.io, etc).
// ═══════════════════════════════════════════════════════════════

export type SignalType = "offer" | "answer" | "ice-candidate";

export interface OutboundSignal {
  type: SignalType;
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

export interface ConnectionStats {
  roundTripTimeMs: number | null;
  /** Percentage 0-100 */
  packetLossPct: number;
  jitterMs: number | null;
  /** Current outbound bitrate in bits/sec (all kinds combined) */
  outboundBitrate: number | null;
  /** Current inbound bitrate in bits/sec (all kinds combined) */
  inboundBitrate: number | null;
  packetsSent: number;
  packetsLost: number;
  framesDecoded: number;
  timestamp: number;
}

export interface PeerConnectionOptions {
  /** Whether this side is "polite" (defers to the remote) per WebRTC Perfect Negotiation pattern. */
  polite: boolean;
  iceServers?: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
  onLocalSignal: (signal: OutboundSignal) => void | Promise<void>;
  onRemoteTrack?: (event: RTCTrackEvent) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
  onNegotiationError?: (err: unknown) => void;
}

type Listener<T> = (value: T) => void;

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

export class PeerConnectionManager {
  private pc: RTCPeerConnection;
  private readonly polite: boolean;
  private makingOffer = false;
  private ignoreOffer = false;
  private isSettingRemoteAnswerPending = false;

  private iceBuffer: RTCIceCandidateInit[] = [];
  private hasRemoteDescription = false;

  private lastStats: ConnectionStats | null = null;
  private lastBytesSent = 0;
  private lastBytesReceived = 0;
  private lastSampleAt = 0;

  private statsListeners = new Set<Listener<ConnectionStats>>();
  private trackListeners = new Set<Listener<RTCTrackEvent>>();

  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private readonly opts: PeerConnectionOptions) {
    this.polite = opts.polite;
    this.pc = new RTCPeerConnection({
      iceServers: opts.iceServers ?? DEFAULT_ICE_SERVERS,
      iceTransportPolicy: opts.iceTransportPolicy ?? "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    this.bindEvents();
  }

  get connection(): RTCPeerConnection {
    return this.pc;
  }

  get connectionState(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  // ─── Public API ────────────────────────────────────────────

  addTrack(track: MediaStreamTrack, ...streams: MediaStream[]): RTCRtpSender {
    return this.pc.addTrack(track, ...streams);
  }

  /** Replace an existing outbound track (e.g. camera → screen share). */
  async replaceTrack(oldTrack: MediaStreamTrack | null, newTrack: MediaStreamTrack | null): Promise<boolean> {
    for (const sender of this.pc.getSenders()) {
      if (sender.track === oldTrack) {
        await sender.replaceTrack(newTrack);
        return true;
      }
    }
    return false;
  }

  removeAllSenders(): void {
    for (const sender of this.pc.getSenders()) {
      try {
        this.pc.removeTrack(sender);
      } catch {
        /* ignore */
      }
    }
  }

  createDataChannel(label: string, init?: RTCDataChannelInit): RTCDataChannel {
    return this.pc.createDataChannel(label, init);
  }

  /** Handle inbound signaling message. Must be called for every offer/answer/candidate we receive. */
  async handleSignal(signal: OutboundSignal): Promise<void> {
    if (this.disposed) return;
    try {
      if (signal.type === "ice-candidate") {
        const candidate = signal.payload as RTCIceCandidateInit;
        if (!this.hasRemoteDescription) {
          this.iceBuffer.push(candidate);
          return;
        }
        try {
          await this.pc.addIceCandidate(candidate);
        } catch (err) {
          if (!this.ignoreOffer) throw err;
        }
        return;
      }

      const description = signal.payload as RTCSessionDescriptionInit;

      // Perfect Negotiation — glare handling
      const readyForOffer =
        !this.makingOffer &&
        (this.pc.signalingState === "stable" || this.isSettingRemoteAnswerPending);
      const offerCollision = description.type === "offer" && !readyForOffer;

      this.ignoreOffer = !this.polite && offerCollision;
      if (this.ignoreOffer) return;

      this.isSettingRemoteAnswerPending = description.type === "answer";
      await this.pc.setRemoteDescription(description);
      this.isSettingRemoteAnswerPending = false;
      this.hasRemoteDescription = true;
      await this.drainIceBuffer();

      if (description.type === "offer") {
        await this.pc.setLocalDescription();
        if (this.pc.localDescription) {
          await this.emitLocalDescription(this.pc.localDescription);
        }
      }
    } catch (err) {
      this.opts.onNegotiationError?.(err);
    }
  }

  /** Explicit offer creation (e.g. on call start). */
  async createOffer(): Promise<void> {
    if (this.disposed) return;
    try {
      this.makingOffer = true;
      await this.pc.setLocalDescription();
      if (this.pc.localDescription) {
        await this.emitLocalDescription(this.pc.localDescription);
      }
    } catch (err) {
      this.opts.onNegotiationError?.(err);
    } finally {
      this.makingOffer = false;
    }
  }

  /** Force an ICE restart — useful after long-lived network switches. */
  async restartIce(): Promise<void> {
    if (this.disposed) return;
    try {
      this.pc.restartIce();
      // Some browsers need an explicit new offer to kick the restart
      await this.createOffer();
    } catch (err) {
      this.opts.onNegotiationError?.(err);
    }
  }

  /** Snapshot of the most recent stats sample. */
  getLastStats(): ConnectionStats | null {
    return this.lastStats;
  }

  /** Take a fresh stats sample now. */
  async sampleStats(): Promise<ConnectionStats> {
    const report = await this.pc.getStats();
    const stats = this.computeStats(report);
    this.lastStats = stats;
    for (const l of this.statsListeners) l(stats);
    return stats;
  }

  onStats(listener: Listener<ConnectionStats>): () => void {
    this.statsListeners.add(listener);
    return () => {
      this.statsListeners.delete(listener);
    };
  }

  onTrack(listener: Listener<RTCTrackEvent>): () => void {
    this.trackListeners.add(listener);
    return () => {
      this.trackListeners.delete(listener);
    };
  }

  /** Set max outbound bitrate for all video senders (bits/sec). */
  async setMaxBitrate(bps: number | null): Promise<void> {
    for (const sender of this.pc.getSenders()) {
      if (sender.track?.kind !== "video") continue;
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      for (const enc of params.encodings) {
        if (bps == null) delete enc.maxBitrate;
        else enc.maxBitrate = bps;
      }
      try {
        await sender.setParameters(params);
      } catch {
        /* some browsers throw on inactive senders */
      }
    }
  }

  /** Pause or resume sending on all outbound tracks of a given kind. */
  setEnabled(kind: "audio" | "video", enabled: boolean): void {
    for (const sender of this.pc.getSenders()) {
      if (sender.track?.kind === kind) {
        sender.track.enabled = enabled;
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.statsListeners.clear();
    this.trackListeners.clear();
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    try {
      this.pc.close();
    } catch {
      /* ignore */
    }
  }

  // ─── Internals ─────────────────────────────────────────────

  private bindEvents(): void {
    this.pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      void this.opts.onLocalSignal({
        type: "ice-candidate",
        payload: ev.candidate.toJSON(),
      });
    };

    this.pc.ontrack = (ev) => {
      this.opts.onRemoteTrack?.(ev);
      for (const l of this.trackListeners) l(ev);
    };

    this.pc.onnegotiationneeded = async () => {
      if (this.disposed) return;
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        if (this.pc.localDescription) {
          await this.emitLocalDescription(this.pc.localDescription);
        }
      } catch (err) {
        this.opts.onNegotiationError?.(err);
      } finally {
        this.makingOffer = false;
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc.iceConnectionState;
      this.opts.onIceConnectionStateChange?.(state);
      if (state === "failed") {
        this.scheduleIceRestart();
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.opts.onConnectionStateChange?.(this.pc.connectionState);
      if (this.pc.connectionState === "failed") {
        this.scheduleIceRestart();
      }
    };
  }

  private scheduleIceRestart(): void {
    if (this.restartTimer || this.disposed) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.restartIce();
    }, 1500);
  }

  private async drainIceBuffer(): Promise<void> {
    if (this.iceBuffer.length === 0) return;
    const buffered = this.iceBuffer;
    this.iceBuffer = [];
    for (const c of buffered) {
      try {
        await this.pc.addIceCandidate(c);
      } catch {
        /* ignore stale candidates */
      }
    }
  }

  private async emitLocalDescription(desc: RTCSessionDescription): Promise<void> {
    await this.opts.onLocalSignal({
      type: desc.type === "answer" ? "answer" : "offer",
      payload: { type: desc.type, sdp: desc.sdp },
    });
  }

  private computeStats(report: RTCStatsReport): ConnectionStats {
    let rtt: number | null = null;
    let jitter: number | null = null;
    let packetsSent = 0;
    let packetsLost = 0;
    let framesDecoded = 0;
    let bytesSent = 0;
    let bytesReceived = 0;

    report.forEach((r) => {
      const t = (r as RTCStats & { type: string }).type;
      if (t === "candidate-pair") {
        const cp = r as RTCStats & {
          state?: string;
          currentRoundTripTime?: number;
          nominated?: boolean;
        };
        if (cp.state === "succeeded" && cp.nominated && typeof cp.currentRoundTripTime === "number") {
          rtt = cp.currentRoundTripTime * 1000;
        }
      } else if (t === "outbound-rtp") {
        const o = r as RTCStats & {
          kind?: string;
          packetsSent?: number;
          bytesSent?: number;
        };
        packetsSent += o.packetsSent ?? 0;
        bytesSent += o.bytesSent ?? 0;
      } else if (t === "remote-inbound-rtp") {
        const ri = r as RTCStats & {
          packetsLost?: number;
          jitter?: number;
        };
        packetsLost += ri.packetsLost ?? 0;
        if (typeof ri.jitter === "number") {
          jitter = (jitter ?? 0) + ri.jitter * 1000;
        }
      } else if (t === "inbound-rtp") {
        const inb = r as RTCStats & {
          bytesReceived?: number;
          framesDecoded?: number;
          jitter?: number;
          packetsLost?: number;
        };
        bytesReceived += inb.bytesReceived ?? 0;
        framesDecoded += inb.framesDecoded ?? 0;
        if (typeof inb.jitter === "number") {
          jitter = (jitter ?? 0) + inb.jitter * 1000;
        }
        packetsLost += inb.packetsLost ?? 0;
      }
    });

    const now = Date.now();
    const dt = this.lastSampleAt > 0 ? Math.max(1, now - this.lastSampleAt) : 0;
    const outboundBitrate = dt > 0 ? ((bytesSent - this.lastBytesSent) * 8 * 1000) / dt : null;
    const inboundBitrate = dt > 0 ? ((bytesReceived - this.lastBytesReceived) * 8 * 1000) / dt : null;

    this.lastBytesSent = bytesSent;
    this.lastBytesReceived = bytesReceived;
    this.lastSampleAt = now;

    const totalPackets = packetsSent + packetsLost;
    const packetLossPct = totalPackets > 0 ? (packetsLost / totalPackets) * 100 : 0;

    return {
      roundTripTimeMs: rtt,
      packetLossPct,
      jitterMs: jitter,
      outboundBitrate: outboundBitrate != null ? Math.max(0, outboundBitrate) : null,
      inboundBitrate: inboundBitrate != null ? Math.max(0, inboundBitrate) : null,
      packetsSent,
      packetsLost,
      framesDecoded,
      timestamp: now,
    };
  }
}
