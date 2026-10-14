import {
  Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3,
} from '@babylonjs/core';
import { MODELS } from '../models/models';
import { UNIT, type BlockCharacter } from './blockModel';

// Rock-and-roll gear for the Hellfire Arena's zombies, built in skin units
// like the models: Satan's flaming Flying V and goat horns and the spade on
// his tail, a roadie's road case, and a biker's chopper.

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

/** Black lacquer licked with flames, for the guitar and the bike's tank. */
function flameTexture(scene: Scene): DynamicTexture {
  const existing = scene.getTextureByName('flamePaint') as DynamicTexture | null;
  if (existing) return existing;
  const tex = new DynamicTexture('flamePaint', { width: 128, height: 128 }, scene, true);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  g.fillStyle = '#120808';
  g.fillRect(0, 0, 128, 128);
  // Tongues of flame licking up from the bottom: red, then orange, then yellow.
  for (const [color, scale] of [['#c4160c', 1], ['#ff6a10', 0.72], ['#ffd23a', 0.42]] as const) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, 128);
    for (let x = 0; x <= 128; x += 16) {
      const h = (60 + 40 * Math.sin(x * 0.11 + scale * 3)) * scale;
      g.quadraticCurveTo(x + 4, 128 - h * 0.4, x + 8, 128 - h);
      g.quadraticCurveTo(x + 10, 128 - h * 0.5, x + 16, 128 - h * 0.15);
    }
    g.lineTo(128, 128);
    g.closePath();
    g.fill();
  }
  tex.update();
  return tex;
}

/**
 * Satan's guitar: a Flying V painted with flames, a long neck and a horned
 * headstock. Built lying in the x–y plane with its neck up +y and its face
 * toward +z. The end of the headstock is a child named `<name>-muzzle`,
 * where flames and lightning come out.
 */
export function buildGuitar(scene: Scene, name: string): TransformNode {
  const root = new TransformNode(name, scene);
  const add = adder(root);
  const paint = material(scene, 'guitarPaint', (m) => {
    m.diffuseTexture = flameTexture(scene);
    m.emissiveColor = new Color3(0.35, 0.15, 0.08);
    m.specularColor = new Color3(0.6, 0.6, 0.6);
    m.specularPower = 64;
  });
  const wood = solid(scene, 'guitarNeck', '#3a1f12', 0.05);
  const chrome = solid(scene, 'guitarChrome', '#d9dde3', 0.25, 0.9);
  const black = solid(scene, 'guitarBlack', '#121214', 0, 0.4);
  const neon = material(scene, 'guitarStrings', (m) => {
    m.emissiveColor = new Color3(1, 0.85, 0.5);
    m.disableLighting = true;
  });

  // The V: two wings joined at the top, splaying out downward.
  for (const side of [-1, 1]) {
    const wing = add(box(scene, `${name}-wing${side}`, 4.5, 15, 1.6), side * 2.6, -6.2, 0, paint);
    wing.rotation.z = side * 0.42;
  }
  add(box(scene, `${name}-joint`, 4.2, 3, 1.6), 0, -0.8, 0, paint);
  // Pickups, a bridge and a pair of knobs.
  for (const y of [-3.5, -6.5]) add(box(scene, `${name}-pickup${y}`, 3, 1, 0.6), 0, y, 0.9, black);
  add(box(scene, `${name}-bridge`, 2.6, 0.6, 0.5), 0, -8.5, 0.9, chrome);
  for (const x of [-3, 3]) {
    const knob = add(MeshBuilder.CreateCylinder(`${name}-knob${x}`, { height: 0.6 * UNIT, diameter: 1 * UNIT, tessellation: 8 }, scene), x, -11, 0.9, chrome);
    knob.rotation.x = Math.PI / 2;
  }
  // The neck, glowing strings down it, and the frets.
  add(box(scene, `${name}-neck`, 1.6, 17, 1), 0, 8, 0.2, wood);
  add(box(scene, `${name}-strings`, 0.9, 25, 0.15), 0, 4.5, 0.85, neon);
  for (let y = 1; y < 16; y += 2.2) add(box(scene, `${name}-fret${y}`, 1.7, 0.2, 0.2), 0, y, 0.75, chrome);
  // A headstock with devil horns either side, and tuning pegs.
  add(box(scene, `${name}-head`, 3, 4.5, 1), 0, 18.6, 0.2, black);
  for (const side of [-1, 1]) {
    const horn = add(MeshBuilder.CreateCylinder(`${name}-horn${side}`, { height: 3.5 * UNIT, diameterTop: 0, diameterBottom: 1.2 * UNIT, tessellation: 6 }, scene), side * 1.8, 21.2, 0.2, paint);
    horn.rotation.z = -side * 0.5;
    for (const y of [17.2, 18.8, 20.4]) add(box(scene, `${name}-peg${side}${y}`, 1, 0.5, 0.5), side * 1.9, y, 0.2, chrome);
  }
  const muzzle = new TransformNode(`${name}-muzzle`, scene);
  muzzle.parent = root;
  muzzle.position.y = 22 * UNIT;
  return root;
}

