import {
  Color3, Color4, DynamicTexture, Engine, Mesh, MeshBuilder, ParticleSystem, Scene, StandardMaterial,
  Texture, TransformNode, Vector3, VertexBuffer, type GlowLayer,
} from '@babylonjs/core';
import type { MapDef } from '../data/config';
import type { Terrain } from './terrain';

// Scenery for the ruined-city look (Rust Corridor): crumbling skyscrapers
// along both sides with alleys between them, burnt-out car wrecks, street
// lamps that still flicker, and tumbleweeds blowing through. All for looks.

export interface Decor {
  /** Animate lamps and tumbleweeds. `bossActive` makes the lamps go wild. */
  update(dt: number, bossActive: boolean): void;
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

/** Weathered concrete with a grid of dark windows, some smashed, and rust streaks. */
function facadeTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture('facade', { width: size, height: size }, scene, true);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  const rand = rng(77);
  g.fillStyle = '#857a70';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 3000; i++) {
    const v = 90 + rand() * 70;
    g.fillStyle = `rgba(${v},${v * 0.92},${v * 0.86},0.3)`;
    g.fillRect(rand() * size, rand() * size, 2 + rand() * 5, 2 + rand() * 5);
  }
  // Grime pooling toward the bottom.
  const grime = g.createLinearGradient(0, 0, 0, size);
  grime.addColorStop(0, 'rgba(40,30,22,0)');
  grime.addColorStop(1, 'rgba(40,30,22,0.25)');
  g.fillStyle = grime;
  g.fillRect(0, 0, size, size);
  const cols = 4, rows = 4, cw = size / cols, rh = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * 0.2, y = r * rh + rh * 0.22, w = cw * 0.6, h = rh * 0.5;
      // Rust and soot streaks running down from the sill.
      const streak = g.createLinearGradient(0, y + h, 0, y + h + rh * 0.6);
      streak.addColorStop(0, 'rgba(90,45,20,0.55)');
      streak.addColorStop(1, 'rgba(90,45,20,0)');
      g.fillStyle = streak;
      g.fillRect(x + w * 0.2, y + h, w * 0.6, rh * 0.6);
      g.fillStyle = '#4a3e33';
      g.fillRect(x - 3, y - 3, w + 6, h + 6);
      g.fillStyle = rand() < 0.2 ? '#2c241e' : '#141110';
      g.fillRect(x, y, w, h);
      if (rand() < 0.15) {
        // Smashed: a ragged hole a little bigger than the window.
        g.fillStyle = '#0b0908';
        g.beginPath();
        g.moveTo(x - 2, y + h * 0.4);
        for (let k = 0; k < 6; k++) g.lineTo(x + (w * k) / 5 + (rand() - 0.5) * 4, y - 1 - rand() * 4);
        g.lineTo(x + w + 2, y + h * 0.5);
        g.lineTo(x + w * 0.7, y + h + 3);
        g.lineTo(x, y + h + 1);
        g.fill();
      }
    }
  }
  tex.update();
  tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

/** Charred black paint eaten through with rust. */
function wreckTexture(scene: Scene): DynamicTexture {
  const size = 128;
  const tex = new DynamicTexture('wreck', { width: size, height: size }, scene, true);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  const rand = rng(31);
  g.fillStyle = '#1c1714';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 22; i++) {
    const x = rand() * size, y = rand() * size, r = 4 + rand() * 9;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const rust = rand() < 0.5 ? '104,48,20' : '74,38,22';
    grad.addColorStop(0, `rgba(${rust},0.75)`);
    grad.addColorStop(1, `rgba(${rust},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(0,0,0,${0.2 + rand() * 0.4})`;
    g.fillRect(rand() * size, rand() * size, 1 + rand() * 3, 1 + rand() * 3);
  }
  tex.update();
  return tex;
}

/** A soft round blob: bright middle fading to nothing (light pools, smoke). */
function softDot(scene: Scene, name: string): DynamicTexture {
  const size = 64;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, false);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

function tint(mesh: Mesh, c: Color3): void {
  const n = mesh.getTotalVertices();
  const colors = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b, 1], i * 4);
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
}

/** Stretch a box's texture so windows stay a sensible size on big walls. */
function tileUVs(mesh: Mesh, su: number, sv: number): void {
  const uvs = mesh.getVerticesData(VertexBuffer.UVKind)!;
  for (let i = 0; i < uvs.length; i += 2) {
    uvs[i] *= su;
    uvs[i + 1] *= sv;
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uvs);
}

