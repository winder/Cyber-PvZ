import {
  Color3, Color4, DynamicTexture, Engine, Mesh, MeshBuilder, ParticleSystem, Scene, StandardMaterial,
  TransformNode, Vector3, VertexBuffer, VertexData, type GlowLayer,
} from '@babylonjs/core';
import type { MapDef } from '../data/config';
import type { Terrain } from './terrain';

// Scenery for the ruined-city look (Rust Corridor): gutted brick buildings
// along both sides with alleys between them, burnt-out cars, curved street
// lamps that still flicker, hydrants and bins, a skyline lost in the haze,
// and tumbleweeds blowing through. All for looks.

export interface Decor {
  /** Animate lamps, tumbleweeds and the camera cutaway. `bossActive` makes the lamps go wild. */
  update(dt: number, bossActive: boolean): void;
  /** Bring down the standing building nearest (x, z), if one is within `reach`. True if one fell. */
  crumble(x: number, z: number, reach: number): boolean;
  /** Put every street lamp out (or let them come back on). */
  blackout(on: boolean): void;
  /** How hard the wind blows (1 = normal). */
  setWind(strength: number): void;
}

/** Seeded random numbers so the city looks the same every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(n: number, seed: number): number {
  let h = Math.imul(n ^ (seed * 374761393), 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ----------------------------------------------------------------------------
//  Textures, drawn in code
// ----------------------------------------------------------------------------

function canvasTexture(scene: Scene, name: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, mips = true): DynamicTexture {
  const tex = new DynamicTexture(name, { width: w, height: h }, scene, mips);
  draw(tex.getContext() as unknown as CanvasRenderingContext2D);
  tex.update(true);
  return tex;
}

/** Old rust-brown brickwork, sooty and weathered. */
function brickTexture(scene: Scene): DynamicTexture {
  return canvasTexture(scene, 'brick', 256, 256, (g) => {
    const rand = rng(11);
    g.fillStyle = '#5e4635';
    g.fillRect(0, 0, 256, 256);
    const bh = 10, bw = 26;
    for (let row = 0; row < 256 / bh; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < 256 + bw; x += bw) {
        const r = 105 + rand() * 45, gg = 52 + rand() * 25, b = 32 + rand() * 18;
        const k = rand() < 0.1 ? 0.6 : 1; // a few scorched bricks
        g.fillStyle = `rgb(${r * k},${gg * k},${b * k})`;
        g.fillRect(x + off + 1, row * bh + 1, bw - 2, bh - 2);
      }
    }
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '20,14,10' : '150,110,80'},${0.15 + rand() * 0.25})`;
      g.fillRect(rand() * 256, rand() * 256, 1 + rand() * 4, 1 + rand() * 4);
    }
    // Soot and rain streaks running down.
    for (let i = 0; i < 18; i++) {
      const x = rand() * 256, w = 6 + rand() * 20;
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, 'rgba(20,12,8,0.45)');
      grad.addColorStop(1, 'rgba(20,12,8,0)');
      g.fillStyle = grad;
      g.fillRect(x, 0, w, 256);
    }
  });
}

/** Weathered pale stone for sills, cornices and floor edges. */
function stoneTexture(scene: Scene): DynamicTexture {
  return canvasTexture(scene, 'stone', 128, 128, (g) => {
    const rand = rng(12);
    g.fillStyle = '#8f7a63';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1200; i++) {
      const v = 90 + rand() * 80;
      g.fillStyle = `rgba(${v},${v * 0.82},${v * 0.66},0.4)`;
      g.fillRect(rand() * 128, rand() * 128, 1 + rand() * 4, 1 + rand() * 3);
    }
    g.strokeStyle = 'rgba(40,28,20,0.6)';
    for (let x = 0; x < 128; x += 32) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 128);
      g.stroke();
    }
  });
}

/** Charred paint eaten through with rust, for car bodies. */
function wreckTexture(scene: Scene): DynamicTexture {
  return canvasTexture(scene, 'wreck', 128, 128, (g) => {
    const rand = rng(31);
    g.fillStyle = '#211a16';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 26; i++) {
      const x = rand() * 128, y = rand() * 128, r = 4 + rand() * 12;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const rust = rand() < 0.5 ? '120,56,22' : '82,40,22';
      grad.addColorStop(0, `rgba(${rust},0.8)`);
      grad.addColorStop(1, `rgba(${rust},0)`);
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(0,0,0,${0.2 + rand() * 0.4})`;
      g.fillRect(rand() * 128, rand() * 128, 1 + rand() * 3, 1 + rand() * 3);
    }
  });
}

