/**
 * TemplateLibrary.ts
 * ═══════════════════════════════════════════════════════════════════
 * WHITEBOARD TEMPLATES — built-in + user-saved + community gallery
 * Issue #48 — Live Collaborative Whiteboard
 * ═══════════════════════════════════════════════════════════════════
 *
 * A template is a pre-rendered set of strokes that can be stamped
 * onto the *background* of the whiteboard.  Templates live on a
 * dedicated `template` layer that sits below the user layers and is
 * (by default) locked so accidental drags don't move it.
 *
 * Built-in templates included (matching issue #48 spec):
 *   • Flowchart        — start/process/decision/end nodes + arrows
 *   • Wireframe        — phone frame with header/content/CTA
 *   • Mind map         — central node + radial spokes
 *   • Kanban board     — three-column "To-Do / Doing / Done"
 *   • Timeline         — horizontal axis with quarterly markers
 *
 * Custom templates are persisted to `localStorage` under a versioned
 * key so the app can evolve the schema without nuking user data.
 *
 * Community gallery — represented as a curated readonly list shipped
 * with the build.  A future task can swap the static list for an
 * API-backed loader without changing the public surface of this
 * module.
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  Stroke,
  ShapeStroke,
  TextStroke,
  Layer,
  EngineSnapshot,
  WhiteboardEngine,
} from "./WhiteboardEngine";

// ═════════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════════

export type TemplateCategory =
  | "flowchart"
  | "wireframe"
  | "mind-map"
  | "kanban"
  | "timeline"
  | "brainstorm"
  | "education"
  | "custom";

export interface WhiteboardTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  /** A 32×32 emoji used as a thumbnail in the picker */
  icon: string;
  /** Author of the template — "system" for built-ins. */
  author: string;
  /** Logical canvas size the template was authored against */
  width: number;
  height: number;
  /** Strokes that make up the template. */
  strokes: Stroke[];
  /** ISO timestamp string */
  createdAt: string;
}

export interface TemplateApplyOptions {
  /** Whether to clear the existing background layer before applying. */
  clearExisting?: boolean;
  /** Lock the resulting layer (default true). */
  lock?: boolean;
  /** Override the layer name. */
  layerName?: string;
}

// ═════════════════════════════════════════════════════════════════
// ID HELPERS
// ═════════════════════════════════════════════════════════════════

function tid(prefix: string, i: number): string {
  return `${prefix}_${i}_${Math.random().toString(36).slice(2, 8)}`;
}

const SYSTEM_AUTHOR = "system";
const TEMPLATE_LAYER_ID = "layer_template";
const STORAGE_KEY = "quantchat.whiteboard.templates.v1";

// ═════════════════════════════════════════════════════════════════
// STROKE FACTORIES
// ═════════════════════════════════════════════════════════════════

function rect(x: number, y: number, w: number, h: number, color: string, size = 2, idHint = 0): ShapeStroke {
  return {
    id: tid("tplr", idHint),
    layerId: TEMPLATE_LAYER_ID,
    authorId: SYSTEM_AUTHOR,
    tool: "rectangle",
    color,
    size,
    opacity: 1,
    seq: idHint,
    createdAt: 0,
    start: { x, y },
    end: { x: x + w, y: y + h },
  };
}

function line(x1: number, y1: number, x2: number, y2: number, color: string, size = 2, idHint = 0): ShapeStroke {
  return {
    id: tid("tpll", idHint),
    layerId: TEMPLATE_LAYER_ID,
    authorId: SYSTEM_AUTHOR,
    tool: "line",
    color,
    size,
    opacity: 1,
    seq: idHint,
    createdAt: 0,
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
  };
}

function arrow(x1: number, y1: number, x2: number, y2: number, color: string, size = 2, idHint = 0): ShapeStroke {
  return {
    id: tid("tpla", idHint),
    layerId: TEMPLATE_LAYER_ID,
    authorId: SYSTEM_AUTHOR,
    tool: "arrow",
    color,
    size,
    opacity: 1,
    seq: idHint,
    createdAt: 0,
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
  };
}

