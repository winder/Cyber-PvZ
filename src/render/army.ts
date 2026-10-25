import {
  Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode,
} from '@babylonjs/core';
import type { Gun } from '../data/config';
import { MODELS } from '../models/models';
import { UNIT, type BlockCharacter } from './blockModel';

// Gear for the War Zone's zombies, built in skin units like the models: the
// chef's cleaver and the knives he throws, the Executioner's axe, Dr.
// Sawbones's giant syringe, Sergeant Rampage's arsenal (machine gun,
// bazooka, grenade), and hats, handcuffs and a ball and chain.

function material(scene: Scene, name: string, make: (m: StandardMaterial) => void): StandardMaterial {
  const existing = scene.getMaterialByName(name) as StandardMaterial | null;
  if (existing) return existing;
  const m = new StandardMaterial(name, scene);
  m.specularColor = new Color3(0.2, 0.2, 0.2);
  make(m);
  return m;
}

const solid = (scene: Scene, name: string, hex: string, glow = 0, spec = 0.2) => material(scene, name, (m) => {
  m.diffuseColor = Color3.FromHexString(hex);
  m.emissiveColor = Color3.FromHexString(hex).scale(glow);
  m.specularColor = new Color3(spec, spec, spec);
});

/** Adds meshes to a root in skin units. */
function adder(root: TransformNode) {
  return <T extends Mesh>(mesh: T, x: number, y: number, z: number, m: StandardMaterial): T => {
    mesh.parent = root;
    mesh.position.set(x * UNIT, y * UNIT, z * UNIT);
    mesh.material = m;
    mesh.isPickable = false;
    return mesh;
  };
}

const box = (scene: Scene, name: string, w: number, h: number, d: number) =>
  MeshBuilder.CreateBox(name, { width: w * UNIT, height: h * UNIT, depth: d * UNIT }, scene);
const cyl = (scene: Scene, name: string, h: number, d: number, tess = 10, top?: number) =>
  MeshBuilder.CreateCylinder(name, { height: h * UNIT, diameterBottom: d * UNIT, diameterTop: (top ?? d) * UNIT, tessellation: tess }, scene);

function muzzleAt(scene: Scene, name: string, root: TransformNode, x: number, y: number, z: number): TransformNode {
  const m = new TransformNode(`${name}-muzzle`, scene);
  m.parent = root;
  m.position.set(x * UNIT, y * UNIT, z * UNIT);
  return m;
}

/** The chef's cleaver: a big square blade, bloodied, on a wooden handle. Built up +y from the grip. */
export function buildCleaver(scene: Scene, name: string): TransformNode {
  const root = new TransformNode(name, scene);
  const add = adder(root);
  add(box(scene, `${name}-handle`, 1.2, 5, 1.2), 0, 1, 0, solid(scene, 'cleaverHandle', '#4a2e1a', 0, 0.1));
  add(box(scene, `${name}-blade`, 0.4, 7, 6), 0, 7, 2.2, solid(scene, 'cleaverSteel', '#d8dde4', 0.12, 1));
  add(box(scene, `${name}-blood`, 0.45, 2.6, 3), 0, 9.2, 3.6, solid(scene, 'bloodWet', '#8a0d0d', 0.2, 0.8));
  add(box(scene, `${name}-hole`, 0.5, 1, 1), 0, 9.5, 0.5, solid(scene, 'holeDark', '#111111'));
  muzzleAt(scene, name, root, 0, 9, 0);
  return root;
}

/** A thrown kitchen knife (in world units): a blade and a black handle, pointing along +z. */
export function buildKnife(scene: Scene, name: string): TransformNode {
  const root = new TransformNode(name, scene);
  const blade = MeshBuilder.CreateBox(`${name}-blade`, { width: 0.04, height: 0.14, depth: 0.5 }, scene);
  blade.material = solid(scene, 'cleaverSteel', '#d8dde4', 0.12, 1);
  blade.position.z = 0.2;
  blade.parent = root;
  const handle = MeshBuilder.CreateBox(`${name}-handle`, { width: 0.07, height: 0.1, depth: 0.28 }, scene);
  handle.material = solid(scene, 'knifeHandle', '#1a1a1a', 0, 0.3);
  handle.position.z = -0.17;
  handle.parent = root;
  for (const m of [blade, handle]) m.isPickable = false;
  return root;
}

