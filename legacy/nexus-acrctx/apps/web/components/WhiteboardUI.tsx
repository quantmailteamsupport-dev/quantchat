"use client";

/**
 * WhiteboardUI.tsx
 * ═══════════════════════════════════════════════════════════════════
 * REACT SHELL FOR THE LIVE COLLABORATIVE WHITEBOARD
 * Issue #48 — Live Collaborative Whiteboard in Video Calls
 * ═══════════════════════════════════════════════════════════════════
 *
 * This file is the only React-aware piece of the whiteboard feature.
 * It hosts the canvas, toolbar, presence cursors, picture-in-picture
 * video tile and the template picker.
 *
 * Public surface:
 *
 *   <WhiteboardUI
 *     boardId="call-42"
 *     userId="alice"
 *     displayName="Alice"
 *     userColor="#0ea5e9"
 *     socket={ioClient}
 *     localVideoStream={localCamera}
 *     remoteVideoStream={peerCamera}
 *     onClose={() => setOpen(false)}
 *   />
 *
 * The component is intentionally self-contained — no external CSS or
 * design-token wiring is required.  Styling uses inline objects so it
 * lifts cleanly into any host (workspace, call overlay, standalone
 * page).
 * ═══════════════════════════════════════════════════════════════════
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pencil,
  Highlighter,
  Eraser,
  Minus,
  Square,
  Circle,
  ArrowUpRight,
  Type,
  MousePointer,
  Crosshair,
  Undo2,
  Redo2,
  Trash2,
  Download,
  Layers,
  Users,
  PictureInPicture2,
  PictureInPicture,
  Copy,
  Save,
  Sparkles,
  X,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Maximize2,
  Minimize2,
} from "lucide-react";

import {
  WhiteboardEngine,
  PALETTE_12,
  BRUSH_SIZES,
  type ToolKind,
  type Point,
  type Stroke,
  type RemoteCursor,
} from "../lib/whiteboard/WhiteboardEngine";
import {
  WhiteboardSync,
  type SyncSocket,
  type RosterEntry,
} from "../lib/whiteboard/WhiteboardSync";
import {
  BUILTIN_TEMPLATES,
  COMMUNITY_GALLERY,
  listCustomTemplates,
  saveCustomTemplate,
  deleteCustomTemplate,
  applyTemplate,
  captureTemplate,
  type WhiteboardTemplate,
  type TemplateCategory,
} from "../lib/whiteboard/TemplateLibrary";

// ═════════════════════════════════════════════════════════════════
// PROPS
// ═════════════════════════════════════════════════════════════════

export interface WhiteboardUIProps {
  boardId: string;
  userId: string;
  displayName: string;
  /** Hex colour for this user's cursor + layer label. */
  userColor: string;
  /** Connected socket.io client (or any object matching `SyncSocket`). */
  socket: SyncSocket;
  /** Optional: the local user's camera stream — shown in the PiP tile. */
  localVideoStream?: MediaStream | null;
  /** Optional: a remote peer's camera stream — primary PiP video. */
  remoteVideoStream?: MediaStream | null;
  /** Called when the user clicks the close button. */
  onClose?: () => void;
  /** Optional initial template to pre-load. */
  initialTemplateId?: string;
  /** Engine width / height (defaults to 1920×1080). */
  width?: number;
  height?: number;
}

// ═════════════════════════════════════════════════════════════════
// THE COMPONENT
// ═════════════════════════════════════════════════════════════════

const TOOLS: { kind: ToolKind; label: string; icon: React.ComponentType<{ size?: number }>; }[] = [
  { kind: "select",      label: "Select",       icon: MousePointer },
  { kind: "pen",         label: "Pen",          icon: Pencil },
  { kind: "highlighter", label: "Highlighter",  icon: Highlighter },
  { kind: "eraser",      label: "Eraser",       icon: Eraser },
  { kind: "line",        label: "Line",         icon: Minus },
  { kind: "rectangle",   label: "Rectangle",    icon: Square },
  { kind: "ellipse",     label: "Ellipse",      icon: Circle },
  { kind: "arrow",       label: "Arrow",        icon: ArrowUpRight },
  { kind: "text",        label: "Text",         icon: Type },
  { kind: "laser",       label: "Laser pointer", icon: Crosshair },
];

