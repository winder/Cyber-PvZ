import { describe, expect, it } from 'vitest';
import { BOSSES, LEVELS, MOSH, PLANTS, STRUCTURES, ZOMBIES, type PlantId, type ZombieId } from '../src/data/config';
import { onFloor } from '../src/sim/arena';
import { Game, TICK_RATE, type SimEvent } from '../src/sim/game';

const ARENA = LEVELS.find((l) => l.id === 'concert')!;
const map = ARENA.map;

describe('Hellfire Arena', () => {
  it('every base stands on the stage, on the floor', () => {
    for (const s of map.structures) {
      expect(onFloor(map, s.x, s.z)).toBe(true);
      expect(Math.hypot(s.x - map.fan!.x, s.z - map.fan!.z)).toBeLessThan(map.stage!.radius - STRUCTURES[s.id].radius);
    }
  });

  it('zombies can get to the stage from every tunnel', () => {
    const g = new Game(1, ARENA);
    for (const [edge, mouths] of Object.entries(map.alleys!)) {
      for (const t of mouths) {
        const x = edge === 'east' ? map.width / 2 - 0.5 : t;
        const z = edge === 'north' ? map.depth / 2 - 0.5 : edge === 'south' ? -map.depth / 2 + 0.5 : t;
        expect(g.nav.blocked[g.nav.cellOf(x, z)], `${edge} ${t}`).toBe(0);
        expect(g.nav.dist[g.nav.cellOf(x, z)], `${edge} ${t}`).toBeLessThan(Infinity);
      }
    }
  });

  it('nothing walks or grows in the stands, the seats, or (plants) the mosh pit', () => {
    const g = new Game(1, ARENA);
    g.sun = 1e6;
    expect(g.place('laserPea', 0, 33).ok).toBe(false); // the stands, up the side
    const row = map.seats![0];
    expect(g.place('laserPea', (row.x1 + row.x2) / 2, (row.z1 + row.z2) / 2).ok).toBe(false);
    const r = g.place('laserPea', map.moshPit!.x, map.moshPit!.z);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/mosh pit/);
    expect(g.place('laserPea', -25, 0).ok).toBe(true);
  });

  it('only Satan headlines here, and he plays nowhere else', () => {
    for (const seed of [1, 2, 3, 4]) expect(new Game(seed, ARENA).boss).toBe('satan');
    expect(BOSSES).not.toContain('satan');
    for (const seed of [1, 2, 3, 4, 5, 6]) expect(new Game(seed, LEVELS[0]).boss).not.toBe('satan');
  });
});

describe('the mosh pit', () => {
  const pit = map.moshPit!;

  /** A zombie of this type stood in the middle of the pit. */
  function inPit(type: ZombieId) {
    const g = new Game(1, ARENA);
    g.phase = 'battle';
    const zb = g.spawn(type, 'east');
    zb.x = pit.x + 2;
    zb.z = pit.z;
    return { g, zb };
  }

  it('gives zombies a rock shield while they are in it', () => {
    const { g, zb } = inPit('cyborg');
    g.step();
    expect(zb.moshing).toBe(true);
    g.sun = 1e6;
    const hp = zb.hp;
    // A Guitar Solo Blast right on it: half the usual damage.
    g.useAbility('orbitalStrike', zb.x, zb.z);
    for (let i = 0; i < TICK_RATE; i++) g.step();
    expect(hp - zb.hp).toBeCloseTo(300 * (1 - MOSH.shield), 0);
  });

  it('they take turns rocking out (slow) and surging (super fast)', () => {
    const { g, zb } = inPit('cyborg');
    let rocking = 0, surging = 0, fastest = 0;
    for (let i = 0; i < TICK_RATE * 6; i++) {
      zb.x = pit.x + 2; zb.z = pit.z; // hold it in the pit
      g.step();
      const speed = Math.hypot(zb.x - (pit.x + 2), zb.z - pit.z) * TICK_RATE;
      if (zb.rocking > 0) {
        rocking++;
        expect(speed).toBeLessThan(ZOMBIES.cyborg.speed * 0.5);
      }
      if (zb.surging > 0) {
        surging++;
        fastest = Math.max(fastest, speed);
      }
    }
    expect(rocking).toBeGreaterThan(surging);
    expect(surging).toBeGreaterThan(0);
    expect(fastest).toBeGreaterThan(ZOMBIES.cyborg.speed * 1.8);
  });

  it('the shield drops as soon as they are out', () => {
    const { g, zb } = inPit('cyborg');
    g.step();
    zb.x = pit.x + pit.r + 3;
    g.step();
    expect(zb.moshing).toBe(false);
    expect(zb.rocking + zb.surging).toBe(0);
  });

  it('bosses and flyers do not mosh', () => {
    for (const type of ['satan', 'jetpack'] as ZombieId[]) {
      const { g, zb } = inPit(type);
      g.step();
      expect(zb.moshing, type).toBe(false);
    }
  });
});

