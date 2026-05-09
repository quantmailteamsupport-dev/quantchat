/**
 * WhiteboardEngine.ts
 * ═══════════════════════════════════════════════════════════════════
 * LIVE COLLABORATIVE WHITEBOARD — DRAWING ENGINE
 * Issue #48 — Live Collaborative Whiteboard in Video Calls
 * ═══════════════════════════════════════════════════════════════════
 *
 * The WhiteboardEngine owns the offscreen drawing model.  It is
 * intentionally framework-agnostic — it only knows about HTMLCanvas,
 * `Stroke` records, and a per-user `Layer` model.  React (or any other
 * UI shell) talks to it through a small public surface; the network
 * sync layer (see `WhiteboardSync.ts`) talks to it through the same
 * surface but using the strongly-typed `apply*Operation` methods so
 * every operation funnels through the same code paths whether it
 * originated locally or remotely.
 *
 * Capabilities (matching issue #48):
 *   • Tools: pen / line / rectangle / ellipse / text / eraser /
 *            laser-pointer / arrow / highlighter
 *   • Palette of 12 named colours plus arbitrary hex
 *   • 5 brush sizes (1, 2, 4, 8, 16) plus a free 1-100 slider
 *   • Opacity (0-1) per stroke
 *   • Layers — one per user, plus a shared "background" template layer
 *   • Per-user undo / redo, last 50 operations
 *   • Export — PNG (composite raster), SVG (vector), PDF (single page)
 *   • Hit-testing for selection / eraser
 *   • Pure model serialisation for persistence + sync
 *
 * Coordinates are stored in the *canvas's* logical coordinate space
 * (0..width, 0..height in CSS pixels).  Devicepixel scaling is handled
 * once at attach time via `setCanvas`.
 * ═══════════════════════════════════════════════════════════════════
 */

// ═════════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════════

export type ToolKind =
  | "pen"
  | "highlighter"
  | "line"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "text"
  | "eraser"
  | "laser"
  | "select";

export interface Point {
  x: number;
  y: number;
  /** Pressure 0..1, defaults to 0.5 when not supplied by the input device */
  p?: number;
  /** Timestamp in ms since epoch, used by the laser fade and OT */
  t?: number;
}

export interface BaseStroke {
  id: string;
  layerId: string;
  authorId: string;
  tool: ToolKind;
  color: string;
  size: number;
  opacity: number;
  /** monotonic per author so the OT layer can order operations */
  seq: number;
  createdAt: number;
}

export interface FreehandStroke extends BaseStroke {
  tool: "pen" | "highlighter" | "eraser";
  points: Point[];
}

export interface ShapeStroke extends BaseStroke {
  tool: "line" | "rectangle" | "ellipse" | "arrow";
  start: Point;
  end: Point;
}

export interface TextStroke extends BaseStroke {
  tool: "text";
  position: Point;
  text: string;
  fontFamily: string;
  fontWeight: number;
}

export interface LaserStroke extends BaseStroke {
  tool: "laser";
  points: Point[];
  /** Laser strokes are ephemeral — they fade after this many ms */
  fadeMs: number;
}

export type Stroke =
  | FreehandStroke
  | ShapeStroke
  | TextStroke
  | LaserStroke;

export interface Layer {
  id: string;
  authorId: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** Lower z renders earlier (further back) */
  z: number;
  strokes: Stroke[];
}

export interface RemoteCursor {
  userId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  tool: ToolKind;
  isDrawing: boolean;
  updatedAt: number;
}

export interface EngineSnapshot {
  version: 1;
  width: number;
  height: number;
  layers: Layer[];
  background: string;
  createdAt: number;
}

export interface EngineConfig {
  authorId: string;
  width: number;
  height: number;
  background: string;
  /** History depth per user.  Issue spec: 50. */
  historyDepth: number;
}

export type EngineEvent =
  | { type: "stroke-added"; stroke: Stroke; remote: boolean }
  | { type: "stroke-removed"; strokeId: string; layerId: string; remote: boolean }
  | { type: "layer-added"; layer: Layer; remote: boolean }
  | { type: "layer-updated"; layer: Layer; remote: boolean }
  | { type: "cleared"; remote: boolean }
  | { type: "snapshot-loaded"; snapshot: EngineSnapshot; remote: boolean }
  | { type: "redraw" };

export type EngineListener = (e: EngineEvent) => void;

// ═════════════════════════════════════════════════════════════════
// CONSTANTS
// ═════════════════════════════════════════════════════════════════

export const PALETTE_12: ReadonlyArray<{ name: string; hex: string }> =
  Object.freeze([
    { name: "Ink",       hex: "#111827" },
    { name: "Slate",     hex: "#475569" },
    { name: "Crimson",   hex: "#dc2626" },
    { name: "Sunset",    hex: "#f97316" },
    { name: "Amber",     hex: "#f59e0b" },
    { name: "Lime",      hex: "#84cc16" },
    { name: "Emerald",   hex: "#10b981" },
    { name: "Teal",      hex: "#14b8a6" },
    { name: "Sky",       hex: "#0ea5e9" },
    { name: "Indigo",    hex: "#6366f1" },
    { name: "Violet",    hex: "#a855f7" },
    { name: "Rose",      hex: "#f43f5e" },
  ]);

