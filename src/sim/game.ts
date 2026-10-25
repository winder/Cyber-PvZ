import {
  ABILITIES, BOSSES, ECONOMY, LEVELS, MOSH, PLANTS, SCORE, STRUCTURES, ZOMBIES,
  type AbilityId, type EdgeId, type Gun, type LevelDef, type MapDef, type PlantDef, type PlantId, type SpawnFrom, type SpawnGroup, type StructureId,
  type ZombieId, type ZoneId,
} from '../data/config';
import { inCircle, inSeatRow, insideRect, onFloor } from './arena';
import { CELL, NavGrid, PLANT_BLOCK_PAD } from './nav';
import { boundingRadius, distanceToPlant, footprintPoints, isRotatable, thicknessAcross } from './shapes';

/** Simulation steps per second. */
export const TICK_RATE = 30;
const DT = 1 / TICK_RATE;

/** Chewing speed used to turn plant health into path cost. */
const NOMINAL_CHEW_DPS = 25;
const NOMINAL_SPEED = 1.2;

export type Phase = 'build' | 'battle' | 'won' | 'lost';

export interface Plant {
  id: number;
  type: PlantId;
  x: number;
  z: number;
  hp: number;
  cooldown: number;
  /** Angle the plant is facing (radians, 0 = +x). */
  facing: number;
  /** Walls: which way the wall runs (radians, 0 = east–west). */
  angle: number;
  /**
   * Seconds of goo left. While it's above 0 the plant is zombified: it shoots
   * the bases and healthy plants instead of zombies, makes no sun, and (a
   * wall) lets zombies walk through. 0 = healthy.
   */
  zombified: number;
}

export interface Zombie {
  id: number;
  type: ZombieId;
  x: number;
  z: number;
  hp: number;
  slowTimer: number;
  slowFactor: number;
  facing: number;
  /** What it's chewing on right now, if anything. */
  attacking: { kind: 'plant'; id: number } | { kind: 'structure'; index: number } | null;
  /** Wanderers: the base it's heading for, and the health that makes it move on. */
  target: number | null;
  wanderBelow: number;
  /** When each base was last targeted (tick number), so wanderers tour them all. */
  visited: number[];
  /** Bodyguards: the zombie they escort (by id) and their place in the formation. */
  leader: number | null;
  slot: number;
  /** Seconds a bodyguard keeps to the normal route after finding its straight way blocked. */
  detour: number;
  /** The map rock (tombstone) it rose out of, or -1 if it walked in. */
  grave: number;
  /** Seconds left climbing out of the grave (it stands still until then). */
  rising: number;
  /** Rocketeers and goo sprayers: seconds until it can fire again. */
  reload: number;
  /** Summoners (and raisers of the dead, and healers): seconds until they next do it. */
  summonIn: number;
  /** Arsenal carriers: which gun they're holding, and seconds until they switch to the next. */
  gun: number;
  gunIn: number;
  /** Seconds left standing still, raising the dead. */
  halted: number;
  /** Riff players: how many riffs so far (they take turns: flame, lightning). */
  riffs: number;
  /** In the mosh pit, behind a rock shield. */
  moshing: boolean;
  /** Moshing: seconds left rocking out (barely moving), then surging (super speed). */
  rocking: number;
  surging: number;
}

export interface Structure {
  index: number;
  type: StructureId;
  x: number;
  z: number;
  hp: number;
  alive: boolean;
}

/** How long a bodyguard follows the normal route round an obstacle before trying the straight way again. */
const ESCORT_DETOUR = 2;
/** How much further a bodyguard can have to walk than its leader before it stops cutting straight across and follows the route. */
const ESCORT_STRAY = 6;

export interface Strike { x: number; z: number; timer: number }

/** A rocket (or knife, bullet, grenade) in flight, heading for (x, z). */
export interface Rocket { x: number; z: number; timer: number; damage: number; radius: number; look: NonNullable<Gun['look']> }

export type SimEvent =
  /** `turned`: fired by a zombified plant, at a base or a healthy plant. */
  | { t: 'shot'; plantId: number; kind: PlantId; fromX: number; fromZ: number; toX: number; toZ: number; toAir: boolean; turned?: boolean }
  /** `by`: what finished it off (a plant's shot, or the Orbital Laser Strike). */
  | { t: 'zombieDied'; id: number; type: ZombieId; x: number; z: number; by: 'plant' | 'strike' }
  | { t: 'plantPlaced'; id: number }
  | { t: 'plantSold'; id: number }
  | { t: 'plantDied'; id: number; x: number; z: number }
  | { t: 'chomp'; x: number; z: number }
  | { t: 'stomp'; x: number; z: number }
  | { t: 'bossSpawn'; type: ZombieId }
  | { t: 'graveRisen'; rock: number; x: number; z: number }
  | { t: 'wander'; type: ZombieId; to: number }
  | { t: 'structureHit'; index: number }
  | { t: 'structureDestroyed'; index: number }
  | { t: 'strikeTargeted'; x: number; z: number; delay: number }
  | { t: 'strikeHit'; x: number; z: number; radius: number }
  /** `id`: who fired it (a rocket, or a knife, bullet or grenade). Lands at (toX, toZ) after `flight` seconds. */
  | { t: 'rocketFired'; id: number; fromX: number; fromZ: number; toX: number; toZ: number; flight: number; look: NonNullable<Gun['look']> }
  | { t: 'rocketHit'; x: number; z: number; radius: number; look: NonNullable<Gun['look']> }
  /** An arsenal carrier switched to another of its guns. */
  | { t: 'gunSwitched'; id: number; look: NonNullable<Gun['look']> }
  /** `id`: who patched them up, from (x, z); `ids`: the zombies it healed. */
  | { t: 'healed'; id: number; x: number; z: number; radius: number; ids: number[] }
  /** A zombie came out of a zone: at its spot number `spot`, or (-1) the zone's lair. */
  | { t: 'zoneSpawn'; zone: ZoneId; id: number; spot: number }
  /** `id`: who called them up; `ids`: the zombies that appeared. */
  | { t: 'summoned'; id: number; ids: number[] }
  /** `id`: who raised them, from where; `rocks`: the tombstones that came up; `ids`: the zombies. */
  | { t: 'deadRaised'; id: number; x: number; z: number; rocks: number[]; ids: number[] }
  /** `id`: who sprayed. `ids`: the plants it zombified, round (x, z). */
  | { t: 'gooSprayed'; id: number; x: number; z: number; radius: number; ids: number[] }
  /** Plants back to normal: burned clean by a strike, worn off, or their boss fell. */
  | { t: 'plantsCured'; ids: number[]; by: 'strike' | 'time' | 'bossDown' }
  /** `id`: who played it. Flame fills a cone from (x, z) toward (toX, toZ), `range` long, `spread` radians either side. */
  | { t: 'flameRiff'; id: number; x: number; z: number; toX: number; toZ: number; range: number; spread: number }
  /** `id`: who played it. Lightning from the player through each point in turn (plants, or a base). */
  | { t: 'zapRiff'; id: number; chain: { x: number; z: number }[] }
  | { t: 'hyperSun' }
  | { t: 'waveStart'; wave: number }
  | { t: 'waveCleared'; wave: number; bonus: number }
  | { t: 'won' }
  | { t: 'lost' }
  | { t: 'jumped'; wave: number };

export type PlaceResult = { ok: true; plant: Plant } | { ok: false; reason: string };
export type AbilityResult = { ok: true } | { ok: false; reason: string };

