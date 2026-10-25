import { describe, expect, it } from 'vitest';
import { LEVELS, PLANTS, ZOMBIES, type PlantId, type ZoneId } from '../src/data/config';
import { Game, TICK_RATE, type SimEvent } from '../src/sim/game';

const WAR = LEVELS.find((l) => l.id === 'warzone')!;
const map = WAR.map;
const zones = map.zones!;

/** A game in battle with nothing coming, to put zombies in by hand. */
function battle(): Game {
  const g = new Game(1, WAR);
  g.phase = 'battle';
  return g;
}

function run(g: Game, seconds: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < TICK_RATE * seconds; i++) {
    g.step();
    events.push(...g.drainEvents());
  }
  return events;
}

describe('War Zone', () => {
  it('zombies can walk out of every zone, from every spot and the lair, to the bases', () => {
    const g = new Game(1, WAR);
    for (const [id, zone] of Object.entries(zones)) {
      for (const p of [...zone.spots, zone.lair, zone.door]) {
        const cell = g.nav.cellOf(p.x, p.z);
        expect(g.nav.blocked[cell], `${id} ${p.x},${p.z}`).toBe(0);
        expect(g.nav.dist[cell], `${id} ${p.x},${p.z}`).toBeLessThan(Infinity);
      }
    }
  });

  it('nothing can be planted in a zone, on a wall, or in the grounds; the corridor is fine', () => {
    const g = new Game(1, WAR);
    g.sun = 1e6;
    const r = g.place('laserPea', zones.barracks!.lair.x, zones.barracks!.lair.z - 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Mess Hall/);
    expect(g.place('laserPea', -20, 10.2).ok).toBe(false); // the corridor's wall
    expect(g.place('laserPea', -35, 20).ok).toBe(false); // headquarters, behind the wall
    expect(g.place('laserPea', -18, 4).ok).toBe(true);
  });

  it('every boss turns up as written, one to a zone, and the final wave brings the surgeon', () => {
    for (const seed of [1, 2, 3]) {
      const g = new Game(seed, WAR);
      const bosses = g.waves.map((w) => w.filter((s) => ZOMBIES[s.zombie].boss).map((s) => `${s.zombie}@${s.edge}`));
      expect(bosses).toEqual([[], ['chef@barracks'], ['executioner@jail'], ['gunner@armory'], ['surgeon@hospital']]);
      expect(g.boss).toBe('surgeon');
    }
  });

  it('a boss comes out at its zone’s lair; anyone else at the zone’s spots, in turn', () => {
    const g = battle();
    const chef = g.spawn('chef', 'barracks');
    expect([chef.x, chef.z]).toEqual([zones.barracks!.lair.x, zones.barracks!.lair.z]);
    const spots = zones.armory!.spots;
    const first = g.spawn('cyborg', 'armory');
    const at = spots.findIndex((s) => s.x === first.x && s.z === first.z);
    expect(at).toBeGreaterThanOrEqual(0);
    const second = g.spawn('cyborg', 'armory');
    expect([second.x, second.z]).toEqual([spots[(at + 1) % spots.length].x, spots[(at + 1) % spots.length].z]);
    const events = g.drainEvents();
    expect(events).toContainEqual({ t: 'zoneSpawn', zone: 'barracks', id: chef.id, spot: -1 });
    expect(events).toContainEqual({ t: 'zoneSpawn', zone: 'armory', id: first.id, spot: at });
  });

  it('the morgue’s dead lie still a moment before they get up and walk', () => {
    const g = battle();
    const zb = g.spawn('woundedSoldier', 'hospital');
    expect(zb.rising).toBe(zones.hospital!.rise);
    const { x, z } = zb;
    run(g, zones.hospital!.rise! - 0.2);
    expect([zb.x, zb.z]).toEqual([x, z]);
    run(g, 2);
    expect(Math.hypot(zb.x - x, zb.z - z)).toBeGreaterThan(0.5);
  });

  it('the final wave breaks the prisoners out of the jail and raises the morgue', () => {
    const final = new Game(1, WAR).waves[4];
    const from = (zone: ZoneId) => final.filter((s) => s.edge === zone).map((s) => s.zombie);
    expect(from('jail')).toEqual(expect.arrayContaining(['convict', 'jailbird', 'chainGang']));
    expect(from('hospital')).toEqual(expect.arrayContaining(['surgeon', 'woundedSoldier']));
  });
});

