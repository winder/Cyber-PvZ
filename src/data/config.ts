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
export type ZombieId =
  | 'cyborg' | 'riotBot' | 'jetpack' | 'zomwes' | 'guardian' | 'tombstone' | 'captain' | 'gardener'
  | 'satan' | 'biker' | 'roadie' | 'horseman';
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
  /** Something held in (or in place of) the right hand. */
  weapon?: 'scythe' | 'rocketLauncher' | 'wateringCan' | 'guitar' | 'roadCase' | 'riotShield' | 'sword';
  /** Something it rides (drawn under it, wheels turning or hooves galloping). Looks only. */
  mount?: 'motorcycle' | 'zombieHorse';
  /**
   * A pet that rides on its shoulder, or a jack-o'-lantern head in green fire
   * that floats beside it. Looks only.
   */
  pet?: 'parrot' | 'pumpkinHead';
  /** Worn on the back, flapping as it goes. Looks only. */
  cape?: string;
  /**
   * Worn on the head: a clump of grass with the tombstone it rose from stuck
   * in it, a cracked glass greenhouse, or a pair of curling goat horns.
   */
  hat?: 'tombstone' | 'glassHelmet' | 'goatHorns';
  /**
   * A death animation only this zombie has, played instead of a common one
   * some of the time. Looks only.
   */
  death?: 'jetpackBlast' | 'shieldSquish' | 'goDownWithShip' | 'overwatered' | 'backToHell';
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
  /**
   * Fires a rocket every `every` seconds at the nearest plant (or base) within
   * `range`, while it walks. Rockets fly at `speed` and blow up where they
   * land, hurting every plant within `radius` (and a base, if it's in reach).
   */
  rockets?: { range: number; damage: number; radius: number; every: number; speed: number };
  /**
   * Calls up `count` zombies around itself, then again after a random wait
   * between `min` and `max` seconds (the first call comes after `first`).
   */
  summon?: { zombie: ZombieId; count: number; first: number; min: number; max: number };
  /**
   * Raises the dead: every `every` seconds (the first after `first`) it stops
   * for `pause` seconds, and up to `max` standing tombstones within `reach`
   * (the nearest first) come up as `zombie`s. With no tombstones in reach it
   * rides on and tries again a second later.
   */
  raiseDead?: { zombie: ZombieId; reach: number; max: number; first: number; every: number; pause: number };
  /**
   * Sprays goo every `every` seconds (the first after `first`) at the nearest
   * healthy plant within `range`, while it walks. Every healthy plant within
   * `radius` of where it lands is zombified for `duration` seconds.
   */
  goo?: { range: number; radius: number; every: number; first: number; duration: number };
  /**
   * Plays a riff every `every` seconds (the first after `first`) at the
   * nearest plant within `range` (or a base, if there's none), while it walks.
   * Riffs take turns: a blast of flame that hurts every plant in a cone
   * `spread` radians either side of the aim, then a bolt of lightning that
   * jumps on to up to `jumps` more plants, each within `reach` of the last.
   */
  riff?: {
    range: number; every: number; first: number;
    flame: { damage: number; spread: number };
    zap: { damage: number; jumps: number; reach: number };
  };
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
    model: 'humanoid',
    skin: 'skins/riotBot.png',
    weapon: 'riotShield',
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
  // A final boss: an armored zombie sea captain with a rocket launcher for a
  // right hand and a parrot on his shoulder. He calls up his crew as he goes.
  captain: {
    name: 'Ship Captain',
    icon: '🏴‍☠️',
    hp: 3600,
    speed: 0.75,
    dps: 60,
    armor: 0.25,
    flying: false,
    radius: 1.1,
    color: '#ff7a3d',
    model: 'captain',
    skin: 'skins/captain.png',
    scale: 3,
    weapon: 'rocketLauncher',
    pet: 'parrot',
    death: 'goDownWithShip',
    boss: true,
    rockets: { range: 10, damage: 60, radius: 1.6, every: 4, speed: 11 },
    summon: { zombie: 'cyborg', count: 2, first: 6, min: 9, max: 16 },
  },
  // A final boss: a zombie gardener in a cracked glass greenhouse helmet, with
  // a watering can of purple goo for a right hand. He doesn't chew through a
  // defense: he waters it, and it turns on its owner.
  gardener: {
    name: 'Necro-Gardener',
    icon: '🧪',
    hp: 4200,
    speed: 0.7,
    dps: 50,
    armor: 0.1,
    flying: false,
    radius: 1.1,
    color: '#b14dff',
    model: 'gardener',
    skin: 'skins/gardener.png',
    scale: 3,
    weapon: 'wateringCan',
    hat: 'glassHelmet',
    death: 'overwatered',
    boss: true,
    goo: { range: 9, radius: 2.2, every: 8, first: 3, duration: 7 },
  },
  // A final boss: Satan himself, the Hellfire Arena's headliner. Big red gut,
  // goat legs, a spade-tipped tail, and an electric guitar that shoots flames
  // and lightning. His roadies march beside him and a biker gang roars in.
  satan: {
    name: 'Satan',
    icon: '😈',
    hp: 4000,
    speed: 0.75,
    dps: 60,
    armor: 0.2,
    flying: false,
    radius: 1.1,
    color: '#ff2a1a',
    model: 'satan',
    skin: 'skins/satan.png',
    scale: 3,
    weapon: 'guitar',
    hat: 'goatHorns',
    death: 'backToHell',
    boss: true,
    guards: { zombie: 'roadie', count: 4 },
    riff: {
      range: 9, every: 4.5, first: 3,
      flame: { damage: 70, spread: 0.45 },
      zap: { damage: 55, jumps: 3, reach: 4.5 },
    },
  },
  // Satan's biker gang: fast, on loud choppers.
  biker: {
    name: 'Biker Zombie',
    icon: '🏍️',
    hp: 170,
    speed: 2.1,
    dps: 25,
    armor: 0.1,
    flying: false,
    radius: 0.5,
    color: '#ff8a3d',
    model: 'biker',
    skin: 'skins/biker.png',
    mount: 'motorcycle',
  },
  // A stage-crew zombie hiding behind a road case: it soaks up shots.
  roadie: {
    name: 'Roadie Zombie',
    icon: '🎚️',
    hp: 320,
    speed: 0.95,
    dps: 30,
    armor: 0.4,
    flying: false,
    radius: 0.5,
    color: '#9a9aa8',
    model: 'humanoid',
    skin: 'skins/roadie.png',
    weapon: 'roadCase',
  },
  // The Cyber Cemetery's own boss: a headless knight in silver armor and a
  // long black cape, on a zombie horse, sword in hand, with his jack-o'-lantern
  // head floating beside him in green fire. Every so often he reins in and
  // raises his sword, and every tombstone round him comes up as a zombie.
  horseman: {
    name: 'Headless Horseman',
    icon: '🎃',
    hp: 4000,
    speed: 1.05,
    dps: 60,
    armor: 0.3,
    flying: false,
    radius: 1.2,
    color: '#5dff7a',
    model: 'horseman',
    skin: 'skins/horseman.png',
    scale: 2.2,
    weapon: 'sword',
    mount: 'zombieHorse',
    pet: 'pumpkinHead',
    cape: '#0c0a10',
    boss: true,
    raiseDead: { zombie: 'tombstone', reach: 5.5, max: 6, first: 5, every: 13, pause: 2.6 },
  },
  // A final boss. Named after his creator.
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

