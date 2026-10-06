// ============================================================================
//  CYBER PLANTS VS ZOMBIES — GAME DATA
//
//  Every number that controls balance lives here. Change a value, save, and
//  the game reloads with it. Distances are in map units (one plant is about
//  1.2 units wide). Times are in seconds.
//
//  `color` is the neon color used for the placeholder shape.
//  `art` (optional) is a path to a drawing in /public/art, e.g.
//  'art/solar-flower.png'. When set, the drawing replaces the placeholder.
//
//  Zombies can instead be blocky 3D models with a painted skin: set `model`
//  and `skin` (a PNG in /public/skins). Paint skins in the character editor
//  (editor/ on the game's site).
// ============================================================================

import type { ModelId } from '../models/models';

export type PlantId = 'solarFlower' | 'laserPea' | 'forceNut' | 'cryoPea';
export type ZombieId = 'cyborg' | 'riotBot' | 'jetpack' | 'zomwes' | 'guardian' | 'tombstone';
export type StructureId = 'greenhouse' | 'powerPlant' | 'spaceship';
export type AbilityId = 'orbitalStrike' | 'hyperSun';
export type EdgeId = 'north' | 'south' | 'east' | 'west';
/** Where a spawn group comes from: an edge, or up out of the tombstones (rocks) on the map. */
export type SpawnFrom = EdgeId | 'graves';

export interface PlantDef {
  name: string;
  /** Emoji shown on the plant's card. */
  icon: string;
  description: string;
  cost: number;
  hp: number;
  radius: number;
  color: string;
  art?: string;
  /** Attack stats; omit for plants that don't shoot. */
  attack?: {
    range: number;
    damage: number;
    /** Shots per second. */
    rate: number;
    canHitGround: boolean;
    canHitAir: boolean;
    /** Optional slow: multiplies zombie speed by `factor` for `duration` s. */
    slow?: { factor: number; duration: number };
  };
  /** Sun per second during battle. */
  sunPerSecond?: number;
  /**
   * Walls are long and can be turned (45° at a time) to steer zombies.
   * Length runs along the wall; thickness across it.
   */
  wall?: { length: number; thickness: number };
}

export interface ZombieDef {
  name: string;
  icon: string;
  hp: number;
  speed: number;
  /** Damage per second to plants and structures. */
  dps: number;
  /** Fraction of incoming damage blocked (0 = none, 0.5 = half). */
  armor: number;
  flying: boolean;
  radius: number;
  color: string;
  art?: string;
  /** Blocky model to build this zombie from (see src/models/models.ts). */
  model?: ModelId;
  /** Skin image painted onto the model, e.g. 'skins/cyborg.png'. */
  skin?: string;
  /** How much bigger to draw the model (1 = normal). */
  scale?: number;
  /** Extra decoration: a full head of curls, or a little nest round a rider. */
  hair?: 'curly' | 'nest';
  /** Something held in the right hand. */
  weapon?: 'scythe';
  /** Worn on the head: a clump of grass with the tombstone it rose from stuck in it. */
  hat?: 'tombstone';
  /**
   * A death animation only this zombie has, played instead of a common one
   * some of the time. Looks only.
   */
  death?: 'jetpackBlast' | 'shieldSquish';
  /**
   * Coming up out of the graves: takes `time` seconds to climb out (standing
   * still), from a tombstone at least `minPathDistance` from the nearest base
   * along the way zombies walk (so not right on top of the defense).
   */
  rise?: { time: number; minPathDistance: number };
  /** Gets a boss health bar and announcements. */
  boss?: boolean;
  /** Bodyguards that spawn alongside this zombie and escort it. */
  guards?: { zombie: ZombieId; count: number };
  /** Attacks hit every plant within this distance (a wide swing). */
  sweep?: number;
  /**
   * Giant: walks in a straight line over rocks and ravines, stomping plants in
   * the way (hurting every plant within `stompRadius`).
   */
  giant?: { stompRadius: number };
  /**
   * Wanders to a different base each time the base it's attacking loses this
   * fraction of its health (0.25 = at 75%, 50%, 25%).
   * Set `wanderOn: 'self'` to wander when the zombie itself loses that much instead.
   */
  wanderEvery?: number;
  wanderOn?: 'base' | 'self';
}

