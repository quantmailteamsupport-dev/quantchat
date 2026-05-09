import type { ConnectionStats, PeerConnectionManager } from "./PeerConnectionManager";
import {
  DEFAULT_MEDIA_PROFILE,
  LOW_MEDIA_PROFILE,
  type MediaStreamHandler,
} from "./MediaStreamHandler";

// ═══════════════════════════════════════════════════════════════
// QualityMonitor — adaptive degradation based on RTCStatsReport
// ═══════════════════════════════════════════════════════════════
//
// Thresholds (hysteresis applied: promote to a better tier only after
// two consecutive samples below the lower bound, demote immediately):
//
//   good     : loss ≤ 5%, normal 720p
//   fair     : loss 5-15%, drop to 480p & cap 600kbps
//   poor     : loss 15-30%, audio-only, glitch-shader on
//   lost     : loss > 30%, show reconnect banner
//
// Events are emitted to subscribers — the UI decides how to render.
// ═══════════════════════════════════════════════════════════════

export type QualityTier = "good" | "fair" | "poor" | "lost";

export interface QualityEvent {
  tier: QualityTier;
  previousTier: QualityTier;
  stats: ConnectionStats;
  recommendations: {
    /** Disable outbound video entirely. */
    audioOnly: boolean;
    /** Enable "glitch" visual shader state. */
    glitch: boolean;
    /** Show "Connection Lost — reconnecting" banner. */
    reconnectBanner: boolean;
    /** Max outbound video bitrate in bps, null = uncapped. */
    maxVideoBitrate: number | null;
  };
}

export interface QualityMonitorOptions {
  intervalMs?: number;
  /** Called whenever the tier changes. */
  onChange?: (event: QualityEvent) => void;
  /** Called on every sample (even when tier is unchanged). */
  onSample?: (stats: ConnectionStats) => void;
  /** If provided, the monitor will auto-apply recommendations (resolution, bitrate, audio-only). */
  mediaHandler?: MediaStreamHandler;
  /** Auto-reconnect callback when we hit the "lost" tier. */
  onReconnectRequested?: () => void;
}

export const QUALITY_THRESHOLDS = {
  fair: 5,
  poor: 15,
  lost: 30,
} as const;

type Listener<T> = (value: T) => void;

export class QualityMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private tier: QualityTier = "good";
  private lostStreak = 0;
  private goodStreak = 0;
  private listeners = new Set<Listener<QualityEvent>>();
  private disposed = false;

  constructor(
    private readonly pc: PeerConnectionManager,
    private readonly opts: QualityMonitorOptions = {},
  ) {}

  start(): void {
    if (this.timer || this.disposed) return;
    const interval = this.opts.intervalMs ?? 2000;
    const tick = async () => {
      if (this.disposed) return;
      try {
        const stats = await this.pc.sampleStats();
        this.opts.onSample?.(stats);
        await this.evaluate(stats);
      } catch {
        /* stats fetch can throw mid-teardown */
      }
    };
    this.timer = setInterval(tick, interval);
    void tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getTier(): QualityTier {
    return this.tier;
  }

  onChange(listener: Listener<QualityEvent>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.listeners.clear();
  }

  // ─── internals ─────────────────────────────────────────────

  private classify(loss: number): QualityTier {
    if (loss > QUALITY_THRESHOLDS.lost) return "lost";
    if (loss > QUALITY_THRESHOLDS.poor) return "poor";
    if (loss > QUALITY_THRESHOLDS.fair) return "fair";
    return "good";
  }

  private async evaluate(stats: ConnectionStats): Promise<void> {
    const raw = this.classify(stats.packetLossPct);
    const rank = { good: 0, fair: 1, poor: 2, lost: 3 } as const;

    // Demote immediately; promote after 2 consecutive better samples (hysteresis)
    let next: QualityTier = this.tier;
    if (rank[raw] > rank[this.tier]) {
      next = raw;
      this.goodStreak = 0;
    } else if (rank[raw] < rank[this.tier]) {
      this.goodStreak += 1;
      if (this.goodStreak >= 2) {
        next = raw;
        this.goodStreak = 0;
      }
    } else {
      this.goodStreak = 0;
    }

    // Track continuous "lost" streak for reconnect request
    if (raw === "lost") this.lostStreak += 1;
    else this.lostStreak = 0;

    if (next !== this.tier) {
      const previousTier = this.tier;
      this.tier = next;
      const event = this.buildEvent(next, previousTier, stats);
      await this.applyRecommendations(event);
      this.opts.onChange?.(event);
      for (const l of this.listeners) l(event);
    }

    // Auto-reconnect after 3 consecutive "lost" samples (6s default)
    if (this.lostStreak === 3) {
      this.opts.onReconnectRequested?.();
    }
  }

  private buildEvent(tier: QualityTier, previousTier: QualityTier, stats: ConnectionStats): QualityEvent {
    const recommendations = {
      audioOnly: tier === "poor" || tier === "lost",
      glitch: tier === "poor",
      reconnectBanner: tier === "lost",
      maxVideoBitrate:
        tier === "good" ? null : tier === "fair" ? 600_000 : tier === "poor" ? 0 : 0,
    };
    return { tier, previousTier, stats, recommendations };
  }

  private async applyRecommendations(event: QualityEvent): Promise<void> {
    const handler = this.opts.mediaHandler;

    // Bitrate cap
    try {
      await this.pc.setMaxBitrate(event.recommendations.maxVideoBitrate);
    } catch {
      /* ignore */
    }

    // Video enable/disable
    this.pc.setEnabled("video", !event.recommendations.audioOnly);

    // Resolution profile
    if (handler) {
      const target =
        event.tier === "fair" || event.tier === "poor" || event.tier === "lost"
          ? LOW_MEDIA_PROFILE
          : DEFAULT_MEDIA_PROFILE;
      try {
        await handler.setConstraintsProfile(target);
      } catch {
        /* ignore */
      }
    }
  }
}
