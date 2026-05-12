"use client";

import { useCallback, useEffect, useRef } from "react";
import type { AudioBands } from "@/lib/useAudioAnalyser";
import type { SharedIdentityState } from "@/lib/ai/LudicLoopEngine";
import type { SentimentShaderParams } from "@/lib/ai/gemma_engine";

// ═══════════════════════════════════════════════════════════════
// HologramCanvas — Audio-Reactive Holographic WebGL2 Orb
// ═══════════════════════════════════════════════════════════════
//
// Renders a 3-D icosphere entirely in WebGL2 using custom GLSL
// vertex and fragment shaders.  Four audio frequency bands (sub-bass,
// bass, mid, treble) are uploaded as uniforms every frame so the
// geometry and surface lighting react in real-time to the WebRTC
// remote audio stream.
//
// Vertex shader responsibilities
//   • Displace each vertex radially by a sum of several octaves of
//     noise that are modulated by bass energy — the orb "breathes".
//   • Apply a warp offset driven by sub-bass for a low-frequency
//     "pulse" effect.
//
// Fragment shader responsibilities
//   • Phong-style lighting coloured by the entity hue.
//   • Scanline / chromatic-aberration glitch effect driven by treble
//     energy — fires only on a random subset of frames so it looks
//     intermittent rather than constant.
//   • Holographic Fresnel rim glow that brightens with mid energy.
//
// Packet-loss / signal degradation
//   The `useAudioAnalyser` hook decays the band values exponentially
//   toward zero when the stream disappears.  Because the shaders
//   react to those values the orb doesn't snap but instead fades and
//   calms gracefully — intentional cyberpunk aesthetic.
// ═══════════════════════════════════════════════════════════════

// ─── GLSL Sources ──────────────────────────────────────────────

const VERTEX_SHADER_SRC = /* glsl */ `#version 300 es
precision highp float;

in vec3 a_position;
in vec3 a_normal;

uniform mat4 u_mvp;
uniform mat3 u_normalMatrix;
uniform float u_time;
uniform float u_subBass;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_bondStrength;
uniform float u_pulseRate;

out vec3 v_normal;
out vec3 v_worldPos;
out float v_noiseVal;

// ── Simplex-like hash noise (3-D) ──
vec3 hash3(vec3 p) {
  p = fract(p * vec3(443.8975, 397.2973, 491.1871));
  p += dot(p, p.yxz + 19.19);
  return fract(vec3((p.x + p.y) * p.z, (p.x + p.z) * p.y, (p.y + p.z) * p.x));
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  vec3 g000 = hash3(i + vec3(0,0,0)) * 2.0 - 1.0;
  vec3 g100 = hash3(i + vec3(1,0,0)) * 2.0 - 1.0;
  vec3 g010 = hash3(i + vec3(0,1,0)) * 2.0 - 1.0;
  vec3 g110 = hash3(i + vec3(1,1,0)) * 2.0 - 1.0;
  vec3 g001 = hash3(i + vec3(0,0,1)) * 2.0 - 1.0;
  vec3 g101 = hash3(i + vec3(1,0,1)) * 2.0 - 1.0;
  vec3 g011 = hash3(i + vec3(0,1,1)) * 2.0 - 1.0;
  vec3 g111 = hash3(i + vec3(1,1,1)) * 2.0 - 1.0;
  float n000 = dot(g000, f - vec3(0,0,0));
  float n100 = dot(g100, f - vec3(1,0,0));
  float n010 = dot(g010, f - vec3(0,1,0));
  float n110 = dot(g110, f - vec3(1,1,0));
  float n001 = dot(g001, f - vec3(0,0,1));
  float n101 = dot(g101, f - vec3(1,0,1));
  float n011 = dot(g011, f - vec3(0,1,1));
  float n111 = dot(g111, f - vec3(1,1,1));
  return mix(
    mix(mix(n000,n100,u.x), mix(n010,n110,u.x), u.y),
    mix(mix(n001,n101,u.x), mix(n011,n111,u.x), u.y),
    u.z
  );
}

float fbm(vec3 p) {
  float val = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    val += amp * noise(p);
    p   *= 2.13;
    amp *= 0.5;
  }
  return val;
}

void main() {
  // Animate the noise field over time, modulated by bass energy.
  // u_pulseRate from sentiment scales the overall animation speed.
  float speed   = (0.55 + u_bass * 1.2) * u_pulseRate;
  float noiseSample = fbm(a_position * 2.4 + vec3(u_time * speed));

  // Radial displacement: sub-bass "breathes" the whole orb in/out.
  float breathe  = 1.0 + u_subBass * 0.28 + sin(u_time * 1.4) * 0.04;
  float displaceAmt = 0.18 * u_bass + 0.12 * u_mid;
  float radialDisp  = breathe + displaceAmt * noiseSample;

  vec3 displaced = a_position * radialDisp;

  // Bond strength inflates the base size.
  float scale = 0.85 + u_bondStrength * 0.25;
  displaced *= scale;

  v_normal   = normalize(u_normalMatrix * a_normal);
  v_worldPos = displaced;
  v_noiseVal = noiseSample;

  gl_Position = u_mvp * vec4(displaced, 1.0);
}
`;

