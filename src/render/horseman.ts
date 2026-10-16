import {
  Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode,
} from '@babylonjs/core';
import { HORSE_SADDLE } from '../models/models';
import { UNIT, type BlockCharacter } from './blockModel';

// The Headless Horseman's gear, built in skin units like the models: his
// sword, the zombie horse he rides, his long black cape, and the
// jack-o'-lantern head that floats beside him in green fire. Looks only
// (ADR 0002): the rules just see a boss that now and then stops to raise the
// dead, and the horse rears up while he does.

function material(scene: Scene, name: string, make: (m: StandardMaterial) => void): StandardMaterial {
  const existing = scene.getMaterialByName(name) as StandardMaterial | null;
  if (existing) return existing;
  const m = new StandardMaterial(name, scene);
  m.specularColor = new Color3(0.15, 0.15, 0.15);
  make(m);
  return m;
}

const solid = (scene: Scene, name: string, hex: string, glow = 0, spec = 0.15) => material(scene, name, (m) => {
  m.diffuseColor = Color3.FromHexString(hex);
  m.emissiveColor = Color3.FromHexString(hex).scale(glow);
  m.specularColor = new Color3(spec, spec, spec);
});

/** Ghostly green fire, lit from within. */
const ghostFire = (scene: Scene, name: string, hex: string, alpha: number) => material(scene, name, (m) => {
  m.emissiveColor = Color3.FromHexString(hex);
  m.diffuseColor = Color3.Black();
  m.disableLighting = true;
  m.alpha = alpha;
});

/** Adds meshes to a parent in skin units. */
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

/** A joint to hang parts off, in skin units. */
function joint(scene: Scene, name: string, parent: TransformNode, x: number, y: number, z: number): TransformNode {
  const j = new TransformNode(name, scene);
  j.parent = parent;
  j.position.set(x * UNIT, y * UNIT, z * UNIT);
  return j;
}

const smooth = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

/** The green of the Horseman's fire, and of the dead he raises. */
export const HORSEMAN_GREEN = '#5dff7a';

// ----------------------------------------------------------------------------
//  The sword
// ----------------------------------------------------------------------------

/**
 * A long silver knight's sword with a green rune glowing down the blade.
 * Built upright with the grip at the origin, the blade up +y. The tip is a
 * child named `<name>-muzzle`, where the spell to raise the dead comes out.
 */
export function buildSword(scene: Scene, name: string): TransformNode {
  const root = new TransformNode(name, scene);
  const add = adder(root);
  const steel = solid(scene, 'swordSteel', '#d6dbe3', 0.12, 1);
  const iron = solid(scene, 'swordIron', '#3a3d45', 0.03, 0.6);
  const grip = solid(scene, 'swordGrip', '#1c1214', 0, 0.1);
  const rune = ghostFire(scene, 'swordRune', HORSEMAN_GREEN, 1);

  add(box(scene, `${name}-grip`, 1.1, 4.5, 1.1), 0, 0, 0, grip);
  add(box(scene, `${name}-pommel`, 1.8, 1.6, 1.8), 0, -2.8, 0, iron);
  add(box(scene, `${name}-guard`, 8, 1.1, 1.6), 0, 2.7, 0, iron);
  for (const side of [-1, 1]) add(box(scene, `${name}-quillon${side}`, 1.2, 1.8, 1.8), side * 4.2, 3, 0, iron);
  add(box(scene, `${name}-blade`, 2, 24, 0.5), 0, 15.3, 0, steel);
  // The point: a square turned on its corner, squashed thin.
  const point = add(box(scene, `${name}-point`, 1.42, 1.42, 0.5), 0, 27.3, 0, steel);
  point.rotation.z = Math.PI / 4;
  for (const side of [-1, 1]) add(box(scene, `${name}-rune${side}`, 0.4, 19, 0.1), 0, 14, side * 0.3, rune);
  const muzzle = new TransformNode(`${name}-muzzle`, scene);
  muzzle.parent = root;
  muzzle.position.y = 28 * UNIT;
  return root;
}

// ----------------------------------------------------------------------------
//  The zombie horse
// ----------------------------------------------------------------------------

interface Leg { hip: TransformNode; knee: TransformNode; front: boolean; side: number }

