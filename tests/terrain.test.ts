import { describe, expect, it } from 'vitest';
import { MAP, STRUCTURES } from '../src/data/config';
import { Game } from '../src/sim/game';
import { rayToTerrain, surfaceHeight, terrainHeight } from '../src/render/terrain';

describe('terrain', () => {
  it('is actually hilly', () => {
    const hs: number[] = [];
    for (let x = -30; x <= 30; x += 3) for (let z = -20; z <= 20; z += 3) hs.push(surfaceHeight(x, z));
    expect(Math.max(...hs) - Math.min(...hs)).toBeGreaterThan(2);
    expect(Math.max(...hs.map(Math.abs))).toBeLessThan(4);
  });

  it('ravines are deep cracks carved into the ground', () => {
    for (const r of MAP.ravines) {
      expect(terrainHeight(r.x, r.z)).toBeLessThan(-4);
    }
  });

  it('the hole never pokes outside the area zombies cannot cross', () => {
    for (let x = -36; x <= 36; x += 0.25) {
      for (let z = -24; z <= 24; z += 0.25) {
        if (terrainHeight(x, z) >= surfaceHeight(x, z) - 1e-9) continue;
        const inside = MAP.ravines.some((r) => Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2);
        expect(inside).toBe(true);
      }
    }
  });

  it('every base sits on a level pad', () => {
    for (const s of MAP.structures) {
      const r = STRUCTURES[s.id].radius;
      const center = surfaceHeight(s.x, s.z);
      for (let a = 0; a < Math.PI * 2; a += 0.5) {
        expect(surfaceHeight(s.x + Math.cos(a) * (r + 1), s.z + Math.sin(a) * (r + 1))).toBeCloseTo(center, 5);
      }
    }
  });

  it('ravines still block plants and zombies (same spots as before)', () => {
    const g = new Game();
    for (const r of MAP.ravines) expect(g.canPlace('forceNut', r.x, r.z).ok).toBe(false);
  });

  it('finds where a ray hits the ground, hills and ravines alike', () => {
    for (const [x, z] of [[0, 0], [10, -6], [-2, 17], [14, 1]]) {
      const hit = rayToTerrain(x, 50, z, 0, -1, 0)!;
      expect(hit.x).toBeCloseTo(x, 3);
      expect(hit.z).toBeCloseTo(z, 3);
    }
    // A slanted ray hits the ground before reaching y = 0 on a hill (or after, in a dip).
    const hit = rayToTerrain(0, 30, -30, 0, -0.7, 0.7)!;
    expect(Math.abs(terrainHeight(hit.x, hit.z) - (30 - 0.7 * ((hit.z + 30) / 0.7)))).toBeLessThan(0.05);
    expect(rayToTerrain(0, 10, 0, 0, 1, 0)).toBeNull();
  });
});
