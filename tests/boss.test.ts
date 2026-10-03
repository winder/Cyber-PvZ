import { describe, expect, it } from 'vitest';
import { STRUCTURES, ZOMBIES } from '../src/data/config';
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

/** ZomWes alone against `n` laser peashooters. */
function bossFight(n: number) {
  const g = new Game(1);
  g.sun = 1e6;
  let placed = 0;
  for (const [x, z] of SPOTS) {
    if (placed >= n) break;
    if (g.place('laserPea', x, z).ok) placed++;
  }
  g.phase = 'battle';
  const boss = g.spawn('zomwes', 'east');
  const events: SimEvent[] = [];
  for (let i = 0; i < TICK_RATE * 400 && g.phase === 'battle' && boss.hp > 0; i++) {
    g.step();
    events.push(...g.drainEvents());
  }
  const health = g.structures.map((s) => s.hp / STRUCTURES[s.type].hp);
  return { g, boss, events, health };
}

describe('ZomWes 8000', () => {
  it('is in the final wave', () => {
    const g = new Game();
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

  it('walks straight over rocks and cliffs', () => {
    const g = new Game();
    g.phase = 'battle';
    const boss = g.spawn('zomwes', 'east');
    boss.z = 1; // the cliff at x=14 is right in the way
    for (let i = 0; i < TICK_RATE * 40; i++) g.step();
    expect(boss.x).toBeLessThan(10);
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
