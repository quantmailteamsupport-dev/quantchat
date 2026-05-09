// ═══════════════════════════════════════════════════════════════
// MediaStreamHandler — camera/mic/screen acquisition + analysis
// ═══════════════════════════════════════════════════════════════
//
// • Acquire local media with production-grade constraints
// • Toggle screen sharing (replaces video track on all consumers)
// • Hot-swap input devices mid-call (deviceId change)
// • AudioAnalyser: FFT frequency data exposed as Float32Array
//   for audio-reactive UI (holograms / visualizers)
//
// Device consumers subscribe via onTrackChange — they are responsible
// for hooking the new track into their RTCPeerConnection via replaceTrack.
// ═══════════════════════════════════════════════════════════════

export interface MediaConstraintsProfile {
  video: {
    width: number;
    height: number;
    frameRate: number;
  };
  audio: {
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl?: boolean;
  };
}

export const DEFAULT_MEDIA_PROFILE: MediaConstraintsProfile = {
  video: { width: 1280, height: 720, frameRate: 30 },
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

export const LOW_MEDIA_PROFILE: MediaConstraintsProfile = {
  video: { width: 640, height: 480, frameRate: 24 },
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

export type TrackChangeReason =
  | "acquired"
  | "stopped"
  | "device-switch"
  | "screen-share-on"
  | "screen-share-off"
  | "quality-downgrade";

export interface TrackChangeEvent {
  kind: "audio" | "video";
  oldTrack: MediaStreamTrack | null;
  newTrack: MediaStreamTrack | null;
  reason: TrackChangeReason;
}

type Listener<T> = (value: T) => void;

export class MediaStreamHandler {
  private stream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private preScreenVideoTrack: MediaStreamTrack | null = null;

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserSource: MediaStreamAudioSourceNode | null = null;
  private analyserBuffer: Float32Array<ArrayBuffer> | null = null;
  private rafHandle: number | null = null;
  private lastFrequencyData: Float32Array | null = null;

  private trackListeners = new Set<Listener<TrackChangeEvent>>();
  private frequencyListeners = new Set<Listener<Float32Array>>();
  private disposed = false;

  constructor(
    private profile: MediaConstraintsProfile = DEFAULT_MEDIA_PROFILE,
    private readonly opts: { fftSize?: number } = {},
  ) {}

  getStream(): MediaStream | null {
    return this.stream;
  }

  getVideoTrack(): MediaStreamTrack | null {
    return this.stream?.getVideoTracks()[0] ?? null;
  }

  getAudioTrack(): MediaStreamTrack | null {
    return this.stream?.getAudioTracks()[0] ?? null;
  }

  isScreenSharing(): boolean {
    return this.screenStream !== null;
  }

  onTrackChange(listener: Listener<TrackChangeEvent>): () => void {
    this.trackListeners.add(listener);
    return () => {
      this.trackListeners.delete(listener);
    };
  }

  onFrequencyData(listener: Listener<Float32Array>): () => void {
    this.frequencyListeners.add(listener);
    return () => {
      this.frequencyListeners.delete(listener);
    };
  }

  getFrequencyData(): Float32Array | null {
    return this.lastFrequencyData;
  }

  async acquire(options: { video?: boolean; audio?: boolean } = {}): Promise<MediaStream> {
    const wantVideo = options.video !== false;
    const wantAudio = options.audio !== false;

    const constraints: MediaStreamConstraints = {
      audio: wantAudio
        ? {
            echoCancellation: this.profile.audio.echoCancellation,
            noiseSuppression: this.profile.audio.noiseSuppression,
            autoGainControl: this.profile.audio.autoGainControl ?? true,
          }
        : false,
      video: wantVideo
        ? {
            width: { ideal: this.profile.video.width },
            height: { ideal: this.profile.video.height },
            frameRate: { ideal: this.profile.video.frameRate },
          }
        : false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const oldVideo = this.getVideoTrack();
    const oldAudio = this.getAudioTrack();

    // Stop previous stream tracks we're replacing
    this.stopStream(this.stream);
    this.stream = stream;

    this.emitTrackChange({
      kind: "video",
      oldTrack: oldVideo,
      newTrack: stream.getVideoTracks()[0] ?? null,
      reason: "acquired",
    });
    this.emitTrackChange({
      kind: "audio",
      oldTrack: oldAudio,
      newTrack: stream.getAudioTracks()[0] ?? null,
      reason: "acquired",
    });

    this.attachAnalyser(stream);
    return stream;
  }

  async setConstraintsProfile(profile: MediaConstraintsProfile): Promise<void> {
    this.profile = profile;
    const videoTrack = this.getVideoTrack();
    if (!videoTrack) return;
    try {
      await videoTrack.applyConstraints({
        width: { ideal: profile.video.width },
        height: { ideal: profile.video.height },
        frameRate: { ideal: profile.video.frameRate },
      });
      this.emitTrackChange({
        kind: "video",
        oldTrack: videoTrack,
        newTrack: videoTrack,
        reason: "quality-downgrade",
      });
    } catch {
      /* fallback: re-acquire */
      await this.acquire({ video: true, audio: !!this.getAudioTrack() });
    }
  }

  async switchDevice(kind: "audio" | "video", deviceId: string): Promise<void> {
    if (!this.stream) throw new Error("No active stream");

    const constraints: MediaStreamConstraints =
      kind === "video"
        ? {
            video: {
              deviceId: { exact: deviceId },
              width: { ideal: this.profile.video.width },
              height: { ideal: this.profile.video.height },
              frameRate: { ideal: this.profile.video.frameRate },
            },
          }
        : {
            audio: {
              deviceId: { exact: deviceId },
              echoCancellation: this.profile.audio.echoCancellation,
              noiseSuppression: this.profile.audio.noiseSuppression,
              autoGainControl: this.profile.audio.autoGainControl ?? true,
            },
          };

    const fresh = await navigator.mediaDevices.getUserMedia(constraints);
    const newTrack = kind === "video" ? fresh.getVideoTracks()[0] : fresh.getAudioTracks()[0];
    if (!newTrack) {
      fresh.getTracks().forEach((t) => t.stop());
      throw new Error(`Device did not produce a ${kind} track`);
    }

    const oldTrack =
      kind === "video" ? this.stream.getVideoTracks()[0] ?? null : this.stream.getAudioTracks()[0] ?? null;

    if (oldTrack) {
      this.stream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    this.stream.addTrack(newTrack);

    if (kind === "audio") {
      // Rebind analyser to the new audio source
      this.detachAnalyser();
      this.attachAnalyser(this.stream);
    }

    this.emitTrackChange({ kind, oldTrack, newTrack, reason: "device-switch" });
  }

  async startScreenShare(): Promise<MediaStreamTrack> {
    if (this.screenStream) return this.screenStream.getVideoTracks()[0]!;

    const display = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 30 },
      },
      audio: false,
    });
    this.screenStream = display;
    const screenTrack = display.getVideoTracks()[0];
    if (!screenTrack) {
      display.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
      throw new Error("No video track in display stream");
    }

    const prevVideo = this.getVideoTrack();
    this.preScreenVideoTrack = prevVideo;

    if (this.stream && prevVideo) {
      this.stream.removeTrack(prevVideo);
    }
    this.stream?.addTrack(screenTrack);

    // Auto-stop if user clicks browser stop-sharing button
    screenTrack.addEventListener("ended", () => {
      void this.stopScreenShare();
    });

    this.emitTrackChange({
      kind: "video",
      oldTrack: prevVideo,
      newTrack: screenTrack,
      reason: "screen-share-on",
    });
    return screenTrack;
  }

  async stopScreenShare(): Promise<void> {
    if (!this.screenStream) return;

    const screenTrack = this.screenStream.getVideoTracks()[0] ?? null;
    this.screenStream.getTracks().forEach((t) => t.stop());
    this.screenStream = null;

    if (this.stream && screenTrack) {
      try {
        this.stream.removeTrack(screenTrack);
      } catch {
        /* ignore */
      }
    }

    // Restore camera if we had one
    let restoredTrack: MediaStreamTrack | null = null;
    if (this.preScreenVideoTrack && this.preScreenVideoTrack.readyState === "live") {
      this.stream?.addTrack(this.preScreenVideoTrack);
      restoredTrack = this.preScreenVideoTrack;
    } else if (this.stream) {
      // Camera was stopped — reacquire
      try {
        const fresh = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: this.profile.video.width },
            height: { ideal: this.profile.video.height },
            frameRate: { ideal: this.profile.video.frameRate },
          },
        });
        restoredTrack = fresh.getVideoTracks()[0] ?? null;
        if (restoredTrack) this.stream.addTrack(restoredTrack);
      } catch {
        /* camera unavailable — remain without video */
      }
    }
    this.preScreenVideoTrack = null;

    this.emitTrackChange({
      kind: "video",
      oldTrack: screenTrack,
      newTrack: restoredTrack,
      reason: "screen-share-off",
    });
  }

  /** Enumerate available media input devices. */
  static async listDevices(): Promise<{ audio: MediaDeviceInfo[]; video: MediaDeviceInfo[] }> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return { audio: [], video: [] };
    }
    const all = await navigator.mediaDevices.enumerateDevices();
    return {
      audio: all.filter((d) => d.kind === "audioinput"),
      video: all.filter((d) => d.kind === "videoinput"),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachAnalyser();
    this.stopStream(this.stream);
    this.stream = null;
    this.stopStream(this.screenStream);
    this.screenStream = null;
    if (this.preScreenVideoTrack && this.preScreenVideoTrack.readyState === "live") {
      this.preScreenVideoTrack.stop();
    }
    this.preScreenVideoTrack = null;
    this.trackListeners.clear();
    this.frequencyListeners.clear();
    this.lastFrequencyData = null;
  }

  // ─── internals ─────────────────────────────────────────────

  private stopStream(stream: MediaStream | null): void {
    if (!stream) return;
    stream.getTracks().forEach((t) => t.stop());
  }

  private emitTrackChange(ev: TrackChangeEvent): void {
    for (const l of this.trackListeners) l(ev);
  }

  private attachAnalyser(stream: MediaStream): void {
    if (typeof window === "undefined") return;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    try {
      const AudioCtx: typeof AudioContext =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
      if (!AudioCtx) return;
      this.audioContext = new AudioCtx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.opts.fftSize ?? 512;
      this.analyser.smoothingTimeConstant = 0.8;
      this.analyserSource = this.audioContext.createMediaStreamSource(stream);
      this.analyserSource.connect(this.analyser);
      this.analyserBuffer = new Float32Array(new ArrayBuffer(this.analyser.frequencyBinCount * 4));
      this.startAnalyserLoop();
    } catch {
      /* browser doesn't support Web Audio */
      this.detachAnalyser();
    }
  }

  private startAnalyserLoop(): void {
    if (typeof window === "undefined") return;
    const tick = () => {
      if (!this.analyser || !this.analyserBuffer) return;
      this.analyser.getFloatFrequencyData(this.analyserBuffer);
      this.lastFrequencyData = this.analyserBuffer;
      for (const l of this.frequencyListeners) l(this.analyserBuffer);
      this.rafHandle = window.requestAnimationFrame(tick);
    };
    this.rafHandle = window.requestAnimationFrame(tick);
  }

  private detachAnalyser(): void {
    if (this.rafHandle != null && typeof window !== "undefined") {
      window.cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    try {
      this.analyserSource?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.analyser?.disconnect();
    } catch {
      /* ignore */
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      void this.audioContext.close().catch(() => {
        /* ignore */
      });
    }
    this.audioContext = null;
    this.analyser = null;
    this.analyserSource = null;
    this.analyserBuffer = null;
  }
}
