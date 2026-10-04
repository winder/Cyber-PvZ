import { describe, expect, it } from 'vitest';
import { LEVELS, STRUCTURES } from '../src/data/config';
import { Game } from '../src/sim/game';
import { Terrain } from '../src/render/terrain';

for (const level of LEVELS) {
  const map = level.map;
  const terrain = new Terrain(map);
  const hw = map.width / 2, hd = map.depth / 2;

  describe(`terrain: ${level.name}`, () => {
    it('has hills (gentle or rolling) but nothing extreme', () => {
      const hs: number[] = [];
      for (let x = -hw + 2; x <= hw - 2; x += 3) for (let z = -hd + 2; z <= hd - 2; z += 3) hs.push(terrain.surfaceHeight(x, z));
      expect(Math.max(...hs) - Math.min(...hs)).toBeGreaterThan(map.hills > 0 ? 0.8 : -1);
      expect(Math.max(...hs.map(Math.abs))).toBeLessThan(4);
    });

    it('ravines are deep cracks carved into the ground', () => {
      for (const r of map.ravines) expect(terrain.terrainHeight(r.x, r.z)).toBeLessThan(-4);
    });

    it('the hole never pokes outside the area zombies cannot cross', () => {
      for (let x = -hw; x <= hw; x += 0.25) {
        for (let z = -hd; z <= hd; z += 0.25) {
          if (terrain.terrainHeight(x, z) >= terrain.surfaceHeight(x, z) - 1e-9) continue;
          const inside = map.ravines.some((r) => Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2);
          expect(inside).toBe(true);
        }
      }
    });

    it('every base sits on a level pad', () => {
      for (const s of map.structures) {
        const r = STRUCTURES[s.id].radius;
        const center = terrain.surfaceHeight(s.x, s.z);
        for (let a = 0; a < Math.PI * 2; a += 0.5) {
          expect(terrain.surfaceHeight(s.x + Math.cos(a) * (r + 1), s.z + Math.sin(a) * (r + 1))).toBeCloseTo(center, 1); // level to within 0.05
        }
      }
    });

    it('ravines block plants and zombies', () => {
      const g = new Game(1, level);
      for (const r of map.ravines) expect(g.canPlace('forceNut', r.x, r.z).ok).toBe(false);
    });

    it('finds where a ray hits the ground, hills and ravines alike', () => {
      for (const r of map.ravines) {
        const hit = terrain.rayToTerrain(r.x, 50, r.z, 0, -1, 0)!;
        expect(hit.x).toBeCloseTo(r.x, 3);
        expect(hit.z).toBeCloseTo(r.z, 3);
      }
      const hit = terrain.rayToTerrain(0, 30, -10, 0, -0.7, 0.4)!;
      const t = (30 - terrain.terrainHeight(hit.x, hit.z)) / 0.7;
      expect(hit.z).toBeCloseTo(-10 + 0.4 * t, 1);
      expect(terrain.rayToTerrain(0, 10, 0, 0, 1, 0)).toBeNull();
    });
  });
}
