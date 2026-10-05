import {
  Color3, Material, Mesh, Scene, StandardMaterial, Texture, TransformNode, VertexData,
  type AbstractMesh, type BaseTexture,
} from '@babylonjs/core';
import {
  MODELS, SKIN_UNITS, faceRects, skinUnits, type FaceName, type ModelId, type PartDef, type PartRole,
} from '../models/models';

/** World size of one skin unit. A humanoid (32 units) is 1.6 tall. */
export const UNIT = 0.05;

// Corners of each face as seen from outside: top-left, top-right, bottom-right, bottom-left.
// Signs of (x, y, z) relative to the box center.
const FACE_CORNERS: Record<FaceName, [number, number, number][]> = {
  front: [[1, 1, 1], [-1, 1, 1], [-1, -1, 1], [1, -1, 1]],
  back: [[-1, 1, -1], [1, 1, -1], [1, -1, -1], [-1, -1, -1]],
  right: [[1, 1, -1], [1, 1, 1], [1, -1, 1], [1, -1, -1]],
  left: [[-1, 1, 1], [-1, 1, -1], [-1, -1, -1], [-1, -1, 1]],
  top: [[1, 1, -1], [-1, 1, -1], [-1, 1, 1], [1, 1, 1]],
  bottom: [[1, -1, 1], [-1, -1, 1], [-1, -1, -1], [1, -1, -1]],
};