export interface StructureDef {
  name: string;
  hp: number;
  radius: number;
  color: string;
  art?: string;
  /** Losing this structure loses the game. */
  vital?: boolean;
  /** Sun per second during battle while standing. */
  sunPerSecond?: number;
  /** Battle abilities need this structure standing. */
  powersAbilities?: boolean;
}

export interface AbilityDef {
  name: string;
  icon: string;
  description: string;
  cost: number;
  cooldown: number;
}

export const PLANTS: Record<PlantId, PlantDef> = {
  solarFlower: {
    name: 'Solar Flower',
    icon: '🌻',
    description: 'Makes sun during battle.',
    cost: 50,
    hp: 150,
    radius: 0.6,
    color: '#ffd23f',
    sunPerSecond: 1,
  },
  laserPea: {
    name: 'Laser Peashooter',
    icon: '🌱',
    description: 'Shoots lasers at ground and flying zombies.',
    cost: 100,
    hp: 200,
    radius: 0.6,
    color: '#3cff6e',
    attack: { range: 7, damage: 20, rate: 1.5, canHitGround: true, canHitAir: true },
  },
  forceNut: {
    name: 'Force-Field Nut',
    icon: '🥜',
    description: 'A long wall you can turn (R or ↻). Steer zombies, or make them chew through.',
    cost: 75,
    hp: 1800,
    radius: 0.6,
    color: '#38e8ff',
    wall: { length: 3.2, thickness: 0.9 },
  },
  cryoPea: {
    name: 'Cryo-Pea',
    icon: '❄️',
    description: 'Freezing shots that slow zombies down.',
    cost: 150,
    hp: 200,
    radius: 0.6,
    color: '#9fd8ff',
    attack: {
      range: 6,
      damage: 10,
      rate: 1,
      canHitGround: true,
      canHitAir: true,
      slow: { factor: 0.5, duration: 2 },
    },
  },
};

export const ZOMBIES: Record<ZombieId, ZombieDef> = {
  cyborg: {
    name: 'Cyborg Zombie',
    icon: '🧟',
    hp: 150,
    speed: 1.2,
    dps: 25,
    armor: 0,
    flying: false,
    radius: 0.35,
    color: '#a2d36b',
    model: 'humanoid',
    skin: 'skins/cyborg.png',
  },
  riotBot: {
    name: 'Riot Shield Bot',
    icon: '🛡️',
    hp: 260,
    speed: 0.9,
    dps: 30,
    armor: 0.5,
    flying: false,
    radius: 0.45,
    color: '#5b7bff',
    death: 'shieldSquish',
  },
  jetpack: {
    name: 'Jetpack Zombie',
    icon: '🚀',
    hp: 110,
    speed: 1.8,
    dps: 20,
    armor: 0,
    flying: true,
    radius: 0.35,
    color: '#ff8a3d',
    model: 'jetpackHumanoid',
    skin: 'skins/jetpack.png',
    death: 'jetpackBlast',
  },
  // Bursts up out of a grave with its tombstone on its head. The stone is
  // a helmet: it soaks up some of every hit.
  tombstone: {
    name: 'Tombstone Zombie',
    icon: '🪦',
    hp: 220,
    speed: 0.9,
    dps: 25,
    armor: 0.35,
    flying: false,
    radius: 0.4,
    color: '#8fae6a',
    model: 'humanoid',
    skin: 'skins/tombstone.png',
    hat: 'tombstone',
    rise: { time: 1.6, minPathDistance: 22 },
  },
  // ZomWes 8000's bodyguards. They march beside him and slash plants near him.
  guardian: {
    name: 'Guardian',
    icon: '🗡️',
    hp: 400,
    speed: 1.0,
    dps: 25,
    armor: 0.2,
    flying: false,
    radius: 0.7,
    color: '#86cdea',
    model: 'guardian',
    skin: 'skins/guardian.png',
    scale: 2,
    weapon: 'scythe',
    sweep: 2,
  },
  // The final boss. Named after his creator.
  zomwes: {
    name: 'ZomWes 8000',
    icon: '👹',
    hp: 15000,
    speed: 0.7,
    dps: 120,
    armor: 0,
    flying: false,
    radius: 3,
    color: '#b14dff',
    model: 'westbot',
    skin: 'skins/zomwes.png',
    scale: 9,
    hair: 'nest',
    boss: true,
    guards: { zombie: 'guardian', count: 3 },
    giant: { stompRadius: 4 },
    wanderEvery: 0.25,
    wanderOn: 'base',
  },
};