/** Stenciled lettering on black, for road cases. */
function roadCaseTexture(scene: Scene): DynamicTexture {
  const existing = scene.getTextureByName('roadCase') as DynamicTexture | null;
  if (existing) return existing;
  const tex = new DynamicTexture('roadCase', { width: 128, height: 128 }, scene, true);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  g.fillStyle = '#17171b';
  g.fillRect(0, 0, 128, 128);
  // Scuffs and a ribbed finish.
  for (let y = 0; y < 128; y += 4) {
    g.fillStyle = y % 8 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.25)';
    g.fillRect(0, y, 128, 2);
  }
  g.fillStyle = '#e9e9e2';
  g.font = 'bold 22px Impact, Arial Black, sans-serif';
  g.textAlign = 'center';
  g.fillText('HELLFIRE', 64, 46);
  g.fillText('TOUR', 64, 72);
  g.fillStyle = '#ff3b2f';
  g.font = 'bold 13px Arial, sans-serif';
  g.fillText('⚠ FRAGILE ⚠', 64, 100);
  tex.update();
  return tex;
}

/**
 * A road case carried in front like a shield: a black flight case with
 * aluminum edges, steel corner caps and a stenciled tour name. Centered on
 * its origin, front face toward +z.
 */
export function buildRoadCase(scene: Scene, name: string): TransformNode {
  const root = new TransformNode(name, scene);
  const add = adder(root);
  const shell = material(scene, 'roadCaseShell', (m) => {
    m.diffuseTexture = roadCaseTexture(scene);
    m.emissiveColor = new Color3(0.12, 0.12, 0.12);
  });
  const metal = solid(scene, 'roadCaseMetal', '#b9bec6', 0.2, 0.8);
  const W = 13, H = 10, D = 6;
  add(box(scene, `${name}-shell`, W, H, D), 0, 0, 0, shell);
  // Aluminum edges all round, and caps on the corners.
  for (const y of [-H / 2, H / 2]) for (const z of [-D / 2, D / 2]) add(box(scene, `${name}-ex${y}${z}`, W + 0.4, 0.5, 0.5), 0, y, z, metal);
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) add(box(scene, `${name}-ey${x}${z}`, 0.5, H + 0.4, 0.5), x, 0, z, metal);
  for (const x of [-W / 2, W / 2]) for (const y of [-H / 2, H / 2]) {
    add(box(scene, `${name}-ez${x}${y}`, 0.5, 0.5, D + 0.4), x, y, 0, metal);
    add(box(scene, `${name}-cap${x}${y}`, 1.4, 1.4, 1.4), x, y, D / 2, metal);
  }
  // Latches on the front.
  for (const x of [-3.5, 3.5]) add(box(scene, `${name}-latch${x}`, 1.6, 1.2, 0.4), x, H / 2 - 1.3, D / 2 + 0.2, metal);
  return root;
}

/** A chopper: what a Biker Zombie rides. `spin` turns its wheels. */
export interface Motorcycle {
  root: TransformNode;
  /** Turn the wheels (radians). */
  spin(angle: number): void;
}

/**
 * A long, low chopper with a raked fork and ape-hanger bars, a flame-painted
 * tank, chrome pipes, and a headlight. Built in skin units under a rider
 * whose hips are 12 up, facing +z.
 */
