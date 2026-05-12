/**
 * WhiteboardSync.ts
 * ═══════════════════════════════════════════════════════════════════
 * REAL-TIME OPERATIONAL TRANSFORM FOR THE WHITEBOARD
 * Issue #48 — Live Collaborative Whiteboard in Video Calls
 * ═══════════════════════════════════════════════════════════════════
 *
 * `WhiteboardSync` glues a `WhiteboardEngine` instance to the
 * existing api-gateway socket.io transport.  It is intentionally
 * agnostic to the React tree — a hook (`useWhiteboardSync`) wraps it
 * so the UI component can mount/unmount cleanly.
 *
 * Wire protocol (server prefix `whiteboard-`):
 *
 *   join                 →  { boardId }
 *                            ack: { roster, snapshot? }
 *   leave                →  { boardId }
 *   op                   →  { boardId, op }
 *                            broadcast: { fromUserId, op }
 *   snapshot-request     →  { boardId }
 *                            broadcast: { fromUserId }
 *   snapshot-response    →  { boardId, snapshot, toUserId }
 *                            relayed only to `toUserId`
 *   cursor               →  { boardId, x, y, tool, isDrawing }
 *                            broadcast: { fromUserId, … }
 *   replay               →  { boardId, sinceSeq }
 *                            ack:        { ops }
 *
 * OPERATIONAL TRANSFORM
 * ──────────────────────
 * Strokes from different authors live on different layers (issue #48
 * spec: "strokes from different users never collide"), so true OT
 * isn't required for content.  We do however need *consistent
 * ordering* so that undo/redo and partial-stroke deltas converge:
 *
 *   • Each `Op` carries `(authorId, seq)`; per-author seq is a monotonic
 *     counter set by `WhiteboardEngine`.
 *   • The sync layer keeps a per-author `lastAppliedSeq` map.  Ops with
 *     `seq <= lastApplied` are dropped (idempotent).
 *   • Ops with `seq > lastApplied + 1` are buffered until the gap closes
 *     — when the gap is older than `REPLAY_TIMEOUT_MS` we trigger a
 *     replay request from the server.
 *
 * DELTA COMPRESSION
 * ─────────────────
 * Freehand strokes are streamed *incrementally* using `stroke-extend`
 * ops carrying only the new tail of points (since the last extend).
 * A final `stroke-finalize` flushes any held points and signals
 * undo-history capture on the receiver.  This keeps the per-frame
 * payload tiny (typically <300 bytes for a 30-point trail).
 *
 * LATENCY COMPENSATION
 * ────────────────────
 * Remote `stroke-begin` ops kick off a *prediction* on the receiver:
 * the partial stroke is rendered with reduced opacity.  When the
 * matching `stroke-finalize` arrives the prediction is replaced with
 * the authoritative stroke.  If `stroke-finalize` doesn't arrive
 * within `PREDICTION_TIMEOUT_MS` the prediction is dropped.
 *
 * RECONNECT REPLAY
 * ────────────────
 * On reconnect we request `replay` since the highest-seen seq for
 * each known peer.  The server keeps a small ring buffer of recent
 * ops per board.  If the buffer can't satisfy the request we fall
 * back to a full snapshot from any connected peer.
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  EngineSnapshot,
  Stroke,
  Point,
  RemoteCursor,
  ToolKind,
  WhiteboardEngine,
} from "./WhiteboardEngine";

// ═════════════════════════════════════════════════════════════════
// PROTOCOL TYPES
// ═════════════════════════════════════════════════════════════════

export interface RosterEntry {
  userId: string;
  name: string;
  color: string;
  joinedAt: number;
}

export type WhiteboardOp =
  | StrokeBeginOp
  | StrokeExtendOp
  | StrokeFinalizeOp
  | StrokeRemoveOp
  | ClearOp;

export interface OpEnvelope {
  /** Per-author monotonic counter used for ordering & replay */
  seq: number;
  authorId: string;
  /** Authoring timestamp (ms since epoch) */
  ts: number;
  op: WhiteboardOp;
}