/** A textured box for one part, centered on its own origin. */
export function buildPartMesh(name: string, part: PartDef, scene: Scene, units = SKIN_UNITS): Mesh {
  const [w, h, d] = part.size;
  const hx = (w / 2) * UNIT, hy = (h / 2) * UNIT, hz = (d / 2) * UNIT;
  const taper = part.taper ?? 1;
  const rects = faceRects(part);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const face of Object.keys(FACE_CORNERS) as FaceName[]) {
    const r = rects[face];
    const base = positions.length / 3;
    const corners = FACE_CORNERS[face];
    const uvCorners = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
    // Tapered parts pull their top corners in.
    const pts = corners.map(([sx, sy, sz]) => {
      const k = sy > 0 ? taper : 1;
      return [sx * hx * k, sy * hy, sz * hz * k];
    });
    // Face normal from its edges (sides of a tapered part lean outward).
    const [tl, tr, , bl] = pts;
    const ax = tr[0] - tl[0], ay = tr[1] - tl[1], az = tr[2] - tl[2];
    const bx = bl[0] - tl[0], by = bl[1] - tl[1], bz = bl[2] - tl[2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    for (let i = 0; i < 4; i++) {
      positions.push(...pts[i]);
      normals.push(nx / nl, ny / nl, nz / nl);
      uvs.push(uvCorners[i][0] / units, 1 - uvCorners[i][1] / units);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.uvs = uvs;
  data.indices = indices;
  data.applyToMesh(mesh);
  return mesh;
}

/** Material for a skin: crisp pixels, see-through where the skin is transparent. */
export function skinMaterial(name: string, texture: BaseTexture, scene: Scene): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  texture.hasAlpha = true;
  m.diffuseTexture = texture;
  m.specularColor = new Color3(0.05, 0.05, 0.05);
  m.emissiveColor = new Color3(0.18, 0.18, 0.2);
  m.transparencyMode = Material.MATERIAL_ALPHATEST;
  m.alphaCutOff = 0.5;
  m.backFaceCulling = false;
  return m;
}

export function loadSkinTexture(url: string, scene: Scene): Texture {
  return new Texture(url, scene, { noMipmap: true, samplingMode: Texture.NEAREST_SAMPLINGMODE });
}

/** A posed, animatable character made of parts. */
export interface BlockCharacter {
  model: ModelId;
  root: TransformNode;
  joints: Partial<Record<PartRole, TransformNode>>;
  /** Resting rotation of each joint; animation moves relative to this. */
  rest: Partial<Record<PartRole, [number, number, number]>>;
  meshes: AbstractMesh[];
}

/**
 * Templates hold one real mesh per part; characters made from them are cheap
 * instances (lots of zombies, few draw calls).
 */
export class BlockTemplate {
  readonly parts: { def: PartDef; mesh: Mesh }[];

  constructor(scene: Scene, readonly model: ModelId, material: Material, name: string) {
    this.parts = MODELS[model].parts.map((def) => {
      const mesh = buildPartMesh(`${name}-${def.role}`, def, scene, skinUnits(model));
      mesh.material = material;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      return { def, mesh };
    });
  }

  spawn(name: string, scene: Scene): BlockCharacter {
    return assemble(name, scene, this.model, this.parts.map(({ def, mesh }) => {
      const inst = mesh.createInstance(`${name}-${def.role}`);
      inst.isPickable = false;
      return { def, mesh: inst };
    }));
  }
}

/** Put part meshes onto joints at their pivots. */
export function assemble(name: string, scene: Scene, model: ModelId, parts: { def: PartDef; mesh: AbstractMesh }[]): BlockCharacter {
  const root = new TransformNode(name, scene);
  const joints: Partial<Record<PartRole, TransformNode>> = {};
  const rest: Partial<Record<PartRole, [number, number, number]>> = {};
  const pivots: Partial<Record<PartRole, [number, number, number]>> = {};
  const meshes: AbstractMesh[] = [];
  for (const { def, mesh } of parts) {
    const joint = new TransformNode(`${name}-${def.role}-joint`, scene);
    // Attached parts hang off their parent's joint; pivots are measured from the feet.
    const parentJoint = def.parent ? joints[def.parent] : undefined;
    const base = def.parent ? pivots[def.parent] ?? [0, 0, 0] : [0, 0, 0];
    joint.parent = parentJoint ?? root;
    joint.position.set((def.pivot[0] - base[0]) * UNIT, (def.pivot[1] - base[1]) * UNIT, (def.pivot[2] - base[2]) * UNIT);
    if (def.rest) joint.rotation.set(...def.rest);
    rest[def.role] = def.rest ?? [0, 0, 0];
    pivots[def.role] = def.pivot;
    mesh.parent = joint;
    mesh.position.set(def.offset[0] * UNIT, def.offset[1] * UNIT, def.offset[2] * UNIT);
    mesh.setEnabled(true);
    joints[def.role] = joint;
    meshes.push(mesh);
  }
  return { model, root, joints, rest, meshes };
}

export interface PoseState {
  moving: boolean;
  chewing: boolean;
  flying: boolean;
}

/** What a gait asks of the whole body, beyond bending its joints. */
export interface BodyMotion {
  /** How far to lift the body (skin units, before scaling). */
  lift: number;
  /**
   * Where the body should be along its stride, relative to where steady
   * walking would put it, as a fraction of one cycle's travel. Gaits that
   * cover ground in bursts (leaps) lag behind, then catch up and overtake;
   * it always averages out to zero, so the body stays with the sim.
   */
  stride: number;
}

const STILL: BodyMotion = { lift: 0, stride: 0 };

/**
 * Walk / chew / fly animation. `t` is seconds; `seed` keeps zombies out of step.
 */
export function animate(c: BlockCharacter, t: number, s: PoseState, seed = 0): BodyMotion {
  if (MODELS[c.model].gait === 'leapSlice' && !s.flying && (s.moving || s.chewing)) return leapSlice(c, t, s, seed);
  walkCycle(c, t, s, seed);
  return STILL;
}

/** Seconds per leap (or per hop-and-slash when attacking). */
export const LEAP_SECONDS = 1.5;
const SLASH_SECONDS = 0.95;

/** Phase timings through one cycle (0 → 1), and how high the jump goes. */
interface LeapTiming { takeoff: number; land: number; sliced: number; rise: number; height: number }
const LEAP: LeapTiming = { takeoff: 0.12, land: 0.5, sliced: 0.57, rise: 0.72, height: 8 };
const HOP: LeapTiming = { takeoff: 0.1, land: 0.4, sliced: 0.47, rise: 0.6, height: 5 };

const smooth = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

/**
 * Jump, slice, stand up, again. Crouch with the scythe drawn back, spring
 * forward in an arc while raising it overhead, land with a fast slice into a
 * deep lunge, hold it, then rise and go again. Moving, the arc covers the
 * ground; attacking, it's a short hop on the spot.
 */
function leapSlice(c: BlockCharacter, t: number, s: PoseState, seed: number): BodyMotion {
  const j = c.joints;
  const rest = (role: PartRole) => c.rest[role] ?? [0, 0, 0];
  const leaping = s.moving && !s.chewing;
  const ph = leaping ? LEAP : HOP;
  const period = leaping ? LEAP_SECONDS : SLASH_SECONDS;
  const k = (((t + seed * 0.37) / period) % 1 + 1) % 1;

  // How far through the airborne part (0 → 1), and the crouch (0 = upright, 1 = deep).
  const a = Math.min(1, Math.max(0, (k - ph.takeoff) / (ph.land - ph.takeoff)));
  const inAir = k > ph.takeoff && k < ph.land;
  let crouch: number;
  if (k < ph.takeoff) crouch = smooth(k / ph.takeoff) * 0.7;
  else if (inAir) crouch = 0.7 * (1 - smooth(a / 0.2)) + smooth((a - 0.8) / 0.2) * 0.5; // spring off, brace to land
  else if (k < ph.rise) crouch = 1;
  else crouch = 1 - smooth((k - ph.rise) / (1 - ph.rise));

  // Scythe arm: drawn back, raised overhead in the air, a fast slice on landing.
  let swing: number;
  if (k < ph.takeoff) swing = -0.6 * smooth(k / ph.takeoff);
  else if (inAir) swing = -0.6 - 2.1 * smooth(a / 0.7);
  else if (k < ph.sliced) swing = -2.7 + 2.3 * Math.pow((k - ph.land) / (ph.sliced - ph.land), 0.6); // SLICE
  else if (k < ph.rise) swing = -0.4; // blade held low in front
  else swing = -0.4 * (1 - smooth((k - ph.rise) / (1 - ph.rise)));
  const across = k >= ph.land ? (k < ph.rise ? 1 : 1 - smooth((k - ph.rise) / (1 - ph.rise))) : 0;
  if (j.armR) {
    j.armR.rotation.x = rest('armR')[0] + swing;
    j.armR.rotation.z = rest('armR')[2] - 0.5 * across;
  }
  // Free arm balances: flung back in the air, forward into the lunge.
  if (j.armL) j.armL.rotation.x = rest('armL')[0] + (inAir ? 0.7 * Math.sin(a * Math.PI) : 0) - 0.4 * crouch * across;

  // Legs: tucked in the air, a lunge (one forward, one back) on the ground.
  const tuck = inAir ? Math.sin(a * Math.PI) : 0;
  if (j.legR) j.legR.rotation.x = rest('legR')[0] - tuck * 0.9 - crouch * 0.6;
  if (j.legL) j.legL.rotation.x = rest('legL')[0] - tuck * 0.5 + crouch * 0.5;
  if (j.footR && j.legR) j.footR.rotation.x = rest('footR')[0] - (j.legR.rotation.x - rest('legR')[0]) * 0.7;
  if (j.footL && j.legL) j.footL.rotation.x = rest('footL')[0] - (j.legL.rotation.x - rest('legL')[0]) * 0.7;

  // Lean: forward to spring, a dive through the air, deep into the slice.
  const lean = inAir ? 0.2 : k < ph.takeoff ? 0.3 * crouch : 0.55 * crouch;
  if (j.body) j.body.rotation.x = rest('body')[0] + lean;
  if (j.head) {
    j.head.rotation.x = -lean * 0.5; // eyes stay on the target
    j.head.rotation.y = 0;
  }

  const lift = (inAir ? Math.sin(a * Math.PI) * ph.height : 0) - crouch * 1.6;
  // Ground is only covered in the air (at a steady pace, like a real jump).
  const stride = leaping ? (k < ph.takeoff ? 0 : a) - k : 0;
  return { lift, stride };
}

function walkCycle(c: BlockCharacter, t: number, s: PoseState, seed: number): void {
  const j = c.joints;
  const rest = (role: PartRole) => c.rest[role] ?? [0, 0, 0];
  // Undo anything another gait bent out of shape.
  if (j.body) j.body.rotation.x = rest('body')[0];
  if (j.armR) j.armR.rotation.z = rest('armR')[2];
  const phase = t + seed * 0.37;
  const swing = MODELS[c.model].walkSwing ?? 0.6;
  const walk = s.moving && !s.flying ? Math.sin(phase * 7) : 0;

  if (j.legR && j.legL) {
    if (s.flying) {
      const dangle = 0.35 + Math.sin(phase * 3) * 0.12;
      j.legR.rotation.x = rest('legR')[0] + dangle;
      j.legL.rotation.x = rest('legL')[0] + dangle * 0.8;
    } else {
      j.legR.rotation.x = rest('legR')[0] + walk * swing;
      j.legL.rotation.x = rest('legL')[0] - walk * swing;
    }
  }
  // Big feet stay flat-ish on the ground while the legs swing.
  if (j.footR && j.legR) j.footR.rotation.x = rest('footR')[0] - (j.legR.rotation.x - rest('legR')[0]) * 0.7;
  if (j.footL && j.legL) j.footL.rotation.x = rest('footL')[0] - (j.legL.rotation.x - rest('legL')[0]) * 0.7;

  if (j.armR && j.armL) {
    const chew = s.chewing ? Math.sin(phase * 14) * 0.45 : 0;
    j.armR.rotation.x = rest('armR')[0] + chew - walk * 0.12;
    j.armL.rotation.x = rest('armL')[0] - chew + walk * 0.12;
  }
  if (j.head) {
    j.head.rotation.x = s.chewing ? Math.sin(phase * 14) * 0.15 : 0;
    j.head.rotation.y = s.moving ? Math.sin(phase * 1.3) * 0.15 : 0;
  }
  // The little driver: jiggles along, looks around, and works the levers.
  if (j.driverBody) j.driverBody.rotation.z = s.moving ? Math.sin(phase * 7) * 0.08 : 0;
  const leverSpeed = s.chewing ? 9 : s.moving ? 3.5 : 1.2;
  const pull = Math.sin(phase * leverSpeed) * 0.35;
  if (j.leverR) j.leverR.rotation.x = rest('leverR')[0] + pull;
  if (j.leverL) j.leverL.rotation.x = rest('leverL')[0] - pull;
  // Arms follow their lever so the hands stay on the grips.
  if (j.driverArmR) j.driverArmR.rotation.x = rest('driverArmR')[0] - pull * 0.6;
  if (j.driverArmL) j.driverArmL.rotation.x = rest('driverArmL')[0] + pull * 0.6;
  if (j.driverHead) j.driverHead.rotation.y = Math.sin(phase * 0.9) * 0.8 + (s.chewing ? Math.sin(phase * 20) * 0.15 : 0);
}
