"use client";

import { useEffect, useRef, type ReactElement } from "react";
import * as THREE from "three";

// ═══════════════════════════════════════════════════════════════
// GiftRenderer3D
// ═══════════════════════════════════════════════════════════════
//
// A self-contained Three.js scene that plays a short (≈3.5s) 3D
// gift animation with a particle burst, then fades out. Rendered
// in an absolutely-positioned <canvas> that sits on top of the
// call / chat viewport.
//
// Supported renderer kinds (matches Gift.rendererKind in the DB):
//   "rose"  — a stylised rose with petal particles
//   "heart" — a plump heart that pulses and emits heart particles
//   "bolt"  — a lightning bolt that crackles and sparks
//   "crown" — a gilded crown with rising gold motes
//
// All meshes are procedurally generated (no network round-trip for
// assets), so the component has zero load dependencies beyond the
// three package itself. Particles are CPU-driven with a simple
// velocity + gravity model — cheap enough to run many simultaneous
// overlays without a GPU hit.
// ═══════════════════════════════════════════════════════════════

export type GiftRendererKind = "rose" | "heart" | "bolt" | "crown";

export interface GiftRenderer3DProps {
  kind: GiftRendererKind;
  /** Hex colors used for the main material and particles */
  palette: string[];
  /** Lifetime in ms; default 3500 */
  durationMs?: number;
  /** Fires exactly once when the animation finishes (on unmount too) */
  onComplete?: () => void;
  /** A11y label for screen readers */
  ariaLabel?: string;
  /**
   * If true, render a static "poster" frame without animation.
   * Used in gift catalog/thumbnail UI to avoid GPU cost for grids.
   */
  poster?: boolean;
}

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  ttl: number;     // seconds remaining
  totalTtl: number;
  spin: number;
}

function hexToColor(hex: string, fallback = 0xffffff): THREE.Color {
  try {
    return new THREE.Color(hex);
  } catch {
    return new THREE.Color(fallback);
  }
}

function pickColor(palette: string[], i: number, fallback: number): THREE.Color {
  if (!palette || palette.length === 0) return new THREE.Color(fallback);
  const c = palette[i % palette.length];
  return c ? hexToColor(c, fallback) : new THREE.Color(fallback);
}

// ─────────────────────────────────────────────────────────────
// Procedural geometries
// ─────────────────────────────────────────────────────────────

function buildRose(palette: string[]): THREE.Group {
  const g = new THREE.Group();
  const petalColor = pickColor(palette, 0, 0xe11d48);
  const petalGeom = new THREE.SphereGeometry(0.2, 12, 12);
  petalGeom.scale(1, 0.55, 0.35);
  const petalMat = new THREE.MeshStandardMaterial({
    color: petalColor,
    roughness: 0.35,
    metalness: 0.05,
    emissive: petalColor,
    emissiveIntensity: 0.18,
  });
  // Concentric rings of petals
  for (let ring = 0; ring < 3; ring++) {
    const count = 5 + ring * 3;
    const radius = 0.05 + ring * 0.12;
    const y = 0.05 + ring * 0.07;
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(petalGeom, petalMat);
      const a = (i / count) * Math.PI * 2 + ring * 0.3;
      m.position.set(Math.cos(a) * radius, y, Math.sin(a) * radius);
      m.rotation.set(Math.PI / 2 - 0.4 + ring * 0.15, a, 0);
      g.add(m);
    }
  }
  // Stem
  const stemGeom = new THREE.CylinderGeometry(0.035, 0.04, 0.9, 8);
  const stem = new THREE.Mesh(
    stemGeom,
    new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.8 }),
  );
  stem.position.y = -0.45;
  g.add(stem);
  return g;
}

function buildHeart(palette: string[]): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  // Classic heart curve
  shape.moveTo(0, 0.25);
  shape.bezierCurveTo(0, 0.5, -0.5, 0.5, -0.5, 0);
  shape.bezierCurveTo(-0.5, -0.3, 0, -0.5, 0, -0.7);
  shape.bezierCurveTo(0, -0.5, 0.5, -0.3, 0.5, 0);
  shape.bezierCurveTo(0.5, 0.5, 0, 0.5, 0, 0.25);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.25,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 4,
    curveSegments: 24,
  });
  geom.center();
  const color = pickColor(palette, 0, 0xec4899);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.2,
    emissive: color,
    emissiveIntensity: 0.35,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.scale.set(1.3, 1.3, 1.3);
  g.add(mesh);
  return g;
}

function buildBolt(palette: string[]): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0.05, 0.8);
  shape.lineTo(-0.35, 0.1);
  shape.lineTo(-0.05, 0.1);
  shape.lineTo(-0.2, -0.8);
  shape.lineTo(0.4, -0.1);
  shape.lineTo(0.1, -0.1);
  shape.lineTo(0.3, 0.8);
  shape.lineTo(0.05, 0.8);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  geom.center();
  const color = pickColor(palette, 0, 0xfacc15);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.25,
    metalness: 0.6,
    emissive: color,
    emissiveIntensity: 0.6,
  });
  g.add(new THREE.Mesh(geom, mat));
  return g;
}

