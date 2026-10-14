import { describe, expect, it } from 'vitest';
import { BOSSES, LEVELS, STRUCTURES, ZOMBIES, type PlantId, type ZombieId } from '../src/data/config';
import { MODELS } from '../src/models/models';
import { UNIT } from '../src/render/blockModel';
import { Game, TICK_RATE, type SimEvent } from '../src/sim/game';

// Peashooter spots spread around the three bases, nearest rings first.
const SPOTS: [number, number][] = [];
const BASES: [number, number][] = [[-20, 13], [-20, -13], [-26, 0]];
for (let ring = 0; ring < 3; ring++) for (const [bx, bz] of BASES) for (let k = 0; k < 3; k++) {
  const a = Math.PI * (0.5 + ring * 0.37) - k * 0.9 + (bz > 0 ? 0.6 : bz < 0 ? -0.6 : 0);
  SPOTS.push([bx + Math.cos(a) * (4 + ring * 1.5) + 2, bz + Math.sin(a) * (4 + ring * 1.5) * 0.6]);
}

/** A boss (ZomWes unless said otherwise) alone against `n` laser peashooters. */
function bossFight(n: number, type: ZombieId = 'zomwes') {
  const g = new Game(1);
  g.sun = 1e6;
  let placed = 0;
  for (const [x, z] of SPOTS) {
    if (placed >= n) break;
    if (g.place('laserPea', x, z).ok) placed++;
  }
  g.phase = 'battle';
  const boss = g.spawn(type, 'east');
  const events: SimEvent[] = [];
  for (let i = 0; i < TICK_RATE * 400 && g.phase === 'battle' && boss.hp > 0; i++) {
    g.step();
    events.push(...g.drainEvents());
  }
  const health = g.structures.map((s) => s.hp / STRUCTURES[s.type].hp);
  return { g, boss, events, health };
}

describe('ZomWes 8000', () => {
  it('is in the final wave when he is the boss', () => {
    const g = new Game(1, LEVELS[0], { boss: 'zomwes' });
    g.wave = g.totalWaves - 1;
    expect(g.wavePreview().some((l) => l.zombie === 'zomwes')).toBe(true);
  });

  it('wanders to a different base each time one loses a quarter of its health', () => {
    const { events } = bossFight(14);
    const wanders = events.filter((e) => e.t === 'wander');
    expect(wanders.length).toBeGreaterThanOrEqual(3);
    // It tours all three bases, not just two.
    expect(new Set(wanders.map((e) => (e as { to: number }).to)).size).toBe(3);
  });

  it('walks straight over rocks and ravines', () => {
    const g = new Game();
    g.phase = 'battle';
    const boss = g.spawn('zomwes', 'east');
    boss.z = 1; // the ravine at x=14 is right in the way
    for (let i = 0; i < TICK_RATE * 40; i++) g.step();
    expect(boss.x).toBeLessThan(10);
  });

  it('arrives with 3 guardians who march beside him', () => {
    const g = new Game();
    g.phase = 'battle';
    const boss = g.spawn('zomwes', 'east');
    const guards = g.zombies.filter((z) => z.type === 'guardian');
    expect(guards).toHaveLength(3);
    for (let i = 0; i < TICK_RATE * 20; i++) g.step();
    for (const gd of guards) expect(Math.hypot(gd.x - boss.x, gd.z - boss.z)).toBeLessThan(10);
    expect(g.wavePreview).toBeDefined();
  });

  it('guardians carry on alone when he falls', () => {
    const g = new Game();
    g.phase = 'battle';
    const boss = g.spawn('zomwes', 'east');
    boss.hp = 0;
    g.step();
    const guard = g.zombies.find((z) => z.type === 'guardian')!;
    const start = guard.x;
    for (let i = 0; i < TICK_RATE * 10; i++) g.step();
    expect(guard.leader).toBeNull();
    expect(guard.x).toBeLessThan(start - 5); // heading for the bases
  });

  it('guardians slash every plant in reach', () => {
    const g = new Game();
    const a = g.place('forceNut', 0, 0), b = g.place('forceNut', 1.3, 0.6);
    g.phase = 'battle';
    g.spawn('zomwes', 'east');
    const guard = g.zombies.find((z) => z.type === 'guardian')!;
    guard.x = 1.5; guard.z = -1; // escorting, with two plants in reach
    for (let i = 0; i < TICK_RATE * 2; i++) g.step();
    if (a.ok && b.ok) {
      expect(a.plant.hp).toBeLessThan(1500);
      expect(b.plant.hp).toBeLessThan(1500);
    }
  });

  it('shows the guardians in the final wave preview', () => {
    const g = new Game(1, LEVELS[0], { boss: 'zomwes' });
    g.wave = g.totalWaves - 1;
    expect(g.wavePreview().find((l) => l.zombie === 'guardian')?.count).toBe(3);
  });

  it('20 plants take him down easily', () => {
    const { boss, health } = bossFight(20);
    expect(boss.hp).toBeLessThanOrEqual(0);
    // He leaves a base just as it crosses a quarter mark, so ~50% left is "easy".
    expect(Math.min(...health)).toBeGreaterThan(0.45);
  });

  it('8 plants are not enough', () => {
    const { g, boss } = bossFight(8);
    expect(boss.hp > 0 || g.phase === 'lost').toBe(true);
  });

  it('is massive (about 16 units tall without the driver), with a rider on top', () => {
    const def = ZOMBIES.zomwes;
    const parts = MODELS[def.model!].parts;
    const top = (roles: string[]) => Math.max(...parts.filter((p) => roles.includes(p.role)).map((p) => p.pivot[1] + p.offset[1] + p.size[1] / 2));
    const robot = top(['head', 'body']) * UNIT * def.scale!;
    expect(robot).toBeGreaterThan(15);
    expect(top(['driverHead'])).toBeGreaterThan(top(['head']));
  });
});