const FRAGMENT_SHADER_SRC = /* glsl */ `#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_worldPos;
in float v_noiseVal;

uniform float u_time;
uniform float u_hue;
uniform float u_luminosity;
uniform float u_subBass;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform vec2  u_resolution;
uniform float u_hueShift;
uniform float u_glowBoost;
uniform float u_glitchIntensity;

out vec4 fragColor;

// ── HSL → RGB ──
vec3 hsl2rgb(float h, float s, float l) {
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
  float m = l - c * 0.5;
  vec3 rgb;
  if      (h < 1.0/6.0) rgb = vec3(c, x, 0);
  else if (h < 2.0/6.0) rgb = vec3(x, c, 0);
  else if (h < 3.0/6.0) rgb = vec3(0, c, x);
  else if (h < 4.0/6.0) rgb = vec3(0, x, c);
  else if (h < 5.0/6.0) rgb = vec3(x, 0, c);
  else                   rgb = vec3(c, 0, x);
  return rgb + m;
}

// ── Pseudo-random scalar (for glitch effects) ──
float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec3 N = normalize(v_normal);
  vec3 L = normalize(vec3(1.2, 2.0, 1.5));   // key light direction
  vec3 V = normalize(-v_worldPos);            // view direction (camera at origin)

  // ── Base colour driven by entity hue + audio + sentiment hue shift ──
  float hShift  = (u_hue / 360.0) + (u_hueShift / 360.0) + u_treble * 0.08;
  float satBase = 0.88 + u_mid * 0.12;
  float lumBase = clamp(0.45 + u_luminosity * 0.3 + u_bass * 0.1, 0.0, 1.0);

  vec3 baseColor = hsl2rgb(fract(hShift), satBase, lumBase);

  // ── Phong diffuse + specular ──
  float diff = max(dot(N, L), 0.0);
  vec3  H    = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 64.0 + u_mid * 80.0);

  vec3 lighting = baseColor * (0.18 + diff * 0.62)
                + vec3(1.0) * spec * (0.35 + u_mid * 0.5);

  // ── Holographic Fresnel rim glow (boosted by sentiment) ──
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.5);
  vec3  rimColor = hsl2rgb(fract(hShift + 0.15), 1.0, 0.75);
  lighting += rimColor * fresnel * (0.6 + u_mid * 0.8 + u_glowBoost * 0.6);

  // ── Noise-driven colour variation ──
  lighting = mix(lighting,
    hsl2rgb(fract(hShift + 0.33), satBase, lumBase + 0.1),
    clamp(v_noiseVal * 0.35 + u_bass * 0.2, 0.0, 1.0));

  // ── Treble-driven glitch scanlines (threshold lowered by sentiment glitch intensity) ──
  // Fire probabilistically so the effect is intermittent.
  float glitchThresh = max(0.1, 0.55 - u_glitchIntensity * 0.45);
  float rndFrame = rand(vec2(floor(u_time * 18.0), 0.0));
  if (u_treble > glitchThresh && rndFrame > 0.6) {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float slice      = floor(uv.y * 28.0);
    float sliceRand  = rand(vec2(slice, floor(u_time * 8.0)));
    float offsetX    = (sliceRand - 0.5) * u_treble * 0.04;
    float scanLine   = step(0.92, fract(uv.y * 80.0));

    // Chromatic aberration shift
    vec3 rChannel = hsl2rgb(fract(hShift + offsetX), satBase, lumBase + 0.2);
    vec3 bChannel = hsl2rgb(fract(hShift - offsetX + 0.5), satBase, lumBase + 0.2);
    lighting = mix(lighting,
      vec3(rChannel.r, lighting.g, bChannel.b),
      u_treble * 0.6 * (1.0 - scanLine));
    lighting = mix(lighting, vec3(0.9), scanLine * u_treble * 0.4);
  }

  // ── Alpha: Fresnel edge fade + sub-bass opacity boost ──
  float alpha = clamp(0.82 + fresnel * 0.15 + u_subBass * 0.08, 0.0, 1.0);

  fragColor = vec4(lighting, alpha);
}
`;