export const STRUCTURES: Record<StructureId, StructureDef> = {
  greenhouse: {
    name: 'Mega-Brain Greenhouse',
    hp: 3000,
    radius: 2.6,
    color: '#ff5fd2',
    vital: true,
  },
  powerPlant: {
    name: 'Power Plant',
    hp: 1500,
    radius: 1.8,
    color: '#ffe14d',
    sunPerSecond: 2,
  },
  spaceship: {
    name: 'Spaceship',
    hp: 1500,
    radius: 2,
    color: '#b18cff',
    powersAbilities: true,
  },
};

export const ABILITIES = {
  orbitalStrike: {
    name: 'Orbital Laser Strike',
    icon: '🛰️',
    description: 'Tap a spot to blast it from space.',
    cost: 75,
    cooldown: 15,
    radius: 3,
    damage: 300,
    /** Seconds between targeting and impact. */
    delay: 0.7,
  },
  hyperSun: {
    name: 'Hyper Sun',
    icon: '🌞',
    description: 'All plants attack twice as fast for a few seconds.',
    cost: 100,
    cooldown: 30,
    duration: 6,
    /** Attack speed and sun production multiplier. */
    multiplier: 2,
  },
} satisfies Record<AbilityId, AbilityDef & Record<string, string | number>>;

/**
 * How fast the game runs at "1×" (1 = the original pace). The speed button
 * doubles whatever this is.
 */
export const GAME_SPEED = 2;

export const ECONOMY = {
  startingSun: 400,
  /** Sun per second during battle, from nowhere in particular. */
  baseSunPerSecond: 3,
  /** Bonus sun for clearing a wave. */
  waveClearBonus: 200,
};

// ---------------------------------------------------------------------------
//  MAPS
//  Each map is centered on (0, 0). x runs west→east, z runs south→north.
// ---------------------------------------------------------------------------

export interface Rect { x: number; z: number; w: number; d: number }
export interface Circle { x: number; z: number; r: number }
/** A rock. `look` draws a landmark in its place (same rules: nothing gets through). */
export interface Rock extends Circle { look?: 'gazebo' }

export interface MapDef {
  width: number;
  depth: number;
  /** How tall the rolling hills are (1 = normal, 0 = flat). */
  hills: number;
  structures: { id: StructureId; x: number; z: number }[];
  rocks: Rock[];
  /** Sheer-sided trenches cut into the ground. Nothing can cross them (except giants). */
  ravines: Rect[];
  /** Where each edge's spawn zone is (range along that edge). */
  edges: Record<EdgeId, { from: number; to: number }>;
  /**
   * Optional alley mouths along an edge: zombies from that edge pour out of
   * one of these (positions along the edge) instead of anywhere in its range.
   */
  alleys?: Partial<Record<EdgeId, number[]>>;
  /** One big hill raised out of the ground, flat on top. Looks only: zombies walk over it. */
  mound?: { x: number; z: number; r: number; height: number };
  /** Bowl-shaped dents in the ground, with a raised rim. Looks only: zombies walk through them. */
  craters?: Circle[];
  /** Where the camera starts looking (default: a little west of the middle). */
  view?: { x: number; z: number };
}

/** Level 1: open ground, bases spread out. */
const NEON_MAP: MapDef = {
  width: 72,
  depth: 48,
  hills: 1,
  structures: [
    { id: 'greenhouse', x: -26, z: 0 },
    { id: 'powerPlant', x: -20, z: 13 },
    { id: 'spaceship', x: -20, z: -13 },
  ],
  rocks: [
    { x: 4, z: 6, r: 2.2 },
    { x: 10, z: -8, r: 2.8 },
    { x: -4, z: -4, r: 1.6 },
    { x: 18, z: 14, r: 2 },
    { x: -8, z: 16, r: 1.8 },
    { x: 22, z: -16, r: 2.2 },
    { x: -12, z: -18, r: 1.5 },
  ],
  ravines: [
    { x: -2, z: 17, w: 14, d: 3 },
    { x: -2, z: -17, w: 14, d: 3 },
    { x: 14, z: 1, w: 3, d: 10 },
  ],
  edges: {
    east: { from: -14, to: 14 },
    north: { from: 4, to: 30 },
    south: { from: 4, to: 30 },
    west: { from: -10, to: 10 },
  },
};

