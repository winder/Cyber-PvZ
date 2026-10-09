import { describe, expect, it } from 'vitest';
import { BOSSES, LEVELS, PLANTS, type PlantId, type ZombieId } from '../src/data/config';
import { Game, TICK_RATE } from '../src/sim/game';

/** Play a whole game: before each wave, buy from the shopping list in order. */
function playGame(seed: number, plan: [PlantId, number, number][], boss?: ZombieId): Game {
  const g = new Game(seed, LEVELS[0], { boss });
  let next = 0;
  while (g.phase === 'build') {
    while (next < plan.length && g.sun >= PLANTS[plan[next][0]].cost) {
      const [type, x, z] = plan[next];
      const r = g.place(type, x, z);
      if (!r.ok) throw new Error(`plan step ${next} (${type} @ ${x},${z}): ${r.reason}`);
      next++;
    }
    g.startWave();
    // (Read phase through a function: TS can't see that step() changes it.)
    const phase = () => g.phase;
    for (let i = 0; i < TICK_RATE * 300 && phase() === 'battle'; i++) {
      g.step();
      // Use abilities when there's plenty of sun, like a player would.
      if (g.sun > 250 && g.zombies.length > 6) {
        const z = g.zombies[0];
        g.useAbility('orbitalStrike', z.x, z.z);
        g.useAbility('hyperSun');
      }
    }
  }
  return g;
}

// A reasonable defense: flowers behind the lines, lasers in a crescent, nuts in front.
const PLAN: [PlantId, number, number][] = [
  // Wave 1: a laser in front of each side building, flowers at home.
  ['laserPea', -15, 11], ['laserPea', -15, -11], ['solarFlower', -27, 5], ['solarFlower', -27, -5],
  // Then: walls to hold zombies in range, more lasers, more sun.
  ['forceNut', -12, 12], ['forceNut', -12, -12], ['laserPea', -15, 14], ['laserPea', -15, -14],
  ['solarFlower', -29, 3], ['solarFlower', -29, -3], ['cryoPea', -16, 8], ['cryoPea', -16, -8],
  ['laserPea', -19, 3], ['laserPea', -19, -3], ['forceNut', -12, 10.7], ['forceNut', -12, -10.7],
  ['laserPea', -17, 17], ['laserPea', -17, -17], ['laserPea', -21, 7], ['laserPea', -21, -7],
  ['forceNut', -12, 13.3], ['forceNut', -12, -13.3], ['laserPea', -14, 5], ['laserPea', -14, -5],
  ['cryoPea', -18, 0], ['laserPea', -22, 0], ['laserPea', -16, 0],
  ['laserPea', -24, 10], ['laserPea', -24, -10], ['laserPea', -13, 16], ['laserPea', -13, -16],
  ['laserPea', -20, 18], ['laserPea', -20, -18], ['laserPea', -10, 8], ['laserPea', -10, -8],
];

describe('balance', () => {
  it('a sensible defense can win', () => {
    // Whichever boss turns up.
    for (const boss of BOSSES) {
      let wins = 0;
      for (const seed of [1, 2, 3]) if (playGame(seed, PLAN, boss).phase === 'won') wins++;
      expect(wins, boss).toBeGreaterThanOrEqual(2);
    }
  });

  it('doing nothing loses', () => {
    const g = playGame(1, []);
    expect(g.phase).toBe('lost');
  });

  it('a tiny defense loses before the end', () => {
    const g = playGame(1, PLAN.slice(0, 4));
    expect(g.phase).toBe('lost');
  });
});