export default function WhiteboardUI(props: WhiteboardUIProps): React.ReactElement {
  const {
    boardId,
    userId,
    displayName,
    userColor,
    socket,
    localVideoStream,
    remoteVideoStream,
    onClose,
    initialTemplateId,
    width = 1920,
    height = 1080,
  } = props;

  // ─── engine + sync (lifecycle stable) ──────────────────────
  const engineRef = useRef<WhiteboardEngine | null>(null);
  const syncRef = useRef<WhiteboardSync | null>(null);

  if (!engineRef.current) {
    engineRef.current = new WhiteboardEngine({
      authorId: userId,
      width,
      height,
      background: "#ffffff",
      historyDepth: 50,
    });
  }
  const engine = engineRef.current;

  // ─── canvas refs ───────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // ─── tool state ────────────────────────────────────────────
  const [tool, setTool] = useState<ToolKind>("pen");
  const [color, setColor] = useState<string>(userColor || PALETTE_12[0]!.hex);
  const [size, setSize] = useState<number>(BRUSH_SIZES[1]!);
  const [opacity, setOpacity] = useState<number>(1);
  const [followMode, setFollowMode] = useState<string | null>(null);
  const [pipPosition, setPipPosition] = useState<"tl" | "tr" | "bl" | "br">("br");
  const [pipExpanded, setPipExpanded] = useState<boolean>(false);
  const [pipVisible, setPipVisible] = useState<boolean>(true);

  // ─── presence + status ─────────────────────────────────────
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [status, setStatus] = useState<"connecting" | "online" | "offline">("offline");
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [, forceRedraw] = useState(0);

  // ─── panels ────────────────────────────────────────────────
  const [showLayers, setShowLayers] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSavePanel, setShowSavePanel] = useState(false);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string; strokeId: string } | null>(null);

  // ─── attach engine to canvas ───────────────────────────────
  useEffect(() => {
    engine.setCanvas(canvasRef.current);
    return () => { engine.setCanvas(null); };
  }, [engine]);

  // ─── boot sync ─────────────────────────────────────────────
  useEffect(() => {
    const sync = new WhiteboardSync({
      engine,
      socket,
      boardId,
      userId,
      displayName,
      color: userColor,
      onRoster: setRoster,
      onConnectionChange: setStatus,
      onLatency: (ms) => setLatencyMs(ms),
    });
    syncRef.current = sync;
    sync.join();
    return () => {
      sync.leave();
      syncRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, userId]);

  // ─── force re-render on engine events ──────────────────────
  useEffect(() => {
    return engine.on(() => {
      forceRedraw((n) => (n + 1) & 0xffff);
      drawOverlay();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // ─── apply initial template once ───────────────────────────
  const initialAppliedRef = useRef(false);
  useEffect(() => {
    if (initialAppliedRef.current) return;
    if (!initialTemplateId) return;
    const tpl =
      BUILTIN_TEMPLATES.find((t) => t.id === initialTemplateId) ||
      COMMUNITY_GALLERY.find((t) => t.id === initialTemplateId) ||
      listCustomTemplates().find((t) => t.id === initialTemplateId);
    if (tpl) {
      applyTemplate(engine, tpl);
      initialAppliedRef.current = true;
    }
  }, [engine, initialTemplateId]);

  // ─── follow-mode pan: scroll the wrap into view ────────────
  useEffect(() => {
    if (!followMode) return;
    const peer = engine.getCursors().find((c) => c.userId === followMode);
    if (!peer || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    wrapRef.current.scrollTo({
      left: Math.max(0, peer.x - rect.width / 2),
      top: Math.max(0, peer.y - rect.height / 2),
      behavior: "smooth",
    });
  }, [engine, followMode, roster.length]);

  // ─── pointer events ────────────────────────────────────────
  const drawingStrokeRef = useRef<Stroke | null>(null);
  const lastCursorPubRef = useRef<number>(0);

  const toLogicalPoint = useCallback((e: { clientX: number; clientY: number; pressure?: number }): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.clientWidth / engine.width;
    const sy = canvas.clientHeight / engine.height;
    return {
      x: (e.clientX - rect.left) / sx,
      y: (e.clientY - rect.top) / sy,
      p: e.pressure ?? 0.5,
      t: Date.now(),
    };
  }, [engine]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (tool === "select") return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const point = toLogicalPoint(e);
    if (tool === "text") {
      // Place a text draft at the click; commit on Enter
      const stroke = engine.beginStroke({
        tool: "text",
        color,
        size: Math.max(3, size),
        opacity,
        point,
        text: "",
      });
      setTextDraft({ x: point.x, y: point.y, value: "", strokeId: stroke.id });
      return;
    }
    const stroke = engine.beginStroke({ tool, color, size, opacity, point });
    drawingStrokeRef.current = stroke;
    syncRef.current?.publishBegin(stroke);
  }, [tool, color, size, opacity, toLogicalPoint, engine]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const point = toLogicalPoint(e);
    // Throttled cursor publish
    const now = Date.now();
    if (now - lastCursorPubRef.current > 50) {
      lastCursorPubRef.current = now;
      syncRef.current?.publishCursor(point.x, point.y, tool, drawingStrokeRef.current !== null);
    }
    if (!drawingStrokeRef.current) return;
    const stroke = drawingStrokeRef.current;
    engine.extendStroke(point);
    if (stroke.tool === "pen" || stroke.tool === "highlighter" || stroke.tool === "eraser" || stroke.tool === "laser") {
      syncRef.current?.publishExtendPoint(stroke.id, point);
    } else if (stroke.tool === "line" || stroke.tool === "rectangle" || stroke.tool === "ellipse" || stroke.tool === "arrow") {
      syncRef.current?.publishExtendShape(stroke.id, point);
    }
  }, [tool, toLogicalPoint, engine]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (tool === "text") return; // text draft commits on Enter
    const finalStroke = engine.endStroke();
    drawingStrokeRef.current = null;
    if (finalStroke && finalStroke.tool !== "laser") {
      syncRef.current?.publishFinalize(finalStroke);
    } else if (finalStroke && finalStroke.tool === "laser") {
      // We still send a finalize so peers can stop their prediction.
      syncRef.current?.publishFinalize(finalStroke);
    }
  }, [tool, engine]);

  const onPointerCancel = useCallback(() => {
    if (drawingStrokeRef.current) engine.cancelStroke();
    drawingStrokeRef.current = null;
  }, [engine]);

  // ─── overlay (cursors + presence) ──────────────────────────
  const drawOverlay = useCallback(() => {
    const o = overlayRef.current;
    if (!o) return;
    const ctx = o.getContext("2d");
    if (!ctx) return;
    const dpr = typeof window === "undefined" ? 1 : Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    if (o.width !== Math.round(engine.width * dpr) || o.height !== Math.round(engine.height * dpr)) {
      o.width = Math.round(engine.width * dpr);
      o.height = Math.round(engine.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.clearRect(0, 0, engine.width, engine.height);
    // Draw remote cursors with name labels.
    const cursors = engine.getCursors().filter((c) => c.userId !== userId);
    for (const c of cursors) drawCursor(ctx, c);
  }, [engine, userId]);

  useEffect(() => {
    const id = setInterval(drawOverlay, 80); // tick to fade laser/cursors
    return () => clearInterval(id);
  }, [drawOverlay]);

  // ─── keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const entry = engine.undo();
        if (entry?.kind === "add") {
          syncRef.current?.publishRemoval(entry.stroke.id, entry.stroke.layerId, entry.stroke.seq + 1);
        } else if (entry?.kind === "remove") {
          syncRef.current?.publishFinalize(entry.stroke);
        }
        return;
      }
      if (meta && (e.key === "y" || (e.shiftKey && e.key === "Z"))) {
        e.preventDefault();
        const entry = engine.redo();
        if (entry?.kind === "add") {
          syncRef.current?.publishFinalize(entry.stroke);
        } else if (entry?.kind === "remove") {
          syncRef.current?.publishRemoval(entry.stroke.id, entry.stroke.layerId, entry.stroke.seq + 1);
        }
        return;
      }
      // Tool hot-keys
      const map: Record<string, ToolKind> = {
        v: "select", p: "pen", h: "highlighter", e: "eraser",
        l: "line", r: "rectangle", o: "ellipse", a: "arrow",
        t: "text", k: "laser",
      };
      const next = map[e.key.toLowerCase()];
      if (next) setTool(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine]);

  // ─── exports ───────────────────────────────────────────────
  const exportAs = useCallback(async (kind: "png" | "svg" | "pdf") => {
    if (kind === "png") {
      downloadDataUrl(engine.exportPNG(), `whiteboard-${boardId}.png`);
    } else if (kind === "svg") {
      const blob = new Blob([engine.exportSVG()], { type: "image/svg+xml" });
      downloadBlob(blob, `whiteboard-${boardId}.svg`);
    } else {
      const blob = await engine.exportPDF();
      downloadBlob(blob, `whiteboard-${boardId}.pdf`);
    }
  }, [engine, boardId]);

  // ─── clear ─────────────────────────────────────────────────
  const onClear = useCallback(() => {
    if (typeof window !== "undefined" && !window.confirm("Clear the whole whiteboard for everyone?")) return;
    engine.clearAll();
    syncRef.current?.publishClear(Date.now());
  }, [engine]);

  // ─── template handling ─────────────────────────────────────
  const onApplyTemplate = useCallback((tpl: WhiteboardTemplate) => {
    applyTemplate(engine, tpl);
    setShowTemplates(false);
  }, [engine]);

  const onSaveAsTemplate = useCallback((name: string, description: string, category: TemplateCategory, icon: string) => {
    const tpl = captureTemplate(engine, { name, description, category, icon, author: displayName });
    saveCustomTemplate(tpl);
    setShowSavePanel(false);
  }, [engine, displayName]);

  // ─── PiP video refs ────────────────────────────────────────
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (localVideoRef.current && localVideoStream) localVideoRef.current.srcObject = localVideoStream;
  }, [localVideoStream]);
  useEffect(() => {
    if (remoteVideoRef.current && remoteVideoStream) remoteVideoRef.current.srcObject = remoteVideoStream;
  }, [remoteVideoStream]);

  // ─── derived ───────────────────────────────────────────────
  const activeCursorCount = useMemo(
    () => engine.getCursors().filter((c) => c.userId !== userId).length,
    [engine, roster.length],
  );

  // ─── RENDER ────────────────────────────────────────────────
  return (
    <div style={styles.root}>
      {/* Top toolbar */}
      <Toolbar
        tool={tool} setTool={setTool}
        color={color} setColor={setColor}
        size={size} setSize={setSize}
        opacity={opacity} setOpacity={setOpacity}
        canUndo={engine.canUndo()} canRedo={engine.canRedo()}
        onUndo={() => {
          const entry = engine.undo();
          if (entry?.kind === "add") syncRef.current?.publishRemoval(entry.stroke.id, entry.stroke.layerId, entry.stroke.seq + 1);
          else if (entry?.kind === "remove") syncRef.current?.publishFinalize(entry.stroke);
        }}
        onRedo={() => {
          const entry = engine.redo();
          if (entry?.kind === "add") syncRef.current?.publishFinalize(entry.stroke);
          else if (entry?.kind === "remove") syncRef.current?.publishRemoval(entry.stroke.id, entry.stroke.layerId, entry.stroke.seq + 1);
        }}
        onClear={onClear}
        onExport={exportAs}
        onToggleLayers={() => setShowLayers((v) => !v)}
        onToggleRoster={() => setShowRoster((v) => !v)}
        onToggleTemplates={() => setShowTemplates((v) => !v)}
        onToggleSave={() => setShowSavePanel((v) => !v)}
        onClose={onClose}
        status={status}
        latencyMs={latencyMs}
        peerCount={roster.length}
        activeCursorCount={activeCursorCount}
      />

      {/* Stage */}
      <div ref={wrapRef} style={styles.stage}>
        <div style={{ position: "relative", margin: "auto", width: engine.width, height: engine.height }}>
          <canvas
            ref={canvasRef}
            style={{ ...styles.canvas, cursor: cursorFor(tool) }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onPointerLeave={onPointerCancel}
          />
          <canvas ref={overlayRef} style={styles.overlay} />
          {/* Remote cursor labels rendered as DOM for crisp text */}
          <CursorLabels engine={engine} myId={userId} onFollow={(id) => setFollowMode((f) => f === id ? null : id)} followMode={followMode} />
          {/* Active text editing */}
          {textDraft && (
            <textarea
              autoFocus
              value={textDraft.value}
              onChange={(ev) => setTextDraft((td) => td ? { ...td, value: ev.target.value } : td)}
              onBlur={() => {
                const final = engine.commitText(textDraft.value || " ");
                if (final) syncRef.current?.publishFinalize(final);
                setTextDraft(null);
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Escape") {
                  engine.cancelStroke();
                  setTextDraft(null);
                }
                if (ev.key === "Enter" && !ev.shiftKey) {
                  ev.preventDefault();
                  const final = engine.commitText(textDraft.value || " ");
                  if (final) syncRef.current?.publishFinalize(final);
                  setTextDraft(null);
                }
              }}
              style={{
                position: "absolute",
                left: textDraft.x,
                top: textDraft.y,
                minWidth: 160,
                minHeight: 32,
                background: "rgba(255,255,255,0.85)",
                border: `2px dashed ${color}`,
                color,
                font: `${Math.max(3, size) * 4}px Inter, sans-serif`,
                padding: 4,
                resize: "both",
              }}
            />
          )}
        </div>
      </div>

      {/* PiP video */}
      {pipVisible && (remoteVideoStream || localVideoStream) && (
        <PiPVideo
          position={pipPosition}
          expanded={pipExpanded}
          onMove={() => setPipPosition(nextPipPosition)}
          onToggleExpand={() => setPipExpanded((v) => !v)}
          onClose={() => setPipVisible(false)}
          remoteRef={remoteVideoRef}
          localRef={localVideoRef}
          hasRemote={Boolean(remoteVideoStream)}
          hasLocal={Boolean(localVideoStream)}
          followingUser={followMode ? roster.find((r) => r.userId === followMode)?.name ?? null : null}
        />
      )}

      {!pipVisible && (remoteVideoStream || localVideoStream) && (
        <button onClick={() => setPipVisible(true)} style={styles.pipReopen} aria-label="Show video">
          <PictureInPicture2 size={16} /> Video
        </button>
      )}

      {/* Side panels */}
      {showLayers && <LayersPanel engine={engine} onClose={() => setShowLayers(false)} />}
      {showRoster && (
        <RosterPanel
          roster={roster}
          myId={userId}
          followMode={followMode}
          onFollow={(id) => setFollowMode((f) => f === id ? null : id)}
          onClose={() => setShowRoster(false)}
        />
      )}
      {showTemplates && (
        <TemplatesPanel
          onApply={onApplyTemplate}
          onClose={() => setShowTemplates(false)}
          onDeleteCustom={(id) => deleteCustomTemplate(id)}
        />
      )}
      {showSavePanel && (
        <SaveTemplatePanel
          onSave={onSaveAsTemplate}
          onClose={() => setShowSavePanel(false)}
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═════════════════════════════════════════════════════════════════

interface ToolbarProps {
  tool: ToolKind; setTool: (t: ToolKind) => void;
  color: string; setColor: (c: string) => void;
  size: number; setSize: (n: number) => void;
  opacity: number; setOpacity: (n: number) => void;
  canUndo: boolean; canRedo: boolean;
  onUndo: () => void; onRedo: () => void;
  onClear: () => void;
  onExport: (kind: "png" | "svg" | "pdf") => void;
  onToggleLayers: () => void;
  onToggleRoster: () => void;
  onToggleTemplates: () => void;
  onToggleSave: () => void;
  onClose?: () => void;
  status: "connecting" | "online" | "offline";
  latencyMs: number;
  peerCount: number;
  activeCursorCount: number;
}

function Toolbar(p: ToolbarProps): React.ReactElement {
  const [exportOpen, setExportOpen] = useState(false);
  return (
    <div style={styles.toolbar}>
      <div style={styles.toolGroup}>
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const active = p.tool === t.kind;
          return (
            <button
              key={t.kind}
              title={t.label}
              onClick={() => p.setTool(t.kind)}
              style={{ ...styles.toolBtn, ...(active ? styles.toolBtnActive : null) }}
              aria-pressed={active}
            >
              <Icon size={18} />
            </button>
          );
        })}
      </div>

      <div style={styles.divider} />

      <div style={styles.toolGroup}>
        {PALETTE_12.map((c) => (
          <button
            key={c.hex}
            title={c.name}
            onClick={() => p.setColor(c.hex)}
            aria-label={`Colour ${c.name}`}
            style={{
              ...styles.colorChip,
              background: c.hex,
              outline: p.color.toLowerCase() === c.hex.toLowerCase() ? "2px solid #0f172a" : "none",
            }}
          />
        ))}
        <input
          type="color"
          value={p.color}
          onChange={(e) => p.setColor(e.target.value)}
          style={styles.colorPicker}
          aria-label="Custom colour"
        />
      </div>

      <div style={styles.divider} />

      <div style={styles.toolGroup}>
        {BRUSH_SIZES.map((s) => (
          <button
            key={s}
            onClick={() => p.setSize(s)}
            title={`${s}px`}
            aria-pressed={p.size === s}
            style={{ ...styles.sizeBtn, ...(p.size === s ? styles.toolBtnActive : null) }}
          >
            <span style={{ width: s + 2, height: s + 2, borderRadius: 999, background: p.color, display: "inline-block" }} />
          </button>
        ))}
        <input
          type="range"
          min={0.5}
          max={64}
          step={0.5}
          value={p.size}
          onChange={(e) => p.setSize(Number(e.target.value))}
          style={{ width: 80 }}
          aria-label="Brush size"
        />
      </div>

      <div style={styles.divider} />

      <label style={styles.opacityLabel}>
        <span style={{ fontSize: 11, color: "#64748b" }}>Opacity</span>
        <input
          type="range" min={0.05} max={1} step={0.05}
          value={p.opacity}
          onChange={(e) => p.setOpacity(Number(e.target.value))}
          style={{ width: 80 }}
          aria-label="Opacity"
        />
      </label>

      <div style={styles.divider} />

      <div style={styles.toolGroup}>
        <button title="Undo (Ctrl+Z)" onClick={p.onUndo} disabled={!p.canUndo} style={styles.toolBtn}>
          <Undo2 size={18} />
        </button>
        <button title="Redo (Ctrl+Shift+Z)" onClick={p.onRedo} disabled={!p.canRedo} style={styles.toolBtn}>
          <Redo2 size={18} />
        </button>
        <button title="Clear board" onClick={p.onClear} style={styles.toolBtn}>
          <Trash2 size={18} />
        </button>
      </div>

      <div style={styles.divider} />

      <div style={styles.toolGroup}>
        <button title="Layers" onClick={p.onToggleLayers} style={styles.toolBtn}><Layers size={18} /></button>
        <button title="People" onClick={p.onToggleRoster} style={styles.toolBtn}><Users size={18} /> {p.peerCount}</button>
        <button title="Templates" onClick={p.onToggleTemplates} style={styles.toolBtn}><Sparkles size={18} /></button>
        <button title="Save as template" onClick={p.onToggleSave} style={styles.toolBtn}><Save size={18} /></button>
        <div style={{ position: "relative" }}>
          <button title="Export" onClick={() => setExportOpen((v) => !v)} style={styles.toolBtn}>
            <Download size={18} />
          </button>
          {exportOpen && (
            <div style={styles.exportMenu} onMouseLeave={() => setExportOpen(false)}>
              <button style={styles.menuItem} onClick={() => { p.onExport("png"); setExportOpen(false); }}>PNG</button>
              <button style={styles.menuItem} onClick={() => { p.onExport("svg"); setExportOpen(false); }}>SVG</button>
              <button style={styles.menuItem} onClick={() => { p.onExport("pdf"); setExportOpen(false); }}>PDF</button>
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={styles.statusBox}>
        <span style={{ ...styles.statusDot, background: statusColor(p.status) }} />
        <span style={{ fontSize: 12, color: "#0f172a" }}>{labelStatus(p.status)}</span>
        {p.status === "online" && p.latencyMs > 0 && (
          <span style={{ fontSize: 11, color: "#64748b" }}>{p.latencyMs}ms</span>
        )}
        <span style={{ fontSize: 11, color: "#64748b" }}>· {p.activeCursorCount} live</span>
      </div>

      {p.onClose && (
        <button title="Close whiteboard" onClick={p.onClose} style={styles.closeBtn}><X size={18} /></button>
      )}
    </div>
  );
}

// ─── cursor helpers ─────────────────────────────────────────

function drawCursor(ctx: CanvasRenderingContext2D, c: RemoteCursor): void {
  ctx.save();
  ctx.translate(c.x, c.y);
  // Arrow shape
  ctx.fillStyle = c.color;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 18);
  ctx.lineTo(5, 13);
  ctx.lineTo(11, 18);
  ctx.lineTo(13, 16);
  ctx.lineTo(7, 11);
  ctx.lineTo(13, 11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (c.isDrawing) {
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.strokeStyle = c.color;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

interface CursorLabelsProps {
  engine: WhiteboardEngine;
  myId: string;
  onFollow: (userId: string) => void;
  followMode: string | null;
}

function CursorLabels({ engine, myId, onFollow, followMode }: CursorLabelsProps): React.ReactElement {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => (n + 1) & 0xffff), 90);
    return () => clearInterval(id);
  }, []);
  const cursors = engine.getCursors().filter((c) => c.userId !== myId);
  return (
    <>
      {cursors.map((c) => (
        <div key={c.userId} style={{
          position: "absolute",
          left: c.x + 16,
          top: c.y + 4,
          background: c.color,
          color: "#fff",
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 6px",
          borderRadius: 6,
          whiteSpace: "nowrap",
          pointerEvents: "auto",
          cursor: "pointer",
          opacity: followMode === c.userId ? 1 : 0.85,
          boxShadow: followMode === c.userId ? "0 0 0 2px #0f172a" : "none",
        }} onClick={() => onFollow(c.userId)} title={`Follow ${c.name}`}>
          {c.name}
        </div>
      ))}
    </>
  );
}