/**
 * Level 2: a long corridor with the bases in a row down the middle. Ravines
 * wall off both sides, so zombies from the sides can only get in through a
 * gap (north: just east of the Spaceship; south: between the Spaceship and
 * the Power Plant) or round the far east ends.
 */
const RUST_MAP: MapDef = {
  width: 84,
  depth: 32,
  hills: 0.15, // a (mostly) flat street
  structures: [
    { id: 'greenhouse', x: -34, z: 0 },
    { id: 'powerPlant', x: -23, z: 0 },
    { id: 'spaceship', x: -12, z: 0 },
  ],
  rocks: [
    { x: 8, z: 4.5, r: 1.6 },
    { x: 20, z: -4, r: 2 },
    { x: -4, z: -4, r: 1.3 },
  ],
  ravines: [
    // North wall, gap at x -8…0.
    { x: -25, z: 9.5, w: 34, d: 3 },
    { x: 15, z: 9.5, w: 30, d: 3 },
    // South wall, gap at x -20…-12.
    { x: -31, z: -9.5, w: 22, d: 3 },
    { x: 9, z: -9.5, w: 42, d: 3 },
  ],
  edges: {
    east: { from: -6, to: 6 },
    north: { from: 4, to: 28 },
    south: { from: 2, to: 28 },
    west: { from: -6, to: 6 },
  },
  // Gaps between the ruined buildings along each side.
  alleys: {
    north: [7, 17, 26],
    south: [4, 14, 24],
  },
};

/**
 * Level 3: a graveyard. Zombies only come in through the gate at the back
 * (north). Two long ravines fold the way into an S, with a short stub off
 * each: west past the gate, east across the middle past the big hill (with
 * the gazebo on top), then down at the east end onto the bases, which stand
 * in a row along the front. So the horde meets them in order: Spaceship,
 * Power Plant, then the Greenhouse.
 */
const GRAVE_RAVINES: Rect[] = [
  // Back wall, gap at the west end.
  { x: 6, z: 15.5, w: 44, d: 3 },
  // A stub off it, so the way west zigzags up past the gate.
  { x: -9, z: 19, w: 3, d: 5 },
  // Front wall, gap at the east end.
  { x: -6, z: -8, w: 44, d: 3 },
  // A stub off it, so the way east bends up and round.
  { x: 12.5, z: -3.5, w: 3, d: 7 },
];
const GRAVE_MOUND = { x: -1, z: 4, r: 8.5, height: 3.6 };
const GRAVE_STRUCTURES: MapDef['structures'] = [
  { id: 'greenhouse', x: -5, z: -17 },
  { id: 'powerPlant', x: 8, z: -17 },
  { id: 'spaceship', x: 20, z: -17 },
];
const GRAVE_GATE = { from: -4, to: 6 };

/**
 * Tombstones in rows (rocks), with gaps zombies can slip through. Rows stay
 * clear of ravines, bases, the gazebo and the gate; a few graves are missing.
 */
function tombstoneRows(): Rock[] {
  const rows = [23, 20, 12.5, 9.5, 6, 2.5, -1, -4.5, -12, -15.5, -19, -22.5];
  const out: Rock[] = [];
  let n = 0;
  for (const z0 of rows) {
    for (let x0 = -26.4; x0 <= 26.41; x0 += 2.4) {
      n++;
      // Seeded jitter: graves settle a little out of line over the years.
      const k = Math.sin(n * 12.9898) * 43758.5453;
      const r1 = k - Math.floor(k), r2 = (k * 7.13) - Math.floor(k * 7.13);
      if (r1 < 0.16) continue; // a missing grave
      const x = x0 + (r2 - 0.5) * 0.4, z = z0 + (r1 - 0.5) * 0.3;
      const nearRavine = GRAVE_RAVINES.some((r) => Math.abs(x - r.x) < r.w / 2 + 1.2 && Math.abs(z - r.z) < r.d / 2 + 1.2);
      const nearBase = GRAVE_STRUCTURES.some((s) => Math.hypot(x - s.x, z - s.z) < STRUCTURES[s.id].radius + 3.5);
      const onHilltop = Math.hypot(x - GRAVE_MOUND.x, z - GRAVE_MOUND.z) < 4;
      const atGate = x > GRAVE_GATE.from - 2.5 && x < GRAVE_GATE.to + 2.5 && z > 21.5;
      if (nearRavine || nearBase || onHilltop || atGate) continue;
      out.push({ x, z, r: 0.55 });
    }
  }
  return out;
}