/**
 * The Executioner's axe: a long dark haft and a huge crescent blade, nicked
 * and stained. Built up +y from the grip.
 */
export function buildAxe(scene: Scene, name: string): TransformNode {
  const root = new TransformNode(name, scene);
  const add = adder(root);
  const haft = solid(scene, 'axeHaft', '#3a2416', 0, 0.1);
  const steel = solid(scene, 'axeSteel', '#9aa0a8', 0.06, 0.9);
  const edge = solid(scene, 'axeEdge', '#e8ecf0', 0.2, 1);
  add(box(scene, `${name}-haft`, 1.4, 28, 1.4), 0, 11, 0, haft);
  add(box(scene, `${name}-wrap`, 1.7, 5, 1.7), 0, 0, 0, solid(scene, 'axeWrap', '#1a1210'));
  // The head: the blade sweeping out to the side (away from him), a spike the other way.
  add(box(scene, `${name}-socket`, 2.2, 5, 2.2), 0, 22, 0, steel);
  for (let k = 0; k < 7; k++) {
    // A crescent built of slices, widest at the edge.
    const t = k / 6;
    const h = 5 + t * t * 9;
    add(box(scene, `${name}-blade${k}`, 1.6, h, 0.7), 1.6 + k * 1.4, 22, 0, steel);
  }
  add(box(scene, `${name}-edge`, 0.8, 15, 0.4), 11.6, 22, 0, edge);
  // Blood along the edge.
  add(box(scene, `${name}-blood`, 2.2, 6, 0.8), 10.4, 19.5, 0, solid(scene, 'bloodWet', '#8a0d0d', 0.2, 0.8));
  const spike = add(cyl(scene, `${name}-spike`, 5, 2, 4, 0), -3.5, 22, 0, steel);
  spike.rotation.z = Math.PI / 2;
  muzzleAt(scene, name, root, 11, 22, 0);
  return root;
}

/**
 * Dr. Sawbones's giant syringe: a glass barrel full of glowing green, a
 * plunger at the back, a long needle out the front. Built up +y from the grip.
 */
export function buildSyringe(scene: Scene, name: string): TransformNode {
  const root = new TransformNode(name, scene);
  root.scaling.setAll(0.8);
  const add = adder(root);
  const glass = material(scene, 'syringeGlass', (m) => {
    m.diffuseColor = new Color3(0.8, 0.95, 1);
    m.alpha = 0.35;
    m.specularColor = new Color3(1, 1, 1);
  });
  const juice = solid(scene, 'syringeJuice', '#5dff7a', 0.9);
  const metal = solid(scene, 'syringeMetal', '#c8ccd2', 0.08, 0.9);
  add(cyl(scene, `${name}-plunger`, 7, 0.8, 6), 0, -2, 0, metal);
  add(cyl(scene, `${name}-thumb`, 0.6, 4, 12), 0, -5.5, 0, metal);
  add(cyl(scene, `${name}-flange`, 0.6, 6.5, 12), 0, 1.5, 0, metal);
  add(cyl(scene, `${name}-juice`, 9, 3, 12), 0, 7, 0, juice);
  add(cyl(scene, `${name}-barrel`, 11, 3.8, 12), 0, 7.2, 0, glass);
  for (let k = 0; k < 4; k++) add(box(scene, `${name}-tick${k}`, 3.9, 0.25, 0.3), 0, 4 + k * 2, 1.85, metal);
  add(cyl(scene, `${name}-hub`, 1.5, 2, 8, 1), 0, 13.4, 0, metal);
  add(cyl(scene, `${name}-needle`, 9, 0.35, 4, 0.1), 0, 18.6, 0, metal);
  muzzleAt(scene, name, root, 0, 23, 0);
  return root;
}

/**
 * Sergeant Rampage's arsenal: a machine gun, a bazooka and a grenade, one
 * shown at a time (`show`). Built pointing forward along +y from the grip;
 * the muzzle moves to whichever is out.
 */
