import {
  ABILITIES, ECONOMY, MAP, PLANTS, STRUCTURES, WAVES, ZOMBIES,
  type AbilityId, type EdgeId, type PlantId, type SpawnGroup, type StructureId, type ZombieId,
} from '../data/config';
import { CELL, NavGrid } from './nav';

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
}

export interface Structure {
  index: number;
  type: StructureId;
  x: number;
  z: number;
  hp: number;
  alive: boolean;
}

export interface Strike { x: number; z: number; timer: number }

export type SimEvent =
  | { t: 'shot'; plantId: number; kind: PlantId; fromX: number; fromZ: number; toX: number; toZ: number; toAir: boolean }
  | { t: 'zombieDied'; type: ZombieId; x: number; z: number }
  | { t: 'plantPlaced'; id: number }
  | { t: 'plantSold'; id: number }
  | { t: 'plantDied'; id: number; x: number; z: number }
  | { t: 'chomp'; x: number; z: number }
  | { t: 'stomp'; x: number; z: number }
  | { t: 'bossSpawn'; type: ZombieId }
  | { t: 'wander'; type: ZombieId; to: number }
  | { t: 'structureHit'; index: number }
  | { t: 'structureDestroyed'; index: number }
  | { t: 'strikeTargeted'; x: number; z: number; delay: number }
  | { t: 'strikeHit'; x: number; z: number; radius: number }
  | { t: 'hyperSun' }
  | { t: 'waveStart'; wave: number }
  | { t: 'waveCleared'; wave: number; bonus: number }
  | { t: 'won' }
  | { t: 'lost' }
  | { t: 'jumped'; wave: number };

export type PlaceResult = { ok: true; plant: Plant } | { ok: false; reason: string };
export type AbilityResult = { ok: true } | { ok: false; reason: string };

export interface WavePreviewLine { edge: EdgeId; zombie: ZombieId; count: number }

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

interface QueuedSpawn { time: number; zombie: ZombieId; edge: EdgeId }

export class Game {
  phase: Phase = 'build';
  /** Index of the wave being fought, or the next one during build. */
  wave = 0;
  readonly totalWaves = WAVES.length;
  sun = ECONOMY.startingSun;
  readonly plants: Plant[] = [];
  readonly zombies: Zombie[] = [];
  readonly structures: Structure[];
  readonly strikes: Strike[] = [];
  readonly nav: NavGrid;
  readonly cooldowns: Record<AbilityId, number> = { orbitalStrike: 0, hyperSun: 0 };
  hyperTimer = 0;
  /** Events since the last drain; the renderer and sound read these. */
  events: SimEvent[] = [];

  private nextId = 1;
  private tick = 0;
  private waveTime = 0;
  private spawnQueue: QueuedSpawn[] = [];
  private fieldDirty = true;
  private chompTimer = 0;
  private structureHitTimer: number[];
  private readonly rand: () => number;

  constructor(seed = 1) {
    this.rand = mulberry32(seed);
    this.nav = new NavGrid(MAP.width, MAP.depth);
    for (const r of MAP.rocks) this.nav.addRock(r);
    for (const c of MAP.ravines) this.nav.addRavine(c);
    this.structures = MAP.structures.map((s, index) => ({
      index, type: s.id, x: s.x, z: s.z, hp: STRUCTURES[s.id].hp, alive: true,
    }));
    this.structureHitTimer = this.structures.map(() => 0);
    this.refreshField();
  }

  // --------------------------------------------------------------------------
  //  Player actions
  // --------------------------------------------------------------------------

  canPlace(type: PlantId, x: number, z: number): { ok: true } | { ok: false; reason: string } {
    if (this.phase !== 'build') return { ok: false, reason: 'You can only plant before the wave.' };
    const def = PLANTS[type];
    if (this.sun < def.cost) return { ok: false, reason: 'Not enough sun.' };
    const r = def.radius;
    if (Math.abs(x) > MAP.width / 2 - r || Math.abs(z) > MAP.depth / 2 - r) {
      return { ok: false, reason: 'Too close to the edge.' };
    }
    let onRock = false;
    this.nav.forCellsInCircle(x, z, r * 0.8, (cell) => { if (this.nav.blocked[cell]) onRock = true; });
    if (onRock) return { ok: false, reason: 'Something is in the way.' };
    for (const s of this.structures) {
      if (!s.alive) continue;
      if (Math.hypot(s.x - x, s.z - z) < STRUCTURES[s.type].radius + r) {
        return { ok: false, reason: 'Too close to a building.' };
      }
    }
    for (const p of this.plants) {
      if (Math.hypot(p.x - x, p.z - z) < PLANTS[p.type].radius + r) {
        return { ok: false, reason: 'Too close to another plant.' };
      }
    }
    return { ok: true };
  }

  place(type: PlantId, x: number, z: number): PlaceResult {
    const check = this.canPlace(type, x, z);
    if (!check.ok) return check;
    const def = PLANTS[type];
    this.sun -= def.cost;
    const plant: Plant = { id: this.nextId++, type, x, z, hp: def.hp, cooldown: 0, facing: 0 };
    this.plants.push(plant);
    this.nav.setPlant(plant.id, x, z, def.radius, this.plantPathCost(type));
    this.fieldDirty = true;
    this.events.push({ t: 'plantPlaced', id: plant.id });
    return { ok: true, plant };
  }