describe('Satan', () => {
  const riff = ZOMBIES.satan.riff!;

  /** Satan held still at (-2, 0) with these plants round him. */
  function gig(plants: [PlantId, number, number][]) {
    const g = new Game(1, ARENA);
    g.sun = 1e6;
    const placed = plants.map(([type, x, z]) => {
      const r = g.place(type, x, z);
      if (!r.ok) throw new Error(`${type} ${x},${z}: ${r.reason}`);
      return r.plant;
    });
    g.phase = 'battle';
    const boss = g.spawn('satan', 'east');
    // Just him: send the roadies home.
    for (const z of g.zombies) if (z !== boss) z.hp = 0;
    const events: SimEvent[] = [];
    const run = (seconds: number) => {
      for (let i = 0; i < TICK_RATE * seconds && g.phase === 'battle'; i++) {
        boss.x = -2; boss.z = 0; boss.hp = ZOMBIES.satan.hp;
        g.step();
        events.push(...g.drainEvents());
      }
    };
    return { g, boss, placed, events, run };
  }

  it('brings his roadies', () => {
    const g = new Game(1, ARENA);
    g.phase = 'battle';
    g.spawn('satan', 'east');
    expect(g.zombies.filter((z) => z.type === 'roadie')).toHaveLength(ZOMBIES.satan.guards!.count);
  });

  it('his first riff is a cone of flame: it burns what is in front, not what is behind', () => {
    // In front (toward the stage), off to one side of the cone, and behind him.
    const { placed, events, run } = gig([['laserPea', -6, 0], ['laserPea', -6, 1.5], ['laserPea', -2, 7.5], ['laserPea', 2, -2]]);
    run(riff.first + 0.2);
    expect(events.filter((e) => e.t === 'flameRiff')).toHaveLength(1);
    expect(placed[0].hp).toBeLessThan(PLANTS.laserPea.hp);
    expect(placed[1].hp).toBeLessThan(PLANTS.laserPea.hp);
    expect(placed[2].hp).toBe(PLANTS.laserPea.hp);
    expect(placed[3].hp).toBe(PLANTS.laserPea.hp);
  });

  it('his next is lightning, jumping from plant to plant', () => {
    // A line of plants, each in reach of the last, curling away from him.
    const chain: [PlantId, number, number][] = [['laserPea', -8, 0], ['laserPea', -8, 2.5], ['laserPea', -8, 5], ['laserPea', -6, 7]];
    const { placed, events, run } = gig(chain);
    run(riff.first + riff.every + 0.2);
    const zap = events.find((e) => e.t === 'zapRiff');
    expect(zap && zap.t === 'zapRiff' && zap.chain.length).toBe(1 + riff.zap.jumps);
    const hurt = placed.filter((p) => p.hp < PLANTS.laserPea.hp);
    expect(hurt.length).toBeGreaterThanOrEqual(1 + riff.zap.jumps);
  });
});

/** Before each wave, buy from the shopping list in order; use abilities when rich. */
function play(seed: number, plan: [PlantId, number, number][], boss?: ZombieId): Game {
  const g = new Game(seed, ARENA, { boss });
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

// Lasers in a horseshoe round the pit's stage-side mouth, flowers on the stage.
export const PLAN: [PlantId, number, number][] = [
  ['laserPea', -25, 2.5], ['laserPea', -25, -2.5], ['solarFlower', -37, 5], ['solarFlower', -37, -5], ['laserPea', -27, 0],
  ['solarFlower', -36, 8.5], ['solarFlower', -36, -8.5], ['cryoPea', -24, 6], ['cryoPea', -24, -6],
  ['laserPea', -29, 4], ['laserPea', -29, -4], ['laserPea', -23, 9], ['laserPea', -23, -9],
  ['laserPea', -26.5, 7.5], ['laserPea', -26.5, -7.5], ['laserPea', -24.2, 0],
  ['cryoPea', -27, 11], ['cryoPea', -27, -11], ['laserPea', -31, 12], ['laserPea', -31, -12],
  ['laserPea', -20, 11], ['laserPea', -20, -11], ['laserPea', -33, 4.5], ['laserPea', -33, -4.5],
  ['laserPea', -28.5, 8.5], ['laserPea', -28.5, -8.5], ['laserPea', -22, 14], ['laserPea', -22, -14],
  ['laserPea', -25, 12.5], ['laserPea', -25, -12.5], ['cryoPea', -30, 0],
];

describe('Hellfire Arena balance', () => {
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
