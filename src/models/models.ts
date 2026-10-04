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
  | 'driverArmR' | 'driverArmL' | 'leverR' | 'leverL';
export type ModelId = 'humanoid' | 'jetpackHumanoid' | 'westbot' | 'guardian';

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
  /** How it moves: an ordinary walk, or leaping bounds with a slice on landing. */
  gait?: 'walk' | 'leapSlice';
}

/** Default skin layout size in units. */
export const SKIN_UNITS = 64;

export function skinUnits(model: ModelId): number {
  return MODELS[model].skinUnits ?? SKIN_UNITS;
}

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