// ----------------------------------------------------------------------------
//  Ruined skyscrapers
// ----------------------------------------------------------------------------

const GROUND_BASE = -3; // buildings start below ground so they look planted
/** How tall the near row stays when cut away (fraction of full height). */
const CUTAWAY = 0.14;
const ALLEY_WIDTH = 4;

function buildCity(scene: Scene, map: MapDef, terrain: Terrain): { side: 1 | -1; meshes: Mesh[] }[] {
  const rand = rng(1979);
  const facadeMat = new StandardMaterial('facade', scene);
  facadeMat.diffuseTexture = facadeTexture(scene);
  facadeMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const darkMat = new StandardMaterial('concreteDark', scene);
  darkMat.diffuseColor = new Color3(0.32, 0.27, 0.23);
  darkMat.specularColor = Color3.Black();
  const rebarMat = new StandardMaterial('rebar', scene);
  rebarMat.diffuseColor = new Color3(0.35, 0.17, 0.08);

  const hd = map.depth / 2;
  const sides: { side: 1 | -1; meshes: Mesh[] }[] = [];

  for (const side of [1, -1] as const) {
    const facades: Mesh[] = [], slabs: Mesh[] = [], rebar: Mesh[] = [];
    const edge = side > 0 ? 'north' : 'south';
    const alleys = map.alleys?.[edge] ?? [];
    let x = -map.width / 2 - 10;
    let b = 0;
    while (x < map.width / 2 + 10) {
      let w = 5 + rand() * 5;
      // Leave a gap for each alley.
      const alley = alleys.find((a) => a + ALLEY_WIDTH / 2 > x && a - ALLEY_WIDTH / 2 < x + w);
      if (alley !== undefined) {
        if (alley - ALLEY_WIDTH / 2 - x > 2) w = alley - ALLEY_WIDTH / 2 - x;
        else {
          x = alley + ALLEY_WIDTH / 2;
          continue;
        }
      }
      const d = 6 + rand() * 3;
      const h = 9 + rand() * 20;
      const cx = x + w / 2, cz = side * (hd + 0.6 + d / 2);
      const shade = 0.75 + rand() * 0.35;
      const color = new Color3(shade, shade * (0.92 + rand() * 0.06), shade * (0.82 + rand() * 0.1));
      const name = `bld-${edge}-${b++}`;

      // Main tower, then a crumbled, stepped top.
      const body = h * (0.6 + rand() * 0.15);
      const box = (bw: number, bh: number, bd: number, px: number, py: number, pz: number) => {
        const m = MeshBuilder.CreateBox(name, { width: bw, height: bh, depth: bd }, scene);
        m.position.set(px, py, pz);
        tileUVs(m, Math.max(bw, bd) / 5, bh / 5);
        tint(m, color);
        facades.push(m);
        return m;
      };
      box(w, body - GROUND_BASE, d, cx, (GROUND_BASE + body) / 2, cz);
      const pieces = 2 + Math.floor(rand() * 3);
      for (let k = 0; k < pieces; k++) {
        const pw = w * (0.25 + rand() * 0.4), ph = (h - body) * (0.3 + rand() * 0.7);
        const px = cx - w / 2 + pw / 2 + rand() * (w - pw);
        const pd = d * (0.5 + rand() * 0.5);
        const pz = cz + side * (rand() - 0.3) * (d - pd);
        box(pw, ph, pd, px, body + ph / 2, pz);
      }
      // A broken slab slumped across the top.
      const slab = MeshBuilder.CreateBox(name, { width: w * 0.7, height: 0.45, depth: d * 0.7 }, scene);
      slab.position.set(cx + (rand() - 0.5) * w * 0.3, body + 0.3, cz);
      slab.rotation.set((rand() - 0.5) * 0.4, rand(), (rand() - 0.5) * 0.7);
      slabs.push(slab);
      // Floors sticking out of the street face where the wall fell away.
      for (let f = 0; f < 3; f++) {
        if (rand() < 0.4) continue;
        const fy = 3 + rand() * (body - 4);
        const fl = MeshBuilder.CreateBox(name, { width: w * (0.3 + rand() * 0.5), height: 0.3, depth: 1.2 }, scene);
        fl.position.set(cx + (rand() - 0.5) * w * 0.4, fy, cz - side * (d / 2 + 0.4));
        fl.rotation.z = (rand() - 0.5) * 0.25;
        slabs.push(fl);
      }
      // Bent rebar poking out of the broken top.
      for (let k = 0; k < 4; k++) {
        const len = 1 + rand() * 2;
        const bar = MeshBuilder.CreateCylinder(name, { height: len, diameter: 0.12, tessellation: 5 }, scene);
        bar.position.set(cx + (rand() - 0.5) * w * 0.8, body + len / 2, cz + (rand() - 0.5) * d * 0.6);
        bar.rotation.set((rand() - 0.5) * 0.9, 0, (rand() - 0.5) * 0.9);
        rebar.push(bar);
      }
      // Rubble at the foot, spilling toward the street.
      for (let k = 0; k < 5; k++) {
        const sz = 0.4 + rand() * 1.1;
        const rx = cx + (rand() - 0.5) * w;
        const rz = side * (hd + 0.4 + rand() * 1.2);
        const rb = MeshBuilder.CreateBox(name, { width: sz, height: sz * 0.6, depth: sz }, scene);
        rb.position.set(rx, terrain.surfaceHeight(Math.min(map.width / 2, Math.max(-map.width / 2, rx)), side * hd) + sz * 0.15, rz);
        rb.rotation.set(rand(), rand() * 3, rand());
        slabs.push(rb);
      }
      x += w + 0.3 + rand() * 0.8;
    }
    sides.push({
      side,
      meshes: [
        merge(facades, facadeMat, `city-facades-${edge}`),
        merge(slabs, darkMat, `city-slabs-${edge}`),
        merge(rebar, rebarMat, `city-rebar-${edge}`),
      ],
    });
  }
  return sides;
}