const GRAVEYARD_MAP: MapDef = {
  width: 56,
  depth: 50,
  hills: 0.35,
  structures: GRAVE_STRUCTURES,
  rocks: [
    { x: GRAVE_MOUND.x, z: GRAVE_MOUND.z, r: 2.6, look: 'gazebo' },
    ...tombstoneRows(),
  ],
  ravines: GRAVE_RAVINES,
  edges: {
    north: GRAVE_GATE,
    east: { from: -4, to: 4 },
    south: { from: -6, to: 6 },
    west: { from: -4, to: 4 },
  },
  mound: GRAVE_MOUND,
  view: { x: 4, z: -7 },
};

/**
 * Level 4: a jungle where a whole fleet came down. Wrecks are rocks, each in
 * its crater; the ravines are the furrows they ploughed on the way in, from
 * the east, so each furrow trails off east of its wreck.
 */
const JUNGLE_WRECKS: Rock[] = [
  // At the west ends of the furrows.
  { x: -6, z: 15, r: 2.4 },
  { x: 2, z: -14, r: 2.6 },
  { x: 12, z: 3, r: 2.2 },
  // Scattered all over.
  { x: -8, z: -3, r: 1.6 },
  { x: 4, z: 7, r: 1.3 },
  { x: 20, z: 14, r: 1.8 },
  { x: 24, z: -6, r: 2 },
  { x: -2, z: -21, r: 1.4 },
  { x: 16, z: -17, r: 1.5 },
  { x: -10, z: 21, r: 1.3 },
  { x: 30, z: 4, r: 1.4 },
  { x: 8, z: 20, r: 1.2 },
  { x: -4, z: 4, r: 1.2 },
  { x: 18, z: -11, r: 1.2 },
];
const JUNGLE_MAP: MapDef = {
  width: 72,
  depth: 48,
  hills: 0.8,
  structures: [
    { id: 'greenhouse', x: -27, z: 0 },
    { id: 'powerPlant', x: -21, z: 13 },
    { id: 'spaceship', x: -21, z: -13 },
  ],
  rocks: JUNGLE_WRECKS,
  ravines: [
    { x: 4.5, z: 15, w: 17, d: 3 },
    { x: 13, z: -14, w: 18, d: 3 },
    { x: 21, z: 3, w: 14, d: 3 },
  ],
  craters: [
    // Under the wrecks, a little wider than each.
    ...JUNGLE_WRECKS.map((w) => ({ x: w.x, z: w.z, r: w.r + 1.6 })),
    // Ships that hit and bounced (or burnt up).
    { x: -9, z: 7, r: 2.5 },
    { x: 8, z: -5, r: 3 },
    { x: 27, z: 16, r: 2.2 },
    { x: -8, z: -12, r: 2 },
    { x: 28, z: -16, r: 2.6 },
  ],
  edges: {
    east: { from: -14, to: 14 },
    north: { from: 4, to: 30 },
    south: { from: 4, to: 30 },
    west: { from: -10, to: 10 },
  },
};

// ---------------------------------------------------------------------------
//  THEMES: the look of a level. Colors are hex strings.
// ---------------------------------------------------------------------------

export interface ThemeDef {
  sky: string;
  fog: string;
  fogDensity: number;
  /** Ground color on top, and at the bottom of ravines. */
  ground: string;
  ravine: string;
  light: string;
  lightIntensity: number;
  /** Color light bouncing up from below. */
  bounce: string;
  sun: string;
  sunIntensity: number;
  rock: string;
  rockEdge: string;
  border: string;
  glow: number;
  /** How rocks look: plain boulders, burnt-out car wrecks, or tombstones. */
  rocks?: 'boulder' | 'carWreck' | 'tombstone' | 'shipWreck';
  /**
   * Extra scenery: the ruined city (skyscrapers, street lamps, tumbleweeds),
   * the graveyard (neon fence, gazebo, ghosts, slime, haunted houses, moon),
   * or the jungle (giant trees with crashed ships hanging from vines, palms).
   */
  decor?: 'ruinedCity' | 'graveyard' | 'jungle';
  /**
   * A painted ground instead of plain colors (asphalt street, sidewalks,
   * rubble), or a patchy jungle floor (moss, grass and bare earth).
   */
  groundStyle?: 'cityStreet' | 'jungleFloor';
  /** Weather that rolls in partway through some waves. Looks only: the rules don't change. */
  weather?: WeatherDef;
}