export function buildMotorcycle(scene: Scene, name: string): Motorcycle {
  const root = new TransformNode(name, scene);
  const add = adder(root);
  const chrome = solid(scene, 'bikeChrome', '#dfe3ea', 0.25, 1);
  const black = solid(scene, 'bikeBlack', '#16161a', 0.02, 0.5);
  const rubber = solid(scene, 'bikeRubber', '#0b0b0c', 0, 0.05);
  const paint = material(scene, 'bikePaint', (m) => {
    m.diffuseTexture = flameTexture(scene);
    m.emissiveColor = new Color3(0.3, 0.12, 0.06);
    m.specularColor = new Color3(0.8, 0.8, 0.8);
    m.specularPower = 64;
  });
  const lamp = material(scene, 'bikeLamp', (m) => {
    m.emissiveColor = new Color3(1, 0.95, 0.7);
    m.disableLighting = true;
  });
  const tail = material(scene, 'bikeTail', (m) => {
    m.emissiveColor = new Color3(1, 0.1, 0.05);
    m.disableLighting = true;
  });

  const wheels: TransformNode[] = [];
  const wheel = (z: number, r: number, fat: number) => {
    const hub = new TransformNode(`${name}-wheel${z}`, scene);
    hub.parent = root;
    hub.position.set(0, r * UNIT, z * UNIT);
    const tire = MeshBuilder.CreateTorus(`${name}-tire${z}`, { diameter: (r * 2 - fat) * UNIT, thickness: fat * UNIT, tessellation: 20 }, scene);
    tire.rotation.z = Math.PI / 2;
    tire.parent = hub;
    tire.material = rubber;
    tire.isPickable = false;
    // Spokes, so you can see it turning.
    for (let k = 0; k < 3; k++) {
      const spoke = MeshBuilder.CreateBox(`${name}-spoke${z}${k}`, { width: 0.3 * UNIT, height: (r * 2 - fat) * UNIT, depth: 0.5 * UNIT }, scene);
      spoke.rotation.x = (k * Math.PI) / 3;
      spoke.parent = hub;
      spoke.material = chrome;
      spoke.isPickable = false;
    }
    wheels.push(hub);
  };
  wheel(-12, 5, 2.6);
  wheel(15, 4.5, 1.6);

  // Frame and seat, tank, engine.
  const spine = add(box(scene, `${name}-spine`, 1.2, 1.2, 24), 0, 9, 1, black);
  spine.rotation.x = -0.12;
  add(box(scene, `${name}-seat`, 5, 1.6, 8), 0, 11, -2, black);
  add(box(scene, `${name}-fender`, 4, 1, 9), 0, 10.2, -12, paint).rotation.x = 0.25;
  const tank = add(MeshBuilder.CreateSphere(`${name}-tank`, { diameterX: 5 * UNIT, diameterY: 4 * UNIT, diameterZ: 8 * UNIT, segments: 10 }, scene), 0, 13, 5, paint);
  tank.rotation.x = -0.15;
  for (const side of [-1, 1]) {
    const cyl = add(MeshBuilder.CreateCylinder(`${name}-cyl${side}`, { height: 5 * UNIT, diameter: 2.6 * UNIT, tessellation: 10 }, scene), 0, 7.5, 1 + side * 2, chrome);
    cyl.rotation.x = side * 0.5;
    // Long straight pipes out the back.
    const pipe = add(MeshBuilder.CreateCylinder(`${name}-pipe${side}`, { height: 18 * UNIT, diameter: 1.2 * UNIT, tessellation: 8 }, scene), side * 3, 5.5, -6, chrome);
    pipe.rotation.x = Math.PI / 2 - 0.08;
    // Footpegs out front, and the raked fork.
    add(box(scene, `${name}-peg${side}`, 2.2, 0.6, 1.2), side * 3.5, 8.8, 11.5, chrome);
    const fork = add(MeshBuilder.CreateCylinder(`${name}-fork${side}`, { height: 15 * UNIT, diameter: 0.9 * UNIT, tessellation: 8 }, scene), side * 1.4, 10.5, 12, chrome);
    fork.rotation.x = 0.5;
    // Ape hangers: up, then out to the grips.
    const riser = add(MeshBuilder.CreateCylinder(`${name}-riser${side}`, { height: 5 * UNIT, diameter: 0.7 * UNIT, tessellation: 6 }, scene), side * 3, 17, 9.5, chrome);
    riser.rotation.z = -side * 0.5;
    add(box(scene, `${name}-grip${side}`, 2.5, 1, 1), side * 6, 19, 10, black);
  }
  add(box(scene, `${name}-bar`, 6, 0.7, 0.7), 0, 15.3, 9.5, chrome);
  add(MeshBuilder.CreateSphere(`${name}-lamp`, { diameter: 2.6 * UNIT, segments: 8 }, scene), 0, 14.5, 12.5, lamp);
  add(box(scene, `${name}-tail`, 1.6, 0.8, 0.5), 0, 11.5, -16.5, tail);

  return {
    root,
    spin(angle) {
      for (const w of wheels) w.rotation.x = angle;
    },
  };
}

/**
 * Goat horns: thick at the root on top of the head, sweeping up and back,
 * then out and curling down past the ears, pale bone ringed with dark
 * ridges. Built in skin
 * units round the head joint; `size` is the head's width.
 */