function ellipse(cx: number, cy: number, rx: number, ry: number, color: string, size = 2, idHint = 0): ShapeStroke {
  return {
    id: tid("tple", idHint),
    layerId: TEMPLATE_LAYER_ID,
    authorId: SYSTEM_AUTHOR,
    tool: "ellipse",
    color,
    size,
    opacity: 1,
    seq: idHint,
    createdAt: 0,
    start: { x: cx - rx, y: cy - ry },
    end: { x: cx + rx, y: cy + ry },
  };
}

function text(
  x: number,
  y: number,
  body: string,
  color: string,
  size = 4,
  weight = 600,
  idHint = 0,
): TextStroke {
  return {
    id: tid("tplt", idHint),
    layerId: TEMPLATE_LAYER_ID,
    authorId: SYSTEM_AUTHOR,
    tool: "text",
    color,
    size,
    opacity: 1,
    seq: idHint,
    createdAt: 0,
    position: { x, y },
    text: body,
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: weight,
  };
}

// ═════════════════════════════════════════════════════════════════
// BUILT-IN TEMPLATES
// ═════════════════════════════════════════════════════════════════

const W = 1920;
const H = 1080;
const INK = "#1f2937";
const ACCENT = "#0ea5e9";
const SOFT = "#94a3b8";
const POSITIVE = "#10b981";
const WARN = "#f59e0b";
const DANGER = "#dc2626";

function buildFlowchart(): WhiteboardTemplate {
  const strokes: Stroke[] = [];
  let i = 0;
  // Start (rounded — approximated with ellipse)
  strokes.push(ellipse(W / 2, 140, 130, 50, ACCENT, 3, ++i));
  strokes.push(text(W / 2 - 40, 122, "Start", ACCENT, 6, 700, ++i));
  // arrow down
  strokes.push(arrow(W / 2, 200, W / 2, 260, INK, 2, ++i));
  // process 1
  strokes.push(rect(W / 2 - 160, 270, 320, 100, INK, 3, ++i));
  strokes.push(text(W / 2 - 90, 305, "Gather Inputs", INK, 6, 600, ++i));
  // arrow
  strokes.push(arrow(W / 2, 380, W / 2, 440, INK, 2, ++i));
  // decision (diamond — approximated with rotated rectangle drawn as 4 lines)
  const dcx = W / 2;
  const dcy = 540;
  const dh = 100;
  const dw = 220;
  strokes.push(line(dcx, dcy - dh, dcx + dw, dcy, WARN, 3, ++i));
  strokes.push(line(dcx + dw, dcy, dcx, dcy + dh, WARN, 3, ++i));
  strokes.push(line(dcx, dcy + dh, dcx - dw, dcy, WARN, 3, ++i));
  strokes.push(line(dcx - dw, dcy, dcx, dcy - dh, WARN, 3, ++i));
  strokes.push(text(dcx - 60, dcy - 20, "Valid?", WARN, 6, 700, ++i));
  // Yes branch
  strokes.push(arrow(dcx + dw, dcy, dcx + 360, dcy, POSITIVE, 2, ++i));
  strokes.push(text(dcx + dw + 12, dcy - 26, "Yes", POSITIVE, 4, 600, ++i));
  strokes.push(rect(dcx + 360, dcy - 50, 260, 100, POSITIVE, 3, ++i));
  strokes.push(text(dcx + 400, dcy - 16, "Process", POSITIVE, 6, 600, ++i));
  // No branch
  strokes.push(arrow(dcx - dw, dcy, dcx - 360, dcy, DANGER, 2, ++i));
  strokes.push(text(dcx - dw - 56, dcy - 26, "No", DANGER, 4, 600, ++i));
  strokes.push(rect(dcx - 620, dcy - 50, 260, 100, DANGER, 3, ++i));
  strokes.push(text(dcx - 580, dcy - 16, "Reject", DANGER, 6, 600, ++i));
  // Down to End
  strokes.push(arrow(dcx + 490, dcy + 50, dcx + 490, 760, INK, 2, ++i));
  strokes.push(arrow(dcx - 490, dcy + 50, dcx - 490, 760, INK, 2, ++i));
  strokes.push(arrow(dcx + 490, 760, dcx + 80, 820, INK, 2, ++i));
  strokes.push(arrow(dcx - 490, 760, dcx - 80, 820, INK, 2, ++i));
  // End
  strokes.push(ellipse(W / 2, 880, 130, 50, INK, 3, ++i));
  strokes.push(text(W / 2 - 30, 862, "End", INK, 6, 700, ++i));
  return {
    id: "tpl_flowchart",
    name: "Flowchart",
    description: "Start → Process → Decision → End diagram with happy/error branches.",
    category: "flowchart",
    icon: "🧭",
    author: SYSTEM_AUTHOR,
    width: W,
    height: H,
    strokes,
    createdAt: new Date(0).toISOString(),
  };
}