describe('the final boss', () => {
  it('is picked at random each game', () => {
    const picks = new Set<ZombieId>();
    for (let seed = 1; seed <= 20; seed++) picks.add(new Game(seed).boss);
    expect([...picks].sort()).toEqual([...BOSSES].sort());
  });

  it('stands in for the boss in the final wave', () => {
    const g = new Game(1, LEVELS[0], { boss: 'captain' });
    g.wave = g.totalWaves - 1;
    const lines = g.wavePreview();
    expect(lines.some((l) => l.zombie === 'captain')).toBe(true);
    expect(lines.some((l) => l.zombie === 'zomwes' || l.zombie === 'guardian')).toBe(false);
  });
});

describe('Ship Captain', () => {
  it('fires rockets that blow up every plant near where they land', () => {
    const g = new Game(1, LEVELS[0], { boss: 'captain' });
    const a = g.place('forceNut', 4, 12), b = g.place('forceNut', 4, 13.2);
    g.phase = 'battle';
    const boss = g.spawn('captain', 'east');
    boss.x = 10; boss.z = 12.5;
    const events: SimEvent[] = [];
    for (let i = 0; i < TICK_RATE * 2; i++) {
      boss.x = 10; boss.z = 12.5; // hold him at range
      g.step();
      events.push(...g.drainEvents());
    }
    expect(events.some((e) => e.t === 'rocketFired')).toBe(true);
    expect(events.some((e) => e.t === 'rocketHit')).toBe(true);
    if (a.ok && b.ok) {
      expect(a.plant.hp).toBeLessThan(1800);
      expect(b.plant.hp).toBeLessThan(1800);
    }
  });

  it('calls up his crew around him, again and again', () => {
    const g = new Game(1, LEVELS[0], { boss: 'captain' });
    g.phase = 'battle';
    const boss = g.spawn('captain', 'east');
    const events: SimEvent[] = [];
    let first: number[] | undefined;
    for (let i = 0; i < TICK_RATE * 40; i++) {
      g.step();
      for (const e of g.drainEvents()) {
        events.push(e);
        // They appear right next to him.
        if (e.t === 'summoned' && !first) {
          first = e.ids;
          for (const id of e.ids) {
            const z = g.zombies.find((o) => o.id === id)!;
            expect(z.type).toBe(ZOMBIES.captain.summon!.zombie);
            expect(Math.hypot(z.x - boss.x, z.z - boss.z)).toBeLessThan(3);
          }
        }
      }
    }
    expect(events.filter((e) => e.t === 'summoned').length).toBeGreaterThanOrEqual(2);
  });

  it('20 plants take him down', () => {
    const { boss } = bossFight(20, 'captain');
    expect(boss.hp).toBeLessThanOrEqual(0);
  });

  it('6 plants are not enough', () => {
    const { g, boss } = bossFight(6, 'captain');
    expect(boss.hp > 0 || g.phase === 'lost').toBe(true);
  });

  it('is medium sized: bigger than a Guardian, far smaller than ZomWes', () => {
    const height = (id: ZombieId) => {
      const def = ZOMBIES[id];
      const parts = MODELS[def.model!].parts;
      return Math.max(...parts.map((p) => p.pivot[1] + p.offset[1] + p.size[1] / 2)) * UNIT * (def.scale ?? 1);
    };
    expect(height('captain')).toBeGreaterThan(height('guardian') * 1.2);
    expect(height('captain')).toBeLessThan(height('zomwes') / 2);
  });
});

