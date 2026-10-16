// ============================================================================
//  Blocky character models (Minecraft-style).
//
//  Each part is a box. Its texture is "unfolded" onto the skin image the same
//  way a Minecraft skin is, so 64×64 Minecraft skins work too. Skins can be
//  any multiple of 64 wide (we use 128×128 for more detail). Models with
//  more parts can use a bigger page (`skinUnits`).
//
//  Units: 1 unit = 1 pixel of a 64×64 skin. A humanoid is 32 units tall.
//  The model faces +z. Its right side is +x.
//
//  This file must not import anything: the skin generator script reads it.
// ============================================================================

export type FaceName = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back';
export type PartRole =
  | 'head' | 'body' | 'armR' | 'armL' | 'legR' | 'legL' | 'jetpack'
  | 'footR' | 'footL' | 'driverBody' | 'driverHead'
  | 'driverArmR' | 'driverArmL' | 'leverR' | 'leverL'
  | 'gut' | 'tail' | 'tailTip';
export type ModelId = 'humanoid' | 'jetpackHumanoid' | 'westbot' | 'guardian' | 'captain' | 'gardener' | 'satan' | 'biker' | 'horseman';

export interface Rect { x: number; y: number; w: number; h: number }

export interface PartDef {
  role: PartRole;
  label: string;
  /** Width (x), height (y), depth (z). For tapered parts, the size at the bottom. */
  size: [number, number, number];
  /** Tapered parts: how wide the top is compared with the bottom (0.5 = half). */
  taper?: number;
  /** Top-left corner of this part's unfolded box in the skin. */
  uv: [number, number];
  /** Joint the part turns around, measured from the feet. */
  pivot: [number, number, number];
  /** Part this one is attached to (moves with it). Must come earlier in the list. */
  parent?: PartRole;
  /** Box center, measured from the pivot. */
  offset: [number, number, number];
  /** Resting rotation (radians) around x, y, z. */
  rest?: [number, number, number];
}

export interface ModelDef {
  label: string;
  parts: PartDef[];
  /** Skin page size in units (default 64, like Minecraft). */
  skinUnits?: number;
  /** How far the legs swing when walking (radians). */
  walkSwing?: number;
  /**
   * How it moves: an ordinary walk, leaping bounds with a slice on landing,
   * or riding (legs held still on the footpegs).
   */
  gait?: 'walk' | 'leapSlice' | 'ride';
}

/** Default skin layout size in units. */
export const SKIN_UNITS = 64;

export function skinUnits(model: ModelId): number {
  return MODELS[model].skinUnits ?? SKIN_UNITS;
}

/** How high the Headless Horseman's saddle is (where his hips sit), in units. */
export const HORSE_SADDLE = 25;

const ARMS_FORWARD: [number, number, number] = [-Math.PI / 2, 0, 0];

const HUMANOID_PARTS: PartDef[] = [
  { role: 'head', label: 'Head', size: [8, 8, 8], uv: [0, 0], pivot: [0, 24, 0], offset: [0, 4, 0] },
  { role: 'body', label: 'Body', size: [8, 12, 4], uv: [16, 16], pivot: [0, 24, 0], offset: [0, -6, 0] },
  { role: 'armR', label: 'Right arm', size: [4, 12, 4], uv: [40, 16], pivot: [6, 22, 0], offset: [0, -4, 0], rest: ARMS_FORWARD },
  { role: 'armL', label: 'Left arm', size: [4, 12, 4], uv: [32, 48], pivot: [-6, 22, 0], offset: [0, -4, 0], rest: ARMS_FORWARD },
  { role: 'legR', label: 'Right leg', size: [4, 12, 4], uv: [0, 16], pivot: [2, 12, 0], offset: [0, -6, 0] },
  { role: 'legL', label: 'Left leg', size: [4, 12, 4], uv: [16, 48], pivot: [-2, 12, 0], offset: [0, -6, 0] },
];