// ─── Icosphere geometry ────────────────────────────────────────

function buildIcosphere(subdivisions: number): { positions: Float32Array; normals: Float32Array } {
  const phi = (1 + Math.sqrt(5)) / 2;
  const initialVertices: [number, number, number][] = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ].map((v) => {
    const [x = 0, y = 0, z = 0] = v;
    const len = Math.sqrt(x * x + y * y + z * z);
    return [x / len, y / len, z / len] as [number, number, number];
  });
  const vertices: [number, number, number][] = [...initialVertices];

  let faces: [number, number, number][] = [
    [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
    [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
    [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
    [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
  ];

  const midCache = new Map<string, number>();
  const getMid = (a: number, b: number): number => {
    const key = `${Math.min(a, b)}_${Math.max(a, b)}`;
    if (midCache.has(key)) return midCache.get(key)!;
    const [ax, ay, az] = vertices[a]!;
    const [bx, by, bz] = vertices[b]!;
    const mx = ax + bx, my = ay + by, mz = az + bz;
    const len = Math.sqrt(mx * mx + my * my + mz * mz);
    const idx = vertices.length;
    vertices.push([mx / len, my / len, mz / len]);
    midCache.set(key, idx);
    return idx;
  };

  for (let s = 0; s < subdivisions; s++) {
    const next: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = getMid(a, b), bc = getMid(b, c), ca = getMid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }

  const pos: number[] = [];
  const nor: number[] = [];
  for (const [a, b, c] of faces) {
    for (const idx of [a, b, c]) {
      const [x, y, z] = vertices[idx]!;
      pos.push(x, y, z);
      nor.push(x, y, z); // normals = positions on unit sphere
    }
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor) };
}

// ─── WebGL helpers ─────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link error: ${info}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

// ── 4×4 matrix helpers (column-major, matching WebGL convention) ──
// All helpers are called only with Float32Arrays produced by the helpers
// themselves (known-valid 16-element arrays), so the non-null assertions
// on indexed access are safe — they are guarded by the loop bounds.

function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[i + k * 4]! * b[k + j * 4]!;
      out[i + j * 4] = sum;
    }
  }
  return out;
}

function mat4Perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f;
  m[10] = (far + near) * nf; m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

