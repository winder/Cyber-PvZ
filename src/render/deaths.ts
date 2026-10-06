import {
  Axis, Mesh, MeshBuilder, Quaternion, Scene, TransformNode, Vector3, type AbstractMesh,
} from '@babylonjs/core';
import { ZOMBIES, type ZombieId } from '../data/config';
import type { Terrain } from './terrain';
import type { Materials, Visual } from './visuals';

// ============================================================================
//  ZOMBIE DEATHS
//
//  How a zombie goes when it falls. Looks only: the sim has already removed
//  it (ADR 0002, 0012). Each death takes over the zombie's visual, plays out,
//  and disposes of it. Times are in render seconds (they run with the game
//  speed, like everything else).
// ============================================================================

export type DeathKind =
  | 'dismember' // arms, legs and head pop off; the body disintegrates
  | 'shocked' // "!!!", eyes bug out, then it keels over stiff as a plank
  | 'zapped' // electrocuted: yellow glow, flashing x-ray bones, a pile of ash
  | 'jetpackBlast' // the jetpack blows and launches it at the camera
  | 'shieldSquish' // its own riot shield flattens it
  | 'shatter'; // the Orbital Laser Strike blows it apart, some bits at the screen

const COMMON: DeathKind[] = ['dismember', 'shocked', 'zapped'];

/** How often a zombie with a death of its own (`ZombieDef.death`) plays it. */
const OWN_DEATH_CHANCE = 0.5;

const GRAVITY = 16;

export function pickDeath(type: ZombieId, by: 'plant' | 'strike'): DeathKind {
  if (by === 'strike') return 'shatter';
  const own = ZOMBIES[type].death;
  if (own && Math.random() < OWN_DEATH_CHANCE) return own;
  return COMMON[Math.floor(Math.random() * COMMON.length)];
}

export interface DeathEffect {
  update(dt: number): boolean; // false = finished
  dispose(): void;
}

/** What a death needs from the world. */
export interface DeathStage {
  scene: Scene;
  mats: Materials;
  terrain: Terrain;
  shake(amount: number): void;
}

export interface DeathOptions {
  type: ZombieId;
  /** For a shatter: where the strike landed. */
  blast?: { x: number; z: number };
  /** For a shatter: how many pieces fly at the screen. */
  toCamera?: number;
}

/**
 * Play a death on a zombie's visual. Returns null if the visual can't be
 * taken apart (a flat drawing), so the caller can fall back to a topple.
 */
export function playDeath(kind: DeathKind, visual: Visual, stage: DeathStage, opts: DeathOptions): DeathEffect | null {
  const rig = rigOf(visual, opts.type);
  if (!rig) return null;
  switch (kind) {
    case 'dismember': return dismember(rig, stage);
    case 'shocked': return shocked(rig, stage);
    case 'zapped': return zapped(rig, stage);
    case 'jetpackBlast': return rig.pack ? jetpackBlast(rig, stage) : dismember(rig, stage);
    case 'shieldSquish': return rig.shield ? shieldSquish(rig, stage) : shocked(rig, stage);
    case 'shatter': return shatter(rig, stage, opts.blast ?? { x: rig.root.position.x, z: rig.root.position.z }, opts.toCamera ?? 0);
  }
}

// ----------------------------------------------------------------------------
//  Rigs: a zombie visual seen as pieces that can come apart
// ----------------------------------------------------------------------------

type PieceRole = 'head' | 'body' | 'limb' | 'extra';

interface Piece {
  role: PieceRole;
  /** The node that comes away (a joint, or the mesh itself on simple models). */
  node: TransformNode;
  /** The visible box, centered on its own origin. */
  mesh: AbstractMesh;
}

interface Rig {
  root: TransformNode;
  type: ZombieId;
  pieces: Piece[];
  head?: Piece;
  body?: Piece;
  pack?: Piece;
  shield?: Piece;
  /** Arms (for posing), when they're joints. */
  arms: TransformNode[];
  legs: TransformNode[];
  scale: number;
  flying: boolean;
  /** Every mesh it's drawn with (parts, hair, hats, weapons, flames). */
  meshes: AbstractMesh[];
}

function rigOf(visual: Visual, type: ZombieId): Rig | null {
  const def = ZOMBIES[type];
  const root = visual.root;
  const pieces: Piece[] = [];
  const rig: Rig = {
    root, type, pieces, arms: [], legs: [], scale: def.scale ?? 1, flying: def.flying,
    meshes: root.getChildMeshes(false),
  };
  const c = visual.character;
  if (c) {
    for (const [role, joint] of Object.entries(c.joints) as [string, TransformNode][]) {
      if (joint.parent !== root) continue; // comes along with its parent
      const mesh = joint.getChildMeshes(true)[0];
      if (!mesh) continue;
      const r: PieceRole = role === 'head' ? 'head' : role === 'body' ? 'body' : /^(arm|leg)/.test(role) ? 'limb' : 'extra';
      const piece = { role: r, node: joint, mesh };
      pieces.push(piece);
      if (role === 'jetpack') rig.pack = piece;
      if (role.startsWith('arm')) rig.arms.push(joint);
      if (role.startsWith('leg')) rig.legs.push(joint);
    }
  } else {
    // Simple box-built zombies: each part is a mesh on the root, named `<root>-<part>`.
    const byPart = new Map<string, AbstractMesh>();
    for (const m of root.getChildMeshes(true)) byPart.set(m.name.slice(root.name.length + 1), m);
    const head = byPart.get('head');
    const pack = byPart.get('pack');
    for (const [part, mesh] of byPart) {
      if (part === 'eye' && head) {
        mesh.setParent(head);
        continue;
      }
      if (part.startsWith('flame') && pack) {
        mesh.setParent(pack);
        continue;
      }
      const role: PieceRole = part === 'head' ? 'head' : part === 'body' ? 'body' : /^(arm|legs)/.test(part) ? 'limb' : 'extra';
      const piece = { role, node: mesh, mesh };
      pieces.push(piece);
      if (part === 'pack') rig.pack = piece;
      if (part === 'shield') rig.shield = piece;
    }
  }
  rig.head = pieces.find((p) => p.role === 'head');
  rig.body = pieces.find((p) => p.role === 'body');
  if (!rig.head || !rig.body) return null;
  return rig;
}