interface Horse {
  root: TransformNode;
  legs: Leg[];
  neck: TransformNode;
  head: TransformNode;
  jaw: TransformNode;
  tail: TransformNode;
}

/** Hips and shoulders: how high, and how far forward and back. */
const LEG_TOP = 16, FRONT_Z = 8, BACK_Z = -9.5;
const NECK_REST = 0.55, HEAD_REST = 0.4, TAIL_REST = 0.45;

/**
 * A rotting black-green horse: ribs showing through a hole in its side,
 * bone where its muzzle has rotted away, glowing green eyes, a ragged mane
 * and tail. Faces +z, standing on the ground at the origin, the saddle top
 * at HORSE_SADDLE.
 */
function buildHorse(scene: Scene, name: string, parent: TransformNode): Horse {
  const root = joint(scene, name, parent, 0, 0, 0);
  const add = adder(root);
  const hide = solid(scene, 'horseHide', '#3d4a3a');
  const rot = solid(scene, 'horseRot', '#56683f');
  const dark = solid(scene, 'horseDark', '#120e0f');
  const bone = solid(scene, 'horseBone', '#d8d0b4', 0.05, 0.25);
  const hoof = solid(scene, 'horseHoof', '#18161a', 0, 0.4);
  const leather = solid(scene, 'horseLeather', '#1a1214', 0, 0.3);
  const blanket = solid(scene, 'horseBlanket', '#3b1f4a', 0.05);
  const silver = solid(scene, 'horseSilver', '#c8ccd4', 0.1, 0.9);
  const eye = ghostFire(scene, 'horseEye', HORSEMAN_GREEN, 1);

  // The barrel of its body, a deep chest, and a rump.
  add(box(scene, `${name}-barrel`, 9, 9, 20), 0, 19.5, -0.5, hide);
  add(box(scene, `${name}-chest`, 8.4, 10, 4), 0, 19.5, 10.5, hide);
  add(box(scene, `${name}-rump`, 9.4, 9.5, 5), 0, 20, -10.5, hide);
  // Rotten patches, and on each flank a hole the ribs show through.
  add(box(scene, `${name}-rot1`, 9.2, 3, 5), 0, 22.6, -8, rot);
  add(box(scene, `${name}-rot2`, 8.6, 4, 3), 0, 16.4, 9, rot);
  for (const side of [-1, 1]) {
    add(box(scene, `${name}-hole${side}`, 0.4, 6, 9), side * 4.4, 19, 1, dark);
    for (let k = 0; k < 4; k++) add(box(scene, `${name}-rib${side}${k}`, 0.6, 6.4, 1), side * 4.6, 19, -2.4 + k * 2.3, bone);
  }
  // A saddle on a purple blanket, trimmed in silver.
  add(box(scene, `${name}-blanket`, 10, 0.5, 11), 0, 24.2, 0, blanket);
  for (const side of [-1, 1]) {
    add(box(scene, `${name}-drape${side}`, 0.4, 4, 11), side * 5, 22.2, 0, blanket);
    add(box(scene, `${name}-hem${side}`, 0.5, 0.5, 11), side * 5.05, 20.2, 0, silver);
  }
  add(box(scene, `${name}-saddle`, 7, 1.2, 8), 0, HORSE_SADDLE - 0.4, 0, leather);
  add(box(scene, `${name}-cantle`, 7, 2, 1.4), 0, HORSE_SADDLE + 0.6, -4, leather);
  add(box(scene, `${name}-pommel`, 3, 2, 1.4), 0, HORSE_SADDLE + 0.6, 4, leather);

  // The neck leans out forward; the head hangs off the top of it.
  const neck = joint(scene, `${name}-neckJoint`, root, 0, 22, 10);
  neck.rotation.x = NECK_REST;
  const addN = adder(neck);
  addN(box(scene, `${name}-neck`, 5, 13, 6), 0, 6, 0, hide);
  addN(box(scene, `${name}-neckRot`, 5.2, 4, 3), 0, 7, 1.8, rot);
  // A ragged black mane down the back of it.
  for (let k = 0; k < 6; k++) {
    const tuft = addN(box(scene, `${name}-mane${k}`, 1.6, 3 + (k % 3), 2), 0, 12 - k * 2.1, -3.6, dark);
    tuft.rotation.x = -0.35 + (k % 2) * 0.2;
  }
  const head = joint(scene, `${name}-headJoint`, neck, 0, 12, 0.5);
  head.rotation.x = HEAD_REST;
  const addH = adder(head);
  addH(box(scene, `${name}-skull`, 5.4, 5.4, 6), 0, 0, 1, hide);
  // The muzzle has rotted to the bone: a long skull snout, nostril holes, teeth.
  addH(box(scene, `${name}-snout`, 4.2, 3.4, 6), 0, 0.6, 6.5, bone);
  for (const side of [-1, 1]) {
    addH(box(scene, `${name}-nostril${side}`, 0.9, 0.9, 0.3), side * 1, 1.2, 9.55, dark);
    addH(box(scene, `${name}-eye${side}`, 0.4, 1.3, 1.6), side * 2.75, 1, 2.5, eye);
    const ear = addH(box(scene, `${name}-ear${side}`, 1.2, 3, 1), side * 1.8, 3.8, -0.8, hide);
    ear.rotation.z = -side * 0.2;
  }
  addH(box(scene, `${name}-teeth`, 3.6, 0.8, 0.4), 0, -0.9, 9.4, bone);
  const jaw = joint(scene, `${name}-jawJoint`, head, 0, -1.4, 3);
  const addJ = adder(jaw);
  addJ(box(scene, `${name}-jaw`, 3.8, 1.6, 6), 0, -0.6, 3, bone);
  addJ(box(scene, `${name}-cheek`, 4.4, 1.8, 2.5), 0, -0.4, 0, hide);
  // The bridle: silver straps round the face, and reins back to his hand.
  addH(box(scene, `${name}-noseband`, 4.5, 0.6, 0.6), 0, 0.5, 5, silver);
  addH(box(scene, `${name}-browband`, 5.7, 0.6, 0.6), 0, 2.5, 3.6, silver);

  // A long ragged tail, hanging out behind.
  const tail = joint(scene, `${name}-tailJoint`, root, 0, 23, -13);
  tail.rotation.x = TAIL_REST;
  const addT = adder(tail);
  addT(box(scene, `${name}-tail`, 2.4, 13, 2), 0, -6.5, 0, dark);
  addT(box(scene, `${name}-tailTip`, 1.4, 4, 1.4), 0.6, -14, 0.4, dark);

  // Legs: upper and lower, a knee between, hooves at the bottom. The rotted
  // ones show bone at the shin.
  const legs: Leg[] = [];
  for (const front of [true, false]) {
    for (const side of [-1, 1]) {
      const hip = joint(scene, `${name}-hip${front}${side}`, root, side * 3, LEG_TOP, front ? FRONT_Z : BACK_Z);
      adder(hip)(box(scene, `${name}-thigh${front}${side}`, front ? 3 : 3.8, 9, front ? 3 : 4.4), 0, -3.5, 0, hide);
      const knee = joint(scene, `${name}-knee${front}${side}`, hip, 0, -8, 0);
      const addK = adder(knee);
      const rotten = front ? side > 0 : side < 0;
      addK(box(scene, `${name}-shin${front}${side}`, 2.2, 7, 2.2), 0, -3.5, 0, rotten ? bone : hide);
      addK(box(scene, `${name}-fetlock${front}${side}`, 2.8, 1.4, 2.8), 0, -6.3, 0.2, dark);
      addK(box(scene, `${name}-hoof${front}${side}`, 3, 1.6, 3.4), 0, -7.6, 0.4, hoof);
      legs.push({ hip, knee, front, side });
    }
  }
  return { root, legs, neck, head, jaw, tail };
}

