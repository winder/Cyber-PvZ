import { describe, expect, it } from 'vitest';
import { MAP, STRUCTURES } from '../src/data/config';
import { Game } from '../src/sim/game';
import { RAVINE_DEPTH, rayToTerrain, surfaceHeight, terrainHeight } from '../src/render/terrain';

describe('terrain', () => {
  it('is actually hilly', () => {
    const hs: number[] = [];
    for (let x = -30; x <= 30; x += 3) for (let z = -20; z <= 20; z += 3) hs.push(surfaceHeight(x, z));
    expect(Math.max(...hs) - Math.min(...hs)).toBeGreaterThan(2);
    expect(Math.max(...hs.map(Math.abs))).toBeLessThan(4);
  });

  it('ravines drop straight down', () => {
    for (const r of MAP.ravines) {
      expect(terrainHeight(r.x, r.z)).toBe(-RAVINE_DEPTH);
      // A quarter-unit inside the rim is already at the bottom.
      expect(terrainHeight(r.x - r.w / 2 + 0.25, r.z)).toBe(-RAVINE_DEPTH);
      // Right on the rim is still ground level.
      expect(terrainHeight(r.x - r.w / 2, r.z)).toBeGreaterThan(-4);
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
