import {
  Color3, Color4, Constants, DynamicTexture, Engine, GlowLayer, Matrix, Mesh, MeshBuilder, ParticleSystem, PointLight, Quaternion,
  Scene, StandardMaterial, TransformNode, Vector3, VertexBuffer,
} from '@babylonjs/core';
import { SEAT_ROW_DEPTH, type MapDef, type SeatRow } from '../data/config';
import { insideRect } from '../sim/arena';
import type { SimEvent } from '../sim/game';
import type { BlockCharacter } from './blockModel';
import { Crowd } from './crowd';
import { dancePose, newPose, type FanMove, type Pose } from './dance';
import { canvasTexture, material, merge, rng, softDot, type Decor } from './decor';
import { buildGuitar } from './rock';
import type { Terrain } from './terrain';
import { createZombieVisual, type Materials } from './visuals';

// Scenery for the Hellfire Arena: a sold-out rock concert. Stands packed
// with zombified fans wrap round the fan-shaped floor; rows of seats stand at
// odd angles on it, full of more fans. A zombie band plays on the stage's
// wings in front of a wall of amps; speaker and lighting towers stand at the
// back, their spotlights dashing across the floor; lasers sweep over
// everything and fire shoots up on the beat. All for looks: the stands and
// the seats are obstacles to the rules (src/sim/arena.ts).

const BPM = 128;
const BEAT = 60 / BPM;
const NEON = ['#ff2fd0', '#4de6ff', '#3cff6e', '#ffe14d', '#ff5a2a'];

/** How the stands rise from the edge of the floor. */
const TIERS = 5;
const TIER_DEPTH = 1.35;
const FRONT_WALL = 1.0;
const tierOffset = (k: number) => 0.6 + k * TIER_DEPTH;
const tierHeight = (k: number) => 1.25 + k * 0.85;
/** The upper bowl: a steep bank of crowd above the tiers. */
const BOWL_IN = tierOffset(TIERS) + 0.2, BOWL_OUT = BOWL_IN + 13;
const BOWL_LOW = tierHeight(TIERS - 1) + 0.6, BOWL_HIGH = BOWL_LOW + 10;
/** Stands start this far out from the fan's center along the sides (the stage wings are nearer in). */
const SIDE_START = 47;

const hex = (c: string) => Color3.FromHexString(c);

// ----------------------------------------------------------------------------
//  Textures
// ----------------------------------------------------------------------------

/** A far-off bank of fans: rows of heads and shoulders, arms up, phone lights. */
function bowlTexture(scene: Scene) {
  const tex = canvasTexture(scene, 'bowlCrowd', 1024, 256, (g) => {
    const rand = rng(777);
    g.fillStyle = '#0d0a12';
    g.fillRect(0, 0, 1024, 256);
    const shirts = ['#3a1f4a', '#1f2a4a', '#4a1f25', '#202020', '#2f4a1f', '#4a3a1f', '#5a1f4a'];
    const skin = ['#7d9b63', '#6f8c5e', '#8fae7a', '#5b6e4a', '#9aa07a'];
    for (let row = 0; row < 16; row++) {
      const y = 8 + row * 16;
      for (let x = (row % 2) * 5; x < 1024; x += 9 + rand() * 3) {
        g.fillStyle = shirts[Math.floor(rand() * shirts.length)];
        g.fillRect(x - 3.5, y + 3, 7, 9);
        g.fillStyle = skin[Math.floor(rand() * skin.length)];
        g.fillRect(x - 2.5, y - 3, 5, 6);
        if (rand() < 0.3) g.fillRect(x + (rand() < 0.5 ? -5 : 4), y - 9, 2, 10); // an arm up
        if (rand() < 0.06) {
          g.fillStyle = rand() < 0.5 ? '#fff6c8' : '#9fe8ff'; // a phone light
          g.fillRect(x - 1, y - 11, 3, 3);
        }
      }
    }
  });
  tex.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
  return tex;
}

/** LED ad boards round the front of the stands, scrolling. */
function adTexture(scene: Scene) {
  const tex = canvasTexture(scene, 'adBoards', 2048, 64, (g) => {
    g.fillStyle = '#05030a';
    g.fillRect(0, 0, 2048, 64);
    const ads: [string, string][] = [
      ['HELLFIRE TOUR', '#ff5a2a'], ['ZOMBIES ROCK', '#3cff6e'], ['BRAAAINS', '#ff2fd0'],
      ['MOSH RESPONSIBLY', '#ffe14d'], ['CYBER COLA', '#4de6ff'], ['NO PLANTS IN THE PIT', '#ffffff'],
    ];
    g.font = 'bold 40px Impact, Arial Black, sans-serif';
    g.textBaseline = 'middle';
    let x = 20;
    for (const [text, color] of ads) {
      g.fillStyle = color;
      g.fillText(text, x, 34);
      x += g.measureText(text).width + 30;
      g.fillStyle = '#ffffff';
      g.fillText('★', x, 34);
      x += 70;
    }
  });
  tex.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
  return tex;
}

/** The front of an amp cabinet: grille cloth, gold piping, a logo plate. */
function cabTexture(scene: Scene) {
  return canvasTexture(scene, 'ampCab', 256, 256, (g) => {
    g.fillStyle = '#141414';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#2a2622';
    g.fillRect(14, 14, 228, 228);
    // Basket weave.
    for (let y = 14; y < 242; y += 4) for (let x = 14 + (y % 8 ? 2 : 0); x < 242; x += 4) {
      g.fillStyle = (x + y) % 8 ? '#3b3530' : '#24201c';
      g.fillRect(x, y, 2, 2);
    }
    // The speaker cones showing through.
    for (const [cx, cy] of [[78, 78], [178, 78], [78, 178], [178, 178]]) {
      const grad = g.createRadialGradient(cx, cy, 4, cx, cy, 46);
      grad.addColorStop(0, 'rgba(0,0,0,0.5)');
      grad.addColorStop(0.8, 'rgba(0,0,0,0.25)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(cx - 50, cy - 50, 100, 100);
    }
    g.strokeStyle = '#c9a227';
    g.lineWidth = 4;
    g.strokeRect(12, 12, 232, 232);
    g.fillStyle = '#e6d7a8';
    g.fillRect(84, 20, 88, 22);
    g.fillStyle = '#7a1010';
    g.font = 'italic bold 18px Georgia, serif';
    g.textAlign = 'center';
    g.fillText('Hellshall', 128, 37);
  });
}

/** The banner across the top of the amp wall. */
function backdropTexture(scene: Scene) {
  return canvasTexture(scene, 'backdrop', 1024, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#120006');
    grad.addColorStop(1, '#3a0508');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 256);
    // Flames along the bottom.
    for (const [color, h] of [['#c4160c', 120], ['#ff6a10', 80], ['#ffd23a', 40]] as const) {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, 256);
      for (let x = 0; x <= 1024; x += 32) {
        g.quadraticCurveTo(x + 8, 256 - h * 0.3, x + 16, 256 - h * (0.6 + 0.4 * Math.sin(x)));
        g.quadraticCurveTo(x + 22, 256 - h * 0.4, x + 32, 256 - h * 0.1);
      }
      g.lineTo(1024, 256);
      g.fill();
    }
    g.textAlign = 'center';
    g.font = 'bold 120px Impact, Arial Black, sans-serif';
    g.lineWidth = 10;
    g.strokeStyle = '#000000';
    g.strokeText('HELLFIRE', 512, 120);
    g.fillStyle = '#ffd23a';
    g.fillText('HELLFIRE', 512, 120);
    g.font = 'bold 44px Impact, Arial Black, sans-serif';
    g.fillStyle = '#ffffff';
    g.fillText('★ WORLD TOUR ★ ONE NIGHT ONLY ★', 512, 175);
  });
}

// ----------------------------------------------------------------------------
//  Little builders
// ----------------------------------------------------------------------------

function box(scene: Scene, name: string, w: number, h: number, d: number, x: number, y: number, z: number, yaw = 0): Mesh {
  const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  m.isPickable = false;
  return m;
}

function glowMat(scene: Scene, name: string, color: string, alpha = 1): StandardMaterial {
  return material(scene, name, (m) => {
    m.emissiveColor = hex(color);
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
    m.alpha = alpha;
  });
}

/** Soft additive light (beams, pools): no depth writes, no bloom. */
function lightMat(scene: Scene, name: string, opacity?: DynamicTexture): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.emissiveColor = Color3.White();
  m.diffuseColor = Color3.Black();
  m.disableLighting = true;
  m.alphaMode = Engine.ALPHA_ADD;
  m.disableDepthWrite = true;
  m.backFaceCulling = false;
  if (opacity) m.opacityTexture = opacity;
  return m;
}

/** Turn a plane (which shows its face toward -z) to face the way (dx, dz). */
function faceToward(mesh: Mesh, dx: number, dz: number): void {
  mesh.rotation.y = Math.atan2(-dx, -dz);
}

