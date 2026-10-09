import { describe, expect, it } from 'vitest';
import { BOSSES, LEVELS, STRUCTURES, ZOMBIES, type ZombieId } from '../src/data/config';
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