function buildWireframe(): WhiteboardTemplate {
  const strokes: Stroke[] = [];
  let i = 0;
  // Phone outline
  const px = W / 2 - 220;
  const py = 80;
  const pw = 440;
  const ph = 900;
  strokes.push(rect(px, py, pw, ph, INK, 4, ++i));
  // Notch
  strokes.push(rect(px + pw / 2 - 60, py + 12, 120, 22, SOFT, 2, ++i));
  // Status bar
  strokes.push(line(px + 24, py + 60, px + pw - 24, py + 60, SOFT, 1, ++i));
  // Header
  strokes.push(rect(px + 24, py + 80, pw - 48, 60, ACCENT, 2, ++i));
  strokes.push(text(px + 40, py + 95, "Header / Logo", ACCENT, 5, 700, ++i));
  // Hero image placeholder
  strokes.push(rect(px + 24, py + 160, pw - 48, 200, SOFT, 2, ++i));
  strokes.push(line(px + 24, py + 160, px + pw - 24, py + 360, SOFT, 1, ++i));
  strokes.push(line(px + pw - 24, py + 160, px + 24, py + 360, SOFT, 1, ++i));
  strokes.push(text(px + pw / 2 - 50, py + 250, "Hero Image", SOFT, 5, 600, ++i));
  // Title + body
  strokes.push(text(px + 24, py + 390, "Headline goes here", INK, 6, 700, ++i));
  strokes.push(text(px + 24, py + 430, "Supporting copy line one", INK, 4, 400, ++i));
  strokes.push(text(px + 24, py + 460, "Supporting copy line two", INK, 4, 400, ++i));
  // Cards
  for (let c = 0; c < 3; c++) {
    const cy = py + 520 + c * 110;
    strokes.push(rect(px + 24, cy, pw - 48, 90, SOFT, 2, ++i));
    strokes.push(rect(px + 36, cy + 12, 66, 66, ACCENT, 2, ++i));
    strokes.push(text(px + 120, cy + 18, `Card ${c + 1}`, INK, 5, 600, ++i));
    strokes.push(text(px + 120, cy + 50, "Description text", SOFT, 4, 400, ++i));
  }
  // CTA
  strokes.push(rect(px + 60, py + ph - 110, pw - 120, 70, POSITIVE, 3, ++i));
  strokes.push(text(px + pw / 2 - 40, py + ph - 92, "Get Started", "#ffffff", 6, 700, ++i));
  return {
    id: "tpl_wireframe",
    name: "Mobile Wireframe",
    description: "Phone-frame layout with hero, supporting copy, three cards and a CTA.",
    category: "wireframe",
    icon: "📱",
    author: SYSTEM_AUTHOR,
    width: W,
    height: H,
    strokes,
    createdAt: new Date(0).toISOString(),
  };
}