export interface StrokeBeginOp {
  kind: "begin";
  strokeId: string;
  layerId: string;
  tool: ToolKind;
  color: string;
  size: number;
  opacity: number;
  initial: Point;
  /** Optional text payload for text strokes */
  text?: string;
  fontFamily?: string;
  fontWeight?: number;
}

export interface StrokeExtendOp {
  kind: "extend";
  strokeId: string;
  /** Points added since the previous extend */
  points: Point[];
  /** For shape tools (line/rect/etc) — overwrite end point */
  end?: Point;
}

export interface StrokeFinalizeOp {
  kind: "finalize";
  strokeId: string;
  finalStroke: Stroke;
}

export interface StrokeRemoveOp {
  kind: "remove";
  strokeId: string;
  layerId: string;
}

export interface ClearOp {
  kind: "clear";
}

// ═════════════════════════════════════════════════════════════════
// MINIMAL SOCKET INTERFACE
// ═════════════════════════════════════════════════════════════════

/**
 * We intentionally don't import socket.io-client here so the sync
 * layer can be unit-tested with a fake transport.  Anything matching
 * this surface works.
 */
export interface SyncSocket {
  emit: (event: string, ...args: unknown[]) => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off: (event: string, handler: (...args: unknown[]) => void) => void;
  connected?: boolean;
}

// ═════════════════════════════════════════════════════════════════
// TIMING CONSTANTS
// ═════════════════════════════════════════════════════════════════

/** Coalesce extend ops into batches of this many ms */
export const EXTEND_FLUSH_INTERVAL_MS = 35;
/** Cursor updates are throttled to this rate */
export const CURSOR_THROTTLE_MS = 60;
/** If we see a gap in seqs we wait this long for the missing op
 *  before requesting a replay. */
export const REPLAY_TIMEOUT_MS = 750;
/** A predicted remote stroke that doesn't finalize in this window
 *  is dropped from the canvas. */
export const PREDICTION_TIMEOUT_MS = 8_000;
/** Maximum number of points sent per extend op — caps payload size */
export const MAX_POINTS_PER_EXTEND = 32;

// ═════════════════════════════════════════════════════════════════
// THE SYNC CLASS
// ═════════════════════════════════════════════════════════════════

export interface SyncOptions {
  engine: WhiteboardEngine;
  socket: SyncSocket;
  boardId: string;
  userId: string;
  displayName: string;
  /** Hex colour used for this user's cursor / layer label */
  color: string;
  /** Called when the roster changes */
  onRoster?: (roster: RosterEntry[]) => void;
  /** Called when connection state flips */
  onConnectionChange?: (state: "connecting" | "online" | "offline") => void;
  /** Called when latency (rtt/2) is sampled */
  onLatency?: (latencyMs: number) => void;
}

export class WhiteboardSync {
  private engine: WhiteboardEngine;
  private socket: SyncSocket;
  private boardId: string;
  private userId: string;
  private displayName: string;
  private color: string;

  private roster: Map<string, RosterEntry> = new Map();
  private lastSeenSeq: Map<string, number> = new Map();
  private buffered: Map<string, OpEnvelope[]> = new Map();
  private predictedStrokes: Map<string, { authorId: string; expiresAt: number }> = new Map();