/** Half-size of a mesh's box, in its own space. */
function extent(mesh: AbstractMesh): Vector3 {
  return mesh.getBoundingInfo().boundingBox.extendSize;
}

/** World position of a mesh's center. */
function centerOf(mesh: AbstractMesh): Vector3 {
  mesh.computeWorldMatrix(true);
  return mesh.getAbsolutePosition().clone();
}

/**
 * Lift a piece out of the zombie onto a fresh pivot at its center, keeping
 * how it looks in the world. The pivot's rotation is the piece's, so +z on
 * the pivot is the way the piece faces. `center` is in the node's own space.
 */
function detach(node: TransformNode, center: Vector3, scene: Scene): TransformNode {
  node.computeWorldMatrix(true);
  const world = node.getWorldMatrix();
  const scale = new Vector3(), rot = new Quaternion(), pos = new Vector3();
  world.decompose(scale, rot, pos);
  const pivot = new TransformNode(`${node.name}-loose`, scene);
  pivot.rotationQuaternion = rot;
  pivot.scaling.copyFrom(scale);
  pivot.position = Vector3.TransformCoordinates(center, world);
  node.parent = pivot;
  node.rotationQuaternion = null;
  node.rotation.setAll(0);
  node.scaling.setAll(1);
  node.position = center.negate();
  return pivot;
}

function detachPiece(p: Piece, scene: Scene): TransformNode {
  // A joint's box hangs off it at an offset; a plain mesh is its own center.
  const center = p.node === p.mesh ? Vector3.Zero() : p.mesh.position.clone();
  return detach(p.node, center, scene);
}

