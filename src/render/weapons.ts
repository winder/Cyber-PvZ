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

/**
 * A rocket launcher in place of a hand: a fat olive tube bolted on at the
 * wrist, running on down the line of the arm, with hazard stripes, a sight on
 * top and a rocket's nose peeking out of the muzzle. Built pointing down -y
 * from the wrist (the way the arm runs). The muzzle is a child named
 * `<name>-muzzle`, where rockets come out.
 */
export function buildRocketLauncher(scene: Scene, name: string): TransformNode {
  const root = new TransformNode(name, scene);
  const mat = (key: string, hex: string, glow = 0) => material(scene, key, () => {
    const m = new StandardMaterial(key, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.emissiveColor = Color3.FromHexString(hex).scale(glow);
    m.specularColor = new Color3(0.25, 0.25, 0.25);
    return m;
  });
  const add = (mesh: Mesh, x: number, y: number, z: number, m: StandardMaterial) => {
    mesh.parent = root;
    mesh.position.set(x * UNIT, y * UNIT, z * UNIT);
    mesh.material = m;
    mesh.isPickable = false;
    return mesh;
  };
  const olive = mat('launcherOlive', '#4f5a2e', 0.12);
  const steel = mat('launcherSteel', '#3a3f48', 0.1);
  const stripe = mat('launcherStripe', '#ffb21f', 0.45);
  const rocket = mat('launcherRocket', '#d8342c', 0.35);

  // The tube, from just above the wrist to well past where the hand would be.
  const top = 3, bottom = -14;
  const tube = MeshBuilder.CreateCylinder(`${name}-tube`, { height: (top - bottom) * UNIT, diameter: 6 * UNIT, tessellation: 8 }, scene);
  add(tube, 0, (top + bottom) / 2, 0, olive);
  // Bolted-on wrist clamp, hazard bands and a flared muzzle.
  add(MeshBuilder.CreateBox(`${name}-clamp`, { width: 6.6 * UNIT, height: 2.5 * UNIT, depth: 6.6 * UNIT }, scene), 0, 2, 0, steel);
  for (const y of [-4, -10]) {
    add(MeshBuilder.CreateCylinder(`${name}-band${y}`, { height: 1.2 * UNIT, diameter: 6.4 * UNIT, tessellation: 8 }, scene), 0, y, 0, stripe);
  }
  add(MeshBuilder.CreateCylinder(`${name}-flare`, { height: 2.5 * UNIT, diameterTop: 6.4 * UNIT, diameterBottom: 7.6 * UNIT, tessellation: 8 }, scene), 0, bottom - 1, 0, steel);
  // A rocket's red nose in the muzzle, ready to go.
  add(MeshBuilder.CreateCylinder(`${name}-nose`, { height: 2.5 * UNIT, diameterTop: 4 * UNIT, diameterBottom: 0.5 * UNIT, tessellation: 8 }, scene), 0, bottom - 2.5, 0, rocket);
  // Sight on top (+z is up when the arm points forward), and a grip box underneath.
  add(MeshBuilder.CreateBox(`${name}-sight`, { width: 1.2 * UNIT, height: 4 * UNIT, depth: 2.5 * UNIT }, scene), 0, -2, 4, steel);
  add(MeshBuilder.CreateBox(`${name}-pack`, { width: 3 * UNIT, height: 5 * UNIT, depth: 2.5 * UNIT }, scene), 0, -5, -4, olive);
  const muzzle = new TransformNode(`${name}-muzzle`, scene);
  muzzle.parent = root;
  muzzle.position.y = (bottom - 3) * UNIT;
  return root;
}

type WeaponKind = 'scythe' | 'rocketLauncher';

const WEAPONS: Record<WeaponKind, (scene: Scene, name: string) => TransformNode> = {
  scythe: buildScythe,
  rocketLauncher: buildRocketLauncher,
};

/** Put a weapon in the character's right hand (or, for a launcher, in place of it). */
export function attachWeapon(scene: Scene, character: BlockCharacter, kind: WeaponKind, name: string): TransformNode | null {
  const arm = character.joints.armR;
  const armDef = MODELS[character.model].parts.find((p) => p.role === 'armR');
  if (!arm || !armDef) return null;
  const weapon = WEAPONS[kind](scene, name);
  weapon.parent = arm;
  if (kind === 'rocketLauncher') {
    // At the wrist, following the arm.
    weapon.position.set(0, (armDef.offset[1] - armDef.size[1] / 2 + 4) * UNIT, 0);
    return weapon;
  }
  // In the hand at the end of the arm, held upright when the arm is at rest.
  const handY = armDef.offset[1] - armDef.size[1] / 2 + 1;
  weapon.position.set(0, handY * UNIT, 0);
  weapon.rotation.x = -(armDef.rest?.[0] ?? 0);
  return weapon;
}