  private extendBuffer: Map<string, Point[]> = new Map();
  private extendShapeEnd: Map<string, Point> = new Map();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private cursorTimer: ReturnType<typeof setTimeout> | null = null;
  private predictionGcTimer: ReturnType<typeof setInterval> | null = null;
  private replayTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  private boundHandlers: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];

  private cb: Required<Pick<SyncOptions, "onRoster" | "onConnectionChange" | "onLatency">>;
  private joined = false;

  constructor(opts: SyncOptions) {
    this.engine = opts.engine;
    this.socket = opts.socket;
    this.boardId = opts.boardId;
    this.userId = opts.userId;
    this.displayName = opts.displayName;
    this.color = opts.color;
    this.cb = {
      onRoster: opts.onRoster ?? (() => {}),
      onConnectionChange: opts.onConnectionChange ?? (() => {}),
      onLatency: opts.onLatency ?? (() => {}),
    };
  }

  // ─── lifecycle ─────────────────────────────────────────────

  join(): void {
    if (this.joined) return;
    this.joined = true;
    this.cb.onConnectionChange("connecting");
    this.bind("whiteboard-op", this.onRemoteOp);
    this.bind("whiteboard-roster", this.onRoster);
    this.bind("whiteboard-peer-joined", this.onPeerJoined);
    this.bind("whiteboard-peer-left", this.onPeerLeft);
    this.bind("whiteboard-cursor", this.onRemoteCursor);
    this.bind("whiteboard-snapshot-request", this.onSnapshotRequest);
    this.bind("whiteboard-snapshot-response", this.onSnapshotResponse);
    this.bind("whiteboard-replay-response", this.onReplayResponse);
    this.bind("whiteboard-error", this.onError);
    this.bind("disconnect", this.onDisconnect);
    this.bind("connect", this.onReconnect);

    this.socket.emit(
      "whiteboard-join",
      { boardId: this.boardId, name: this.displayName, color: this.color },
      (ack: unknown) => {
        if (!ack || typeof ack !== "object") return;
        const a = ack as { roster?: RosterEntry[]; snapshot?: EngineSnapshot };
        if (a.roster) this.applyRoster(a.roster);
        if (a.snapshot) this.engine.applyRemoteSnapshot(a.snapshot);
        this.cb.onConnectionChange("online");
        // If no snapshot was provided but the roster contains peers we
        // request one — the first peer alphabetically by joinedAt is
        // canonical.
        if (!a.snapshot && (a.roster?.length ?? 0) > 1) {
          this.socket.emit("whiteboard-snapshot-request", { boardId: this.boardId });
        }
      },
    );

    this.flushTimer = setInterval(() => this.flushExtendBuffer(), EXTEND_FLUSH_INTERVAL_MS);
    this.predictionGcTimer = setInterval(() => this.gcPredictions(), 1_000);
  }

  leave(): void {
    if (!this.joined) return;
    this.joined = false;
    if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null; }
    if (this.cursorTimer) { clearTimeout(this.cursorTimer); this.cursorTimer = null; }
    if (this.predictionGcTimer) { clearInterval(this.predictionGcTimer); this.predictionGcTimer = null; }
    for (const t of this.replayTimers.values()) clearTimeout(t);
    this.replayTimers.clear();
    for (const { event, handler } of this.boundHandlers) {
      this.socket.off(event, handler);
    }
    this.boundHandlers.length = 0;
    this.socket.emit("whiteboard-leave", { boardId: this.boardId });
    this.cb.onConnectionChange("offline");
  }

  // ─── local stroke API (called by UI) ───────────────────────

  /** Notify peers that the local user is starting a new stroke. */
  publishBegin(stroke: Stroke): void {
    const envelope: OpEnvelope = {
      seq: stroke.seq,
      authorId: this.userId,
      ts: Date.now(),
      op: this.toBeginOp(stroke),
    };
    this.send(envelope);
  }

  /** Buffer a freehand point — flushed on the next tick. */
  publishExtendPoint(strokeId: string, point: Point): void {
    let buf = this.extendBuffer.get(strokeId);
    if (!buf) { buf = []; this.extendBuffer.set(strokeId, buf); }
    buf.push(point);
    if (buf.length >= MAX_POINTS_PER_EXTEND) this.flushOne(strokeId);
  }

  /** Update the moving end-point of a shape stroke (line, rect, ellipse, arrow). */
  publishExtendShape(strokeId: string, end: Point): void {
    this.extendShapeEnd.set(strokeId, end);
  }

  /** Finalize a local stroke — flush any buffered tail and broadcast. */
  publishFinalize(stroke: Stroke): void {
    this.flushOne(stroke.id);
    const envelope: OpEnvelope = {
      seq: stroke.seq,
      authorId: this.userId,
      ts: Date.now(),
      op: { kind: "finalize", strokeId: stroke.id, finalStroke: stroke },
    };
    this.send(envelope);
  }

  publishRemoval(strokeId: string, layerId: string, seq: number): void {
    const envelope: OpEnvelope = {
      seq,
      authorId: this.userId,
      ts: Date.now(),
      op: { kind: "remove", strokeId, layerId },
    };
    this.send(envelope);
  }

  publishClear(seq: number): void {
    const envelope: OpEnvelope = {
      seq,
      authorId: this.userId,
      ts: Date.now(),
      op: { kind: "clear" },
    };
    this.send(envelope);
  }

  /** Throttled cursor publication */
  publishCursor(x: number, y: number, tool: ToolKind, isDrawing: boolean): void {
    if (this.cursorTimer) return;
    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = null;
      this.socket.emit("whiteboard-cursor", {
        boardId: this.boardId,
        x, y, tool, isDrawing,
      });
    }, CURSOR_THROTTLE_MS);
  }

  /** Pushed by the UI when the user requests a replay (e.g. on focus). */
  requestReplay(authorId: string, sinceSeq: number): void {
    this.socket.emit("whiteboard-replay-request", {
      boardId: this.boardId,
      authorId,
      sinceSeq,
    });
  }

  // ─── inbound handlers ──────────────────────────────────────

  private onRemoteOp = (raw: unknown): void => {
    const env = parseEnvelope(raw);
    if (!env) return;
    if (env.authorId === this.userId) return; // echo
    const last = this.lastSeenSeq.get(env.authorId) ?? 0;
    if (env.seq <= last) return; // duplicate / older
    if (env.seq > last + 1) {
      // Gap — buffer + schedule replay request after the timeout
      this.bufferOp(env);
      this.scheduleReplay(env.authorId, last);
      return;
    }
    this.applyOp(env);
    // Drain any buffered ops that are now contiguous.
    this.drainBuffered(env.authorId);
  };

  private onRoster = (raw: unknown): void => {
    const data = raw as { roster?: RosterEntry[] } | undefined;
    if (!data?.roster) return;
    this.applyRoster(data.roster);
  };

  private onPeerJoined = (raw: unknown): void => {
    const data = raw as { user?: RosterEntry } | undefined;
    if (!data?.user) return;
    this.roster.set(data.user.userId, data.user);
    this.cb.onRoster(Array.from(this.roster.values()));
    // The new peer will likely ask for a snapshot — we don't need to
    // do anything proactive.
  };

  private onPeerLeft = (raw: unknown): void => {
    const data = raw as { userId?: string } | undefined;
    if (!data?.userId) return;
    this.roster.delete(data.userId);
    this.engine.removeCursor(data.userId);
    this.cb.onRoster(Array.from(this.roster.values()));
  };

  private onRemoteCursor = (raw: unknown): void => {
    const data = raw as Partial<RemoteCursor> & { fromUserId?: string } | undefined;
    if (!data?.fromUserId || data.fromUserId === this.userId) return;
    const peer = this.roster.get(data.fromUserId);
    const cursor: RemoteCursor = {
      userId: data.fromUserId,
      name: peer?.name ?? "Guest",
      color: peer?.color ?? "#888888",
      x: clampNumber(data.x, 0),
      y: clampNumber(data.y, 0),
      tool: (data.tool ?? "pen") as ToolKind,
      isDrawing: Boolean(data.isDrawing),
      updatedAt: Date.now(),
    };
    this.engine.upsertCursor(cursor);
  };

  private onSnapshotRequest = (raw: unknown): void => {
    const data = raw as { fromUserId?: string } | undefined;
    if (!data?.fromUserId) return;
    // Only respond if we're a senior peer (joined earlier than the
    // requester) — limits redundant snapshot uploads.
    const me = this.roster.get(this.userId);
    const them = this.roster.get(data.fromUserId);
    if (me && them && me.joinedAt > them.joinedAt) return;
    const snapshot = this.engine.snapshot();
    this.socket.emit("whiteboard-snapshot-response", {
      boardId: this.boardId,
      snapshot,
      toUserId: data.fromUserId,
    });
  };

  private onSnapshotResponse = (raw: unknown): void => {
    const data = raw as { snapshot?: EngineSnapshot } | undefined;
    if (!data?.snapshot) return;
    this.engine.applyRemoteSnapshot(data.snapshot);
  };

  private onReplayResponse = (raw: unknown): void => {
    const data = raw as { ops?: unknown[] } | undefined;
    const ops = data?.ops;
    if (!Array.isArray(ops)) return;
    for (const r of ops) {
      const env = parseEnvelope(r);
      if (!env) continue;
      if (env.authorId === this.userId) continue;
      const last = this.lastSeenSeq.get(env.authorId) ?? 0;
      if (env.seq <= last) continue;
      this.applyOp(env);
    }
    // Try to drain anything still buffered.
    for (const author of this.buffered.keys()) this.drainBuffered(author);
  };

  private onError = (raw: unknown): void => {
    // eslint-disable-next-line no-console
    console.warn("[WhiteboardSync] server error", raw);
  };

  private onDisconnect = (): void => {
    this.cb.onConnectionChange("offline");
  };

  private onReconnect = (): void => {
    if (!this.joined) return;
    this.cb.onConnectionChange("connecting");
    this.socket.emit(
      "whiteboard-join",
      { boardId: this.boardId, name: this.displayName, color: this.color },
      (ack: unknown) => {
        if (!ack || typeof ack !== "object") return;
        const a = ack as { roster?: RosterEntry[] };
        if (a.roster) this.applyRoster(a.roster);
        // Replay everything we missed per peer.
        for (const peer of this.roster.values()) {
          const last = this.lastSeenSeq.get(peer.userId) ?? 0;
          this.requestReplay(peer.userId, last);
        }
        this.cb.onConnectionChange("online");
      },
    );
  };

  // ─── ordering / buffering ──────────────────────────────────

  private bufferOp(env: OpEnvelope): void {
    let arr = this.buffered.get(env.authorId);
    if (!arr) { arr = []; this.buffered.set(env.authorId, arr); }
    // Insert sorted by seq.
    let i = 0;
    while (i < arr.length && arr[i]!.seq < env.seq) i++;
    if (arr[i]?.seq === env.seq) return; // dup
    arr.splice(i, 0, env);
  }

  private drainBuffered(authorId: string): void {
    const arr = this.buffered.get(authorId);
    if (!arr) return;
    while (arr.length > 0) {
      const last = this.lastSeenSeq.get(authorId) ?? 0;
      const next = arr[0]!;
      if (next.seq !== last + 1) break;
      arr.shift();
      this.applyOp(next);
    }
    if (arr.length === 0) this.buffered.delete(authorId);
  }

  private scheduleReplay(authorId: string, sinceSeq: number): void {
    if (this.replayTimers.has(authorId)) return;
    const t = setTimeout(() => {
      this.replayTimers.delete(authorId);
      const stillMissing = (this.lastSeenSeq.get(authorId) ?? 0) === sinceSeq;
      if (stillMissing) this.requestReplay(authorId, sinceSeq);
    }, REPLAY_TIMEOUT_MS);
    this.replayTimers.set(authorId, t);
  }

  private applyOp(env: OpEnvelope): void {
    this.lastSeenSeq.set(env.authorId, env.seq);
    const op = env.op;
    switch (op.kind) {
      case "begin":
        this.applyBegin(env, op);
        break;
      case "extend":
        this.applyExtend(env, op);
        break;
      case "finalize":
        this.applyFinalize(env, op);
        break;
      case "remove":
        this.engine.applyRemoteRemoval(op.strokeId, op.layerId);
        break;
      case "clear":
        this.engine.applyRemoteClear();
        break;
    }
    // RTT proxy — receiver-side latency estimate.
    const rtt = Date.now() - env.ts;
    if (rtt >= 0 && rtt < 30_000) this.cb.onLatency(rtt);
  }

  private applyBegin(env: OpEnvelope, op: StrokeBeginOp): void {
    // Optimistic prediction: build a placeholder stroke that the
    // engine will render at reduced opacity until finalize arrives.
    const placeholder = beginToPlaceholderStroke(env, op);
    this.engine.applyRemoteStroke(placeholder);
    this.predictedStrokes.set(op.strokeId, {
      authorId: env.authorId,
      expiresAt: Date.now() + PREDICTION_TIMEOUT_MS,
    });
  }

  private applyExtend(env: OpEnvelope, op: StrokeExtendOp): void {
    // Find the placeholder in the appropriate layer and append.
    const layer = this.engine.getLayer(`layer_${env.authorId}`);
    if (!layer) return;
    const target = layer.strokes.find((s) => s.id === op.strokeId);
    if (!target) return;
    if (op.points.length && (target as { points?: Point[] }).points) {
      (target as unknown as { points: Point[] }).points.push(...op.points);
    }
    if (op.end && (target as { end?: Point }).end) {
      (target as unknown as { end: Point }).end = op.end;
    }
  }

  private applyFinalize(_env: OpEnvelope, op: StrokeFinalizeOp): void {
    // Replace the predicted placeholder with the authoritative stroke.
    const layer = this.engine.getLayer(op.finalStroke.layerId);
    if (layer) {
      const idx = layer.strokes.findIndex((s) => s.id === op.strokeId);
      if (idx >= 0) layer.strokes.splice(idx, 1);
    }
    this.engine.applyRemoteStroke(op.finalStroke);
    this.predictedStrokes.delete(op.strokeId);
  }

  // ─── outbound buffering / flushing ─────────────────────────

  private flushExtendBuffer(): void {
    if (this.extendBuffer.size === 0 && this.extendShapeEnd.size === 0) return;
    for (const id of new Set([
      ...this.extendBuffer.keys(),
      ...this.extendShapeEnd.keys(),
    ])) {
      this.flushOne(id);
    }
  }

  private flushOne(strokeId: string): void {
    const points = this.extendBuffer.get(strokeId);
    const end = this.extendShapeEnd.get(strokeId);
    if ((!points || points.length === 0) && !end) return;
    this.extendBuffer.delete(strokeId);
    this.extendShapeEnd.delete(strokeId);
    const envelope: OpEnvelope = {
      // Extend ops reuse the begin's seq — the receiver doesn't gate
      // them on seq directly because they only matter if the stroke
      // already exists locally.
      seq: this.lastLocalSeq(),
      authorId: this.userId,
      ts: Date.now(),
      op: {
        kind: "extend",
        strokeId,
        points: points ?? [],
        end,
      },
    };
    this.send(envelope);
  }

  private lastLocalSeq(): number {
    return this.lastSeenSeq.get(this.userId) ?? 0;
  }

  private send(envelope: OpEnvelope): void {
    // Track our own seq so receiver-side gating works after a relay.
    if (envelope.authorId === this.userId) {
      this.lastSeenSeq.set(this.userId, Math.max(this.lastLocalSeq(), envelope.seq));
    }
    this.socket.emit("whiteboard-op", { boardId: this.boardId, envelope });
  }

  // ─── housekeeping ──────────────────────────────────────────

  private gcPredictions(): void {
    const now = Date.now();
    for (const [strokeId, info] of this.predictedStrokes) {
      if (info.expiresAt < now) {
        this.engine.applyRemoteRemoval(strokeId, `layer_${info.authorId}`);
        this.predictedStrokes.delete(strokeId);
      }
    }
  }

  private applyRoster(list: RosterEntry[]): void {
    this.roster.clear();
    for (const r of list) this.roster.set(r.userId, r);
    this.cb.onRoster(list.slice());
  }

  private bind(event: string, handler: (...args: unknown[]) => void): void {
    this.socket.on(event, handler);
    this.boundHandlers.push({ event, handler });
  }

  private toBeginOp(stroke: Stroke): StrokeBeginOp {
    const begin: StrokeBeginOp = {
      kind: "begin",
      strokeId: stroke.id,
      layerId: stroke.layerId,
      tool: stroke.tool,
      color: stroke.color,
      size: stroke.size,
      opacity: stroke.opacity,
      initial: pickInitial(stroke),
    };
    if (stroke.tool === "text") {
      const ts = stroke as Extract<Stroke, { tool: "text" }>;
      begin.text = ts.text;
      begin.fontFamily = ts.fontFamily;
      begin.fontWeight = ts.fontWeight;
    }
    return begin;
  }
}