// ----------------------------------------------------------------------------
//  The cape
// ----------------------------------------------------------------------------

/** Cape segments, top to bottom: how long, and how wide (in units). */
const CAPE = [[5, 10], [5, 11], [5, 12.5], [5, 13.5], [5, 14.5], [4.5, 15]] as const;

/**
 * A long cape off his shoulders: a chain of panels, each hinged to the one
 * above, so it can stream out behind him and ripple. Black outside, blood
 * red inside, with a high stand-up collar round the stump of his neck.
 */
function buildCape(scene: Scene, name: string, body: TransformNode, color: string): TransformNode[] {
  const cloth = solid(scene, `capeCloth${color}`, color, 0, 0.3);
  const lining = solid(scene, 'capeLining', '#5a0a14', 0.04, 0.2);
  const clasp = solid(scene, 'capeClasp', '#c8ccd4', 0.15, 0.9);
  const add = adder(body);
  // The collar: three tall panels round the back and sides of the neck.
  add(box(scene, `${name}-collarBack`, 9, 5, 0.6), 0, 1.8, -2.4, cloth);
  for (const side of [-1, 1]) {
    const flap = add(box(scene, `${name}-collar${side}`, 0.6, 5, 4), side * 4.4, 1.8, -0.4, cloth);
    flap.rotation.y = side * 0.25;
    add(box(scene, `${name}-clasp${side}`, 1.4, 1.4, 1), side * 3.4, -0.6, 2.2, clasp);
  }
  const segments: TransformNode[] = [];
  let parent = joint(scene, `${name}-cape0`, body, 0, 0, -2.4);
  for (const [i, [len, width]] of CAPE.entries()) {
    const seg = i === 0 ? parent : joint(scene, `${name}-cape${i}`, parent, 0, -CAPE[i - 1][0], 0);
    const addS = adder(seg);
    addS(box(scene, `${name}-capeOut${i}`, width, len, 0.4), 0, -len / 2, -0.2, cloth);
    addS(box(scene, `${name}-capeIn${i}`, width - 0.4, len, 0.2), 0, -len / 2, 0.1, lining);
    segments.push(seg);
    parent = seg;
  }
  return segments;
}

