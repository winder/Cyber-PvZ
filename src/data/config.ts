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
export type ZombieId = 'cyborg' | 'riotBot' | 'jetpack' | 'zomwes' | 'guardian';
export type StructureId = 'greenhouse' | 'powerPlant' | 'spaceship';
export type AbilityId = 'orbitalStrike' | 'hyperSun';
export type EdgeId = 'north' | 'south' | 'east' | 'west';

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
    description: 'A tough wall. Zombies must chew through it.',
    cost: 50,
    hp: 1500,
    radius: 0.6,
    color: '#38e8ff',
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

export interface MapDef {
  width: number;
  depth: number;
  /** How tall the rolling hills are (1 = normal, 0 = flat). */
  hills: number;
  structures: { id: StructureId; x: number; z: number }[];
  rocks: Circle[];
  /** Sheer-sided trenches cut into the ground. Nothing can cross them (except giants). */
  ravines: Rect[];
  /** Where each edge's spawn zone is (range along that edge). */
  edges: Record<EdgeId, { from: number; to: number }>;
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
  hills: 0.5,
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
};

/** Dusty, sun-scorched wasteland under an orange haze. */
const RUST_THEME: ThemeDef = {
  sky: '#c98b58',
  fog: '#cf9866',
  fogDensity: 0.011,
  ground: '#b88552',
  ravine: '#2a140a',
  light: '#ffe6c8',
  lightIntensity: 1.05,
  bounce: '#6b3a1e',
  sun: '#ffd49a',
  sunIntensity: 0.95,
  rock: '#7a4a30',
  rockEdge: '#c27038',
  border: '#7a3b1a',
  glow: 0.55,
};

// ---------------------------------------------------------------------------
//  WAVES
//  Each group spawns `count` zombies of `zombie` from `edge`, one every
//  `every` seconds, starting `delay` seconds into the wave.
// ---------------------------------------------------------------------------

export interface SpawnGroup {
  zombie: ZombieId;
  edge: EdgeId;
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
  | 'waveClear' | 'win' | 'lose' | 'click' | 'error' | 'bossRoar' | 'stomp' | 'bossDie';

export const SOUND_FILES: Partial<Record<SoundId, string>> = {};