export interface Arsenal { root: TransformNode; show(look: NonNullable<Gun['look']>): void }

export function buildArsenal(scene: Scene, name: string): Arsenal {
  const root = new TransformNode(name, scene);
  root.scaling.setAll(0.8);
  const black = solid(scene, 'gunBlack', '#1e2024', 0.02, 0.5);
  const olive = solid(scene, 'launcherOlive', '#4f5a2e', 0.12, 0.25);
  const brass = solid(scene, 'brass', '#d9b43a', 0.2, 0.8);
  const muzzle = muzzleAt(scene, name, root, 0, 0, 0);

  // Machine gun: receiver, a long barrel with a cooling jacket, a drum, an ammo belt.
  const mg = new TransformNode(`${name}-mg`, scene);
  mg.parent = root;
  const a = adder(mg);
  a(box(scene, `${name}-receiver`, 3, 9, 4), 0, 3, 0, black);
  a(cyl(scene, `${name}-jacket`, 10, 2.4, 10), 0, 12, 0.8, black);
  a(cyl(scene, `${name}-barrel`, 4, 1, 8), 0, 19, 0.8, black);
  a(cyl(scene, `${name}-drum`, 2.4, 5, 14), 0, 4, -3, black).rotation.z = Math.PI / 2;
  for (let k = 0; k < 6; k++) a(box(scene, `${name}-round${k}`, 2.4, 0.6, 0.8), 2.2 - k * 0.15, 2 - k * 1.4, -1 - k * 0.6, brass);
  a(box(scene, `${name}-stock`, 2.4, 5, 3), 0, -3.5, -0.6, solid(scene, 'gunWood', '#5a3a1e', 0, 0.1));

  // Bazooka: a fat olive tube with a red-nosed rocket peeking out.
  const bazooka = new TransformNode(`${name}-bazooka`, scene);
  bazooka.parent = root;
  const b = adder(bazooka);
  b(cyl(scene, `${name}-tube`, 26, 5.5, 10), 0, 6, 2, olive);
  b(cyl(scene, `${name}-flare`, 2.5, 7, 10, 6), 0, 20, 2, black);
  b(cyl(scene, `${name}-nose`, 2.5, 0.5, 8, 4), 0, 20.5, 2, solid(scene, 'launcherRocket', '#d8342c', 0.35));
  b(box(scene, `${name}-sight`, 1.2, 3, 3), 0, 4, 5.5, black);
  for (const y of [-2, 14]) b(cyl(scene, `${name}-band${y}`, 1, 6, 10), 0, y, 2, solid(scene, 'launcherStripe', '#ffb21f', 0.45));

  // A grenade, ready to throw.
  const nade = new TransformNode(`${name}-grenade`, scene);
  nade.parent = root;
  const n = adder(nade);
  n(MeshBuilder.CreateSphere(`${name}-pineapple`, { diameterX: 3.6 * UNIT, diameterY: 4.6 * UNIT, diameterZ: 3.6 * UNIT, segments: 6 }, scene), 0, 2.5, 0, olive);
  n(box(scene, `${name}-lever`, 1, 3, 0.6), 0.8, 5, 1.4, black);
  n(MeshBuilder.CreateTorus(`${name}-pin`, { diameter: 1.6 * UNIT, thickness: 0.3 * UNIT, tessellation: 8 }, scene), -1, 5.5, 0, brass);

  const guns = { bullet: mg, rocket: bazooka, grenade: nade, knife: nade };
  const tips = { bullet: 21, rocket: 21, grenade: 3, knife: 3 };
  const show = (look: NonNullable<Gun['look']>) => {
    for (const [k, node] of Object.entries(guns)) node.setEnabled(node === guns[look] && (k === look || k !== 'knife'));
    muzzle.position.set(0, tips[look] * UNIT, look === 'rocket' ? 2 * UNIT : 0.8 * UNIT);
  };
  show('bullet');
  return { root, show };
}