// ----------------------------------------------------------------------------
//  The jack-o'-lantern
// ----------------------------------------------------------------------------

/** Orange pumpkin skin with darker ribs running down it. */
function pumpkinTexture(scene: Scene): DynamicTexture {
  const existing = scene.getTextureByName('pumpkinSkin') as DynamicTexture | null;
  if (existing) return existing;
  const tex = new DynamicTexture('pumpkinSkin', { width: 64, height: 64 }, scene, false);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  g.fillStyle = '#f07a12';
  g.fillRect(0, 0, 64, 64);
  for (let x = 0; x < 64; x += 16) {
    g.fillStyle = '#b8500a';
    g.fillRect(x, 0, 3, 64);
    g.fillStyle = '#ff9a3a';
    g.fillRect(x + 7, 0, 3, 64);
  }
  tex.update();
  return tex;
}

/**
 * The carved face: slanted triangle eyes, a triangle nose and a wide jagged
 * grin, glowing green-white from the fire inside. Transparent everywhere
 * else, so it goes on a panel just in front of the pumpkin.
 */
function carvedFaceTexture(scene: Scene): DynamicTexture {
  const existing = scene.getTextureByName('pumpkinFace') as DynamicTexture | null;
  if (existing) return existing;
  const tex = new DynamicTexture('pumpkinFace', { width: 128, height: 128 }, scene, true);
  tex.hasAlpha = true;
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  g.clearRect(0, 0, 128, 128);
  const glow = g.createRadialGradient(64, 70, 6, 64, 70, 70);
  glow.addColorStop(0, '#f4ffd8');
  glow.addColorStop(0.45, '#9dff6a');
  glow.addColorStop(1, '#2fd84a');
  g.fillStyle = glow;
  const poly = (pts: [number, number][]) => {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
    g.closePath();
    g.fill();
  };
  // Eyes: angled down toward the nose, mean and narrow.
  poly([[14, 30], [52, 44], [26, 58]]);
  poly([[114, 30], [76, 44], [102, 58]]);
  poly([[64, 54], [56, 72], [72, 72]]);
  // The grin: curving up at the corners, with jagged teeth top and bottom.
  g.beginPath();
  g.moveTo(10, 78);
  const top: [number, number][] = [[22, 88], [30, 84], [38, 92], [48, 87], [56, 95], [64, 90], [72, 95], [80, 87], [90, 92], [98, 84], [106, 88], [118, 78]];
  for (const [x, y] of top) g.lineTo(x, y);
  const bottom: [number, number][] = [[110, 96], [98, 106], [92, 100], [82, 112], [72, 106], [64, 116], [56, 106], [46, 112], [36, 100], [30, 106], [18, 96]];
  for (const [x, y] of bottom) g.lineTo(x, y);
  g.closePath();
  g.fill();
  tex.update();
  return tex;
}