  /** The plant under (x, z), if any. */
  plantAt(x: number, z: number): Plant | undefined {
    let best: Plant | undefined;
    let bestD = Infinity;
    for (const p of this.plants) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < PLANTS[p.type].radius + 0.3 && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
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
    this.spawnQueue = buildSpawnQueue(WAVES[this.wave]);
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
    const groups = WAVES[this.wave] ?? [];
    const lines: WavePreviewLine[] = [];
    for (const g of groups) {
      const line = lines.find((l) => l.edge === g.edge && l.zombie === g.zombie);
      if (line) line.count += g.count;
      else lines.push({ edge: g.edge, zombie: g.zombie, count: g.count });
    }
    return lines;
  }

  sunPerSecond(): number {
    const mult = this.hyperTimer > 0 ? ABILITIES.hyperSun.multiplier : 1;
    let total = ECONOMY.baseSunPerSecond;
    for (const s of this.structures) if (s.alive) total += STRUCTURES[s.type].sunPerSecond ?? 0;
    for (const p of this.plants) total += (PLANTS[p.type].sunPerSecond ?? 0) * mult;
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

  spawn(type: ZombieId, edge: EdgeId): Zombie {
    const range = MAP.edges[edge];
    const hw = MAP.width / 2 - 0.5, hd = MAP.depth / 2 - 0.5;
    let x = 0, z = 0;
    for (let tries = 0; tries < 30; tries++) {
      const t = range.from + this.rand() * (range.to - range.from);
      if (edge === 'east') { x = hw; z = t; }
      else if (edge === 'west') { x = -hw; z = t; }
      else if (edge === 'north') { x = t; z = hd; }
      else { x = t; z = -hd; }
      if (!this.nav.blocked[this.nav.cellOf(x, z)]) break;
    }
    const zombie: Zombie = {
      id: this.nextId++, type, x, z, hp: ZOMBIES[type].hp,
      slowTimer: 0, slowFactor: 1, facing: Math.PI, attacking: null, target: null, wanderBelow: 0, visited: [],
    };
    this.zombies.push(zombie);
    if (ZOMBIES[type].boss) this.events.push({ t: 'bossSpawn', type });
    return zombie;
  }

  private updatePlants(): void {
    const hyper = this.hyperTimer > 0 ? ABILITIES.hyperSun.multiplier : 1;
    for (const p of this.plants) {
      const atk = PLANTS[p.type].attack;
      if (!atk) continue;
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
    z.hp -= amount * (1 - ZOMBIES[z.type].armor);
  }

  private updateZombies(): void {
    for (const zb of this.zombies) {
      if (zb.hp <= 0) continue;
      const def = ZOMBIES[zb.type];
      if (zb.slowTimer > 0) zb.slowTimer -= DT;
      const speed = def.speed * (zb.slowTimer > 0 ? zb.slowFactor : 1);
      zb.attacking = null;

      if (def.giant) {
        this.updateGiant(zb, speed);
        continue;
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
          zb.attacking = { kind: 'plant', id: plant.id };
          zb.facing = Math.atan2(plant.z - zb.z, plant.x - zb.x);
          plant.hp -= def.dps * DT;
          if (this.chompTimer <= 0) {
            this.chompTimer = 0.4;
            this.events.push({ t: 'chomp', x: zb.x, z: zb.z });
          }
          continue;
        }
      }
      this.moveToward(zb, this.nav.centerX(next), this.nav.centerZ(next), speed * DT);
    }
    this.separateZombies();
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
      return p.hp > 0 && Math.hypot(px, pz) < def.radius + PLANTS[p.type].radius + 0.3 && px * dx + pz * dz > 0;
    });
    if (blocker) {
      zb.attacking = { kind: 'plant', id: blocker.id };
      const r = def.giant!.stompRadius;
      for (const p of this.plants) {
        if (Math.hypot(p.x - zb.x, p.z - zb.z) <= r + PLANTS[p.type].radius) p.hp -= def.dps * DT;
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
    if (Math.abs(x) > MAP.width / 2 || Math.abs(z) > MAP.depth / 2) return;
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
        if (Math.hypot(zb.x - s.x, zb.z - s.z) <= radius + ZOMBIES[zb.type].radius) this.damageZombie(zb, damage);
      }
      this.events.push({ t: 'strikeHit', x: s.x, z: s.z, radius });
      this.strikes.splice(i, 1);
    }
  }

  private removeDead(): void {
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const zb = this.zombies[i];
      if (zb.hp > 0) continue;
      this.events.push({ t: 'zombieDied', type: zb.type, x: zb.x, z: zb.z });
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
    for (const p of this.plants) {
      if (Math.hypot(p.x - plant.x, p.z - plant.z) < 3) {
        this.nav.setPlant(p.id, p.x, p.z, PLANTS[p.type].radius, this.plantPathCost(p.type));
      }
    }
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
    for (const p of this.plants) p.hp = PLANTS[p.type].hp;
    this.strikes.length = 0;
    this.hyperTimer = 0;
    this.cooldowns.orbitalStrike = 0;
    this.cooldowns.hyperSun = 0;
    this.wave++;
    if (this.wave >= this.totalWaves) {
      this.phase = 'won';
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
    const cellsAcross = (2 * def.radius) / CELL;
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
    this.strikes.length = 0;
    this.spawnQueue = [];
    this.waveTime = 0;
    this.hyperTimer = 0;
    this.cooldowns.orbitalStrike = 0;
    this.cooldowns.hyperSun = 0;
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