/** A tall puffed-up chef's toque, a little grubby. Built on the head joint (the neck). */
export function buildChefHat(scene: Scene, name: string, size: number): TransformNode {
  const root = new TransformNode(name, scene);
  const add = adder(root);
  const white = solid(scene, 'toque', '#f4f2ea', 0.15, 0.05);
  add(cyl(scene, `${name}-band`, 3, size + 0.6, 16), 0, size + 0.5, 0, white);
  add(cyl(scene, `${name}-tube`, 7, size + 0.2, 16, size + 3), 0, size + 5, 0, white);
  add(MeshBuilder.CreateSphere(`${name}-puff`, { diameterX: (size + 4) * UNIT, diameterY: 5 * UNIT, diameterZ: (size + 4) * UNIT, segments: 10 }, scene), 0, size + 8.6, 0, white);
  add(box(scene, `${name}-stain`, 2, 1.5, 0.3), 1.5, size + 3, (size + 1) / 2 + 0.2, solid(scene, 'bloodWet', '#8a0d0d', 0.2, 0.8));
  return root;
}

/** An olive army helmet with a chin strap and a scuffed band. Built on the head joint. */
export function buildArmyHelmet(scene: Scene, name: string, size: number): TransformNode {
  const root = new TransformNode(name, scene);
  const add = adder(root);
  const olive = solid(scene, 'helmetOlive', '#4d5a2e', 0.05, 0.25);
  const dome = add(MeshBuilder.CreateSphere(`${name}-dome`, { diameter: (size + 2.4) * UNIT, slice: 0.5, segments: 12 }, scene), 0, size * 0.55, 0, olive);
  dome.scaling.y = 0.85;
  add(cyl(scene, `${name}-rim`, 0.6, size + 4, 16), 0, size * 0.55, 0, olive);
  add(cyl(scene, `${name}-band`, 1.2, size + 2.5, 16), 0, size * 0.55 + 1.2, 0, solid(scene, 'helmetBand', '#2a2a1a'));
  for (const side of [-1, 1]) add(box(scene, `${name}-strap${side}`, 0.4, size * 0.6, 0.6), side * (size / 2 + 0.3), size * 0.3, 0, solid(scene, 'helmetBand', '#2a2a1a'));
  return root;
}

/** A surgeon's head mirror: a band round the forehead with a round shining mirror. Built on the head joint. */
export function buildHeadMirror(scene: Scene, name: string, size: number): TransformNode {
  const root = new TransformNode(name, scene);
  const add = adder(root);
  add(cyl(scene, `${name}-band`, 1.2, size + 0.8, 16), 0, size * 0.72, 0, solid(scene, 'mirrorBand', '#2a2a2a'));
  const mirror = add(cyl(scene, `${name}-mirror`, 0.5, 4.5, 16), 0, size * 0.9, size / 2 + 0.7, solid(scene, 'mirrorGlass', '#e8f4ff', 0.7, 1));
  mirror.rotation.x = Math.PI / 2 - 0.4;
  add(cyl(scene, `${name}-hole`, 0.6, 0.9, 8), 0, size * 0.9 + 0.1, size / 2 + 0.75, solid(scene, 'holeDark', '#111111')).rotation.x = Math.PI / 2 - 0.4;
  return root;
}

/** Steel handcuffs: a ring round each wrist and a short chain between them. */
function buildCuffs(scene: Scene, name: string, character: BlockCharacter, hands: number): void {
  const steel = solid(scene, 'cuffSteel', '#b8bec8', 0.1, 0.9);
  for (const role of ['armR', 'armL'] as const) {
    const arm = character.joints[role];
    if (!arm) continue;
    const ring = MeshBuilder.CreateTorus(`${name}-${role}`, { diameter: 5 * UNIT, thickness: 0.8 * UNIT, tessellation: 12 }, scene);
    ring.material = steel;
    ring.parent = arm;
    ring.position.y = (hands + 1.5) * UNIT;
    ring.isPickable = false;
  }
  // The chain hangs from the right wrist across to the left.
  const arm = character.joints.armR;
  if (!arm) return;
  for (let k = 0; k < 3; k++) {
    const link = MeshBuilder.CreateTorus(`${name}-link${k}`, { diameter: 1.4 * UNIT, thickness: 0.4 * UNIT, tessellation: 8 }, scene);
    link.material = steel;
    link.parent = arm;
    link.position.set(-(1.8 + k * 1.2) * UNIT, (hands + 1.5) * UNIT, -0.6 * UNIT);
    link.rotation.z = Math.PI / 2;
    link.rotation.x = k % 2 ? Math.PI / 2 : 0;
    link.isPickable = false;
  }
}