/** A flame: a flickering cone of green fire with a pale core. */
interface Flame { mesh: TransformNode; base: number; phase: number; rate: number }

/** An ember drifting up off the fire, fading as it goes. */
interface Ember { mesh: Mesh; age: number; life: number; vx: number; vz: number }

const EMBERS = 10;

/**
 * The jack-o'-lantern head floating beside him: a blocky pumpkin with a
 * creepy carved grin, wrapped in green fire, bobbing and turning to look
 * about (and up at the sky when he raises the dead). Built in skin units
 * under `parent` (the Horseman's root), so it scales and turns with him.
 */
class PumpkinHead {
  private root: TransformNode;
  private pumpkin: TransformNode;
  private flames: Flame[] = [];
  private embers: Ember[] = [];
  private time = Math.random() * 10;
  private flare = 0;

  constructor(scene: Scene, name: string, parent: TransformNode) {
    this.root = joint(scene, name, parent, -19, HORSE_SADDLE + 17, 8);
    this.root.scaling.setAll(0.8);
    this.pumpkin = joint(scene, `${name}-pumpkin`, this.root, 0, 0, 0);
    const add = adder(this.pumpkin);
    const skin = material(scene, 'pumpkinSkin', (m) => {
      m.diffuseTexture = pumpkinTexture(scene);
      m.emissiveColor = new Color3(0.25, 0.12, 0.02);
      m.specularColor = new Color3(0.25, 0.2, 0.1);
    });
    const stem = solid(scene, 'pumpkinStem', '#4a5a1e', 0.05);
    const face = material(scene, 'pumpkinFace', (m) => {
      const tex = carvedFaceTexture(scene);
      m.diffuseTexture = tex;
      m.emissiveTexture = tex;
      m.useAlphaFromDiffuseTexture = true;
      m.disableLighting = true;
      m.backFaceCulling = false;
    });
    const glowLayer = scene.getGlowLayerByName('glow');
    // A squat blocky pumpkin: a wide middle with narrower lobes top and bottom.
    const orange = [
      add(box(scene, `${name}-mid`, 11, 7, 10), 0, 0, 0, skin),
      add(box(scene, `${name}-top`, 8.5, 2, 8), 0, 4.2, 0, skin),
      add(box(scene, `${name}-bottom`, 9, 1.6, 8.5), 0, -4.1, 0, skin),
    ];
    for (const m of orange) glowLayer?.addExcludedMesh(m);
    const s = add(box(scene, `${name}-stem`, 1.6, 3.4, 1.6), 0.4, 6.6, 0, stem);
    s.rotation.z = -0.3;
    glowLayer?.addExcludedMesh(s);
    const panel = add(MeshBuilder.CreatePlane(`${name}-face`, { size: 10.6 * UNIT }, scene), 0, 0.2, 5.06, face);
    panel.rotation.y = Math.PI; // a plane faces -z: turn it round to face front

    // Green fire licking up all round it, and a tall plume off the top.
    const fire = ghostFire(scene, 'pumpkinFire', HORSEMAN_GREEN, 0.75);
    const core = ghostFire(scene, 'pumpkinFireCore', '#e4ffc8', 0.85);
    const ring = 9;
    for (let i = 0; i <= ring; i++) {
      const top = i === ring;
      const a = (i / ring) * Math.PI * 2;
      const r = top ? 0 : 5.6;
      const height = top ? 11 : 6 + (i % 3) * 1.6;
      const node = joint(scene, `${name}-flame${i}`, this.root, Math.cos(a) * r, top ? 6 : -1.5 + (i % 2) * 2, Math.sin(a) * r);
      const outer = MeshBuilder.CreateCylinder(`${name}-fire${i}`, { height: height * UNIT, diameterTop: 0, diameterBottom: (top ? 5 : 3.2) * UNIT, tessellation: 6 }, scene);
      adder(node)(outer, 0, height / 2, 0, fire);
      const inner = MeshBuilder.CreateCylinder(`${name}-core${i}`, { height: height * 0.6 * UNIT, diameterTop: 0, diameterBottom: (top ? 2.6 : 1.5) * UNIT, tessellation: 5 }, scene);
      adder(node)(inner, 0, height * 0.3, 0, core);
      this.flames.push({ mesh: node, base: 1, phase: Math.random() * 10, rate: 9 + Math.random() * 7 });
    }
    for (let i = 0; i < EMBERS; i++) {
      const mesh = adder(parent)(box(scene, `${name}-ember${i}`, 0.8, 0.8, 0.8), 0, 0, 0, i % 3 ? fire : core);
      mesh.setEnabled(false);
      this.embers.push({ mesh, age: 1, life: 1, vx: 0, vz: 0 });
    }
  }

