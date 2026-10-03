import {
  Color3, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3, VertexBuffer,
} from '@babylonjs/core';
import { UNIT } from './blockModel';

// ZomWes 8000's hair: smooth, glossy corkscrew curls. Deliberately the
// opposite of everything else in the game, which is blocky.
//
// Built in "head joint" space, in skin units: the head box spans
// x -4..4, y 0..8, z -4..4, and the face looks toward +z.

const BROWNS = ['#3f220e', '#4f2b12', '#5e3417', '#6d3e1c', '#7c4a24', '#8b582d', '#6a3a1a'];

/** Seeded random so the hairdo is the same every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const v = (x: number, y: number, z: number) => new Vector3(x * UNIT, y * UNIT, z * UNIT);

/**
 * A ringlet: arcs out over the edge of the head from (ax, az), then spirals
 * down to shoulder length, widening as it goes.
 */
function ringletPath(ax: number, az: number, bottom: number, turns: number, phase: number, flare: number): Vector3[] {
  const len = Math.hypot(ax, az) || 1;
  const ox = ax / len, oz = az / len; // outward
  // Two axes across the spiral.
  const ux = -oz, uz = ox;
  const pts: Vector3[] = [];
  // Root: from the scalp, curving over the edge.
  const rootIn = 0.75;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const a = (t * Math.PI) / 2;
    pts.push(v(
      ax * (rootIn + (1 - rootIn) * Math.sin(a)) + ox * 0.6 * Math.sin(a),
      8.4 - 1.2 * (1 - Math.cos(a)),
      az * (rootIn + (1 - rootIn) * Math.sin(a)) + oz * 0.6 * Math.sin(a),
    ));
  }
  const top = 7.2;
  const steps = 110;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const y = top + (bottom - top) * t;
    const r = 0.45 + 0.65 * t;
    const ang = phase + t * turns * Math.PI * 2;
    // Spiral axis drifts outward toward the shoulders.
    const cx = ax + ox * (0.6 + flare * t * t), cz = az + oz * (0.6 + flare * t * t);
    const spinIn = Math.min(1, t * 6); // ease into the spiral
    pts.push(v(
      cx + (ux * Math.cos(ang) + ox * Math.sin(ang)) * r * spinIn,
      y,
      cz + (uz * Math.cos(ang) + oz * Math.sin(ang)) * r * spinIn,
    ));
  }
  return pts;
}

/** A flat "snail" curl lying on the crown. */
function spiralPath(cx: number, cz: number, y: number, size: number, phase: number, dir: number): Vector3[] {
  const pts: Vector3[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = phase + dir * t * Math.PI * 3.2;
    const r = size * (1 - 0.85 * t);
    pts.push(v(cx + Math.cos(ang) * r, y + Math.sin(t * Math.PI) * 0.7 + t * 0.4, cz + Math.sin(ang) * r));
  }
  return pts;
}

/** A small loop of fringe hanging over the forehead. */
function fringePath(x: number, phase: number): Vector3[] {
  const pts: Vector3[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = phase + t * Math.PI * 2.6;
    pts.push(v(x + Math.cos(ang) * 0.55 * (1 - 0.3 * t), 8.3 - t * 1.5 + Math.sin(ang) * 0.35, 4.2 + t * 0.5 + Math.sin(ang) * 0.4));
  }
  return pts;
}

function tube(scene: Scene, name: string, path: Vector3[], r0: number, r1: number, color: Color3): Mesh {
  const n = path.length;
  const mesh = MeshBuilder.CreateTube(name, {
    path,
    tessellation: 9,
    cap: Mesh.CAP_ALL,
    radiusFunction: (i) => (r0 + (r1 - r0) * (i / (n - 1))) * UNIT,
  }, scene);
  // Darker at the roots, lighter toward the tips, for depth.
  const pos = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < pos.length; i += 3) {
    minY = Math.min(minY, pos[i]);
    maxY = Math.max(maxY, pos[i]);
  }
  const colors: number[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    const t = (pos[i + 1] - minY) / (maxY - minY || 1);
    const shade = 1.15 - 0.45 * t;
    colors.push(color.r * shade, color.g * shade, color.b * shade, 1);
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
  return mesh;
}

/** Build the whole hairdo as one mesh (one draw call). */
export function buildCurlyHair(scene: Scene, name: string): Mesh {
  const rand = rng(8000);
  const pick = () => Color3.FromHexString(BROWNS[Math.floor(rand() * BROWNS.length)]);
  const parts: Mesh[] = [];
  let k = 0;

  // Ringlets around the back and sides, two layers deep.
  const anchors: [number, number, number][] = []; // x, z, layer
  for (let x = -4; x <= 4.01; x += 1.15) anchors.push([x, -4.3, 0]);
  for (let x = -3.4; x <= 3.5; x += 1.15) anchors.push([x, -5.0, 1]);
  for (const side of [-1, 1]) {
    for (let z = -3.4; z <= 2.8; z += 1.2) anchors.push([side * 4.3, z, 0]);
    for (let z = -2.8; z <= 2.2; z += 1.25) anchors.push([side * 5.0, z, 1]);
    anchors.push([side * 4.1, 3.9, 0]); // framing the face
  }
  for (const [x, z, layer] of anchors) {
    const bottom = -2.2 - rand() * 1.6 + layer * 0.8;
    const turns = 4.5 + rand() * 1.5;
    const path = ringletPath(x, z, bottom, turns, rand() * Math.PI * 2, 1.2 + rand() * 0.8 + layer * 0.5);
    parts.push(tube(scene, `${name}-ringlet${k++}`, path, 0.42, 0.2, pick()));
  }

  // Crown: spiral curls in two layers so no scalp shows.
  for (const [cx, cz] of [[-2.6, -2.6], [0, -2.8], [2.6, -2.6], [-2.8, 0], [0, 0], [2.8, 0], [-2.6, 2.4], [0, 2.6], [2.6, 2.4]]) {
    parts.push(tube(scene, `${name}-crown${k++}`, spiralPath(cx + (rand() - 0.5), cz + (rand() - 0.5), 8.1, 1.6, rand() * 6, rand() < 0.5 ? 1 : -1), 0.38, 0.18, pick()));
  }
  for (const [cx, cz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.3], [1.4, 1.3], [0, -3.6], [-3.6, -1.2], [3.6, -1.2]]) {
    parts.push(tube(scene, `${name}-crown${k++}`, spiralPath(cx, cz, 8.7, 1.3, rand() * 6, rand() < 0.5 ? 1 : -1), 0.34, 0.16, pick()));
  }

  // Fringe over the forehead (stops above the visor).
  for (let x = -3.3; x <= 3.4; x += 1.1) {
    parts.push(tube(scene, `${name}-fringe${k++}`, fringePath(x, rand() * 6), 0.3, 0.14, pick()));
  }

  const hair = Mesh.MergeMeshes(parts, true, true)!;
  hair.name = name;
  hair.isPickable = false;
  hair.material = hairMaterial(scene);
  return hair;
}

function hairMaterial(scene: Scene): StandardMaterial {
  const existing = scene.getMaterialByName('curlyHair') as StandardMaterial | null;
  if (existing) return existing;
  const m = new StandardMaterial('curlyHair', scene);
  m.diffuseColor = new Color3(1, 1, 1); // vertex colors do the browns
  m.specularColor = new Color3(0.6, 0.45, 0.3);
  m.specularPower = 26;
  m.emissiveColor = new Color3(0.1, 0.06, 0.03);
  return m;
}
