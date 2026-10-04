import {
  Color3, Color4, Mesh, MeshBuilder, ParticleSystem, Scene, StandardMaterial, TransformNode, Vector3,
} from '@babylonjs/core';
import type { MapDef } from '../data/config';
import { buildOuterGround, canvasTexture, hash, material, merge, rng, softDot, type Decor } from './decor';
import type { Terrain } from './terrain';

// Scenery for the jungle (Crash Jungle): a whole fleet came down here.
// Wrecked fighters lie nose-first at the end of the furrows they ploughed,
// saucers sit tilted in their craters, smoke still rising from some. Giant
// trees ring the clearing with crashed ships dangling from their vines, and
// palms, ferns and macaws fill in the rest. All for looks: wrecks are rocks
// and furrows are ravines to the rules.

const CORE = new Color3(1, 0.5, 0.15);
const BEACON = new Color3(1, 0.15, 0.1);

// ----------------------------------------------------------------------------
//  Textures
// ----------------------------------------------------------------------------

/** Scuffed hull plating: panels, rivets, scorch marks, rust and a squadron stripe. */
function hullTexture(scene: Scene) {
  return canvasTexture(scene, 'hull', 256, 256, (g) => {
    const rand = rng(404);
    g.fillStyle = '#8a9099';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      for (let x = (y / 32) % 2 ? -24 : 0; x < 256; x += 48) {
        const v = 125 + rand() * 30;
        g.fillStyle = `rgb(${v},${v + 4},${v + 10})`;
        g.fillRect(x + 1, y + 1, 46, 30);
        g.fillStyle = 'rgba(30,32,38,0.6)';
        for (const [rx, ry] of [[4, 4], [42, 4], [4, 26], [42, 26]]) g.fillRect(x + rx, y + ry, 2, 2);
      }
    }
    // Squadron stripe.
    g.fillStyle = 'rgba(230,110,30,0.75)';
    g.fillRect(0, 150, 256, 14);
    // Burns and soot.
    for (let i = 0; i < 9; i++) {
      const x = rand() * 256, y = rand() * 256, r = 15 + rand() * 45;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(15,12,10,0.85)');
      grad.addColorStop(1, 'rgba(15,12,10,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Rust streaks and moss creeping over it.
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(140,70,30,${0.2 + rand() * 0.3})`;
      g.fillRect(rand() * 256, rand() * 256, 2 + rand() * 4, 20 + rand() * 50);
    }
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(${50 + rand() * 30},${90 + rand() * 40},40,${0.3 + rand() * 0.4})`;
      g.beginPath();
      g.arc(rand() * 256, 190 + rand() * 66, 2 + rand() * 6, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** One palm frond: a rib with leaflets either side, on a clear background. */
function frondTexture(scene: Scene) {
  const tex = canvasTexture(scene, 'frond', 64, 256, (g) => {
    g.clearRect(0, 0, 64, 256);
    g.strokeStyle = '#3d7a22';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(32, 0);
    g.lineTo(32, 256);
    g.stroke();
    for (let y = 8; y < 250; y += 7) {
      const len = 30 * Math.sin((y / 256) * Math.PI) + 4;
      g.strokeStyle = y % 14 ? '#4f9a2c' : '#3f8a24';
      g.lineWidth = 4;
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(32, y);
        g.lineTo(32 + side * len, y + 14);
        g.stroke();
      }
    }
  }, false);
  tex.hasAlpha = true;
  return tex;
}

// ----------------------------------------------------------------------------
//  Spaceships (wrecked or dangling), built from parts
// ----------------------------------------------------------------------------

interface Parts { hull: Mesh[]; dark: Mesh[]; glass: Mesh[]; core: Mesh[]; beacon: Mesh[] }

const newParts = (): Parts => ({ hull: [], dark: [], glass: [], core: [], beacon: [] });

function mats(scene: Scene) {
  return {
    hull: material(scene, 'shipHull', (m) => {
      m.diffuseTexture = hullTexture(scene);
      m.specularColor = new Color3(0.3, 0.3, 0.35);
    }),
    dark: material(scene, 'shipDark', (m) => {
      m.diffuseColor = new Color3(0.12, 0.12, 0.14);
      m.specularColor = new Color3(0.2, 0.2, 0.25);
    }),
    glass: material(scene, 'shipGlass', (m) => {
      m.diffuseColor = new Color3(0.1, 0.25, 0.3);
      m.emissiveColor = new Color3(0.05, 0.25, 0.3);
      m.specularColor = new Color3(1, 1, 1);
      m.alpha = 0.75;
    }),
    core: material(scene, 'shipCore', (m) => {
      m.emissiveColor = CORE;
      m.diffuseColor = Color3.Black();
      m.disableLighting = true;
    }),
    beacon: material(scene, 'shipBeacon', (m) => {
      m.emissiveColor = BEACON;
      m.diffuseColor = Color3.Black();
      m.disableLighting = true;
    }),
  };
}

function own<T extends Mesh>(m: T, root: TransformNode): T {
  m.parent = root;
  return m;
}

/**
 * A fighter, nose toward -x, `r` across. `snapped` breaks a wing off at the root
 * and bends it down.
 */
function fighter(scene: Scene, root: TransformNode, r: number, p: Parts, snapped: boolean): void {
  const L = 2.4 * r;
  const body = own(MeshBuilder.CreateCylinder('fuselage', { diameterTop: 0.32 * r, diameterBottom: 0.6 * r, height: L, tessellation: 10 }, scene), root);
  body.rotation.z = Math.PI / 2; // +y end (the narrow one) turns to -x: the nose
  p.hull.push(body);
  const nose = own(MeshBuilder.CreateCylinder('nose', { diameterTop: 0, diameterBottom: 0.32 * r, height: 0.6 * r, tessellation: 10 }, scene), root);
  nose.rotation.z = Math.PI / 2;
  nose.position.x = -L / 2 - 0.3 * r;
  p.dark.push(nose);
  const canopy = own(MeshBuilder.CreateSphere('canopy', { diameter: 0.45 * r, segments: 10 }, scene), root);
  canopy.scaling.set(1.7, 0.7, 0.8);
  canopy.position.set(-L * 0.22, 0.22 * r, 0);
  p.glass.push(canopy);
  for (const side of [-1, 1]) {
    const wing = own(MeshBuilder.CreateBox('wing', { width: 0.9 * r, height: 0.06 * r, depth: 1.1 * r }, scene), root);
    wing.position.set(0.15 * r, -0.05 * r, side * 0.8 * r);
    wing.rotation.y = side * 0.4;
    if (snapped && side > 0) {
      wing.rotation.x = 0.55;
      wing.position.y -= 0.25 * r;
      wing.position.z += 0.1 * r;
    }
    p.hull.push(wing);
    const engine = own(MeshBuilder.CreateCylinder('engine', { diameter: 0.28 * r, height: 0.7 * r, tessellation: 8 }, scene), root);
    engine.rotation.z = Math.PI / 2;
    engine.position.set(L / 2 - 0.2 * r, 0, side * 0.24 * r);
    p.dark.push(engine);
    const nozzle = own(MeshBuilder.CreateCylinder('nozzle', { diameter: 0.2 * r, height: 0.05 * r, tessellation: 8 }, scene), root);
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(L / 2 + 0.16 * r, 0, side * 0.24 * r);
    p.core.push(nozzle);
  }
  const fin = own(MeshBuilder.CreateBox('fin', { width: 0.6 * r, height: 0.7 * r, depth: 0.06 * r }, scene), root);
  fin.position.set(L / 2 - 0.35 * r, 0.42 * r, 0);
  fin.rotation.z = -0.35;
  p.hull.push(fin);
  const light = own(MeshBuilder.CreateSphere('beacon', { diameter: 0.12 * r, segments: 6 }, scene), root);
  light.position.set(L / 2 - 0.15 * r, 0.8 * r, 0);
  p.beacon.push(light);
}

/** A flying saucer, `r` across the middle. */
function saucer(scene: Scene, root: TransformNode, r: number, p: Parts, rand: () => number): void {
  const body = own(MeshBuilder.CreateSphere('saucer', { diameter: 1.9 * r, segments: 16 }, scene), root);
  body.scaling.y = 0.3;
  p.hull.push(body);
  const rim = own(MeshBuilder.CreateTorus('rim', { diameter: 1.85 * r, thickness: 0.14 * r, tessellation: 24 }, scene), root);
  p.dark.push(rim);
  const dome = own(MeshBuilder.CreateSphere('dome', { diameter: 0.85 * r, segments: 12, slice: 0.5 }, scene), root);
  dome.position.y = 0.18 * r;
  p.glass.push(dome);
  // A ring of lights, a few still burning.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const bulb = own(MeshBuilder.CreateSphere('bulb', { diameter: 0.1 * r, segments: 4 }, scene), root);
    bulb.position.set(Math.cos(a) * 0.93 * r, 0, Math.sin(a) * 0.93 * r);
    (rand() < 0.4 ? p.core : p.dark).push(bulb);
  }
  // A torn-open panel with the glowing core showing through.
  const a = rand() * Math.PI * 2;
  const core = own(MeshBuilder.CreateSphere('core', { diameter: 0.32 * r, segments: 8 }, scene), root);
  core.position.set(Math.cos(a) * 0.55 * r, 0.12 * r, Math.sin(a) * 0.55 * r);
  p.core.push(core);
  const flap = own(MeshBuilder.CreateBox('flap', { width: 0.5 * r, height: 0.04 * r, depth: 0.35 * r }, scene), root);
  flap.position.set(Math.cos(a) * 0.62 * r, 0.3 * r, Math.sin(a) * 0.62 * r);
  flap.rotation.set(0.9, -a, 0.3);
  p.hull.push(flap);
}

function mergeParts(scene: Scene, p: Parts, name: string): Mesh[] {
  const m = mats(scene);
  return [
    merge(p.hull, m.hull, `${name}Hull`), merge(p.dark, m.dark, `${name}Dark`), merge(p.glass, m.glass, `${name}Glass`),
    merge(p.core, m.core, `${name}Core`), merge(p.beacon, m.beacon, `${name}Beacon`),
  ].filter((x): x is Mesh => x !== null);
}

// ----------------------------------------------------------------------------
//  Wrecks (rocks)
// ----------------------------------------------------------------------------

/** Every rock as a crashed ship: fighters nose-down at the end of their furrows, saucers tilted in craters. */
function buildWrecks(scene: Scene, map: MapDef, terrain: Terrain): void {
  const parts = newParts(), vines: Mesh[] = [];
  const smoke = softDot(scene, 'wreckSmoke');
  for (const [i, r] of map.rocks.entries()) {
    const rand = rng(300 + i);
    const g = terrain.surfaceHeight(r.x, r.z);
    const root = new TransformNode(`wreck${i}`, scene);
    // Did it plough a furrow? Then it's a fighter facing the way it was going (west).
    const furrow = map.ravines.some((v) => Math.abs(v.x - v.w / 2 - r.x) < r.r + 1 && Math.abs(v.z - r.z) < 0.5);
    if (furrow || hash(i, 21) < 0.45) {
      fighter(scene, root, r.r * 1.05, parts, rand() < 0.6);
      root.rotation.set((rand() - 0.5) * 0.3, furrow ? 0 : rand() * Math.PI * 2, 0.4 + rand() * 0.2);
      root.position.set(r.x, g + 0.25 * r.r, r.z);
    } else {
      saucer(scene, root, r.r * 1.05, parts, rand);
      root.rotation.set(0.25 + rand() * 0.2, rand() * Math.PI * 2, (rand() - 0.5) * 0.4);
      root.position.set(r.x, g + 0.05 * r.r, r.z);
    }
    root.computeWorldMatrix(true);
    // Jungle creepers already growing over it.
    for (let k = 0; k < 2; k++) {
      const a = rand() * Math.PI, w = r.r * 1.1;
      const path: Vector3[] = [];
      for (let s = 0; s <= 8; s++) {
        const t = s / 8 - 0.5;
        path.push(new Vector3(r.x + Math.cos(a) * t * 2 * w, g + 0.75 * r.r * Math.cos(t * Math.PI) - 0.1, r.z + Math.sin(a) * t * 2 * w));
      }
      vines.push(MeshBuilder.CreateTube('creeper', { path, radius: 0.06, tessellation: 5 }, scene));
    }
    // The biggest ones are still smoking.
    if (r.r >= 1.8) {
      const ps = new ParticleSystem(`smoke${i}`, 60, scene);
      ps.particleTexture = smoke;
      ps.emitter = new Vector3(r.x, g + r.r * 0.6, r.z);
      ps.minEmitBox = new Vector3(-0.3, 0, -0.3);
      ps.maxEmitBox = new Vector3(0.3, 0, 0.3);
      ps.color1 = new Color4(0.25, 0.25, 0.25, 0.5);
      ps.color2 = new Color4(0.15, 0.15, 0.15, 0.4);
      ps.colorDead = new Color4(0.4, 0.42, 0.4, 0);
      ps.minSize = 0.8;
      ps.maxSize = 2.2;
      ps.minLifeTime = 3;
      ps.maxLifeTime = 5;
      ps.emitRate = 10;
      ps.direction1 = new Vector3(-0.2, 1, -0.1);
      ps.direction2 = new Vector3(0.3, 1.4, 0.2);
      ps.minEmitPower = 0.5;
      ps.maxEmitPower = 1;
      ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      ps.start();
    }
  }
  mergeParts(scene, parts, 'wrecks');
  merge(vines, vineMat(scene), 'creepers');
  for (const n of scene.transformNodes.filter((t) => t.name.startsWith('wreck'))) n.dispose();
}

function vineMat(scene: Scene): StandardMaterial {
  return material(scene, 'vine', (m) => {
    m.diffuseColor = new Color3(0.2, 0.38, 0.12);
    m.specularColor = Color3.Black();
  });
}

// ----------------------------------------------------------------------------
//  Giant trees with ships hanging from their vines
// ----------------------------------------------------------------------------

interface Hanging {
  pivot: TransformNode;
  ship: TransformNode;
  phase: number;
  /** Once it's fallen: speed and spin, until it lands. */
  falling: { vy: number; spin: Vector3; floor: number } | null;
  down: boolean;
}

interface Trees { hanging: Hanging[] }

/** Height of the ground outside the map (matches the outer ground's easing). */
function groundOut(terrain: Terrain, map: MapDef, x: number, z: number): number {
  const beyond = Math.max(Math.abs(x) - map.width / 2, Math.abs(z) - map.depth / 2);
  return terrain.surfaceHeight(x, z) * Math.max(0, 1 - beyond / 40) - 0.3;
}

function buildTrees(scene: Scene, map: MapDef, terrain: Terrain): Trees {
  const hw = map.width / 2, hd = map.depth / 2;
  const bark: Mesh[] = [], leaves: Mesh[][] = [[], [], []], vines: Mesh[] = [];
  const hanging: Hanging[] = [];
  const rand = rng(77);
  // Giant trees along the back and both ends; each leans a branch out over the
  // clearing, and every other one has a ship tangled in its vines.
  const spots: { x: number; z: number; ix: number; iz: number }[] = [];
  for (let x = -hw + 4; x <= hw - 2; x += 10) spots.push({ x: x + rand() * 3, z: hd + 4 + rand() * 3, ix: 0, iz: -1 });
  for (let z = -hd + 6; z <= hd - 4; z += 11) {
    spots.push({ x: hw + 4 + rand() * 3, z: z + rand() * 3, ix: -1, iz: 0 });
    spots.push({ x: -hw - 5 - rand() * 3, z: z + rand() * 3, ix: 1, iz: 0 });
  }
  for (const [i, s] of spots.entries()) {
    const g = groundOut(terrain, map, s.x, s.z);
    const H = 15 + rand() * 5;
    const trunk = MeshBuilder.CreateCylinder('trunk', { diameterTop: 1.2, diameterBottom: 2.4, height: H, tessellation: 9 }, scene);
    trunk.position.set(s.x, g + H / 2 - 0.5, s.z);
    bark.push(trunk);
    // The trunk flares out into roots at the bottom.
    const flare = MeshBuilder.CreateCylinder('flare', { diameterTop: 2.3, diameterBottom: 4.2, height: 2.6, tessellation: 9 }, scene);
    flare.position.set(s.x, g + 0.8, s.z);
    bark.push(flare);
    // A long branch reaching out over the edge of the clearing.
    const reach = 6 + rand() * 2, bh = H - 3 + rand() * 2;
    const tip = new Vector3(s.x + s.ix * reach, g + bh + 1, s.z + s.iz * reach);
    const base = new Vector3(s.x, g + bh - 1, s.z);
    const branch = MeshBuilder.CreateTube('branch', { path: [base, Vector3.Lerp(base, tip, 0.5).add(new Vector3(0, 1.2, 0)), tip], radius: 0.35, tessellation: 7 }, scene);
    bark.push(branch);
    // Canopy: big clumps of leaves round the top and along the branch.
    const clump = (c: Vector3, d: number) => {
      const m = MeshBuilder.CreateSphere('leaves', { diameter: d, segments: 6 }, scene);
      m.position = c;
      m.scaling.y = 0.55;
      m.rotation.y = rand() * 3;
      leaves[Math.floor(rand() * 3)].push(m);
    };
    for (let k = 0; k < 5; k++) clump(new Vector3(s.x + (rand() - 0.5) * 6, g + H + (rand() - 0.3) * 2, s.z + (rand() - 0.5) * 6), 5 + rand() * 4);
    clump(tip.add(new Vector3(0, 1, 0)), 4 + rand() * 2);
    clump(Vector3.Lerp(base, tip, 0.5).add(new Vector3(0, 2, 0)), 4 + rand() * 2);
    // Loose vines hanging down.
    for (let k = 0; k < 4; k++) {
      const top = Vector3.Lerp(base, tip, 0.3 + rand() * 0.7).add(new Vector3((rand() - 0.5) * 1.5, 0.3, (rand() - 0.5) * 1.5));
      const len = 3 + rand() * 6;
      vines.push(MeshBuilder.CreateTube('vine', { path: [top, top.add(new Vector3(0.2, -len / 2, 0.1)), top.add(new Vector3(0, -len, 0.3))], radius: 0.05, tessellation: 4 }, scene));
    }

    if (i % 2 === 0) hanging.push(hangShip(scene, tip, i, rand));
  }
  merge(bark, material(scene, 'bark', (m) => {
    m.diffuseColor = new Color3(0.3, 0.22, 0.15);
    m.specularColor = Color3.Black();
  }), 'trees');
  const greens = [new Color3(0.13, 0.32, 0.1), new Color3(0.18, 0.4, 0.12), new Color3(0.1, 0.26, 0.12)];
  for (const [k, list] of leaves.entries()) {
    merge(list, material(scene, `canopy${k}`, (m) => {
      m.diffuseColor = greens[k];
      m.specularColor = Color3.Black();
    }), `canopy${k}`);
  }
  merge(vines, vineMat(scene), 'hangingVines');
  return { hanging };
}

/** A small ship caught in vines below `tip`, swinging gently. */
function hangShip(scene: Scene, tip: Vector3, i: number, rand: () => number): Hanging {
  const pivot = new TransformNode(`hangPivot${i}`, scene);
  pivot.position.copyFrom(tip);
  const drop = 4 + rand() * 3, r = 1 + rand() * 0.6;
  const ship = new TransformNode(`hanging${i}`, scene);
  const parts = newParts();
  if (rand() < 0.6) fighter(scene, ship, r, parts, rand() < 0.5);
  else saucer(scene, ship, r, parts, rand);
  for (const m of mergeParts(scene, parts, `hanging${i}`)) m.parent = ship;
  ship.parent = pivot;
  ship.position.y = -drop;
  // Hung up at an awkward angle: nose down, tipped over.
  ship.rotation.set((rand() - 0.5) * 0.8, rand() * Math.PI * 2, 0.7 + rand() * 0.5);
  // Three vines from the branch down to the hull.
  const vines: Mesh[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + rand();
    const end = new Vector3(Math.cos(a) * r * 0.6, -drop + r * 0.2, Math.sin(a) * r * 0.6);
    vines.push(MeshBuilder.CreateTube('shipVine', { path: [new Vector3(0, 0.2, 0), end.scale(0.5).add(new Vector3(0.15, 0, 0)), end], radius: 0.07, tessellation: 5 }, scene));
  }
  const tangle = merge(vines, vineMat(scene), `shipVines${i}`)!;
  tangle.parent = pivot;
  return { pivot, ship, phase: rand() * 10, falling: null, down: false };
}

// ----------------------------------------------------------------------------
//  Palms, ferns and macaws
// ----------------------------------------------------------------------------

function buildPalms(scene: Scene, map: MapDef, terrain: Terrain): void {
  const hw = map.width / 2, hd = map.depth / 2;
  const rand = rng(515);
  const trunks: Mesh[] = [], fronds: Mesh[] = [], nuts: Mesh[] = [];
  const spots: [number, number][] = [];
  for (let k = 0; k < 26; k++) {
    // A ring just outside the clearing, between the giant trees.
    const side = k % 4;
    const t = rand() * 2 - 1;
    const out = 1.5 + rand() * 4;
    spots.push(side === 0 ? [t * hw, hd + out] : side === 1 ? [t * hw, -hd - out] : side === 2 ? [hw + out, t * hd] : [-hw - out, t * hd]);
  }
  for (const [x, z] of spots) {
    const g = groundOut(terrain, map, x, z);
    const H = 5 + rand() * 3.5, lean = (rand() - 0.5) * 2.5, leanZ = (rand() - 0.5) * 2.5;
    const path: Vector3[] = [];
    for (let s = 0; s <= 6; s++) {
      const t = s / 6;
      path.push(new Vector3(x + lean * t * t, g + H * t, z + leanZ * t * t));
    }
    trunks.push(MeshBuilder.CreateTube('palmTrunk', { path, radiusFunction: (_i, d) => 0.28 - d * 0.02, tessellation: 7 }, scene));
    const top = path[path.length - 1];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + rand() * 0.3;
      // Two pieces per frond, rising then drooping, so it arches over.
      const dir = new Vector3(Math.cos(a), 0, Math.sin(a));
      let from = top;
      for (const tilt of [0.3, -0.8]) {
        const along = dir.scale(Math.cos(tilt)).add(new Vector3(0, Math.sin(tilt), 0));
        const f = MeshBuilder.CreatePlane('frond', { width: 0.7, height: 1.8, sideOrientation: Mesh.DOUBLESIDE }, scene);
        f.position = from.add(along.scale(0.9));
        // Lay the plane's length along `along`: tip it over, then turn it to face out.
        f.rotation.set(Math.PI / 2 - tilt, Math.PI / 2 - a, 0);
        fronds.push(f);
        from = from.add(along.scale(1.8));
      }
    }
    for (let k = 0; k < 3; k++) {
      const n = MeshBuilder.CreateSphere('coconut', { diameter: 0.28, segments: 5 }, scene);
      n.position = top.add(new Vector3((rand() - 0.5) * 0.4, -0.25, (rand() - 0.5) * 0.4));
      nuts.push(n);
    }
  }
  merge(trunks, material(scene, 'palmTrunk', (m) => {
    m.diffuseColor = new Color3(0.45, 0.36, 0.24);
    m.specularColor = Color3.Black();
  }), 'palmTrunks');
  merge(fronds, material(scene, 'frond', (m) => {
    m.diffuseTexture = frondTexture(scene);
    m.useAlphaFromDiffuseTexture = true;
    m.backFaceCulling = false;
    m.specularColor = Color3.Black();
  }), 'palmFronds');
  merge(nuts, material(scene, 'coconut', (m) => {
    m.diffuseColor = new Color3(0.3, 0.2, 0.1);
  }), 'coconuts');
}

/** Low ferns crowding round the clearing, just outside the edge. */
function buildFerns(scene: Scene, map: MapDef, terrain: Terrain): void {
  const hw = map.width / 2, hd = map.depth / 2;
  const rand = rng(616);
  const leaves: Mesh[] = [];
  const perimeter = 2 * (map.width + map.depth);
  for (let d = 0; d < perimeter; d += 1.6) {
    // Walk round the edge, then step out a little.
    let x: number, z: number, ox: number, oz: number;
    if (d < map.width) [x, z, ox, oz] = [-hw + d, -hd, 0, -1];
    else if (d < map.width + map.depth) [x, z, ox, oz] = [hw, -hd + (d - map.width), 1, 0];
    else if (d < 2 * map.width + map.depth) [x, z, ox, oz] = [hw - (d - map.width - map.depth), hd, 0, 1];
    else [x, z, ox, oz] = [-hw, hd - (d - 2 * map.width - map.depth), -1, 0];
    const out = 0.8 + rand() * 2.5;
    x += ox * out + (rand() - 0.5);
    z += oz * out + (rand() - 0.5);
    const g = groundOut(terrain, map, x, z), size = 0.7 + rand() * 0.6;
    const n = 6 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rand();
      const tilt = 0.5 + rand() * 0.4;
      const f = MeshBuilder.CreatePlane('fern', { width: 0.5 * size, height: 1.6 * size, sideOrientation: Mesh.DOUBLESIDE }, scene);
      const along = new Vector3(Math.cos(a) * Math.cos(tilt), Math.sin(tilt), Math.sin(a) * Math.cos(tilt));
      f.position = new Vector3(x, g + 0.25, z).add(along.scale(0.8 * size));
      f.rotation.set(Math.PI / 2 - tilt, Math.PI / 2 - a, 0);
      leaves.push(f);
    }
  }
  merge(leaves, material(scene, 'frond', () => {}), 'ferns');
}

interface Bird { node: TransformNode; wings: Mesh[]; r: number; h: number; speed: number; phase: number; cx: number; cz: number }

function buildBirds(scene: Scene): Bird[] {
  const colors = [new Color3(0.9, 0.12, 0.1), new Color3(0.1, 0.35, 0.95), new Color3(1, 0.8, 0.1)];
  const birds: Bird[] = [];
  for (let i = 0; i < 6; i++) {
    const mat = material(scene, `macaw${i % 3}`, (m) => {
      m.diffuseColor = colors[i % 3];
      m.emissiveColor = colors[i % 3].scale(0.25);
    });
    const node = new TransformNode(`macaw${i}`, scene);
    const body = MeshBuilder.CreateBox('macawBody', { width: 0.6, height: 0.18, depth: 0.18 }, scene);
    const tail = MeshBuilder.CreateBox('macawTail', { width: 0.5, height: 0.04, depth: 0.12 }, scene);
    tail.position.x = 0.5;
    const wings = [-1, 1].map((side) => {
      const w = MeshBuilder.CreateBox('macawWing', { width: 0.3, height: 0.03, depth: 0.7 }, scene);
      w.setPivotPoint(new Vector3(0, 0, -side * 0.35));
      w.position.z = side * 0.35;
      return w;
    });
    for (const m of [body, tail, ...wings]) {
      m.parent = node;
      m.material = mat;
      m.isPickable = false;
    }
    birds.push({ node, wings, r: 14 + i * 3, h: 13 + (i % 3) * 2.5, speed: 0.25 + (i % 2) * 0.1, phase: i * 1.7, cx: (i % 2 ? 6 : -4), cz: (i % 3) * 3 - 3 });
  }
  return birds;
}

// ----------------------------------------------------------------------------

/** Burst of leaves and dust where a fallen ship lands. */
function landingDust(scene: Scene, at: Vector3): void {
  const ps = new ParticleSystem('crashDust', 120, scene);
  ps.particleTexture = softDot(scene, 'crashDustTex');
  ps.emitter = at.clone();
  ps.minEmitBox = new Vector3(-1, 0, -1);
  ps.maxEmitBox = new Vector3(1, 0.5, 1);
  ps.color1 = new Color4(0.55, 0.48, 0.35, 0.7);
  ps.color2 = new Color4(0.3, 0.45, 0.2, 0.7);
  ps.colorDead = new Color4(0.5, 0.5, 0.45, 0);
  ps.minSize = 0.8;
  ps.maxSize = 2.5;
  ps.minLifeTime = 0.8;
  ps.maxLifeTime = 2;
  ps.manualEmitCount = 100;
  ps.direction1 = new Vector3(-2, 1, -2);
  ps.direction2 = new Vector3(2, 3, 2);
  ps.minEmitPower = 1;
  ps.maxEmitPower = 3;
  ps.gravity = new Vector3(0, -2, 0);
  ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  ps.targetStopDuration = 2.5;
  ps.disposeOnStop = true;
  ps.start();
}

export function createJungle(scene: Scene, map: MapDef, terrain: Terrain, ground: Color3): Decor {
  buildOuterGround(scene, map, terrain, ground);
  buildWrecks(scene, map, terrain);
  const { hanging } = buildTrees(scene, map, terrain);
  buildPalms(scene, map, terrain);
  buildFerns(scene, map, terrain);
  const birds = buildBirds(scene);
  const m = mats(scene);
  let t = 0, dark = false, wind = 1, glow = 1;

  return {
    crumble(x, z, reach) {
      // Shake one of the hanging ships loose: it drops out of the vines and crashes.
      let best: Hanging | null = null, bestD = reach;
      for (const h of hanging) {
        if (h.down || h.falling) continue;
        const d = Math.hypot(h.pivot.position.x - x, h.pivot.position.z - z);
        if (d <= bestD) {
          best = h;
          bestD = d;
        }
      }
      if (!best) return false;
      const ship = best.ship;
      ship.setParent(null);
      const p = ship.position;
      best.falling = { vy: 0, spin: new Vector3(Math.random() - 0.5, Math.random() - 0.5, 1.5), floor: groundOut(terrain, map, p.x, p.z) + 0.4 };
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
      // Damaged cores flicker; the boss makes them go haywire; blackouts kill them.
      const target = dark ? 0.05 : 0.75 + 0.25 * Math.sin(t * 9) * Math.sin(t * 2.7) + (bossActive ? 0.3 * Math.sin(t * 25) : 0);
      glow += (target - glow) * Math.min(1, dt * 10);
      m.core.emissiveColor = CORE.scale(Math.max(0, glow));
      m.beacon.emissiveColor = BEACON.scale(dark ? 0 : Math.sin(t * 3) > 0.3 ? 1 : 0.1);

      for (const h of hanging) {
        if (h.falling) {
          const f = h.falling, s = h.ship;
          f.vy -= 18 * dt;
          s.position.y += f.vy * dt;
          s.rotation.addInPlace(f.spin.scale(dt));
          if (s.position.y <= f.floor) {
            s.position.y = f.floor;
            landingDust(scene, s.position);
            h.falling = null;
            h.down = true;
          }
          continue;
        }
        // Swinging in the breeze (the empty vines too, once the ship has gone).
        const k = h.down ? 1.6 : 1;
        h.pivot.rotation.x = Math.sin(t * 0.7 + h.phase) * 0.06 * wind * k;
        h.pivot.rotation.z = Math.sin(t * 0.5 + h.phase * 2) * 0.05 * wind * k;
      }

      for (const b of birds) {
        const a = t * b.speed + b.phase;
        b.node.position.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t * 0.8 + b.phase) * 0.8, b.cz + Math.sin(a) * b.r * 0.7);
        // Facing along the circle (body length runs along x, beak at -x).
        b.node.rotation.y = -a + Math.PI;
        b.node.rotation.x = -0.3;
        const flap = Math.sin(t * 9 + b.phase) * 0.7;
        b.wings[0].rotation.x = flap;
        b.wings[1].rotation.x = -flap;
      }
    },
  };
}