describe('Necro-Gardener', () => {
  const goo = ZOMBIES.gardener.goo!;

  /** A gardener held still at (10, 0), with whatever's planted round (4, 0) in his reach. */
  function garden(plants: [PlantId, number, number][]) {
    const g = new Game(1, LEVELS[0], { boss: 'gardener' });
    g.sun = 1e6;
    const placed = plants.map(([type, x, z]) => {
      const r = g.place(type, x, z);
      if (!r.ok) throw new Error(r.reason);
      return r.plant;
    });
    g.phase = 'battle';
    const boss = g.spawn('gardener', 'east');
    const events: SimEvent[] = [];
    const run = (seconds: number) => {
      for (let i = 0; i < TICK_RATE * seconds && g.phase === 'battle'; i++) {
        boss.x = 10; boss.z = 0; boss.hp = ZOMBIES.gardener.hp;
        g.step();
        events.push(...g.drainEvents());
      }
    };
    return { g, boss, placed, events, run };
  }

  it('zombifies the plants where his goo lands, and no others', () => {
    const { placed, events, run } = garden([['laserPea', 4, 0], ['laserPea', 4, 1.5], ['laserPea', 4, -8]]);
    run(goo.first + 0.5);
    const sprayed = events.filter((e) => e.t === 'gooSprayed');
    expect(sprayed.length).toBe(1);
    expect(placed[0].zombified).toBeGreaterThan(0);
    expect(placed[1].zombified).toBeGreaterThan(0);
    expect(placed[2].zombified).toBe(0);
  });

  it('turns zombified shooters on healthy plants, and they stop shooting him', () => {
    const { g, boss, placed, events, run } = garden([['laserPea', 4, 0], ['solarFlower', 1, 0]]);
    run(goo.first + 0.2);
    expect(placed[0].zombified).toBeGreaterThan(0);
    const before = events.length;
    const flowerHp = placed[1].hp;
    run(2);
    const shots = events.slice(before).filter((e) => e.t === 'shot');
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every((e) => e.t === 'shot' && e.turned)).toBe(true);
    expect(placed[1].hp).toBeLessThan(flowerHp);
    expect(boss.hp).toBe(ZOMBIES.gardener.hp);
    expect(g.plants.includes(placed[0])).toBe(true);
  });

  it('turns them on a base when one is in range', () => {
    const g = new Game(1, LEVELS[0], { boss: 'gardener' });
    g.sun = 1e6;
    const greenhouse = g.structures.find((s) => STRUCTURES[s.type].vital)!;
    const r = g.place('laserPea', greenhouse.x + STRUCTURES[greenhouse.type].radius + 1.5, greenhouse.z);
    if (!r.ok) throw new Error(r.reason);
    g.phase = 'battle';
    r.plant.zombified = 5;
    const hp = greenhouse.hp;
    for (let i = 0; i < TICK_RATE * 2; i++) g.step();
    expect(greenhouse.hp).toBeLessThan(hp);
  });

  it('a zombified wall lets zombies walk through, and makes no trouble once cured', () => {
    const g = new Game(1, LEVELS[0], { boss: 'gardener' });
    g.sun = 1e6;
    const r = g.place('forceNut', 4, 0);
    if (!r.ok) throw new Error(r.reason);
    const cell = g.nav.cellOf(4, 0);
    expect(g.nav.plantAt[cell]).toBe(r.plant.id);
    g.phase = 'battle';
    const boss = g.spawn('gardener', 'east');
    for (let i = 0; i < TICK_RATE * (goo.first + 0.2); i++) {
      boss.x = 10; boss.z = 0;
      g.step();
    }
    expect(r.plant.zombified).toBeGreaterThan(0);
    expect(g.nav.plantAt[cell]).toBe(-1);
    // The goo wears off (he's out of reach now), and the wall blocks the way again.
    for (let i = 0; i < TICK_RATE * (goo.duration + 1); i++) {
      boss.x = 30; boss.z = 0;
      g.step();
    }
    expect(r.plant.zombified).toBe(0);
    expect(g.nav.plantAt[cell]).toBe(r.plant.id);
  });

  it('zombified Solar Flowers make no sun', () => {
    const { g, placed } = garden([['solarFlower', 4, 0]]);
    const healthy = g.sunPerSecond();
    placed[0].zombified = 5;
    expect(g.sunPerSecond()).toBeLessThan(healthy);
  });

  it('an Orbital Laser Strike cures the plants it hits, without hurting them', () => {
    const { g, placed, events, run } = garden([['laserPea', 4, 0], ['laserPea', 4, 1.5]]);
    run(goo.first + 0.2);
    expect(placed.every((p) => p.zombified > 0)).toBe(true);
    const hp = placed.map((p) => p.hp);
    expect(g.useAbility('orbitalStrike', 4, 0.7).ok).toBe(true);
    run(1.5);
    expect(placed.every((p) => p.zombified === 0)).toBe(true);
    expect(placed.map((p) => p.hp)).toEqual(hp);
    expect(events.some((e) => e.t === 'plantsCured' && e.by === 'strike')).toBe(true);
  });

  it('the goo wears off by itself, and dies with him', () => {
    const { g, boss, placed, events, run } = garden([['laserPea', 4, 0]]);
    run(goo.first + 0.2);
    expect(placed[0].zombified).toBeGreaterThan(0);
    boss.hp = 0;
    g.step();
    events.push(...g.drainEvents());
    expect(placed[0].zombified).toBe(0);
    expect(events.some((e) => e.t === 'plantsCured' && e.by === 'bossDown')).toBe(true);
  });

  it('about 20 laser peashooters can beat him', () => {
    const { boss } = bossFight(20, 'gardener');
    expect(boss.hp).toBeLessThanOrEqual(0);
  });

  it('a thin defense cannot stop him', () => {
    const { g, boss } = bossFight(6, 'gardener');
    expect(boss.hp > 0 || g.phase === 'lost').toBe(true);
  });
});
