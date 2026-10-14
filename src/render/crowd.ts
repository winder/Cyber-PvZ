import {
  Matrix, Mesh, Quaternion, Scene, Vector3,
} from '@babylonjs/core';
import { ZOMBIES, type ZombieId } from '../data/config';
import { MODELS, skinUnits } from '../models/models';
import { skinUrl } from '../skins';
import { UNIT, buildPartMesh, loadSkinTexture, skinMaterial } from './blockModel';
import { dancePose, newPose, type FanMove, type Pose } from './dance';

// A packed house: hundreds of zombified fans rocking out in the seats. Each
// is a blocky humanoid, drawn as thin instances (a handful of draw calls for
// the lot) and posed by hand every few frames. Looks only.

/** Whose skins the fans wear (the editor's custom skins too). */
const FAN_SKINS: ZombieId[] = ['cyborg', 'tombstone', 'roadie', 'biker', 'gardener'];

export interface FanSpot {
  x: number;
  /** Height of the floor it stands on. */
  y: number;
  z: number;
  /** Which way it faces (radians, 0 = +x, like the sim's angles). */
  facing: number;
  move: FanMove;
  /** Which bit of the stands (they sink out of the way of the camera together). */
  section: number;
}

interface Fan extends FanSpot {
  skin: number;
  /** Index among its skin's instances. */
  slot: number;
  scale: number;
  phase: number;
  speed: number;
}

const ROLES = ['head', 'body', 'armR', 'armL', 'legR', 'legL'] as const;

export class Crowd {
  private fans: Fan[] = [];
  /** Per skin: one mesh per part, and its matrix buffer. */
  private meshes: { mesh: Mesh; buffer: Float32Array }[][] = [];
  private pose: Pose = newPose();
  private cursor = 0;
  private rand: () => number;
  // Scratch, so nothing's allocated per frame.
  private q = new Quaternion();
  private root = new Matrix();
  private joint = new Matrix();
  private tmp = new Matrix();
  private out = new Matrix();
  private offsets: Matrix[];
  private pivots: Vector3[];
  private scaleV = new Vector3();
  private pos = new Vector3();
  private one = new Vector3(1, 1, 1);

  constructor(private scene: Scene, seed = 99) {
    let a = seed;
    this.rand = () => {
      a = (a * 1664525 + 1013904223) >>> 0;
      return a / 4294967296;
    };
    const parts = MODELS.humanoid.parts;
    this.offsets = ROLES.map((r) => {
      const p = parts.find((d) => d.role === r)!;
      return Matrix.Translation(p.offset[0] * UNIT, p.offset[1] * UNIT, p.offset[2] * UNIT);
    });
    this.pivots = ROLES.map((r) => {
      const p = parts.find((d) => d.role === r)!;
      return new Vector3(p.pivot[0] * UNIT, p.pivot[1] * UNIT, p.pivot[2] * UNIT);
    });
  }

  add(spot: FanSpot): void {
    const skin = Math.floor(this.rand() * FAN_SKINS.length);
    this.fans.push({
      ...spot, skin, slot: 0,
      scale: 0.9 + this.rand() * 0.25,
      phase: this.rand() * 10,
      speed: 0.8 + this.rand() * 0.45,
    });
  }

  get count(): number {
    return this.fans.length;
  }

  /** Make the meshes, once every fan's been added. */
  build(): void {
    const glow = this.scene.getGlowLayerByName('glow');
    const counts = FAN_SKINS.map(() => 0);
    for (const f of this.fans) f.slot = counts[f.skin]++;
    this.meshes = FAN_SKINS.map((type, s) => {
      const def = ZOMBIES[type];
      const tex = loadSkinTexture(skinUrl(type, def.skin ?? ''), this.scene);
      const mat = skinMaterial(`crowd-${type}`, tex, this.scene);
      return ROLES.map((role) => {
        const part = MODELS.humanoid.parts.find((p) => p.role === role)!;
        const mesh = buildPartMesh(`crowd-${type}-${role}`, part, this.scene, skinUnits('humanoid'));
        mesh.material = mat;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
        glow?.addExcludedMesh(mesh);
        const buffer = new Float32Array(Math.max(1, counts[s]) * 16);
        mesh.thinInstanceSetBuffer('matrix', buffer, 16, false);
        if (counts[s] === 0) mesh.setEnabled(false);
        return { mesh, buffer };
      });
    });
    for (let i = 0; i < this.fans.length; i++) this.place(this.fans[i], 0, 1, () => 1);
    for (const parts of this.meshes) for (const { mesh } of parts) mesh.thinInstanceBufferUpdated('matrix');
  }

  /**
   * Animate. `energy` livens everyone up (an encore, the boss walking in);
   * `drop(section)` is how far up that part of the stands is (1 = all the way).
   * Only some of the fans are posed each frame, in turn.
   */
  update(time: number, energy: number, drop: (section: number) => number, share = 0.5): void {
    const n = this.fans.length;
    if (!n) return;
    const count = Math.ceil(n * share);
    for (let k = 0; k < count; k++) {
      this.place(this.fans[this.cursor], time, energy, drop);
      this.cursor = (this.cursor + 1) % n;
    }
    for (const parts of this.meshes) for (const { mesh } of parts) mesh.thinInstanceBufferUpdated('matrix');
  }

  private place(f: Fan, time: number, energy: number, drop: (section: number) => number): void {
    const pose = dancePose(f.move, time * f.speed + f.phase, this.pose, energy);
    const up = drop(f.section);
    // The body, turned to face its way, tipped, lifted.
    Quaternion.RotationYawPitchRollToRef(Math.PI / 2 - f.facing, pose.tilt, 0, this.q);
    this.scaleV.set(f.scale, f.scale, f.scale);
    this.pos.set(f.x, f.y * up + pose.lift * UNIT * f.scale, f.z);
    Matrix.ComposeToRef(this.scaleV, this.q, this.pos, this.root);
    const parts = this.meshes[f.skin];
    for (let i = 0; i < ROLES.length; i++) {
      const r = pose[ROLES[i]];
      Quaternion.RotationYawPitchRollToRef(r[1], r[0], r[2], this.q);
      Matrix.ComposeToRef(this.one, this.q, this.pivots[i], this.joint);
      this.offsets[i].multiplyToRef(this.joint, this.tmp);
      this.tmp.multiplyToRef(this.root, this.out);
      this.out.copyToArray(parts[i].buffer, f.slot * 16);
    }
  }
}