/**
 * War Zone extras for a character: a hat, handcuffs (wrists held together in
 * front), or a ball and chain dragging behind. Returns its per-frame
 * animation, if it has one. `cuffed` says whether this one wears cuffs.
 */
export function armyExtras(scene: Scene, character: BlockCharacter, def: { hat?: string; shackle?: boolean }, name: string, cuffed: boolean): ((time: number, moving: boolean) => void) | undefined {
  const j = character.joints;
  const headDef = MODELS[character.model].parts.find((p) => p.role === 'head');
  const size = headDef?.size[0] ?? 8;
  if (j.head && def.hat === 'chefHat') buildChefHat(scene, `${name}-hat`, size).parent = j.head;
  if (j.head && def.hat === 'armyHelmet') buildArmyHelmet(scene, `${name}-hat`, size).parent = j.head;
  if (j.head && def.hat === 'headMirror') buildHeadMirror(scene, `${name}-hat`, size).parent = j.head;
  if (cuffed && j.armR && j.armL) {
    // Wrists together in front.
    character.rest.armR = [-1.05, 0, -0.42];
    character.rest.armL = [-1.05, 0, 0.42];
    j.armR.rotation.set(...character.rest.armR);
    j.armL.rotation.set(...character.rest.armL);
    const armDef = MODELS[character.model].parts.find((p) => p.role === 'armR')!;
    buildCuffs(scene, `${name}-cuffs`, character, armDef.offset[1] - armDef.size[1] / 2);
  }
  if (!def.shackle || !j.legL) return undefined;
  // An iron ball on the ground behind, chained to the left ankle.
  const iron = solid(scene, 'ballIron', '#2a2c30', 0.03, 0.6);
  const ball = MeshBuilder.CreateSphere(`${name}-ball`, { diameter: 9 * UNIT, segments: 10 }, scene);
  ball.material = iron;
  ball.parent = character.root;
  ball.position.set(-3 * UNIT, 4.5 * UNIT, -16 * UNIT);
  ball.isPickable = false;
  const ankle = MeshBuilder.CreateTorus(`${name}-shackle`, { diameter: 5.5 * UNIT, thickness: 1 * UNIT, tessellation: 12 }, scene);
  ankle.material = iron;
  ankle.parent = j.legL;
  ankle.position.y = -10 * UNIT;
  ankle.isPickable = false;
  const links: Mesh[] = [];
  for (let k = 0; k < 6; k++) {
    const link = MeshBuilder.CreateTorus(`${name}-chain${k}`, { diameter: 2 * UNIT, thickness: 0.5 * UNIT, tessellation: 8 }, scene);
    link.material = iron;
    link.parent = character.root;
    link.isPickable = false;
    links.push(link);
  }
  let roll = 0, last = 0;
  return (time, moving) => {
    const dt = Math.min(0.1, Math.max(0, time - last));
    last = time;
    // The ball scrapes along, rolling, jerking forward with each step.
    if (moving) roll += dt * 3;
    ball.rotation.x = roll;
    const tug = moving ? Math.max(0, Math.sin(time * 7)) * 1.2 : 0;
    ball.position.z = (-16 + tug) * UNIT;
    // The chain sags from the ankle down to the ball.
    const ax = -2 * UNIT, ay = 1.5 * UNIT, az = 0;
    for (const [k, link] of links.entries()) {
      const t = (k + 1) / (links.length + 1);
      link.position.set(ax + (ball.position.x - ax) * t, ay + (ball.position.y - ay) * t - Math.sin(t * Math.PI) * 0.6 * UNIT, az + (ball.position.z - az) * t);
      link.rotation.set(k % 2 ? Math.PI / 2 : 0, 0, Math.PI / 2);
    }
  };
}