function merge(meshes: Mesh[], mat: StandardMaterial, name: string): Mesh {
  const m = Mesh.MergeMeshes(meshes, true, true)!;
  m.name = name;
  m.material = mat;
  m.isPickable = false;
  return m;
}

/** Ground beyond the map edges, so the city stands on something. */
function buildOuterGround(scene: Scene, map: MapDef, terrain: Terrain, color: Color3): void {
  const w = map.width + 120, d = map.depth + 80;
  const ground = MeshBuilder.CreateGround('outerGround', {
    width: w, height: d, subdivisionsX: Math.round(w / 2), subdivisionsY: Math.round(d / 2), updatable: true,
  }, scene);
  const pos = ground.getVerticesData(VertexBuffer.PositionKind)!;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], z = pos[i + 2];
    // Sunk out of sight under the map itself, so it doesn't fill the ravines.
    const underMap = Math.abs(x) < map.width / 2 - 0.5 && Math.abs(z) < map.depth / 2 - 0.5;
    pos[i + 1] = underMap ? -30 : terrain.surfaceHeight(x, z) - 0.3;
  }
  ground.updateVerticesData(VertexBuffer.PositionKind, pos);
  ground.createNormals(true);
  const mat = new StandardMaterial('outerGround', scene);
  mat.diffuseColor = color.scale(0.85);
  mat.specularColor = Color3.Black();
  ground.material = mat;
  ground.isPickable = false;
}

// ----------------------------------------------------------------------------
//  Burnt-out car wrecks (stand in for rocks)
// ----------------------------------------------------------------------------

let wreckMats: { body: StandardMaterial; frame: StandardMaterial; tire: StandardMaterial; ember: StandardMaterial } | null = null;

function wreckMaterials(scene: Scene) {
  if (wreckMats && wreckMats.body.getScene() === scene) return wreckMats;
  const body = new StandardMaterial('wreckBody', scene);
  body.diffuseTexture = wreckTexture(scene);
  body.specularColor = new Color3(0.05, 0.04, 0.03);
  const frame = new StandardMaterial('wreckFrame', scene);
  frame.diffuseColor = new Color3(0.14, 0.1, 0.08);
  const tire = new StandardMaterial('wreckTire', scene);
  tire.diffuseColor = new Color3(0.06, 0.05, 0.05);
  const ember = new StandardMaterial('wreckEmber', scene);
  ember.emissiveColor = new Color3(1, 0.42, 0.1);
  ember.diffuseColor = Color3.Black();
  wreckMats = { body, frame, tire, ember };
  return wreckMats;
}

/**
 * A burnt-out car about as big as the rock it replaces (radius r): blackened
 * shell, empty window frames, a sagging roof, dead tires, and a few embers
 * still glowing inside with a wisp of smoke.
 */