export interface WeatherDef {
  kind: 'dustStorm' | 'thunderstorm';
  /** Wave numbers as the player sees them (1 = first wave). */
  waves: number[];
  /** Seconds into the battle before it rolls in. */
  after: number;
}

const NEON_THEME: ThemeDef = {
  sky: '#05050f',
  fog: '#05050f',
  fogDensity: 0.006,
  ground: '#172147',
  ravine: '#010105',
  light: '#ffffff',
  lightIntensity: 0.7,
  bounce: '#1a0d33',
  sun: '#ffffff',
  sunIntensity: 0.5,
  rock: '#8a6cff',
  rockEdge: '#9966ff',
  border: '#4de6ff',
  glow: 0.7,
  weather: { kind: 'thunderstorm', waves: [3, 5], after: 8 },
};

/** Dusty, sun-scorched wasteland under an orange haze. */
const RUST_THEME: ThemeDef = {
  sky: '#c2702f',
  fog: '#c4783a',
  fogDensity: 0.014,
  ground: '#b88552',
  ravine: '#24120a',
  light: '#ffd2a0',
  lightIntensity: 1.0,
  bounce: '#6b3a1e',
  sun: '#ffc27a',
  sunIntensity: 0.9,
  rock: '#7a4a30',
  rockEdge: '#c27038',
  border: '#7a3b1a',
  glow: 0.55,
  rocks: 'carWreck',
  decor: 'ruinedCity',
  groundStyle: 'cityStreet',
  weather: { kind: 'dustStorm', waves: [3, 5], after: 8 },
};

/** Moonlit night in a graveyard: blue-black sky, cold light, a low mist. */
const GRAVEYARD_THEME: ThemeDef = {
  sky: '#070b1c',
  fog: '#070b1c',
  fogDensity: 0.011,
  ground: '#1e3326',
  ravine: '#010304',
  light: '#9fb4ff',
  lightIntensity: 0.6,
  bounce: '#12202a',
  sun: '#b9c8ff',
  sunIntensity: 0.55,
  rock: '#6b7280',
  rockEdge: '#4dc3ff',
  border: '#3d9bff',
  glow: 0.8,
  rocks: 'tombstone',
  decor: 'graveyard',
  weather: { kind: 'thunderstorm', waves: [5], after: 10 },
};

/** Steamy tropical afternoon: green haze, hot sun, a downpour later on. */
const JUNGLE_THEME: ThemeDef = {
  sky: '#9cc9b4',
  fog: '#9cc4a6',
  fogDensity: 0.008,
  ground: '#3f6b2a',
  ravine: '#2e1d0e',
  light: '#fff4d6',
  lightIntensity: 0.95,
  bounce: '#2b4a1c',
  sun: '#ffe2a8',
  sunIntensity: 0.85,
  rock: '#5f6670',
  rockEdge: '#ff8a3d',
  border: '#b6ff5c',
  glow: 0.6,
  rocks: 'shipWreck',
  decor: 'jungle',
  groundStyle: 'jungleFloor',
  weather: { kind: 'thunderstorm', waves: [3, 5], after: 8 },
};

// ---------------------------------------------------------------------------
//  WAVES
//  Each group spawns `count` zombies of `zombie` from `edge`, one every
//  `every` seconds, starting `delay` seconds into the wave. An `edge` of
//  'graves' raises them out of tombstones instead.
// ---------------------------------------------------------------------------

export interface SpawnGroup {
  zombie: ZombieId;
  /** An edge, or 'graves': up out of tombstones on the map (see `ZombieDef.rise`). */
  edge: SpawnFrom;
  count: number;
  every: number;
  delay: number;
}

