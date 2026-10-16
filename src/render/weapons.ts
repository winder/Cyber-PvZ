import {
  Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3, VertexData,
} from '@babylonjs/core';
import { MODELS } from '../models/models';
import { UNIT, type BlockCharacter } from './blockModel';
import { buildGuitar, buildRoadCase } from './rock';

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

/**
 * A watering can in place of a hand: a dented tin can bolted on at the wrist,
 * brim-full of glowing purple goo, with a long spout and a rose at the end.
 * Built pointing down -y from the wrist, like the launcher; the spout sticks
 * out forward (+z, which is down when the arm is held out). The end of the
 * spout is a child named `<name>-muzzle`, where the goo comes out.
 */
export function buildWateringCan(scene: Scene, name: string): TransformNode {
  const root = new TransformNode(name, scene);
  const mat = (key: string, hex: string, glow = 0) => material(scene, key, () => {
    const m = new StandardMaterial(key, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.emissiveColor = Color3.FromHexString(hex).scale(glow);
    m.specularColor = new Color3(0.35, 0.35, 0.35);
    return m;
  });
  const add = (mesh: Mesh, x: number, y: number, z: number, m: StandardMaterial) => {
    mesh.parent = root;
    mesh.position.set(x * UNIT, y * UNIT, z * UNIT);
    mesh.material = m;
    mesh.isPickable = false;
    return mesh;
  };
  const tin = mat('canTin', '#7f8f8a', 0.12);
  const rust = mat('canRust', '#8a4b2a', 0.1);
  const goo = mat('canGoo', '#b14dff', 0.9);

  // The can: a fat drum hanging below the wrist, with rusty bands.
  const top = 2, bottom = -8;
  add(MeshBuilder.CreateCylinder(`${name}-drum`, { height: (top - bottom) * UNIT, diameterTop: 7 * UNIT, diameterBottom: 8 * UNIT, tessellation: 10 }, scene), 0, (top + bottom) / 2, 0, tin);
  for (const y of [top - 0.5, bottom + 0.8]) {
    add(MeshBuilder.CreateCylinder(`${name}-band${y}`, { height: 1 * UNIT, diameter: 8.4 * UNIT, tessellation: 10 }, scene), 0, y, 0, rust);
  }
  // Goo slopping about in the open side of the can (it's carried on its side).
  add(MeshBuilder.CreateCylinder(`${name}-goo`, { height: 0.6 * UNIT, diameter: 6.4 * UNIT, tessellation: 10 }, scene), 0, top + 0.2, 0, goo);
  // The carrying handle, arching over the back.
  const handle = add(MeshBuilder.CreateTorus(`${name}-handle`, { diameter: 6 * UNIT, thickness: 0.9 * UNIT, tessellation: 12 }, scene), 0, -3, -4, rust);
  handle.rotation.z = Math.PI / 2;
  // The spout: a long pipe out of the bottom of the can, tilting forward and
  // down, ending in a rose with glowing holes.
  const spoutLen = 10;
  const lean = 0.9;
  const spout = add(MeshBuilder.CreateCylinder(`${name}-spout`, { height: spoutLen * UNIT, diameterTop: 2.4 * UNIT, diameterBottom: 1.6 * UNIT, tessellation: 8 }, scene), 0, bottom + 1 - (Math.cos(lean) * spoutLen) / 2, 3 + (Math.sin(lean) * spoutLen) / 2, tin);
  spout.rotation.x = -lean;
  const tipY = bottom + 1 - Math.cos(lean) * spoutLen, tipZ = 3 + Math.sin(lean) * spoutLen;
  const rose = add(MeshBuilder.CreateCylinder(`${name}-rose`, { height: 1.6 * UNIT, diameterTop: 2 * UNIT, diameterBottom: 4.4 * UNIT, tessellation: 10 }, scene), 0, tipY - 0.4, tipZ + 0.5, rust);
  rose.rotation.x = -lean;
  const drip = add(MeshBuilder.CreateSphere(`${name}-drip`, { diameter: 3 * UNIT, segments: 6 }, scene), 0, tipY - 1.2, tipZ + 1.4, goo);
  drip.scaling.y = 0.5;
  const muzzle = new TransformNode(`${name}-muzzle`, scene);
  muzzle.parent = root;
  muzzle.position.set(0, (tipY - 1.5) * UNIT, (tipZ + 1.6) * UNIT);
  return root;
}

/**
 * A riot shield shaped like a knight's: a flat top, straight sides and a
 * point at the bottom. See-through glowing blue, with a bright rim and a
 * cross, and curved back at the edges like a real riot shield. Centered on
 * its origin, front toward +z, with grips behind for the hands.
 */
export function buildRiotShield(scene: Scene, name: string): TransformNode {
  const root = new TransformNode(name, scene);
  const panelMat = material(scene, 'riotShieldPanel', () => {
    const m = new StandardMaterial('riotShieldPanel', scene);
    m.diffuseColor = new Color3(0.3, 0.6, 1);
    m.emissiveColor = new Color3(0.1, 0.35, 0.85);
    m.specularColor = new Color3(1, 1, 1);
    m.specularPower = 64;
    m.alpha = 0.3;
    m.backFaceCulling = false;
    return m;
  });
  const rimMat = material(scene, 'riotShieldRim', () => {
    const m = new StandardMaterial('riotShieldRim', scene);
    m.emissiveColor = new Color3(0.35, 0.8, 1);
    m.disableLighting = true;
    return m;
  });
  const gripMat = material(scene, 'riotShieldGrip', () => {
    const m = new StandardMaterial('riotShieldGrip', scene);
    m.diffuseColor = new Color3(0.12, 0.14, 0.2);
    m.specularColor = new Color3(0.3, 0.3, 0.35);
    return m;
  });
  const glow = scene.getGlowLayerByName('glow');

  const W = 6.5, top = 8.5, shoulder = 1, bottom = -8.5;
  // Curved back at the edges, like a riot shield.
  const bend = (x: number, y: number) => new Vector3(x * UNIT, y * UNIT, -0.04 * x * x * UNIT);
  // The outline, clockwise from the top-left corner.
  const outline: Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const x = -W + (2 * W * i) / 12;
    outline.push(bend(x, top - 0.5 * (x / W) ** 2)); // the top bows up a touch
  }
  for (let i = 1; i <= 4; i++) outline.push(bend(W, top - 0.5 - ((top - 0.5 - shoulder) * i) / 4));
  // Down to the point: a curve from the shoulder, pulled out toward the corner.
  const curve = (side: number, a: number) => {
    const cy = bottom + 3;
    const x = (1 - a) ** 2 * W + 2 * (1 - a) * a * W;
    const y = (1 - a) ** 2 * shoulder + 2 * (1 - a) * a * cy + a * a * bottom;
    return bend(side * x, y);
  };
  for (let i = 1; i <= 10; i++) outline.push(curve(1, i / 10));
  for (let i = 9; i >= 0; i--) outline.push(curve(-1, i / 10));
  for (let i = 1; i < 4; i++) outline.push(bend(-W, shoulder + ((top - 0.5 - shoulder) * i) / 4));

  // The see-through panel: a fan from the middle (the shape is convex).
  const positions = [0, 0, 0];
  for (const p of outline) positions.push(p.x, p.y, p.z);
  const indices: number[] = [];
  for (let i = 0; i < outline.length; i++) indices.push(0, 1 + i, 1 + ((i + 1) % outline.length));
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const panel = new Mesh(`${name}-panel`, scene);
  Object.assign(new VertexData(), { positions, indices, normals }).applyToMesh(panel);
  panel.material = panelMat;
  panel.parent = root;
  panel.isPickable = false;
  glow?.addExcludedMesh(panel); // only the rim and cross bloom

  const tube = (n: string, path: Vector3[], r: number) => {
    const t = MeshBuilder.CreateTube(`${name}-${n}`, { path, radius: r * UNIT, tessellation: 6, cap: Mesh.CAP_ALL }, scene);
    t.material = rimMat;
    t.parent = root;
    t.isPickable = false;
    return t;
  };
  tube('rim', [...outline, outline[0], outline[1]], 0.45);
  // A thinner inner trim, and a cross.
  const inner = outline.map((p) => bend((p.x / UNIT) * 0.78, (p.y / UNIT) * 0.8 + 0.4).addInPlaceFromFloats(0, 0, 0.1 * UNIT));
  tube('trim', [...inner, inner[0], inner[1]], 0.18);
  tube('crossV', [bend(0, 5), bend(0, -4.5)].map((p) => p.addInPlaceFromFloats(0, 0, 0.1 * UNIT)), 0.3);
  const across: Vector3[] = [];
  for (let i = 0; i <= 8; i++) across.push(bend(-3.2 + 0.8 * i, 2.2).addInPlaceFromFloats(0, 0, 0.1 * UNIT));
  tube('crossH', across, 0.3);

  // Grips behind, where the hands hold it.
  for (const x of [-5.5, 5.5]) {
    const grip = MeshBuilder.CreateBox(`${name}-grip${x}`, { width: 1.2 * UNIT, height: 2.5 * UNIT, depth: 1.6 * UNIT }, scene);
    grip.position = bend(x, 5).addInPlaceFromFloats(0, 0, -0.9 * UNIT);
    grip.material = gripMat;
    grip.parent = root;
    grip.isPickable = false;
  }
  return root;
}