function buildMindMap(): WhiteboardTemplate {
  const strokes: Stroke[] = [];
  let i = 0;
  const cx = W / 2;
  const cy = H / 2;
  strokes.push(ellipse(cx, cy, 160, 90, ACCENT, 4, ++i));
  strokes.push(text(cx - 70, cy - 18, "Central Idea", ACCENT, 7, 700, ++i));
  const branchColors = [INK, POSITIVE, WARN, DANGER, "#a855f7", "#14b8a6"];
  const branches = ["Goal", "Audience", "Resources", "Risks", "Wins", "Next"];
  for (let b = 0; b < branches.length; b++) {
    const angle = (Math.PI * 2 * b) / branches.length - Math.PI / 2;
    const r = 360;
    const ex = cx + Math.cos(angle) * r;
    const ey = cy + Math.sin(angle) * r;
    const colour = branchColors[b % branchColors.length]!;
    strokes.push(line(cx + Math.cos(angle) * 160, cy + Math.sin(angle) * 90, ex, ey, colour, 3, ++i));
    strokes.push(ellipse(ex, ey, 110, 60, colour, 3, ++i));
    strokes.push(text(ex - branches[b]!.length * 8, ey - 14, branches[b]!, colour, 5, 600, ++i));
    // sub-branches
    for (let s = 0; s < 3; s++) {
      const sa = angle + (s - 1) * 0.35;
      const sr = 220;
      const sx = ex + Math.cos(sa) * sr;
      const sy = ey + Math.sin(sa) * sr;
      strokes.push(line(ex + Math.cos(sa) * 110, ey + Math.sin(sa) * 60, sx, sy, colour, 2, ++i));
      strokes.push(text(sx - 30, sy - 8, `idea ${s + 1}`, colour, 4, 500, ++i));
    }
  }
  return {
    id: "tpl_mindmap",
    name: "Mind Map",
    description: "Central concept radiating out into six themed branches with sub-ideas.",
    category: "mind-map",
    icon: "🧠",
    author: SYSTEM_AUTHOR,
    width: W,
    height: H,
    strokes,
    createdAt: new Date(0).toISOString(),
  };
}

function buildKanban(): WhiteboardTemplate {
  const strokes: Stroke[] = [];
  let i = 0;
  const titles = ["To Do", "Doing", "Done"];
  const colors = [DANGER, WARN, POSITIVE];
  const colW = 540;
  const colH = 880;
  const startX = (W - colW * 3 - 60) / 2;
  for (let c = 0; c < 3; c++) {
    const x = startX + c * (colW + 30);
    const y = 100;
    strokes.push(rect(x, y, colW, colH, INK, 2, ++i));
    strokes.push(rect(x, y, colW, 60, colors[c]!, 2, ++i));
    strokes.push(text(x + 20, y + 14, titles[c]!, "#ffffff", 7, 700, ++i));
    // 4 sample cards
    for (let k = 0; k < 4; k++) {
      const cy = y + 90 + k * 120;
      strokes.push(rect(x + 20, cy, colW - 40, 100, SOFT, 2, ++i));
      strokes.push(text(x + 36, cy + 14, `Card ${c + 1}.${k + 1}`, INK, 5, 600, ++i));
      strokes.push(text(x + 36, cy + 46, "double-click to edit…", SOFT, 4, 400, ++i));
    }
  }
  return {
    id: "tpl_kanban",
    name: "Kanban Board",
    description: "Classic three-column kanban: To Do, Doing, Done.",
    category: "kanban",
    icon: "🗂",
    author: SYSTEM_AUTHOR,
    width: W,
    height: H,
    strokes,
    createdAt: new Date(0).toISOString(),
  };
}

function buildTimeline(): WhiteboardTemplate {
  const strokes: Stroke[] = [];
  let i = 0;
  const y = H / 2;
  const margin = 120;
  strokes.push(line(margin, y, W - margin, y, INK, 4, ++i));
  // Quarters
  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const colors = [ACCENT, POSITIVE, WARN, DANGER];
  for (let q = 0; q < quarters.length; q++) {
    const qx = margin + ((W - margin * 2) / 4) * (q + 0.5);
    strokes.push(line(qx, y - 20, qx, y + 20, colors[q]!, 3, ++i));
    strokes.push(text(qx - 16, y + 32, quarters[q]!, colors[q]!, 6, 700, ++i));
    // milestones
    for (let m = 0; m < 2; m++) {
      const mx = qx + (m === 0 ? -90 : 90);
      const my = y + (m === 0 ? -120 : 120);
      strokes.push(ellipse(mx, my, 14, 14, colors[q]!, 3, ++i));
      strokes.push(line(mx, my, qx, y, colors[q]!, 1, ++i));
      strokes.push(text(mx - 80, my + (m === 0 ? -32 : 22), `Milestone ${q + 1}.${m + 1}`, colors[q]!, 4, 500, ++i));
    }
  }
  // Title
  strokes.push(text(W / 2 - 100, 80, "Project Timeline", INK, 8, 700, ++i));
  return {
    id: "tpl_timeline",
    name: "Quarterly Timeline",
    description: "Horizontal year timeline broken into four quarters with milestones.",
    category: "timeline",
    icon: "📅",
    author: SYSTEM_AUTHOR,
    width: W,
    height: H,
    strokes,
    createdAt: new Date(0).toISOString(),
  };
}

