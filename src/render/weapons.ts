import {
  Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3,
} from '@babylonjs/core';
import { MODELS } from '../models/models';
import { UNIT, type BlockCharacter } from './blockModel';

// Weapons held by blocky characters. Built in skin units, like the models.

function material(scene: Scene, name: string, make: () => StandardMaterial): StandardMaterial {
  return (scene.getMaterialByName(name) as StandardMaterial | null) ?? make();
}

/**
 * A scythe: a long dark pole with a glowing blue crescent blade at the top,
 * curving up and forward (like Wesley's drawing).
 */
export function buildScythe(scene: Scene, name: string): TransformNode {
  const root = new TransformNode(name, scene);

  const poleMat = material(scene, 'scythePole', () => {
    const m = new StandardMaterial('scythePole', scene);
    m.diffuseColor = new Color3(0.22, 0.24, 0.3);
    m.specularColor = new Color3(0.3, 0.3, 0.35);
    return m;
  });
  const bladeMat = material(scene, 'scytheBlade', () => {
    const m = new StandardMaterial('scytheBlade', scene);
    m.diffuseColor = new Color3(0.4, 0.75, 0.9);
    m.emissiveColor = new Color3(0.35, 0.75, 0.95);
    m.backFaceCulling = false;
    return m;
  });

  const bottom = -8, top = 26;
  const pole = MeshBuilder.CreateBox(`${name}-pole`, { width: 1 * UNIT, height: (top - bottom) * UNIT, depth: 1 * UNIT }, scene);
  pole.position.y = ((top + bottom) / 2) * UNIT;
  pole.material = poleMat;
  pole.parent = root;
  pole.isPickable = false;

  // Crescent: the outer edge is an arc rising from the pole top; the inner
  // edge follows it, pulled in toward the arc's center, tapering to a point.
  const R = 9, cz = R;
  const outer: Vector3[] = [], inner: Vector3[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const a = i / steps;
    const th = Math.PI - a * Math.PI * 0.55;
    const z = cz + Math.cos(th) * R, y = top + Math.sin(th) * R;
    const w = 3.2 * (1 - a) * (0.6 + 0.4 * Math.sin(a * Math.PI + 0.6));
    const tz = cz - z, ty = top - y, tl = Math.hypot(tz, ty) || 1;
    outer.push(new Vector3(0, y * UNIT, z * UNIT));
    inner.push(new Vector3(0, (y + (ty / tl) * w) * UNIT, (z + (tz / tl) * w) * UNIT));
  }
  const blade = MeshBuilder.CreateRibbon(`${name}-blade`, { pathArray: [outer, inner], sideOrientation: Mesh.DOUBLESIDE }, scene);
  blade.material = bladeMat;
  blade.parent = root;
  blade.isPickable = false;
  return root;
}

const WEAPONS: Record<'scythe', (scene: Scene, name: string) => TransformNode> = {
  scythe: buildScythe,
};

/** Put a weapon in the character's right hand. */
export function attachWeapon(scene: Scene, character: BlockCharacter, kind: 'scythe', name: string): TransformNode | null {
  const arm = character.joints.armR;
  const armDef = MODELS[character.model].parts.find((p) => p.role === 'armR');
  if (!arm || !armDef) return null;
  const weapon = WEAPONS[kind](scene, name);
  weapon.parent = arm;
  // In the hand at the end of the arm, held upright when the arm is at rest.
  const handY = armDef.offset[1] - armDef.size[1] / 2 + 1;
  weapon.position.set(0, handY * UNIT, 0);
  weapon.rotation.x = -(armDef.rest?.[0] ?? 0);
  return weapon;
}
