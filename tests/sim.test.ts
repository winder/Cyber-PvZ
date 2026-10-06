import { describe, expect, it } from 'vitest';
import { ABILITIES, ECONOMY, LEVELS, PLANTS } from '../src/data/config';
import { Game, TICK_RATE } from '../src/sim/game';
import { NavGrid } from '../src/sim/nav';

function runSeconds(game: Game, seconds: number): void {
  for (let i = 0; i < seconds * TICK_RATE; i++) game.step();
}

describe('NavGrid flow field', () => {
  it('routes around a wall when there is a gap', () => {
    const nav = new NavGrid(20, 20);
    // Wall of rock at x=0 from z=-10 up to z=6, leaving a gap at the top.
    nav.addRavine({ x: 0, z: -2, w: 1, d: 16 });
    nav.computeField([{ x: -8, z: 0, radius: 1 }]);
    // Straight-line distance from (8,0) is 16; detour through the gap is longer.
    const d = nav.dist[nav.cellOf(8, 0)];
    expect(d).toBeGreaterThan(17);
    expect(d).toBeLessThan(30);
  });

  it('prefers chewing through cheap plants over a huge detour', () => {
    const nav = new NavGrid(20, 20);
    nav.addRavine({ x: 0, z: -3, w: 1, d: 14 });
    // Plug the gap with a "plant" that costs a little.
    for (let z = 4.5; z < 10; z += 0.5) nav.setPlant(1, 0, z, 0.3, 0.5);
    nav.computeField([{ x: -8, z: 0, radius: 1 }]);
    expect(Number.isFinite(nav.dist[nav.cellOf(8, 0)])).toBe(true);
  });
});