/**
 * The final wave's boss is one of these, picked at random each game (unless
 * the level has its own: see `LevelDef.bosses`).
 */
export const BOSSES: ZombieId[] = ['zomwes', 'captain', 'gardener'];

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
 * The mosh pit (on maps that have one). Ground zombies in it (not bosses or
 * giants) get a rock shield, and take turns rocking out, barely moving, then
 * surging forward at super speed, for as long as they're in it.
 */
export const MOSH = {
  /** Fraction of damage the rock shield blocks (on top of any armor). */
  shield: 0.5,
  /** Rocking out: speed multiplier, and how long (random between these). */
  rockSpeed: 0.2,
  rockTime: [1.2, 2.2] as [number, number],
  /** Surging: speed multiplier, and how long. */
  surgeSpeed: 2.6,
  surgeTime: 0.9,
};

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

/** Every this-many games played (on any level), the boss is a Disco boss. */
export const DISCO_EVERY = 3;

/** What earns score. Sun spent or saved doesn't count: only zombies beaten and bases kept. */
export const SCORE = {
  /** Points for beating a zombie, per point of its health (tougher zombies are worth more). */
  perZombieHp: 1,
  /** Points for beating the boss, whichever one it is. */
  boss: 5000,
  /** Points for clearing a wave, times the wave's number (wave 3 is worth 3 of these). */
  waveClear: 250,
  /** On a win: points for each base, scaled by the health it has left. */
  baseSaved: 2000,
};

