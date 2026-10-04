import { describe, expect, it } from 'vitest';
import { LEVELS, PLANTS, STRUCTURES, type PlantId } from '../src/data/config';
import { Game, TICK_RATE } from '../src/sim/game';

const JUNGLE = LEVELS.find((l) => l.id === 'jungle')!;

describe('Crash Jungle', () => {
  it('every crash furrow ends in a wreck at its west end', () => {
    for (const r of JUNGLE.map.ravines) {
      const west = r.x - r.w / 2;
      expect(JUNGLE.map.rocks.some((w) => Math.abs(w.x - west) < w.r + 1 && Math.abs(w.z - r.z) < 0.5)).toBe(true);
    }
  });

  it('every wreck sits in a crater', () => {
    for (const w of JUNGLE.map.rocks) {
      expect(JUNGLE.map.craters!.some((c) => Math.hypot(c.x - w.x, c.z - w.z) < 0.01 && c.r > w.r)).toBe(true);
    }
  });

  it('craters keep clear of the bases', () => {
    for (const c of JUNGLE.map.craters!) {
      // The rim fades out by 1.6 radii; the base's level pad reaches 6 past its edge.
      for (const s of JUNGLE.map.structures) expect(Math.hypot(c.x - s.x, c.z - s.z)).toBeGreaterThan(c.r * 1.6 + STRUCTURES[s.id].radius + 6);
    }
  });
});

/** Before each wave, buy from the shopping list in order; use abilities when rich. */
function play(seed: number, plan: [PlantId, number, number][]): Game {
  const g = new Game(seed, JUNGLE);
  let next = 0;
  while (g.phase === 'build') {
    while (next < plan.length && g.sun >= PLANTS[plan[next][0]].cost) {
      const [type, x, z] = plan[next];
      const r = g.place(type, x, z);
      if (!r.ok) throw new Error(`plan step ${next} (${type} @ ${x},${z}): ${r.reason}`);
      next++;
    }
    g.startWave();
    const phase = () => g.phase;
    for (let i = 0; i < TICK_RATE * 300 && phase() === 'battle'; i++) {
      g.step();
      if (g.sun > 250 && g.zombies.length > 6) {
        const z = g.zombies[0];
        g.useAbility('orbitalStrike', z.x, z.z);
        g.useAbility('hyperSun');
      }
    }
  }
  return g;
}

// Like Neon Grid: lasers in a crescent in front of the bases, walls ahead, flowers at home.
const PLAN: [PlantId, number, number][] = [
  ['laserPea', -16, 11], ['laserPea', -16, -11], ['solarFlower', -28, 5], ['solarFlower', -28, -5],
  ['forceNut', -13, 12], ['forceNut', -13, -12], ['laserPea', -16, 14], ['laserPea', -16, -14],
  ['solarFlower', -30, 3], ['solarFlower', -30, -3], ['cryoPea', -17, 8], ['cryoPea', -17, -8],
  ['laserPea', -20, 3], ['laserPea', -20, -3], ['forceNut', -13, 10.7], ['forceNut', -13, -10.7],
  ['laserPea', -18, 17], ['laserPea', -18, -17], ['laserPea', -22, 7], ['laserPea', -22, -7],
  ['forceNut', -13, 13.3], ['forceNut', -13, -13.3], ['laserPea', -15, 5], ['laserPea', -15, -5],
  ['cryoPea', -19, 0], ['laserPea', -23, 0], ['laserPea', -17, 0],
  ['laserPea', -25, 10], ['laserPea', -25, -10], ['laserPea', -14, 16], ['laserPea', -14, -16],
  ['laserPea', -21, 18], ['laserPea', -21, -18], ['laserPea', -11, 8], ['laserPea', -11, -8],
];

describe('Crash Jungle balance', () => {
  it('a sensible defense can win', () => {
    let wins = 0;
    for (const seed of [1, 2, 3]) if (play(seed, PLAN).phase === 'won') wins++;
    expect(wins).toBeGreaterThanOrEqual(2);
  });

  it('doing nothing loses', () => {
    expect(play(1, []).phase).toBe('lost');
  });

  it('a tiny defense loses before the end', () => {
    expect(play(1, PLAN.slice(0, 4)).phase).toBe('lost');
  });
});