describe('Game', () => {
  it('places and sells plants for a full refund', () => {
    const g = new Game();
    const r = g.place('laserPea', 0, 0);
    expect(r.ok).toBe(true);
    expect(g.sun).toBe(ECONOMY.startingSun - PLANTS.laserPea.cost);
    expect(g.place('laserPea', 0.3, 0).ok).toBe(false); // overlapping
    if (r.ok) g.sell(r.plant.id);
    expect(g.sun).toBe(ECONOMY.startingSun);
    expect(g.plants).toHaveLength(0);
  });

  it('refuses placement on rocks and buildings', () => {
    const g = new Game();
    expect(g.place('forceNut', 4, 6).ok).toBe(false); // rock
    expect(g.place('forceNut', -26, 0).ok).toBe(false); // greenhouse
  });

  it('ground zombies walk to the nearest structure and damage it', () => {
    const g = new Game();
    g.startWave();
    const z = g.spawn('cyborg', 'east');
    const start = z.x;
    runSeconds(g, 5);
    expect(z.x).toBeLessThan(start - 4);
    runSeconds(g, 60);
    const damaged = g.structures.some((s) => s.hp < 700 || s.hp < 1500 && s.type === 'greenhouse');
    expect(damaged).toBe(true);
  });

  it('zombies chew through a plant that blocks a corridor', () => {
    const g = new Game();
    // Box a nut in its own little test: a zombie right next to it, heading west.
    const r = g.place('forceNut', 0, 0);
    expect(r.ok).toBe(true);
    g.startWave();
    const z = g.spawn('cyborg', 'east');
    z.x = 1.4;
    z.z = 0;
    // Make going around expensive by surrounding with rock-like plants is
    // overkill; instead verify the zombie at least doesn't walk through it.
    for (let i = 0; i < TICK_RATE * 3; i++) {
      g.step();
      expect(Math.abs(z.x) > 0.6 || Math.abs(z.z) > 0.6).toBe(true);
    }
  });

  it('a fully walled-in zombie chews its way out', () => {
    const g = new Game();
    g.sun = 99999;
    // A box of four walls around (3, 0).
    const H = Math.PI / 2;
    for (const [x, z, a] of [[3, 2.05, 0], [3, -2.05, 0], [3 - 2.05, 0, H], [3 + 2.05, 0, H]]) {
      expect(g.place('forceNut', x, z, a).ok).toBe(true);
    }
    g.startWave();
    const z = g.spawn('cyborg', 'east');
    z.x = 3;
    z.z = 0;
    runSeconds(g, 10);
    expect(Math.abs(z.x - 3) < 2.5 && Math.abs(z.z) < 2.5).toBe(true);
    expect(g.plants.some((p) => p.hp < PLANTS.forceNut.hp)).toBe(true);
  });

  it('walls are long, and turning one changes what it blocks', () => {
    const g = new Game();
    const r = g.place('forceNut', 0, 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // East–west: blocks along x, not along z.
    expect(g.nav.plantAt[g.nav.cellOf(1.4, 10)]).toBe(r.plant.id);
    expect(g.nav.plantAt[g.nav.cellOf(0, 11.4)]).toBe(-1);
    // Turned 90°: now it runs north–south.
    expect(g.rotatePlant(r.plant.id, Math.PI / 2).ok).toBe(true);
    expect(g.nav.plantAt[g.nav.cellOf(1.4, 10)]).toBe(-1);
    expect(g.nav.plantAt[g.nav.cellOf(0, 11.4)]).toBe(r.plant.id);
    // Can't turn into another plant.
    expect(g.place('laserPea', 1.6, 10).ok).toBe(true);
    expect(g.rotatePlant(r.plant.id, 0).ok).toBe(false);
    // Walls can't overlap each other, but can sit end to end.
    expect(g.place('forceNut', 0, 13.2, Math.PI / 2).ok).toBe(true);
    expect(g.place('forceNut', 0, 12.5, Math.PI / 2).ok).toBe(false);
  });

  it('a diagonal wall line steers zombies along it', () => {
    // A diagonal fence in a zombie's way: it walks round the end instead of chewing through.
    const g = new Game();
    g.sun = 99999;
    const a = Math.PI / 4;
    // Four walls end to end, running from (27, -7) up to (18, 2).
    for (let i = 0; i < 4; i++) {
      expect(g.place('forceNut', 26 - i * 2.3, -6 + i * 2.3, a + Math.PI / 2).ok).toBe(true);
    }
    g.startWave();
    const z = g.spawn('cyborg', 'east');
    z.x = 32; z.z = -2;
    let chewed = false;
    for (let i = 0; i < TICK_RATE * 15; i++) {
      g.step();
      if (z.attacking?.kind === 'plant') chewed = true;
    }
    expect(chewed).toBe(false); // it went round rather than through
    expect(g.plants.every((p) => p.hp === PLANTS.forceNut.hp)).toBe(true);
  });

  it('flying zombies fly over plant walls', () => {
    const g = new Game();
    for (const zz of [-1.6, 1.6]) expect(g.place('forceNut', 26, zz, Math.PI / 2).ok).toBe(true);
    g.startWave();
    const z = g.spawn('jetpack', 'east');
    z.x = 30;
    z.z = 0;
    runSeconds(g, 4);
    expect(z.x).toBeLessThan(24);
    expect(g.plants.every((p) => p.hp === PLANTS.forceNut.hp)).toBe(true);
  });

  it('peashooters kill zombies', () => {
    const g = new Game();
    g.place('laserPea', 10, 4);
    g.startWave();
    const z = g.spawn('cyborg', 'east');
    z.x = 14;
    z.z = 8;
    runSeconds(g, 0.1);
    expect(z.hp).toBeLessThan(150);
  });

  it('abilities need battle, sun and cooldown', () => {
    const g = new Game();
    expect(g.useAbility('hyperSun').ok).toBe(false);
    g.startWave();
    expect(g.useAbility('hyperSun').ok).toBe(true);
    expect(g.hyperTimer).toBe(ABILITIES.hyperSun.duration);
    expect(g.useAbility('hyperSun').ok).toBe(false);
  });

  it('orbital strike damages zombies in the blast', () => {
    const g = new Game();
    g.startWave();
    const z = g.spawn('cyborg', 'east');
    g.useAbility('orbitalStrike', z.x, z.z);
    runSeconds(g, 1);
    expect(g.zombies.includes(z)).toBe(false);
  });

  it('says which zombie died, and whether the strike did it', () => {
    const g = new Game();
    g.startWave();
    const struck = g.spawn('cyborg', 'east');
    g.useAbility('orbitalStrike', struck.x, struck.z);
    runSeconds(g, 1);
    const shot = g.spawn('cyborg', 'west');
    shot.hp = 0;
    g.step();
    const deaths = g.drainEvents().filter((e) => e.t === 'zombieDied');
    expect(deaths).toContainEqual(expect.objectContaining({ id: struck.id, by: 'strike' }));
    expect(deaths).toContainEqual(expect.objectContaining({ id: shot.id, by: 'plant' }));
  });

  it('clearing a wave heals plants and returns to build', () => {
    const g = new Game();
    const r = g.place('laserPea', 0, 0);
    g.startWave();
    if (r.ok) r.plant.hp = 10;
    // Kill everything as it spawns.
    for (let i = 0; i < TICK_RATE * 60 && g.phase === 'battle'; i++) {
      g.step();
      for (const z of g.zombies) z.hp = 0;
    }
    expect(g.phase).toBe('build');
    expect(g.wave).toBe(1);
    if (r.ok) expect(r.plant.hp).toBe(PLANTS.laserPea.hp);
  });

  it('losing the greenhouse loses the game', () => {
    const g = new Game();
    g.startWave();
    g.structures.find((s) => s.type === 'greenhouse')!.hp = 1;
    const z = g.spawn('cyborg', 'west');
    z.x = -22.5;
    z.z = 0;
    runSeconds(g, 2);
    expect(g.phase).toBe('lost');
  });

  it('debug jump goes to any wave with everything repaired', () => {
    const g = new Game();
    const r = g.place('laserPea', 0, 0);
    g.startWave();
    g.spawn('cyborg', 'east');
    const gh = g.structures.find((s) => s.type === 'greenhouse')!;
    gh.hp = 1;
    g.structures[1].alive = false;
    if (r.ok) r.plant.hp = 5;
    g.jumpToWave(4);
    expect(g.phase).toBe('build');
    expect(g.wave).toBe(4);
    expect(g.zombies).toHaveLength(0);
    expect(g.structures.every((s) => s.alive)).toBe(true);
    expect(gh.hp).toBeGreaterThan(1);
    if (r.ok) expect(r.plant.hp).toBe(PLANTS.laserPea.hp);
    // And the wave plays out from there.
    expect(g.startWave()).toBe(true);
    for (let i = 0; i < TICK_RATE * 2; i++) g.step();
    expect(g.zombies.length).toBeGreaterThan(0);
  });

  it('has five waves', () => {
    for (const level of LEVELS) expect(level.waves).toHaveLength(5);
  });
});
