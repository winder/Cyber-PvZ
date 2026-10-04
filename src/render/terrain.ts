import { STRUCTURES, type MapDef } from '../data/config';

// The 3D ground for a map: rolling hills, flat pads under the bases, and
// ravines carved into it. Heights are only for looks. The game rules are 2D,
// and ravines block movement through the navigation grid (src/sim/nav.ts).

/** How deep the ravines go. */
export const RAVINE_DEPTH = 8;
/** How wide the cliff face is, from the lip to the floor. */
const CLIFF_WIDTH = 1.4;
/** Rounded ravine ends. */
const CORNER = 1.2;

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

/**
 * How much a crater changes the ground at distance `t` (in crater radii) from
 * its middle: a bowl down to about a third of its radius deep, a raised rim
 * of thrown-up earth, then back to normal.
 */
function crater(t: number, r: number): number {
  if (t >= 1.6) return 0;
  const depth = Math.min(1.6, r * 0.35), rim = Math.min(0.6, r * 0.15);
  if (t < 1) return -depth * (1 - t * t) + rim * t * t * t * t;
  return rim * (1 - smoothstep(1, 1.6, t));
}

/** Gentle wobble so ravine edges look natural rather than ruler-straight. */
function edgeWobble(x: number, z: number): number {
  // Always 0–0.7, so the hole never pokes outside the area zombies can't cross.
  return 0.35 + 0.25 * Math.sin(x * 1.3 + z * 0.4) * Math.cos(z * 1.7 - x * 0.6) + 0.1 * Math.sin(x * 3.1 - z * 2.3);
}

export class Terrain {
  private readonly pads: { x: number; z: number; r: number; h: number }[];

  constructor(readonly map: MapDef) {
    this.pads = map.structures.map((s) => ({
      x: s.x, z: s.z, r: STRUCTURES[s.id].radius, h: this.natural(s.x, s.z),
    }));
  }

  /** Rolling hills, and the map's big hill (mound) if it has one. */
  private natural(x: number, z: number): number {
    let h = hills(x, z) * this.map.hills;
    const m = this.map.mound;
    if (m) {
      // Rises out of the hills to a flat top a third of its width across.
      const up = 1 - smoothstep(m.r * 0.32, m.r, Math.hypot(x - m.x, z - m.z));
      h += (m.height - h) * up;
    }
    for (const c of this.map.craters ?? []) h += crater(Math.hypot(x - c.x, z - c.z) / c.r, c.r);
    return h;
  }

  /** How burnt the ground is (0 to 1): blackest in the middle of a crater. */
  scorch(x: number, z: number): number {
    let s = 0;
    for (const c of this.map.craters ?? []) s = Math.max(s, 1 - smoothstep(0.4, 1.15, Math.hypot(x - c.x, z - c.z) / c.r));
    return s;
  }

  /** Ground height ignoring ravines (what flyers and giants pass over). */
  surfaceHeight(x: number, z: number): number {
    let h = this.natural(x, z);
    // Flatten into a level pad under each base, blending out smoothly.
    for (const p of this.pads) {
      const t = smoothstep(p.r + 1.5, p.r + 6, Math.hypot(x - p.x, z - p.z));
      h = p.h + (h - p.h) * t;
    }
    return h;
  }

  /**
   * How far (x, z) is inside a ravine's edge (negative = outside). Ravines are
   * rounded rectangles with wobbly edges, always inside their blocked area.
   */
  ravineDepthInside(x: number, z: number): number {
    let best = -Infinity;
    for (const r of this.map.ravines) {
      const qx = Math.abs(x - r.x) - (r.w / 2 - CORNER), qz = Math.abs(z - r.z) - (r.d / 2 - CORNER);
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - CORNER;
      best = Math.max(best, -outside - edgeWobble(x, z));
    }
    return best;
  }

  inRavine(x: number, z: number): boolean {
    return this.ravineDepthInside(x, z) > 0;
  }

  /** Ground height, including the ravines: the ground breaks off and drops down a cliff. */
  terrainHeight(x: number, z: number): number {
    const top = this.surfaceHeight(x, z);
    const inside = this.ravineDepthInside(x, z);
    if (inside <= 0) return top;
    // Steepest right at the lip, easing onto the floor.
    const f = Math.min(1, inside / CLIFF_WIDTH);
    const drop = Math.sin((f * Math.PI) / 2);
    // A few rough ledges on the way down.
    const rough = Math.sin(x * 2.7 + z * 1.9) * Math.sin(z * 3.3 - x * 1.1) * 0.5 * Math.sin(f * Math.PI);
    return top + (-RAVINE_DEPTH - top) * drop + rough;
  }

  /**
   * Where a ray first hits the ground, or null if it never does. Marches along
   * the ray then refines, so it works with hills and sheer ravine walls.
   */
  rayToTerrain(
    ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  ): { x: number; z: number } | null {
    if (dy >= -1e-4) return null;
    const top = 4; // nothing is higher than this
    let t = Math.max(0, (oy - top) / -dy);
    const step = 0.15;
    const below = (tt: number) => oy + dy * tt <= this.terrainHeight(ox + dx * tt, oz + dz * tt);
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
}