function spinBy(node: TransformNode, spin: Vector3, dt: number): void {
  node.rotationQuaternion ??= Quaternion.FromEulerVector(node.rotation);
  node.rotationQuaternion.multiplyInPlace(Quaternion.RotationYawPitchRoll(spin.y * dt, spin.x * dt, spin.z * dt));
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const smooth = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

function randomSpin(amount: number): Vector3 {
  return new Vector3(rand(-amount, amount), rand(-amount, amount), rand(-amount, amount));
}

// ----------------------------------------------------------------------------
//  Building blocks
// ----------------------------------------------------------------------------

/** A bag of running bits; finished when its script and all its bits are. */
class Show implements DeathEffect {
  private bits: DeathEffect[] = [];
  private owned: TransformNode[] = [];
  private time = 0;
  private scriptDone = false;

  constructor(private script: (t: number, dt: number) => boolean) {}

  add(bit: DeathEffect): void {
    this.bits.push(bit);
  }

  /** Disposed when the show ends. */
  own<T extends TransformNode>(node: T): T {
    this.owned.push(node);
    return node;
  }

  update(dt: number): boolean {
    this.time += dt;
    if (!this.scriptDone) this.scriptDone = !this.script(this.time, dt);
    for (let i = this.bits.length - 1; i >= 0; i--) {
      if (!this.bits[i].update(dt)) {
        this.bits[i].dispose();
        this.bits.splice(i, 1);
      }
    }
    return !this.scriptDone || this.bits.length > 0;
  }

  dispose(): void {
    for (const b of this.bits) b.dispose();
    for (const n of this.owned) n.dispose();
    this.bits = [];
    this.owned = [];
  }
}

/** A loose piece thrown under gravity: bounces, settles, then sinks away. */
class Tumble implements DeathEffect {
  private time = 0;
  private landed = false;

  constructor(
    private node: TransformNode,
    private vel: Vector3,
    private spin: Vector3,
    private terrain: Terrain,
    private rest: number,
    /** When it starts sinking into the ground. */
    private lifetime = 2.2,
  ) {}

  update(dt: number): boolean {
    this.time += dt;
    const p = this.node.position;
    if (this.time > this.lifetime) {
      p.y -= dt * 1.6;
      return this.time < this.lifetime + 0.7;
    }
    if (this.landed) return true;
    this.vel.y -= GRAVITY * dt;
    p.addInPlace(this.vel.scale(dt));
    spinBy(this.node, this.spin, dt);
    const floor = this.terrain.terrainHeight(p.x, p.z) + this.rest;
    if (p.y < floor) {
      p.y = floor;
      if (this.vel.y < -2.5) {
        this.vel.y *= -0.35;
        this.vel.x *= 0.5;
        this.vel.z *= 0.5;
        this.spin.scaleInPlace(0.4);
      } else {
        this.landed = true;
      }
    }
    return true;
  }

  dispose(): void {
    this.node.dispose();
  }
}

/**
 * Something flung at the player: it flies up to the camera, smacks into the
 * screen (face first, squashed against the glass), sticks there a moment,
 * then slides down out of view.
 */
class ScreenHit implements DeathEffect {
  private time = 0;
  private start: Vector3 | null = null;
  private spin = randomSpin(14);
  private hit = false;
  /** Its size when it hit, to squash from. */
  private base = Vector3.One();
  private offset: { x: number; y: number };

  constructor(
    private node: TransformNode,
    private stage: DeathStage,
    private opts: { delay?: number; flight?: number; distance: number; arc?: number; onFly?: (t: number) => void },
  ) {
    node.rotationQuaternion ??= Quaternion.FromEulerVector(node.rotation);
    // Off-center, so a few at once don't stack up in the middle.
    this.offset = { x: rand(-0.35, 0.35), y: rand(-0.15, 0.2) };
  }

  update(dt: number): boolean {
    const cam = this.stage.scene.activeCamera;
    if (!cam) return false;
    this.time += dt;
    const t = this.time - (this.opts.delay ?? 0);
    if (t < 0) return true;
    this.start ??= this.node.position.clone();
    const fwd = cam.getDirection(Axis.Z), right = cam.getDirection(Axis.X), up = cam.getDirection(Axis.Y);
    const d = this.opts.distance;
    const spot = cam.position
      .add(fwd.scale(d))
      .add(right.scale(this.offset.x * d * 0.6))
      .add(up.scale(this.offset.y * d * 0.6));
    const facing = Quaternion.FromLookDirectionLH(fwd.negate(), up);
    const flight = this.opts.flight ?? 0.8;
    const STUCK = 0.5, SLIDE = 0.6;
    const node = this.node;
    if (t < flight) {
      // Rushing at the screen, tumbling, and turning to face it at the end.
      const k = t / flight;
      const e = k * k;
      Vector3.LerpToRef(this.start, spot, e, node.position);
      node.position.addInPlace(Vector3.Up().scale(Math.sin(k * Math.PI) * (this.opts.arc ?? 1.5)));
      spinBy(node, this.spin, dt);
      const turn = smooth((k - 0.55) / 0.45);
      if (turn > 0) Quaternion.SlerpToRef(node.rotationQuaternion!, facing, turn, node.rotationQuaternion!);
      this.opts.onFly?.(t);
      return true;
    }
    if (!this.hit) {
      this.hit = true;
      this.stage.shake(0.25);
      this.base = node.scaling.clone();
    }
    const s = t - flight;
    node.rotationQuaternion!.copyFrom(facing);
    // Squashed flat against the glass, wobbling as it hits.
    const wobble = Math.exp(-s * 10) * Math.sin(s * 40) * 0.15;
    node.scaling.set(this.base.x * (1.15 + wobble), this.base.y * (1.15 - wobble), this.base.z * 0.45);
    node.position.copyFrom(spot);
    if (s > STUCK) {
      // ...then slowly slides down the screen and drops away.
      const k = (s - STUCK) / SLIDE;
      node.position.addInPlace(up.scale(-k * k * d * 1.1));
    }
    return s < STUCK + SLIDE;
  }

  dispose(): void {
    this.node.dispose();
  }
}

/** A glowing ball that swells and fades. */
function puff(stage: DeathStage, at: Vector3, color: string, size: number, life = 0.35, glow = 1.5): DeathEffect {
  const mesh = MeshBuilder.CreateIcoSphere('deathPuff', { radius: size / 2, subdivisions: 1 }, stage.scene);
  mesh.material = stage.mats.neon(color, glow, 0.7);
  mesh.position.copyFrom(at);
  mesh.isPickable = false;
  let t = 0;
  return {
    update: (dt) => {
      t += dt;
      mesh.scaling.setAll(1 + (t / life) * 2.5);
      mesh.visibility = Math.max(0, 1 - t / life);
      return t < life;
    },
    dispose: () => mesh.dispose(),
  };
}

/** A dark puff of smoke that drifts up as it grows and thins. */
function smoke(stage: DeathStage, at: Vector3, size: number, life = 0.8): DeathEffect {
  const mesh = MeshBuilder.CreateIcoSphere('deathSmoke', { radius: size / 2, subdivisions: 1 }, stage.scene);
  mesh.material = stage.mats.dark('#2b2b30');
  mesh.position.copyFrom(at);
  mesh.isPickable = false;
  const drift = new Vector3(rand(-0.3, 0.3), rand(0.8, 1.4), rand(-0.3, 0.3));
  let t = 0;
  return {
    update: (dt) => {
      t += dt;
      mesh.position.addInPlace(drift.scale(dt));
      mesh.scaling.setAll(1 + (t / life) * 1.8);
      mesh.visibility = Math.max(0, 0.85 * (1 - t / life));
      return t < life;
    },
    dispose: () => mesh.dispose(),
  };
}

/** A flat ring of dust kicked out along the ground. */
function dustRing(stage: DeathStage, x: number, z: number, size: number): DeathEffect {
  const mesh = MeshBuilder.CreateTorus('deathDust', { diameter: size, thickness: size * 0.25, tessellation: 20 }, stage.scene);
  mesh.material = stage.mats.dark('#9a8466');
  mesh.position.set(x, stage.terrain.terrainHeight(x, z) + 0.08, z);
  mesh.scaling.y = 0.4;
  mesh.isPickable = false;
  let t = 0;
  return {
    update: (dt) => {
      t += dt;
      const k = t / 0.5;
      mesh.scaling.x = mesh.scaling.z = 0.5 + k * 1.6;
      mesh.visibility = Math.max(0, 0.9 * (1 - k));
      return t < 0.5;
    },
    dispose: () => mesh.dispose(),
  };
}

/** A small box flung out of something, shrinking to nothing. */
function fleck(stage: DeathStage, at: Vector3, vel: Vector3, color: string, size: number, life: number, gravity = GRAVITY): DeathEffect {
  const mesh = MeshBuilder.CreateBox('deathFleck', { size }, stage.scene);
  mesh.material = stage.mats.neon(color, 0.8);
  mesh.position.copyFrom(at);
  mesh.isPickable = false;
  const spin = randomSpin(10);
  let t = 0;
  return {
    update: (dt) => {
      t += dt;
      vel.y -= gravity * dt;
      mesh.position.addInPlace(vel.scale(dt));
      mesh.rotation.addInPlace(spin.scale(dt));
      mesh.scaling.setAll(Math.max(0.01, 1 - t / life));
      return t < life;
    },
    dispose: () => mesh.dispose(),
  };
}

/** Drop a flyer to the ground (call every frame); true once it's down. */
function fall(rig: Rig, stage: DeathStage, state: { vy: number }, dt: number): boolean {
  const p = rig.root.position;
  const ground = stage.terrain.terrainHeight(p.x, p.z);
  if (p.y <= ground) return true;
  state.vy -= GRAVITY * dt;
  p.y = Math.max(ground, p.y + state.vy * dt);
  return p.y <= ground;
}

// ----------------------------------------------------------------------------
//  1. Dismember: limbs and head pop off, the body disintegrates
// ----------------------------------------------------------------------------

function dismember(rig: Rig, stage: DeathStage): DeathEffect {
  const color = ZOMBIES[rig.type].color;
  const body = rig.body!;
  const s = rig.scale;
  const fallState = { vy: 0 };
  let popped = false;
  let nextBit = 0;
  const show: Show = new Show((t, dt) => {
    const SWELL = 0.15, CRUMBLE = 0.9;
    if (t < SWELL) {
      // A shudder and a swell, like something's about to give.
      const k = t / SWELL;
      rig.root.scaling.setAll(s * (1 + 0.18 * Math.sin(k * Math.PI / 2)));
      rig.root.rotation.z = Math.sin(t * 90) * 0.05;
      return true;
    }
    if (!popped) {
      popped = true;
      rig.root.scaling.setAll(s);
      rig.root.rotation.z = 0;
      const mid = centerOf(body.mesh);
      for (const p of rig.pieces) {
        if (p === body) continue;
        const pivot = detachPiece(p, stage.scene);
        const out = pivot.position.subtract(mid);
        out.y = 0;
        if (out.lengthSquared() < 1e-4) out.set(rand(-1, 1), 0, rand(-1, 1));
        out.normalize();
        const head = p.role === 'head';
        const vel = out.scale(head ? rand(0.8, 2) : rand(2.5, 4.5));
        vel.y = head ? rand(7, 9) : p.role === 'limb' && pivot.position.y < mid.y ? rand(2.5, 4) : rand(4.5, 7);
        show.add(new Tumble(pivot, vel, randomSpin(12), stage.terrain, 0.08 * s));
        show.add(puff(stage, pivot.position, color, 0.25 * s, 0.25));
      }
    }
    // The body crumbles into glowing bits that drift away.
    const k = (t - SWELL) / CRUMBLE;
    if (k < 1) {
      body.mesh.scaling.setAll(Math.max(0.01, 1 - smooth(k)));
      rig.root.position.x += Math.sin(t * 70) * 0.004;
      nextBit -= dt;
      while (nextBit <= 0) {
        nextBit += 0.025;
        const e = extent(body.mesh).scale(s * (1 - k));
        const at = centerOf(body.mesh).add(new Vector3(rand(-e.x, e.x), rand(-e.y, e.y), rand(-e.z, e.z)));
        const vel = new Vector3(rand(-1.2, 1.2), rand(0.5, 2.2), rand(-1.2, 1.2));
        show.add(fleck(stage, at, vel, Math.random() < 0.3 ? '#e8ffd0' : color, rand(0.05, 0.11) * s, rand(0.4, 0.8), -1));
      }
    }
    if (rig.flying) fall(rig, stage, fallState, dt);
    return k < 1;
  });
  show.own(rig.root);
  return show;
}

// ----------------------------------------------------------------------------
//  2. Shocked: three red "!", eyes bug out, then it keels over stiff
// ----------------------------------------------------------------------------

/** A red exclamation mark, standing on its dot. */
function exclamation(stage: DeathStage, parent: TransformNode, x: number, tilt: number, name: string): TransformNode {
  const mark = new TransformNode(name, stage.scene);
  mark.parent = parent;
  mark.position.x = x;
  mark.rotation.z = tilt;
  const mat = stage.mats.neon('#ff2a2a', 1.6);
  const bar = MeshBuilder.CreateCylinder(`${name}-bar`, { height: 0.34, diameterTop: 0.13, diameterBottom: 0.06, tessellation: 4 }, stage.scene);
  bar.rotation.y = Math.PI / 4;
  bar.position.y = 0.27;
  const dot = MeshBuilder.CreateBox(`${name}-dot`, { size: 0.08 }, stage.scene);
  dot.position.y = 0.04;
  for (const m of [bar, dot]) {
    m.material = mat;
    m.parent = mark;
    m.isPickable = false;
  }
  mark.scaling.setAll(0.01);
  return mark;
}

/** Cartoon eyeballs on the front of a head box, ready to pop out. */
function eyeballs(stage: DeathStage, head: AbstractMesh, name: string): TransformNode[] {
  const e = extent(head);
  const r = e.x * 0.36;
  return [-1, 1].map((side) => {
    const eye = new TransformNode(`${name}-eye${side}`, stage.scene);
    eye.parent = head;
    eye.position.set(side * e.x * 0.45, e.y * 0.15, e.z);
    const ball = MeshBuilder.CreateSphere(`${name}-ball${side}`, { diameter: r * 2, segments: 8 }, stage.scene);
    ball.material = stage.mats.neon('#ffffff', 0.7);
    ball.parent = eye;
    const pupil = MeshBuilder.CreateSphere(`${name}-pupil${side}`, { diameter: r * 0.8, segments: 6 }, stage.scene);
    pupil.material = stage.mats.dark('#000000');
    pupil.parent = eye;
    pupil.position.z = r * 0.75;
    for (const m of [ball, pupil]) m.isPickable = false;
    eye.scaling.setAll(0.01);
    return eye;
  });
}

function shocked(rig: Rig, stage: DeathStage): DeathEffect {
  const s = rig.scale;
  const head = rig.head!.mesh;
  const marks = new TransformNode('shockMarks', stage.scene);
  marks.billboardMode = TransformNode.BILLBOARDMODE_ALL;
  marks.scaling.setAll(s);
  const bangs = [exclamation(stage, marks, -0.26, 0.3, 'bang0'), exclamation(stage, marks, 0, 0, 'bang1'), exclamation(stage, marks, 0.26, -0.3, 'bang2')];
  bangs[1].position.y = 0.08;
  const eyes = eyeballs(stage, head, 'shock');
  const eyeZ = extent(head).z;
  const groundY = () => stage.terrain.terrainHeight(rig.root.position.x, rig.root.position.z);
  const fallState = { vy: 0 };
  const startY = rig.root.position.y;
  let landed = false;
  const TIP = 1.05, TIPPED = 1.5, SINK = 2.4, END = 3.1;
  const show: Show = new Show((t, dt) => {
    // The !!! pop in one after another, and hang over its head.
    for (const [i, bang] of bangs.entries()) {
      const k = (t - i * 0.12) / 0.15;
      const pop = k <= 0 ? 0.01 : k < 1 ? 1.35 * Math.sin(k * Math.PI / 2) : 1 + 0.35 * Math.exp(-(k - 1) * 3) * Math.cos((k - 1) * 6);
      const gone = t > TIPPED ? Math.max(0.01, 1 - (t - TIPPED) / 0.25) : 1;
      bang.scaling.setAll(Math.max(0.01, pop * gone));
    }
    if (t < TIP) {
      const top = centerOf(head).add(new Vector3(0, extent(head).y * s + 0.3 * s, 0));
      marks.position.copyFrom(top);
    }
    // Eyes spring out of its head on stalks of pure horror.
    const ek = Math.max(0, t - 0.1);
    const spring = 1 - Math.exp(-ek * 7) * Math.cos(ek * 22);
    for (const eye of eyes) {
      eye.scaling.setAll(Math.max(0.01, spring * 1.6));
      eye.position.z = eyeZ + spring * eyeZ * 1.1;
    }

    if (t < TIP) {
      // Jumps out of its skin: a hop, arms flung up, then frozen rigid.
      const hop = t < 0.3 ? Math.sin((t / 0.3) * Math.PI) * 0.35 * s : 0;
      rig.root.position.y = (rig.flying ? startY : groundY()) + hop;
      const up = smooth(t / 0.12);
      for (const arm of rig.arms) arm.rotation.x = -Math.PI / 2 - up * 1.1;
      for (const [i, arm] of rig.arms.entries()) arm.rotation.z = (i ? -1 : 1) * up * 0.4;
      for (const leg of rig.legs) leg.rotation.x = 0;
      rig.root.rotation.z = t > 0.35 ? Math.sin(t * 60) * 0.02 : 0;
      return true;
    }
    // Then it goes over like a plank.
    if (rig.flying) fall(rig, stage, fallState, dt);
    const k = Math.min(1, (t - TIP) / 0.4);
    let tilt = -(Math.PI / 2) * k * k;
    if (k >= 1) {
      if (!landed) {
        landed = true;
        const p = rig.root.position;
        show.add(dustRing(stage, p.x, p.z, 1.6 * s));
        stage.shake(0.08 * s);
      }
      const b = t - TIP - 0.4;
      tilt += Math.abs(Math.sin(b * 14)) * 0.18 * Math.exp(-b * 6);
    }
    rig.root.rotation.z = 0;
    rig.root.rotation.x = tilt;
    if (!rig.flying) rig.root.position.y = groundY();
    if (t > SINK) rig.root.position.y = groundY() - (t - SINK) * 1.6;
    return t < END;
  });
  show.own(rig.root);
  show.own(marks);
  return show;
}

// ----------------------------------------------------------------------------
//  3. Zapped: crackling yellow, x-ray bones, burnt to a crisp, a pile of ash
// ----------------------------------------------------------------------------

/** A cartoon skeleton piece inside a part (child of its mesh, hidden to start). */
function bones(stage: DeathStage, p: Piece, name: string): Mesh[] {
  const e = extent(p.mesh);
  const bone = stage.mats.neon('#f2efdc', 0.9);
  const hole = stage.mats.dark('#000000');
  const out: Mesh[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat = bone) => {
    const m = MeshBuilder.CreateBox(`${name}-bone`, { width: w, height: h, depth: d }, stage.scene);
    m.material = mat;
    m.parent = p.mesh;
    m.position.set(x, y, z);
    m.isPickable = false;
    m.isVisible = false;
    out.push(m);
  };
  if (p.role === 'head') {
    box(e.x * 1.5, e.y * 1.2, e.z * 1.5, 0, e.y * 0.15, 0); // skull
    box(e.x * 1.1, e.y * 0.4, e.z * 1.2, 0, -e.y * 0.6, e.z * 0.1); // jaw
    for (const side of [-1, 1]) box(e.x * 0.4, e.y * 0.4, e.z * 0.1, side * e.x * 0.38, e.y * 0.25, e.z * 0.76, hole);
    box(e.x * 0.18, e.y * 0.2, e.z * 0.1, 0, -e.y * 0.1, e.z * 0.76, hole);
  } else if (p.role === 'body') {
    box(e.x * 0.25, e.y * 1.9, e.z * 0.4, 0, 0, -e.z * 0.3); // spine
    for (let i = 0; i < 4; i++) box(e.x * 1.5, e.y * 0.1, e.z * 1.3, 0, e.y * (0.65 - i * 0.32), 0); // ribs
    box(e.x * 1.3, e.y * 0.25, e.z * 1.0, 0, -e.y * 0.8, 0); // hips
  } else if (p.role === 'limb') {
    // One long bone along the longest side, knobbly at both ends.
    const axis = e.y >= e.z ? 'y' : 'z';
    const len = axis === 'y' ? e.y : e.z;
    const thin = Math.min(e.x, axis === 'y' ? e.z : e.y) * 0.6;
    if (axis === 'y') {
      box(thin, len * 1.7, thin, 0, 0, 0);
      for (const end of [-1, 1]) box(thin * 2, thin * 1.3, thin * 2, 0, end * len * 0.85, 0);
    } else {
      box(thin, thin, len * 1.7, 0, 0, 0);
      for (const end of [-1, 1]) box(thin * 2, thin * 2, thin * 1.3, 0, 0, end * len * 0.85);
    }
  }
  return out;
}

/** A jagged bolt of lightning, up the height of the zombie (in the root's space). */
function bolt(stage: DeathStage, parent: TransformNode, height: number, name: string): Mesh {
  const path: Vector3[] = [];
  for (let i = 0; i <= 6; i++) path.push(new Vector3(0.45 + rand(-0.15, 0.15), (i / 6) * height, rand(-0.18, 0.18)));
  const mesh = MeshBuilder.CreateTube(name, { path, radius: 0.025, tessellation: 4 }, stage.scene);
  mesh.material = stage.mats.neon('#fff36b', 2.2);
  mesh.parent = parent;
  mesh.isPickable = false;
  return mesh;
}

function zapped(rig: Rig, stage: DeathStage): DeathEffect {
  const s = rig.scale;
  // A glowing yellow shell round every part, x-ray bones inside.
  const zap = stage.mats.neon('#ffe633', 1.4, 0.5);
  // On the x-ray flashes the glow thins out so the bones show through.
  const xrayGlow = stage.mats.neon('#ffd21a', 0.35, 0.15);
  const shells: Mesh[] = [];
  const skeleton: Mesh[] = [];
  for (const [i, p] of rig.pieces.entries()) {
    const e = extent(p.mesh);
    const shell = MeshBuilder.CreateBox(`zap${i}`, { width: e.x * 2.24, height: e.y * 2.24, depth: e.z * 2.24 }, stage.scene);
    shell.material = zap;
    shell.parent = p.mesh;
    shell.isPickable = false;
    shells.push(shell);
    skeleton.push(...bones(stage, p, `zap${i}`));
  }
  const height = 1.7;
  const bolts = [0, 1, 2, 3].map((i) => bolt(stage, rig.root, height, `zapBolt${i}`));
  const base = rig.root.position.clone();
  const fallState = { vy: 0 };
  let flicker = 0;
  let charred = false;
  let down = false;
  let ash: Mesh | null = null;
  const ZAP = 1.4;
  let crumbleAt = Infinity;
  const show: Show = new Show((t, dt) => {
    if (t < ZAP) {
      // Lit up like a Christmas tree: flashing between skin and bones.
      const xray = Math.floor(t * 11) % 2 === 1;
      for (const m of rig.meshes) m.isVisible = !xray;
      for (const b of skeleton) b.isVisible = xray;
      for (const sh of shells) {
        sh.material = xray ? xrayGlow : zap;
        sh.visibility = xray ? 1 : rand(0.5, 1);
      }
      rig.root.position.set(base.x + rand(-0.04, 0.04) * s, base.y + rand(0, 0.05) * s, base.z + rand(-0.04, 0.04) * s);
      for (const [i, arm] of rig.arms.entries()) {
        arm.rotation.x = -Math.PI * 0.9 + rand(-0.15, 0.15);
        arm.rotation.z = (i ? -1 : 1) * (0.5 + rand(-0.1, 0.1));
      }
      for (const [i, leg] of rig.legs.entries()) leg.rotation.z = (i ? -1 : 1) * 0.2;
      flicker -= dt;
      if (flicker <= 0) {
        flicker = 0.06;
        for (const b of bolts) {
          b.isVisible = Math.random() < 0.75;
          b.rotation.y = rand(0, Math.PI * 2);
          b.scaling.set(rand(0.7, 1.3), rand(0.8, 1.1), Math.random() < 0.5 ? -1 : 1);
        }
      }
      return true;
    }
    if (!charred) {
      // Burnt to a crisp: the shells go black, smoke curls off.
      charred = true;
      for (const m of rig.meshes) m.isVisible = true;
      for (const b of skeleton) b.isVisible = false;
      for (const b of bolts) b.isVisible = false;
      const soot = stage.mats.dark('#15110e');
      for (const sh of shells) {
        sh.material = soot;
        sh.visibility = 1;
        sh.scaling.setAll(0.97);
      }
      for (const arm of rig.arms) arm.rotation.x = -Math.PI * 0.9;
      for (let i = 0; i < 4; i++) {
        show.add(smoke(stage, centerOf(rig.body!.mesh).add(new Vector3(rand(-0.2, 0.2), rand(0, 0.6), rand(-0.2, 0.2)).scale(s)), 0.3 * s, rand(0.7, 1.1)));
      }
      show.add(puff(stage, centerOf(rig.body!.mesh), '#fff36b', 0.3 * s, 0.15, 0.8));
    }
    if (!down) {
      down = !rig.flying || fall(rig, stage, fallState, dt);
      if (!down) return true;
      crumbleAt = t + (rig.flying ? 0.1 : 0.4);
    }
    if (t < crumbleAt) return true;
    // ...and crumbles into a pile of ash.
    const k = (t - crumbleAt) / 0.45;
    if (!ash) {
      const p = rig.root.position;
      ash = show.own(MeshBuilder.CreateCylinder('ash', { height: 0.3, diameterTop: 0.05, diameterBottom: 0.75, tessellation: 10 }, stage.scene));
      ash.material = stage.mats.dark('#3a3532');
      ash.isPickable = false;
      ash.position.set(p.x, stage.terrain.terrainHeight(p.x, p.z), p.z);
      ash.scaling.set(s, 0.01, s);
      for (let i = 0; i < 3; i++) show.add(smoke(stage, ash.position.add(new Vector3(0, 0.3 * s, 0)), 0.35 * s));
    }
    rig.root.scaling.set(s * (1 + 0.3 * Math.min(1, k)), s * Math.max(0.01, 1 - k), s * (1 + 0.3 * Math.min(1, k)));
    ash.scaling.y = s * Math.min(1, k);
    // The ash settles, then sinks away.
    ash.position.y = stage.terrain.terrainHeight(ash.position.x, ash.position.z) + 0.15 * s * Math.min(1, k) - Math.max(0, k - 2.5) * 0.25;
    if (k >= 1) rig.root.setEnabled(false);
    return k < 4;
  });
  show.own(rig.root);
  return show;
}

// ----------------------------------------------------------------------------
//  Jetpack Zombie: the pack blows up and fires it at the camera
// ----------------------------------------------------------------------------

function jetpackBlast(rig: Rig, stage: DeathStage): DeathEffect {
  const pack = rig.pack!;
  const s = rig.scale;
  const flames = pack.node.getChildMeshes(false).filter((m) => m !== pack.mesh);
  const SPUTTER = 0.4;
  let blown = false;
  let sparks = 0;
  const show: Show = new Show((t, dt) => {
    if (t < SPUTTER) {
      // Coughing and spluttering: the flames flicker out, the pack shakes.
      for (const f of flames) f.scaling.y = Math.random() < 0.4 ? 0.1 : rand(0.6, 1.6);
      pack.mesh.scaling.setAll(1 + (t / SPUTTER) * 0.35 + Math.sin(t * 80) * 0.05);
      rig.root.rotation.z = Math.sin(t * 50) * 0.12;
      rig.root.position.y -= dt * 0.6;
      sparks -= dt;
      if (sparks <= 0) {
        sparks = 0.07;
        show.add(puff(stage, centerOf(pack.mesh), Math.random() < 0.5 ? '#ff8a3d' : '#ffe14d', 0.18, 0.2));
      }
      return true;
    }
    if (blown) return false;
    blown = true;
    // KABOOM.
    const at = centerOf(pack.mesh);
    show.add(puff(stage, at, '#ffe14d', 0.9 * s, 0.35, 2));
    show.add(puff(stage, at, '#ff6a2a', 1.4 * s, 0.5, 1.6));
    for (let i = 0; i < 3; i++) show.add(smoke(stage, at.add(randomSpin(0.3)), 0.5 * s, rand(0.8, 1.3)));
    stage.shake(0.2);
    pack.mesh.scaling.setAll(1);
    const loosePack = detachPiece(pack, stage.scene);
    show.add(new Tumble(loosePack, new Vector3(rand(-3, 3), rand(5, 8), rand(-3, 3)), randomSpin(15), stage.terrain, 0.1));
    for (let i = 0; i < 8; i++) {
      show.add(fleck(stage, at, new Vector3(rand(-5, 5), rand(1, 7), rand(-5, 5)), i % 2 ? '#bbbbcc' : '#ff8a3d', rand(0.06, 0.13), rand(0.5, 0.9)));
    }
    // And off it goes, tumbling, smoking and flailing, straight at the player.
    rig.root.rotation.z = 0;
    const body = detach(rig.root, new Vector3(0, 0.85, 0), stage.scene);
    let trail = 0;
    show.add(new ScreenHit(body, stage, {
      flight: 0.9, distance: 2.3 * s, arc: 1.2,
      onFly: (ft) => {
        for (const [i, arm] of rig.arms.entries()) arm.rotation.x = -Math.PI / 2 + Math.sin(ft * 30 + i * 2) * 1.1;
        for (const [i, leg] of rig.legs.entries()) leg.rotation.x = Math.sin(ft * 26 + i * 3) * 0.9;
        trail -= 1 / 60;
        if (trail <= 0) {
          trail = 0.05;
          show.add(smoke(stage, body.position, 0.3, 0.6));
        }
      },
    }));
    return false;
  });
  return show;
}

// ----------------------------------------------------------------------------
//  Riot Shield Bot: squished flat by its own shield
// ----------------------------------------------------------------------------

function shieldSquish(rig: Rig, stage: DeathStage): DeathEffect {
  const s = rig.scale;
  const root = rig.root;
  const head = rig.head!.node;
  const ground = () => stage.terrain.terrainHeight(root.position.x, root.position.z);
  let shield: TransformNode | null = null;
  let from: { pos: Vector3; rot: Quaternion } | null = null;
  let flat: Quaternion | null = null;
  let landed = false;
  const WOBBLE = 0.3, LIFT = 0.75, HANG = 0.9, SLAM = 1.05, SINK = 2.3, END = 3;
  const bodyHeight = 1.9 * s;
  const squash = 0.12;
  const show: Show = new Show((t) => {
    if (t < WOBBLE) {
      // The shield wobbles loose, and it looks up. Uh oh.
      rig.shield!.node.rotation.x = Math.sin(t * 45) * 0.12;
      head.rotation.x = -0.5 * smooth(t / WOBBLE);
      return true;
    }
    if (!shield) {
      rig.shield!.node.rotation.x = 0;
      shield = show.own(detachPiece(rig.shield!, stage.scene));
      from = { pos: shield.position.clone(), rot: shield.rotationQuaternion!.clone() };
      // Lying face-down, square to the way it was facing.
      flat = from.rot.multiply(Quaternion.RotationAxis(Axis.X, Math.PI / 2));
    }
    const over = new Vector3(root.position.x, 0, root.position.z);
    const top = ground() + bodyHeight + 1.1 * s;
    const rest = ground() + bodyHeight * squash + 0.04;
    if (t < LIFT) {
      // Up it floats over its head, turning flat...
      const k = smooth((t - WOBBLE) / (LIFT - WOBBLE));
      shield.position.set(
        from!.pos.x + (over.x - from!.pos.x) * k,
        from!.pos.y + (top - from!.pos.y) * k,
        from!.pos.z + (over.z - from!.pos.z) * k,
      );
      Quaternion.SlerpToRef(from!.rot, flat!, k, shield.rotationQuaternion!);
      return true;
    }
    if (t < HANG) {
      // ...hangs there for a cartoon beat...
      shield.position.y = top + Math.sin((t - LIFT) * 30) * 0.02;
      return true;
    }
    if (t < SLAM) {
      // ...and SLAM.
      const k = (t - HANG) / (SLAM - HANG);
      shield.position.y = top + (rest - top) * k * k * k;
      return true;
    }
    if (!landed) {
      landed = true;
      show.add(dustRing(stage, over.x, over.z, 2 * s));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        show.add(smoke(stage, new Vector3(over.x + Math.cos(a) * 0.6 * s, ground() + 0.1, over.z + Math.sin(a) * 0.6 * s), 0.3 * s, 0.6));
      }
      stage.shake(0.2);
      head.rotation.x = 0;
    }
    const b = t - SLAM;
    // Squashed flat (with a springy cartoon overshoot), the shield rocking on top like a dropped tray.
    const spring = Math.exp(-b * 9) * Math.cos(b * 30);
    root.scaling.set(s * (1.5 - 0.2 * spring), s * squash * (1 + 0.8 * spring), s * (1.5 - 0.2 * spring));
    const tilt = 0.14 * Math.exp(-b * 3.5);
    const spin = b * 22;
    Quaternion.RotationYawPitchRoll(0, tilt * Math.cos(spin), tilt * Math.sin(spin)).multiplyToRef(flat!, shield.rotationQuaternion!);
    shield.position.y = rest + Math.abs(Math.sin(b * 18)) * 0.12 * Math.exp(-b * 7);
    if (t > SINK) {
      root.position.y = ground() - (t - SINK) * 1.6;
      shield.position.y = rest - (t - SINK) * 1.6;
    }
    return t < END;
  });
  show.own(root);
  return show;
}