// ─── PiP ────────────────────────────────────────────────────

interface PiPProps {
  position: "tl" | "tr" | "bl" | "br";
  expanded: boolean;
  onMove: () => void;
  onToggleExpand: () => void;
  onClose: () => void;
  remoteRef: React.RefObject<HTMLVideoElement | null>;
  localRef: React.RefObject<HTMLVideoElement | null>;
  hasRemote: boolean;
  hasLocal: boolean;
  followingUser: string | null;
}

function PiPVideo(p: PiPProps): React.ReactElement {
  const w = p.expanded ? 360 : 220;
  const h = (w * 9) / 16;
  const offset = 16;
  const corner: React.CSSProperties = {
    position: "absolute",
    width: w,
    height: h,
    boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
    borderRadius: 14,
    overflow: "hidden",
    background: "#0f172a",
    transition: "all 0.2s ease",
  };
  switch (p.position) {
    case "tl": Object.assign(corner, { top: offset + 60, left: offset }); break;
    case "tr": Object.assign(corner, { top: offset + 60, right: offset }); break;
    case "bl": Object.assign(corner, { bottom: offset, left: offset }); break;
    case "br": Object.assign(corner, { bottom: offset, right: offset }); break;
  }
  return (
    <div style={corner} role="region" aria-label="Picture in picture video">
      {p.hasRemote && (
        <video ref={p.remoteRef} autoPlay playsInline muted={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      {!p.hasRemote && p.hasLocal && (
        <video ref={p.localRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      {p.hasRemote && p.hasLocal && (
        <video ref={p.localRef} autoPlay playsInline muted style={{
          position: "absolute", bottom: 6, right: 6, width: 70, height: 50,
          objectFit: "cover", borderRadius: 6, border: "1.5px solid rgba(255,255,255,0.8)",
        }} />
      )}
      {p.followingUser && (
        <div style={{
          position: "absolute", top: 6, left: 6, padding: "3px 7px",
          background: "rgba(2,6,23,0.7)", color: "#fff", fontSize: 11,
          borderRadius: 999, display: "flex", alignItems: "center", gap: 4,
        }}>
          <Eye size={12} /> Following {p.followingUser}
        </div>
      )}
      <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 4 }}>
        <button title="Move" onClick={p.onMove} style={pipBtnStyle}><PictureInPicture size={12} /></button>
        <button title={p.expanded ? "Shrink" : "Expand"} onClick={p.onToggleExpand} style={pipBtnStyle}>
          {p.expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
        <button title="Hide" onClick={p.onClose} style={pipBtnStyle}><X size={12} /></button>
      </div>
    </div>
  );
}

const pipBtnStyle: React.CSSProperties = {
  background: "rgba(2,6,23,0.6)",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  width: 24,
  height: 24,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

function nextPipPosition(prev: "tl" | "tr" | "bl" | "br"): "tl" | "tr" | "bl" | "br" {
  const order: ("tl" | "tr" | "bl" | "br")[] = ["tl", "tr", "bl", "br"];
  return order[(order.indexOf(prev) + 1) % order.length]!;
}

// ─── side panels ───────────────────────────────────────────

interface LayersPanelProps {
  engine: WhiteboardEngine;
  onClose: () => void;
}

function LayersPanel({ engine, onClose }: LayersPanelProps): React.ReactElement {
  const [, tick] = useState(0);
  useEffect(() => engine.on(() => tick((n) => (n + 1) & 0xffff)), [engine]);
  return (
    <div style={styles.sidePanel}>
      <div style={styles.sidePanelHeader}>
        <span style={{ fontWeight: 700 }}>Layers</span>
        <button onClick={onClose} style={styles.iconBtn} aria-label="Close"><X size={14} /></button>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {engine.getLayers().slice().reverse().map((l) => (
          <div key={l.id} style={styles.layerRow}>
            <button onClick={() => engine.setLayerVisibility(l.id, !l.visible)} style={styles.iconBtn} title={l.visible ? "Hide" : "Show"}>
              {l.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            <button onClick={() => engine.setLayerLocked(l.id, !l.locked)} style={styles.iconBtn} title={l.locked ? "Unlock" : "Lock"}>
              {l.locked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
            <span style={{ flex: 1, fontSize: 12 }}>{l.name}</span>
            <span style={{ fontSize: 11, color: "#64748b" }}>{l.strokes.length} ✏️</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface RosterPanelProps {
  roster: RosterEntry[];
  myId: string;
  followMode: string | null;
  onFollow: (id: string) => void;
  onClose: () => void;
}

function RosterPanel({ roster, myId, followMode, onFollow, onClose }: RosterPanelProps): React.ReactElement {
  return (
    <div style={styles.sidePanel}>
      <div style={styles.sidePanelHeader}>
        <span style={{ fontWeight: 700 }}>People ({roster.length})</span>
        <button onClick={onClose} style={styles.iconBtn} aria-label="Close"><X size={14} /></button>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {roster.length === 0 && (
          <p style={{ padding: 12, fontSize: 12, color: "#64748b" }}>Just you here. Share the call to invite collaborators.</p>
        )}
        {roster.map((r) => (
          <div key={r.userId} style={styles.layerRow}>
            <span style={{ width: 14, height: 14, borderRadius: 999, background: r.color, display: "inline-block" }} />
            <span style={{ flex: 1, fontSize: 12 }}>{r.name}{r.userId === myId ? " (you)" : ""}</span>
            {r.userId !== myId && (
              <button
                onClick={() => onFollow(r.userId)}
                style={{ ...styles.iconBtn, background: followMode === r.userId ? "#0f172a" : "transparent", color: followMode === r.userId ? "#fff" : "#0f172a" }}
                title="Follow"
              >
                <Eye size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface TemplatesPanelProps {
  onApply: (tpl: WhiteboardTemplate) => void;
  onClose: () => void;
  onDeleteCustom: (id: string) => void;
}

function TemplatesPanel({ onApply, onClose, onDeleteCustom }: TemplatesPanelProps): React.ReactElement {
  const [tab, setTab] = useState<"builtin" | "community" | "custom">("builtin");
  const [custom, setCustom] = useState<WhiteboardTemplate[]>(() => listCustomTemplates());
  const list = tab === "builtin" ? BUILTIN_TEMPLATES : tab === "community" ? COMMUNITY_GALLERY : custom;
  return (
    <div style={{ ...styles.sidePanel, width: 320 }}>
      <div style={styles.sidePanelHeader}>
        <span style={{ fontWeight: 700 }}>Templates</span>
        <button onClick={onClose} style={styles.iconBtn} aria-label="Close"><X size={14} /></button>
      </div>
      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0" }}>
        {(["builtin", "community", "custom"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "8px 4px", fontSize: 12,
              background: tab === t ? "#f1f5f9" : "transparent",
              border: "none", borderBottom: tab === t ? "2px solid #0ea5e9" : "2px solid transparent",
              cursor: "pointer", color: "#0f172a",
              textTransform: "capitalize",
            }}
          >{t}</button>
        ))}
      </div>
      <div style={{ overflowY: "auto", flex: 1, padding: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {list.length === 0 && (
          <p style={{ gridColumn: "1 / -1", padding: 12, fontSize: 12, color: "#64748b" }}>No templates here yet.</p>
        )}
        {list.map((t) => (
          <div key={t.id} style={styles.templateCard}>
            <div style={{ fontSize: 28, lineHeight: 1 }}>{t.icon}</div>
            <div style={{ fontWeight: 600, fontSize: 12, marginTop: 4 }}>{t.name}</div>
            <div style={{ fontSize: 10, color: "#64748b", flex: 1 }}>{t.description}</div>
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              <button style={{ ...styles.smallBtn, flex: 1 }} onClick={() => onApply(t)}>
                Apply
              </button>
              {tab === "custom" && (
                <button
                  style={{ ...styles.smallBtn, background: "#fee2e2", color: "#b91c1c" }}
                  title="Delete"
                  onClick={() => {
                    const next = listCustomTemplates().filter((x) => x.id !== t.id);
                    onDeleteCustom(t.id);
                    setCustom(next);
                  }}
                ><Trash2 size={12} /></button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface SaveTemplatePanelProps {
  onSave: (name: string, description: string, category: TemplateCategory, icon: string) => void;
  onClose: () => void;
}

function SaveTemplatePanel({ onSave, onClose }: SaveTemplatePanelProps): React.ReactElement {
  const [name, setName] = useState("My Template");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("✨");
  const [category, setCategory] = useState<TemplateCategory>("custom");
  return (
    <div style={{ ...styles.sidePanel, width: 280 }}>
      <div style={styles.sidePanelHeader}>
        <span style={{ fontWeight: 700 }}>Save as template</span>
        <button onClick={onClose} style={styles.iconBtn} aria-label="Close"><X size={14} /></button>
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={styles.formLabel}>Name
          <input value={name} onChange={(e) => setName(e.target.value)} style={styles.formInput} />
        </label>
        <label style={styles.formLabel}>Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...styles.formInput, minHeight: 60 }} />
        </label>
        <label style={styles.formLabel}>Icon (emoji)
          <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} style={styles.formInput} />
        </label>
        <label style={styles.formLabel}>Category
          <select value={category} onChange={(e) => setCategory(e.target.value as TemplateCategory)} style={styles.formInput}>
            {(["custom", "flowchart", "wireframe", "mind-map", "kanban", "timeline", "brainstorm", "education"] as TemplateCategory[]).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <button
          style={{ ...styles.smallBtn, padding: "10px 12px", justifyContent: "center" }}
          onClick={() => onSave(name.trim() || "Untitled", description.trim(), category, icon || "✨")}
        >
          <Copy size={14} /> Save template
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════

function cursorFor(tool: ToolKind): string {
  switch (tool) {
    case "select": return "default";
    case "text": return "text";
    case "eraser": return "cell";
    case "laser": return "crosshair";
    default: return "crosshair";
  }
}

function statusColor(s: "connecting" | "online" | "offline"): string {
  if (s === "online") return "#10b981";
  if (s === "connecting") return "#f59e0b";
  return "#dc2626";
}

function labelStatus(s: "connecting" | "online" | "offline"): string {
  if (s === "online") return "Live";
  if (s === "connecting") return "Connecting…";
  return "Offline";
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ═════════════════════════════════════════════════════════════════
// STYLES (inline so the component drops into any host)
// ═════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: 600,
    display: "flex",
    flexDirection: "column",
    background: "#0f172a",
    color: "#e2e8f0",
    overflow: "hidden",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    padding: "8px 10px",
    background: "#f8fafc",
    color: "#0f172a",
    borderBottom: "1px solid #e2e8f0",
    zIndex: 5,
  },
  toolGroup: { display: "flex", alignItems: "center", gap: 4 },
  divider: { width: 1, height: 28, background: "#e2e8f0", margin: "0 4px" },
  toolBtn: {
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 8,
    padding: "6px 8px",
    cursor: "pointer",
    color: "#0f172a",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
  },
  toolBtnActive: {
    background: "#e0f2fe",
    borderColor: "#0ea5e9",
    color: "#0c4a6e",
  },
  sizeBtn: {
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 8,
    padding: "6px 8px",
    cursor: "pointer",
    minWidth: 28,
  },
  colorChip: {
    width: 18,
    height: 18,
    borderRadius: 999,
    border: "1px solid rgba(15,23,42,0.2)",
    cursor: "pointer",
  },
  colorPicker: {
    width: 26,
    height: 26,
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    background: "#fff",
    padding: 0,
    cursor: "pointer",
  },
  opacityLabel: { display: "inline-flex", alignItems: "center", gap: 6 },
  exportMenu: {
    position: "absolute",
    top: "calc(100% + 4px)",
    right: 0,
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    boxShadow: "0 6px 24px rgba(15,23,42,0.12)",
    minWidth: 100,
    zIndex: 8,
  },
  menuItem: {
    display: "block",
    width: "100%",
    padding: "8px 12px",
    textAlign: "left",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    color: "#0f172a",
  },
  statusBox: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    background: "#f1f5f9",
    borderRadius: 999,
  },
  statusDot: { width: 8, height: 8, borderRadius: 999, display: "inline-block" },
  closeBtn: {
    background: "#0f172a",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: 8,
    cursor: "pointer",
  },
  stage: {
    flex: 1,
    overflow: "auto",
    background: "#1e293b",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  canvas: {
    display: "block",
    background: "#fff",
    boxShadow: "0 4px 30px rgba(0,0,0,0.5)",
    touchAction: "none",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
  },
  pipReopen: {
    position: "absolute",
    bottom: 16,
    right: 16,
    background: "#0ea5e9",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    padding: "8px 14px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
  },
  sidePanel: {
    position: "absolute",
    top: 60,
    right: 12,
    bottom: 12,
    width: 240,
    background: "#ffffff",
    color: "#0f172a",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    boxShadow: "0 18px 60px rgba(15,23,42,0.25)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    zIndex: 10,
  },
  sidePanelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    borderBottom: "1px solid #e2e8f0",
  },
  iconBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 4,
    borderRadius: 6,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#0f172a",
  },
  layerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderBottom: "1px solid #f1f5f9",
  },
  templateCard: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: 8,
    display: "flex",
    flexDirection: "column",
    minHeight: 130,
  },
  smallBtn: {
    background: "#0ea5e9",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 11,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  formLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 11,
    color: "#475569",
  },
  formInput: {
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 12,
    color: "#0f172a",
    background: "#fff",
  },
};