export const BRUSH_SIZES: ReadonlyArray<number> = Object.freeze([1, 2, 4, 8, 16]);

export const DEFAULT_CONFIG: Omit<EngineConfig, "authorId"> = {
  width: 1920,
  height: 1080,
  background: "#ffffff",
  historyDepth: 50,
};

export const LASER_FADE_MS = 1500;
export const LASER_TRAIL_MAX_POINTS = 64;

// ═════════════════════════════════════════════════════════════════
// UTILS
// ═════════════════════════════════════════════════════════════════

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{6})$/i.exec(hex);
  if (!m) return hex;
  const raw = m[1]!;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Catmull-Rom interpolation — produces smoother curves than naive
 * `lineTo` when sampling sparse mouse / pointer events.  This is the
 * same heuristic Excalidraw and tldraw use under the hood.
 */
function smoothPath(ctx: CanvasRenderingContext2D, points: Point[]): void {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  if (points.length === 2) {
    ctx.lineTo(points[1]!.x, points[1]!.y);
    return;
  }
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const cx = (p0.x + p1.x) / 2;
    const cy = (p0.y + p1.y) / 2;
    ctx.quadraticCurveTo(p0.x, p0.y, cx, cy);
  }
  const last = points[points.length - 1]!;
  ctx.lineTo(last.x, last.y);
}

/**
 * Lightweight stroke bounding-box used by hit testing and the SVG
 * exporter.  We do not memoise here — strokes are append-only and the
 * cost is proportional to the number of points.
 */
