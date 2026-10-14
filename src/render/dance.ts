// How a blocky humanoid rocks out: moves for zombies in the mosh pit, and
// for the fans in the stands. A pose is a set of joint rotations (radians,
// absolute, x/y/z like a TransformNode's) plus how the whole body is lifted
// and tipped. Looks only.

export type MoshMove =
  | 'horns' // both hands up throwing the horns, pumping
  | 'windmill' // windmilling the strumming arm round and round
  | 'airGuitar' // leaning back into a squealing air guitar solo
  | 'drumSolo' // crouched over an invisible kit, hammering away
  | 'headbang' // whole body whipping forward and back
  | 'pogo' // bouncing straight up and down, arms pinned
  | 'crowdSurf'; // lying flat on its back, carried along overhead

export const MOSH_MOVES: MoshMove[] = ['horns', 'windmill', 'airGuitar', 'drumSolo', 'headbang', 'pogo', 'crowdSurf'];

/** Fans in the stands have two more: arms waving overhead, and swaying with a lighter. */
export type FanMove = MoshMove | 'cheer' | 'sway';

export type Vec = [number, number, number];

export interface Pose {
  head: Vec;
  body: Vec;
  armR: Vec;
  armL: Vec;
  legR: Vec;
  legL: Vec;
  /** How far up the whole body is (skin units; negative = crouched down). */
  lift: number;
  /** Whole body tipped forward (+) or back (-), radians. */
  tilt: number;
}

export function newPose(): Pose {
  return { head: [0, 0, 0], body: [0, 0, 0], armR: [0, 0, 0], armL: [0, 0, 0], legR: [0, 0, 0], legL: [0, 0, 0], lift: 0, tilt: 0 };
}

const set = (v: Vec, x: number, y: number, z: number) => {
  v[0] = x;
  v[1] = y;
  v[2] = z;
};

/** Write the pose for `move`, `t` seconds in, into `out`. `energy` (0–2) speeds it up and makes it bigger. */
export function dancePose(move: FanMove, t: number, out: Pose, energy = 1): Pose {
  const e = Math.max(0.3, energy);
  const s = (f: number, k = 0) => Math.sin(t * f * e + k);
  const bounce = Math.abs(s(4));
  out.lift = 0;
  out.tilt = 0;
  set(out.legR, 0, 0, 0);
  set(out.legL, 0, 0, 0);
  set(out.head, 0, 0, 0);
  set(out.body, 0, 0, 0);
  switch (move) {
    case 'horns':
      // Both hands up, pumping in time.
      set(out.armR, -2.75 + s(8) * 0.25, 0, 0.35);
      set(out.armL, -2.75 + s(8, 1) * 0.25, 0, -0.35);
      set(out.head, 0.15 + s(8) * 0.15, 0, 0);
      out.lift = bounce * 1.2;
      break;
    case 'windmill': {
      // The strumming arm goes right round; the other hand's on the frets.
      set(out.armR, -t * 9 * e, 0, 0.35);
      set(out.armL, -1.35, -0.6, -0.15);
      set(out.body, 0.25, 0.2, 0);
      set(out.head, 0.35, 0, 0);
      set(out.legR, 0, 0, 0.25);
      set(out.legL, 0, 0, -0.25);
      out.lift = -1;
      break;
    }
    case 'airGuitar':
      // Leaning way back, knees bent, fretting hand high, strumming like mad.
      set(out.armR, -0.9 + s(30) * 0.3, 0.2, 0.35);
      set(out.armL, -1.9 + s(7) * 0.1, -0.5, -0.45);
      set(out.body, -0.4, 0, 0);
      set(out.head, -0.55 + s(13) * 0.08, 0, 0);
      set(out.legR, -0.55, 0, 0.15);
      set(out.legL, 0.35, 0, -0.15);
      out.lift = -2.5;
      break;
    case 'drumSolo': {
      // Sat down at an invisible kit, sticks flying, a big crash now and then.
      const crash = (t * e) % 2 < 0.25;
      set(out.armR, crash ? -2.6 : -1 - Math.max(0, s(16)) * 0.7, 0, 0.3);
      set(out.armL, crash ? -2.6 : -1 - Math.max(0, s(16, Math.PI)) * 0.7, 0, -0.3);
      set(out.head, s(8) * 0.25, 0, 0);
      set(out.body, 0.1, 0, 0);
      set(out.legR, -1.45, 0, 0.2);
      set(out.legL, -1.45 + s(8) * 0.15, 0, -0.2);
      out.lift = -5;
      break;
    }
    case 'headbang': {
      // The whole top half whips forward and back.
      const whip = s(11);
      set(out.body, 0.35 + whip * 0.35, 0, 0);
      set(out.head, 0.3 + whip * 0.6, 0, 0);
      set(out.armR, -0.3 + whip * 0.3, 0, 0.25);
      set(out.armL, -0.3 + whip * 0.3, 0, -0.25);
      set(out.legR, 0, 0, 0.2);
      set(out.legL, 0, 0, -0.2);
      break;
    }
    case 'pogo':
      // Boing, boing, boing: straight up and down, arms pinned to the sides.
      set(out.armR, 0, 0, 0.12);
      set(out.armL, 0, 0, -0.12);
      set(out.head, s(12) * 0.1, 0, 0);
      out.lift = Math.abs(s(6)) * 6;
      break;
    case 'crowdSurf':
      // Flat on its back, held up overhead, arms and legs out, bobbing along.
      set(out.armR, -0.4, 0, 1.3 + s(3) * 0.2);
      set(out.armL, -0.4, 0, -1.3 - s(3) * 0.2);
      set(out.legR, s(5) * 0.25, 0, 0.3);
      set(out.legL, -s(5) * 0.25, 0, -0.3);
      set(out.head, -0.3, 0, 0);
      out.tilt = -Math.PI / 2;
      out.lift = 26 + s(3) * 2;
      break;
    case 'cheer':
      // Arms up, waving from side to side.
      set(out.armR, -2.8, 0, 0.4 + s(5) * 0.35);
      set(out.armL, -2.8, 0, -0.4 + s(5) * 0.35);
      set(out.head, -0.15, 0, 0);
      out.lift = bounce * 0.8;
      break;
    case 'sway':
      // One arm up holding a lighter, swaying slowly.
      set(out.armR, -2.9, 0, 0.1 + s(1.5) * 0.25);
      set(out.armL, 0, 0, -0.1);
      set(out.body, 0, 0, s(1.5) * 0.12);
      set(out.head, 0, 0, s(1.5) * 0.15);
      break;
  }
  return out;
}

/**
 * Surging through the pit: shoulder-first, arms flailing, bouncing off
 * everyone. Played between moves while a zombie charges.
 */
export function slamPose(t: number, out: Pose): Pose {
  const s = (f: number, k = 0) => Math.sin(t * f + k);
  set(out.body, 0.4, s(9) * 0.4, 0);
  set(out.head, 0.1, -s(9) * 0.3, 0);
  set(out.armR, -1.2 + s(18) * 0.6, 0, 1.1 + s(14) * 0.4);
  set(out.armL, -1.2 + s(18, 2) * 0.6, 0, -1.1 - s(14, 1) * 0.4);
  set(out.legR, s(14) * 0.7, 0, 0);
  set(out.legL, -s(14) * 0.7, 0, 0);
  out.lift = Math.abs(s(14)) * 1.5;
  out.tilt = 0.25;
  return out;
}