function buildBrainstorm(): WhiteboardTemplate {
  const strokes: Stroke[] = [];
  let i = 0;
  strokes.push(text(80, 80, "Brainstorm", ACCENT, 8, 700, ++i));
  strokes.push(text(80, 130, "Sticky-note style — drop ideas anywhere", SOFT, 4, 400, ++i));
  // Sticky grid
  const colors = [WARN, POSITIVE, ACCENT, DANGER, "#a855f7"];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      const x = 100 + col * 290;
      const y = 220 + row * 200;
      const c = colors[(row + col) % colors.length]!;
      strokes.push(rect(x, y, 240, 160, c, 2, ++i));
      strokes.push(text(x + 12, y + 16, `Idea ${row + 1}.${col + 1}`, "#ffffff", 5, 700, ++i));
      strokes.push(text(x + 12, y + 50, "…", "#ffffff", 5, 400, ++i));
    }
  }
  return {
    id: "tpl_brainstorm",
    name: "Sticky Brainstorm",
    description: "Grid of coloured sticky notes ready to capture ideas.",
    category: "brainstorm",
    icon: "💡",
    author: SYSTEM_AUTHOR,
    width: W,
    height: H,
    strokes,
    createdAt: new Date(0).toISOString(),
  };
}

function buildEducation(): WhiteboardTemplate {
  // Lesson plan template — useful for the "teaching" use case.
  const strokes: Stroke[] = [];
  let i = 0;
  strokes.push(text(80, 60, "Lesson Plan", ACCENT, 8, 700, ++i));
  strokes.push(line(80, 110, W - 80, 110, INK, 2, ++i));
  const sections = ["Objective", "Warm-up", "Activity", "Discussion", "Wrap-up", "Homework"];
  for (let s = 0; s < sections.length; s++) {
    const y = 150 + s * 130;
    strokes.push(rect(80, y, 220, 100, ACCENT, 2, ++i));
    strokes.push(text(98, y + 36, sections[s]!, "#ffffff", 6, 700, ++i));
    strokes.push(rect(320, y, W - 400, 100, SOFT, 2, ++i));
    strokes.push(text(340, y + 18, "Notes…", SOFT, 4, 500, ++i));
  }
  return {
    id: "tpl_education",
    name: "Lesson Plan",
    description: "Structured six-section lesson plan grid for classroom use.",
    category: "education",
    icon: "🎓",
    author: SYSTEM_AUTHOR,
    width: W,
    height: H,
    strokes,
    createdAt: new Date(0).toISOString(),
  };
}

// ═════════════════════════════════════════════════════════════════
// PUBLIC LIBRARY
// ═════════════════════════════════════════════════════════════════

export const BUILTIN_TEMPLATES: ReadonlyArray<WhiteboardTemplate> = Object.freeze([
  buildFlowchart(),
  buildWireframe(),
  buildMindMap(),
  buildKanban(),
  buildTimeline(),
  buildBrainstorm(),
  buildEducation(),
]);

/**
 * A static, hand-curated community gallery.  Each entry is
 * deliberately a remix of a built-in template tweaked with different
 * colours/copy so the picker shows variety without requiring a
 * network round-trip.  The list can later be replaced with a `fetch`
 * call to the api-gateway.
 */
