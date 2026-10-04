import { describe, expect, it } from 'vitest';
import { LEVELS, PLANTS, type PlantId } from '../src/data/config';
import { Game, TICK_RATE } from '../src/sim/game';

const RUST = LEVELS.find((l) => l.id === 'rust')!;

/** Where a zombie first crosses into the corridor (|z| < 8). */
function entryPoint(edge: 'north' | 'south', seed: number): number | null {
  const g = new Game(seed, RUST);
  g.phase = 'battle';
  const z = g.spawn('cyborg', edge);
  for (let i = 0; i < TICK_RATE * 90; i++) {
    const prevX = z.x;
    g.step();
    if (Math.abs(z.z) < 8) return prevX;
    if (!g.zombies.includes(z)) return null;
  }
  return null;
}

describe('Rust Corridor', () => {
  it('bases stand in a row down the corridor', () => {
    const zs = RUST.map.structures.map((s) => s.z);
    expect(new Set(zs).size).toBe(1);
  });

  it('north zombies come in through the north gap or round the east end', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const x = entryPoint('north', seed);
      expect(x).not.toBeNull();
      expect((x! > -8.5 && x! < 0.5) || x! > 29.5).toBe(true);
    }
  });

  it('south zombies come in through the south gap or round the east end', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const x = entryPoint('south', seed);
      expect(x).not.toBeNull();
      expect((x! > -20.5 && x! < -11.5) || x! > 29.5).toBe(true);
    }
  });
});

/** Before each wave, buy from the shopping list in order; use abilities when rich. */
function play(seed: number, plan: [PlantId, number, number][]): Game {
  const g = new Game(seed, RUST);
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

// Hold the corridor east of the Spaceship, and cover both gaps.
const PLAN: [PlantId, number, number][] = [
  ['laserPea', -6, 2], ['laserPea', -6, -2], ['solarFlower', -30, 3], ['solarFlower', -30, -3],
  ['laserPea', -4, 6], ['laserPea', -16, -6], ['forceNut', -1, 0], ['forceNut', -1, 1.3], ['forceNut', -1, -1.3],
  ['solarFlower', -38, 3], ['solarFlower', -38, -3], ['cryoPea', -7, 0],
  ['laserPea', -8, 4.5], ['laserPea', -8, -4.5], ['laserPea', -18, 5], ['laserPea', -14, -5],
  ['forceNut', -1, 2.6], ['forceNut', -1, -2.6], ['cryoPea', -4, -6],
  ['laserPea', -5, 0], ['laserPea', -10, 2], ['laserPea', -10, -2], ['laserPea', -20, 3], ['laserPea', -20, -3],
  ['laserPea', -3, 3.5], ['laserPea', -1.5, -5.5], ['cryoPea', -12, 4], ['laserPea', -26, 4], ['laserPea', -26, -4],
  ['laserPea', -16, 6.5], ['laserPea', -7, 6.5], ['laserPea', -7, -6.5], ['laserPea', -28, 6], ['laserPea', -28, -6],
];

describe('Rust Corridor balance', () => {
  it('a sensible defense can win', () => {
    let wins = 0;
    for (const seed of [1, 2, 3]) if (play(seed, PLAN).phase === 'won') wins++;
    expect(wins).toBeGreaterThanOrEqual(2);
  });

  it('doing nothing loses', () => {
    expect(play(1, []).phase).toBe('lost');
  });
});
