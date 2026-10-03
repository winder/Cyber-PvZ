import {
  Color3, Material, Mesh, Scene, StandardMaterial, Texture, TransformNode, VertexData,
  type AbstractMesh, type BaseTexture,
} from '@babylonjs/core';
import {
  MODELS, SKIN_UNITS, faceRects, type FaceName, type ModelId, type PartDef, type PartRole,
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

const FACE_NORMALS: Record<FaceName, [number, number, number]> = {
  front: [0, 0, 1], back: [0, 0, -1], right: [1, 0, 0], left: [-1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0],
};

/** A textured box for one part, centered on its own origin. */
export function buildPartMesh(name: string, part: PartDef, scene: Scene): Mesh {
  const [w, h, d] = part.size;
  const hx = (w / 2) * UNIT, hy = (h / 2) * UNIT, hz = (d / 2) * UNIT;
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
    for (let i = 0; i < 4; i++) {
      const [sx, sy, sz] = corners[i];
      positions.push(sx * hx, sy * hy, sz * hz);
      normals.push(...FACE_NORMALS[face]);
      uvs.push(uvCorners[i][0] / SKIN_UNITS, 1 - uvCorners[i][1] / SKIN_UNITS);
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
  root: TransformNode;
  joints: Partial<Record<PartRole, TransformNode>>;
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
      const mesh = buildPartMesh(`${name}-${def.role}`, def, scene);
      mesh.material = material;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      return { def, mesh };
    });
  }

  spawn(name: string, scene: Scene): BlockCharacter {
    return assemble(name, scene, this.parts.map(({ def, mesh }) => {
      const inst = mesh.createInstance(`${name}-${def.role}`);
      inst.isPickable = false;
      return { def, mesh: inst };
    }));
  }
}

/** Put part meshes onto joints at their pivots. */
export function assemble(name: string, scene: Scene, parts: { def: PartDef; mesh: AbstractMesh }[]): BlockCharacter {
  const root = new TransformNode(name, scene);
  const joints: Partial<Record<PartRole, TransformNode>> = {};
  const meshes: AbstractMesh[] = [];
  for (const { def, mesh } of parts) {
    const joint = new TransformNode(`${name}-${def.role}-joint`, scene);
    joint.parent = root;
    joint.position.set(def.pivot[0] * UNIT, def.pivot[1] * UNIT, def.pivot[2] * UNIT);
    if (def.rest) joint.rotation.set(...def.rest);
    mesh.parent = joint;
    mesh.position.set(def.offset[0] * UNIT, def.offset[1] * UNIT, def.offset[2] * UNIT);
    mesh.setEnabled(true);
    joints[def.role] = joint;
    meshes.push(mesh);
  }
  return { root, joints, meshes };
}

export interface PoseState {
  moving: boolean;
  chewing: boolean;
  flying: boolean;
}

/** Walk / chew / fly animation. `t` is seconds; `seed` keeps zombies out of step. */
export function animate(c: BlockCharacter, t: number, s: PoseState, seed = 0): void {
  const j = c.joints;
  const phase = t + seed * 0.37;
  const walk = s.moving && !s.flying ? Math.sin(phase * 7) : 0;

  if (j.legR && j.legL) {
    if (s.flying) {
      const dangle = 0.35 + Math.sin(phase * 3) * 0.12;
      j.legR.rotation.x = dangle;
      j.legL.rotation.x = dangle * 0.8;
    } else {
      j.legR.rotation.x = walk * 0.6;
      j.legL.rotation.x = -walk * 0.6;
    }
  }
  if (j.armR && j.armL) {
    const base = -Math.PI / 2;
    const chew = s.chewing ? Math.sin(phase * 14) * 0.45 : 0;
    j.armR.rotation.x = base + chew - walk * 0.12;
    j.armL.rotation.x = base - chew + walk * 0.12;
  }
  if (j.head) {
    j.head.rotation.x = s.chewing ? Math.sin(phase * 14) * 0.15 : 0;
    j.head.rotation.y = s.moving ? Math.sin(phase * 1.3) * 0.15 : 0;
  }
}