// ═════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════

function pickInitial(stroke: Stroke): Point {
  switch (stroke.tool) {
    case "pen":
    case "highlighter":
    case "eraser":
    case "laser":
      return (stroke as { points: Point[] }).points[0] ?? { x: 0, y: 0 };
    case "line":
    case "rectangle":
    case "ellipse":
    case "arrow":
      return (stroke as { start: Point }).start;
    case "text":
      return (stroke as { position: Point }).position;
    default:
      return { x: 0, y: 0 };
  }
}

function beginToPlaceholderStroke(env: OpEnvelope, op: StrokeBeginOp): Stroke {
  const base = {
    id: op.strokeId,
    layerId: op.layerId,
    authorId: env.authorId,
    color: op.color,
    size: op.size,
    opacity: op.opacity * 0.6, // visibly different until finalized
    seq: env.seq,
    createdAt: env.ts,
  };
  switch (op.tool) {
    case "pen":
    case "highlighter":
    case "eraser":
      return { ...base, tool: op.tool, points: [op.initial] } as Stroke;
    case "laser":
      return { ...base, tool: "laser", points: [op.initial], fadeMs: 1500 } as Stroke;
    case "line":
    case "rectangle":
    case "ellipse":
    case "arrow":
      return { ...base, tool: op.tool, start: op.initial, end: op.initial } as Stroke;
    case "text":
      return {
        ...base,
        tool: "text",
        position: op.initial,
        text: op.text ?? "",
        fontFamily: op.fontFamily ?? "Inter, system-ui, sans-serif",
        fontWeight: op.fontWeight ?? 500,
      } as Stroke;
    default:
      return { ...base, tool: "pen", points: [op.initial] } as Stroke;
  }
}

