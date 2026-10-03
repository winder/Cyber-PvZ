import { MAP, STRUCTURES } from '../data/config';

// The 3D ground: rolling hills, flat pads under the bases, and ravines that
// drop straight down. Heights are only for looks. The game rules are 2D, and
// ravines block movement through the navigation grid (src/sim/nav.ts).

/** How deep the ravines go. */
export const RAVINE_DEPTH = 8;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Rolling hills: a few overlapping waves, about ±3 units. */
function hills(x: number, z: number): number {
  return (
    1.1 * Math.sin(x * 0.16 + 0.7) * Math.cos(z * 0.21 - 0.4) +
    0.8 * Math.sin(x * 0.07 - z * 0.12 + 2.1) +
    0.45 * Math.sin((x + z) * 0.29 + 1.3) +
    0.6 * Math.cos(z * 0.09 + x * 0.03)
  );
}

/** Pad height for each base: the hill height at its center. */
const PADS = MAP.structures.map((s) => ({
  x: s.x, z: s.z, r: STRUCTURES[s.id].radius, h: hills(s.x, s.z),
}));

/** Ground height ignoring ravines (what a giant strides across at). */
export function surfaceHeight(x: number, z: number): number {
  let h = hills(x, z);
  // Flatten into a level pad under each base, blending out smoothly.
  for (const p of PADS) {
    const t = smoothstep(p.r + 1.5, p.r + 6, Math.hypot(x - p.x, z - p.z));
    h = p.h + (h - p.h) * t;
  }
  return h;
}

export function inRavine(x: number, z: number): boolean {
  return MAP.ravines.some((r) => Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2);
}

/** Ground height, including the ravine floors. */
export function terrainHeight(x: number, z: number): number {
  return inRavine(x, z) ? -RAVINE_DEPTH : surfaceHeight(x, z);
}

/**
 * Where a ray first hits the ground, or null if it never does. Marches along
 * the ray then refines, so it works with hills and sheer ravine walls.
 */
export function rayToTerrain(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
): { x: number; z: number } | null {
  if (dy >= -1e-4) return null;
  const top = 4; // nothing is higher than this
  let t = Math.max(0, (oy - top) / -dy);
  const step = 0.15;
  const below = (tt: number) => oy + dy * tt <= terrainHeight(ox + dx * tt, oz + dz * tt);
  const limit = t + 600;
  while (t < limit && !below(t)) t += step;
  if (t >= limit) return null;
  let lo = Math.max(0, t - step), hi = t;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (below(mid)) hi = mid;
    else lo = mid;
  }
  return { x: ox + dx * hi, z: oz + dz * hi };
}