  tick(dt: number, raising: number): void {
    this.time += dt;
    const t = this.time;
    this.flare += ((raising > 0 ? 1 : 0) - this.flare) * Math.min(1, dt * 4);
    // Bobbing and drifting beside him; rising high when the dead are called.
    this.root.position.set(
      (-19 + Math.sin(t * 0.7) * 1.5) * UNIT,
      (HORSE_SADDLE + 17 + Math.sin(t * 1.9) * 1.4 + this.flare * 9) * UNIT,
      (8 + Math.cos(t * 0.6) * 2) * UNIT,
    );
    // Looking this way and that, tilting its head; up and cackling while he raises the dead.
    this.pumpkin.rotation.y = Math.sin(t * 0.8) * 0.5 * (1 - this.flare) + Math.sin(t * 9) * 0.12 * this.flare;
    this.pumpkin.rotation.z = Math.sin(t * 1.3) * 0.12;
    this.pumpkin.rotation.x = -0.45 * this.flare + Math.sin(t * 1.1) * 0.06;
    for (const f of this.flames) {
      const flicker = 0.75 + 0.25 * Math.sin(t * f.rate + f.phase) + 0.12 * Math.sin(t * f.rate * 2.3 + f.phase * 1.7);
      f.mesh.scaling.set(1 + this.flare * 0.3, flicker * (1 + this.flare * 0.8), 1 + this.flare * 0.3);
      f.mesh.rotation.z = Math.sin(t * 3 + f.phase) * 0.18;
    }
    // Embers float up off the fire and wink out.
    for (const e of this.embers) {
      e.age += dt;
      if (e.age >= e.life) {
        if (Math.random() > dt * (6 + this.flare * 14)) {
          e.mesh.setEnabled(false);
          continue;
        }
        const a = Math.random() * Math.PI * 2;
        e.mesh.position.set(this.root.position.x + Math.cos(a) * 4 * UNIT, this.root.position.y + 4 * UNIT, this.root.position.z + Math.sin(a) * 4 * UNIT);
        e.age = 0;
        e.life = 0.6 + Math.random() * 0.7;
        e.vx = (Math.random() - 0.5) * 3;
        e.vz = (Math.random() - 0.5) * 3;
        e.mesh.setEnabled(true);
      }
      e.mesh.position.x += e.vx * UNIT * dt;
      e.mesh.position.z += e.vz * UNIT * dt;
      e.mesh.position.y += 12 * UNIT * dt;
      e.mesh.scaling.setAll(1 - e.age / e.life);
    }
  }
}

// ----------------------------------------------------------------------------
//  All of it together
// ----------------------------------------------------------------------------

/**
 * The Headless Horseman's ride: the zombie horse under him, his cape, and
 * his floating pumpkin head. Each frame, after the walk animation, `tick`
 * gallops the horse (or rears it up while he raises the dead, his sword held
 * high), streams the cape out behind, and floats the pumpkin; it returns how
 * far to pitch the whole of him back (radians) and lift him (skin units), so
 * the horse rears up on its hind legs.
 */
export class Steed {
  private horse: Horse;
  private cape: TransformNode[];
  private pumpkin: PumpkinHead;
  private time = Math.random() * 10;
  private rear = 0;
  private speed = 0;