function parseEnvelope(raw: unknown): OpEnvelope | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { envelope?: unknown; fromUserId?: string };
  // The server may either forward `{ fromUserId, envelope }` or the
  // bare envelope itself in replay responses.
  const env = (r.envelope ?? raw) as Partial<OpEnvelope> | undefined;
  if (!env || typeof env !== "object") return null;
  if (typeof env.seq !== "number" || typeof env.authorId !== "string") return null;
  if (typeof env.ts !== "number" || !env.op || typeof env.op !== "object") return null;
  const opAny = env.op as { kind?: string };
  if (typeof opAny.kind !== "string") return null;
  return env as OpEnvelope;
}

function clampNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

// ═════════════════════════════════════════════════════════════════
// REACT HOOK (optional consumer convenience)
// ═════════════════════════════════════════════════════════════════

/**
 * Lightweight React hook factory.  We accept React as an injected
 * dependency rather than importing it here so this file remains
 * usable in both the React tree and pure tests.
 *
 * Example usage from a "use client" component:
 *
 *   const { sync, roster, status } = useWhiteboardSync({
 *     React, engine, socket, boardId, userId, displayName, color,
 *   });
 */
export function createUseWhiteboardSync(react: typeof import("react")) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function useWhiteboardSync(opts: SyncOptions & { React?: any }) {
    const { useEffect, useRef, useState } = react;
    const [status, setStatus] = useState<"connecting" | "online" | "offline">("offline");
    const [roster, setRoster] = useState<RosterEntry[]>([]);
    const [latencyMs, setLatencyMs] = useState<number>(0);
    const syncRef = useRef<WhiteboardSync | null>(null);

    useEffect(() => {
      const sync = new WhiteboardSync({
        ...opts,
        onRoster: (r) => setRoster(r),
        onConnectionChange: setStatus,
        onLatency: setLatencyMs,
      });
      syncRef.current = sync;
      sync.join();
      return () => { sync.leave(); syncRef.current = null; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opts.boardId, opts.userId]);

    return { sync: syncRef.current, status, roster, latencyMs };
  };
}