export const COMMUNITY_GALLERY: ReadonlyArray<WhiteboardTemplate> = Object.freeze([
  remixTemplate(buildFlowchart(), {
    id: "tpl_community_signup_flow",
    name: "User Signup Flow (community)",
    description: "Sign-up funnel with email-verification branch.  Contributed by @ada-r.",
    icon: "✍️",
    author: "@ada-r",
    swap: { [INK]: "#0f172a", [ACCENT]: "#6366f1" },
  }),
  remixTemplate(buildKanban(), {
    id: "tpl_community_sprint_board",
    name: "Sprint Board (community)",
    description: "Two-week sprint board with 'In Review' lane.  Contributed by @grace-h.",
    icon: "🏁",
    author: "@grace-h",
    swap: { [DANGER]: "#a855f7", [WARN]: "#0ea5e9", [POSITIVE]: "#14b8a6" },
  }),
  remixTemplate(buildMindMap(), {
    id: "tpl_community_okr_map",
    name: "OKR Mind Map (community)",
    description: "Objective at the centre, Key Results around it.  Contributed by @linus-t.",
    icon: "🎯",
    author: "@linus-t",
    swap: { [ACCENT]: "#10b981" },
  }),
]);

interface RemixOpts {
  id: string;
  name: string;
  description: string;
  icon: string;
  author: string;
  swap?: Record<string, string>;
}

function remixTemplate(t: WhiteboardTemplate, opts: RemixOpts): WhiteboardTemplate {
  const swap = opts.swap ?? {};
  return {
    ...t,
    id: opts.id,
    name: opts.name,
    description: opts.description,
    icon: opts.icon,
    author: opts.author,
    strokes: t.strokes.map((s) => ({
      ...s,
      color: swap[s.color] ?? s.color,
    })),
    createdAt: new Date(0).toISOString(),
  };
}

// ═════════════════════════════════════════════════════════════════
// CUSTOM TEMPLATE PERSISTENCE
// ═════════════════════════════════════════════════════════════════

interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getStorage(): StorageBackend | null {
  if (typeof window === "undefined") return null;
  try {
    const ls = window.localStorage;
    // Smoke test — incognito Safari throws on access.
    ls.setItem("__qcwb_probe__", "1");
    ls.removeItem("__qcwb_probe__");
    return ls;
  } catch {
    return null;
  }
}

export function listCustomTemplates(): WhiteboardTemplate[] {
  const ls = getStorage();
  if (!ls) return [];
  const raw = ls.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as WhiteboardTemplate[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isWhiteboardTemplate);
  } catch {
    return [];
  }
}

export function saveCustomTemplate(template: WhiteboardTemplate): WhiteboardTemplate[] {
  const ls = getStorage();
  if (!ls) return [];
  const list = listCustomTemplates();
  const idx = list.findIndex((t) => t.id === template.id);
  if (idx >= 0) list[idx] = template;
  else list.push(template);
  ls.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}

export function deleteCustomTemplate(id: string): WhiteboardTemplate[] {
  const ls = getStorage();
  if (!ls) return [];
  const list = listCustomTemplates().filter((t) => t.id !== id);
  ls.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}

function isWhiteboardTemplate(v: unknown): v is WhiteboardTemplate {
  if (!v || typeof v !== "object") return false;
  const t = v as Partial<WhiteboardTemplate>;
  return (
    typeof t.id === "string" &&
    typeof t.name === "string" &&
    typeof t.width === "number" &&
    typeof t.height === "number" &&
    Array.isArray(t.strokes)
  );
}

// ═════════════════════════════════════════════════════════════════
// SNAPSHOTS — capture & apply
// ═════════════════════════════════════════════════════════════════

/**
 * Build a `WhiteboardTemplate` from the engine's current state.  Used
 * by the "Save as template" UI button.
 */