// ---------------------------------------------------------------------------
//  MAPS
//  Each map is centered on (0, 0). x runs west→east, z runs south→north.
// ---------------------------------------------------------------------------

export interface Rect { x: number; z: number; w: number; d: number }
export interface Circle { x: number; z: number; r: number }
/** A straight row of seats, from one end to the other (`SEAT_ROW_DEPTH` deep). */
export interface SeatRow { x1: number; z1: number; x2: number; z2: number }
/**
 * An arena floor shaped like a fan: the slice of a circle centered at (x, z),
 * `radius` across and `halfAngle` radians either side of due east. It opens
 * out eastward, so its narrow end is in the west.
 */
export interface Fan { x: number; z: number; radius: number; halfAngle: number }

/** How deep a row of seats is, front to back (two rows of seats back to back). */
export const SEAT_ROW_DEPTH = 1.8;
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
  /**
   * An arena: only the fan-shaped floor (and the tunnels) can be walked on or
   * planted in. Everything else is the stands: nothing gets in.
   */
  fan?: Fan;
  /** Openings through the stands, from the floor out to the map's edge. */
  tunnels?: Rect[];
  /** Rows of seats on the floor. Nothing gets through them (except giants). */
  seats?: SeatRow[];
  /** The mosh pit (see MOSH). Nothing can be planted in it. */
  moshPit?: Circle;
  /**
   * A raised stage at the fan's narrow end: the floor within `radius` of the
   * fan's center, `height` up. Looks only: zombies walk up onto it.
   */
  stage?: { radius: number; height: number };
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

/**
 * Level 5: a rock concert in a sold-out arena. The floor fans out from the
 * stage (west, where the bases stand) to the back, where zombies pour in
 * through three tunnels under the stands: one in the middle of the back
 * wall (east) and one at each back corner (north and south). Rows of seats
 * stand at odd angles all over the floor, and the mosh pit is right in front
 * of the stage: rows of seats run from it out to the walls, so the only way
 * to the stage is through the pit.
 */