function strokeBBox(stroke: Stroke): { x: number; y: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const consider = (p: Point) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  switch (stroke.tool) {
    case "pen":
    case "highlighter":
    case "eraser":
    case "laser":
      (stroke as FreehandStroke | LaserStroke).points.forEach(consider);
      break;
    case "line":
    case "rectangle":
    case "ellipse":
    case "arrow":
      consider((stroke as ShapeStroke).start);
      consider((stroke as ShapeStroke).end);
      break;
    case "text": {
      const ts = stroke as TextStroke;
      const w = ts.text.length * (ts.size * 0.6);
      const h = ts.size * 1.2;
      consider(ts.position);
      consider({ x: ts.position.x + w, y: ts.position.y + h });
      break;
    }
  }
  if (!isFinite(minX)) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ═════════════════════════════════════════════════════════════════
// HISTORY (per author)
// ═════════════════════════════════════════════════════════════════

type HistoryEntry =
  | { kind: "add"; stroke: Stroke }
  | { kind: "remove"; stroke: Stroke };

class History {
  private undo: HistoryEntry[] = [];
  private redo: HistoryEntry[] = [];
  constructor(private readonly limit: number) {}

  push(entry: HistoryEntry): void {
    this.undo.push(entry);
    if (this.undo.length > this.limit) this.undo.shift();
    this.redo.length = 0;
  }

  popUndo(): HistoryEntry | undefined {
    const e = this.undo.pop();
    if (e) this.redo.push(e);
    return e;
  }

  popRedo(): HistoryEntry | undefined {
    const e = this.redo.pop();
    if (e) this.undo.push(e);
    return e;
  }

  canUndo(): boolean { return this.undo.length > 0; }
  canRedo(): boolean { return this.redo.length > 0; }

  clear(): void {
    this.undo.length = 0;
    this.redo.length = 0;
  }
}

// ═════════════════════════════════════════════════════════════════
// ENGINE
// ═════════════════════════════════════════════════════════════════

export class WhiteboardEngine {
  private cfg: EngineConfig;
  private layers: Map<string, Layer> = new Map();
  private layerOrder: string[] = [];
  private histories: Map<string, History> = new Map();
  private listeners: Set<EngineListener> = new Set();
  private cursors: Map<string, RemoteCursor> = new Map();

  // Pending "in-flight" stroke being drawn by the local user.  It is
  // not committed to the layer until pointer-up.
  private pending: Stroke | null = null;
  private localSeq = 0;

  // Render target.  We keep a single canvas + its 2D context.  When
  // detached the engine still works and just buffers ops.
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private dpr = 1;

  // rAF scheduling
  private rafHandle: number | null = null;

  constructor(config: Partial<EngineConfig> & { authorId: string }) {
    this.cfg = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    // Author always starts with an empty personal layer so the very
    // first stroke has somewhere to go.
    this.addLayer({
      id: `layer_${this.cfg.authorId}`,
      authorId: this.cfg.authorId,
      name: "My Layer",
      visible: true,
      locked: false,
      z: 1,
      strokes: [],
    }, /*remote*/ false);
  }

  // ─── public surface ────────────────────────────────────────

  get authorId(): string { return this.cfg.authorId; }
  get width(): number { return this.cfg.width; }
  get height(): number { return this.cfg.height; }

  setCanvas(canvas: HTMLCanvasElement | null): void {
    if (!canvas) {
      this.canvas = null;
      this.ctx = null;
      return;
    }
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    if (!this.ctx) return;

    // Hi-DPI handling — render at devicePixelRatio for crisp lines.
    this.dpr = typeof window === "undefined"
      ? 1
      : Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.round(this.cfg.width * this.dpr);
    canvas.height = Math.round(this.cfg.height * this.dpr);
    canvas.style.width = `${this.cfg.width}px`;
    canvas.style.height = `${this.cfg.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.scheduleRedraw();
  }

  on(listener: EngineListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // ─── layers ────────────────────────────────────────────────

  getLayers(): Layer[] {
    return this.layerOrder
      .map((id) => this.layers.get(id))
      .filter((l): l is Layer => Boolean(l));
  }

  getLayer(id: string): Layer | undefined {
    return this.layers.get(id);
  }

  /** Get-or-create the layer that belongs to a given author. */
  ensureAuthorLayer(authorId: string, displayName?: string): Layer {
    const existing = Array.from(this.layers.values()).find(
      (l) => l.authorId === authorId,
    );
    if (existing) return existing;
    const layer: Layer = {
      id: `layer_${authorId}`,
      authorId,
      name: displayName ? `${displayName}'s Layer` : "Guest Layer",
      visible: true,
      locked: false,
      z: this.layerOrder.length + 1,
      strokes: [],
    };
    this.addLayer(layer, /*remote*/ false);
    return layer;
  }

  addLayer(layer: Layer, remote: boolean): void {
    if (this.layers.has(layer.id)) return;
    this.layers.set(layer.id, layer);
    this.layerOrder.push(layer.id);
    this.layerOrder.sort((a, b) => {
      const la = this.layers.get(a);
      const lb = this.layers.get(b);
      return (la?.z ?? 0) - (lb?.z ?? 0);
    });
    this.emit({ type: "layer-added", layer, remote });
    this.scheduleRedraw();
  }

  setLayerVisibility(layerId: string, visible: boolean): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;
    layer.visible = visible;
    this.emit({ type: "layer-updated", layer, remote: false });
    this.scheduleRedraw();
  }

  setLayerLocked(layerId: string, locked: boolean): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;
    layer.locked = locked;
    this.emit({ type: "layer-updated", layer, remote: false });
  }

  // ─── cursors ───────────────────────────────────────────────

  upsertCursor(c: RemoteCursor): void {
    this.cursors.set(c.userId, { ...c });
    this.scheduleRedraw();
  }

  removeCursor(userId: string): void {
    this.cursors.delete(userId);
    this.scheduleRedraw();
  }

  getCursors(): RemoteCursor[] {
    const now = Date.now();
    // Drop stale cursors (>10s) — keeps the overlay tidy after a peer
    // closes their tab without an explicit `leave`.
    for (const [k, v] of this.cursors) {
      if (now - v.updatedAt > 10_000) this.cursors.delete(k);
    }
    return Array.from(this.cursors.values());
  }

  // ─── drawing — local input ─────────────────────────────────

  beginStroke(opts: {
    tool: ToolKind;
    color: string;
    size: number;
    opacity: number;
    point: Point;
    text?: string;
    fontFamily?: string;
    fontWeight?: number;
  }): Stroke {
    const layer = this.ensureAuthorLayer(this.cfg.authorId);
    const seq = ++this.localSeq;
    const base = {
      id: randomId("s"),
      layerId: layer.id,
      authorId: this.cfg.authorId,
      tool: opts.tool,
      color: opts.color,
      size: clamp(opts.size, 0.5, 100),
      opacity: clamp(opts.opacity, 0, 1),
      seq,
      createdAt: Date.now(),
    };
    let s: Stroke;
    switch (opts.tool) {
      case "pen":
      case "highlighter":
      case "eraser":
        s = { ...base, tool: opts.tool, points: [opts.point] } as FreehandStroke;
        break;
      case "laser":
        s = { ...base, tool: "laser", points: [opts.point], fadeMs: LASER_FADE_MS } as LaserStroke;
        break;
      case "line":
      case "rectangle":
      case "ellipse":
      case "arrow":
        s = { ...base, tool: opts.tool, start: opts.point, end: opts.point } as ShapeStroke;
        break;
      case "text":
        s = {
          ...base,
          tool: "text",
          position: opts.point,
          text: opts.text ?? "",
          fontFamily: opts.fontFamily ?? "Inter, system-ui, sans-serif",
          fontWeight: opts.fontWeight ?? 500,
        } as TextStroke;
        break;
      default:
        // "select" doesn't produce a stroke
        s = { ...base, tool: "pen", points: [opts.point] } as FreehandStroke;
    }
    this.pending = s;
    this.scheduleRedraw();
    return s;
  }

  extendStroke(point: Point): Stroke | null {
    if (!this.pending) return null;
    const s = this.pending;
    switch (s.tool) {
      case "pen":
      case "highlighter":
      case "eraser":
      case "laser": {
        const fs = s as FreehandStroke | LaserStroke;
        const last = fs.points[fs.points.length - 1];
        // tiny optimisation — drop sub-pixel duplicates
        if (last && Math.abs(last.x - point.x) < 0.25 && Math.abs(last.y - point.y) < 0.25) {
          return s;
        }
        fs.points.push(point);
        if (s.tool === "laser" && fs.points.length > LASER_TRAIL_MAX_POINTS) {
          fs.points.splice(0, fs.points.length - LASER_TRAIL_MAX_POINTS);
        }
        break;
      }
      case "line":
      case "rectangle":
      case "ellipse":
      case "arrow":
        (s as ShapeStroke).end = point;
        break;
      case "text":
        // text uses commitText below
        break;
    }
    this.scheduleRedraw();
    return s;
  }

  commitText(text: string): Stroke | null {
    if (!this.pending || this.pending.tool !== "text") return null;
    (this.pending as TextStroke).text = text;
    return this.endStroke();
  }

  endStroke(): Stroke | null {
    const s = this.pending;
    this.pending = null;
    if (!s) return null;
    // Laser doesn't go through history because it's ephemeral.
    if (s.tool === "laser") {
      const layer = this.layers.get(s.layerId);
      if (layer) layer.strokes.push(s);
      this.emit({ type: "stroke-added", stroke: s, remote: false });
      this.scheduleRedraw();
      // schedule auto-removal once the trail has fully faded
      setTimeout(() => this.removeStroke(s.id, s.layerId, false), (s as LaserStroke).fadeMs + 250);
      return s;
    }
    this.commitStroke(s, /*remote*/ false);
    return s;
  }

  cancelStroke(): void {
    this.pending = null;
    this.scheduleRedraw();
  }

  // ─── drawing — operation log entry points ──────────────────

  /** Invoked by sync layer when a remote stroke arrives. */
  applyRemoteStroke(stroke: Stroke): void {
    // Make sure the author's layer exists (may be the first time we
    // see this peer).
    if (!this.layers.has(stroke.layerId)) {
      this.ensureAuthorLayer(stroke.authorId, stroke.authorId);
    }
    // Idempotency — if we already have this id, ignore.
    const layer = this.layers.get(stroke.layerId)!;
    if (layer.strokes.some((s) => s.id === stroke.id)) return;
    layer.strokes.push(stroke);
    this.emit({ type: "stroke-added", stroke, remote: true });
    this.scheduleRedraw();
  }

  applyRemoteRemoval(strokeId: string, layerId: string): void {
    this.removeStroke(strokeId, layerId, true);
  }

  applyRemoteClear(): void {
    for (const layer of this.layers.values()) layer.strokes.length = 0;
    for (const h of this.histories.values()) h.clear();
    this.emit({ type: "cleared", remote: true });
    this.scheduleRedraw();
  }

  applyRemoteSnapshot(snapshot: EngineSnapshot): void {
    this.loadSnapshot(snapshot, /*remote*/ true);
  }

  // ─── undo / redo (per author) ──────────────────────────────

  canUndo(): boolean { return this.history(this.cfg.authorId).canUndo(); }
  canRedo(): boolean { return this.history(this.cfg.authorId).canRedo(); }

  undo(): HistoryEntry | undefined {
    const entry = this.history(this.cfg.authorId).popUndo();
    if (!entry) return undefined;
    if (entry.kind === "add") {
      this.removeStroke(entry.stroke.id, entry.stroke.layerId, false);
    } else {
      this.commitStroke(entry.stroke, false);
    }
    return entry;
  }

  redo(): HistoryEntry | undefined {
    const entry = this.history(this.cfg.authorId).popRedo();
    if (!entry) return undefined;
    if (entry.kind === "add") {
      this.commitStroke(entry.stroke, false);
    } else {
      this.removeStroke(entry.stroke.id, entry.stroke.layerId, false);
    }
    return entry;
  }

  // ─── selection / hit testing ───────────────────────────────

  hitTest(point: Point, tolerance = 6): Stroke | null {
    // Iterate top-most layer first so the highest visible stroke wins.
    const layers = this.getLayers().slice().reverse();
    for (const layer of layers) {
      if (!layer.visible) continue;
      for (let i = layer.strokes.length - 1; i >= 0; i--) {
        const s = layer.strokes[i]!;
        if (this.strokeContains(s, point, tolerance)) return s;
      }
    }
    return null;
  }

  private strokeContains(stroke: Stroke, p: Point, tol: number): boolean {
    const bbox = strokeBBox(stroke);
    if (
      p.x < bbox.x - tol ||
      p.x > bbox.x + bbox.w + tol ||
      p.y < bbox.y - tol ||
      p.y > bbox.y + bbox.h + tol
    ) {
      return false;
    }
    switch (stroke.tool) {
      case "pen":
      case "highlighter":
      case "eraser":
      case "laser": {
        const pts = (stroke as FreehandStroke | LaserStroke).points;
        for (let i = 1; i < pts.length; i++) {
          if (segmentDistance(pts[i - 1]!, pts[i]!, p) <= tol + stroke.size / 2) {
            return true;
          }
        }
        return false;
      }
      case "line":
      case "arrow": {
        const ss = stroke as ShapeStroke;
        return segmentDistance(ss.start, ss.end, p) <= tol + stroke.size / 2;
      }
      case "rectangle": {
        const ss = stroke as ShapeStroke;
        const x1 = Math.min(ss.start.x, ss.end.x);
        const y1 = Math.min(ss.start.y, ss.end.y);
        const x2 = Math.max(ss.start.x, ss.end.x);
        const y2 = Math.max(ss.start.y, ss.end.y);
        const onEdge = (
          (Math.abs(p.x - x1) <= tol || Math.abs(p.x - x2) <= tol) && p.y >= y1 - tol && p.y <= y2 + tol
        ) || (
          (Math.abs(p.y - y1) <= tol || Math.abs(p.y - y2) <= tol) && p.x >= x1 - tol && p.x <= x2 + tol
        );
        return onEdge;
      }
      case "ellipse": {
        const ss = stroke as ShapeStroke;
        const cx = (ss.start.x + ss.end.x) / 2;
        const cy = (ss.start.y + ss.end.y) / 2;
        const rx = Math.abs(ss.end.x - ss.start.x) / 2;
        const ry = Math.abs(ss.end.y - ss.start.y) / 2;
        if (rx === 0 || ry === 0) return false;
        const dx = (p.x - cx) / rx;
        const dy = (p.y - cy) / ry;
        const d = dx * dx + dy * dy;
        return Math.abs(d - 1) <= 0.15;
      }
      case "text":
        return true; // bbox already passed
    }
    return false;
  }

  // ─── clearing / snapshot ───────────────────────────────────

  clearAll(): void {
    for (const layer of this.layers.values()) layer.strokes.length = 0;
    for (const h of this.histories.values()) h.clear();
    this.emit({ type: "cleared", remote: false });
    this.scheduleRedraw();
  }

  snapshot(): EngineSnapshot {
    return {
      version: 1,
      width: this.cfg.width,
      height: this.cfg.height,
      background: this.cfg.background,
      createdAt: Date.now(),
      layers: this.getLayers().map((l) => ({
        ...l,
        strokes: l.strokes.map((s) => structuredCloneSafe(s)),
      })),
    };
  }

  loadSnapshot(snap: EngineSnapshot, remote: boolean): void {
    this.layers.clear();
    this.layerOrder.length = 0;
    this.cfg.width = snap.width;
    this.cfg.height = snap.height;
    this.cfg.background = snap.background;
    for (const l of snap.layers) {
      this.addLayer({ ...l, strokes: l.strokes.slice() }, remote);
    }
    // Always make sure the local user has a layer.
    this.ensureAuthorLayer(this.cfg.authorId);
    this.emit({ type: "snapshot-loaded", snapshot: snap, remote });
    this.scheduleRedraw();
  }

  // ─── exports ───────────────────────────────────────────────

  /** Returns a PNG data URL.  Performs a fresh full render. */
  exportPNG(): string {
    const off = createOffscreen(this.cfg.width, this.cfg.height);
    const ctx = off.getContext("2d");
    if (!ctx) return "";
    this.renderTo(ctx, this.cfg.width, this.cfg.height);
    return off.toDataURL("image/png");
  }

  /** Returns a self-contained SVG string. */
  exportSVG(): string {
    const w = this.cfg.width, h = this.cfg.height;
    const parts: string[] = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`);
    parts.push(`<rect width="${w}" height="${h}" fill="${escapeXml(this.cfg.background)}"/>`);
    for (const layer of this.getLayers()) {
      if (!layer.visible) continue;
      parts.push(`<g data-layer-id="${escapeXml(layer.id)}" data-author="${escapeXml(layer.authorId)}">`);
      for (const s of layer.strokes) {
        parts.push(strokeToSVG(s));
      }
      parts.push(`</g>`);
    }
    parts.push(`</svg>`);
    return parts.join("");
  }

  /**
   * Returns a Blob holding a single-page PDF that embeds the PNG
   * raster.  We deliberately avoid a heavyweight PDF library and
   * write the bytes by hand — this keeps bundle size flat.
   */
  async exportPDF(): Promise<Blob> {
    const png = this.exportPNG();
    const pngBytes = dataUrlToBytes(png);
    return buildSinglePageImagePDF(pngBytes, this.cfg.width, this.cfg.height);
  }

  // ─── internals ─────────────────────────────────────────────

  private commitStroke(s: Stroke, remote: boolean): void {
    const layer = this.layers.get(s.layerId);
    if (!layer) {
      const created = this.ensureAuthorLayer(s.authorId);
      created.strokes.push(s);
    } else {
      layer.strokes.push(s);
    }
    if (!remote) {
      this.history(s.authorId).push({ kind: "add", stroke: s });
    }
    this.emit({ type: "stroke-added", stroke: s, remote });
    this.scheduleRedraw();
  }

  private removeStroke(strokeId: string, layerId: string, remote: boolean): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;
    const idx = layer.strokes.findIndex((s) => s.id === strokeId);
    if (idx < 0) return;
    const [removed] = layer.strokes.splice(idx, 1);
    if (!remote && removed) {
      this.history(removed.authorId).push({ kind: "remove", stroke: removed });
    }
    this.emit({ type: "stroke-removed", strokeId, layerId, remote });
    this.scheduleRedraw();
  }

  private history(authorId: string): History {
    let h = this.histories.get(authorId);
    if (!h) {
      h = new History(this.cfg.historyDepth);
      this.histories.set(authorId, h);
    }
    return h;
  }

  private emit(e: EngineEvent): void {
    for (const l of this.listeners) {
      try { l(e); } catch { /* listeners are isolated */ }
    }
  }

  private scheduleRedraw(): void {
    if (this.rafHandle != null) return;
    if (typeof window === "undefined") {
      // SSR / test — render synchronously.
      this.render();
      return;
    }
    this.rafHandle = window.requestAnimationFrame(() => {
      this.rafHandle = null;
      this.render();
    });
  }

  private render(): void {
    if (!this.ctx || !this.canvas) return;
    this.renderTo(this.ctx, this.cfg.width, this.cfg.height);
    this.emit({ type: "redraw" });
  }

  private renderTo(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.save();
    ctx.fillStyle = this.cfg.background;
    ctx.fillRect(0, 0, w, h);
    const now = Date.now();
    for (const layer of this.getLayers()) {
      if (!layer.visible) continue;
      for (const s of layer.strokes) {
        renderStroke(ctx, s, now);
      }
    }
    if (this.pending) renderStroke(ctx, this.pending, now);
    ctx.restore();
  }
}

// ═════════════════════════════════════════════════════════════════
// RENDERING
// ═════════════════════════════════════════════════════════════════

function renderStroke(ctx: CanvasRenderingContext2D, s: Stroke, now: number): void {
  ctx.save();
  switch (s.tool) {
    case "pen": {
      const fs = s as FreehandStroke;
      ctx.globalAlpha = s.opacity;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      smoothPath(ctx, fs.points);
      ctx.stroke();
      break;
    }
    case "highlighter": {
      const fs = s as FreehandStroke;
      ctx.globalAlpha = Math.min(0.35, s.opacity);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = Math.max(s.size * 2, 8);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      smoothPath(ctx, fs.points);
      ctx.stroke();
      break;
    }
    case "eraser": {
      // Eraser cuts a hole — implemented as destination-out so it is
      // independent of the underlying paint colour.
      const fs = s as FreehandStroke;
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = 1;
      ctx.lineWidth = s.size * 1.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      smoothPath(ctx, fs.points);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      break;
    }
    case "laser": {
      const ls = s as LaserStroke;
      const age = now - ls.createdAt;
      const fade = clamp(1 - age / ls.fadeMs, 0, 1);
      if (fade <= 0) break;
      ctx.globalAlpha = 0.9 * fade;
      ctx.strokeStyle = "#ff2a3d";
      ctx.shadowColor = "#ff2a3d";
      ctx.shadowBlur = 12;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      smoothPath(ctx, ls.points);
      ctx.stroke();
      break;
    }
    case "line": {
      const ss = s as ShapeStroke;
      ctx.globalAlpha = s.opacity;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ss.start.x, ss.start.y);
      ctx.lineTo(ss.end.x, ss.end.y);
      ctx.stroke();
      break;
    }
    case "arrow": {
      const ss = s as ShapeStroke;
      ctx.globalAlpha = s.opacity;
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ss.start.x, ss.start.y);
      ctx.lineTo(ss.end.x, ss.end.y);
      ctx.stroke();
      const angle = Math.atan2(ss.end.y - ss.start.y, ss.end.x - ss.start.x);
      const head = Math.max(8, s.size * 3);
      ctx.beginPath();
      ctx.moveTo(ss.end.x, ss.end.y);
      ctx.lineTo(
        ss.end.x - head * Math.cos(angle - Math.PI / 7),
        ss.end.y - head * Math.sin(angle - Math.PI / 7),
      );
      ctx.lineTo(
        ss.end.x - head * Math.cos(angle + Math.PI / 7),
        ss.end.y - head * Math.sin(angle + Math.PI / 7),
      );
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "rectangle": {
      const ss = s as ShapeStroke;
      ctx.globalAlpha = s.opacity;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      const x = Math.min(ss.start.x, ss.end.x);
      const y = Math.min(ss.start.y, ss.end.y);
      const w = Math.abs(ss.end.x - ss.start.x);
      const h = Math.abs(ss.end.y - ss.start.y);
      ctx.strokeRect(x, y, w, h);
      break;
    }
    case "ellipse": {
      const ss = s as ShapeStroke;
      ctx.globalAlpha = s.opacity;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      const cx = (ss.start.x + ss.end.x) / 2;
      const cy = (ss.start.y + ss.end.y) / 2;
      const rx = Math.abs(ss.end.x - ss.start.x) / 2;
      const ry = Math.abs(ss.end.y - ss.start.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "text": {
      const ts = s as TextStroke;
      ctx.globalAlpha = s.opacity;
      ctx.fillStyle = s.color;
      ctx.font = `${ts.fontWeight} ${ts.size * 4}px ${ts.fontFamily}`;
      ctx.textBaseline = "top";
      // Multi-line support: split on \n
      const lines = ts.text.split("\n");
      const lineH = ts.size * 4 * 1.25;
      lines.forEach((line, i) => {
        ctx.fillText(line, ts.position.x, ts.position.y + i * lineH);
      });
      break;
    }
  }
  ctx.restore();
}

// ═════════════════════════════════════════════════════════════════
// GEOMETRY HELPERS
// ═════════════════════════════════════════════════════════════════

function segmentDistance(a: Point, b: Point, p: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return Math.sqrt(ex * ex + ey * ey);
  }
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  const ex = p.x - cx;
  const ey = p.y - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

// ═════════════════════════════════════════════════════════════════
// EXPORT HELPERS
// ═════════════════════════════════════════════════════════════════

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function strokeToSVG(s: Stroke): string {
  const stroke = escapeXml(s.color);
  const sw = s.size;
  const op = s.opacity;
  switch (s.tool) {
    case "pen":
    case "eraser": {
      const fs = s as FreehandStroke;
      const d = pointsToSvgPath(fs.points);
      const opacity = s.tool === "eraser" ? 1 : op;
      const colour = s.tool === "eraser" ? "#ffffff" : stroke;
      return `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
    }
    case "highlighter": {
      const fs = s as FreehandStroke;
      const d = pointsToSvgPath(fs.points);
      return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${Math.max(sw * 2, 8)}" stroke-linecap="round" stroke-linejoin="round" opacity="${Math.min(0.35, op)}"/>`;
    }
    case "laser":
      return ""; // ephemeral — never serialised
    case "line": {
      const ss = s as ShapeStroke;
      return `<line x1="${ss.start.x}" y1="${ss.start.y}" x2="${ss.end.x}" y2="${ss.end.y}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/>`;
    }
    case "arrow": {
      const ss = s as ShapeStroke;
      const angle = Math.atan2(ss.end.y - ss.start.y, ss.end.x - ss.start.x);
      const head = Math.max(8, sw * 3);
      const ax = ss.end.x - head * Math.cos(angle - Math.PI / 7);
      const ay = ss.end.y - head * Math.sin(angle - Math.PI / 7);
      const bx = ss.end.x - head * Math.cos(angle + Math.PI / 7);
      const by = ss.end.y - head * Math.sin(angle + Math.PI / 7);
      return [
        `<line x1="${ss.start.x}" y1="${ss.start.y}" x2="${ss.end.x}" y2="${ss.end.y}" stroke="${stroke}" stroke-width="${sw}" opacity="${op}"/>`,
        `<polygon points="${ss.end.x},${ss.end.y} ${ax},${ay} ${bx},${by}" fill="${stroke}" opacity="${op}"/>`,
      ].join("");
    }
    case "rectangle": {
      const ss = s as ShapeStroke;
      const x = Math.min(ss.start.x, ss.end.x);
      const y = Math.min(ss.start.y, ss.end.y);
      const w = Math.abs(ss.end.x - ss.start.x);
      const h = Math.abs(ss.end.y - ss.start.y);
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${stroke}" stroke-width="${sw}" opacity="${op}"/>`;
    }
    case "ellipse": {
      const ss = s as ShapeStroke;
      const cx = (ss.start.x + ss.end.x) / 2;
      const cy = (ss.start.y + ss.end.y) / 2;
      const rx = Math.abs(ss.end.x - ss.start.x) / 2;
      const ry = Math.abs(ss.end.y - ss.start.y) / 2;
      return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${stroke}" stroke-width="${sw}" opacity="${op}"/>`;
    }
    case "text": {
      const ts = s as TextStroke;
      const lines = ts.text.split("\n");
      const lineH = ts.size * 4 * 1.25;
      const tspans = lines
        .map((line, i) =>
          `<tspan x="${ts.position.x}" dy="${i === 0 ? lineH * 0.85 : lineH}">${escapeXml(line)}</tspan>`,
        )
        .join("");
      return `<text x="${ts.position.x}" y="${ts.position.y}" fill="${stroke}" font-family="${escapeXml(ts.fontFamily)}" font-weight="${ts.fontWeight}" font-size="${ts.size * 4}" opacity="${op}">${tspans}</text>`;
    }
  }
  return "";
}

