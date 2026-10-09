import {
  Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3,
} from '@babylonjs/core';
import { UNIT } from './blockModel';

// The Ship Captain's parrot. Looks only (ADR 0002): it rides on his shoulder,
// now and then takes off for a few laps round his head before landing again,
// and flies away to safety when he's nearly beaten. Built in skin units, like
// the models, so it scales with whoever it rides on.

/** He's this badly hurt (fraction of health left) when the parrot leaves. */
const FLEE_AT = 0.2;
/** Seconds on the shoulder between flights. */
const PERCH_MIN = 5, PERCH_MAX = 11;
/** Seconds spent circling. */
const LOOP_MIN = 3.5, LOOP_MAX = 6;
const TAKEOFF = 0.7, LANDING = 1.1;

function material(scene: Scene, key: string, hex: string, glow = 0.15): StandardMaterial {
  const found = scene.getMaterialByName(key) as StandardMaterial | null;
  if (found) return found;
  const m = new StandardMaterial(key, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.emissiveColor = Color3.FromHexString(hex).scale(glow);
  m.specularColor = new Color3(0.1, 0.1, 0.1);
  return m;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const smooth = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

type State = 'perched' | 'takeoff' | 'circling' | 'landing' | 'fleeing';

export class Parrot {
  /** The bird itself (moves between the perch and the world). */
  readonly root: TransformNode;
  private body: TransformNode;
  private head: TransformNode;
  private wings: TransformNode[] = [];
  private tail: TransformNode;
  private state: State = 'perched';
  private timer = rand(PERCH_MIN * 0.5, PERCH_MAX);
  private time = Math.random() * 10;
  /** Where the circling is centered (above the captain's head), and how far round it is. */
  private loop = { angle: 0, radius: 0, height: 0, dir: 1 };
  private from = Vector3.Zero();
  private fleeDir = Vector3.Zero();
  private lastPos = Vector3.Zero();

  /**
   * `perch`: a node on the captain's shoulder. `center`: the captain, to
   * circle round.
   */
  constructor(scene: Scene, name: string, private perch: TransformNode, private center: TransformNode) {
    const red = material(scene, 'parrotRed', '#e3262c', 0.2);
    const yellow = material(scene, 'parrotYellow', '#ffcf1f', 0.25);
    const blue = material(scene, 'parrotBlue', '#1f6fe0', 0.25);
    const beak = material(scene, 'parrotBeak', '#f2e6c8', 0.1);
    const black = material(scene, 'parrotBlack', '#111111', 0);
    const white = material(scene, 'parrotWhite', '#ffffff', 0.4);

    const box = (n: string, w: number, h: number, d: number, parent: TransformNode, x: number, y: number, z: number, m: StandardMaterial): Mesh => {
      const mesh = MeshBuilder.CreateBox(`${name}-${n}`, { width: w * UNIT, height: h * UNIT, depth: d * UNIT }, scene);
      mesh.parent = parent;
      mesh.position.set(x * UNIT, y * UNIT, z * UNIT);
      mesh.material = m;
      mesh.isPickable = false;
      return mesh;
    };
    const joint = (n: string, parent: TransformNode, x: number, y: number, z: number): TransformNode => {
      const j = new TransformNode(`${name}-${n}`, scene);
      j.parent = parent;
      j.position.set(x * UNIT, y * UNIT, z * UNIT);
      return j;
    };

    this.root = new TransformNode(name, scene);
    this.root.parent = perch;
    // A scarlet macaw, about a third of a skin-unit humanoid's height. Faces +z.
    this.body = joint('body', this.root, 0, 0, 0);
    box('torso', 2.6, 3.6, 2.4, this.body, 0, 2.4, 0, red);
    box('belly', 2.2, 2, 0.4, this.body, 0, 2, 1.25, red);
    // Feet gripping the shoulder.
    for (const x of [-0.7, 0.7]) box(`foot${x}`, 0.6, 0.8, 1, this.body, x, 0.4, 0.2, black);
    this.head = joint('head', this.body, 0, 4.2, 0.3);
    box('skull', 2.4, 2.4, 2.4, this.head, 0, 1, 0, red);
    box('face', 1.6, 1.2, 0.3, this.head, 0, 1, 1.25, white);
    for (const x of [-1.25, 1.25]) {
      box(`eye${x}`, 0.2, 0.6, 0.6, this.head, x, 1.3, 0.5, black);
    }
    box('beakTop', 1, 1, 1.4, this.head, 0, 0.8, 1.8, beak);
    box('beakTip', 0.8, 0.9, 0.6, this.head, 0, 0.2, 2.2, beak);
    box('crest', 0.6, 0.8, 1.6, this.head, 0, 2.5, -0.4, red);
    // Wings: yellow at the shoulder, blue flight feathers.
    for (const side of [-1, 1]) {
      const wing = joint(`wing${side}`, this.body, side * 1.3, 3.8, 0);
      box(`wingTop${side}`, 0.5, 1.6, 2.4, wing, side * 0.25, -0.8, 0, yellow);
      box(`wingTip${side}`, 0.5, 2.4, 2.2, wing, side * 0.25, -2.7, -0.2, blue);
      this.wings.push(wing);
    }
    // Long tail feathers.
    this.tail = joint('tail', this.body, 0, 1.2, -1.1);
    box('tailRed', 1.4, 0.4, 4, this.tail, 0, 0, -2, red);
    box('tailBlue', 1, 0.4, 2, this.tail, 0, -0.1, -4.6, blue);
    this.tail.rotation.x = -0.9;
  }

  /** True once it has flown off for good. */
  get gone(): boolean {
    return this.state === 'fleeing';
  }

  /** Every frame while the captain lives. `health`: how much he has left (0 → 1). */
  tick(dt: number, health: number): void {
    if (this.state === 'fleeing') return;
    if (health < FLEE_AT) {
      this.flee();
      return;
    }
    this.time += dt;
    this.timer -= dt;
    switch (this.state) {
      case 'perched': this.perched(); break;
      case 'takeoff': this.takeoff(); break;
      case 'circling': this.circling(dt); break;
      case 'landing': this.landing(); break;
    }
  }

  /** Off it goes, up and away, squawking. Wherever it is. */
  flee(): void {
    if (this.state === 'fleeing') return;
    if (this.root.parent) this.unperch();
    this.state = 'fleeing';
    this.timer = 0;
    const a = Math.random() * Math.PI * 2;
    this.fleeDir = new Vector3(Math.cos(a), 0, Math.sin(a));
  }

  /** As an effect, after it has fled: keep flying away, then vanish. */
  update(dt: number): boolean {
    this.time += dt;
    this.timer += dt;
    const t = this.timer;
    // Climbing hard, then soaring off, faster and faster.
    const speed = 3 + t * 4;
    const p = this.root.position;
    p.addInPlace(this.fleeDir.scale(speed * dt));
    p.y += (6 - Math.min(4, t * 2)) * dt;
    this.root.rotation.set(-0.3, Math.atan2(this.fleeDir.x, this.fleeDir.z), Math.sin(t * 3) * 0.2);
    this.flap(18, 1.1);
    this.head.rotation.y = Math.sin(t * 9) * 0.5; // looking back
    return t < 5;
  }

  dispose(): void {
    this.root.dispose();
  }

  // --------------------------------------------------------------------------

  private perched(): void {
    const t = this.time;
    // Shifting about, bobbing its head, and the odd shake of the wings.
    this.head.rotation.y = Math.sin(t * 0.9) * 0.6 + (Math.sin(t * 5.3) > 0.85 ? 0.4 : 0);
    this.head.rotation.x = Math.max(0, Math.sin(t * 3.1)) * 0.25;
    this.body.rotation.x = 0;
    const flutter = Math.sin(t * 0.7) > 0.93 ? Math.abs(Math.sin(t * 30)) * 0.8 : 0;
    this.flap(0, 0, flutter);
    if (this.timer > 0) return;
    // Take off.
    this.unperch();
    this.state = 'takeoff';
    this.timer = TAKEOFF;
    this.from = this.root.position.clone();
    const c = this.center.position;
    this.loop = {
      angle: Math.atan2(this.from.z - c.z, this.from.x - c.x),
      radius: rand(2.5, 3.5),
      height: rand(4.6, 5.6),
      dir: Math.random() < 0.5 ? 1 : -1,
    };
  }

  private takeoff(): void {
    const k = smooth(1 - this.timer / TAKEOFF);
    this.place(Vector3.Lerp(this.from, this.loopPoint(), k));
    this.flap(16, 1.2);
    if (this.timer <= 0) {
      this.state = 'circling';
      this.timer = rand(LOOP_MIN, LOOP_MAX);
    }
  }

  private circling(dt: number): void {
    this.loop.angle += this.loop.dir * dt * 1.6;
    this.place(this.loopPoint());
    // Banking into the turn.
    this.root.rotation.z = -this.loop.dir * 0.4;
    this.flap(12, 1);
    if (this.timer <= 0) {
      this.state = 'landing';
      this.timer = LANDING;
      this.from = this.root.position.clone();
    }
  }

  private landing(): void {
    const k = smooth(1 - this.timer / LANDING);
    const seat = this.perch.getAbsolutePosition();
    // Swoop down onto the shoulder (it moves; aim for where it is now).
    const p = Vector3.Lerp(this.from, seat, k);
    p.y += Math.sin(k * Math.PI) * 0.5;
    this.place(p);
    this.flap(k > 0.75 ? 22 : 10, k > 0.75 ? 1.3 : 0.9); // braking with a flurry
    if (this.timer > 0) return;
    // Back on the shoulder.
    this.root.parent = this.perch;
    this.root.position.setAll(0);
    this.root.rotation.setAll(0);
    this.root.scaling.setAll(1);
    this.state = 'perched';
    this.timer = rand(PERCH_MIN, PERCH_MAX);
  }

  /** Leave the shoulder, keeping where it is in the world. */
  private unperch(): void {
    this.perch.computeWorldMatrix(true);
    this.root.computeWorldMatrix(true);
    this.root.setParent(null);
    // Upright in the world, whatever the shoulder was doing.
    this.root.rotationQuaternion = null;
    this.root.rotation.set(0, this.root.rotation.y, 0);
    this.lastPos = this.root.position.clone();
  }

  private loopPoint(): Vector3 {
    const c = this.center.position;
    return new Vector3(
      c.x + Math.cos(this.loop.angle) * this.loop.radius,
      c.y + this.loop.height + Math.sin(this.time * 2) * 0.2,
      c.z + Math.sin(this.loop.angle) * this.loop.radius,
    );
  }

  /** Move in the world, facing the way it's going. */
  private place(p: Vector3): void {
    const dx = p.x - this.lastPos.x, dz = p.z - this.lastPos.z;
    if (Math.hypot(dx, dz) > 1e-4) this.root.rotation.y = Math.atan2(dx, dz);
    this.root.position.copyFrom(p);
    this.lastPos.copyFrom(p);
    this.root.rotation.x = 0.15;
    this.head.rotation.set(-0.15, 0, 0);
  }

  /** Beat the wings `rate` times a second, `amount` radians each way (or hold them out by `open`). */
  private flap(rate: number, amount: number, open = 0): void {
    const beat = rate > 0 ? (Math.sin(this.time * rate) * 0.5 + 0.5) * amount : open;
    for (const [i, w] of this.wings.entries()) {
      const side = i === 0 ? -1 : 1;
      w.rotation.z = side * beat * 1.4;
    }
    this.tail.rotation.x = rate > 0 ? -0.2 : -0.9;
  }
}