const CONCERT_FAN: Fan = { x: -70, z: 0, radius: 104, halfAngle: 0.35 };
const CONCERT_MAP: MapDef = {
  width: 76,
  depth: 76,
  hills: 0,
  fan: CONCERT_FAN,
  stage: { radius: 43, height: 1.2 },
  structures: [
    { id: 'greenhouse', x: -34, z: 0 },
    { id: 'powerPlant', x: -32, z: 8 },
    { id: 'spaceship', x: -32, z: -8 },
  ],
  moshPit: { x: -18, z: 0, r: 5.5 },
  tunnels: [
    { x: 36, z: 0, w: 6, d: 5 },
    { x: 22, z: 36, w: 5, d: 6 },
    { x: 22, z: -36, w: 5, d: 6 },
  ],
  seats: [
    // VIP rows from the pit's stage side out to the walls: the only way to
    // the stage is right across the mosh pit.
    { x1: -21, z1: 4.6, x2: -14, z2: 19.5 },
    { x1: -21, z1: -4.6, x2: -14, z2: -19.5 },
    // A wedge either side of the pit, angled in toward it.
    { x1: -9, z1: 7, x2: -3, z2: 14 },
    { x1: -9, z1: -7, x2: -3, z2: -14 },
    // A row slanted across the middle, gaps at both ends.
    { x1: 3, z1: -5, x2: 8, z2: 5 },
    // A chevron pointing at the stage, north and south.
    { x1: 3, z1: 18, x2: 9, z2: 13 },
    { x1: 9, z1: 13, x2: 14, z2: 19 },
    { x1: 3, z1: -18, x2: 9, z2: -13 },
    { x1: 9, z1: -13, x2: 14, z2: -19 },
    // Sideways rows near the back.
    { x1: 18, z1: 3, x2: 18, z2: 11 },
    { x1: 18, z1: -3, x2: 18, z2: -11 },
    // Spokes fanning out by the corner tunnels.
    { x1: 23, z1: 16, x2: 28, z2: 24 },
    { x1: 23, z1: -16, x2: 28, z2: -24 },
    // Up against the side walls.
    { x1: -6, z1: 20, x2: 0, z2: 23 },
    { x1: -6, z1: -20, x2: 0, z2: -23 },
    // A short row stuck out by the middle tunnel, and one off-square beside it.
    { x1: 26, z1: 6, x2: 29, z2: 1 },
    { x1: 30, z1: -4, x2: 27, z2: -10 },
    // Way up the sides, where it's widest.
    { x1: 11, z1: 25, x2: 17, z2: 28 },
    { x1: 11, z1: -25, x2: 17, z2: -28 },
  ],
  rocks: [],
  ravines: [],
  edges: {
    east: { from: -2, to: 2 },
    north: { from: 20, to: 24 },
    south: { from: 20, to: 24 },
    west: { from: -2, to: 2 },
  },
  // Zombies come out of the tunnel mouths.
  alleys: { east: [0], north: [22], south: [22] },
  view: { x: -16, z: 0 },
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
  decor?: 'ruinedCity' | 'graveyard' | 'jungle' | 'concert';
  /**
   * A painted ground instead of plain colors (asphalt street, sidewalks,
   * rubble, or an arena floor with a stage), or a patchy jungle floor (moss,
   * grass and bare earth).
   */
  groundStyle?: 'cityStreet' | 'jungleFloor' | 'arenaFloor';
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

/** A rock concert at night: smoky purple haze, stage lights, lasers everywhere. */
const CONCERT_THEME: ThemeDef = {
  sky: '#0a0414',
  fog: '#1a0a26',
  fogDensity: 0.006,
  ground: '#1b1820',
  ravine: '#000000',
  light: '#c9b2ff',
  lightIntensity: 0.55,
  bounce: '#2a0a1e',
  sun: '#ffd9b0',
  sunIntensity: 0.45,
  rock: '#333333',
  rockEdge: '#ff3355',
  border: '#ff2fd0',
  glow: 0.75,
  decor: 'concert',
  groundStyle: 'arenaFloor',
};

// ---------------------------------------------------------------------------
//  WAVES
//  Each group spawns `count` zombies of `zombie` from `edge`, one every
//  `every` seconds, starting `delay` seconds into the wave. An `edge` of
//  'graves' raises them out of tombstones instead. A boss in a group stands
//  for whichever boss this game picked (see BOSSES).
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

/**
 * The Hellfire Arena's waves: all through the three tunnels (east: the back
 * wall's, north and south: the corners). Roadies and bikers join in, and the
 * boss rolls in with the whole biker gang.
 */
const CONCERT_WAVES: SpawnGroup[][] = [
  [
    { zombie: 'cyborg', edge: 'east', count: 6, every: 2.5, delay: 0 },
  ],
  [
    { zombie: 'cyborg', edge: 'east', count: 6, every: 2, delay: 0 },
    { zombie: 'cyborg', edge: 'north', count: 3, every: 3, delay: 5 },
    { zombie: 'cyborg', edge: 'south', count: 3, every: 3, delay: 8 },
  ],
  [
    { zombie: 'cyborg', edge: 'east', count: 8, every: 1.8, delay: 0 },
    { zombie: 'roadie', edge: 'north', count: 3, every: 3, delay: 4 },
    { zombie: 'biker', edge: 'south', count: 4, every: 1.5, delay: 9 },
    { zombie: 'jetpack', edge: 'north', count: 2, every: 3, delay: 12 },
  ],
  [
    { zombie: 'roadie', edge: 'east', count: 5, every: 2.5, delay: 0 },
    { zombie: 'cyborg', edge: 'north', count: 8, every: 1.5, delay: 3 },
    { zombie: 'cyborg', edge: 'south', count: 8, every: 1.5, delay: 3 },
    { zombie: 'biker', edge: 'east', count: 5, every: 1, delay: 12 },
    { zombie: 'jetpack', edge: 'south', count: 3, every: 2, delay: 14 },
  ],
  // Final wave! The boss and his biker gang, out of every tunnel at once.
  [
    { zombie: 'cyborg', edge: 'east', count: 14, every: 1, delay: 0 },
    { zombie: 'roadie', edge: 'north', count: 5, every: 2, delay: 4 },
    { zombie: 'roadie', edge: 'south', count: 5, every: 2, delay: 4 },
    { zombie: 'jetpack', edge: 'north', count: 4, every: 1.5, delay: 10 },
    { zombie: 'satan', edge: 'east', count: 1, every: 1, delay: 18 },
    { zombie: 'biker', edge: 'north', count: 5, every: 0.6, delay: 18 },
    { zombie: 'biker', edge: 'south', count: 5, every: 0.6, delay: 18 },
    { zombie: 'biker', edge: 'east', count: 4, every: 0.6, delay: 20 },
    { zombie: 'cyborg', edge: 'east', count: 12, every: 0.8, delay: 24 },
  ],
];

// ---------------------------------------------------------------------------
//  LEVELS
// ---------------------------------------------------------------------------

/** What an ability is called on a level, its card, and its sound. The rules don't change. */
export interface AbilityLook { name: string; icon: string; description: string; sound?: SoundId }

export interface LevelDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  map: MapDef;
  theme: ThemeDef;
  waves: SpawnGroup[][];
  /** This level's own bosses (one is picked each game) instead of BOSSES. */
  bosses?: ZombieId[];
  /** Abilities under another name on this level (they work the same). */
  abilities?: Partial<Record<AbilityId, AbilityLook>>;
}