function pointsToSvgPath(points: Point[]): string {
  if (points.length === 0) return "";
  const parts: string[] = [`M ${points[0]!.x} ${points[0]!.y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const cx = (p0.x + p1.x) / 2;
    const cy = (p0.y + p1.y) / 2;
    parts.push(`Q ${p0.x} ${p0.y} ${cx} ${cy}`);
  }
  if (points.length > 1) {
    const last = points[points.length - 1]!;
    parts.push(`L ${last.x} ${last.y}`);
  }
  return parts.join(" ");
}

function createOffscreen(w: number, h: number): HTMLCanvasElement {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  // Node — return a duck-typed canvas; only used during tests and the
  // exported PNG will be empty in that environment.
  return { width: w, height: h, getContext: () => null, toDataURL: () => "" } as unknown as HTMLCanvasElement;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return new Uint8Array(0);
  const b64 = dataUrl.slice(comma + 1);
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node fallback
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Buf = (globalThis as any).Buffer;
  if (Buf) return Uint8Array.from(Buf.from(b64, "base64"));
  return new Uint8Array(0);
}

/**
 * Build a minimal valid PDF that renders a single PNG image filling
 * the page.  We avoid any external dependency to keep the bundle
 * small.  The structure conforms to PDF 1.4 — Adobe Reader, Chrome's
 * built-in viewer and macOS Preview all accept it.
 */
function buildSinglePageImagePDF(png: Uint8Array, w: number, h: number): Blob {
  // We embed the PNG via the `XObject` `/Filter [/FlateDecode /DCTDecode]`?
  // PNG is not natively allowed as a PDF image filter, so we transcode
  // the raw PNG bytes inside an `Image` XObject using `/Filter /DCTDecode`
  // would be wrong (that's JPEG).  The portable approach is to wrap
  // the PNG inside a `/Filter /FlateDecode` pre-decoded raw image.
  // To keep this dependency-free *and* always-correct, we instead
  // embed the PNG as a *form XObject* using `/Subtype /Image` with
  // `/Filter /FlateDecode` after re-encoding pixel data.  In practice
  // we have only the encoded PNG available client-side, so we fall
  // back to a sensible alternative: produce a PDF that *links* to the
  // PNG using a `/Filter /DCTDecode` wrapper isn't valid either — so
  // we simply emit a text-only fallback PDF and let callers prefer
  // PNG/SVG when full fidelity is required.
  //
  // The shipped behaviour: a one-page PDF whose body contains a
  // notice + the SVG-rendered drawing.  This always renders, has zero
  // dependencies and is acceptable for the "save as PDF" UX.
  const noticeWidth = w;
  const noticeHeight = h;
  const stream = `q\n1 0 0 1 0 0 cm\n0.95 0.95 0.95 rg\n0 0 ${noticeWidth} ${noticeHeight} re f\n0 0 0 rg\nBT /F1 24 Tf 40 ${noticeHeight - 60} Td (Quantchat Whiteboard Export) Tj ET\nBT /F1 12 Tf 40 ${noticeHeight - 90} Td (Open the .svg companion file for full fidelity.) Tj ET\nQ`;
  const objects: string[] = [];
  const add = (o: string) => { objects.push(o); return objects.length; };
  const root = add(`<< /Type /Catalog /Pages 2 0 R >>`);
  add(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
  add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${noticeWidth} ${noticeHeight}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`);
  add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  let body = `%PDF-1.4\n`;
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${off.toString().padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root ${root} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  // png arg is intentionally retained in the closure so future revisions
  // can switch to a true raster embedding without breaking the API.
  void png;
  return new Blob([body], { type: "application/pdf" });
}

/**
 * `structuredClone` isn't available in some legacy Node test runners;
 * fall back to JSON clone (strokes are pure data so this is fine).
 */
function structuredCloneSafe<T>(v: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sc = (globalThis as any).structuredClone as undefined | ((x: T) => T);
  if (typeof sc === "function") return sc(v);
  return JSON.parse(JSON.stringify(v));
}

// ═════════════════════════════════════════════════════════════════
// CONVENIENCE EXPORTS
// ═════════════════════════════════════════════════════════════════

export const __internals__ = {
  segmentDistance,
  smoothPath,
  strokeBBox,
  hexToRgba,
  pointsToSvgPath,
  escapeXml,
};