/** Car side panel: burnt body with empty window openings, door seams and wheel arches. */
function carSideTexture(scene: Scene): DynamicTexture {
  // Matches the car profile: u = (x + 2.15) / 4.3, v = y / 1.6.
  const W = 256, H = 128;
  const px = (x: number) => ((x + 2.15) / 4.3) * W, py = (y: number) => (1 - y / 1.6) * H;
  return canvasTexture(scene, 'carSide', W, H, (g) => {
    const rand = rng(32);
    g.fillStyle = '#241c17';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {
      const x = rand() * W, y = rand() * H, r = 3 + rand() * 14;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(126,58,24,0.75)');
      grad.addColorStop(1, 'rgba(126,58,24,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Empty window openings.
    g.fillStyle = '#0c0907';
    g.beginPath();
    g.moveTo(px(1.02), py(1.0));
    g.lineTo(px(0.45), py(1.4));
    g.lineTo(px(-0.58), py(1.44));
    g.lineTo(px(-1.12), py(1.04));
    g.closePath();
    g.fill();
    // Door pillar and seams.
    g.fillStyle = '#2a201a';
    g.fillRect(px(-0.12), py(1.45), 6, py(0.98) - py(1.45));
    g.strokeStyle = 'rgba(8,6,5,0.9)';
    g.lineWidth = 2;
    for (const x of [0.95, -0.1, -1.1]) {
      g.beginPath();
      g.moveTo(px(x), py(0.98));
      g.lineTo(px(x), py(0.35));
      g.stroke();
    }
    // Wheel arches.
    g.fillStyle = '#0a0806';
    for (const x of [1.35, -1.35]) {
      g.beginPath();
      g.arc(px(x), py(0.33), (0.45 / 4.3) * W, Math.PI, 0);
      g.fill();
    }
  });
}

/** A soft round blob: bright middle fading to nothing (light pools, smoke, sun). */
export function softDot(scene: Scene, name: string): DynamicTexture {
  const tex = canvasTexture(scene, name, 64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }, false);
  tex.hasAlpha = true;
  return tex;
}

/** Stretch a box's texture so bricks stay brick-sized on big walls. */
function tileUVs(mesh: Mesh, su: number, sv: number): void {
  const uvs = mesh.getVerticesData(VertexBuffer.UVKind)!;
  for (let i = 0; i < uvs.length; i += 2) {
    uvs[i] *= su;
    uvs[i + 1] *= sv;
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uvs);
}

function material(scene: Scene, name: string, make: (m: StandardMaterial) => void): StandardMaterial {
  const existing = scene.getMaterialByName(name) as StandardMaterial | null;
  if (existing) return existing;
  const m = new StandardMaterial(name, scene);
  m.specularColor = new Color3(0.03, 0.03, 0.03);
  make(m);
  return m;
}

function merge(meshes: Mesh[], mat: StandardMaterial, name: string): Mesh | null {
  if (meshes.length === 0) return null;
  const m = Mesh.MergeMeshes(meshes, true, true)!;
  m.name = name;
  m.material = mat;
  m.isPickable = false;
  return m;
}

// ----------------------------------------------------------------------------
//  Gutted brick buildings
// ----------------------------------------------------------------------------

const GROUND_BASE = -3; // walls start below ground so they look planted
/** How tall the near row stays when cut away (fraction of full height). */
const CUTAWAY = 0.14;
const ALLEY_WIDTH = 4;
const FLOOR_H = 2.7;

interface Parts { brick: Mesh[]; stone: Mesh[]; dark: Mesh[]; rebar: Mesh[] }

/**
 * One ruined building: brick piers and floor bands forming a grid of empty
 * window openings, a dark gutted interior behind, stone cornices and sills,
 * a broken skyline where floors have fallen, and rubble at its feet.
 */
function building(scene: Scene, p: Parts, rand: () => number, x0: number, w: number, side: 1 | -1, front: number): { d: number; H: number } {
  const d = 7 + rand() * 3;
  const H = 11 + rand() * 22;
  const nb = Math.max(2, Math.round(w / 2.3));
  const bayW = w / nb;
  const nf = Math.floor(H / FLOOR_H);
  const zIn = (depth: number) => front + side * depth; // into the building
  const box = (list: Mesh[], bw: number, bh: number, bd: number, x: number, y: number, z: number, tile = 2) => {
    const m = MeshBuilder.CreateBox('b', { width: bw, height: bh, depth: bd }, scene);
    m.position.set(x, y, z);
    tileUVs(m, Math.max(bw, bd) / tile, bh / tile);
    list.push(m);
    return m;
  };

  // Where it has crumbled: a dip in the skyline somewhere along the front.
  const dipAt = rand() * nb, dipDepth = rand() * H * 0.5, dipWidth = 1 + rand() * nb * 0.6;
  const tops: number[] = [];
  for (let i = 0; i <= nb; i++) {
    const dip = Math.max(0, 1 - Math.abs(i - dipAt) / dipWidth) * dipDepth;
    tops.push(Math.max(FLOOR_H * 2, H - dip - rand() * FLOOR_H));
  }

  // Piers: the brick columns between windows.
  for (let i = 0; i <= nb; i++) {
    const x = x0 + i * bayW, top = tops[i];
    box(p.brick, 0.6, top - GROUND_BASE, 0.8, x, (top + GROUND_BASE) / 2, zIn(0.4));
    if (rand() < 0.5) {
      // Rebar sticking out of a broken pier.
      const len = 0.6 + rand() * 1.2;
      const bar = MeshBuilder.CreateCylinder('r', { height: len, diameter: 0.08, tessellation: 4 }, scene);
      bar.position.set(x + (rand() - 0.5) * 0.3, top + len / 2, zIn(0.4));
      bar.rotation.set((rand() - 0.5) * 0.8, 0, (rand() - 0.5) * 0.8);
      p.rebar.push(bar);
    }
  }
  // Floor bands across each bay, with a stone sill under each window.
  for (let f = 1; f <= nf; f++) {
    const y = f * FLOOR_H + (f === 1 ? 0.8 : 0); // tall storefronts at street level
    for (let i = 0; i < nb; i++) {
      const top = Math.min(tops[i], tops[i + 1]);
      if (y + 0.7 > top || rand() < 0.06) continue; // fallen away
      const x = x0 + (i + 0.5) * bayW;
      box(p.brick, bayW - 0.6, 0.75, 0.6, x, y + 0.37, zIn(0.35));
      box(p.stone, bayW - 0.5, 0.14, 0.85, x, y + 0.8, zIn(0.3), 3);
    }
  }
  // Stone string course and cornice where the wall still stands that high.
  for (const y of [FLOOR_H + 0.8 + 0.85, Math.floor(Math.min(...tops) / FLOOR_H) * FLOOR_H - 0.2]) {
    if (y < FLOOR_H) continue;
    for (let i = 0; i < nb; i++) {
      if (Math.min(tops[i], tops[i + 1]) < y + 0.3) continue;
      box(p.stone, bayW + 0.02, 0.4, 1.15, x0 + (i + 0.5) * bayW, y, zIn(0.2), 3);
    }
  }
  // The gutted interior: a dark back wall and the edges of floors behind the windows.
  const inner = Math.min(...tops) * 0.95;
  box(p.dark, w, inner - GROUND_BASE, 0.4, x0 + w / 2, (inner + GROUND_BASE) / 2, zIn(d - 0.2));
  for (let f = 1; f <= nf; f++) {
    const y = f * FLOOR_H + (f === 1 ? 0.8 : 0);
    if (y > inner || rand() < 0.25) continue;
    box(p.dark, w - 0.8, 0.25, d - 1.4, x0 + w / 2, y, zIn(d / 2 + 0.3));
  }
  // End walls (alley sides).
  for (const [x, top] of [[x0, tops[0]], [x0 + w, tops[nb]]]) {
    box(p.brick, 0.5, top * 0.92 - GROUND_BASE, d, x, (top * 0.92 + GROUND_BASE) / 2, zIn(d / 2));
  }
  // Rubble spilling from the foot of the wall.
  for (let k = 0; k < 16; k++) {
    const sz = 0.25 + rand() * 0.7;
    const rb = MeshBuilder.CreateBox('rb', { width: sz * 1.6, height: sz * 0.7, depth: sz }, scene);
    rb.position.set(x0 + rand() * w, -0.1 + rand() * 0.4, front - side * rand() * 1.1);
    rb.rotation.set(rand(), rand() * 3, rand());
    (rand() < 0.65 ? p.brick : p.stone).push(rb);
  }
  return { d, H };
}

/** Where one building's vertices sit inside a row's merged mesh. */
interface VertexRange { mesh: Mesh; start: number; count: number }

/** One building along the street, so it can be brought down on its own. */
interface Building {
  side: 1 | -1;
  x0: number;
  w: number;
  d: number;
  H: number;
  front: number;
  ranges: VertexRange[];
  /** How far it has collapsed, 0 (standing) to 1 (a pile of ruins). */
  fall: number;
  falling: boolean;
}

interface City {
  rows: { side: 1 | -1; meshes: Mesh[] }[];
  buildings: Building[];
  /** Each row mesh's vertices as built, to collapse buildings from. */
  original: Map<Mesh, Float32Array>;
}

function buildCity(scene: Scene, map: MapDef): City {
  const rand = rng(1979);
  const brickMat = material(scene, 'cityBrick', (m) => { m.diffuseTexture = brickTexture(scene); });
  const stoneMat = material(scene, 'cityStone', (m) => { m.diffuseTexture = stoneTexture(scene); });
  const darkMat = material(scene, 'cityInterior', (m) => {
    m.diffuseColor = new Color3(0.12, 0.08, 0.06);
    m.specularColor = Color3.Black();
  });
  const rebarMat = material(scene, 'rebar', (m) => { m.diffuseColor = new Color3(0.32, 0.15, 0.07); });
  const hd = map.depth / 2;
  const rows: { side: 1 | -1; meshes: Mesh[] }[] = [];
  const buildings: Building[] = [];
  const original = new Map<Mesh, Float32Array>();

  for (const side of [1, -1] as const) {
    const edge = side > 0 ? 'north' : 'south';
    const alleys = map.alleys?.[edge] ?? [];
    const parts: Parts = { brick: [], stone: [], dark: [], rebar: [] };
    const front = side * (hd + 0.9);
    const spans: { before: number[]; after: number[]; b: Building }[] = [];
    let x = -map.width / 2 - 12;
    while (x < map.width / 2 + 12) {
      let w = 6 + rand() * 6;
      // Leave a gap for each alley.
      const alley = alleys.find((a) => a + ALLEY_WIDTH / 2 > x && a - ALLEY_WIDTH / 2 < x + w);
      if (alley !== undefined) {
        if (alley - ALLEY_WIDTH / 2 - x > 3) w = alley - ALLEY_WIDTH / 2 - x;
        else {
          // Junk in the alley mouth.
          for (let k = 0; k < 6; k++) {
            const sz = 0.3 + rand() * 0.6;
            const rb = MeshBuilder.CreateBox('rb', { width: sz, height: sz * 0.6, depth: sz * 1.4 }, scene);
            rb.position.set(alley + (rand() - 0.5) * ALLEY_WIDTH, 0, front + side * rand() * 4);
            rb.rotation.set(rand(), rand() * 3, rand());
            parts.stone.push(rb);
          }
          x = alley + ALLEY_WIDTH / 2;
          continue;
        }
      }
      const before = PART_KINDS.map((k) => parts[k].length);
      const { d, H } = building(scene, parts, rand, x, w, side, front);
      spans.push({ before, after: PART_KINDS.map((k) => parts[k].length), b: { side, x0: x, w, d, H, front, ranges: [], fall: 0, falling: false } });
      x += w + 0.4;
    }
    // Count vertices before merging (the merge disposes the parts), so each
    // building knows where its vertices land in the merged meshes.
    const counts = PART_KINDS.map((k) => parts[k].map((m) => m.getTotalVertices()));
    const mats = { brick: brickMat, stone: stoneMat, dark: darkMat, rebar: rebarMat };
    const merged = PART_KINDS.map((k) => merge(parts[k], mats[k], `city-${k}-${edge}`));
    for (const m of merged) {
      if (!m) continue;
      m.markVerticesDataAsUpdatable(VertexBuffer.PositionKind, true);
      original.set(m, new Float32Array(m.getVerticesData(VertexBuffer.PositionKind)!));
    }
    for (const { before, after, b } of spans) {
      PART_KINDS.forEach((_, k) => {
        const mesh = merged[k];
        if (!mesh || after[k] === before[k]) return;
        const sum = (n: number) => counts[k].slice(0, n).reduce((a, c) => a + c, 0);
        b.ranges.push({ mesh, start: sum(before[k]), count: sum(after[k]) - sum(before[k]) });
      });
      buildings.push(b);
    }
    rows.push({ side, meshes: merged.filter((m): m is Mesh => m !== null) });
  }
  return { rows, buildings, original };
}

const PART_KINDS = ['brick', 'stone', 'dark', 'rebar'] as const;

// ----------------------------------------------------------------------------
//  Buildings coming down
// ----------------------------------------------------------------------------

/** How long a building takes to come down, and how much of it is left. */
const COLLAPSE_TIME = 1.6;
const RUIN_HEIGHT = 0.16;

interface Brick { mesh: Mesh; vx: number; vy: number; vz: number; spin: Vector3; floor: number }

/** Squash a building's vertices toward the ground, leaning into the street and shuddering. */
function poseBuilding(b: Building, original: Map<Mesh, Float32Array>): void {
  const k = b.fall * b.fall; // slow to start, then it goes
  const scale = 1 - (1 - RUIN_HEIGHT) * k;
  const lean = -b.side * 0.1 * Math.sin(b.fall * Math.PI);
  const shudder = b.falling ? (1 - b.fall) * 0.12 : 0;
  const jx = (Math.random() - 0.5) * shudder, jz = (Math.random() - 0.5) * shudder;
  for (const r of b.ranges) {
    const src = original.get(r.mesh)!;
    const pos = r.mesh.getVerticesData(VertexBuffer.PositionKind)!;
    for (let v = r.start; v < r.start + r.count; v++) {
      const i = v * 3;
      const up = src[i + 1] - GROUND_BASE;
      pos[i] = src[i] + jx;
      pos[i + 1] = GROUND_BASE + up * scale;
      pos[i + 2] = src[i + 2] + jz + lean * up;
    }
    r.mesh.updateVerticesData(VertexBuffer.PositionKind, pos);
  }
}

/** A billowing cloud of dust from the whole front of the building. */
function dustCloud(scene: Scene, b: Building): void {
  const dust = new ParticleSystem('collapseDust', 400, scene);
  dust.particleTexture = softDot(scene, 'dustTex');
  dust.emitter = new Vector3(b.x0 + b.w / 2, 0, b.front + b.side * b.d / 2);
  dust.minEmitBox = new Vector3(-b.w / 2, 0, -b.d / 2);
  dust.maxEmitBox = new Vector3(b.w / 2, b.H * 0.5, b.d / 2);
  dust.color1 = new Color4(0.55, 0.4, 0.28, 0.55);
  dust.color2 = new Color4(0.45, 0.33, 0.24, 0.45);
  dust.colorDead = new Color4(0.5, 0.38, 0.28, 0);
  dust.minSize = 2;
  dust.maxSize = 5.5;
  dust.minLifeTime = 2;
  dust.maxLifeTime = 4.5;
  dust.minScaleX = dust.minScaleY = 1;
  dust.emitRate = 160;
  dust.manualEmitCount = 120;
  dust.direction1 = new Vector3(-1, 0.4, -b.side * 1.5);
  dust.direction2 = new Vector3(1, 1.2, -b.side * 0.2);
  dust.minEmitPower = 1;
  dust.maxEmitPower = 3;
  dust.gravity = new Vector3(0, 0.3, 0);
  dust.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  dust.targetStopDuration = COLLAPSE_TIME;
  dust.disposeOnStop = true;
  dust.start();
}

/** Bricks thrown out into the street, where they stay as rubble. */
function throwBricks(scene: Scene, b: Building, terrain: Terrain): Brick[] {
  const mat = scene.getMaterialByName('cityBrick') as StandardMaterial;
  const bricks: Brick[] = [];
  for (let i = 0; i < 26; i++) {
    const sz = 0.3 + Math.random() * 0.6;
    const mesh = MeshBuilder.CreateBox('brick', { width: sz * 1.5, height: sz * 0.7, depth: sz }, scene);
    mesh.material = mat;
    mesh.isPickable = false;
    const x = b.x0 + Math.random() * b.w;
    mesh.position.set(x, 2 + Math.random() * b.H * 0.6, b.front + b.side * Math.random());
    bricks.push({
      mesh,
      vx: (Math.random() - 0.5) * 3,
      vy: Math.random() * 4,
      vz: -b.side * (2 + Math.random() * 5),
      spin: new Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      floor: terrain.surfaceHeight(x, b.front) + sz * 0.3,
    });
  }
  return bricks;
}

/** How far the outer ground reaches: past the camera's far plane, lost in the haze. */
const OUTER_REACH = 450;

/**
 * Grid lines along one axis: every 2 units near the map, then spreading out
 * as they head into the haze where detail can't be seen.
 */
function outerLines(half: number): number[] {
  const near = half + 40;
  const out: number[] = [];
  for (let v = 0; v <= near; v += 2) out.push(v);
  for (let step = 4, v = near + step; ; step *= 1.4, v += step) {
    out.push(Math.min(v, OUTER_REACH));
    if (v >= OUTER_REACH) break;
  }
  return [...out.slice(1).reverse().map((v) => -v), ...out];
}

/**
 * Ground beyond the map edges, so the city stands on something. It runs out
 * far enough that its edge is swallowed by the fog, with no sky showing
 * between the street and the buildings or skyline.
 */
function buildOuterGround(scene: Scene, map: MapDef, terrain: Terrain, color: Color3): void {
  const xs = outerLines(map.width / 2), zs = outerLines(map.depth / 2).reverse();
  const positions: number[] = [], indices: number[] = [], uvs: number[] = [];
  for (const z of zs) {
    for (const x of xs) {
      // Sunk out of sight under the map itself, so it doesn't fill the ravines.
      const underMap = Math.abs(x) < map.width / 2 - 0.5 && Math.abs(z) < map.depth / 2 - 0.5;
      // Follows the hills near the map, easing flat further out.
      const beyond = Math.max(Math.abs(x) - map.width / 2, Math.abs(z) - map.depth / 2);
      const hill = terrain.surfaceHeight(x, z) * Math.max(0, 1 - beyond / 40);
      positions.push(x, underMap ? -30 : hill - 0.3, z);
      uvs.push(x / 8, z / 8);
    }
  }
  const row = xs.length;
  for (let r = 0; r < zs.length - 1; r++) {
    for (let c = 0; c < row - 1; c++) {
      const i = r * row + c;
      indices.push(i + 1 + row, i + 1, i, i + row, i + 1 + row, i);
    }
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  Object.assign(data, { positions, indices, normals, uvs });
  const ground = new Mesh('outerGround', scene);
  data.applyToMesh(ground);
  ground.material = material(scene, 'outerGround', (m) => {
    m.diffuseColor = color.scale(0.7);
    m.specularColor = Color3.Black();
  });
  ground.isPickable = false;
}

/** Tower silhouettes fading into the haze beyond both ends of the street, and a low sun. */
function buildSkyline(scene: Scene, map: MapDef): void {
  const rand = rng(2077);
  const towers: Mesh[] = [];
  for (const end of [-1, 1]) {
    for (let i = 0; i < 26; i++) {
      const w = 4 + rand() * 7, h = 25 + rand() * 60;
      const t = MeshBuilder.CreateBox('sky', { width: w, height: h, depth: 5 + rand() * 8 }, scene);
      // Far off, so the haze turns them into faint silhouettes.
      t.position.set(end * (map.width / 2 + 70 + rand() * 140), h / 2 - 3, (rand() - 0.5) * 120);
      towers.push(t);
      if (rand() < 0.4) {
        // A spire or broken mast on top.
        const sp = MeshBuilder.CreateBox('sky', { width: 1 + rand() * 2, height: 6 + rand() * 14, depth: 1.5 }, scene);
        sp.position.set(t.position.x + (rand() - 0.5) * w * 0.5, h - 3 + 4, t.position.z);
        towers.push(sp);
      }
    }
  }
  merge(towers, material(scene, 'skyline', (m) => {
    m.diffuseColor = new Color3(0.33, 0.2, 0.12);
    m.specularColor = Color3.Black();
  }), 'skyline');

  // A dim, swollen sun low in the haze.
  const sun = MeshBuilder.CreatePlane('hazeSun', { size: 22 }, scene);
  sun.billboardMode = Mesh.BILLBOARDMODE_ALL;
  sun.position.set(-40, 38, 150);
  sun.isPickable = false;
  sun.material = material(scene, 'hazeSun', (m) => {
    m.emissiveColor = new Color3(1, 0.55, 0.22);
    m.diffuseColor = Color3.Black();
    m.opacityTexture = softDot(scene, 'sunTex');
    m.disableLighting = true;
    m.fogEnabled = false;
    m.alphaMode = Engine.ALPHA_ADD;
  });
}

// ----------------------------------------------------------------------------
//  Burnt-out car wrecks (stand in for rocks)
// ----------------------------------------------------------------------------

/** Side-view outline of a sedan (x along the car, y up), counter-clockwise. */
const CAR_PROFILE: [number, number][] = [
  [-2.05, 0.3], [2.05, 0.3], [2.13, 0.55], [2.06, 0.82], [1.15, 0.95], [0.42, 1.48],
  [-0.62, 1.52], [-1.25, 1.02], [-2.0, 0.95], [-2.13, 0.6],
];
/** Edges of the outline that are empty windows (windshield, rear window). */
const CAR_WINDOW_EDGES = new Set([4, 6]);

function carParts(scene: Scene, name: string, s: number): { sides: Mesh; body: Mesh; holes: Mesh } {
  const hw = 0.92;
  const P = CAR_PROFILE;
  // Sides: a fan from the middle of the outline, on both flanks.
  const sp: number[] = [], sn: number[] = [], su: number[] = [], si: number[] = [];
  for (const z of [hw, -hw]) {
    const base = sp.length / 3;
    sp.push(0, 0.85 * s, z * s);
    sn.push(0, 0, Math.sign(z));
    su.push(2.15 / 4.3, 0.85 / 1.6);
    for (const [x, y] of P) {
      sp.push(x * s, y * s, z * s);
      sn.push(0, 0, Math.sign(z));
      su.push((x + 2.15) / 4.3, y / 1.6);
    }
    for (let i = 0; i < P.length; i++) si.push(base, base + 1 + i, base + 1 + ((i + 1) % P.length));
  }
  const sides = new Mesh(`${name}-sides`, scene);
  Object.assign(new VertexData(), { positions: sp, normals: sn, uvs: su, indices: si }).applyToMesh(sides);

  // Skin: a strip around the outline joining the two flanks.
  const build = (pick: (i: number) => boolean, meshName: string) => {
    const bp: number[] = [], bn: number[] = [], bu: number[] = [], bi: number[] = [];
    for (let i = 0; i < P.length; i++) {
      if (!pick(i)) continue;
      const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length];
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
      const nx = dy / len, ny = -dx / len; // outward for a counter-clockwise outline
      const inset = CAR_WINDOW_EDGES.has(i) ? 0.12 : 0; // window holes sit back a little
      const base = bp.length / 3;
      for (const [x, y, z] of [[x0, y0, hw], [x1, y1, hw], [x1, y1, -hw], [x0, y0, -hw]]) {
        bp.push((x - nx * inset) * s, (y - ny * inset) * s, z * s);
        bn.push(nx, ny, 0);
      }
      bu.push(0, 0, len, 0, len, 1, 0, 1);
      bi.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const m = new Mesh(meshName, scene);
    Object.assign(new VertexData(), { positions: bp, normals: bn, uvs: bu, indices: bi }).applyToMesh(m);
    return m;
  };
  return {
    sides,
    body: build((i) => !CAR_WINDOW_EDGES.has(i), `${name}-body`),
    holes: build((i) => CAR_WINDOW_EDGES.has(i), `${name}-holes`),
  };
}

/**
 * A burnt-out sedan about as big as the rock it replaces (radius r): charred,
 * rust-eaten shell, empty windows, flat tires in their arches (one gone,
 * leaving the rim), embers still glowing inside, and a wisp of smoke.
 */
export function buildCarWreck(scene: Scene, name: string, r: number, seed: number): TransformNode {
  const rand = rng(seed);
  const s = r / 2.1;
  const root = new TransformNode(name, scene);
  const sideMat = material(scene, 'carSide', (m) => {
    m.diffuseTexture = carSideTexture(scene);
    m.backFaceCulling = false;
  });
  const bodyMat = material(scene, 'carBody', (m) => {
    m.diffuseTexture = wreckTexture(scene);
    m.backFaceCulling = false;
  });
  const holeMat = material(scene, 'carHole', (m) => {
    m.diffuseColor = new Color3(0.05, 0.035, 0.03);
    m.backFaceCulling = false;
  });
  const tireMat = material(scene, 'carTire', (m) => { m.diffuseColor = new Color3(0.07, 0.06, 0.06); });
  const rimMat = material(scene, 'carRim', (m) => { m.diffuseColor = new Color3(0.3, 0.2, 0.14); });
  const emberMat = material(scene, 'carEmber', (m) => {
    m.emissiveColor = new Color3(1, 0.42, 0.1);
    m.diffuseColor = Color3.Black();
  });

  const { sides, body, holes } = carParts(scene, name, s);
  sides.material = sideMat;
  body.material = bodyMat;
  holes.material = holeMat;
  for (const m of [sides, body, holes]) {
    m.parent = root;
    m.isPickable = false;
  }
  // Squashed a little: the roof has sagged over the years.
  root.scaling.set(1, 0.92 + rand() * 0.08, 1);

  const missing = Math.floor(rand() * 4);
  [[1.35, 0.8], [1.35, -0.8], [-1.35, 0.8], [-1.35, -0.8]].forEach(([wx, wz], i) => {
    const wheel = MeshBuilder.CreateCylinder(`${name}-tire`, {
      height: 0.28 * s, diameter: (i === missing ? 0.5 : 0.72) * s, tessellation: 14,
    }, scene);
    wheel.rotation.x = Math.PI / 2;
    wheel.scaling.z = i === missing ? 1 : 0.8; // flat
    wheel.position.set(wx * s, (i === missing ? 0.2 : 0.3) * s, wz * s);
    wheel.material = i === missing ? rimMat : tireMat;
    wheel.parent = root;
    wheel.isPickable = false;
  });
  // Embers still smouldering in the cabin and engine bay.
  for (let i = 0; i < 3; i++) {
    const ember = MeshBuilder.CreateSphere(`${name}-ember`, { diameter: (0.1 + rand() * 0.12) * s, segments: 4 }, scene);
    ember.position.set((rand() - 0.2) * 2 * s, 0.9 * s, (rand() - 0.5) * 1.1 * s);
    ember.material = emberMat;
    ember.parent = root;
    ember.isPickable = false;
  }
  // A thin wisp of smoke.
  const smoke = new ParticleSystem(`${name}-smoke`, 40, scene);
  smoke.particleTexture = softDot(scene, `${name}-smokeTex`);
  const emitter = MeshBuilder.CreateBox(`${name}-smokeAt`, { size: 0.01 }, scene);
  emitter.isVisible = false;
  emitter.isPickable = false;
  emitter.parent = root;
  emitter.position.set(1.2 * s, 1 * s, 0);
  smoke.emitter = emitter;
  smoke.minEmitBox = new Vector3(-0.3, 0, -0.3);
  smoke.maxEmitBox = new Vector3(0.3, 0, 0.3);
  smoke.color1 = new Color4(0.25, 0.22, 0.2, 0.35);
  smoke.color2 = new Color4(0.35, 0.3, 0.26, 0.25);
  smoke.colorDead = new Color4(0.4, 0.35, 0.3, 0);
  smoke.minSize = 0.6 * s;
  smoke.maxSize = 1.6 * s;
  smoke.minLifeTime = 2.5;
  smoke.maxLifeTime = 4.5;
  smoke.emitRate = 6;
  smoke.direction1 = new Vector3(-0.2, 1, -0.1);
  smoke.direction2 = new Vector3(0.3, 1, 0.2);
  smoke.minEmitPower = 0.3;
  smoke.maxEmitPower = 0.7;
  smoke.gravity = new Vector3(0.15, 0.05, 0);
  smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  smoke.start();
  return root;
}

// ----------------------------------------------------------------------------
//  Street lamps, hydrants and bins
// ----------------------------------------------------------------------------

interface Lamp { bulb: StandardMaterial; pool: StandardMaterial; seed: number; level: number }

/** Warm sodium amber, still running on some mystery nuclear battery. */
const LAMP_COLOR = new Color3(1, 0.68, 0.32);
const LAMP_Z = 7.5;
const LAMP_SPACING = 9.5;

function buildLamps(scene: Scene, map: MapDef, terrain: Terrain, glow: GlowLayer): Lamp[] {
  const lamps: Lamp[] = [];
  const rand = rng(42);
  const ironMat = material(scene, 'lampIron', (m) => { m.diffuseColor = new Color3(0.13, 0.1, 0.09); });
  const poolTex = softDot(scene, 'lampPool');
  let i = 0;
  for (const side of [1, -1]) {
    for (let x = -map.width / 2 + 6 + (side < 0 ? 4.5 : 0); x < map.width / 2 - 3; x += LAMP_SPACING) {
      const z = side * LAMP_Z;
      const y = terrain.surfaceHeight(x, z);
      const root = new TransformNode(`lamp${i}`, scene);
      root.position.set(x, y, z);
      root.rotation.set((rand() - 0.5) * 0.1, 0, (rand() - 0.5) * 0.1); // old and leaning
      const base = MeshBuilder.CreateCylinder(`lamp${i}-base`, { height: 0.7, diameterTop: 0.22, diameterBottom: 0.38, tessellation: 8 }, scene);
      base.position.y = 0.35;
      const pole = MeshBuilder.CreateCylinder(`lamp${i}-pole`, { height: 4.3, diameterTop: 0.09, diameterBottom: 0.16, tessellation: 8 }, scene);
      pole.position.y = 2.8;
      // Curved arm reaching out over the street.
      const arc: Vector3[] = [];
      for (let k = 0; k <= 12; k++) {
        const a = (k / 12) * (Math.PI / 2);
        arc.push(new Vector3(0, 4.9 + Math.sin(a) * 0.5, -side * (1 - Math.cos(a)) * 1.3));
      }
      arc.push(new Vector3(0, 5.4, -side * 1.6));
      const arm = MeshBuilder.CreateTube(`lamp${i}-arm`, { path: arc, radius: 0.05, tessellation: 6 }, scene);
      const head = MeshBuilder.CreateCylinder(`lamp${i}-head`, { height: 0.3, diameterTop: 0.14, diameterBottom: 0.5, tessellation: 10 }, scene);
      head.position.set(0, 5.25, -side * 1.6);
      for (const m of [base, pole, arm, head]) {
        m.parent = root;
        m.material = ironMat;
        m.isPickable = false;
      }
      const bulbMat = new StandardMaterial(`lamp${i}-bulb`, scene);
      bulbMat.diffuseColor = Color3.Black();
      bulbMat.emissiveColor = LAMP_COLOR.scale(0.7);
      const bulb = MeshBuilder.CreateSphere(`lamp${i}-bulbMesh`, { diameterX: 0.36, diameterY: 0.16, diameterZ: 0.36, segments: 8 }, scene);
      bulb.parent = root;
      bulb.position.set(0, 5.08, -side * 1.6);
      bulb.material = bulbMat;
      bulb.isPickable = false;
      // A pool of light on the street under it (kept off the ravines).
      const poolMat = new StandardMaterial(`lamp${i}-pool`, scene);
      poolMat.diffuseColor = Color3.Black();
      poolMat.specularColor = Color3.Black();
      poolMat.emissiveColor = LAMP_COLOR.scale(0.35);
      poolMat.opacityTexture = poolTex;
      poolMat.disableLighting = true;
      poolMat.alphaMode = Engine.ALPHA_ADD;
      const px = x, pz = z - side * 1.8;
      const pool = MeshBuilder.CreateDisc(`lamp${i}-poolMesh`, { radius: 2.6, tessellation: 32 }, scene);
      pool.rotation.x = Math.PI / 2;
      pool.position.set(px, terrain.surfaceHeight(px, pz) + 0.06, pz);
      pool.material = poolMat;
      pool.isPickable = false;
      glow.addExcludedMesh(pool);
      lamps.push({ bulb: bulbMat, pool: poolMat, seed: i * 17 + 3, level: 0.7 });
      i++;
    }
  }
  return lamps;
}

/** Rusted fire hydrants and knocked-over bins along the sidewalks. */
function buildStreetFurniture(scene: Scene, map: MapDef, terrain: Terrain): void {
  const rand = rng(64);
  const hydrantMat = material(scene, 'hydrant', (m) => { m.diffuseColor = new Color3(0.45, 0.14, 0.08); });
  const binMat = material(scene, 'bin', (m) => { m.diffuseColor = new Color3(0.18, 0.2, 0.15); });
  const hydrants: Mesh[] = [], bins: Mesh[] = [];
  for (const side of [1, -1]) {
    const lampStart = -map.width / 2 + 6 + (side < 0 ? 4.5 : 0);
    for (let x = -map.width / 2 + 4; x < map.width / 2 - 2; x += 6 + rand() * 7) {
      const fromLamp = (((x - lampStart) % LAMP_SPACING) + LAMP_SPACING) % LAMP_SPACING;
      if (fromLamp < 1.2 || fromLamp > LAMP_SPACING - 1.2) continue; // not on top of a lamp
      const z = side * (LAMP_Z - 0.3 + rand() * 0.5);
      const y = terrain.surfaceHeight(x, z);
      if (rand() < 0.45) {
        const body = MeshBuilder.CreateCylinder('h', { height: 0.6, diameter: 0.26, tessellation: 8 }, scene);
        body.position.set(x, y + 0.3, z);
        const cap = MeshBuilder.CreateSphere('h', { diameter: 0.3, segments: 6 }, scene);
        cap.position.set(x, y + 0.62, z);
        const nozzle = MeshBuilder.CreateCylinder('h', { height: 0.36, diameter: 0.1, tessellation: 6 }, scene);
        nozzle.rotation.z = Math.PI / 2;
        nozzle.position.set(x, y + 0.42, z);
        hydrants.push(body, cap, nozzle);
      } else {
        const bin = MeshBuilder.CreateCylinder('b', { height: 0.8, diameterTop: 0.55, diameterBottom: 0.45, tessellation: 10 }, scene);
        const knocked = rand() < 0.4;
        bin.position.set(x, y + (knocked ? 0.25 : 0.4), z);
        if (knocked) bin.rotation.set(Math.PI / 2, rand() * 3, 0);
        bins.push(bin);
      }
    }
  }
  merge(hydrants, hydrantMat, 'hydrants');
  merge(bins, binMat, 'bins');
}

/** How bright a lamp should be right now. */
function lampLevel(t: number, seed: number, boss: boolean): number {
  if (boss) {
    // ZomWes is coming: fast, bright, frantic flicker.
    const r = hash(Math.floor(t * 16), seed);
    return r < 0.3 ? 0.1 : 1.3 + r * 0.9;
  }
  // Normally: a slow, lazy wobble with the occasional brief dropout.
  let level = 0.62 + 0.14 * Math.sin(t * 1.1 + seed) + 0.08 * Math.sin(t * 2.9 + seed * 2.3);
  if (hash(Math.floor(t * 1.5), seed) < 0.07) level *= 0.25;
  return level;
}

// ----------------------------------------------------------------------------
//  Tumbleweeds
// ----------------------------------------------------------------------------

interface Weed { node: Mesh; x: number; z: number; r: number; speed: number; phase: number; band: [number, number] }

function buildTumbleweedMesh(scene: Scene): Mesh {
  const rand = rng(5);
  const parts: Mesh[] = [];
  // A tangle of thin, curving twigs inside a ball.
  for (let k = 0; k < 22; k++) {
    let dir = new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const turn = new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const path: Vector3[] = [];
    for (let i = 0; i < 12; i++) {
      dir = dir.add(turn.scale(0.35)).normalize();
      path.push(dir.scale(0.7 + 0.3 * Math.sin(i * 0.8 + k)));
    }
    parts.push(MeshBuilder.CreateTube(`weed${k}`, { path, radius: 0.028, tessellation: 4 }, scene));
  }
  const weed = Mesh.MergeMeshes(parts, true)!;
  weed.material = material(scene, 'tumbleweed', (m) => {
    m.diffuseColor = new Color3(0.62, 0.47, 0.28);
    m.emissiveColor = new Color3(0.12, 0.08, 0.04);
    m.backFaceCulling = false;
  });
  weed.isPickable = false;
  weed.setEnabled(false);
  return weed;
}

function buildTumbleweeds(scene: Scene, map: MapDef): Weed[] {
  const template = buildTumbleweedMesh(scene);
  const rand = rng(9);
  const hd = map.depth / 2;
  // Down the street, and along the strips behind the ravines.
  const bands: [number, number][] = [[-6, 6], [-6, 6], [-6, 6], [11.5, hd - 1], [-hd + 1, -11.5]];
  const weeds: Weed[] = [];
  for (let i = 0; i < 7; i++) {
    const band = bands[i % bands.length];
    const node = template.clone(`tumbleweed${i}`)!;
    node.setEnabled(true);
    const r = 0.45 + rand() * 0.35;
    node.scaling.setAll(r);
    weeds.push({
      node, r, band,
      x: -map.width / 2 + rand() * map.width,
      z: band[0] + rand() * (band[1] - band[0]),
      speed: 1.6 + rand() * 1.4,
      phase: rand() * 10,
    });
  }
  return weeds;
}

// ----------------------------------------------------------------------------

export function createRuinedCity(scene: Scene, map: MapDef, terrain: Terrain, glow: GlowLayer, ground: Color3): Decor {
  buildOuterGround(scene, map, terrain, ground);
  buildSkyline(scene, map);
  const city = buildCity(scene, map);
  const lamps = buildLamps(scene, map, terrain, glow);
  buildStreetFurniture(scene, map, terrain);
  const weeds = buildTumbleweeds(scene, map);
  let t = 0;
  let dark = false;
  let wind = 1;
  const bricks: Brick[] = [];

  return {
    crumble(x, z, reach) {
      let best: Building | null = null, bestDist = reach;
      for (const b of city.buildings) {
        if (b.fall > 0) continue;
        const dx = Math.max(b.x0 - x, 0, x - (b.x0 + b.w));
        const dist = Math.hypot(dx, b.front - z);
        if (dist <= bestDist) {
          best = b;
          bestDist = dist;
        }
      }
      if (!best) return false;
      best.falling = true;
      best.fall = 0.001;
      dustCloud(scene, best);
      bricks.push(...throwBricks(scene, best, terrain));
      return true;
    },
    blackout(on) {
      dark = on;
    },
    setWind(strength) {
      wind = strength;
    },
    update(dt, bossActive) {
      t += dt;
      for (const b of city.buildings) {
        if (!b.falling) continue;
        b.fall = Math.min(1, b.fall + dt / COLLAPSE_TIME);
        if (b.fall >= 1) b.falling = false;
        poseBuilding(b, city.original);
      }
      for (let i = bricks.length - 1; i >= 0; i--) {
        const k = bricks[i], m = k.mesh;
        k.vy -= 14 * dt;
        m.position.x += k.vx * dt;
        m.position.y += k.vy * dt;
        m.position.z += k.vz * dt;
        m.rotation.addInPlace(k.spin.scale(dt));
        if (m.position.y <= k.floor && k.vy < 0) {
          // Landed: it stays where it fell, as rubble.
          m.position.y = k.floor;
          m.freezeWorldMatrix();
          bricks.splice(i, 1);
        }
      }
      // Cutaway: the row of buildings between the camera and the street
      // sinks to stubby ruins so it never hides the game, and rises again
      // when the camera turns away.
      const cam = scene.activeCamera;
      if (cam) {
        const camZ = cam.globalPosition.z;
        for (const row of city.rows) {
          const between = row.side > 0 ? camZ > map.depth / 2 - 2 : camZ < -map.depth / 2 + 2;
          const target = between ? CUTAWAY : 1;
          for (const m of row.meshes) m.scaling.y += (target - m.scaling.y) * 0.12;
        }
      }
      for (const lamp of lamps) {
        const target = dark ? 0 : lampLevel(t, lamp.seed, bossActive);
        lamp.level += (target - lamp.level) * Math.min(1, dt * (bossActive || dark ? 30 : 8));
        lamp.bulb.emissiveColor = LAMP_COLOR.scale(lamp.level);
        lamp.pool.emissiveColor = LAMP_COLOR.scale(lamp.level * 0.45);
      }
      // The wind blows west down the street, in gusts.
      const gust = (1 + 0.5 * Math.sin(t * 0.37) + 0.25 * Math.sin(t * 1.3)) * wind;
      for (const w of weeds) {
        const v = w.speed * gust;
        w.x -= v * dt;
        w.z += Math.sin(t * 0.5 + w.phase) * 0.4 * dt;
        w.z = Math.max(w.band[0], Math.min(w.band[1], w.z));
        if (w.x < -map.width / 2 - 2) {
          w.x = map.width / 2 + 2;
          w.z = w.band[0] + Math.random() * (w.band[1] - w.band[0]);
        }
        w.phase += v * dt * 1.6;
        const hop = Math.abs(Math.sin(w.phase)) * 0.5 * w.r;
        w.node.position.set(w.x, terrain.surfaceHeight(Math.max(-map.width / 2, w.x), w.z) + w.r * 0.85 + hop, w.z);
        w.node.rotation.z += (v * dt) / w.r; // rolling
        w.node.rotation.y += dt * 0.3;
      }
    },
  };
}