export const WAVES: SpawnGroup[][] = [
  [
    { zombie: 'cyborg', edge: 'east', count: 6, every: 2.5, delay: 0 },
  ],
  [
    { zombie: 'cyborg', edge: 'east', count: 8, every: 2, delay: 0 },
    { zombie: 'cyborg', edge: 'north', count: 4, every: 3, delay: 6 },
  ],
  [
    { zombie: 'cyborg', edge: 'east', count: 8, every: 1.8, delay: 0 },
    { zombie: 'riotBot', edge: 'south', count: 4, every: 3, delay: 4 },
    { zombie: 'jetpack', edge: 'north', count: 3, every: 3, delay: 10 },
  ],
  [
    { zombie: 'riotBot', edge: 'east', count: 6, every: 2.5, delay: 0 },
    { zombie: 'cyborg', edge: 'north', count: 8, every: 1.5, delay: 3 },
    { zombie: 'cyborg', edge: 'south', count: 8, every: 1.5, delay: 3 },
    { zombie: 'jetpack', edge: 'east', count: 5, every: 2, delay: 12 },
  ],
  // Final wave!
  [
    { zombie: 'cyborg', edge: 'east', count: 16, every: 1, delay: 0 },
    { zombie: 'riotBot', edge: 'north', count: 8, every: 2, delay: 4 },
    { zombie: 'riotBot', edge: 'south', count: 8, every: 2, delay: 4 },
    { zombie: 'jetpack', edge: 'north', count: 6, every: 1.5, delay: 10 },
    { zombie: 'jetpack', edge: 'south', count: 6, every: 1.5, delay: 14 },
    { zombie: 'zomwes', edge: 'east', count: 1, every: 1, delay: 18 },
    { zombie: 'cyborg', edge: 'east', count: 14, every: 0.8, delay: 20 },
  ],
];

/**
 * The same waves, but every zombie comes in through the back gate, and from
 * wave 2 Tombstone Zombies climb out of the graves as well.
 */
const GRAVE_RISERS: SpawnGroup[][] = [
  [],
  [{ zombie: 'tombstone', edge: 'graves', count: 3, every: 4, delay: 8 }],
  [{ zombie: 'tombstone', edge: 'graves', count: 4, every: 3, delay: 6 }],
  [{ zombie: 'tombstone', edge: 'graves', count: 5, every: 2.5, delay: 5 }],
  [{ zombie: 'tombstone', edge: 'graves', count: 5, every: 2.5, delay: 8 }],
];
const GRAVEYARD_WAVES: SpawnGroup[][] = WAVES.map((wave, i) => [
  ...wave.map((g): SpawnGroup => ({ ...g, edge: 'north' })),
  ...GRAVE_RISERS[i],
]);

// ---------------------------------------------------------------------------
//  LEVELS
// ---------------------------------------------------------------------------

export interface LevelDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  map: MapDef;
  theme: ThemeDef;
  waves: SpawnGroup[][];
}

export const LEVELS: LevelDef[] = [
  {
    id: 'neon',
    name: 'Neon Grid',
    icon: '🌃',
    description: 'Open ground at night. Bases spread out.',
    map: NEON_MAP,
    theme: NEON_THEME,
    waves: WAVES,
  },
  {
    id: 'rust',
    name: 'Rust Corridor',
    icon: '🏜️',
    description: 'A scorched canyon. Bases in a row, ravines on both sides.',
    map: RUST_MAP,
    theme: RUST_THEME,
    waves: WAVES,
  },
  {
    id: 'graveyard',
    name: 'Cyber Cemetery',
    icon: '🪦',
    description: 'A haunted graveyard at night. Zombies only come in the back gate.',
    map: GRAVEYARD_MAP,
    theme: GRAVEYARD_THEME,
    waves: GRAVEYARD_WAVES,
  },
  {
    id: 'jungle',
    name: 'Crash Jungle',
    icon: '🌴',
    description: 'A tropical jungle where a whole fleet of spaceships crashed.',
    map: JUNGLE_MAP,
    theme: JUNGLE_THEME,
    waves: WAVES,
  },
];

// ---------------------------------------------------------------------------
//  SOUND
//  Leave a sound out to use the built-in synthesized beep. To use a
//  recording, put the file in /public/sounds and add e.g.
//  laser: 'sounds/pew.mp3'
// ---------------------------------------------------------------------------

export type SoundId =
  | 'laser' | 'cryo' | 'place' | 'sell' | 'chomp' | 'zombieDie' | 'plantDie'
  | 'structureHit' | 'structureDie' | 'orbital' | 'hyperSun' | 'waveStart'
  | 'waveClear' | 'win' | 'lose' | 'click' | 'error' | 'bossRoar' | 'stomp' | 'bossDie'
  | 'bossIntro' | 'crumble' | 'slowMo' | 'thunder' | 'wind';

export const SOUND_FILES: Partial<Record<SoundId, string>> = {};