export interface WavePreviewLine { edge: SpawnFrom; zombie: ZombieId; count: number }

/** Small deterministic random number generator so tests are repeatable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface QueuedSpawn { time: number; zombie: ZombieId; edge: SpawnFrom }

export class Game {
  phase: Phase = 'build';
  /** Index of the wave being fought, or the next one during build. */
  wave = 0;
  readonly totalWaves: number;
  readonly map: MapDef;
  readonly waves: SpawnGroup[][];
  sun = ECONOMY.startingSun;
  /** Points so far: zombies beaten, waves cleared and, on a win, bases kept. */
  score = 0;
  readonly plants: Plant[] = [];
  readonly zombies: Zombie[] = [];
  readonly structures: Structure[];
  readonly strikes: Strike[] = [];
  readonly rockets: Rocket[] = [];
  /** Which boss the final wave brings this game (it stands in for any boss in the waves). */
  readonly boss: ZombieId;
  readonly nav: NavGrid;
  readonly cooldowns: Record<AbilityId, number> = { orbitalStrike: 0, hyperSun: 0 };
  /** Map rocks (by index) that have risen as zombies and are gone for good. */
  readonly risen = new Set<number>();
  hyperTimer = 0;
  /** Events since the last drain; the renderer and sound read these. */
  events: SimEvent[] = [];

  private nextId = 1;
  /** Each zone's next spot to bring a zombie out at. */
  private readonly zoneTurn = new Map<ZoneId, number>();
  /** Zombies the Orbital Laser Strike killed, until they're cleared away. */
  private readonly struckDown = new Set<number>();
  private tick = 0;
  private waveTime = 0;
  private spawnQueue: QueuedSpawn[] = [];
  private fieldDirty = true;
  private chompTimer = 0;
  private structureHitTimer: number[];
  private readonly rand: () => number;

  /** `boss`: pick the final wave's boss instead of leaving it to chance. */
  constructor(seed = 1, readonly level: LevelDef = LEVELS[0], opts: { boss?: ZombieId } = {}) {
    // Each boss stands in for any boss in the level's waves.
    const bosses = level.bosses ?? BOSSES;
    this.map = level.map;
    if (level.keepBosses) {
      // Every boss as written; "the" boss is the final wave's.
      this.waves = level.waves;
      this.boss = [...level.waves].reverse().flat().find((g) => ZOMBIES[g.zombie].boss)?.zombie ?? bosses[0];
    } else {
      this.boss = opts.boss ?? bosses[Math.floor(mulberry32(seed ^ 0x5eed)() * bosses.length)];
      this.waves = level.waves.map((wave) => wave.map((g) => (ZOMBIES[g.zombie].boss ? { ...g, zombie: this.boss } : g)));
    }
    this.totalWaves = level.waves.length;
    this.rand = mulberry32(seed);
    this.nav = new NavGrid(this.map.width, this.map.depth);
    this.markObstacles();
    this.structures = this.map.structures.map((s, index) => ({
      index, type: s.id, x: s.x, z: s.z, hp: STRUCTURES[s.id].hp, alive: true,
    }));
    this.structureHitTimer = this.structures.map(() => 0);
    this.refreshField();
  }

  // --------------------------------------------------------------------------
  //  Player actions
  // --------------------------------------------------------------------------

  canPlace(type: PlantId, x: number, z: number, angle = 0): { ok: true } | { ok: false; reason: string } {
    if (this.phase !== 'build') return { ok: false, reason: 'You can only plant before the wave.' };
    if (this.sun < PLANTS[type].cost) return { ok: false, reason: 'Not enough sun.' };
    return this.fits(type, x, z, angle);
  }

  /** Is there room for this plant here (ignoring one plant, e.g. itself when turning)? */
  private fits(type: PlantId, x: number, z: number, angle: number, ignore?: Plant): { ok: true } | { ok: false; reason: string } {
    const pts = footprintPoints(type, x, z, angle);
    const hw = this.map.width / 2, hd = this.map.depth / 2;
    if (pts.some(([px, pz]) => Math.abs(px) > hw || Math.abs(pz) > hd || !onFloor(this.map, px, pz))) {
      return { ok: false, reason: 'Too close to the edge.' };
    }
    for (const zone of Object.values(this.map.zones ?? {})) {
      if (pts.some(([px, pz]) => insideRect(zone.area, px, pz))) return { ok: false, reason: `That’s the ${zone.name}! Plant in the corridor.` };
    }
    const pit = this.map.moshPit;
    if (pit && pts.some(([px, pz]) => inCircle(pit, px, pz))) {
      return { ok: false, reason: 'No plants in the mosh pit!' };
    }
    if (pts.some(([px, pz]) => this.nav.blocked[this.nav.cellOf(px, pz)])) {
      return { ok: false, reason: 'Something is in the way.' };
    }
    for (const s of this.structures) {
      if (!s.alive) continue;
      const r = STRUCTURES[s.type].radius;
      if (pts.some(([px, pz]) => Math.hypot(s.x - px, s.z - pz) < r)) return { ok: false, reason: 'Too close to a building.' };
    }
    for (const p of this.plants) {
      if (p === ignore) continue;
      if (Math.hypot(p.x - x, p.z - z) > boundingRadius(p.type) + boundingRadius(type) + 0.1) continue;
      if (pts.some(([px, pz]) => distanceToPlant(p, px, pz) === 0)) return { ok: false, reason: 'Too close to another plant.' };
    }
    return { ok: true };
  }

  place(type: PlantId, x: number, z: number, angle = 0): PlaceResult {
    const check = this.canPlace(type, x, z, angle);
    if (!check.ok) return check;
    const def = PLANTS[type];
    this.sun -= def.cost;
    const plant: Plant = {
      id: this.nextId++, type, x, z, hp: def.hp, cooldown: 0, facing: 0, angle: isRotatable(type) ? angle : 0, zombified: 0,
    };
    this.plants.push(plant);
    this.markPlant(plant);
    this.fieldDirty = true;
    this.events.push({ t: 'plantPlaced', id: plant.id });
    return { ok: true, plant };
  }

  /** Turn a wall (build phase only). Fails if it would hit something. */
  rotatePlant(id: number, angle: number): { ok: true } | { ok: false; reason: string } {
    if (this.phase !== 'build') return { ok: false, reason: 'You can only turn walls before the wave.' };
    const plant = this.plants.find((p) => p.id === id);
    if (!plant || !isRotatable(plant.type)) return { ok: false, reason: 'That can’t be turned.' };
    const check = this.fits(plant.type, plant.x, plant.z, angle, plant);
    if (!check.ok) return { ok: false, reason: 'No room to turn it there.' };
    this.nav.clearPlant(plant.id);
    plant.angle = angle;
    this.remarkNear(plant);
    this.fieldDirty = true;
    return { ok: true };
  }

  /** The plant under (x, z), if any. */
  plantAt(x: number, z: number): Plant | undefined {
    let best: Plant | undefined;
    let bestD = Infinity;
    for (const p of this.plants) {
      const d = distanceToPlant(p, x, z);
      if (d < 0.3 && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  /** Mark the cells a plant blocks (a little wider than its body, so neighbors seal gaps). */
  private markPlant(p: Plant): void {
    // Zombies walk straight through a zombified plant.
    if (p.zombified > 0) return;
    const cost = this.plantPathCost(p.type);
    this.nav.forCellsInCircle(p.x, p.z, boundingRadius(p.type) + PLANT_BLOCK_PAD, (cell) => {
      if (this.nav.blocked[cell]) return;
      if (distanceToPlant(p, this.nav.centerX(cell), this.nav.centerZ(cell)) > PLANT_BLOCK_PAD) return;
      this.nav.plantAt[cell] = p.id;
      this.nav.extraCost[cell] = cost;
    });
  }

  /** Re-mark this plant and its neighbors (after one moved, turned, or went away). */
  private remarkNear(around: { x: number; z: number }): void {
    for (const p of this.plants) {
      if (Math.hypot(p.x - around.x, p.z - around.z) < 6) this.markPlant(p);
    }
  }

  sell(id: number): boolean {
    if (this.phase !== 'build') return false;
    const i = this.plants.findIndex((p) => p.id === id);
    if (i < 0) return false;
    const plant = this.plants[i];
    this.sun += PLANTS[plant.type].cost;
    this.removePlantAt(i);
    this.events.push({ t: 'plantSold', id });
    return true;
  }

  startWave(): boolean {
    if (this.phase !== 'build') return false;
    this.phase = 'battle';
    this.waveTime = 0;
    this.spawnQueue = buildSpawnQueue(this.waves[this.wave]);
    this.events.push({ t: 'waveStart', wave: this.wave });
    return true;
  }

  abilitiesOnline(): boolean {
    return this.structures.some((s) => s.alive && STRUCTURES[s.type].powersAbilities);
  }

  canUseAbility(id: AbilityId): AbilityResult {
    if (this.phase !== 'battle') return { ok: false, reason: 'Abilities work during battle.' };
    if (!this.abilitiesOnline()) return { ok: false, reason: 'The Spaceship is destroyed!' };
    if (this.cooldowns[id] > 0) return { ok: false, reason: 'Still recharging.' };
    if (this.sun < ABILITIES[id].cost) return { ok: false, reason: 'Not enough sun.' };
    return { ok: true };
  }

  useAbility(id: AbilityId, x = 0, z = 0): AbilityResult {
    const check = this.canUseAbility(id);
    if (!check.ok) return check;
    this.sun -= ABILITIES[id].cost;
    this.cooldowns[id] = ABILITIES[id].cooldown;
    if (id === 'orbitalStrike') {
      const delay = ABILITIES.orbitalStrike.delay;
      this.strikes.push({ x, z, timer: delay });
      this.events.push({ t: 'strikeTargeted', x, z, delay });
    } else {
      this.hyperTimer = ABILITIES.hyperSun.duration;
      this.events.push({ t: 'hyperSun' });
    }
    return { ok: true };
  }

  wavePreview(): WavePreviewLine[] {
    const groups = this.waves[this.wave] ?? [];
    const lines: WavePreviewLine[] = [];
    for (const g of groups) {
      const line = lines.find((l) => l.edge === g.edge && l.zombie === g.zombie);
      if (line) line.count += g.count;
      else lines.push({ edge: g.edge, zombie: g.zombie, count: g.count });
      // Bodyguards come along too.
      const guards = ZOMBIES[g.zombie].guards;
      if (guards) lines.push({ edge: g.edge, zombie: guards.zombie, count: g.count * guards.count });
    }
    return lines;
  }

  sunPerSecond(): number {
    const mult = this.hyperTimer > 0 ? ABILITIES.hyperSun.multiplier : 1;
    let total = ECONOMY.baseSunPerSecond;
    for (const s of this.structures) if (s.alive) total += STRUCTURES[s.type].sunPerSecond ?? 0;
    for (const p of this.plants) if (p.zombified <= 0) total += (PLANTS[p.type].sunPerSecond ?? 0) * mult;
    return total;
  }

  // --------------------------------------------------------------------------
  //  Simulation
  // --------------------------------------------------------------------------

  /** Advance one fixed tick. Only does anything during battle. */
  step(): void {
    if (this.phase !== 'battle') return;
    this.tick++;
    this.waveTime += DT;
    this.sun += this.sunPerSecond() * DT;
    for (const k of Object.keys(this.cooldowns) as AbilityId[]) {
      this.cooldowns[k] = Math.max(0, this.cooldowns[k] - DT);
    }
    this.hyperTimer = Math.max(0, this.hyperTimer - DT);
    this.chompTimer -= DT;
    for (let i = 0; i < this.structureHitTimer.length; i++) this.structureHitTimer[i] -= DT;

    this.spawnDue();
    if (this.fieldDirty) this.refreshField();
    this.updatePlants();
    this.updateZombies();
    this.updateStrikes();
    this.updateRockets();
    this.removeDead();
    if (this.fieldDirty) this.refreshField();
    this.checkEnd();
  }

  private spawnDue(): void {
    while (this.spawnQueue.length > 0 && this.spawnQueue[0].time <= this.waveTime) {
      const s = this.spawnQueue.shift()!;
      this.spawn(s.zombie, s.edge);
    }
  }

  spawn(type: ZombieId, edge: SpawnFrom): Zombie {
    if (edge === 'graves') {
      const risen = this.raiseGrave(type);
      if (risen) return risen;
      edge = (Object.keys(this.map.edges) as EdgeId[])[0]; // no graves left: walk in instead
    }
    if (!(edge in this.map.edges)) return this.spawnInZone(type, edge as ZoneId);
    return this.walkIn(type, edge as EdgeId);
  }

  /** In from the edge of the map (out of an alley mouth, if it has them). */
  private walkIn(type: ZombieId, edge: EdgeId): Zombie {
    const range = this.map.edges[edge];
    const hw = this.map.width / 2 - 0.5, hd = this.map.depth / 2 - 0.5;
    let x = 0, z = 0;
    const alleys = this.map.alleys?.[edge];
    for (let tries = 0; tries < 30; tries++) {
      // Out of an alley mouth if the edge has them, otherwise anywhere along it.
      const t = alleys
        ? alleys[Math.floor(this.rand() * alleys.length)] + (this.rand() - 0.5) * 2
        : range.from + this.rand() * (range.to - range.from);
      if (edge === 'east') { x = hw; z = t; }
      else if (edge === 'west') { x = -hw; z = t; }
      else if (edge === 'north') { x = t; z = hd; }
      else { x = t; z = -hd; }
      if (!this.nav.blocked[this.nav.cellOf(x, z)]) break;
    }
    return this.arrive(this.addZombie(type, x, z));
  }

  /**
   * Out of a zone: a boss at its lair, anyone else at its next spot (each in
   * turn), lying there a while first if the zone's dead are getting up.
   */
  private spawnInZone(type: ZombieId, id: ZoneId): Zombie {
    const zone = this.map.zones?.[id];
    if (!zone) throw new Error(`No zone ${id} on this map`);
    const boss = !!ZOMBIES[type].boss;
    let spot = -1;
    if (!boss) {
      spot = this.zoneTurn.get(id) ?? Math.floor(this.rand() * zone.spots.length);
      this.zoneTurn.set(id, (spot + 1) % zone.spots.length);
    }
    const at = boss ? zone.lair : zone.spots[spot];
    const zombie = this.addZombie(type, at.x, at.z);
    // Facing the way out.
    zombie.facing = Math.atan2(zone.door.z - at.z, zone.door.x - at.x);
    if (zone.rise && !boss) zombie.rising = zone.rise;
    this.events.push({ t: 'zoneSpawn', zone: id, id: zombie.id, spot });
    return this.arrive(zombie);
  }

  /** A zombie's just come in: announce a boss, and bring on its bodyguards. */
  private arrive(zombie: Zombie): Zombie {
    const type = zombie.type;
    const hw = this.map.width / 2 - 0.5, hd = this.map.depth / 2 - 0.5;
    if (ZOMBIES[type].boss) this.events.push({ t: 'bossSpawn', type });
    // Bodyguards appear around it, already in formation.
    const guards = ZOMBIES[type].guards;
    if (guards) {
      for (let k = 0; k < guards.count; k++) {
        const p = this.escortSlot(zombie, k, guards.zombie);
        const gx = Math.max(-hw, Math.min(hw, p.x)), gz = Math.max(-hd, Math.min(hd, p.z));
        const g = this.addZombie(guards.zombie, gx, gz);
        g.leader = zombie.id;
        g.slot = k;
      }
    }
    return zombie;
  }

  private addZombie(type: ZombieId, x: number, z: number): Zombie {
    const zombie: Zombie = {
      id: this.nextId++, type, x, z, hp: ZOMBIES[type].hp,
      slowTimer: 0, slowFactor: 1, facing: Math.PI, attacking: null, target: null, wanderBelow: 0, visited: [],
      leader: null, slot: 0, detour: 0, grave: -1, rising: 0,
      reload: ZOMBIES[type].goo?.first ?? ZOMBIES[type].riff?.first ?? 0,
      summonIn: ZOMBIES[type].summon?.first ?? ZOMBIES[type].raiseDead?.first ?? ZOMBIES[type].heal?.first ?? 0, halted: 0,
      gun: 0, gunIn: ZOMBIES[type].arsenal?.every ?? 0,
      riffs: 0, moshing: false, rocking: 0, surging: 0,
    };
    this.zombies.push(zombie);
    return zombie;
  }

  /**
   * A tombstone (any rock without a `look`) far enough from the bases comes
   * up as a zombie. The rock is gone for good, opening up the way through.
   */
  private raiseGrave(type: ZombieId): Zombie | undefined {
    const rise = ZOMBIES[type].rise ?? { time: 0, minPathDistance: 0 };
    if (this.fieldDirty) this.refreshField();
    const graves: number[] = [];
    for (const [i, r] of this.map.rocks.entries()) {
      if (r.look || this.risen.has(i)) continue;
      // How far it would walk from here (the cells round the stone; under it is blocked).
      let walk = Infinity;
      this.nav.forCellsInCircle(r.x, r.z, r.r + 0.6, (cell) => { walk = Math.min(walk, this.nav.dist[cell]); });
      if (walk >= rise.minPathDistance && walk < Infinity) graves.push(i);
    }
    if (graves.length === 0) return undefined;
    const rock = graves[Math.floor(this.rand() * graves.length)];
    return this.riseFrom([rock], type)[0];
  }

  /** These tombstones come up as zombies, and are gone from the map for good. */
  private riseFrom(rocks: number[], type: ZombieId): Zombie[] {
    for (const rock of rocks) this.risen.add(rock);
    this.markObstacles();
    for (const p of this.plants) this.markPlant(p);
    this.fieldDirty = true;
    return rocks.map((rock) => {
      const { x, z } = this.map.rocks[rock];
      const zombie = this.addZombie(type, x, z);
      zombie.grave = rock;
      zombie.rising = ZOMBIES[type].rise?.time ?? 0;
      // Tombstones face the front (south); so does whatever climbs out of one.
      zombie.facing = -Math.PI / 2;
      this.events.push({ t: 'graveRisen', rock, x, z });
      return zombie;
    });
  }

  /** Block the cells under standing rocks and ravines (and an arena's stands and seats). */
  private markObstacles(): void {
    this.nav.blocked.fill(0);
    for (const [i, r] of this.map.rocks.entries()) if (!this.risen.has(i)) this.nav.addRock(r);
    for (const c of this.map.ravines) this.nav.addRect(c);
    for (const b of this.map.barriers ?? []) this.nav.addRect(b);
    if (this.map.fan) this.nav.blockWhere((x, z) => !onFloor(this.map, x, z));
    const seats = this.map.seats ?? [];
    if (seats.length) this.nav.blockWhere((x, z) => seats.some((s) => inSeatRow(s, x, z)));
  }

  /** Where bodyguard number `slot` stands: beside the leader's left, right, and behind. */
  private escortSlot(leader: Zombie, slot: number, guardType: ZombieId): { x: number; z: number } {
    const angles = [1.3, -1.3, Math.PI];
    const a = leader.facing + angles[slot % angles.length];
    const d = ZOMBIES[leader.type].radius + ZOMBIES[guardType].radius + 1.6 + Math.floor(slot / angles.length) * 2;
    return { x: leader.x + Math.cos(a) * d, z: leader.z + Math.sin(a) * d };
  }

  private updatePlants(): void {
    const hyper = this.hyperTimer > 0 ? ABILITIES.hyperSun.multiplier : 1;
    const worn: Plant[] = [];
    for (const p of this.plants) {
      if (p.zombified > 0) {
        p.zombified -= DT;
        if (p.zombified <= 0) worn.push(p);
      }
    }
    this.cure(worn, 'time');
    for (const p of this.plants) {
      const atk = PLANTS[p.type].attack;
      if (!atk) continue;
      if (p.zombified > 0) {
        this.turnedAttack(p, atk);
        continue;
      }
      p.cooldown -= DT * hyper;
      const target = this.nearestZombie(p.x, p.z, atk.range, atk.canHitGround, atk.canHitAir);
      if (target) p.facing = Math.atan2(target.z - p.z, target.x - p.x);
      if (p.cooldown > 0 || !target) continue;
      p.cooldown = 1 / atk.rate;
      this.damageZombie(target, atk.damage);
      if (atk.slow) {
        target.slowTimer = atk.slow.duration;
        target.slowFactor = atk.slow.factor;
      }
      this.events.push({
        t: 'shot', plantId: p.id, kind: p.type, fromX: p.x, fromZ: p.z,
        toX: target.x, toZ: target.z, toAir: ZOMBIES[target.type].flying,
      });
    }
  }

  /** A zombified plant shoots whatever of the player's is nearest: a base or a healthy plant. */
  private turnedAttack(p: Plant, atk: NonNullable<PlantDef['attack']>): void {
    p.cooldown -= DT;
    let base: Structure | undefined, plant: Plant | undefined;
    let best = atk.range;
    for (const s of this.structures) {
      if (!s.alive) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z) - STRUCTURES[s.type].radius;
      if (d <= best) {
        best = d;
        base = s;
      }
    }
    for (const o of this.plants) {
      if (o.zombified > 0 || o.hp <= 0) continue;
      const d = distanceToPlant(o, p.x, p.z);
      if (d <= best) {
        best = d;
        plant = o;
        base = undefined;
      }
    }
    const target = plant ?? base;
    if (!target) return;
    p.facing = Math.atan2(target.z - p.z, target.x - p.x);
    if (p.cooldown > 0) return;
    p.cooldown = 1 / atk.rate;
    if (plant) plant.hp -= atk.damage;
    else this.damageStructure(base!, atk.damage);
    this.events.push({
      t: 'shot', plantId: p.id, kind: p.type, fromX: p.x, fromZ: p.z, toX: target.x, toZ: target.z, toAir: false, turned: true,
    });
  }

  /** Goo sprayers zombify the nearest healthy plant in range and those round it, walking as they go. */
  private sprayGoo(zb: Zombie): void {
    const goo = ZOMBIES[zb.type].goo!;
    zb.reload -= DT;
    if (zb.reload > 0) return;
    let target: Plant | undefined;
    let best = goo.range;
    for (const p of this.plants) {
      if (p.hp <= 0 || p.zombified > 0) continue;
      const d = distanceToPlant(p, zb.x, zb.z);
      if (d <= best) {
        best = d;
        target = p;
      }
    }
    if (!target) return;
    zb.reload = goo.every;
    const { x, z } = target;
    const ids: number[] = [];
    for (const p of this.plants) {
      if (p.hp <= 0 || p.zombified > 0 || distanceToPlant(p, x, z) > goo.radius) continue;
      p.zombified = goo.duration;
      p.cooldown = Math.max(p.cooldown, 0.6); // a moment to swivel round
      this.nav.clearPlant(p.id);
      ids.push(p.id);
    }
    this.remarkNear({ x, z });
    this.fieldDirty = true;
    this.events.push({ t: 'gooSprayed', id: zb.id, x, z, radius: goo.radius, ids });
  }

  /** Back to normal: these plants fight for the player again (and block the way again). */
  private cure(plants: Plant[], by: 'strike' | 'time' | 'bossDown'): void {
    if (plants.length === 0) return;
    for (const p of plants) {
      p.zombified = 0;
      this.markPlant(p);
    }
    this.fieldDirty = true;
    this.events.push({ t: 'plantsCured', ids: plants.map((p) => p.id), by });
  }

  private nearestZombie(x: number, z: number, range: number, ground: boolean, air: boolean): Zombie | undefined {
    let best: Zombie | undefined;
    let bestD = range;
    for (const zb of this.zombies) {
      if (zb.hp <= 0) continue;
      const flying = ZOMBIES[zb.type].flying;
      if (flying ? !air : !ground) continue;
      // Big zombies can be hit from further away.
      const d = Math.hypot(zb.x - x, zb.z - z) - ZOMBIES[zb.type].radius;
      if (d <= bestD) {
        best = zb;
        bestD = d;
      }
    }
    return best;
  }

  private damageZombie(z: Zombie, amount: number): void {
    z.hp -= amount * (1 - ZOMBIES[z.type].armor) * (z.moshing ? 1 - MOSH.shield : 1);
  }

  /**
   * In the mosh pit: rock out (barely moving), then surge (super speed), over
   * and over, behind a rock shield. Returns the speed multiplier for now.
   */
  private mosh(zb: Zombie): number {
    const def = ZOMBIES[zb.type];
    const pit = this.map.moshPit;
    const inPit = !!pit && !def.boss && !def.giant && !def.flying && inCircle(pit, zb.x, zb.z);
    if (!inPit) {
      zb.moshing = false;
      zb.rocking = zb.surging = 0;
      return 1;
    }
    const rockFor = () => MOSH.rockTime[0] + this.rand() * (MOSH.rockTime[1] - MOSH.rockTime[0]);
    if (!zb.moshing) {
      zb.moshing = true;
      zb.rocking = rockFor();
    }
    if (zb.rocking > 0) {
      zb.rocking -= DT;
      if (zb.rocking <= 0) {
        zb.rocking = 0;
        zb.surging = MOSH.surgeTime;
      }
    } else {
      zb.surging -= DT;
      if (zb.surging <= 0) {
        zb.surging = 0;
        zb.rocking = rockFor();
      }
    }
    return zb.rocking > 0 ? MOSH.rockSpeed : MOSH.surgeSpeed;
  }

  private updateZombies(): void {
    for (const zb of this.zombies) {
      if (zb.hp <= 0) continue;
      const def = ZOMBIES[zb.type];
      if (zb.slowTimer > 0) zb.slowTimer -= DT;
      const speed = def.speed * (zb.slowTimer > 0 ? zb.slowFactor : 1) * this.mosh(zb);
      zb.attacking = null;

      if (zb.rising > 0) {
        zb.rising = Math.max(0, zb.rising - DT);
        continue;
      }
      if (def.raiseDead && this.raiseDead(zb)) continue;
      if (def.rockets || def.arsenal) this.fireRocket(zb);
      if (def.heal) this.healAround(zb);
      if (def.summon) this.summonCrew(zb);
      if (def.goo) this.sprayGoo(zb);
      if (def.riff) this.playRiff(zb);

      if (def.giant) {
        this.updateGiant(zb, speed);
        continue;
      }

      if (zb.leader !== null) {
        const leader = this.zombies.find((o) => o.id === zb.leader && o.hp > 0);
        if (leader) {
          this.updateEscort(zb, leader, speed);
          continue;
        }
        zb.leader = null; // the boss is gone: carry on alone
      }

      const target = this.nearestStructure(zb.x, zb.z);
      if (!target) continue;
      const reach = STRUCTURES[target.type].radius + def.radius + 0.25;
      if (Math.hypot(target.x - zb.x, target.z - zb.z) <= reach) {
        zb.attacking = { kind: 'structure', index: target.index };
        zb.facing = Math.atan2(target.z - zb.z, target.x - zb.x);
        this.damageStructure(target, def.dps * DT);
        continue;
      }

      if (def.flying) {
        this.moveToward(zb, target.x, target.z, speed * DT);
        continue;
      }

      const cell = this.nav.cellOf(zb.x, zb.z);
      const next = this.nav.bestStep(cell);
      if (next < 0) {
        // Already in the closest cell (e.g. standing at a structure's edge).
        this.moveToward(zb, target.x, target.z, speed * DT);
        continue;
      }
      const plantId = this.nav.plantAt[next];
      if (plantId >= 0 && plantId !== this.nav.plantAt[cell]) {
        const plant = this.plants.find((p) => p.id === plantId);
        if (plant && plant.hp > 0) {
          this.attackPlant(zb, plant);
          continue;
        }
      }
      this.moveToward(zb, this.nav.centerX(next), this.nav.centerZ(next), speed * DT);
    }
    this.separateZombies();
  }

  /** The gun it's holding: its only one, or (an arsenal) whichever it's switched to. */
  private gunOf(zb: Zombie): Gun {
    const def = ZOMBIES[zb.type];
    return def.arsenal ? def.arsenal.guns[zb.gun] : def.rockets!;
  }

  /**
   * Rocketeers (and knife throwers, gunners, grenadiers) fire at the nearest
   * plants in range (a volley at several), or a base if there are none,
   * walking as they go. Arsenal carriers switch guns every so often.
   */
  private fireRocket(zb: Zombie): void {
    const arsenal = ZOMBIES[zb.type].arsenal;
    if (arsenal) {
      zb.gunIn -= DT;
      if (zb.gunIn <= 0) {
        zb.gunIn = arsenal.every;
        zb.gun = (zb.gun + 1) % arsenal.guns.length;
        zb.reload = Math.max(zb.reload, 0.8); // a moment to swap
        this.events.push({ t: 'gunSwitched', id: zb.id, look: arsenal.guns[zb.gun].look ?? 'rocket' });
      }
    }
    const r = this.gunOf(zb);
    zb.reload -= DT;
    if (zb.reload > 0) return;
    const near = this.plants
      .filter((p) => p.hp > 0 && p.zombified <= 0)
      .map((p) => ({ p, d: distanceToPlant(p, zb.x, zb.z) }))
      .filter((n) => n.d <= r.range)
      .sort((a, b) => a.d - b.d);
    let targets: { x: number; z: number }[] = near.slice(0, r.volley ?? 1).map((n) => n.p);
    if (targets.length === 0) {
      const s = this.nearestStructure(zb.x, zb.z);
      if (s && Math.hypot(s.x - zb.x, s.z - zb.z) - STRUCTURES[s.type].radius <= r.range) {
        // Aim at the near wall, not the middle.
        const d = Math.hypot(s.x - zb.x, s.z - zb.z) || 1;
        const k = (d - STRUCTURES[s.type].radius * 0.7) / d;
        targets = [{ x: zb.x + (s.x - zb.x) * k, z: zb.z + (s.z - zb.z) * k }];
      }
    }
    if (targets.length === 0) return;
    zb.reload = r.every;
    const look = r.look ?? 'rocket';
    for (const target of targets) {
      const flight = Math.max(look === 'bullet' ? 0.1 : 0.3, Math.hypot(target.x - zb.x, target.z - zb.z) / r.speed);
      this.rockets.push({ x: target.x, z: target.z, timer: flight, damage: r.damage, radius: r.radius, look });
      this.events.push({ t: 'rocketFired', id: zb.id, fromX: zb.x, fromZ: zb.z, toX: target.x, toZ: target.z, flight, look });
    }
  }

  /** Healers patch up every other zombie round them, every so often (once someone's hurt). */
  private healAround(zb: Zombie): void {
    const h = ZOMBIES[zb.type].heal!;
    zb.summonIn -= DT;
    if (zb.summonIn > 0) return;
    const hurt = this.zombies.filter((o) => o !== zb && o.hp > 0 && o.hp < ZOMBIES[o.type].hp && Math.hypot(o.x - zb.x, o.z - zb.z) <= h.radius);
    if (hurt.length === 0) {
      zb.summonIn = 1;
      return;
    }
    zb.summonIn = h.every;
    for (const o of hurt) o.hp = Math.min(ZOMBIES[o.type].hp, o.hp + ZOMBIES[o.type].hp * h.amount);
    this.events.push({ t: 'healed', id: zb.id, x: zb.x, z: zb.z, radius: h.radius, ids: hurt.map((o) => o.id) });
  }

  /**
   * Riff players aim at the nearest plant in range (or a base, if there's
   * none), and take turns: a cone of flame, then a bolt of lightning that
   * jumps from plant to plant.
   */
  private playRiff(zb: Zombie): void {
    const r = ZOMBIES[zb.type].riff!;
    zb.reload -= DT;
    if (zb.reload > 0) return;
    let plant: Plant | undefined;
    let best = r.range;
    for (const p of this.plants) {
      if (p.hp <= 0) continue;
      const d = distanceToPlant(p, zb.x, zb.z);
      if (d <= best) {
        best = d;
        plant = p;
      }
    }
    let base: Structure | undefined;
    if (!plant) {
      const s = this.nearestStructure(zb.x, zb.z);
      if (s && Math.hypot(s.x - zb.x, s.z - zb.z) - STRUCTURES[s.type].radius <= r.range) base = s;
    }
    const target = plant ?? base;
    if (!target) return;
    zb.reload = r.every;
    const flame = zb.riffs++ % 2 === 0;
    const aim = Math.atan2(target.z - zb.z, target.x - zb.x);
    zb.facing = aim;
    if (flame) {
      const { damage, spread } = r.flame;
      // Everything in the cone (bases too, if the flame reaches them).
      const inCone = (x: number, z: number, d: number) => {
        const off = Math.abs(((Math.atan2(z - zb.z, x - zb.x) - aim + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        return d <= r.range && off <= spread;
      };
      for (const p of this.plants) if (inCone(p.x, p.z, distanceToPlant(p, zb.x, zb.z))) p.hp -= damage;
      for (const s of this.structures) {
        if (s.alive && inCone(s.x, s.z, Math.hypot(s.x - zb.x, s.z - zb.z) - STRUCTURES[s.type].radius)) this.damageStructure(s, damage);
      }
      this.events.push({
        t: 'flameRiff', id: zb.id, x: zb.x, z: zb.z,
        toX: zb.x + Math.cos(aim) * r.range, toZ: zb.z + Math.sin(aim) * r.range, range: r.range, spread,
      });
      return;
    }
    const { damage, jumps, reach } = r.zap;
    const chain = [{ x: target.x, z: target.z }];
    if (base) {
      this.damageStructure(base, damage);
    } else {
      // Jump on from plant to plant, never the same one twice.
      const hit = new Set<Plant>([plant!]);
      plant!.hp -= damage;
      let last = plant!;
      for (let k = 0; k < jumps; k++) {
        let next: Plant | undefined;
        let nd = reach;
        for (const p of this.plants) {
          if (hit.has(p) || p.hp <= 0) continue;
          const d = distanceToPlant(p, last.x, last.z);
          if (d <= nd) {
            nd = d;
            next = p;
          }
        }
        if (!next) break;
        hit.add(next);
        next.hp -= damage;
        chain.push({ x: next.x, z: next.z });
        last = next;
      }
    }
    this.events.push({ t: 'zapRiff', id: zb.id, chain });
  }

  /** Rockets land: every plant in the blast is hurt, and any base it reaches. */
  private updateRockets(): void {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.timer -= DT;
      if (r.timer > 0) continue;
      for (const p of this.plants) if (distanceToPlant(p, r.x, r.z) <= r.radius) p.hp -= r.damage;
      for (const s of this.structures) {
        if (s.alive && Math.hypot(s.x - r.x, s.z - r.z) <= STRUCTURES[s.type].radius + r.radius) this.damageStructure(s, r.damage);
      }
      this.events.push({ t: 'rocketHit', x: r.x, z: r.z, radius: r.radius, look: r.look });
      this.rockets.splice(i, 1);
    }
  }

  /** Summoners call up a few zombies in a ring around themselves, every so often. */
  private summonCrew(zb: Zombie): void {
    const s = ZOMBIES[zb.type].summon!;
    zb.summonIn -= DT;
    if (zb.summonIn > 0) return;
    zb.summonIn = s.min + this.rand() * (s.max - s.min);
    const ids: number[] = [];
    const d = ZOMBIES[zb.type].radius + ZOMBIES[s.zombie].radius + 0.8;
    const hw = this.map.width / 2 - 0.5, hd = this.map.depth / 2 - 0.5;
    for (let k = 0; k < s.count; k++) {
      // Spread round it, starting from a random side; skip spots in rocks and ravines.
      const a0 = this.rand() * Math.PI * 2;
      for (let tries = 0; tries < 8; tries++) {
        const a = a0 + (k / s.count) * Math.PI * 2 + tries * 0.7;
        const x = Math.max(-hw, Math.min(hw, zb.x + Math.cos(a) * d));
        const z = Math.max(-hd, Math.min(hd, zb.z + Math.sin(a) * d));
        if (this.nav.blocked[this.nav.cellOf(x, z)]) continue;
        const minion = this.addZombie(s.zombie, x, z);
        minion.facing = zb.facing;
        ids.push(minion.id);
        break;
      }
    }
    if (ids.length) this.events.push({ t: 'summoned', id: zb.id, ids });
  }

  /**
   * Now and then, stop and call the tombstones round about up out of the
   * ground. True while it's standing still doing it.
   */
  private raiseDead(zb: Zombie): boolean {
    const r = ZOMBIES[zb.type].raiseDead!;
    if (zb.halted > 0) {
      zb.halted = Math.max(0, zb.halted - DT);
      return true;
    }
    zb.summonIn -= DT;
    if (zb.summonIn > 0) return false;
    const near: { rock: number; d: number }[] = [];
    for (const [i, rock] of this.map.rocks.entries()) {
      if (rock.look || this.risen.has(i)) continue;
      const d = Math.hypot(rock.x - zb.x, rock.z - zb.z);
      if (d <= r.reach) near.push({ rock: i, d });
    }
    if (near.length === 0) {
      zb.summonIn = 1;
      return false;
    }
    near.sort((a, b) => a.d - b.d);
    const rocks = near.slice(0, r.max).map((n) => n.rock);
    zb.summonIn = r.every;
    zb.halted = r.pause;
    const ids = this.riseFrom(rocks, r.zombie).map((z) => z.id);
    this.events.push({ t: 'deadRaised', id: zb.id, x: zb.x, z: zb.z, rocks, ids });
    return true;
  }

  /** Chew (or, with a sweeping weapon, slash everything in reach). */
  private attackPlant(zb: Zombie, plant: Plant): void {
    const def = ZOMBIES[zb.type];
    zb.attacking = { kind: 'plant', id: plant.id };
    zb.facing = Math.atan2(plant.z - zb.z, plant.x - zb.x);
    if (def.sweep) {
      for (const p of this.plants) {
        if (distanceToPlant(p, zb.x, zb.z) <= def.radius + def.sweep) p.hp -= def.dps * DT;
      }
    } else {
      plant.hp -= def.dps * DT;
    }
    if (this.chompTimer <= 0) {
      this.chompTimer = 0.4;
      this.events.push({ t: 'chomp', x: zb.x, z: zb.z });
    }
  }

  /**
   * Bodyguards keep their place beside the leader, slashing plants and
   * attacking bases within reach. Obstacles in the way? Path around them.
   */
  private updateEscort(zb: Zombie, leader: Zombie, speed: number): void {
    const def = ZOMBIES[zb.type];

    const base = this.nearestStructure(zb.x, zb.z);
    if (base && Math.hypot(base.x - zb.x, base.z - zb.z) <= STRUCTURES[base.type].radius + def.radius + 0.25) {
      zb.attacking = { kind: 'structure', index: base.index };
      zb.facing = Math.atan2(base.z - zb.z, base.x - zb.x);
      this.damageStructure(base, def.dps * DT);
      return;
    }

    const plant = this.plants.find((p) => p.hp > 0 && p.zombified <= 0 && distanceToPlant(p, zb.x, zb.z) <= def.radius + 0.6);
    if (plant) {
      this.attackPlant(zb, plant);
      return;
    }

    const slot = this.escortSlot(leader, zb.slot, zb.type);
    const dx = slot.x - zb.x, dz = slot.z - zb.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.3) {
      zb.facing = leader.facing;
      return;
    }
    const step = Math.min(dist, speed * DT);
    const nx = zb.x + (dx / dist) * step, nz = zb.z + (dz / dist) * step;
    // Cut off (on the far side of a wall, say): its walk is much longer than
    // the leader's, so take the normal route to catch up.
    const behind = this.nav.dist[this.nav.cellOf(zb.x, zb.z)] - this.nav.dist[this.nav.cellOf(leader.x, leader.z)];
    if (behind > ESCORT_STRAY) zb.detour = Math.max(zb.detour, DT);
    if (zb.detour > 0) zb.detour -= DT;
    else if (!this.nav.blocked[this.nav.cellOf(nx, nz)]) {
      zb.x = nx;
      zb.z = nz;
      zb.facing = Math.atan2(dz, dx);
      return;
    } else {
      // Keep to the route for a while, or it would step back to the rim and stick there.
      zb.detour = ESCORT_DETOUR;
    }
    // Ravine or rock in the way: take the normal route (it heads the same way the boss does).
    const next = this.nav.bestStep(this.nav.cellOf(zb.x, zb.z));
    if (next >= 0) this.moveToward(zb, this.nav.centerX(next), this.nav.centerZ(next), speed * DT);
  }

  /** Giants pick a base, walk straight at it over anything, and stomp plants on the way. */
  private updateGiant(zb: Zombie, speed: number): void {
    const def = ZOMBIES[zb.type];
    let target = zb.target === null ? undefined : this.structures[zb.target];

    // Time to wander? (Or the base is gone.)
    const fraction = def.wanderEvery;
    if (target && fraction) {
      const watching = def.wanderOn === 'self' ? zb.hp : target.hp;
      if (!target.alive || watching <= zb.wanderBelow) target = this.pickWanderTarget(zb, target);
    } else if (!target || !target.alive) {
      target = this.nearestStructure(zb.x, zb.z);
      if (target) this.setGiantTarget(zb, target);
    }
    if (!target) return;

    const dx = target.x - zb.x, dz = target.z - zb.z;
    const dist = Math.hypot(dx, dz);
    zb.facing = Math.atan2(dz, dx);
    if (dist <= STRUCTURES[target.type].radius + def.radius + 0.25) {
      zb.attacking = { kind: 'structure', index: target.index };
      this.damageStructure(target, def.dps * DT);
      return;
    }

    // Plants in front block the way: stomp everything nearby until they're gone.
    const blocker = this.plants.find((p) => {
      const px = p.x - zb.x, pz = p.z - zb.z;
      return p.hp > 0 && p.zombified <= 0 && distanceToPlant(p, zb.x, zb.z) < def.radius + 0.3 && px * dx + pz * dz > 0;
    });
    if (blocker) {
      zb.attacking = { kind: 'plant', id: blocker.id };
      const r = def.giant!.stompRadius;
      for (const p of this.plants) {
        if (distanceToPlant(p, zb.x, zb.z) <= r) p.hp -= def.dps * DT;
      }
      if (this.chompTimer <= 0) {
        this.chompTimer = 0.6;
        this.events.push({ t: 'stomp', x: zb.x, z: zb.z });
      }
      return;
    }

    const step = Math.min(dist, speed * DT);
    zb.x += (dx / dist) * step;
    zb.z += (dz / dist) * step;
  }

  private setGiantTarget(zb: Zombie, s: Structure): void {
    zb.target = s.index;
    zb.visited[s.index] = this.tick;
    const fraction = ZOMBIES[zb.type].wanderEvery;
    if (!fraction) return;
    // Next threshold below where we are now (e.g. 100% → 75%, 60% → 50%).
    const self = ZOMBIES[zb.type].wanderOn === 'self';
    const hp = self ? zb.hp : s.hp;
    const max = self ? ZOMBIES[zb.type].hp : STRUCTURES[s.type].hp;
    const step = fraction * max;
    zb.wanderBelow = (Math.ceil(hp / step - 1e-9) - 1) * step;
  }

  /**
   * Head for another standing base: the one visited longest ago (or never),
   * nearest first on a tie. Stays put if it's the last one standing.
   */
  private pickWanderTarget(zb: Zombie, current: Structure): Structure | undefined {
    let best: Structure | undefined;
    let bestVisit = Infinity, bestD = Infinity;
    for (const s of this.structures) {
      if (!s.alive || s === current) continue;
      const visit = zb.visited[s.index] ?? -1;
      const d = Math.hypot(s.x - zb.x, s.z - zb.z);
      if (visit < bestVisit || (visit === bestVisit && d < bestD)) {
        best = s;
        bestVisit = visit;
        bestD = d;
      }
    }
    const next = best ?? (current.alive ? current : undefined);
    if (!next) return undefined;
    this.setGiantTarget(zb, next);
    if (next !== current) this.events.push({ t: 'wander', type: zb.type, to: next.index });
    return next;
  }

  private moveToward(zb: Zombie, tx: number, tz: number, dist: number): void {
    const dx = tx - zb.x, dz = tz - zb.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return;
    const s = Math.min(1, dist / len);
    zb.x += dx * s;
    zb.z += dz * s;
    zb.facing = Math.atan2(dz, dx);
  }

  /** Gently push overlapping ground zombies apart so crowds spread out. */
  private separateZombies(): void {
    const list = this.zombies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (ZOMBIES[a.type].flying || ZOMBIES[a.type].giant) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (ZOMBIES[b.type].flying || ZOMBIES[b.type].giant) continue;
        const min = ZOMBIES[a.type].radius + ZOMBIES[b.type].radius;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.25;
        const nx = dx / d, nz = dz / d;
        this.nudge(a, -nx * push, -nz * push);
        this.nudge(b, nx * push, nz * push);
      }
    }
  }

  private nudge(zb: Zombie, dx: number, dz: number): void {
    const x = zb.x + dx, z = zb.z + dz;
    const cell = this.nav.cellOf(x, z);
    if (this.nav.blocked[cell] || this.nav.plantAt[cell] >= 0) return;
    if (Math.abs(x) > this.map.width / 2 || Math.abs(z) > this.map.depth / 2) return;
    zb.x = x;
    zb.z = z;
  }

  private nearestStructure(x: number, z: number): Structure | undefined {
    let best: Structure | undefined;
    let bestD = Infinity;
    for (const s of this.structures) {
      if (!s.alive) continue;
      const d = Math.hypot(s.x - x, s.z - z) - STRUCTURES[s.type].radius;
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  private damageStructure(s: Structure, amount: number): void {
    s.hp -= amount;
    if (this.structureHitTimer[s.index] <= 0) {
      this.structureHitTimer[s.index] = 0.6;
      this.events.push({ t: 'structureHit', index: s.index });
    }
    if (s.hp <= 0 && s.alive) {
      s.hp = 0;
      s.alive = false;
      this.fieldDirty = true;
      this.events.push({ t: 'structureDestroyed', index: s.index });
    }
  }

  private updateStrikes(): void {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.timer -= DT;
      if (s.timer > 0) continue;
      const { radius, damage } = ABILITIES.orbitalStrike;
      for (const zb of this.zombies) {
        if (zb.hp <= 0 || Math.hypot(zb.x - s.x, zb.z - s.z) > radius + ZOMBIES[zb.type].radius) continue;
        this.damageZombie(zb, damage);
        if (zb.hp <= 0) this.struckDown.add(zb.id);
      }
      // The laser burns the goo off any plant it touches (and doesn't hurt the plant).
      this.cure(this.plants.filter((p) => p.zombified > 0 && distanceToPlant(p, s.x, s.z) <= radius), 'strike');
      this.events.push({ t: 'strikeHit', x: s.x, z: s.z, radius });
      this.strikes.splice(i, 1);
    }
  }

  private removeDead(): void {
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const zb = this.zombies[i];
      if (zb.hp > 0) continue;
      const by = this.struckDown.delete(zb.id) ? 'strike' : 'plant';
      const def = ZOMBIES[zb.type];
      this.score += def.boss ? SCORE.boss : Math.round(def.hp * SCORE.perZombieHp);
      // The goo dies with whoever sprayed it.
      if (def.goo && !this.zombies.some((o) => o !== zb && o.hp > 0 && ZOMBIES[o.type].goo)) {
        this.cure(this.plants.filter((p) => p.zombified > 0), 'bossDown');
      }
      this.events.push({ t: 'zombieDied', id: zb.id, type: zb.type, x: zb.x, z: zb.z, by });
      this.zombies.splice(i, 1);
    }
    for (let i = this.plants.length - 1; i >= 0; i--) {
      const p = this.plants[i];
      if (p.hp > 0) continue;
      this.events.push({ t: 'plantDied', id: p.id, x: p.x, z: p.z });
      this.removePlantAt(i);
    }
  }

  private removePlantAt(i: number): void {
    const [plant] = this.plants.splice(i, 1);
    this.nav.clearPlant(plant.id);
    // Neighbors may have shared cells with this plant; restore their claim.
    this.remarkNear(plant);
    this.fieldDirty = true;
  }

  private checkEnd(): void {
    const vitalLost = this.structures.some((s) => !s.alive && STRUCTURES[s.type].vital);
    if (vitalLost) {
      this.phase = 'lost';
      this.events.push({ t: 'lost' });
      return;
    }
    if (this.spawnQueue.length > 0 || this.zombies.length > 0) return;

    const cleared = this.wave;
    this.cure(this.plants.filter((p) => p.zombified > 0), 'time');
    for (const p of this.plants) p.hp = PLANTS[p.type].hp;
    this.strikes.length = 0;
    this.rockets.length = 0;
    this.hyperTimer = 0;
    this.cooldowns.orbitalStrike = 0;
    this.cooldowns.hyperSun = 0;
    this.wave++;
    this.score += SCORE.waveClear * this.wave;
    if (this.wave >= this.totalWaves) {
      this.phase = 'won';
      for (const s of this.structures) {
        if (s.alive) this.score += Math.round((SCORE.baseSaved * s.hp) / STRUCTURES[s.type].hp);
      }
      this.events.push({ t: 'waveCleared', wave: cleared, bonus: 0 });
      this.events.push({ t: 'won' });
    } else {
      this.phase = 'build';
      this.sun += ECONOMY.waveClearBonus;
      this.events.push({ t: 'waveCleared', wave: cleared, bonus: ECONOMY.waveClearBonus });
    }
  }

  /** Path cost of crossing one cell of this plant, in map units of "detour". */
  private plantPathCost(type: PlantId): number {
    const def = PLANTS[type];
    const chewSeconds = def.hp / NOMINAL_CHEW_DPS;
    const cellsAcross = thicknessAcross(type) / CELL;
    return (chewSeconds * NOMINAL_SPEED) / cellsAcross;
  }

  private refreshField(): void {
    this.nav.computeField(
      this.structures
        .filter((s) => s.alive)
        .map((s) => ({ x: s.x, z: s.z, radius: STRUCTURES[s.type].radius })),
    );
    this.fieldDirty = false;
  }

  /**
   * Debug: go to the build phase of wave `n` (0-based) with every base
   * repaired, plants healed, and no zombies about. Works even after a loss.
   */
  jumpToWave(n: number): void {
    this.wave = Math.max(0, Math.min(this.totalWaves - 1, Math.floor(n)));
    this.phase = 'build';
    this.zombies.length = 0;
    this.struckDown.clear();
    this.strikes.length = 0;
    this.rockets.length = 0;
    this.spawnQueue = [];
    this.waveTime = 0;
    this.hyperTimer = 0;
    this.cooldowns.orbitalStrike = 0;
    this.cooldowns.hyperSun = 0;
    this.cure(this.plants.filter((p) => p.zombified > 0), 'time');
    for (const p of this.plants) p.hp = PLANTS[p.type].hp;
    for (const s of this.structures) {
      s.hp = STRUCTURES[s.type].hp;
      s.alive = true;
    }
    this.refreshField();
    this.events.push({ t: 'jumped', wave: this.wave });
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}

function buildSpawnQueue(groups: SpawnGroup[]): QueuedSpawn[] {
  const queue: QueuedSpawn[] = [];
  for (const g of groups) {
    for (let i = 0; i < g.count; i++) {
      queue.push({ time: g.delay + i * g.every, zombie: g.zombie, edge: g.edge });
    }
  }
  return queue.sort((a, b) => a.time - b.time);
}
