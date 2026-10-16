import { describe, expect, it } from 'vitest';
import { BOSSES, LEVELS, PLANTS, ZOMBIES, type PlantId, type Rock, type StructureId, type ZombieId } from '../src/data/config';
import { Game, TICK_RATE, type SimEvent } from '../src/sim/game';

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
  it('zombies only come out the back gate (or up out of the graves)', () => {
    for (const wave of GRAVEYARD.waves) {
      for (const group of wave) expect(group.edge).toBe(group.zombie === 'tombstone' ? 'graves' : 'north');
    }
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
function play(seed: number, plan: [PlantId, number, number][], boss?: ZombieId): Game {
  const g = new Game(seed, GRAVEYARD, { boss });
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

describe('Tombstone Zombie', () => {
  const rise = ZOMBIES.tombstone.rise!;

  /** How far a zombie would walk to the nearest base from beside this rock. */
  function walk(g: Game, r: Rock): number {
    let d = Infinity;
    g.nav.forCellsInCircle(r.x, r.z, r.r + 0.6, (cell) => { d = Math.min(d, g.nav.dist[cell]); });
    return d;
  }

  it('comes up out of a tombstone, which is gone from the map for good', () => {
    const g = new Game(1, GRAVEYARD);
    g.phase = 'battle';
    const z = g.spawn('tombstone', 'graves');
    const rock = GRAVEYARD.map.rocks[z.grave];
    expect(rock.look).toBeUndefined();
    expect([z.x, z.z]).toEqual([rock.x, rock.z]);
    expect(g.risen.has(z.grave)).toBe(true);
    expect(g.nav.blocked[g.nav.cellOf(rock.x, rock.z)]).toBe(0);
    expect(g.drainEvents()).toContainEqual({ t: 'graveRisen', rock: z.grave, x: rock.x, z: rock.z });
  });

  it('stands still while it climbs out, then sets off', () => {
    const g = new Game(1, GRAVEYARD);
    g.phase = 'battle';
    const z = g.spawn('tombstone', 'graves');
    const start = { x: z.x, z: z.z };
    for (let i = 0; i < Math.floor(rise.time * TICK_RATE) - 1; i++) g.step();
    expect(Math.hypot(z.x - start.x, z.z - start.z)).toBeLessThan(0.05);
    for (let i = 0; i < TICK_RATE * 2; i++) g.step();
    expect(Math.hypot(z.x - start.x, z.z - start.z)).toBeGreaterThan(0.5);
  });

  it('only rises from graves well back from the bases, each grave once', () => {
    const g = new Game(1, GRAVEYARD);
    g.phase = 'battle';
    const fresh = new Game(1, GRAVEYARD);
    const seen = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const z = g.spawn('tombstone', 'graves');
      expect(seen.has(z.grave)).toBe(false);
      seen.add(z.grave);
      expect(walk(fresh, GRAVEYARD.map.rocks[z.grave])).toBeGreaterThanOrEqual(rise.minPathDistance);
    }
  });

  it('walks in through an edge once every grave has risen', () => {
    const g = new Game(1, GRAVEYARD);
    g.phase = 'battle';
    for (let i = 0; i < GRAVEYARD.map.rocks.length; i++) g.spawn('tombstone', 'graves');
    const last = g.spawn('tombstone', 'graves');
    expect(last.grave).toBe(-1);
    expect(Math.abs(last.z)).toBeGreaterThan(GRAVEYARD.map.depth / 2 - 1);
  });
});

describe('Cyber Cemetery balance', () => {
  it('a sensible defense can win', () => {
    // Whichever boss turns up.
    for (const boss of GRAVEYARD.bosses ?? BOSSES) {
      let wins = 0;
      for (const seed of [1, 2, 3]) if (play(seed, PLAN, boss).phase === 'won') wins++;
      expect(wins, boss).toBeGreaterThanOrEqual(2);
    }
  });

  it('doing nothing loses', () => {
    expect(play(1, []).phase).toBe('lost');
  });

  it('a tiny defense loses before the end', () => {
    expect(play(1, PLAN.slice(0, 4)).phase).toBe('lost');
  });
});

describe('Headless Horseman', () => {
  const raise = ZOMBIES.horseman.raiseDead!;

  /** The Horseman alone in the cemetery, through the back gate, and what happens for `seconds`. */
  function ride(seconds: number) {
    const g = new Game(1, GRAVEYARD);
    g.phase = 'battle';
    const boss = g.spawn('horseman', 'north');
    const events: SimEvent[] = [];
    const path: { x: number; z: number; halted: number }[] = [];
    for (let i = 0; i < TICK_RATE * seconds && g.phase === 'battle'; i++) {
      g.step();
      events.push(...g.drainEvents());
      path.push({ x: boss.x, z: boss.z, halted: boss.halted });
    }
    return { g, boss, events, path };
  }

  it('is the Cyber Cemetery\'s boss, and only turns up there', () => {
    for (const seed of [1, 2, 3, 4]) expect(new Game(seed, GRAVEYARD).boss).toBe('horseman');
    for (const level of LEVELS.filter((l) => l !== GRAVEYARD)) {
      for (const seed of [1, 2, 3, 4, 5, 6]) expect(new Game(seed, level).boss).not.toBe('horseman');
    }
  });

  it('now and then stops and raises the tombstones round him as zombies', () => {
    const { g, events } = ride(60);
    const raised = events.filter((e) => e.t === 'deadRaised');
    expect(raised.length).toBeGreaterThanOrEqual(2);
    for (const e of raised) {
      expect(e.rocks.length).toBeGreaterThan(0);
      expect(e.rocks.length).toBeLessThanOrEqual(raise.max);
      expect(e.ids.length).toBe(e.rocks.length);
      for (const [k, r] of e.rocks.entries()) {
        const rock = GRAVEYARD.map.rocks[r];
        expect(rock.look).toBeUndefined();
        expect(Math.hypot(rock.x - e.x, rock.z - e.z)).toBeLessThanOrEqual(raise.reach);
        expect(g.risen.has(r)).toBe(true);
        expect(events).toContainEqual({ t: 'graveRisen', rock: r, x: rock.x, z: rock.z });
        const risen = g.zombies.find((z) => z.id === e.ids[k]);
        if (risen) {
          expect(risen.type).toBe(raise.zombie);
          expect(risen.grave).toBe(r);
        }
      }
    }
    // Every grave comes up only once.
    const all = raised.flatMap((e) => (e.t === 'deadRaised' ? e.rocks : []));
    expect(new Set(all).size).toBe(all.length);
  });

  it('raises the nearest tombstones first', () => {
    const { events } = ride(30);
    const e = events.find((ev) => ev.t === 'deadRaised')!;
    if (e.t !== 'deadRaised') throw new Error('no raise');
    const taken = new Set(e.rocks);
    const farthest = Math.max(...e.rocks.map((r) => Math.hypot(GRAVEYARD.map.rocks[r].x - e.x, GRAVEYARD.map.rocks[r].z - e.z)));
    for (const [i, rock] of GRAVEYARD.map.rocks.entries()) {
      if (rock.look || taken.has(i)) continue;
      expect(Math.hypot(rock.x - e.x, rock.z - e.z)).toBeGreaterThanOrEqual(farthest - 1e-9);
    }
  });

  it('stands still while he does it, then rides on', () => {
    const { path } = ride(40);
    const start = path.findIndex((p) => p.halted > 0);
    expect(start).toBeGreaterThan(0);
    const end = start + Math.floor(raise.pause * TICK_RATE) - 1;
    expect(Math.hypot(path[end].x - path[start].x, path[end].z - path[start].z)).toBeLessThan(0.05);
    const later = path[Math.min(path.length - 1, end + TICK_RATE * 2)];
    expect(Math.hypot(later.x - path[end].x, later.z - path[end].z)).toBeGreaterThan(0.5);
  });

  it('waits a good while between raisings', () => {
    const { path } = ride(80);
    const starts = path.flatMap((p, i) => (p.halted > 0 && (i === 0 || path[i - 1].halted === 0) ? [i] : []));
    expect(starts.length).toBeGreaterThanOrEqual(2);
    for (let k = 1; k < starts.length; k++) expect(starts[k] - starts[k - 1]).toBeGreaterThanOrEqual(raise.every * TICK_RATE - 1);
  });
});