function mat4Translation(x: number, y: number, z: number): Float32Array {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

function mat4RotY(a: number): Float32Array {
  const m = new Float32Array(16);
  m[0] = Math.cos(a); m[2] = Math.sin(a);
  m[5] = 1;
  m[8] = -Math.sin(a); m[10] = Math.cos(a);
  m[15] = 1;
  return m;
}

function mat4RotX(a: number): Float32Array {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = Math.cos(a); m[6] = -Math.sin(a);
  m[9] = Math.sin(a); m[10] = Math.cos(a);
  m[15] = 1;
  return m;
}

function mat3FromMat4(m: Float32Array): Float32Array {
  return new Float32Array([m[0]!, m[1]!, m[2]!, m[4]!, m[5]!, m[6]!, m[8]!, m[9]!, m[10]!]);
}

// ─── Component ─────────────────────────────────────────────────

interface HologramCanvasProps {
  entity: SharedIdentityState;
  audioBands: AudioBands;
  sentimentParams?: SentimentShaderParams;
  width?: number;
  height?: number;
  className?: string;
}

export function HologramCanvas({
  entity,
  audioBands,
  sentimentParams,
  width = 380,
  height = 380,
  className,
}: HologramCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const vaoRef = useRef<WebGLVertexArrayObject | null>(null);
  const vertexCountRef = useRef(0);
  const rafRef = useRef<number>(0);
  const timeRef = useRef(0);

  // Keep a mutable ref for the latest props so the RAF loop always
  // reads current values without needing to be recreated every render.
  const propsRef = useRef({ entity, audioBands, sentimentParams });
  propsRef.current = { entity, audioBands, sentimentParams };

  // ── Initialise WebGL ──
  const initGL = useCallback((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
    if (!gl) {
      console.warn("[HologramCanvas] WebGL2 not supported; falling back to Canvas 2D.");
      return;
    }
    glRef.current = gl;

    const prog = createProgram(gl);
    progRef.current = prog;

    const { positions, normals } = buildIcosphere(4);
    vertexCountRef.current = positions.length / 3;

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    vaoRef.current = vao;

    const posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

    const norBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, norBuf);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    const norLoc = gl.getAttribLocation(prog, "a_normal");
    gl.enableVertexAttribArray(norLoc);
    gl.vertexAttribPointer(norLoc, 3, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }, []);

  // ── Render loop ──
  const render = useCallback(() => {
    const gl = glRef.current;
    const prog = progRef.current;
    const vao = vaoRef.current;
    if (!gl || !prog || !vao) {
      rafRef.current = requestAnimationFrame(render);
      return;
    }

    timeRef.current += 0.016;
    const t = timeRef.current;
    const { entity: ent, audioBands: ab, sentimentParams: sp } = propsRef.current;

    // Resolve sentiment uniform values (fall back to neutral if not provided).
    const pulseRate      = sp?.pulseRate      ?? 1.0;
    const hueShift       = sp?.hueShift       ?? 0.0;
    const glowBoost      = sp?.glowBoost      ?? 0.0;
    const glitchIntensity = sp?.glitchIntensity ?? 0.0;

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(prog);
    gl.bindVertexArray(vao);

    // Build MVP matrix: perspective × view (translate back) × rotation
    const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
    const proj = mat4Perspective(Math.PI / 3, aspect, 0.1, 100);
    const view = mat4Translation(0, 0, -3.2);
    const rotY = mat4RotY(t * 0.25);
    const rotX = mat4RotX(Math.sin(t * 0.15) * 0.2);
    const model = mat4Multiply(rotX, rotY);
    const mv = mat4Multiply(view, model);
    const mvp = mat4Multiply(proj, mv);
    const normalMat = mat3FromMat4(mv);

    const ul = (name: string) => gl.getUniformLocation(prog, name);
    gl.uniformMatrix4fv(ul("u_mvp"), false, mvp);
    gl.uniformMatrix3fv(ul("u_normalMatrix"), false, normalMat);
    gl.uniform1f(ul("u_time"), t);
    gl.uniform1f(ul("u_subBass"), ab.subBass);
    gl.uniform1f(ul("u_bass"), ab.bass);
    gl.uniform1f(ul("u_mid"), ab.mid);
    gl.uniform1f(ul("u_treble"), ab.treble);
    gl.uniform1f(ul("u_hue"), ent.hue);
    gl.uniform1f(ul("u_luminosity"), ent.luminosity);
    gl.uniform1f(ul("u_bondStrength"), ent.bondStrength);
    gl.uniform2f(ul("u_resolution"), gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(ul("u_pulseRate"), pulseRate);
    gl.uniform1f(ul("u_hueShift"), hueShift);
    gl.uniform1f(ul("u_glowBoost"), glowBoost);
    gl.uniform1f(ul("u_glitchIntensity"), glitchIntensity);

    gl.drawArrays(gl.TRIANGLES, 0, vertexCountRef.current);
    gl.bindVertexArray(null);

    rafRef.current = requestAnimationFrame(render);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      initGL(canvas);
    } catch (err) {
      console.error("[HologramCanvas] WebGL init failed:", err);
      return;
    }

    rafRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafRef.current);
      const gl = glRef.current;
      if (gl && progRef.current) gl.deleteProgram(progRef.current);
      if (gl && vaoRef.current) gl.deleteVertexArray(vaoRef.current);
      glRef.current = null;
      progRef.current = null;
      vaoRef.current = null;
    };
  }, [initGL, render]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{
        filter: `drop-shadow(0 0 40px hsla(${entity.hue}, 100%, 70%, 0.5))`,
      }}
    />
  );
}
