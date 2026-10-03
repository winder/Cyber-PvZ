// ============================================================================
//  Blocky character models (Minecraft-style).
//
//  Each part is a box. Its texture is "unfolded" onto the skin image the same
//  way a Minecraft skin is, so 64×64 Minecraft skins work too. Skins can be
//  any multiple of 64 wide (we use 128×128 for more detail).
//
//  Units: 1 unit = 1 pixel of a 64×64 skin. A humanoid is 32 units tall.
//  The model faces +z. Its right side is +x.
//
//  This file must not import anything: the skin generator script reads it.
// ============================================================================

export type FaceName = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back';
export type PartRole = 'head' | 'body' | 'armR' | 'armL' | 'legR' | 'legL' | 'jetpack';
export type ModelId = 'humanoid' | 'jetpackHumanoid';

export interface Rect { x: number; y: number; w: number; h: number }

export interface PartDef {
  role: PartRole;
  label: string;
  /** Width (x), height (y), depth (z). */
  size: [number, number, number];
  /** Top-left corner of this part's unfolded box in the skin. */
  uv: [number, number];
  /** Joint the part turns around, measured from the feet. */
  pivot: [number, number, number];
  /** Box center, measured from the pivot. */
  offset: [number, number, number];
  /** Resting rotation (radians) around x, y, z. */
  rest?: [number, number, number];
}

export interface ModelDef {
  label: string;
  parts: PartDef[];
}

/** Skin layout size in units. */
export const SKIN_UNITS = 64;

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