/** Yaw that turns a box's length (local x) to run from a to b. */
function yawAlong(ax: number, az: number, bx: number, bz: number): number {
  return -Math.atan2(bz - az, bx - ax);
}

/** A square truss tower (four poles, rungs and braces), `h` tall, merged into `into`. */
function truss(scene: Scene, into: Mesh[], x: number, z: number, h: number, w = 1.2): void {
  const p = 0.12;
  for (const dx of [-w / 2, w / 2]) for (const dz of [-w / 2, w / 2]) into.push(box(scene, 'truss', p, h, p, x + dx, h / 2, z + dz));
  for (let y = 0.8; y < h; y += 1.6) {
    for (const d of [-w / 2, w / 2]) {
      into.push(box(scene, 'truss', w, p * 0.7, p * 0.7, x, y, z + d));
      into.push(box(scene, 'truss', p * 0.7, p * 0.7, w, x + d, y, z));
      const brace = box(scene, 'truss', p * 0.6, 1.6 * 1.25, p * 0.6, x + d, y + 0.8, z);
      brace.rotation.x = 0.65 * (Math.round(y / 1.6) % 2 ? 1 : -1);
      into.push(brace);
    }
  }
}

// ----------------------------------------------------------------------------
//  The stands round the floor
// ----------------------------------------------------------------------------

interface EdgeSample {
  x: number;
  z: number;
  /** Outward (away from the floor) and along the edge. */
  nx: number;
  nz: number;
  /** Which bit of the stands: 0 north side, 1 south side, 2–4 the back (south to north). */
  section: number;
}

interface Section {
  meshes: Mesh[];
  /** A point on the floor's edge and the outward normal: the camera's past it, it ducks. */
  x: number;
  z: number;
  nx: number;
  nz: number;
  drop: number;
}

/** Points along the floor's edge (sides and back), `step` apart, skipping the tunnels. */
function edgeSamples(map: MapDef, step: number, inset = 0): EdgeSample[] {
  const f = map.fan!;
  const out: EdgeSample[] = [];
  const inTunnel = (x: number, z: number) => (map.tunnels ?? []).some((t) => insideRect({ ...t, w: t.w + 1.6, d: t.d + 1.6 }, x, z));
  for (const side of [1, -1]) {
    const a = side * f.halfAngle;
    const nx = -Math.sin(a) * side, nz = Math.cos(a) * side;
    for (let r = SIDE_START; r <= f.radius - step / 2; r += step) {
      const x = f.x + Math.cos(a) * r + nx * inset, z = f.z + Math.sin(a) * r + nz * inset;
      if (inTunnel(x - nx * inset, z - nz * inset)) continue;
      out.push({ x, z, nx, nz, section: side > 0 ? 0 : 1 });
    }
  }
  const arcStep = step / (f.radius + inset);
  for (let a = -f.halfAngle + arcStep / 2; a <= f.halfAngle; a += arcStep) {
    const nx = Math.cos(a), nz = Math.sin(a);
    const x = f.x + nx * (f.radius + inset), z = f.z + nz * (f.radius + inset);
    if (inTunnel(f.x + nx * f.radius, f.z + nz * f.radius)) continue;
    out.push({ x, z, nx, nz, section: 2 + Math.min(2, Math.floor(((a + f.halfAngle) / (2 * f.halfAngle)) * 3)) });
  }
  return out;
}

/**
 * The stands: a front wall with LED ad boards, five tiers of seats, and a
 * steep upper bowl painted with thousands more. Every seat gets a seat, most
 * get a fan.
 */
function buildStands(scene: Scene, map: MapDef, crowd: Crowd, seats: SeatSpots): { sections: Section[]; ads: DynamicTexture; bowl: DynamicTexture } {
  const f = map.fan!;
  const rand = rng(31337);
  const concrete = material(scene, 'standConcrete', (m) => {
    m.diffuseColor = new Color3(0.16, 0.15, 0.19);
    m.specularColor = Color3.Black();
  });
  const steps = material(scene, 'standLights', (m) => {
    m.emissiveColor = new Color3(0.9, 0.2, 0.75);
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
  });
  const ads = adTexture(scene);
  const adMat = material(scene, 'adBoard', (m) => {
    m.emissiveTexture = ads;
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
  });
  const bowl = bowlTexture(scene);
  const bowlMat = material(scene, 'bowl', (m) => {
    m.diffuseTexture = bowl;
    m.emissiveTexture = bowl;
    m.emissiveColor = new Color3(0.35, 0.32, 0.4);
    m.specularColor = Color3.Black();
    m.backFaceCulling = false;
  });

  // Section frames, for the camera cutaway.
  const sections: Section[] = [0, 1, 2, 3, 4].map((s) => {
    const a = s === 0 ? f.halfAngle : s === 1 ? -f.halfAngle : -f.halfAngle + ((s - 2 + 0.5) / 3) * 2 * f.halfAngle;
    if (s < 2) {
      const r = (SIDE_START + f.radius) / 2, side = s === 0 ? 1 : -1;
      return { meshes: [], x: f.x + Math.cos(a) * r, z: f.z + Math.sin(a) * r, nx: -Math.sin(a) * side, nz: Math.cos(a) * side, drop: 1 };
    }
    return { meshes: [], x: f.x + Math.cos(a) * f.radius, z: f.z + Math.sin(a) * f.radius, nx: Math.cos(a), nz: Math.sin(a), drop: 1 };
  });

  const STEP = 1.05;
  const samples = edgeSamples(map, STEP);
  const parts = sections.map(() => ({ concrete: [] as Mesh[], lights: [] as Mesh[], ads: [] as Mesh[], bowl: [] as Mesh[] }));
  for (const e of samples) {
    const p = parts[e.section];
    const yaw = yawAlong(0, 0, -e.nz, e.nx);
    const at = (off: number) => [e.x + e.nx * off, e.z + e.nz * off] as const;
    // Front wall, with an ad board facing the floor.
    const [wx, wz] = at(0.15);
    p.concrete.push(box(scene, 'wall', STEP + 0.02, FRONT_WALL, 0.3, wx, FRONT_WALL / 2, wz, yaw));
    for (let k = 0; k < TIERS; k++) {
      const off = tierOffset(k), h = tierHeight(k);
      const [tx, tz] = at(off + TIER_DEPTH / 2);
      p.concrete.push(box(scene, 'tier', STEP + 0.02, h, TIER_DEPTH, tx, h / 2, tz, yaw));
      const [lx, lz] = at(off + 0.03);
      if (k % 2 === 0) p.lights.push(box(scene, 'step', STEP + 0.02, 0.05, 0.06, lx, h + 0.02, lz, yaw));
      // A seat at the back of the tier, a fan standing in front of it.
      const [sx, sz] = at(off + TIER_DEPTH * 0.72);
      const facing = Math.atan2(-e.nz, -e.nx) + (rand() - 0.5) * 0.5;
      seats.add(sx, h, sz, facing, e.section);
      if (rand() < 0.86) {
        const [fx, fz] = at(off + TIER_DEPTH * 0.38);
        const pick = rand();
        const move: FanMove = pick < 0.28 ? 'horns' : pick < 0.48 ? 'headbang' : pick < 0.66 ? 'cheer' : pick < 0.8 ? 'pogo' : pick < 0.92 ? 'sway' : pick < 0.96 ? 'windmill' : 'airGuitar';
        crowd.add({ x: fx, y: h, z: fz, facing, move, section: e.section });
      }
    }
  }
  // The upper bowl: one long sloped strip per section, crowd painted on.
  for (let s = 0; s < sections.length; s++) {
    const pts = samples.filter((e) => e.section === s);
    // Runs of samples without a tunnel gap.
    let run: EdgeSample[] = [];
    const flush = () => {
      if (run.length >= 2) {
        const low: Vector3[] = [], high: Vector3[] = [];
        for (const e of run) {
          low.push(new Vector3(e.x + e.nx * BOWL_IN, BOWL_LOW, e.z + e.nz * BOWL_IN));
          high.push(new Vector3(e.x + e.nx * BOWL_OUT, BOWL_HIGH, e.z + e.nz * BOWL_OUT));
        }
        const strip = MeshBuilder.CreateRibbon('bowl', { pathArray: [low, high] }, scene);
        // Wrap the crowd round: u along, v up.
        const uv = strip.getVerticesData(VertexBuffer.UVKind)!;
        for (let i = 0; i < run.length; i++) {
          uv[i * 2] = (i * STEP) / 30;
          uv[(run.length + i) * 2] = (i * STEP) / 30;
          uv[i * 2 + 1] = 0;
          uv[(run.length + i) * 2 + 1] = 1;
        }
        strip.setVerticesData(VertexBuffer.UVKind, uv);
        parts[s].bowl.push(strip);
        // The LED ad boards along the front wall, facing the floor.
        const adLow = run.map((e) => new Vector3(e.x - e.nx * 0.02, 0.15, e.z - e.nz * 0.02));
        const adHigh = run.map((e) => new Vector3(e.x - e.nx * 0.02, 0.85, e.z - e.nz * 0.02));
        const ad = MeshBuilder.CreateRibbon('ad', { pathArray: [adLow, adHigh], sideOrientation: Mesh.DOUBLESIDE }, scene);
        const auv = ad.getVerticesData(VertexBuffer.UVKind)!;
        for (let i = 0; i < auv.length / 2; i++) {
          const k = i % run.length, row = Math.floor(i / run.length) % 2;
          auv[i * 2] = (k * STEP) / 22;
          auv[i * 2 + 1] = row;
        }
        ad.setVerticesData(VertexBuffer.UVKind, auv);
        parts[s].ads.push(ad);
        // And a dark wall closing the bowl at the top.
        const top = high.map((v) => v.add(new Vector3(0, 2.5, 0)));
        parts[s].concrete.push(MeshBuilder.CreateRibbon('bowlRim', { pathArray: [high, top] }, scene));
      }
      run = [];
    };
    for (const e of pts) {
      const prev = run[run.length - 1];
      if (prev && Math.hypot(e.x - prev.x, e.z - prev.z) > STEP * 1.6) flush();
      run.push(e);
    }
    flush();
  }
  for (const [s, p] of parts.entries()) {
    for (const [list, mat, name] of [[p.concrete, concrete, 'stands'], [p.lights, steps, 'standSteps'], [p.ads, adMat, 'adBoards'], [p.bowl, bowlMat, 'upperBowl']] as const) {
      const m = merge(list as Mesh[], mat, `${name}${s}`);
      if (m) sections[s].meshes.push(m);
    }
  }
  return { sections, ads, bowl };
}