export function buildGoatHorns(scene: Scene, name: string, size = 8): TransformNode {
  const root = new TransformNode(name, scene);
  const mat = material(scene, 'goatHorn', (m) => {
    m.diffuseColor = new Color3(0.82, 0.75, 0.6);
    m.emissiveColor = new Color3(0.22, 0.18, 0.12);
    m.specularColor = new Color3(0.5, 0.45, 0.4);
    m.specularPower = 32;
  });
  const tipMat = material(scene, 'goatHornTip', (m) => {
    m.diffuseColor = new Color3(0.35, 0.28, 0.22);
    m.emissiveColor = new Color3(0.06, 0.04, 0.02);
  });
  const half = size / 2;
  for (const side of [-1, 1]) {
    // Up, back, out, and round down: a curl.
    const path: Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const a = t * Math.PI * 1.25;
      path.push(new Vector3(
        side * (half - 1 + t * 4.5) * UNIT,
        (size - 0.5 + Math.sin(a) * 4.5) * UNIT,
        (0.5 - (1 - Math.cos(a)) * 3.2) * UNIT,
      ));
    }
    const horn = MeshBuilder.CreateTube(`${name}-horn${side}`, {
      path, tessellation: 8, cap: Mesh.CAP_ALL,
      radiusFunction: (i) => (1.5 - (i / 16) * 1.3) * UNIT,
    }, scene);
    horn.parent = root;
    horn.material = mat;
    horn.isPickable = false;
    // Pale ridges round it.
    for (let i = 2; i < 14; i += 3) {
      const ring = MeshBuilder.CreateTorus(`${name}-ridge${side}${i}`, { diameter: (3 - (i / 16) * 2.6) * UNIT, thickness: 0.35 * UNIT, tessellation: 10 }, scene);
      ring.parent = root;
      ring.position.copyFrom(path[i]);
      const dir = path[i + 1].subtract(path[i - 1]).normalize();
      ring.rotationQuaternion = null;
      ring.lookAt(path[i].add(dir));
      ring.rotation.x += Math.PI / 2;
      ring.material = tipMat;
      ring.isPickable = false;
    }
  }
  return root;
}

/** The spade on the end of the devil's tail: a flat arrowhead. Points down -y from the tip. */
export function buildTailSpade(scene: Scene, name: string): TransformNode {
  const root = new TransformNode(name, scene);
  const add = adder(root);
  const mat = solid(scene, 'tailSpade', '#a0100a', 0.35, 0.4);
  const blade = add(box(scene, `${name}-blade`, 3.4, 3.4, 0.5), 0, -2.6, 0, mat);
  blade.rotation.z = Math.PI / 4;
  // Two barbs flaring back up either side, like the classic spade.
  for (const side of [-1, 1]) {
    const barb = add(box(scene, `${name}-barb${side}`, 1, 2.6, 0.5), side * 1.9, -0.6, 0, mat);
    barb.rotation.z = side * 0.7;
  }
  return root;
}

/**
 * Horns, a swishing spade-tipped tail, or a chopper underneath. Returns the
 * per-frame animation for them, if there's anything to animate.
 */
export function rockExtras(scene: Scene, character: BlockCharacter, def: { model?: string; hat?: string; mount?: string }, name: string): ((time: number, moving: boolean) => void) | undefined {
  const j = character.joints;
  if (def.hat === 'goatHorns' && j.head) {
    const headDef = MODELS[character.model].parts.find((p) => p.role === 'head');
    buildGoatHorns(scene, `${name}-horns`, headDef?.size[0]).parent = j.head;
  }
  const updates: ((time: number, moving: boolean) => void)[] = [];
  if (j.tailTip) {
    const tipDef = MODELS[character.model].parts.find((p) => p.role === 'tailTip')!;
    const spade = buildTailSpade(scene, `${name}-spade`);
    spade.parent = j.tailTip;
    spade.position.y = (tipDef.offset[1] - tipDef.size[1] / 2) * UNIT;
    const tail = j.tail!, tip = j.tailTip;
    const rest = character.rest;
    const seed = name.length * 1.7;
    updates.push((time) => {
      // Lazy swishing side to side, the tip flicking after it.
      tail.rotation.z = (rest.tail?.[2] ?? 0) + Math.sin(time * 1.9 + seed) * 0.35;
      tail.rotation.x = (rest.tail?.[0] ?? 0) + Math.sin(time * 1.3 + seed) * 0.12;
      tip.rotation.z = (rest.tailTip?.[2] ?? 0) + Math.sin(time * 1.9 + seed - 0.9) * 0.55;
      tip.rotation.x = (rest.tailTip?.[0] ?? 0) + Math.sin(time * 2.6 + seed) * 0.2;
    });
  }
  if (def.mount === 'motorcycle') {
    const bike = buildMotorcycle(scene, `${name}-bike`);
    bike.root.parent = character.root;
    let angle = 0, last = 0;
    updates.push((time, moving) => {
      const dt = Math.min(0.1, Math.max(0, time - last));
      last = time;
      if (moving) angle += dt * 14;
      bike.spin(angle);
    });
  }
  if (!updates.length) return undefined;
  return (time, moving) => { for (const u of updates) u(time, moving); };
}