// ----------------------------------------------------------------------------
//  Orbital Laser Strike: blown to bits, some at the screen
// ----------------------------------------------------------------------------

function shatter(rig: Rig, stage: DeathStage, blast: { x: number; z: number }, toCamera: number): DeathEffect {
  const s = rig.scale;
  const color = ZOMBIES[rig.type].color;
  // The head first (best for the player to see), then whatever else.
  const order = [...rig.pieces].sort((a, b) => (a.role === 'head' ? -1 : b.role === 'head' ? 1 : Math.random() - 0.5));
  const show = new Show(() => false);
  for (const [i, p] of order.entries()) {
    const pivot = detachPiece(p, stage.scene);
    show.add(puff(stage, pivot.position, i % 2 ? '#ffcc66' : color, 0.35 * s, 0.3));
    if (i < toCamera) {
      const e = extent(p.mesh);
      const size = Math.max(e.x, e.y, e.z) * 2 * pivot.scaling.x;
      show.add(new ScreenHit(pivot, stage, { delay: rand(0.05, 0.25), flight: rand(0.7, 0.95), distance: 1.2 + size * 2.2, arc: rand(1.5, 3) }));
      continue;
    }
    const out = pivot.position.subtract(new Vector3(blast.x, pivot.position.y, blast.z));
    if (out.lengthSquared() < 1e-3) out.set(rand(-1, 1), 0, rand(-1, 1));
    out.normalize();
    const vel = out.scale(rand(4, 9)).add(new Vector3(rand(-1.5, 1.5), rand(7, 12), rand(-1.5, 1.5)));
    show.add(new Tumble(pivot, vel, randomSpin(18), stage.terrain, 0.08 * s, rand(2.2, 2.8)));
  }
  // Scorched bits fly everywhere too.
  const mid = centerOf(rig.body!.mesh);
  for (let i = 0; i < 10; i++) {
    show.add(fleck(stage, mid, new Vector3(rand(-6, 6), rand(3, 10), rand(-6, 6)), i % 3 ? color : '#ff4466', rand(0.06, 0.14) * s, rand(0.6, 1.1)));
  }
  rig.root.dispose();
  return show;
}