// ----------------------------------------------------------------------------
//  Seats (one mesh, a thin instance per seat)
// ----------------------------------------------------------------------------

class SeatSpots {
  private spots: { x: number; y: number; z: number; facing: number; section: number }[] = [];
  private mesh: Mesh | null = null;
  private lastDrop: number[] = [];

  add(x: number, y: number, z: number, facing: number, section: number): void {
    this.spots.push({ x, y, z, facing, section });
  }

  build(scene: Scene): void {
    const seat = box(scene, 'seat', 0.6, 0.1, 0.5, 0, 0.45, 0);
    const back = box(scene, 'seatBack', 0.6, 0.55, 0.08, 0, 0.75, -0.24);
    const post = box(scene, 'seatPost', 0.1, 0.45, 0.1, 0, 0.22, 0);
    this.mesh = Mesh.MergeMeshes([seat, back, post], true)!;
    this.mesh.name = 'seats';
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.material = material(scene, 'seatPlastic', (m) => {
      m.diffuseColor = new Color3(0.55, 0.06, 0.1);
      m.emissiveColor = new Color3(0.12, 0.01, 0.03);
      m.specularColor = new Color3(0.3, 0.3, 0.3);
    });
    this.mesh.thinInstanceSetBuffer('matrix', new Float32Array(this.spots.length * 16), 16, false);
    this.place(() => 1);
  }

  /** Re-place seats in sections that have ducked or risen (for the cutaway). */
  place(drop: (section: number) => number): void {
    if (!this.mesh) return;
    let changed = false;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      const d = drop(s.section);
      if (this.lastDrop[i] === d) continue;
      this.lastDrop[i] = d;
      changed = true;
      Quaternion.RotationYawPitchRollToRef(Math.PI / 2 - s.facing, 0, 0, this.q);
      this.pos.set(s.x, s.y * d, s.z);
      Matrix.ComposeToRef(this.one, this.q, this.pos, this.m);
      this.mesh.thinInstanceSetMatrixAt(i, this.m, false);
    }
    if (changed) this.mesh.thinInstanceBufferUpdated('matrix');
  }

  private q = new Quaternion();
  private pos = new Vector3();
  private one = new Vector3(1, 1, 1);
  private m = new Matrix();
}

// ----------------------------------------------------------------------------
//  Rows of seats on the floor
// ----------------------------------------------------------------------------

/** A low riser under each row of seats, seats back to back on it, and fans in most. */
function buildFloorRows(scene: Scene, rows: SeatRow[], crowd: Crowd, seats: SeatSpots): void {
  const rand = rng(4242);
  const risers: Mesh[] = [], edges: Mesh[] = [];
  const RISE = 0.25;
  for (const [i, r] of rows.entries()) {
    const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
    const yaw = yawAlong(r.x1, r.z1, r.x2, r.z2);
    const cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2;
    risers.push(box(scene, `riser${i}`, len + SEAT_ROW_DEPTH, RISE, SEAT_ROW_DEPTH - 0.1, cx, RISE / 2, cz, yaw));
    for (const side of [-1, 1]) {
      const ox = -Math.sin(-yaw) * side, oz = Math.cos(-yaw) * side;
      // Glowing edge strip along each long side.
      edges.push(box(scene, `riserEdge${i}${side}`, len + SEAT_ROW_DEPTH, 0.06, 0.06, cx + ox * (SEAT_ROW_DEPTH / 2 - 0.05), RISE + 0.01, cz + oz * (SEAT_ROW_DEPTH / 2 - 0.05), yaw));
      // Seats facing out from the middle, back to back.
      const n = Math.max(1, Math.floor((len + 1) / 0.85));
      for (let k = 0; k < n; k++) {
        const t = n === 1 ? 0.5 : k / (n - 1);
        const x = r.x1 + (r.x2 - r.x1) * t, z = r.z1 + (r.z2 - r.z1) * t;
        const facing = Math.atan2(oz, ox);
        seats.add(x + ox * 0.3, RISE, z + oz * 0.3, facing, -1);
        if (rand() < 0.8) {
          const pick = rand();
          const move: FanMove = pick < 0.3 ? 'horns' : pick < 0.5 ? 'headbang' : pick < 0.7 ? 'pogo' : pick < 0.85 ? 'cheer' : 'windmill';
          // Some stand up on their seats to see better.
          const up = rand() < 0.2 ? 0.5 : 0;
          crowd.add({ x: x + ox * (up ? 0.3 : 0.62), y: RISE + up, z: z + oz * (up ? 0.3 : 0.62), facing, move, section: -1 });
        }
      }
    }
  }
  merge(risers, material(scene, 'riser', (m) => {
    m.diffuseColor = new Color3(0.1, 0.09, 0.12);
    m.specularColor = new Color3(0.1, 0.1, 0.1);
  }), 'risers');
  merge(edges, glowMat(scene, 'riserEdge', '#4de6ff'), 'riserEdges');
}

// ----------------------------------------------------------------------------
//  Lights, lasers, fire
// ----------------------------------------------------------------------------

/** A moving-head spotlight: a beam from the rig to a pool of light on the floor. */
interface Spot {
  from: Vector3;
  beam: Mesh;
  pool: Mesh;
  mat: StandardMaterial;
  at: Vector3;
  goal: Vector3;
  next: number;
  color: number;
}

/** A fan of laser beams from one emitter, sweeping. */
interface Laser {
  pivot: TransformNode;
  beams: Mesh[];
  phase: number;
  speed: number;
  /** Aim (yaw) it sweeps round, and how far either way. */
  base: number;
  sweep: number;
  mats: StandardMaterial[];
}

function flameSystem(scene: Scene, name: string, at: Vector3, tex: DynamicTexture, size: number, capacity: number): ParticleSystem {
  const ps = new ParticleSystem(name, capacity, scene);
  ps.particleTexture = tex;
  ps.emitter = at;
  ps.minEmitBox = new Vector3(-0.15 * size, 0, -0.15 * size);
  ps.maxEmitBox = new Vector3(0.15 * size, 0, 0.15 * size);
  ps.color1 = new Color4(1, 0.75, 0.2, 1);
  ps.color2 = new Color4(1, 0.35, 0.05, 1);
  ps.colorDead = new Color4(0.3, 0.05, 0.02, 0);
  ps.minSize = 0.5 * size;
  ps.maxSize = 1.2 * size;
  ps.minLifeTime = 0.25;
  ps.maxLifeTime = 0.6;
  ps.emitRate = 0;
  ps.direction1 = new Vector3(-0.15, 1, -0.15);
  ps.direction2 = new Vector3(0.15, 1, 0.15);
  ps.minEmitPower = 6 * size;
  ps.maxEmitPower = 10 * size;
  ps.gravity = new Vector3(0, 2, 0);
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;
  ps.start();
  return ps;
}

// ----------------------------------------------------------------------------
//  The band, and the stage dressing
// ----------------------------------------------------------------------------

interface BandMember { character: BlockCharacter; root: TransformNode; move: FanMove; speed: number; scale: number }

/** Put a pose on a character's joints (on top of its resting pose). */
function applyPose(c: BlockCharacter, pose: Pose, root: TransformNode, groundY: number, scale: number): void {
  const j = c.joints;
  for (const role of ['head', 'body', 'armR', 'armL', 'legR', 'legL'] as const) {
    const node = j[role];
    if (node) node.rotation.set(pose[role][0], pose[role][1], pose[role][2]);
  }
  root.position.y = groundY + pose.lift * 0.05 * scale;
  root.rotation.x = pose.tilt;
}