export const MODELS: Record<ModelId, ModelDef> = {
  humanoid: {
    label: 'Humanoid',
    parts: HUMANOID_PARTS,
  },
  jetpackHumanoid: {
    label: 'Humanoid with jetpack',
    parts: [
      ...HUMANOID_PARTS,
      // Uses the spare corner of the skin (where Minecraft keeps the left-arm overlay).
      { role: 'jetpack', label: 'Jetpack', size: [5, 13, 3], uv: [48, 48], pivot: [0, 22, -2], offset: [0, 0, -1.5] },
    ],
  },
  // ZomWes 8000's bodyguards: a humanoid holding a scythe upright in its right
  // hand, left arm across the body. Same skin layout as the humanoid.
  guardian: {
    label: 'Guardian',
    gait: 'leapSlice',
    parts: HUMANOID_PARTS.map((p) =>
      p.role === 'armR' ? { ...p, rest: [-0.5, 0, 0.15] as [number, number, number] }
      : p.role === 'armL' ? { ...p, rest: [-1.1, 0, 0.6] as [number, number, number] }
      : p),
  },
  // The Necro-Gardener: a lanky humanoid. His right arm (a watering can at the
  // end) is held out to pour; the left hangs loose. Same skin layout as the
  // humanoid.
  gardener: {
    label: 'Necro-Gardener',
    walkSwing: 0.5,
    parts: HUMANOID_PARTS.map((p) =>
      p.role === 'armR' ? { ...p, rest: [-1.15, 0, 0.1] as [number, number, number] }
      : p.role === 'armL' ? { ...p, rest: [-0.25, 0, -0.2] as [number, number, number] }
      : p),
  },
  // The Ship Captain: broad and armored, with huge arms that bulge at the
  // shoulder. His right arm (a rocket launcher at the end) points forward;
  // the left hangs ready, fist clenched. Packed into a 64-unit page.
  captain: {
    label: 'Ship Captain',
    walkSwing: 0.45,
    parts: [
      { role: 'head', label: 'Head', size: [8, 8, 8], uv: [0, 0], pivot: [0, 23, 0], offset: [0, 4, 0] },
      { role: 'body', label: 'Body', size: [10, 12, 6], uv: [32, 0], pivot: [0, 23, 0], offset: [0, -6, 0] },
      { role: 'armR', label: 'Right arm', size: [5, 13, 5], taper: 1.35, uv: [0, 18], pivot: [8, 21.5, 0], offset: [0, -4.5, 0], rest: [-Math.PI / 2, 0, 0] },
      { role: 'armL', label: 'Left arm', size: [5, 13, 5], taper: 1.35, uv: [20, 18], pivot: [-8, 21.5, 0], offset: [0, -4.5, 0], rest: [-0.15, 0, -0.18] },
      { role: 'legR', label: 'Right leg', size: [5, 11, 5], uv: [0, 38], pivot: [2.7, 11, 0], offset: [0, -5.5, 0] },
      { role: 'legL', label: 'Left leg', size: [5, 11, 5], uv: [20, 38], pivot: [-2.7, 11, 0], offset: [0, -5.5, 0] },
    ],
  },
  // Satan: a big red gut on goat legs (thighs forward, shins sweeping back
  // to the hooves), a long thin tail, and his arms held to play the guitar
  // slung across his gut. The horns and the spade on the tail are built in
  // code. Packed into a 64-unit page.
  satan: {
    label: 'Satan',
    walkSwing: 0.4,
    parts: [
      { role: 'body', label: 'Body', size: [10, 10, 6], uv: [32, 0], pivot: [0, 25, 0], offset: [0, -5, 0] },
      { role: 'head', label: 'Head', size: [8, 8, 8], uv: [0, 0], pivot: [0, 25, 0], offset: [0, 4, 0] },
      { role: 'gut', label: 'Gut', size: [9, 8, 5], uv: [32, 16], pivot: [0, 19, 3], parent: 'body', offset: [0, 0, 1.5] },
      { role: 'armR', label: 'Right arm', size: [4, 12, 4], uv: [0, 16], pivot: [7, 24, 0], offset: [0, -4.5, 0], rest: [-0.75, 0.2, 0.25] },
      { role: 'armL', label: 'Left arm', size: [4, 12, 4], uv: [16, 16], pivot: [-7, 24, 0], offset: [0, -4.5, 0], rest: [-1.25, -0.5, -0.35] },
      // Goat legs: the thigh juts forward, the shin sweeps back down to the hoof.
      { role: 'legR', label: 'Right thigh', size: [5, 7, 5], uv: [0, 32], pivot: [2.6, 15, 0], offset: [0, -3, 0], rest: [-0.55, 0, 0] },
      { role: 'legL', label: 'Left thigh', size: [5, 7, 5], uv: [20, 32], pivot: [-2.6, 15, 0], offset: [0, -3, 0], rest: [-0.55, 0, 0] },
      { role: 'footR', label: 'Right shin and hoof', size: [3, 11, 3], uv: [40, 32], pivot: [2.6, 9, 0], parent: 'legR', offset: [0, -5, 0], rest: [1.0, 0, 0] },
      { role: 'footL', label: 'Left shin and hoof', size: [3, 11, 3], uv: [52, 32], pivot: [-2.6, 9, 0], parent: 'legL', offset: [0, -5, 0], rest: [1.0, 0, 0] },
      // A long thin tail: out the back and down, then curling up.
      { role: 'tail', label: 'Tail', size: [1, 12, 1], uv: [0, 48], pivot: [0, 16, -2.5], offset: [0, -6, 0], rest: [1.6, 0, 0] },
      { role: 'tailTip', label: 'Tail tip', size: [1, 8, 1], uv: [4, 48], pivot: [0, 4, -2.5], parent: 'tail', offset: [0, -4, 0], rest: [-1.9, 0, 0] },
    ],
  },
  // A Biker Zombie, sat on its chopper: legs out on the footpegs, arms up on
  // the handlebars. Same skin layout as the humanoid; the bike is built in code.
  biker: {
    label: 'Biker',
    gait: 'ride',
    parts: HUMANOID_PARTS.map((p) =>
      p.role === 'armR' ? { ...p, rest: [-1.25, 0, 0.12] as [number, number, number] }
      : p.role === 'armL' ? { ...p, rest: [-1.25, 0, -0.12] as [number, number, number] }
      : p.role === 'legR' ? { ...p, rest: [-1.35, 0, 0.12] as [number, number, number] }
      : p.role === 'legL' ? { ...p, rest: [-1.35, 0, -0.12] as [number, number, number] }
      : p),
  },
  // The Headless Horseman, sat high on his horse (the saddle is HORSE_SADDLE
  // up): legs astride its flanks, his sword arm up and forward, the other
  // hand on the reins. No head at all. Same skin layout as the humanoid
  // (the head's corner is left empty); the horse is built in code.
  horseman: {
    label: 'Headless Horseman',
    gait: 'ride',
    parts: HUMANOID_PARTS.filter((p) => p.role !== 'head').map((p) => {
      const raised = { ...p, pivot: [p.pivot[0], p.pivot[1] + HORSE_SADDLE - 12, p.pivot[2]] as [number, number, number] };
      return p.role === 'armR' ? { ...raised, rest: [-1.05, 0, 0.12] as [number, number, number] }
        : p.role === 'armL' ? { ...raised, rest: [-0.95, 0, -0.1] as [number, number, number] }
        : p.role === 'legR' ? { ...raised, rest: [-0.35, 0, 0.5] as [number, number, number] }
        : p.role === 'legL' ? { ...raised, rest: [-0.35, 0, -0.5] as [number, number, number] }
        : raised;
    }),
  },
  // ZomWes 8000's walker: a hulking robot on bell-bottom legs, with a little
  // driver on its head pulling levers. From Wesley's drawing.
  westbot: {
    label: 'Westbot',
    skinUnits: 128,
    walkSwing: 0.25,
    parts: [
      { role: 'body', label: 'Body', size: [12, 12, 6], uv: [40, 0], pivot: [0, 26, 0], offset: [0, -6, 0] },
      { role: 'head', label: 'Head', size: [10, 9, 9], uv: [0, 0], pivot: [0, 26, 0], offset: [0, 4.5, 0] },
      // Right arm raised high, left arm swung across the body.
      { role: 'armR', label: 'Right arm', size: [4, 14, 4], uv: [78, 0], pivot: [8, 24, 0], offset: [0, -5, 0], rest: [-2.6, 0, 0.35] },
      { role: 'armL', label: 'Left arm', size: [4, 14, 4], uv: [96, 0], pivot: [-8, 24, 0], offset: [0, -5, 0], rest: [-1.0, 0, 0.75] },
      // Bell-bottoms: narrow at the hip, flaring out wide at the hem.
      { role: 'legR', label: 'Right leg', size: [10, 14, 10], taper: 0.5, uv: [0, 20], pivot: [5, 14, 0], offset: [0, -7, 0] },
      { role: 'legL', label: 'Left leg', size: [10, 14, 10], taper: 0.5, uv: [42, 20], pivot: [-5, 14, 0], offset: [0, -7, 0] },
      // The driver, riding on the head.
      { role: 'driverBody', label: 'Driver body', size: [4, 4, 3], uv: [84, 20], pivot: [0, 35, 0], parent: 'head', offset: [0, 2, 0] },
      { role: 'driverHead', label: 'Driver head', size: [4, 4, 4], uv: [84, 28], pivot: [0, 39, 0], parent: 'driverBody', offset: [0, 2, 0] },
      { role: 'driverArmR', label: 'Driver right arm', size: [1, 4, 1], uv: [100, 20], pivot: [2.5, 38.5, 0], parent: 'driverBody', offset: [0, -2, 0], rest: [-1.0, 0, 0] },
      { role: 'driverArmL', label: 'Driver left arm', size: [1, 4, 1], uv: [105, 20], pivot: [-2.5, 38.5, 0], parent: 'driverBody', offset: [0, -2, 0], rest: [-1.0, 0, 0] },
      // Control levers sticking up out of the robot's head.
      { role: 'leverR', label: 'Right lever', size: [1, 3, 1], uv: [100, 27], pivot: [2.3, 35, 2.2], parent: 'head', offset: [0, 1.5, 0], rest: [0.45, 0, 0] },
      { role: 'leverL', label: 'Left lever', size: [1, 3, 1], uv: [105, 27], pivot: [-2.3, 35, 2.2], parent: 'head', offset: [0, 1.5, 0], rest: [0.45, 0, 0] },
    ],
  },
};

/** Where each face of a part sits in the skin, in units. */
export function faceRects(part: PartDef): Record<FaceName, Rect> {
  const [w, h, d] = part.size;
  const [u, v] = part.uv;
  return {
    top: { x: u + d, y: v, w, h: d },
    bottom: { x: u + d + w, y: v, w, h: d },
    right: { x: u, y: v + d, w: d, h },
    front: { x: u + d, y: v + d, w, h },
    left: { x: u + d + w, y: v + d, w: d, h },
    back: { x: u + 2 * d + w, y: v + d, w, h },
  };
}

export const FACE_LABELS: Record<FaceName, string> = {
  top: 'top', bottom: 'bottom', right: 'right side', front: 'front', left: 'left side', back: 'back',
};
