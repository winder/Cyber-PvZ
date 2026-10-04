import { PLANTS, type PlantId } from '../data/config';

// Plant footprints. Most plants are round; walls are long rectangles that can
// be turned. Angles are radians, 0 = the wall runs east–west.

export type Shape =
  | { kind: 'circle'; r: number }
  | { kind: 'rect'; halfLength: number; halfThickness: number };

export function plantShape(type: PlantId): Shape {
  const def = PLANTS[type];
  if (def.wall) return { kind: 'rect', halfLength: def.wall.length / 2, halfThickness: def.wall.thickness / 2 };
  return { kind: 'circle', r: def.radius };
}

/** Can this plant be turned? */
export function isRotatable(type: PlantId): boolean {
  return !!PLANTS[type].wall;
}

/** Radius of a circle that contains the whole plant. */
export function boundingRadius(type: PlantId): number {
  const s = plantShape(type);
  return s.kind === 'circle' ? s.r : Math.hypot(s.halfLength, s.halfThickness);
}

/** How thick the plant is for a zombie trying to get through it. */
export function thicknessAcross(type: PlantId): number {
  const s = plantShape(type);
  return s.kind === 'circle' ? 2 * s.r : 2 * s.halfThickness;
}

/** Distance from a point to the edge of a plant (0 if the point is inside). */
export function distanceToPlant(
  p: { type: PlantId; x: number; z: number; angle: number }, px: number, pz: number,
): number {
  const s = plantShape(p.type);
  const dx = px - p.x, dz = pz - p.z;
  if (s.kind === 'circle') return Math.max(0, Math.hypot(dx, dz) - s.r);
  // Into the wall's own frame: along its length (u) and across it (v).
  const c = Math.cos(p.angle), sn = Math.sin(p.angle);
  const u = dx * c + dz * sn, v = -dx * sn + dz * c;
  return Math.hypot(Math.max(Math.abs(u) - s.halfLength, 0), Math.max(Math.abs(v) - s.halfThickness, 0));
}

/**
 * Points covering a plant's footprint (inside and around the edge), for
 * placement checks. They sit a hair inside the edge so plants may touch.
 */
export function footprintPoints(type: PlantId, x: number, z: number, angle: number): [number, number][] {
  const s = plantShape(type);
  const pts: [number, number][] = [];
  const step = 0.25, inset = 0.03;
  if (s.kind === 'circle') {
    const r = s.r - inset;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) pts.push([x + Math.cos(a) * r, z + Math.sin(a) * r]);
    for (let dx = -r; dx <= r; dx += step) {
      for (let dz = -r; dz <= r; dz += step) if (dx * dx + dz * dz <= r * r) pts.push([x + dx, z + dz]);
    }
    return pts;
  }
  const c = Math.cos(angle), sn = Math.sin(angle);
  const hl = s.halfLength - inset, ht = s.halfThickness - inset;
  const nu = Math.ceil((2 * hl) / step), nv = Math.ceil((2 * ht) / step);
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const u = -hl + (2 * hl * i) / nu, v = -ht + (2 * ht * j) / nv;
      pts.push([x + u * c - v * sn, z + u * sn + v * c]);
    }
  }
  return pts;
}