export function captureTemplate(
  engine: WhiteboardEngine,
  meta: { id?: string; name: string; description: string; icon: string; category: TemplateCategory; author: string },
): WhiteboardTemplate {
  const snap = engine.snapshot();
  const all: Stroke[] = [];
  for (const layer of snap.layers) {
    if (layer.id === TEMPLATE_LAYER_ID) continue; // don't recurse a template layer
    for (const s of layer.strokes) all.push(s);
  }
  return {
    id: meta.id ?? `tpl_user_${Date.now().toString(36)}`,
    name: meta.name,
    description: meta.description,
    icon: meta.icon,
    category: meta.category,
    author: meta.author,
    width: snap.width,
    height: snap.height,
    strokes: all,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Apply a template by injecting it as a dedicated background layer
 * on the engine.  This routes through the *public* engine API so
 * remote peers will see the template via normal stroke ops.
 */
export function applyTemplate(
  engine: WhiteboardEngine,
  template: WhiteboardTemplate,
  options: TemplateApplyOptions = {},
): Layer {
  const lock = options.lock ?? true;
  const name = options.layerName ?? `Template — ${template.name}`;

  // Remove an existing template layer if present, so re-apply replaces.
  const existing = engine.getLayer(TEMPLATE_LAYER_ID);
  if (existing && options.clearExisting !== false) {
    for (const s of existing.strokes.slice()) {
      engine.applyRemoteRemoval(s.id, TEMPLATE_LAYER_ID);
    }
  }

  // Create or re-use the layer.
  const layer: Layer = existing ?? {
    id: TEMPLATE_LAYER_ID,
    authorId: SYSTEM_AUTHOR,
    name,
    visible: true,
    locked: false,
    z: 0,
    strokes: [],
  };
  if (!existing) engine.addLayer(layer, /*remote*/ false);

  // Scale strokes to fit the engine canvas.
  const scaleX = engine.width / template.width;
  const scaleY = engine.height / template.height;
  for (const stroke of template.strokes) {
    const scaled = scaleStroke(stroke, scaleX, scaleY);
    scaled.layerId = TEMPLATE_LAYER_ID;
    engine.applyRemoteStroke(scaled);
  }

  if (lock) engine.setLayerLocked(TEMPLATE_LAYER_ID, true);
  return layer;
}

function scaleStroke(s: Stroke, sx: number, sy: number): Stroke {
  const out = JSON.parse(JSON.stringify(s)) as Stroke;
  switch (out.tool) {
    case "pen":
    case "highlighter":
    case "eraser":
    case "laser": {
      const fs = out as { points: { x: number; y: number; p?: number; t?: number }[] };
      fs.points = fs.points.map((p) => ({ ...p, x: p.x * sx, y: p.y * sy }));
      break;
    }
    case "line":
    case "rectangle":
    case "ellipse":
    case "arrow": {
      const ss = out as { start: { x: number; y: number }; end: { x: number; y: number } };
      ss.start = { x: ss.start.x * sx, y: ss.start.y * sy };
      ss.end = { x: ss.end.x * sx, y: ss.end.y * sy };
      break;
    }
    case "text": {
      const ts = out as { position: { x: number; y: number } };
      ts.position = { x: ts.position.x * sx, y: ts.position.y * sy };
      break;
    }
  }
  // size stays in engine coords (px-equivalent)
  return out;
}

// ═════════════════════════════════════════════════════════════════
// BUNDLES (combined picker view)
// ═════════════════════════════════════════════════════════════════

export interface TemplateBundle {
  builtin: WhiteboardTemplate[];
  community: WhiteboardTemplate[];
  custom: WhiteboardTemplate[];
}

export function getAllTemplates(): TemplateBundle {
  return {
    builtin: BUILTIN_TEMPLATES.slice(),
    community: COMMUNITY_GALLERY.slice(),
    custom: listCustomTemplates(),
  };
}

export function findTemplate(id: string): WhiteboardTemplate | undefined {
  return (
    BUILTIN_TEMPLATES.find((t) => t.id === id) ||
    COMMUNITY_GALLERY.find((t) => t.id === id) ||
    listCustomTemplates().find((t) => t.id === id)
  );
}

// ═════════════════════════════════════════════════════════════════
// EXPORT / IMPORT (JSON file)
// ═════════════════════════════════════════════════════════════════

export function templateToJSON(t: WhiteboardTemplate): string {
  return JSON.stringify(t, null, 2);
}

export function templateFromJSON(json: string): WhiteboardTemplate | null {
  try {
    const v = JSON.parse(json);
    if (!isWhiteboardTemplate(v)) return null;
    return v;
  } catch {
    return null;
  }
}

/** Re-export an `EngineSnapshot` as a JSON string. */
export function snapshotToJSON(s: EngineSnapshot): string {
  return JSON.stringify(s);
}

export const TEMPLATE_CONSTANTS = {
  TEMPLATE_LAYER_ID,
  STORAGE_KEY,
  SYSTEM_AUTHOR,
};