describe('the War Zone bosses', () => {
  it('Chef Cleaver throws a volley of knives, each at a different plant', () => {
    const g = battle();
    const chef = g.spawn('chef', 'training');
    chef.x = 0; chef.z = 0;
    g.sun = 1e6;
    g.phase = 'build';
    for (const z of [-3, 0, 3]) g.place('laserPea', -6, z);
    g.phase = 'battle';
    const fired = run(g, 0.2).filter((e) => e.t === 'rocketFired');
    expect(fired).toHaveLength(3);
    expect(new Set(fired.map((e) => (e.t === 'rocketFired' ? `${e.toX},${e.toZ}` : '')))).toHaveProperty('size', 3);
    expect(fired.every((e) => e.t === 'rocketFired' && e.look === 'knife')).toBe(true);
  });

  it('Sergeant Rampage switches from machine gun to bazooka to grenades, and round again', () => {
    const g = battle();
    const sarge = g.spawn('gunner', 'training');
    sarge.x = 0; sarge.z = 0;
    const every = ZOMBIES.gunner.arsenal!.every;
    const switched = run(g, every * 3 + 0.5).filter((e) => e.t === 'gunSwitched').map((e) => (e.t === 'gunSwitched' ? e.look : ''));
    expect(switched).toEqual(['rocket', 'grenade', 'bullet']);
  });

  it('he fires whichever gun he holds: rapid bullets, then rockets', () => {
    const g = battle();
    const sarge = g.spawn('gunner', 'training');
    sarge.x = 0; sarge.z = 0;
    g.sun = 1e6;
    g.phase = 'build';
    g.place('forceNut', -5, 0);
    g.phase = 'battle';
    const shots = run(g, 5).filter((e) => e.t === 'rocketFired');
    expect(shots.length).toBeGreaterThan(10);
    expect(shots.every((e) => e.t === 'rocketFired' && e.look === 'bullet')).toBe(true);
    const later = run(g, 4).filter((e) => e.t === 'rocketFired');
    expect(later.some((e) => e.t === 'rocketFired' && e.look === 'rocket')).toBe(true);
  });

  it('Dr. Sawbones patches up hurt zombies round him, not ones out of reach', () => {
    const g = battle();
    const doc = g.spawn('surgeon', 'training');
    doc.x = 0; doc.z = 0;
    const near = g.spawn('cyborg', 'training');
    near.x = 2; near.z = 0; near.hp = 50;
    const far = g.spawn('cyborg', 'training');
    far.x = 20; far.z = 5; far.hp = 50;
    const healed = run(g, ZOMBIES.surgeon.heal!.first + 0.1).filter((e) => e.t === 'healed');
    expect(healed).toHaveLength(1);
    expect(near.hp).toBeCloseTo(50 + ZOMBIES.cyborg.hp * ZOMBIES.surgeon.heal!.amount, 0);
    expect(far.hp).toBe(50);
  });

  it('The Executioner brings his chain gang, and his axe cleaves every plant in reach', () => {
    const g = battle();
    const exec = g.spawn('executioner', 'jail');
    expect(g.zombies.filter((z) => z.leader === exec.id).map((z) => z.type)).toEqual(['chainGang', 'chainGang', 'chainGang']);
    expect(ZOMBIES.executioner.sweep).toBeGreaterThan(2);
  });

  it('his chain gang follow him out of the jail, not along the inside of its wall', () => {
    const g = battle();
    const exec = g.spawn('executioner', 'jail');
    const gang = g.zombies.filter((z) => z.leader === exec.id);
    run(g, 40);
    for (const z of gang) expect(z.z, `guard ${z.slot}`).toBeGreaterThan(-9.6); // in the corridor
  });
});

/** Play the War Zone: before each wave, buy from the shopping list in order. */
function playWar(seed: number, plan: [PlantId, number, number, number?][]): Game {
  const g = new Game(seed, WAR);
  let next = 0;
  while (g.phase === 'build') {
    while (next < plan.length && g.sun >= PLANTS[plan[next][0]].cost) {
      const [type, x, z, angle] = plan[next];
      const r = g.place(type, x, z, angle ?? 0);
      if (!r.ok) throw new Error(`plan step ${next} (${type} @ ${x},${z}): ${r.reason}`);
      next++;
    }
    g.startWave();
    const phase = () => g.phase;
    for (let i = 0; i < TICK_RATE * 400 && phase() === 'battle'; i++) {
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

// Hold the corridor in front of the Spaceship: lasers in rows across it,
// walls out in front, flowers back by the Greenhouse.
const WAR_PLAN: [PlantId, number, number, number?][] = [
  ['laserPea', -18, 3], ['laserPea', -18, -3], ['solarFlower', -41, 5], ['solarFlower', -41, -5],
  ['forceNut', -13, 6, Math.PI / 2], ['forceNut', -13, 0, Math.PI / 2], ['laserPea', -16, 7], ['laserPea', -16, -7],
  ['solarFlower', -43, 7], ['solarFlower', -43, -7], ['cryoPea', -17, 0], ['laserPea', -20, 6], ['laserPea', -20, -6],
  ['forceNut', -13, -6.5, Math.PI / 2], ['laserPea', -15, 3.5], ['laserPea', -15, -3.5],
  ['laserPea', -21, 0], ['laserPea', -19, 8.5], ['laserPea', -19, -8.5], ['cryoPea', -17, 5], ['cryoPea', -17, -5],
  ['laserPea', -23, 4], ['laserPea', -23, -4], ['laserPea', -22, 8], ['laserPea', -22, -8],
  ['laserPea', -15, 8.5], ['laserPea', -15, -8.5], ['laserPea', -25, 7.5], ['laserPea', -25, -7.5],
  ['laserPea', -28, 4], ['laserPea', -28, -4], ['laserPea', -30, 8], ['laserPea', -30, -8],
];

describe('War Zone balance', () => {
  it('a sensible defense can win', () => {
    let wins = 0;
    for (const seed of [1, 2, 3]) if (playWar(seed, WAR_PLAN).phase === 'won') wins++;
    expect(wins).toBeGreaterThanOrEqual(2);
  });

  it('doing nothing loses', () => {
    expect(playWar(1, []).phase).toBe('lost');
  });

  it('a tiny defense loses before the end', () => {
    expect(playWar(1, WAR_PLAN.slice(0, 4)).phase).toBe('lost');
  });
});
