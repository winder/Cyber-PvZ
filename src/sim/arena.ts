import { SEAT_ROW_DEPTH, type Circle, type Fan, type MapDef, type Rect, type SeatRow } from '../data/config';

// Arena shapes (the Hellfire Arena): the fan-shaped floor, the tunnels
// through the stands, rows of seats, and the mosh pit. Plain 2D geometry,
// shared by the rules and the scenery.

/** Is (x, z) on a fan-shaped floor? */
export function insideFan(f: Fan, x: number, z: number): boolean {
  const dx = x - f.x, dz = z - f.z;
  return dx > 0 && Math.hypot(dx, dz) <= f.radius && Math.abs(Math.atan2(dz, dx)) <= f.halfAngle;
}

export function insideRect(r: Rect, x: number, z: number): boolean {
  return Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2;
}

/** Can (x, z) be stood on at all? Off an arena's floor and out of its tunnels is the stands. */
export function onFloor(map: MapDef, x: number, z: number): boolean {
  if (!map.fan) return true;
  return insideFan(map.fan, x, z) || (map.tunnels ?? []).some((t) => insideRect(t, x, z));
}

/** Distance from (x, z) to the line down the middle of a row of seats. */
export function distanceToRowLine(s: SeatRow, x: number, z: number): number {
  const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - s.x1) * dx + (z - s.z1) * dz) / len2));
  return Math.hypot(x - (s.x1 + dx * t), z - (s.z1 + dz * t));
}

/** Is (x, z) in a row of seats? */
export function inSeatRow(s: SeatRow, x: number, z: number): boolean {
  return distanceToRowLine(s, x, z) <= SEAT_ROW_DEPTH / 2;
}

export function inCircle(c: Circle, x: number, z: number): boolean {
  return Math.hypot(x - c.x, z - c.z) <= c.r;
}