// ----------------------------------------------------------------------------

export interface ConcertDecor extends Decor {
  handle(events: SimEvent[]): void;
}

export function createConcert(scene: Scene, map: MapDef, terrain: Terrain, glow: GlowLayer, mats: Materials): ConcertDecor {
  const f = map.fan!;
  const A = f.halfAngle;
  const polar = (r: number, a: number) => new Vector3(f.x + Math.cos(a) * r, 0, f.z + Math.sin(a) * r);
  const stageR = map.stage?.radius ?? 43;
  const stageH = map.stage?.height ?? 1.2;
  const dot = softDot(scene, 'concertDot');
  const rand = rng(1984);

  // --- The crowd -------------------------------------------------------------
  const crowd = new Crowd(scene);
  const seats = new SeatSpots();
  const stands = buildStands(scene, map, crowd, seats);
  buildFloorRows(scene, map.seats ?? [], crowd, seats);
  crowd.build();
  seats.build(scene);

  // --- Tunnels: a frame round each mouth, and a neon gate sign over it -------
  const frameMat = material(scene, 'tunnelFrame', (m) => {
    m.diffuseColor = new Color3(0.2, 0.2, 0.24);
    m.specularColor = new Color3(0.2, 0.2, 0.2);
  });
  for (const [i, t] of (map.tunnels ?? []).entries()) {
    // It opens onto the floor toward the fan's center; `across` is its width.
    const toward = Math.atan2(f.z - t.z, f.x - t.x);
    const endOn = Math.abs(Math.cos(toward)) > Math.abs(Math.sin(toward));
    const across = endOn ? t.d : t.w;
    const yaw = Math.PI / 2 - toward;
    const ox = Math.cos(toward), oz = Math.sin(toward);
    const mx = t.x + ox * (endOn ? t.w : t.d) * 0.1, mz = t.z + oz * (endOn ? t.w : t.d) * 0.1;
    // Sideways across the mouth: perpendicular to `toward`.
    const sx = -oz, sz = ox;
    for (const side of [-1, 1]) {
      const post = box(scene, `tunnelPost${i}${side}`, 0.6, 4.4, 0.6, mx + sx * side * (across / 2 + 0.3), 2.2, mz + sz * side * (across / 2 + 0.3), yaw);
      post.material = frameMat;
    }
    const lintel = box(scene, `tunnelLintel${i}`, 0.6, 0.8, across + 1.2, mx, 4.4, mz, yaw);
    lintel.rotation.y = -toward;
    lintel.material = frameMat;
    // The sign: GATE A, B, C in red neon, facing the floor.
    const label = String.fromCharCode(65 + i);
    const tex = canvasTexture(scene, `gateSign${i}`, 256, 80, (g) => {
      g.fillStyle = '#0a0004';
      g.fillRect(0, 0, 256, 80);
      g.strokeStyle = '#ff2a3a';
      g.lineWidth = 5;
      g.strokeRect(4, 4, 248, 72);
      g.fillStyle = '#ff4a5a';
      g.font = 'bold 50px Impact, Arial Black, sans-serif';
      g.textAlign = 'center';
      g.fillText(`GATE ${label}`, 128, 60);
    });
    const sign = MeshBuilder.CreatePlane(`gateSign${i}`, { width: 3.2, height: 1 }, scene);
    sign.material = material(scene, `gateSign${i}`, (m) => {
      m.emissiveTexture = tex;
      m.diffuseColor = Color3.Black();
      m.disableLighting = true;
    });
    // Planes face -z; turn it to face back along `toward` (onto the floor).
    sign.position.set(mx + ox * 0.4, 5.4, mz + oz * 0.4);
    faceToward(sign, ox, oz);
    sign.isPickable = false;
  }

  // --- The stage: a glowing front edge and a truss of lights over it ---------
  const edgePts: Vector3[] = [];
  for (let a = -A - 0.02; a <= A + 0.02; a += 0.01) {
    const p = polar(stageR + 0.05, a);
    p.y = stageH * 0.5;
    edgePts.push(p);
  }
  const stageEdge = MeshBuilder.CreateTube('stageEdge', { path: edgePts, radius: 0.08, tessellation: 6 }, scene);
  stageEdge.material = glowMat(scene, 'stageEdge', '#ff2fd0');
  stageEdge.isPickable = false;

  const metal: Mesh[] = [];
  const trussPts: Vector3[] = [];
  for (let a = -A - 0.12; a <= A + 0.121; a += 0.02) {
    const p = polar(stageR + 1.5, a);
    p.y = 12;
    trussPts.push(p);
  }
  for (const y of [0, 0.8]) {
    const tube = MeshBuilder.CreateTube('stageTruss', { path: trussPts.map((p) => p.add(new Vector3(0, y, 0))), radius: 0.1, tessellation: 6 }, scene);
    metal.push(tube);
  }
  for (const end of [trussPts[0], trussPts[trussPts.length - 1]]) truss(scene, metal, end.x, end.z, 12.6);
  // Par cans hanging off it, colors chasing round on the beat.
  const parMats = NEON.map((c, i) => glowMat(scene, `par${i}`, c));
  const parCans: { lens: Mesh; cone: Mesh; color: number }[] = [];
  const coneMat = lightMat(scene, 'parCone');
  coneMat.alpha = 0.05;
  for (let i = 0; i < 14; i++) {
    const p = trussPts[Math.round((i + 0.5) * (trussPts.length / 14))];
    const can = MeshBuilder.CreateCylinder(`par${i}`, { height: 0.6, diameter: 0.45, tessellation: 10 }, scene);
    can.position.set(p.x, p.y - 0.35, p.z);
    can.rotation.z = 0.5;
    can.rotation.y = -Math.atan2(p.z - f.z, p.x - f.x);
    can.material = material(scene, 'parBody', (m) => {
      m.diffuseColor = new Color3(0.08, 0.08, 0.09);
    });
    can.isPickable = false;
    const lens = MeshBuilder.CreateDisc(`parLens${i}`, { radius: 0.2, tessellation: 12 }, scene);
    lens.parent = can;
    lens.position.y = -0.31;
    lens.rotation.x = -Math.PI / 2;
    lens.isPickable = false;
    const cone = MeshBuilder.CreateCylinder(`parCone${i}`, { height: 4, diameterTop: 0.4, diameterBottom: 2, tessellation: 12, cap: Mesh.NO_CAP }, scene);
    cone.parent = can;
    cone.position.y = -2.3;
    cone.material = coneMat;
    cone.isPickable = false;
    glow.addExcludedMesh(cone);
    parCans.push({ lens, cone, color: i % NEON.length });
  }

  // --- The amp wall behind the stage, with the tour banner over it ----------
  const cabMat = material(scene, 'cabFront', (m) => {
    m.diffuseTexture = cabTexture(scene);
    m.specularColor = new Color3(0.1, 0.1, 0.1);
    m.emissiveColor = new Color3(0.12, 0.1, 0.08);
  });
  const backX = -map.width / 2 - 1.6;
  const cabs: Mesh[] = [];
  const CAB = 2.4;
  for (let row = 0; row < 4; row++) {
    for (let col = -6; col <= 6; col++) {
      const z = col * CAB;
      // Stacked a little unevenly, like they were put up in a hurry.
      const c = box(scene, 'cab', 1.6, CAB - 0.06, CAB - 0.06, backX - (row % 2) * 0.1, stageH + CAB / 2 + row * CAB, z);
      c.rotation.y = (rand() - 0.5) * 0.04;
      cabs.push(c);
    }
  }
  const cabWall = merge(cabs, cabMat, 'ampWall')!;
  // Amp heads along the top, their valves glowing.
  const heads: Mesh[] = [], valves: Mesh[] = [];
  for (let col = -6; col <= 6; col++) {
    heads.push(box(scene, 'ampHead', 1.4, 1.1, CAB - 0.1, backX, stageH + 4 * CAB + 0.55, col * CAB));
    for (let k = -1; k <= 1; k++) valves.push(box(scene, 'valve', 0.1, 0.25, 0.25, backX + 0.72, stageH + 4 * CAB + 0.6, col * CAB + k * 0.5));
  }
  merge(heads, material(scene, 'ampHead', (m) => {
    m.diffuseColor = new Color3(0.07, 0.07, 0.07);
    m.specularColor = new Color3(0.3, 0.3, 0.3);
  }), 'ampHeads');
  const valveMat = glowMat(scene, 'valves', '#ff8a2a');
  merge(valves, valveMat, 'valves');
  const backdrop = MeshBuilder.CreatePlane('backdrop', { width: 26, height: 6.5 }, scene);
  backdrop.position.set(backX - 0.2, stageH + 4 * CAB + 1.2 + 3.3, 0);
  backdrop.rotation.y = -Math.PI / 2;
  const backdropMat = material(scene, 'backdrop', (m) => {
    m.emissiveTexture = backdropTexture(scene);
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
  });
  backdrop.material = backdropMat;
  backdrop.isPickable = false;

  // A giant inflatable hand throwing the horns, bobbing over the amps.
  const hand = new TransformNode('inflatableHand', scene);
  const skinMat = material(scene, 'inflatable', (m) => {
    m.diffuseColor = new Color3(0.45, 0.75, 0.35);
    m.emissiveColor = new Color3(0.08, 0.16, 0.06);
    m.specularColor = new Color3(0.6, 0.6, 0.6);
    m.specularPower = 16;
  });
  const handParts: [number, number, number, number, number, number][] = [
    [2.2, 2.4, 1.4, 0, 1.2, 0], // fist
    [1.2, 3, 1.2, 0, -1.4, 0], // wrist
    [0.6, 2.6, 0.6, -0.8, 3.6, 0], // index finger, up
    [0.6, 2.4, 0.6, 0.8, 3.5, 0], // little finger, up
    [0.6, 0.6, 1.1, 0, 2.5, 0.45], // middle fingers, curled
  ];
  for (const [i, [w, h, d, x, y, z]] of handParts.entries()) {
    const b = MeshBuilder.CreateBox(`hand${i}`, { width: w, height: h, depth: d }, scene);
    b.position.set(x, y, z);
    b.parent = hand;
    b.material = skinMat;
    b.isPickable = false;
  }
  hand.position.set(backX - 1, stageH + 4 * CAB + 9.5, 9.5);
  hand.rotation.y = Math.PI / 2;

  // --- The wings: PA stacks, the band, the jumbotrons -----------------------
  const wing = (side: 1 | -1, r: number, out: number) => {
    const a = side * (A + out / r);
    return polar(r, a);
  };
  const pa: Mesh[] = [];
  for (const side of [1, -1] as const) {
    // A tall stack at the stage's front corner.
    const p = wing(side, stageR + 1.8, 1.8);
    for (let k = 0; k < 3; k++) pa.push(box(scene, 'pa', 2.4, 2.2, 2.2, p.x, 1.1 + k * 2.2, p.z, -side * 0.5 + (k % 2 ? 0.05 : -0.05)));
    // A hung line array off the end of the truss.
    const end = side > 0 ? trussPts[trussPts.length - 1] : trussPts[0];
    for (let k = 0; k < 7; k++) {
      const b = box(scene, 'lineArray', 1.6, 0.55, 1.1, end.x - 1.2, 10.5 - k * 0.6, end.z + side * 0.4, -side * 0.35);
      b.rotation.z = -k * 0.05;
      pa.push(b);
    }
  }
  merge(pa.splice(0), cabMat, 'paStacks');

  // The band: a zombie drummer on the north wing, a guitarist on the south.
  const band: BandMember[] = [];
  const riser = (p: Vector3) => {
    const r = box(scene, 'drumRiser', 4.5, 1.6, 4, p.x, 0.8, p.z, 0.3);
    r.material = material(scene, 'riserTop', (m) => { m.diffuseColor = new Color3(0.08, 0.08, 0.1); });
  };
  /** Which way to face to look out over the floor from p (a model's yaw). */
  const toFloor = (p: Vector3) => Math.PI / 2 - Math.atan2(-p.z * 0.7, -12 - p.x);
  {
    const p = wing(1, stageR - 4, 4.5);
    riser(p);
    const kit = new TransformNode('drumKit', scene);
    kit.position.set(p.x, 1.6, p.z);
    kit.rotation.y = toFloor(p);
    const shell = material(scene, 'drumShell', (m) => {
      m.diffuseColor = new Color3(0.6, 0.05, 0.08);
      m.specularColor = new Color3(0.8, 0.8, 0.8);
      m.emissiveColor = new Color3(0.12, 0.01, 0.02);
    });
    const chrome = material(scene, 'drumChrome', (m) => {
      m.diffuseColor = new Color3(0.8, 0.8, 0.85);
      m.specularColor = Color3.White();
      m.emissiveColor = new Color3(0.2, 0.2, 0.2);
    });
    const brass = material(scene, 'cymbal', (m) => {
      m.diffuseColor = new Color3(0.85, 0.65, 0.2);
      m.emissiveColor = new Color3(0.25, 0.18, 0.04);
      m.specularColor = Color3.White();
    });
    const kick = MeshBuilder.CreateCylinder('kick', { height: 0.7, diameter: 1.3, tessellation: 18 }, scene);
    kick.rotation.x = Math.PI / 2;
    kick.position.set(0, 0.65, 0.6);
    kick.material = shell;
    const head = MeshBuilder.CreateDisc('kickHead', { radius: 0.6, tessellation: 18 }, scene);
    head.position.set(0, 0.65, 0.96);
    head.rotation.y = Math.PI;
    head.material = material(scene, 'kickHead', (m) => {
      m.emissiveTexture = canvasTexture(scene, 'kickHead', 128, 128, (g) => {
        // Drawn mirrored: the disc is turned round to face the front.
        g.translate(128, 0);
        g.scale(-1, 1);
        g.fillStyle = '#f2efe6';
        g.beginPath();
        g.arc(64, 64, 64, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#c4160c';
        g.font = 'bold 26px Impact, Arial Black, sans-serif';
        g.textAlign = 'center';
        g.fillText('ZOMBIE', 64, 50);
        g.fillText('KILLAZ', 64, 82);
        g.fillText('☠', 64, 112);
      });
      m.diffuseColor = Color3.Black();
    });
    const drums: [number, number, number, number][] = [[-0.6, 1.05, 0.5, 0.45], [0.6, 1.05, 0.5, 0.45], [0.9, 0.7, -0.2, 0.6], [-0.7, 0.85, 0.1, 0.4]];
    for (const [i, [x, y, z, d]] of drums.entries()) {
      const tom = MeshBuilder.CreateCylinder(`tom${i}`, { height: 0.35, diameter: d, tessellation: 14 }, scene);
      tom.position.set(x, y, z);
      tom.material = shell;
      tom.parent = kit;
    }
    for (const [i, [x, z]] of [[-1.1, 0.6], [1.2, 0.5], [-0.2, 1.1]].entries()) {
      const stand = MeshBuilder.CreateCylinder(`cymStand${i}`, { height: 1.6, diameter: 0.05 }, scene);
      stand.position.set(x, 0.8, z);
      stand.material = chrome;
      stand.parent = kit;
      const cym = MeshBuilder.CreateCylinder(`cym${i}`, { height: 0.03, diameterTop: 0.1, diameterBottom: 0.7, tessellation: 16 }, scene);
      cym.position.set(x, 1.62, z);
      cym.rotation.x = 0.2;
      cym.material = brass;
      cym.parent = kit;
    }
    // The drum throne, behind it all.
    const throne = MeshBuilder.CreateCylinder('throne', { height: 0.5, diameter: 0.55, tessellation: 12 }, scene);
    throne.position.set(0, 0.25, -0.75);
    throne.material = material(scene, 'throne', (m) => { m.diffuseColor = new Color3(0.05, 0.05, 0.05); });
    for (const m of [kick, head, throne]) m.parent = kit;
    for (const m of kit.getChildMeshes()) m.isPickable = false;
    kit.scaling.setAll(0.85);
    const drummer = createZombieVisual(scene, mats, 'cyborg', 'bandDrummer');
    const yaw = toFloor(p);
    drummer.root.position.set(p.x - Math.sin(yaw) * 0.65, 1.6, p.z - Math.cos(yaw) * 0.65);
    drummer.root.rotation.y = yaw;
    drummer.root.scaling.setAll(1.35);
    band.push({ character: drummer.character!, root: drummer.root, move: 'drumSolo', speed: 1.1, scale: 1.35 });
  }
  {
    const p = wing(-1, stageR - 4, 4.5);
    riser(p);
    const guitarist = createZombieVisual(scene, mats, 'tombstone', 'bandGuitarist');
    guitarist.root.position.set(p.x, 1.6, p.z);
    guitarist.root.rotation.y = toFloor(p);
    guitarist.root.scaling.setAll(1.35);
    const axe = buildGuitar(scene, 'bandGuitar');
    axe.parent = guitarist.character!.joints.body!;
    axe.position.set(0.03, -0.38, 0.3);
    axe.rotation.set(-0.1, 0, 0.95);
    axe.scaling.setAll(0.75);
    band.push({ character: guitarist.character!, root: guitarist.root, move: 'airGuitar', speed: 1, scale: 1.35 });
  }
  const bandPose = newPose();

  // Jumbotrons on the wings, hung high, angled to the floor.
  const screenTex = new DynamicTexture('jumbotron', { width: 320, height: 180 }, scene, false);
  const screenMat = material(scene, 'jumbotron', (m) => {
    m.emissiveTexture = screenTex;
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
  });
  for (const side of [1, -1] as const) {
    const p = wing(side, stageR + 2, 6);
    // Facing out over the floor, toward its middle.
    const dx = 20 - p.x, dz = -p.z * 0.6, len = Math.hypot(dx, dz);
    const frame = box(scene, `screenFrame${side}`, 10.4, 6, 0.4, p.x, 9, p.z);
    frame.rotation.y = Math.atan2(-dx, -dz);
    frame.material = material(scene, 'screenFrame', (m) => { m.diffuseColor = new Color3(0.05, 0.05, 0.06); });
    const screen = MeshBuilder.CreatePlane(`screen${side}`, { width: 10, height: 5.6 }, scene);
    screen.position.set(p.x + (dx / len) * 0.25, 9, p.z + (dz / len) * 0.25);
    faceToward(screen, dx, dz);
    screen.material = screenMat;
    screen.isPickable = false;
    truss(scene, metal, p.x, p.z, 6, 0.6);
  }

  // --- Towers at the back: speakers and lights -------------------------------
  const lightRigs: Vector3[] = [];
  for (const [a, kind] of [[-0.27, 'lights'], [-0.11, 'speakers'], [0.11, 'speakers'], [0.27, 'lights']] as const) {
    const p = polar(f.radius + 3.5, a);
    const h = kind === 'lights' ? 20 : 17;
    truss(scene, metal, p.x, p.z, h, 1.8);
    metal.push(box(scene, 'towerTop', 3, 0.3, 3, p.x, h, p.z));
    if (kind === 'speakers') {
      // A tall hang of speakers, curving down toward the floor.
      for (let k = 0; k < 9; k++) {
        const b = box(scene, 'towerArray', 1.4, 0.8, 2.4, p.x - 1.4, h - 1 - k * 0.85, p.z, 0);
        b.rotation.z = k * 0.04;
        pa.push(b);
      }
    } else {
      lightRigs.push(new Vector3(p.x, h + 0.6, p.z));
    }
  }
  merge(pa.splice(0), cabMat, 'towerArrays');
  // More moving heads on the stage truss and the wing screens.
  lightRigs.push(new Vector3(trussPts[3].x, 11.6, trussPts[3].z), new Vector3(trussPts[trussPts.length - 4].x, 11.6, trussPts[trussPts.length - 4].z));
  merge(metal, material(scene, 'trussMetal', (m) => {
    m.diffuseColor = new Color3(0.5, 0.52, 0.56);
    m.specularColor = new Color3(0.6, 0.6, 0.6);
    m.emissiveColor = new Color3(0.06, 0.06, 0.07);
  }), 'truss');

  // Spotlights: beams from the rigs to pools of light that dash about the floor.
  const spots: Spot[] = [];
  const poolMat = (i: number) => {
    const m = lightMat(scene, `spotPool${i}`, dot);
    m.alpha = 0.55;
    return m;
  };
  const randomFloor = () => {
    const a = (rand() * 2 - 1) * A * 0.9, r = stageR + 3 + rand() * (f.radius - stageR - 8);
    return polar(r, a);
  };
  for (const [i, rig] of lightRigs.entries()) {
    for (let k = 0; k < (i < 2 ? 3 : 1); k++) {
      const head = box(scene, `movingHead${i}${k}`, 0.6, 0.7, 0.6, rig.x, rig.y, rig.z + (k - 1) * 0.9);
      head.material = material(scene, 'movingHead', (m) => { m.diffuseColor = new Color3(0.1, 0.1, 0.12); });
      const mat = lightMat(scene, `spotBeam${i}${k}`);
      mat.alpha = 0.09;
      const beam = MeshBuilder.CreateCylinder(`spotBeam${i}${k}`, { height: 1, diameterTop: 0.3, diameterBottom: 2.4, tessellation: 16, cap: Mesh.NO_CAP }, scene);
      beam.material = mat;
      beam.isPickable = false;
      glow.addExcludedMesh(beam);
      const pool = MeshBuilder.CreateDisc(`spotPool${i}${k}`, { radius: 2.2, tessellation: 24 }, scene);
      pool.rotation.x = Math.PI / 2;
      pool.material = poolMat(i * 3 + k);
      pool.isPickable = false;
      glow.addExcludedMesh(pool);
      const at = randomFloor();
      spots.push({ from: head.position.clone(), beam, pool, mat, at, goal: at.clone(), next: rand() * 2, color: (i + k) % NEON.length });
    }
  }

  // Lasers: fans of beams from the stage wings, the amp wall and the towers.
  const lasers: Laser[] = [];
  const laserColors = ['#3cff6e', '#ff2a3a', '#4de6ff', '#ff2fd0'];
  const laserMats = laserColors.map((c, i) => {
    const m = lightMat(scene, `laser${i}`);
    m.emissiveColor = hex(c);
    m.alpha = 0.85;
    return m;
  });
  const emitters: [Vector3, number, number][] = [
    [wing(1, stageR + 1.8, 1.8).add(new Vector3(0, 7, 0)), 0.25, 0.7],
    [wing(-1, stageR + 1.8, 1.8).add(new Vector3(0, 7, 0)), -0.25, 0.7],
    [new Vector3(backX + 1, stageH + 4 * CAB + 1.4, 0), 0, 0.55],
    [lightRigs[0].add(new Vector3(0, -2, 0)), Math.PI, 0.5],
    [lightRigs[1].add(new Vector3(0, -2, 0)), Math.PI, 0.5],
  ];
  for (const [i, [at, base, sweep]] of emitters.entries()) {
    const pivot = new TransformNode(`laserPivot${i}`, scene);
    pivot.position.copyFrom(at);
    const beams: Mesh[] = [];
    for (let k = 0; k < 5; k++) {
      const beam = MeshBuilder.CreateBox(`laser${i}${k}`, { width: 70, height: 0.05, depth: 0.05 }, scene);
      beam.position.x = 35;
      const holder = new TransformNode(`laserArm${i}${k}`, scene);
      holder.parent = pivot;
      holder.rotation.y = (k - 2) * 0.12;
      beam.parent = holder;
      beam.material = laserMats[i % laserMats.length];
      beam.isPickable = false;
      beams.push(beam);
    }
    lasers.push({ pivot, beams, phase: rand() * 10, speed: 0.4 + rand() * 0.4, base, sweep, mats: laserMats });
    const housing = box(scene, `laserBox${i}`, 0.7, 0.4, 0.7, at.x, at.y, at.z);
    housing.material = material(scene, 'laserBox', (m) => { m.diffuseColor = new Color3(0.08, 0.08, 0.1); });
  }

  // Fire: pyro jets at the stage's front corners, on the amp wall and the
  // speaker towers, and braziers burning all round the top of the stands.
  const pyros: ParticleSystem[] = [];
  const pyroAt: Vector3[] = [
    wing(1, stageR + 0.5, 0.8), wing(-1, stageR + 0.5, 0.8), wing(1, stageR - 4, 1), wing(-1, stageR - 4, 1),
    new Vector3(backX + 0.3, stageH + 4 * CAB + 1.2, 13), new Vector3(backX + 0.3, stageH + 4 * CAB + 1.2, -13),
  ];
  for (const [a] of [[-0.11], [0.11]]) {
    const p = polar(f.radius + 3.5, a);
    pyroAt.push(new Vector3(p.x, 17.4, p.z));
  }
  for (const [i, p] of pyroAt.entries()) pyros.push(flameSystem(scene, `pyro${i}`, p, dot, 1, 400));
  const brazierMat = material(scene, 'brazier', (m) => {
    m.diffuseColor = new Color3(0.15, 0.12, 0.1);
    m.specularColor = new Color3(0.4, 0.4, 0.4);
  });
  const rim = edgeSamples(map, 13, BOWL_OUT - 0.5);
  for (const [i, e] of rim.entries()) {
    const bowl = MeshBuilder.CreateCylinder(`brazier${i}`, { height: 0.9, diameterTop: 1.4, diameterBottom: 0.6, tessellation: 10 }, scene);
    bowl.position.set(e.x, BOWL_HIGH + 2.5 + 0.45, e.z);
    bowl.material = brazierMat;
    bowl.isPickable = false;
    stands.sections[e.section]?.meshes.push(bowl);
    const ps = flameSystem(scene, `brazierFire${i}`, new Vector3(e.x, BOWL_HIGH + 3, e.z), dot, 0.6, 60);
    ps.emitRate = 35;
    ps.minEmitPower = 1;
    ps.maxEmitPower = 2.5;
    ps.minLifeTime = 0.4;
    ps.maxLifeTime = 0.8;
  }

  // Confetti cannons on the wings, for when a wave's cleared.
  const confettiTex = canvasTexture(scene, 'confetti', 16, 16, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(2, 5, 12, 6);
  }, false);
  const confetti = new ParticleSystem('confetti', 1500, scene);
  confetti.particleTexture = confettiTex;
  confetti.emitter = new Vector3(f.x + stageR, 8, 0);
  confetti.minEmitBox = new Vector3(-1, 0, -14);
  confetti.maxEmitBox = new Vector3(1, 0, 14);
  confetti.color1 = new Color4(1, 0.2, 0.8, 1);
  confetti.color2 = new Color4(0.3, 0.9, 1, 1);
  confetti.colorDead = new Color4(1, 0.9, 0.2, 0);
  confetti.minSize = 0.15;
  confetti.maxSize = 0.3;
  confetti.minLifeTime = 2.5;
  confetti.maxLifeTime = 4;
  confetti.emitRate = 0;
  confetti.direction1 = new Vector3(2, 6, -3);
  confetti.direction2 = new Vector3(8, 10, 3);
  confetti.minEmitPower = 1;
  confetti.maxEmitPower = 2;
  confetti.gravity = new Vector3(0, -3, 0);
  confetti.minAngularSpeed = -6;
  confetti.maxAngularSpeed = 6;
  confetti.start();

  // Beach balls bouncing about the stands.
  const ballTex = canvasTexture(scene, 'beachBall', 128, 64, (g) => {
    ['#ff2a3a', '#ffffff', '#3c8cff', '#ffe14d', '#ffffff', '#3cff6e'].forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(i * 21.4, 0, 22, 64);
    });
  });
  const ballMat = material(scene, 'beachBall', (m) => {
    m.diffuseTexture = ballTex;
    m.emissiveColor = new Color3(0.25, 0.25, 0.25);
  });
  const balls = Array.from({ length: 4 }, (_, i) => {
    const m = MeshBuilder.CreateSphere(`beachBall${i}`, { diameter: 1.1, segments: 10 }, scene);
    m.material = ballMat;
    m.isPickable = false;
    const ring = edgeSamples(map, 2, tierOffset(2));
    return { mesh: m, ring, at: Math.floor(rand() * ring.length), t: rand(), speed: 1.5 + rand() };
  });

  // Phone lights and lighters held up in the stands.
  const lighterMat = glowMat(scene, 'lighters', '#fff1b0');
  const lighter = MeshBuilder.CreatePlane('lighter', { size: 0.22 }, scene);
  lighter.billboardMode = Mesh.BILLBOARDMODE_ALL;
  lighter.material = lighterMat;
  lighter.isPickable = false;
  lighter.alwaysSelectAsActiveMesh = true;
  const lights = edgeSamples(map, 2.3, 0).flatMap((e) => {
    const k = Math.floor(rand() * TIERS);
    const off = tierOffset(k) + TIER_DEPTH * 0.4;
    return rand() < 0.75 ? [{ x: e.x + e.nx * off, y: tierHeight(k) + 2.1, z: e.z + e.nz * off, section: e.section }] : [];
  });
  const lightBuf = new Float32Array(lights.length * 16);
  lighter.thinInstanceSetBuffer('matrix', lightBuf, 16, false);
  const placeLighters = (lift: number, drop: (s: number) => number) => {
    for (const [i, l] of lights.entries()) {
      lightBuf.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, l.x, (l.y + lift) * drop(l.section), l.z, 1], i * 16);
    }
    lighter.thinInstanceBufferUpdated('matrix');
  };

  // A colored wash over the stage, pulsing.
  const wash = new PointLight('stageWash', new Vector3(f.x + stageR - 6, 9, 0), scene);
  wash.range = 30;
  wash.intensity = 0.8;
  wash.specular = Color3.Black();

  // --- Show state --------------------------------------------------------------
  let t = 0;
  let encore = 0; // seconds of encore left
  let solo: { x: number; z: number; t: number } | null = null; // a Guitar Solo Blast being aimed
  let bossTime = -1; // seconds since the boss walked in (-1: not here)
  let message = 'MAKE SOME NOISE!';
  let messageTime = 0;
  let screenClock = 0;
  let lastBeat = -1;
  const effects: { update(dt: number): boolean; dispose(): void }[] = [];
  const say = (text: string) => {
    message = text;
    messageTime = 0;
  };
  const fireAll = (count: number) => { for (const p of pyros) p.manualEmitCount = count; };

  const drawScreen = () => {
    const g = screenTex.getContext() as unknown as CanvasRenderingContext2D;
    const boss = bossTime >= 0;
    const grad = g.createLinearGradient(0, 0, 0, 180);
    grad.addColorStop(0, boss ? '#3a0004' : '#12002a');
    grad.addColorStop(1, boss ? '#120000' : '#000814');
    g.fillStyle = grad;
    g.fillRect(0, 0, 320, 180);
    // Equalizer bars bouncing along the bottom.
    for (let i = 0; i < 20; i++) {
      const h = (0.25 + 0.75 * Math.abs(Math.sin(t * (3 + (i % 5)) + i * 1.7))) * 60 * (encore > 0 ? 1.4 : 1);
      g.fillStyle = NEON[i % NEON.length];
      g.fillRect(6 + i * 15.6, 176 - h, 11, h);
    }
    const flash = messageTime < 3 && Math.floor(messageTime * 6) % 2 === 0;
    g.font = `bold ${message.length > 12 ? 30 : 40}px Impact, Arial Black, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.strokeStyle = '#000000';
    g.strokeText(message, 160, 62);
    g.fillStyle = flash ? '#ffffff' : boss ? '#ff3b2f' : '#ffe14d';
    g.fillText(message, 160, 62);
    screenTex.update();
  };

  /** Lightning from the sky, a ring of fire and a burst of notes: the Guitar Solo Blast lands. */
  const soloBlast = (x: number, z: number, radius: number) => {
    const y = terrain.surfaceHeight(x, z);
    const bolt: Mesh[] = [];
    let px = x + (rand() - 0.5) * 2, pz = z + (rand() - 0.5) * 2;
    for (let k = 0; k < 9; k++) {
      const top = new Vector3(px, y + 30 - k * 3.3, pz);
      px = k === 8 ? x : x + (rand() - 0.5) * 2.4;
      pz = k === 8 ? z : z + (rand() - 0.5) * 2.4;
      const bottom = new Vector3(px, y + 30 - (k + 1) * 3.3, pz);
      const seg = MeshBuilder.CreateTube('soloBolt', { path: [top, bottom], radius: 0.18, tessellation: 5 }, scene);
      seg.material = glowMat(scene, 'soloBolt', '#e8f4ff');
      seg.isPickable = false;
      bolt.push(seg);
    }
    const ring = MeshBuilder.CreateTorus('soloRing', { diameter: radius * 2, thickness: 0.35, tessellation: 40 }, scene);
    ring.position.set(x, y + 0.2, z);
    ring.material = mats.neon('#ff6a10', 2, 0.9);
    ring.isPickable = false;
    const flames = flameSystem(scene, 'soloFire', new Vector3(x, y + 0.1, z), dot, 1.4, 500);
    flames.createCylinderEmitter(radius * 0.9, 0.1, radius * 0.9, 0);
    flames.manualEmitCount = 450;
    flames.minEmitPower = 3;
    flames.maxEmitPower = 7;
    const notes = ['♪', '♫', '♬', '🤘'].map((n, i) => canvasTexture(scene, `note${i}`, 64, 64, (g) => {
      g.font = '52px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#ffffff';
      g.fillText(n, 32, 34);
    }, false));
    const flying = Array.from({ length: 10 }, (_, i) => {
      const m = MeshBuilder.CreatePlane('soloNote', { size: 1.2 }, scene);
      m.billboardMode = Mesh.BILLBOARDMODE_ALL;
      const tex = notes[i % notes.length];
      tex.hasAlpha = true;
      m.material = material(scene, `soloNote${i % notes.length}`, (mm) => {
        mm.diffuseTexture = tex;
        mm.useAlphaFromDiffuseTexture = true;
        mm.emissiveColor = hex(NEON[i % NEON.length]);
        mm.disableLighting = true;
        mm.backFaceCulling = false;
      });
      m.position.set(x, y + 1, z);
      m.isPickable = false;
      const a = (i / 10) * Math.PI * 2;
      return { m, v: new Vector3(Math.cos(a) * 4, 5 + rand() * 4, Math.sin(a) * 4) };
    });
    let life = 0;
    effects.push({
      update: (dt) => {
        life += dt;
        for (const b of bolt) b.visibility = life < 0.35 ? (Math.floor(life * 30) % 2 ? 1 : 0.4) : Math.max(0, 1 - (life - 0.35) / 0.2);
        ring.scaling.setAll(0.3 + Math.min(1, life / 0.3) * 0.9);
        ring.visibility = Math.max(0, 1 - life / 0.8);
        for (const n of flying) {
          n.v.y -= 6 * dt;
          n.m.position.addInPlace(n.v.scale(dt));
          n.m.visibility = Math.max(0, 1 - life / 1.4);
        }
        return life < 1.4;
      },
      dispose: () => {
        for (const b of bolt) b.dispose();
        ring.dispose();
        for (const n of flying) n.m.dispose();
        flames.dispose();
      },
    });
  };

  // How far up each section of the stands stands (it ducks out of the camera's way).
  const drop = (s: number) => (s < 0 ? 1 : stands.sections[s].drop);
  placeLighters(0, drop);
  drawScreen();

  return {
    replacesStrike: true,
    crumble: () => false,
    blackout: () => {},
    setWind: () => {},
    handle(events) {
      for (const e of events) {
        switch (e.t) {
          case 'waveStart':
            say(`WAVE ${e.wave + 1}!`);
            fireAll(120);
            break;
          case 'waveCleared':
            say('ENCORE? NOT YET!');
            confetti.manualEmitCount = 900;
            break;
          case 'won':
            say('THANK YOU HELLFIRE!');
            confetti.manualEmitCount = 1500;
            fireAll(300);
            break;
          case 'lost':
            say('SHOW\'S OVER');
            break;
          case 'bossSpawn':
            bossTime = 0;
            say('😈 SATAN 😈');
            fireAll(400);
            break;
          case 'zombieDied':
            if (bossTime >= 0 && e.type === 'satan') {
              bossTime = -1;
              say('SATAN IS DOWN!');
              confetti.manualEmitCount = 1500;
              fireAll(300);
            }
            break;
          case 'hyperSun':
            encore = 6;
            say('ENCORE! ENCORE!');
            fireAll(250);
            break;
          case 'strikeTargeted':
            solo = { x: e.x, z: e.z, t: 0 };
            say('GUITAR SOLO!!!');
            break;
          case 'strikeHit':
            soloBlast(e.x, e.z, e.radius);
            solo = null;
            for (const p of pyros) p.manualEmitCount = 80;
            break;
          case 'jumped':
            bossTime = -1;
            encore = 0;
            say('MAKE SOME NOISE!');
            break;
          default: break;
        }
      }
    },
    update(dt, bossActive) {
      t += dt;
      messageTime += dt;
      if (bossTime >= 0) bossTime += dt;
      if (!bossActive && bossTime > 5) bossTime = -1;
      encore = Math.max(0, encore - dt);
      const hype = encore > 0 ? 2 : bossActive ? 1.5 : 1;
      const beat = Math.floor(t / BEAT);
      const onBeat = beat !== lastBeat;
      lastBeat = beat;
      const pulse = Math.pow(1 - ((t / BEAT) % 1), 3);

      // The camera cutaway: stands between the camera and the floor duck down.
      const cam = scene.activeCamera;
      if (cam) {
        const c = cam.globalPosition;
        for (const s of stands.sections) {
          const out = (c.x - s.x) * s.nx + (c.z - s.z) * s.nz;
          const target = out > -1 ? 0.18 : 1;
          s.drop += (target - s.drop) * Math.min(1, dt * 6);
          if (Math.abs(target - s.drop) < 0.002) s.drop = target;
          for (const m of s.meshes) m.scaling.y = s.drop;
        }
      }
      seats.place(drop);
      crowd.update(t, hype, drop, 0.3);
      if (Math.floor(t * 10) !== Math.floor((t - dt) * 10)) placeLighters(Math.sin(t * 2) * 0.1, drop);
      lighterMat.emissiveColor = new Color3(1, 0.9, 0.6).scale(encore > 0 ? 1.4 : 0.55 + 0.15 * Math.sin(t * 7));

      // The band plays on.
      for (const m of band) {
        dancePose(m.move, t * m.speed, bandPose, hype);
        applyPose(m.character, bandPose, m.root, 1.6, m.scale);
      }

      // Scrolling ads, the crowd bouncing in the upper bowl.
      stands.ads.uOffset = (t * 0.03) % 1;
      stands.bowl.vOffset = Math.abs(Math.sin(t * Math.PI / BEAT)) * 0.012 * hype;

      // The amps thump; the valves glow; the par cans chase.
      const thump = 0.12 + 0.12 * pulse * hype;
      (cabWall.material as StandardMaterial).emissiveColor.set(thump, thump * 0.85, thump * 0.7);
      valveMat.emissiveColor = new Color3(1, 0.5, 0.15).scale(0.6 + 0.6 * pulse);
      if (onBeat) for (const p of parCans) p.color = (p.color + 1) % NEON.length;
      for (const [i, p] of parCans.entries()) {
        p.lens.material = parMats[p.color];
        p.cone.visibility = 0.5 + 0.5 * (bossTime >= 0 ? 1 : ((beat + i) % 2));
      }
      coneMat.emissiveColor = bossTime >= 0 ? new Color3(1, 0.1, 0.05) : hex(NEON[beat % NEON.length]);
      wash.diffuse = bossTime >= 0 ? new Color3(1, 0.1, 0.05) : hex(NEON[Math.floor(t / (BEAT * 4)) % NEON.length]);
      wash.intensity = 0.5 + 0.6 * pulse;
      backdropMat.emissiveColor = new Color3(1, 1, 1).scale(0.5 + 0.2 * pulse);
      hand.position.y = stageH + 4 * CAB + 9.5 + Math.sin(t * 1.3) * 0.4;
      hand.rotation.z = Math.sin(t * 0.9) * 0.12;

      // Spotlights dash to new spots (all onto the stage in an encore; onto
      // the target while a solo's coming; onto the boss when he's here).
      for (const [i, s] of spots.entries()) {
        s.next -= dt;
        if (s.next <= 0) {
          s.next = 1 + rand() * 2;
          s.goal = randomFloor();
          if (onBeat) s.color = (s.color + 1) % NEON.length;
        }
        let goal = s.goal;
        if (encore > 0) goal = polar(stageR - 6 - (i % 3) * 2, ((i % 5) - 2) * 0.08);
        if (solo) goal = new Vector3(solo.x + Math.cos(i) * 1.2, 0, solo.z + Math.sin(i) * 1.2);
        s.at.addInPlace(goal.subtract(s.at).scale(Math.min(1, dt * (solo ? 10 : 4))));
        const ground = terrain.surfaceHeight(s.at.x, s.at.z);
        const to = new Vector3(s.at.x, ground, s.at.z);
        const dir = to.subtract(s.from);
        const len = dir.length();
        s.beam.position.copyFrom(s.from.add(dir.scale(0.5)));
        s.beam.scaling.y = len;
        // Cylinders run along +y; turn that to point from the light down to the floor.
        const axis = Vector3.Cross(Vector3.Down(), dir.normalize());
        const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(Vector3.Down(), dir.normalize()))));
        s.beam.rotationQuaternion = axis.lengthSquared() > 1e-8 ? Quaternion.RotationAxis(axis.normalize(), angle) : Quaternion.Identity();
        s.pool.position.set(to.x, ground + 0.06, to.z);
        const color = bossTime >= 0 && i % 2 === 0 ? new Color3(1, 0.1, 0.05) : hex(NEON[s.color]);
        s.mat.emissiveColor = color;
        (s.pool.material as StandardMaterial).emissiveColor = color.scale(0.8);
      }

      // Lasers sweep, faster in an encore; all red for the boss.
      for (const [i, l] of lasers.entries()) {
        l.pivot.rotation.y = l.base + Math.sin(t * l.speed * hype + l.phase) * l.sweep;
        l.pivot.rotation.z = -0.08 - 0.06 * Math.sin(t * 0.7 + i);
        const mat = bossTime >= 0 ? l.mats[1] : l.mats[(Math.floor(t / (BEAT * 8)) + i) % l.mats.length];
        for (const [k, b] of l.beams.entries()) {
          b.material = mat;
          (b.parent as TransformNode).rotation.y = (k - 2) * (0.1 + 0.05 * Math.sin(t * 0.9 + i));
        }
      }
      for (const m of laserMats) m.alpha = 0.55 + 0.35 * pulse;

      // Fire on the beat: a pair of jets every bar, everything in an encore.
      if (onBeat && beat % 4 === 0) {
        const k = (beat / 4) % 3;
        pyros[k * 2].manualEmitCount = 90;
        pyros[k * 2 + 1].manualEmitCount = 90;
      }
      if (onBeat && encore > 0) fireAll(60);

      // The jumbotrons, ten times a second.
      screenClock += dt;
      if (screenClock > 0.1) {
        screenClock = 0;
        if (messageTime > 6 && bossTime < 0) message = encore > 0 ? 'ENCORE! ENCORE!' : ['MAKE SOME NOISE!', 'ARE YOU READY?!', 'HELLFIRE!!!', 'MOSH PIT!'][Math.floor(t / 7) % 4];
        drawScreen();
      }

      // Beach balls, bounced from fan to fan.
      for (const b of balls) {
        b.t += dt * b.speed;
        if (b.t >= 1) {
          b.t = 0;
          b.at = (b.at + (rand() < 0.5 ? 1 : -1) * (1 + Math.floor(rand() * 3)) + b.ring.length) % b.ring.length;
        }
        const e = b.ring[b.at];
        const lift = Math.sin(b.t * Math.PI) * 2.5;
        b.mesh.position.set(e.x, (tierHeight(2) + 2.2) * drop(e.section) + lift, e.z);
        b.mesh.rotation.x += dt * 2;
        b.mesh.rotation.z += dt * 1.3;
      }

      for (let i = effects.length - 1; i >= 0; i--) {
        if (!effects[i].update(dt)) {
          effects[i].dispose();
          effects.splice(i, 1);
        }
      }
    },
  };
}