type WeaponKind = 'scythe' | 'rocketLauncher' | 'wateringCan' | 'guitar' | 'roadCase' | 'riotShield';

const WEAPONS: Record<WeaponKind, (scene: Scene, name: string) => TransformNode> = {
  scythe: buildScythe,
  rocketLauncher: buildRocketLauncher,
  wateringCan: buildWateringCan,
  guitar: buildGuitar,
  roadCase: buildRoadCase,
  riotShield: buildRiotShield,
};

/**
 * Put a weapon in the character's right hand (or, for a launcher or watering
 * can, in place of it). Two-handed things (a guitar slung across the gut, a
 * road case or riot shield held out in front) hang off the body instead.
 */
export function attachWeapon(scene: Scene, character: BlockCharacter, kind: WeaponKind, name: string): TransformNode | null {
  if (kind === 'guitar' || kind === 'roadCase' || kind === 'riotShield') {
    const body = character.joints.body;
    if (!body) return null;
    const weapon = WEAPONS[kind](scene, name);
    weapon.parent = body;
    if (kind === 'guitar') {
      // Slung low across the gut, the neck angled up to the left hand.
      weapon.position.set(0.5 * UNIT, -7.5 * UNIT, 8 * UNIT);
      weapon.rotation.set(-0.1, 0, 0.95);
    } else if (kind === 'riotShield') {
      // Just past the hands, top at the shoulders.
      weapon.position.set(0, -7 * UNIT, 12.5 * UNIT);
    } else {
      weapon.position.set(0, -3.5 * UNIT, 8.5 * UNIT);
    }
    return weapon;
  }
  const arm = character.joints.armR;
  const armDef = MODELS[character.model].parts.find((p) => p.role === 'armR');
  if (!arm || !armDef) return null;
  const weapon = WEAPONS[kind](scene, name);
  weapon.parent = arm;
  if (kind === 'rocketLauncher' || kind === 'wateringCan') {
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

/**
 * The Necro-Gardener's helmet: a little glass greenhouse worn over the head,
 * iron-framed with a pitched roof, one pane cracked and another missing.
 * Built in skin units round the origin at the neck (the head joint); `size`
 * is the head's width.
 */
export function buildGlassHelmet(scene: Scene, name: string, size = 8): TransformNode {
  const root = new TransformNode(name, scene);
  const frameMat = material(scene, 'helmetFrame', () => {
    const m = new StandardMaterial('helmetFrame', scene);
    m.diffuseColor = new Color3(0.16, 0.2, 0.18);
    m.emissiveColor = new Color3(0.05, 0.09, 0.07);
    return m;
  });
  const glassMat = material(scene, 'helmetGlass', () => {
    const m = new StandardMaterial('helmetGlass', scene);
    m.diffuseColor = new Color3(0.6, 1, 0.85);
    m.emissiveColor = new Color3(0.12, 0.3, 0.24);
    m.specularColor = new Color3(1, 1, 1);
    m.specularPower = 48;
    m.alpha = 0.22;
    m.backFaceCulling = false;
    return m;
  });
  const crackMat = material(scene, 'helmetCrack', () => {
    const m = new StandardMaterial('helmetCrack', scene);
    m.emissiveColor = new Color3(0.85, 1, 0.95);
    m.disableLighting = true;
    return m;
  });
  const add = (mesh: Mesh, x: number, y: number, z: number, m: StandardMaterial) => {
    mesh.parent = root;
    mesh.position.set(x * UNIT, y * UNIT, z * UNIT);
    mesh.material = m;
    mesh.isPickable = false;
    return mesh;
  };
  const half = size / 2 + 1.6, wall = size + 1.5, bar = 0.5;
  // Glass walls (the front-left pane is missing: smashed out).
  const pane = (n: string, w: number, h: number) => MeshBuilder.CreatePlane(`${name}-${n}`, { width: w * UNIT, height: h * UNIT }, scene);
  add(pane('back', half * 2, wall), 0, wall / 2, -half, glassMat);
  add(pane('frontR', half, wall), half / 2, wall / 2, half, glassMat);
  for (const side of [-1, 1]) {
    const p = add(pane(`side${side}`, half * 2, wall), side * half, wall / 2, 0, glassMat);
    p.rotation.y = Math.PI / 2;
  }
  // A pitched glass roof.
  const rise = half * 0.75, slope = Math.hypot(half, rise);
  for (const side of [-1, 1]) {
    const p = MeshBuilder.CreateBox(`${name}-roof${side}`, { width: slope * UNIT, height: 0.05 * UNIT, depth: half * 2 * UNIT }, scene);
    add(p, (side * half) / 2, wall + rise / 2, 0, glassMat).rotation.z = -side * Math.atan2(rise, half);
  }
  // Iron frame: corner posts, top and bottom rails, the ridge.
  const box = (n: string, w: number, h: number, d: number) => MeshBuilder.CreateBox(`${name}-${n}`, { width: w * UNIT, height: h * UNIT, depth: d * UNIT }, scene);
  for (const x of [-half, half]) for (const z of [-half, half]) add(box(`post${x}${z}`, bar, wall, bar), x, wall / 2, z, frameMat);
  for (const y of [0, wall]) {
    for (const z of [-half, half]) add(box(`railX${y}${z}`, half * 2 + bar, bar, bar), 0, y, z, frameMat);
    for (const x of [-half, half]) add(box(`railZ${y}${x}`, bar, bar, half * 2 + bar), x, y, 0, frameMat);
  }
  add(box('ridge', bar, bar, half * 2 + bar), 0, wall + rise, 0, frameMat);
  for (const z of [-half, half]) for (const side of [-1, 1]) {
    const r = add(box(`rafter${z}${side}`, slope, bar, bar), (side * half) / 2, wall + rise / 2, z, frameMat);
    r.rotation.z = -side * Math.atan2(rise, half);
  }
  add(box('mullion', bar, wall, bar), 0, wall / 2, half, frameMat);
  // The crack: a jagged bright line across the front pane, and a few shards
  // still hanging in the empty one.
  const crack = [[0.6, 0.85], [0.45, 0.62], [0.7, 0.5], [0.4, 0.3], [0.55, 0.12]];
  for (let i = 0; i < crack.length - 1; i++) {
    const [ax, ay] = crack[i], [bx, by] = crack[i + 1];
    const len = Math.hypot((bx - ax) * half, (by - ay) * wall);
    const seg = add(box(`crack${i}`, len, 0.25, 0.1), ((ax + bx) / 2) * half, ((ay + by) / 2) * wall, half + 0.05, crackMat);
    seg.rotation.z = Math.atan2((by - ay) * wall, (bx - ax) * half);
  }
  for (const [x, y, w, h, tilt] of [[-0.85, 0.12, 0.25, 0.3, 0.3], [-0.2, 0.9, 0.3, 0.22, -0.4], [-0.75, 0.8, 0.2, 0.25, 0.8]]) {
    const shard = add(pane(`shard${x}`, w * half, h * wall), x * half, y * wall, half, glassMat);
    shard.rotation.z = tilt;
  }
  return root;
}
