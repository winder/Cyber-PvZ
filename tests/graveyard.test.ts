import { describe, expect, it } from 'vitest';
import { LEVELS, PLANTS, type PlantId, type StructureId } from '../src/data/config';
import { Game, TICK_RATE } from '../src/sim/game';

const GRAVEYARD = LEVELS.find((l) => l.id === 'graveyard')!;

/** The order bases first come under attack from ground zombies, with no defense. */
function attackOrder(seed: number): StructureId[] {
  const g = new Game(seed, GRAVEYARD);
  g.phase = 'battle';
  const order: StructureId[] = [];
  for (let i = 0; i < 40; i++) g.spawn('cyborg', 'north');
  for (let i = 0; i < TICK_RATE * 600 && g.phase === 'battle'; i++) {
    g.step();
    for (const z of g.zombies) {
      if (z.attacking?.kind !== 'structure') continue;
      const id = g.structures[z.attacking.index].type;
      if (!order.includes(id)) order.push(id);
    }
  }
  return order;
}

describe('Cyber Cemetery', () => {
  it('zombies only come out the back gate', () => {
    for (const wave of GRAVEYARD.waves) for (const group of wave) expect(group.edge).toBe('north');
  });

  it('the ravine maze leads zombies to the Spaceship, then the Power Plant, then the Greenhouse', () => {
    for (const seed of [1, 2, 3]) expect(attackOrder(seed)).toEqual(['spaceship', 'powerPlant', 'greenhouse']);
  });

  it('has far more tombstones than the other levels have rocks', () => {
    expect(GRAVEYARD.map.rocks.length).toBeGreaterThan(150);
  });

  it('the gazebo stands on top of the hill', () => {
    const gazebo = GRAVEYARD.map.rocks.find((r) => r.look === 'gazebo')!;
    const mound = GRAVEYARD.map.mound!;
    expect(Math.hypot(gazebo.x - mound.x, gazebo.z - mound.z)).toBeLessThan(0.01);
  });
});

/** Before each wave, buy from the shopping list in order; use abilities when rich. */
function play(seed: number, plan: [PlantId, number, number][]): Game {
  const g = new Game(seed, GRAVEYARD);
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

// Hold the east gap above the Spaceship, cover the row of bases, and put a
// laser by the Greenhouse early for the jetpacks (it's the nearest to the gate).
const PLAN: [PlantId, number, number][] = [
  ['laserPea', 19, -11.5], ['laserPea', 25.2, -11.5], ['solarFlower', -11, -20], ['solarFlower', -11, -14],
  ['forceNut', 22, -3.5], ['laserPea', 15.8, -13.1], ['cryoPea', 22, -11.5], ['laserPea', -5, -11],
  ['laserPea', 27, -14], ['forceNut', 18.7, -3.5], ['forceNut', 25.3, -3.5], ['solarFlower', -13, -17],
  ['laserPea', 14, -17], ['laserPea', 26, -20], ['laserPea', 20.2, -22.5], ['cryoPea', 14, -21],
  ['laserPea', 8, -11.5], ['laserPea', 8.2, -22.5], ['laserPea', 2, -14], ['laserPea', 2, -20],
  ['laserPea', 18, 0.5], ['laserPea', 26.5, 0.5], ['laserPea', -5, -23],
  ['laserPea', 22, 1], ['cryoPea', 2, -17], ['laserPea', 13, -10.5], ['laserPea', -10, -10.5],
  ['laserPea', 27.2, -7], ['laserPea', 16.8, -7], ['laserPea', 11, -14], ['laserPea', 5, -17],
];

describe('Cyber Cemetery balance', () => {
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