function buildCrown(palette: string[]): THREE.Group {
  const g = new THREE.Group();
  const gold = pickColor(palette, 0, 0xfbbf24);
  const mat = new THREE.MeshStandardMaterial({
    color: gold,
    roughness: 0.2,
    metalness: 0.9,
    emissive: gold,
    emissiveIntensity: 0.25,
  });
  // Band
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.1, 16, 48), mat);
  band.rotation.x = Math.PI / 2;
  g.add(band);
  // Spikes
  for (let i = 0; i < 8; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 12), mat);
    const a = (i / 8) * Math.PI * 2;
    spike.position.set(Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5);
    g.add(spike);
  }
  // Jewels
  const jewelMat = new THREE.MeshStandardMaterial({
    color: pickColor(palette, 1, 0xfde68a),
    roughness: 0.1,
    metalness: 0.4,
    emissive: pickColor(palette, 1, 0xfde68a),
    emissiveIntensity: 0.55,
  });
  for (let i = 0; i < 4; i++) {
    const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), jewelMat);
    const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
    jewel.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
    g.add(jewel);
  }
  return g;
}

function buildGiftMesh(kind: GiftRendererKind, palette: string[]): THREE.Group {
  switch (kind) {
    case "rose": return buildRose(palette);
    case "heart": return buildHeart(palette);
    case "bolt": return buildBolt(palette);
    case "crown": return buildCrown(palette);
    default:
      return buildHeart(palette);
  }
}

// ─────────────────────────────────────────────────────────────
// Particle emitter
// ─────────────────────────────────────────────────────────────

function spawnParticle(
  scene: THREE.Scene,
  kind: GiftRendererKind,
  palette: string[],
): Particle {
  const color = pickColor(palette, Math.floor(Math.random() * palette.length), 0xffffff);
  let geom: THREE.BufferGeometry;
  if (kind === "bolt") {
    geom = new THREE.TetrahedronGeometry(0.05 + Math.random() * 0.04);
  } else if (kind === "crown") {
    geom = new THREE.OctahedronGeometry(0.045 + Math.random() * 0.03);
  } else if (kind === "rose") {
    geom = new THREE.SphereGeometry(0.05 + Math.random() * 0.04, 6, 6);
    geom.scale(1.3, 0.6, 0.6);
  } else {
    geom = new THREE.SphereGeometry(0.045 + Math.random() * 0.04, 8, 8);
  }
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.95,
  });
  const mesh = new THREE.Mesh(geom, mat);
  // Emit from a small sphere at origin, upward-biased
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.random() * Math.PI * 0.5;
  const speed = 0.8 + Math.random() * 1.2;
  const velocity = new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta) * speed,
    Math.cos(phi) * speed * 1.2,
    Math.sin(phi) * Math.sin(theta) * speed,
  );
  mesh.position.set(0, 0, 0);
  scene.add(mesh);
  return {
    mesh,
    velocity,
    ttl: 1.2 + Math.random() * 0.8,
    totalTtl: 1.8,
    spin: (Math.random() - 0.5) * 6,
  };
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function GiftRenderer3D(props: GiftRenderer3DProps): ReactElement {
  const { kind, palette, durationMs = 3500, onComplete, ariaLabel, poster = false } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 320;
    const height = container.clientHeight || 320;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0.2, 3);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(2, 3, 4);
    scene.add(key);
    const fill = new THREE.PointLight(pickColor(palette, 0, 0xffffff), 0.8, 10);
    fill.position.set(-2, -1, 2);
    scene.add(fill);

    const gift = buildGiftMesh(kind, palette);
    scene.add(gift);

    const particles: Particle[] = [];

    // ── Resize handling
    const onResize = () => {
      const w = container.clientWidth || width;
      const h = container.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    let raf = 0;
    const start = performance.now();
    let lastFrame = start;

    const finish = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete?.();
    };

    const animate = () => {
      const now = performance.now();
      const dt = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;
      const elapsed = now - start;
      const t = Math.min(elapsed / durationMs, 1);

      if (!poster) {
        // Ease in: scale up, spin, then pulse
        const popScale = t < 0.25 ? t / 0.25 : 1;
        const pulse = 1 + Math.sin(elapsed / 180) * 0.05;
        gift.scale.setScalar(popScale * pulse);
        gift.rotation.y += dt * 1.1;
        if (kind === "bolt") gift.rotation.z = Math.sin(elapsed / 60) * 0.08;

        // Emit particles for the first ~60% of the animation
        if (t < 0.6 && Math.random() < 0.9) {
          for (let i = 0; i < 3; i++) {
            particles.push(spawnParticle(scene, kind, palette));
          }
        }

        // Update particles (filter in-place, single pass)
        let write = 0;
        for (let read = 0; read < particles.length; read++) {
          const p = particles[read];
          if (!p) continue;
          p.ttl -= dt;
          if (p.ttl <= 0) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            (p.mesh.material as THREE.Material).dispose();
            continue;
          }
          p.velocity.y -= 1.6 * dt; // soft gravity
          p.mesh.position.addScaledVector(p.velocity, dt);
          p.mesh.rotation.x += p.spin * dt;
          p.mesh.rotation.y += p.spin * dt * 0.5;
          const mat = p.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = Math.max(0, p.ttl / p.totalTtl);
          particles[write++] = p;
        }
        particles.length = write;

        // Fade the main mesh near the end
        if (t > 0.85) {
          const fade = 1 - (t - 0.85) / 0.15;
          gift.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              const m = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
              m.transparent = true;
              m.opacity = fade;
            }
          });
        }

        if (t >= 1) {
          finish();
        }
      } else {
        gift.scale.setScalar(1);
        gift.rotation.y += dt * 0.6;
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      // Dispose everything to avoid GPU leaks
      for (const p of particles) {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
      }
      gift.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry.dispose();
          const m = mesh.material;
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
          else (m as THREE.Material).dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      finish();
    };
  }, [kind, palette, durationMs, onComplete, poster]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel ?? `${kind} gift animation`}
      style={{
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}

export default GiftRenderer3D;