/** An ability's name, icon and description as this level calls it. */
export function abilityLook(level: LevelDef, id: AbilityId): AbilityLook {
  const { name, icon, description } = ABILITIES[id];
  return level.abilities?.[id] ?? { name, icon, description };
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
    bosses: ['horseman'],
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
  {
    id: 'concert',
    name: 'Hellfire Arena',
    icon: '🎸',
    description: 'A sold-out rock concert. The stage is yours; the mosh pit is theirs.',
    map: CONCERT_MAP,
    theme: CONCERT_THEME,
    waves: CONCERT_WAVES,
    bosses: ['satan'],
    abilities: {
      orbitalStrike: { name: 'Guitar Solo Blast', icon: '🎸', description: 'Tap a spot to blast it with a face-melting guitar solo.', sound: 'guitarSolo' },
      hyperSun: { name: 'Encore', icon: '🤘', description: 'The crowd screams for more: all plants attack twice as fast for a few seconds.', sound: 'encore' },
    },
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
  | 'bossIntro' | 'crumble' | 'slowMo' | 'thunder' | 'wind' | 'rocket' | 'rocketBoom' | 'summon' | 'squawk' | 'goo' | 'cure'
  | 'flame' | 'zap' | 'guitarSolo' | 'encore' | 'engine' | 'neigh' | 'raiseDead';

export const SOUND_FILES: Partial<Record<SoundId, string>> = {};