export function buildCarWreck(scene: Scene, name: string, r: number, seed: number): TransformNode {
  const m = wreckMaterials(scene);
  const rand = rng(seed);
  const s = r / 2;
  const root = new TransformNode(name, scene);
  const add = (mesh: Mesh, x: number, y: number, z: number) => {
    mesh.parent = root;
    mesh.position.set(x * s, y * s, z * s);
    mesh.isPickable = false;
    return mesh;
  };
  // Lower body, with a crumpled hood and trunk.
  const lower = add(MeshBuilder.CreateBox(`${name}-body`, { width: 4 * s, height: 0.7 * s, depth: 1.8 * s }, scene), 0, 0.55, 0);
  lower.material = m.body;
  const hood = add(MeshBuilder.CreateBox(`${name}-hood`, { width: 1.3 * s, height: 0.2 * s, depth: 1.7 * s }, scene), 1.35, 0.95, 0);
  hood.rotation.z = -0.12 - rand() * 0.15;
  hood.material = m.body;
  const trunk = add(MeshBuilder.CreateBox(`${name}-trunk`, { width: 0.9 * s, height: 0.2 * s, depth: 1.7 * s }, scene), -1.55, 0.95, 0);
  trunk.rotation.z = 0.08 + rand() * 0.1;
  trunk.material = m.body;
  // Cabin: just the pillars and a sagging roof (the glass is long gone).
  for (const [px, pz] of [[0.65, 0.8], [0.65, -0.8], [-0.95, 0.8], [-0.95, -0.8]]) {
    const pillar = add(MeshBuilder.CreateBox(`${name}-pillar`, { width: 0.12 * s, height: 0.6 * s, depth: 0.12 * s }, scene), px, 1.2, pz);
    pillar.rotation.z = px > 0 ? -0.35 : 0.2;
    pillar.material = m.frame;
  }
  const roof = add(MeshBuilder.CreateBox(`${name}-roof`, { width: 1.7 * s, height: 0.08 * s, depth: 1.6 * s }, scene), -0.15, 1.45, 0);
  roof.rotation.set((rand() - 0.5) * 0.2, 0, 0.06 + rand() * 0.08);
  roof.scaling.y = 1;
  roof.material = m.body;
  // Tires: flat, and one missing.
  const missing = Math.floor(rand() * 4);
  [[1.3, 0.85], [1.3, -0.85], [-1.3, 0.85], [-1.3, -0.85]].forEach(([wx, wz], i) => {
    if (i === missing) return;
    const tire = add(MeshBuilder.CreateCylinder(`${name}-tire`, { height: 0.25 * s, diameter: 0.75 * s, tessellation: 10 }, scene), wx, 0.25, wz);
    tire.rotation.x = Math.PI / 2;
    tire.scaling.z = 0.65; // squashed flat
    tire.material = m.tire;
  });
  // Embers still smouldering in the cabin and engine bay.
  for (let i = 0; i < 3; i++) {
    const ember = add(MeshBuilder.CreateSphere(`${name}-ember`, { diameter: (0.12 + rand() * 0.12) * s, segments: 4 }, scene), (rand() - 0.3) * 2.2, 0.95, (rand() - 0.5) * 1.2);
    ember.material = m.ember;
  }
  // A thin wisp of smoke.
  const smoke = new ParticleSystem(`${name}-smoke`, 40, scene);
  smoke.particleTexture = softDot(scene, `${name}-smokeTex`);
  const emitter = MeshBuilder.CreateBox(`${name}-smokeAt`, { size: 0.01 }, scene);
  emitter.isVisible = false;
  emitter.isPickable = false;
  emitter.parent = root;
  emitter.position.set(0.9 * s, 1 * s, 0);
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
//  Street lamps
// ----------------------------------------------------------------------------

interface Lamp { bulb: StandardMaterial; pool: StandardMaterial; seed: number; level: number }

const LAMP_COLOR = new Color3(0.82, 1, 0.45); // sickly nuclear green-yellow

function buildLamps(scene: Scene, map: MapDef, terrain: Terrain, glow: GlowLayer): Lamp[] {
  const lamps: Lamp[] = [];
  const rand = rng(42);
  const postMat = new StandardMaterial('lampPost', scene);
  postMat.diffuseColor = new Color3(0.2, 0.15, 0.12);
  const poolTex = softDot(scene, 'lampPool');
  let i = 0;
  for (const side of [1, -1]) {
    for (let x = -map.width / 2 + 6 + (side < 0 ? 4.5 : 0); x < map.width / 2 - 3; x += 9.5) {
      const z = side * 7.2;
      const y = terrain.surfaceHeight(x, z);
      const root = new TransformNode(`lamp${i}`, scene);
      root.position.set(x, y, z);
      root.rotation.set((rand() - 0.5) * 0.12, 0, (rand() - 0.5) * 0.12); // old and leaning
      const post = MeshBuilder.CreateCylinder(`lamp${i}-post`, { height: 4.2, diameterTop: 0.12, diameterBottom: 0.22, tessellation: 8 }, scene);
      post.parent = root;
      post.position.y = 2.1;
      post.material = postMat;
      const arm = MeshBuilder.CreateBox(`lamp${i}-arm`, { width: 0.1, height: 0.1, depth: 1.3 }, scene);
      arm.parent = root;
      arm.position.set(0, 4.1, -side * 0.6); // reaching out over the corridor
      arm.material = postMat;
      const head = MeshBuilder.CreateBox(`lamp${i}-head`, { width: 0.5, height: 0.18, depth: 0.7 }, scene);
      head.parent = root;
      head.position.set(0, 4.05, -side * 1.2);
      head.material = postMat;
      const bulbMat = new StandardMaterial(`lamp${i}-bulb`, scene);
      bulbMat.diffuseColor = Color3.Black();
      bulbMat.emissiveColor = LAMP_COLOR.scale(0.7);
      const bulb = MeshBuilder.CreateSphere(`lamp${i}-bulbMesh`, { diameterX: 0.4, diameterY: 0.16, diameterZ: 0.55, segments: 8 }, scene);
      bulb.parent = root;
      bulb.position.set(0, 3.92, -side * 1.2);
      bulb.material = bulbMat;
      // A pool of light on the ground under it.
      const poolMat = new StandardMaterial(`lamp${i}-pool`, scene);
      poolMat.diffuseColor = Color3.Black();
      poolMat.specularColor = Color3.Black();
      poolMat.emissiveColor = LAMP_COLOR.scale(0.35);
      poolMat.opacityTexture = poolTex;
      poolMat.disableLighting = true;
      poolMat.alphaMode = Engine.ALPHA_ADD;
      // Kept over the corridor so it never hangs out over a ravine.
      const px = x, pz = z - side * 1.8;
      const pool = MeshBuilder.CreateDisc(`lamp${i}-poolMesh`, { radius: 2.2, tessellation: 32 }, scene);
      pool.rotation.x = Math.PI / 2;
      pool.position.set(px, terrain.surfaceHeight(px, pz) + 0.06, pz);
      pool.material = poolMat;
      pool.isPickable = false;
      glow.addExcludedMesh(pool);
      for (const m of [post, arm, head, bulb]) m.isPickable = false;
      lamps.push({ bulb: bulbMat, pool: poolMat, seed: i * 17 + 3, level: 0.7 });
      i++;
    }
  }
  return lamps;
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
  const mat = new StandardMaterial('tumbleweed', scene);
  mat.diffuseColor = new Color3(0.62, 0.47, 0.28);
  mat.emissiveColor = new Color3(0.12, 0.08, 0.04);
  mat.backFaceCulling = false;
  weed.material = mat;
  weed.isPickable = false;
  weed.setEnabled(false);
  return weed;
}

function buildTumbleweeds(scene: Scene, map: MapDef): Weed[] {
  const template = buildTumbleweedMesh(scene);
  const rand = rng(9);
  const hd = map.depth / 2;
  // Down the corridor, and along the strips behind the ravines.
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
  const city = buildCity(scene, map, terrain);
  const lamps = buildLamps(scene, map, terrain, glow);
  const weeds = buildTumbleweeds(scene, map);
  let t = 0;

  return {
    update(dt, bossActive) {
      t += dt;
      // Cutaway: the row of buildings between the camera and the corridor
      // sinks to stubby ruins so it never hides the game, and rises again
      // when the camera turns away.
      const cam = scene.activeCamera;
      if (cam) {
        const camZ = cam.globalPosition.z;
        for (const row of city) {
          const between = row.side > 0 ? camZ > map.depth / 2 - 2 : camZ < -map.depth / 2 + 2;
          const target = between ? CUTAWAY : 1;
          for (const m of row.meshes) m.scaling.y += (target - m.scaling.y) * 0.12;
        }
      }
      for (const lamp of lamps) {
        const target = lampLevel(t, lamp.seed, bossActive);
        lamp.level += (target - lamp.level) * Math.min(1, dt * (bossActive ? 30 : 8));
        lamp.bulb.emissiveColor = LAMP_COLOR.scale(lamp.level);
        lamp.pool.emissiveColor = LAMP_COLOR.scale(lamp.level * 0.45);
      }
      // The wind blows west down the corridor, in gusts.
      const gust = 1 + 0.5 * Math.sin(t * 0.37) + 0.25 * Math.sin(t * 1.3);
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
