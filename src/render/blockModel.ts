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

/**
 * Walk / chew / fly animation. `t` is seconds; `seed` keeps zombies out of step.
 * Returns how far to lift the whole body (in skin units, before scaling), for
 * gaits that leave the ground.
 */
export function animate(c: BlockCharacter, t: number, s: PoseState, seed = 0): number {
  if (MODELS[c.model].gait === 'leapSlice' && !s.flying) return leapSlice(c, t, s, seed);
  walkCycle(c, t, s, seed);
  return 0;
}

const LEAP_SECONDS = 0.9;
const SLASH_SECONDS = 0.55;

/**
 * Bounding leaps: crouch, spring up with legs tucked and the weapon raised
 * overhead, then land with a fast slice and lean into it. Attacking repeats
 * the slice on the spot, quicker and without leaving the ground.
 */
function leapSlice(c: BlockCharacter, t: number, s: PoseState, seed: number): number {
  const j = c.joints;
  const rest = (role: PartRole) => c.rest[role] ?? [0, 0, 0];
  const leaping = s.moving && !s.chewing;
  if (!leaping && !s.chewing) {
    walkCycle(c, t, s, seed);
    return 0;
  }
  const period = leaping ? LEAP_SECONDS : SLASH_SECONDS;
  const k = (((t + seed * 0.37) / period) % 1 + 1) % 1; // 0 → 1 through one leap

  // Phases: crouch (0–0.12), airborne (0.12–0.62), slice on landing (0.62–0.8), recover.
  const air = k > 0.12 && k < 0.62 ? Math.sin(((k - 0.12) / 0.5) * Math.PI) : 0;
  const crouch = k < 0.12 ? Math.sin((k / 0.12) * Math.PI) : k > 0.62 && k < 0.8 ? Math.sin(((k - 0.62) / 0.18) * Math.PI) * 0.6 : 0;

  // Weapon arm: wind up overhead in the air, then a fast slice down and across.
  let swing: number;
  if (k < 0.12) swing = 0;
  else if (k < 0.62) swing = -2.3 * Math.min(1, (k - 0.12) / 0.3); // raise overhead
  else if (k < 0.72) swing = -2.3 + 3.0 * ((k - 0.62) / 0.1); // SLICE
  else swing = 0.7 * (1 - (k - 0.72) / 0.28); // follow-through, back to rest
  if (j.armR) {
    j.armR.rotation.x = rest('armR')[0] + swing;
    j.armR.rotation.z = rest('armR')[2] + (k > 0.62 && k < 0.8 ? -0.5 : 0); // across the body
  }
  if (j.armL) j.armL.rotation.x = rest('armL')[0] - air * 0.6;

  // Legs tuck up in the air, bend on landing.
  const tuck = air * (leaping ? 0.9 : 0);
  if (j.legR) j.legR.rotation.x = rest('legR')[0] - tuck - crouch * 0.4;
  if (j.legL) j.legL.rotation.x = rest('legL')[0] - tuck * 0.7 + crouch * 0.3;

  // Lean into the slice; head follows.
  const lean = k > 0.62 && k < 0.85 ? Math.sin(((k - 0.62) / 0.23) * Math.PI) * 0.35 : 0;
  if (j.body) j.body.rotation.x = rest('body')[0] + lean - air * 0.1;
  if (j.head) {
    j.head.rotation.x = lean * 0.6;
    j.head.rotation.y = 0;
  }

  // Lift (skin units): a high arc in the air, a dip when crouching.
  return leaping ? air * 14 - crouch * 1.5 : -crouch * 1.2;
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