  constructor(scene: Scene, name: string, private character: BlockCharacter, capeColor: string) {
    this.horse = buildHorse(scene, `${name}-horse`, character.root);
    const body = character.joints.body!;
    this.cape = buildCape(scene, `${name}-cape`, body, capeColor);
    this.pumpkin = new PumpkinHead(scene, `${name}-pumpkin`, character.root);
    // Skins and cloth shouldn't bloom like the fire does.
    const glow = scene.getGlowLayerByName('glow');
    for (const m of [...this.horse.root.getChildMeshes(), ...body.getChildMeshes()]) {
      if (!(m.material as StandardMaterial | null)?.disableLighting) glow?.addExcludedMesh(m as Mesh);
    }
  }

  /** `moving`: riding along. `raising`: seconds left raising the dead (0 = not). */
  tick(dt: number, moving: boolean, attacking: boolean, raising: number): { pitch: number; lift: number } {
    this.time += dt;
    const t = this.time;
    const h = this.horse;
    this.rear += ((raising > 0 ? 1 : 0) - this.rear) * Math.min(1, dt * 5);
    this.speed += ((moving ? 1 : 0) - this.speed) * Math.min(1, dt * 4);
    const rear = smooth(this.rear);

    // A rolling canter: front pair and back pair a beat apart, each pair
    // just out of step, the knees folding as the legs come forward.
    const phase = t * 8.5;
    for (const leg of h.legs) {
      const p = phase + (leg.front ? 0 : 1.9) + (leg.side > 0 ? 0.5 : 0);
      let swing = Math.sin(p) * 0.6 * this.speed;
      let bend = Math.max(0, Math.cos(p)) * (leg.front ? -0.9 : 0.8) * this.speed;
      if (attacking && leg.front && leg.side > 0) {
        // Pawing and stamping at whatever he's hacking at.
        swing = -0.5 + Math.sin(t * 9) * 0.5;
        bend = -0.8;
      }
      if (leg.front) {
        // Rearing: forelegs up and kicking the air.
        swing = swing * (1 - rear) + rear * (-1.1 + Math.sin(t * 11 + leg.side) * 0.35);
        bend = bend * (1 - rear) + rear * 1.4;
      } else {
        // Hind legs stay planted under it as the body tips back.
        swing = swing * (1 - rear) + rear * 0.65;
        bend = bend * (1 - rear);
      }
      leg.hip.rotation.x = swing;
      leg.knee.rotation.x = bend;
    }
    const gallop = Math.sin(phase * 2) * this.speed;
    h.neck.rotation.x = NECK_REST + gallop * 0.06 - rear * 0.75;
    h.head.rotation.x = HEAD_REST + Math.sin(t * 1.3) * 0.08 - rear * 0.3 + Math.sin(t * 13) * 0.08 * rear;
    h.jaw.rotation.x = 0.1 + Math.max(0, Math.sin(t * 2.1)) * 0.15 + rear * 0.45;
    h.tail.rotation.x = TAIL_REST + this.speed * 0.5 + Math.sin(t * 6) * 0.1 * this.speed;
    h.tail.rotation.z = Math.sin(t * 2.3) * 0.25;

    // The cape: streaming out behind as he rides, rippling down its length;
    // hanging down over the horse's rump while he stands.
    const stream = 0.7 + this.speed * 0.3;
    for (const [i, seg] of this.cape.entries()) {
      const ripple = Math.sin(t * (4 + this.speed * 5) - i * 0.9) * (0.1 + this.speed * 0.14);
      seg.rotation.x = (i === 0 ? stream : 0.07 * this.speed - 0.06) + ripple;
      seg.rotation.z = Math.sin(t * 1.7 - i * 0.6) * 0.04;
    }

    // His sword up high while he raises the dead, swaying.
    const j = this.character.joints;
    if (j.armR && rear > 0) j.armR.rotation.x = j.armR.rotation.x * (1 - rear) + rear * (-2.85 + Math.sin(t * 6) * 0.08);
    if (j.armL) j.armL.rotation.x += gallop * 0.08;
    if (j.body) j.body.rotation.x = -0.12 * rear + gallop * 0.02;

    this.pumpkin.tick(dt, raising);
    const pitch = rear * 0.6;
    // Lift him so the hind hooves stay on the ground as he tips back, and
    // bob in the saddle as he rides.
    const lift = -BACK_Z * Math.sin(pitch) + Math.abs(gallop) * 0.8;
    return { pitch, lift };
  }
}

