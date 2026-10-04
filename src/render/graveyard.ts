import {
  Color3, Matrix, Mesh, MeshBuilder, PointLight, Quaternion, Scene, StandardMaterial,
  TransformNode, Vector3, type ArcRotateCamera, type GlowLayer, type InstancedMesh,
} from '@babylonjs/core';
import type { MapDef, Rock } from '../data/config';
import { buildOuterGround, canvasTexture, hash, material, merge, rng, type Decor } from './decor';
import type { Terrain } from './terrain';

// Scenery for the graveyard (Cyber Cemetery): rows of tombstones with neon
// inscriptions, an iron fence strung with humming neon beams, a creepy gazebo
// on the hill, ghosts drifting up out of the graves, green slime oozing from
// some of them, and haunted houses under a huge moon beyond the fence.
// All for looks: tombstones and the gazebo are rocks to the rules.

const NEON = new Color3(0.3, 0.75, 1);
const SLIME = new Color3(0.35, 1, 0.2);
const LANTERN = new Color3(0.55, 1, 0.35);
const WINDOW = new Color3(1, 0.72, 0.3);

// ----------------------------------------------------------------------------
//  Textures
// ----------------------------------------------------------------------------

function graniteTexture(scene: Scene) {
  return canvasTexture(scene, 'granite', 128, 128, (g) => {
    const rand = rng(31);
    g.fillStyle = '#7d828c';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1400; i++) {
      const v = 70 + rand() * 90;
      g.fillStyle = `rgba(${v},${v + 4},${v + 12},0.5)`;
      g.fillRect(rand() * 128, rand() * 128, 1 + rand() * 2, 1 + rand() * 2);
    }
    // Moss and grime creeping up from the ground.
    const grad = g.createLinearGradient(0, 128, 0, 60);
    grad.addColorStop(0, 'rgba(40,70,35,0.75)');
    grad.addColorStop(1, 'rgba(40,70,35,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    // A crack or two.
    g.strokeStyle = 'rgba(25,25,30,0.7)';
    g.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      let x = rand() * 128, y = rand() * 50;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) g.lineTo((x += (rand() - 0.5) * 18), (y += 6 + rand() * 8));
      g.stroke();
    }
  });
}

/** Dark clapboard siding, peeling and stained. */
function sidingTexture(scene: Scene) {
  return canvasTexture(scene, 'siding', 128, 128, (g) => {
    const rand = rng(77);
    g.fillStyle = '#2a2433';
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 8) {
      g.fillStyle = `rgba(10,8,14,${0.5 + rand() * 0.3})`;
      g.fillRect(0, y, 128, 2);
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '70,60,80' : '8,6,10'},${0.2 + rand() * 0.3})`;
      g.fillRect(rand() * 128, rand() * 128, 1 + rand() * 6, 1 + rand() * 2);
    }
  });
}

/** A spider web in the top-left corner. */
function webTexture(scene: Scene) {
  const tex = canvasTexture(scene, 'web', 128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(230,240,255,0.75)';
    g.lineWidth = 1;
    const spokes = 7;
    for (let i = 0; i <= spokes; i++) {
      const a = (i / spokes) * (Math.PI / 2);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * 125, Math.sin(a) * 125);
      g.stroke();
    }
    for (let r = 14; r < 125; r += 13) {
      g.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const a = (i / spokes) * (Math.PI / 2), sag = i % 2 ? 0.9 : 1;
        const x = Math.cos(a) * r * sag, y = Math.sin(a) * r * sag;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  }, false);
  tex.hasAlpha = true;
  return tex;
}

/**
 * The night sky as a backdrop beyond the haunted houses: stars, wisps of cloud,
 * and a huge moon low over the horizon, fading into the mist at the bottom.
 */
function skyTexture(scene: Scene, fog: Color3, moonU: number) {
  const W = 1024, H = 384;
  return canvasTexture(scene, 'nightSky', W, H, (g) => {
    const rand = rng(1313);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#02030a');
    grad.addColorStop(0.6, '#0a1230');
    grad.addColorStop(1, fog.toHexString());
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 500; i++) {
      const y = rand() * H * 0.75;
      g.fillStyle = `rgba(220,230,255,${(0.3 + rand() * 0.7) * (1 - y / (H * 0.8))})`;
      const s = rand() < 0.08 ? 2 : 1;
      g.fillRect(rand() * W, y, s, s);
    }
    // The moon, low and swollen, with a cold halo.
    const mx = moonU * W, my = H * 0.76, mr = H * 0.15;
    const halo = g.createRadialGradient(mx, my, mr * 0.9, mx, my, mr * 3);
    halo.addColorStop(0, 'rgba(190,210,255,0.45)');
    halo.addColorStop(1, 'rgba(190,210,255,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H);
    const face = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
    face.addColorStop(0, '#fffbe8');
    face.addColorStop(1, '#d9d4b4');
    g.fillStyle = face;
    g.beginPath();
    g.arc(mx, my, mr, 0, Math.PI * 2);
    g.fill();
    // Craters and seas.
    for (let i = 0; i < 16; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * mr * 0.8, r = mr * (0.05 + rand() * 0.2);
      g.fillStyle = `rgba(150,145,120,${0.25 + rand() * 0.3})`;
      g.beginPath();
      g.arc(mx + Math.cos(a) * d, my + Math.sin(a) * d, r, 0, Math.PI * 2);
      g.fill();
    }
    // Thin dark clouds drifting across it.
    for (let i = 0; i < 7; i++) {
      const y = my - mr + rand() * mr * 2.2, x = mx - mr * 2.5 + rand() * mr * 3;
      g.fillStyle = `rgba(8,10,22,${0.45 + rand() * 0.35})`;
      g.beginPath();
      g.ellipse(x, y, mr * (0.8 + rand() * 1.4), mr * (0.05 + rand() * 0.07), 0, 0, Math.PI * 2);
      g.fill();
    }
    // Mist rising off the ground along the bottom.
    const mist = g.createLinearGradient(0, H * 0.86, 0, H);
    mist.addColorStop(0, fog.toHexString() + '00');
    mist.addColorStop(1, fog.toHexString() + 'ff');
    g.fillStyle = mist;
    g.fillRect(0, 0, W, H);
  });
}

// ----------------------------------------------------------------------------
//  Tombstones (rocks)
// ----------------------------------------------------------------------------

interface Template {
  stone: Mesh;
  glow: Mesh;
  /** Where the front face is (local z), and how high slime starts running down it. */
  front: number;
  ooze: number;
  height: number;
}

export interface Tombstone {
  x: number;
  z: number;
  y: number;
  yaw: number;
  pitch: number;
  roll: number;
  scale: number;
  template: Template;
  index: number;
  /** 0 = standing, 1 = knocked flat. */
  fall: number;
  fallDir: number;
  slime?: { puddle: InstancedMesh; streak: InstancedMesh; drop: InstancedMesh; phase: number; period: number };
}

function ironMat(scene: Scene): StandardMaterial {
  return material(scene, 'iron', (m) => {
    m.diffuseColor = new Color3(0.09, 0.09, 0.11);
    m.specularColor = new Color3(0.35, 0.4, 0.5);
  });
}

/** Weathered stone for the gazebo's deck and the gate pillars. */
function stoneMat(scene: Scene): StandardMaterial {
  return material(scene, 'cemeteryStone', (m) => {
    m.diffuseTexture = graniteTexture(scene);
    m.diffuseColor = new Color3(0.6, 0.6, 0.65);
  });
}

function box(scene: Scene, w: number, h: number, d: number, x: number, y: number, z: number): Mesh {
  const m = MeshBuilder.CreateBox('part', { width: w, height: h, depth: d }, scene);
  m.position.set(x, y, z);
  return m;
}

/** A thin glowing line on the front of a stone (an inscription). */
function line(scene: Scene, w: number, h: number, x: number, y: number, z: number): Mesh {
  const m = MeshBuilder.CreatePlane('line', { width: w, height: h, sideOrientation: Mesh.DOUBLESIDE }, scene);
  m.position.set(x, y, z);
  return m;
}

function templates(scene: Scene): Template[] {
  const stoneMat = material(scene, 'tombstone', (m) => {
    m.diffuseTexture = graniteTexture(scene);
    m.specularColor = new Color3(0.08, 0.08, 0.1);
  });
  const glowMat = (name: string, c: Color3) => material(scene, name, (m) => {
    m.emissiveColor = c;
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
  });
  const cyan = glowMat('inscriptionCyan', NEON);
  const violet = glowMat('inscriptionViolet', new Color3(0.75, 0.35, 1));
  const make = (name: string, stone: Mesh[], glow: Mesh[], glowMat: StandardMaterial, front: number, ooze: number, height: number): Template => ({
    stone: merge(stone, stoneMat, `${name}Stone`)!,
    glow: merge(glow, glowMat, `${name}Glow`)!,
    front, ooze, height,
  });

  // Rounded headstone on a plinth.
  const round = make('round', [
    box(scene, 1.1, 0.16, 0.42, 0, 0.08, 0),
    box(scene, 0.9, 0.85, 0.22, 0, 0.58, 0),
    (() => {
      const c = MeshBuilder.CreateCylinder('top', { diameter: 0.9, height: 0.22, tessellation: 20 }, scene);
      c.rotation.x = Math.PI / 2;
      c.position.y = 1.0;
      return c;
    })(),
  ], [line(scene, 0.5, 0.06, 0, 0.95, -0.12), line(scene, 0.36, 0.05, 0, 0.8, -0.12), line(scene, 0.42, 0.05, 0, 0.66, -0.12)],
  cyan, -0.11, 1.1, 1.45);

  // A stone cross.
  const cross = make('cross', [
    box(scene, 0.7, 0.3, 0.45, 0, 0.15, 0),
    box(scene, 0.22, 1.4, 0.2, 0, 1.0, 0),
    box(scene, 0.8, 0.2, 0.2, 0, 1.25, 0),
  ], [line(scene, 0.05, 1.0, 0, 1.05, -0.105), line(scene, 0.62, 0.05, 0, 1.25, -0.105)],
  violet, -0.1, 1.15, 1.7);

  // Square slab with a pointed cap.
  const slab = make('slab', [
    box(scene, 0.85, 1.05, 0.24, 0, 0.52, 0),
    (() => {
      const c = gable(scene, 0.95, 0.3, 0.3);
      c.position.y = 1.04;
      return c;
    })(),
  ], [line(scene, 0.55, 0.05, 0, 0.88, -0.125), line(scene, 0.4, 0.05, 0, 0.74, -0.125), line(scene, 0.55, 0.05, 0, 0.6, -0.125)],
  cyan, -0.12, 0.95, 1.4);

  // Obelisk.
  const obelisk = make('obelisk', [
    box(scene, 0.7, 0.3, 0.7, 0, 0.15, 0),
    (() => {
      const c = MeshBuilder.CreateCylinder('shaft', { diameterTop: 0.3, diameterBottom: 0.62, height: 1.6, tessellation: 4 }, scene);
      c.rotation.y = Math.PI / 4;
      c.position.y = 1.1;
      return c;
    })(),
    (() => {
      const c = MeshBuilder.CreateCylinder('tip', { diameterTop: 0, diameterBottom: 0.3, height: 0.25, tessellation: 4 }, scene);
      c.rotation.y = Math.PI / 4;
      c.position.y = 2.02;
      return c;
    })(),
  ], [line(scene, 0.45, 0.06, 0, 0.17, -0.355)],
  violet, -0.355, 0.28, 2.1);

  return [round, cross, slab, obelisk];
}

export interface Tombstones {
  stones: Tombstone[];
  /** Knock over up to `max` standing tombstones within `reach` of (x, z). True if any fell. */
  topple(x: number, z: number, reach: number, max: number): boolean;
  update(dt: number, t: number): void;
}

function stoneMatrix(s: Tombstone): Matrix {
  const tip = s.fallDir * s.fall * 1.45;
  return Matrix.Compose(
    new Vector3(s.scale, s.scale, s.scale),
    Quaternion.RotationYawPitchRoll(s.yaw, s.pitch + tip, s.roll),
    new Vector3(s.x, s.y - s.fall * 0.12, s.z),
  );
}

/** Tombstones in place of rocks, all facing the front (south), each settled a little differently. */
export function buildTombstones(scene: Scene, rocks: Rock[], terrain: Terrain): Tombstones {
  const kinds = templates(scene);
  const stones: Tombstone[] = [];
  for (const [i, r] of rocks.entries()) {
    // Mostly rounded headstones and slabs, with crosses and the odd obelisk.
    const pick = hash(i, 5);
    const template = kinds[pick < 0.4 ? 0 : pick < 0.65 ? 2 : pick < 0.9 ? 1 : 3];
    const slimy = hash(i, 9) < 0.2;
    const s: Tombstone = {
      x: r.x, z: r.z, y: terrain.surfaceHeight(r.x, r.z) - 0.05,
      yaw: (hash(i, 1) - 0.5) * 0.3,
      // Slimy ones stand straight so the ooze sits on the face.
      pitch: slimy ? 0 : (hash(i, 2) - 0.5) * 0.16,
      roll: slimy ? 0 : (hash(i, 3) - 0.5) * 0.14,
      scale: (r.r / 0.55) * (0.85 + hash(i, 4) * 0.3),
      template, index: 0, fall: 0, fallDir: 1,
    };
    s.index = template.stone.thinInstanceAdd(stoneMatrix(s), false);
    template.glow.thinInstanceAdd(stoneMatrix(s), false);
    stones.push(s);
  }
  for (const k of kinds) {
    for (const m of [k.stone, k.glow]) {
      // Added without refreshing one by one, so upload them all now.
      m.thinInstanceBufferUpdated('matrix');
      m.thinInstanceRefreshBoundingInfo(true);
      m.isPickable = false;
    }
  }
  addSlime(scene, stones);

  const falling: Tombstone[] = [];
  return {
    stones,
    topple(x, z, reach, max) {
      const near = stones
        .filter((s) => s.fall === 0 && Math.hypot(s.x - x, s.z - z) <= reach)
        .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))
        .slice(0, max);
      for (const s of near) {
        s.fall = 0.001;
        s.fallDir = s.z >= z ? 1 : -1;
        falling.push(s);
        if (s.slime) for (const m of [s.slime.streak, s.slime.drop]) m.setEnabled(false);
      }
      return near.length > 0;
    },
    update(dt, t) {
      for (let i = falling.length - 1; i >= 0; i--) {
        const s = falling[i];
        // Topples slowly, then slams down.
        s.fall = Math.min(1, s.fall + dt * (0.6 + s.fall * 4));
        const m = stoneMatrix(s);
        s.template.stone.thinInstanceSetMatrixAt(s.index, m, false);
        s.template.glow.thinInstanceSetMatrixAt(s.index, m, false);
        if (s.fall >= 1) falling.splice(i, 1);
      }
      if (falling.length) for (const k of new Set(stones.map((s) => s.template))) {
        k.stone.thinInstanceBufferUpdated('matrix');
        k.glow.thinInstanceBufferUpdated('matrix');
      }
      animateSlime(stones, t);
    },
  };
}

// ----------------------------------------------------------------------------
//  Slime oozing out of some of the graves
// ----------------------------------------------------------------------------

/** World position of a point on a stone, from its own (un-tilted) frame. */
function onStone(s: Tombstone, lx: number, ly: number, lz: number): Vector3 {
  const c = Math.cos(s.yaw), n = Math.sin(s.yaw);
  return new Vector3(s.x + (lx * c + lz * n) * s.scale, s.y + ly * s.scale, s.z + (-lx * n + lz * c) * s.scale);
}

function addSlime(scene: Scene, stones: Tombstone[]): void {
  const mat = material(scene, 'slime', (m) => {
    m.diffuseColor = new Color3(0.2, 0.6, 0.1);
    m.emissiveColor = SLIME.scale(0.65);
    m.specularColor = new Color3(0.8, 1, 0.7);
    m.specularPower = 48;
  });
  const puddle = MeshBuilder.CreateSphere('slimePuddle', { diameter: 1, segments: 10 }, scene);
  const streak = MeshBuilder.CreateBox('slimeStreak', { width: 1, height: 1, depth: 1 }, scene);
  const drop = MeshBuilder.CreateSphere('slimeDrop', { diameter: 1, segments: 8 }, scene);
  for (const m of [puddle, streak, drop]) {
    m.material = mat;
    m.isPickable = false;
    m.isVisible = false; // only the instances show
  }
  for (const [i, s] of stones.entries()) {
    if (hash(i, 9) >= 0.2) continue;
    const t = s.template;
    const p = puddle.createInstance(`puddle${i}`);
    p.position = onStone(s, (hash(i, 11) - 0.5) * 0.3, 0.05, t.front - 0.35);
    p.rotation.y = s.yaw + hash(i, 12) * 2;
    p.scaling.set(0.9 * s.scale, 0.08, 0.6 * s.scale);
    const st = streak.createInstance(`streak${i}`);
    const top = t.ooze, len = top - 0.1;
    st.position = onStone(s, 0.08, top - len / 2, t.front - 0.02);
    st.rotation.y = s.yaw;
    st.scaling.set(0.11 * s.scale, len * s.scale, 0.03);
    const d = drop.createInstance(`drop${i}`);
    d.scaling.setAll(0.12 * s.scale);
    s.slime = { puddle: p, streak: st, drop: d, phase: hash(i, 13) * 10, period: 1.8 + hash(i, 14) * 2 };
  }
}

function animateSlime(stones: Tombstone[], t: number): void {
  for (const s of stones) {
    const sl = s.slime;
    if (!sl) continue;
    // The puddle swells and settles; a drop slides down the face and drips in.
    const k = Math.sin(t * 1.7 + sl.phase);
    sl.puddle.scaling.x = (0.9 + 0.08 * k) * s.scale;
    sl.puddle.scaling.z = (0.6 + 0.06 * k) * s.scale;
    if (s.fall > 0) continue;
    const f = ((t + sl.phase) % sl.period) / sl.period;
    const y = s.template.ooze * (1 - f * f) + 0.05 * f;
    sl.drop.position = onStone(s, 0.08, y, s.template.front - 0.06 - f * 0.25);
    sl.drop.scaling.y = 0.12 * s.scale * (1 + f * 0.8);
  }
}

// ----------------------------------------------------------------------------
//  The creepy gazebo on the hill
// ----------------------------------------------------------------------------

interface Gazebo { lantern: TransformNode; bulb: StandardMaterial; light: PointLight; beacon: StandardMaterial }

function buildGazebo(scene: Scene, rock: Rock, terrain: Terrain): Gazebo {
  const y0 = terrain.surfaceHeight(rock.x, rock.z);
  const R = rock.r * 0.85; // posts stand in from the blocked circle
  const root = new TransformNode('gazebo', scene);
  root.position.set(rock.x, y0, rock.z);
  const stone: Mesh[] = [], iron: Mesh[] = [], roof: Mesh[] = [], wood: Mesh[] = [];
  const own = (m: Mesh) => {
    m.parent = root;
    return m;
  };

  // Octagonal platform and steps up from the front.
  const deck = own(MeshBuilder.CreateCylinder('deck', { diameter: R * 2 + 0.6, height: 0.6, tessellation: 8 }, scene));
  deck.rotation.y = Math.PI / 8;
  deck.position.y = 0.1;
  stone.push(deck);
  for (let k = 0; k < 2; k++) stone.push(own(box(scene, 1.4, 0.2, 0.4, 0, 0.1 + k * 0.18 - 0.18, -R - 0.35 - (1 - k) * 0.35)));

  const H = 2.7, base = 0.4;
  const corner = (i: number) => {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    return { a, x: Math.cos(a) * R, z: Math.sin(a) * R };
  };
  for (let i = 0; i < 8; i++) {
    const p = corner(i), q = corner(i + 1);
    // Posts, one leaning a little.
    const post = own(box(scene, 0.16, H, 0.16, p.x, base + H / 2, p.z));
    if (i === 5) post.rotation.z = 0.06;
    iron.push(post);
    // Rails, except across the doorway at the front; one hangs broken.
    const mid = (p.a + q.a) / 2;
    const front = Math.abs(Math.atan2(Math.sin(mid + Math.PI / 2), Math.cos(mid + Math.PI / 2))) < 0.3;
    if (front) continue;
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    for (const h of [0.35, 0.95]) {
      const rail = own(box(scene, len, 0.07, 0.07, (p.x + q.x) / 2, base + h, (p.z + q.z) / 2));
      rail.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
      if (i === 2 && h > 0.5) {
        rail.rotation.z = 0.35; // snapped and sagging
        rail.position.y -= 0.2;
      }
      iron.push(rail);
    }
  }

  // Steep witch-hat roof with a crooked spire and a red beacon like an eye.
  const cap = own(MeshBuilder.CreateCylinder('roof', { diameterTop: 0, diameterBottom: R * 2 + 1, height: 2.6, tessellation: 8 }, scene));
  cap.rotation.y = Math.PI / 8;
  cap.position.y = base + H + 1.25;
  roof.push(cap);
  const spire = own(MeshBuilder.CreateCylinder('spire', { diameter: 0.07, height: 1.3, tessellation: 6 }, scene));
  spire.position.set(0.1, base + H + 3, 0);
  spire.rotation.z = -0.15;
  iron.push(spire);

  const beacon = material(scene, 'gazeboBeacon', (m) => {
    m.emissiveColor = new Color3(1, 0.1, 0.1);
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
  });
  const eye = own(MeshBuilder.CreateSphere('beacon', { diameter: 0.22, segments: 8 }, scene));
  eye.position.set(0.2, base + H + 3.65, 0);
  eye.material = beacon;

  // Neon trim round the eaves.
  const trimPath: Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const p = corner(i);
    trimPath.push(new Vector3(p.x * 1.18, base + H - 0.02, p.z * 1.18));
  }
  const trim = own(MeshBuilder.CreateTube('gazeboTrim', { path: trimPath, radius: 0.045, tessellation: 6 }, scene));
  trim.material = material(scene, 'gazeboTrim', (m) => {
    m.emissiveColor = new Color3(0.7, 0.3, 1);
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
  });

  // An open coffin in the middle, glowing from inside.
  wood.push(own(box(scene, 0.8, 0.4, 1.9, 0, base + 0.2, 0)));
  const lid = own(box(scene, 0.86, 0.08, 1.95, 0.35, base + 0.5, 0.05));
  lid.rotation.z = -0.35;
  lid.rotation.y = 0.15;
  wood.push(lid);
  const ooze = own(box(scene, 0.66, 0.02, 1.75, 0, base + 0.41, 0));
  ooze.material = material(scene, 'coffinGlow', (m) => {
    m.emissiveColor = SLIME.scale(0.8);
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
  });

  // Cobwebs in a few corners of the eaves.
  const webMat = material(scene, 'web', (m) => {
    m.diffuseTexture = webTexture(scene);
    m.useAlphaFromDiffuseTexture = true;
    m.emissiveColor = new Color3(0.35, 0.4, 0.5);
    m.backFaceCulling = false;
  });
  for (const i of [0, 3, 6]) {
    const p = corner(i), q = corner(i + 1);
    const web = own(MeshBuilder.CreatePlane('web', { size: 1.1 }, scene));
    web.position.set(p.x * 0.75 + q.x * 0.25, base + H - 0.6, p.z * 0.75 + q.z * 0.25);
    web.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
    web.material = webMat;
    web.isPickable = false;
  }

  merge(stone, stoneMat(scene), 'gazeboStone');
  merge(iron, ironMat(scene), 'gazeboIron');
  merge(roof, material(scene, 'gazeboRoof', (m) => {
    m.diffuseColor = new Color3(0.1, 0.06, 0.13);
    m.specularColor = new Color3(0.1, 0.05, 0.15);
  }), 'gazeboRoof');
  merge(wood, material(scene, 'coffin', (m) => {
    m.diffuseColor = new Color3(0.2, 0.1, 0.06);
  }), 'coffin');

  // A lantern on a chain, swinging, throwing sickly green light.
  const lantern = new TransformNode('lanternPivot', scene);
  lantern.parent = root;
  lantern.position.y = base + H + 0.4;
  const chain = MeshBuilder.CreateBox('chain', { width: 0.03, height: 0.9, depth: 0.03 }, scene);
  chain.parent = lantern;
  chain.position.y = -0.45;
  chain.material = ironMat(scene);
  const bulb = material(scene, 'lantern', (m) => {
    m.emissiveColor = LANTERN;
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
  });
  const cage = MeshBuilder.CreateCylinder('lantern', { diameterTop: 0.14, diameterBottom: 0.26, height: 0.32, tessellation: 6 }, scene);
  cage.parent = lantern;
  cage.position.y = -1.05;
  cage.material = bulb;
  const light = new PointLight('lanternLight', new Vector3(rock.x, y0 + base + H - 0.7, rock.z), scene);
  light.diffuse = LANTERN;
  light.specular = LANTERN.scale(0.3);
  light.range = 11;
  for (const m of [chain, cage, trim, eye, ooze]) m.isPickable = false;
  return { lantern, bulb, light, beacon };
}

// ----------------------------------------------------------------------------
//  The fence: iron posts strung with humming neon beams
// ----------------------------------------------------------------------------

interface Fence { core: StandardMaterial; sheath: StandardMaterial }

function buildFence(scene: Scene, map: MapDef, terrain: Terrain): Fence {
  const hw = map.width / 2 + 0.6, hd = map.depth / 2 + 0.6;
  const gate = map.edges.north;
  const posts: Mesh[] = [], caps: Mesh[] = [], cores: Mesh[] = [], sheaths: Mesh[] = [], stone: Mesh[] = [];
  const at = (x: number, z: number) => new Vector3(x, terrain.surfaceHeight(Math.max(-hw + 0.6, Math.min(hw - 0.6, x)), Math.max(-hd + 0.6, Math.min(hd - 0.6, z))), z);

  /** One side of the fence, post to post, leaving out any stretch inside `skip`. */
  const side = (x0: number, z0: number, x1: number, z1: number, skip?: [number, number]) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.ceil(len / 3.2);
    let prev: Vector3 | null = null;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      const along = z0 === z1 ? x : z;
      if (skip && along > skip[0] && along < skip[1]) {
        prev = null;
        continue;
      }
      const p = at(x, z);
      const post = box(scene, 0.2, 2.5, 0.2, p.x, p.y + 1.15, p.z);
      posts.push(post);
      const cap = MeshBuilder.CreateCylinder('cap', { diameterTop: 0, diameterBottom: 0.26, height: 0.35, tessellation: 4 }, scene);
      cap.position.set(p.x, p.y + 2.55, p.z);
      caps.push(cap);
      if (prev) {
        for (const h of [0.75, 1.65]) {
          const path = [prev.add(new Vector3(0, h, 0)), p.add(new Vector3(0, h, 0))];
          cores.push(MeshBuilder.CreateTube('beam', { path, radius: 0.035, tessellation: 6 }, scene));
          sheaths.push(MeshBuilder.CreateTube('sheath', { path, radius: 0.1, tessellation: 8 }, scene));
        }
      }
      prev = p;
    }
  };
  side(-hw, -hd, hw, -hd);
  side(hw, -hd, hw, hd);
  side(-hw, -hd, -hw, hd);
  side(-hw, hd, hw, hd, [gate.from - 0.5, gate.to + 0.5]);

  // The gate: two stone pillars and a broken iron arch, the gates swung wide.
  const left = at(gate.from - 1, hd), right = at(gate.to + 1, hd);
  for (const p of [left, right]) {
    stone.push(box(scene, 0.8, 3.6, 0.8, p.x, p.y + 1.6, p.z));
    stone.push(box(scene, 1.0, 0.25, 1.0, p.x, p.y + 3.5, p.z));
  }
  const span = right.x - left.x, top = Math.max(left.y, right.y) + 3.6;
  const arch: Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI;
    arch.push(new Vector3(left.x + span / 2 - Math.cos(a) * span / 2, top + Math.sin(a) * 1.6, hd));
  }
  posts.push(MeshBuilder.CreateTube('arch', { path: arch, radius: 0.09, tessellation: 6 }, scene));
  cores.push(MeshBuilder.CreateTube('archNeon', { path: arch.map((v) => v.add(new Vector3(0, -0.25, -0.05))), radius: 0.035, tessellation: 6 }, scene));
  for (const [side, p] of [[1, left], [-1, right]] as const) {
    const w = span / 2 - 0.5;
    const leaf: Mesh[] = [box(scene, w, 0.08, 0.08, w / 2, 2.6, 0), box(scene, w, 0.08, 0.08, w / 2, 0.3, 0)];
    for (let b = 0.2; b < w; b += 0.4) leaf.push(box(scene, 0.05, 2.6, 0.05, b, 1.45, 0));
    const pivot = new TransformNode('gateLeaf', scene);
    pivot.position.set(p.x + side * 0.4, p.y, hd);
    pivot.rotation.y = side > 0 ? -1.9 : -1.25; // flung open outward
    for (const m of leaf) m.parent = pivot;
    posts.push(...leaf);
  }

  merge(posts, ironMat(scene), 'fencePosts');
  merge(stone, stoneMat(scene), 'gatePillars');
  const capMat = material(scene, 'fenceCap', (m) => {
    m.emissiveColor = NEON.scale(0.8);
    m.diffuseColor = Color3.Black();
  });
  merge(caps, capMat, 'fenceCaps');
  const core = material(scene, 'saberCore', (m) => {
    m.emissiveColor = new Color3(0.85, 0.97, 1);
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
  });
  const sheath = material(scene, 'saberSheath', (m) => {
    m.emissiveColor = new Color3(0.15, 0.5, 1);
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
    m.alpha = 0.4;
  });
  merge(cores, core, 'fenceBeams');
  merge(sheaths, sheath, 'fenceSheaths');
  return { core, sheath };
}

// ----------------------------------------------------------------------------
//  Haunted houses, dead trees and the moonlit sky beyond the fence
// ----------------------------------------------------------------------------

/** A triangular prism roof: ridge along x, `depth` across, `height` tall, base at y = 0. */
function gable(scene: Scene, length: number, depth: number, height: number): Mesh {
  const m = MeshBuilder.CreateCylinder('gable', { diameter: 1, height: length, tessellation: 3 }, scene);
  // Triangle with a corner at +x: turn that corner up, then stretch it to size.
  m.rotation.z = Math.PI / 2;
  m.scaling.set(height / 0.75, 1, depth / 0.866);
  m.position.y = height / 3;
  m.bakeCurrentTransformIntoVertices();
  return m;
}

interface House { windows: StandardMaterial; seed: number; level: number }

function hauntedHouse(scene: Scene, i: number, x: number, z: number, y: number, s: number, yaw: number): House {
  const rand = rng(900 + i);
  const root = new TransformNode(`house${i}`, scene);
  root.position.set(x, y, z);
  root.rotation.y = yaw;
  root.scaling.setAll(s);
  const walls: Mesh[] = [], roofs: Mesh[] = [], lit: Mesh[] = [], dark: Mesh[] = [];
  const own = (m: Mesh) => {
    m.parent = root;
    return m;
  };
  const W = 6 + rand() * 2, H1 = 3.4, H2 = 3, D = 5;
  walls.push(own(box(scene, W, H1, D, 0, H1 / 2 - 0.5, 0)));
  walls.push(own(box(scene, W * 0.85, H2, D * 0.9, -W * 0.05, H1 + H2 / 2 - 0.5, 0)));
  const r1 = own(gable(scene, W * 0.85 + 0.6, D * 0.9 + 0.8, 2.6));
  r1.position.set(-W * 0.05, H1 + H2 - 0.5, 0);
  r1.rotation.z = (rand() - 0.5) * 0.06; // sagging
  roofs.push(r1);
  // A front gable over the door.
  const r2 = own(gable(scene, 2.6, 2.6, 1.6));
  r2.rotation.y = Math.PI / 2;
  r2.position.set(-W * 0.25, H1 - 0.5, -D / 2 - 0.3);
  roofs.push(r2);
  // The tower with its tall pointed hat.
  const tx = W / 2 - 0.4, tz = -D / 2 + 0.6, TH = H1 + H2 + 1.6;
  walls.push(own(MeshBuilder.CreateCylinder('tower', { diameter: 2.2, height: TH, tessellation: 8 }, scene)));
  walls[walls.length - 1].position.set(tx, TH / 2 - 0.5, tz);
  const hat = own(MeshBuilder.CreateCylinder('hat', { diameterTop: 0, diameterBottom: 2.9, height: 4.2, tessellation: 8 }, scene));
  hat.position.set(tx, TH + 1.6, tz);
  roofs.push(hat);
  walls.push(own(box(scene, 0.6, 2.6, 0.6, -W * 0.35, H1 + H2 + 0.6, 0.8)));
  // Porch roof on thin posts.
  roofs.push(own(box(scene, W * 0.6, 0.15, 1.4, -W * 0.15, 2.4, -D / 2 - 0.7)));
  for (const px of [-W * 0.42, W * 0.12]) walls.push(own(box(scene, 0.12, 2.5, 0.12, px, 1.1, -D / 2 - 1.3)));

  // Windows on the front: a few lit, most dark.
  const win = (wx: number, wy: number, wz: number, w = 0.7, h = 1.0) => {
    const m = own(MeshBuilder.CreatePlane('win', { width: w, height: h }, scene));
    m.position.set(wx, wy, wz);
    (rand() < 0.4 ? lit : dark).push(m);
  };
  for (const wx of [-W * 0.35, -W * 0.05, W * 0.2]) win(wx, 1.4, -D / 2 - 0.02);
  for (const wx of [-W * 0.3, W * 0.05]) win(wx, H1 + 1.1, -D * 0.45 - 0.02);
  win(tx, TH - 1.2, tz - 1.12, 0.5, 0.9);
  if (!lit.length) lit.push(dark.pop()!);

  const windows = new StandardMaterial(`houseWindows${i}`, scene);
  windows.emissiveColor = WINDOW;
  windows.diffuseColor = Color3.Black();
  windows.disableLighting = true;
  merge(walls, material(scene, 'houseWalls', (m) => {
    m.diffuseTexture = sidingTexture(scene);
    m.specularColor = Color3.Black();
  }), `houseWalls${i}`);
  merge(roofs, material(scene, 'houseRoof', (m) => {
    m.diffuseColor = new Color3(0.07, 0.05, 0.08);
    m.specularColor = Color3.Black();
  }), `houseRoof${i}`);
  merge(lit, windows, `houseLit${i}`);
  merge(dark, material(scene, 'houseDark', (m) => {
    m.diffuseColor = new Color3(0.02, 0.02, 0.03);
    m.specularColor = Color3.Black();
  }), `houseDark${i}`);
  return { windows, seed: i * 7.3, level: 1 };
}

function deadTree(scene: Scene, x: number, z: number, y: number, seed: number, out: Mesh[]): void {
  const rand = rng(seed);
  const grow = (from: Vector3, dir: Vector3, len: number, r: number, depth: number) => {
    const to = from.add(dir.scale(len));
    const m = MeshBuilder.CreateCylinder('branch', { diameterTop: r * 1.3, diameterBottom: r * 2, height: len, tessellation: 5 }, scene);
    m.position = from.add(to).scale(0.5);
    // Point the cylinder's y axis along the branch.
    const axis = Vector3.Cross(Vector3.Up(), dir);
    const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(Vector3.Up(), dir))));
    if (axis.length() > 1e-4) m.rotationQuaternion = Quaternion.RotationAxis(axis.normalize(), angle);
    out.push(m);
    if (depth === 0) return;
    const kids = 2 + Math.floor(rand() * 2);
    for (let k = 0; k < kids; k++) {
      const d = new Vector3(dir.x + (rand() - 0.5) * 1.6, dir.y * (0.4 + rand() * 0.5), dir.z + (rand() - 0.5) * 1.6).normalize();
      grow(to, d, len * (0.55 + rand() * 0.2), r * 0.6, depth - 1);
    }
  };
  grow(new Vector3(x, y - 0.3, z), new Vector3((rand() - 0.5) * 0.3, 1, (rand() - 0.5) * 0.3).normalize(), 2.4 + rand(), 0.2, 3);
}

function buildBeyond(scene: Scene, map: MapDef, terrain: Terrain, fog: Color3): { houses: House[]; sky: Mesh } {
  const hw = map.width / 2, hd = map.depth / 2;
  const houses: House[] = [];
  // Small and far-looking, in a ragged line along the rise behind the fence.
  const spots: [number, number, number, number][] = [
    [-hw - 6, hd + 9, 0.75, 0.35], [-hw * 0.45, hd + 10, 0.85, -0.12], [hw * 0.15, hd + 12, 0.7, 0.18],
    [hw * 0.7, hd + 9, 0.8, -0.3], [hw + 9, hd + 5, 0.75, -0.6],
  ];
  for (const [i, [x, z, s, yaw]] of spots.entries()) houses.push(hauntedHouse(scene, i, x, z, groundOut(terrain, map, x, z), s, yaw));

  const trees: Mesh[] = [];
  const treeSpots: [number, number][] = [
    [-hw - 3, -hd * 0.4], [-hw - 4, hd * 0.3], [hw + 3.5, -hd * 0.2], [hw + 3, hd * 0.55],
    [-hw * 0.7, hd + 4], [hw * 0.4, hd + 4.5], [-hw + 4, -hd - 4], [hw - 6, -hd - 3.5], [hw * 0.95, hd + 13],
  ];
  for (const [i, [x, z]] of treeSpots.entries()) deadTree(scene, x, z, groundOut(terrain, map, x, z), 40 + i, trees);
  merge(trees, material(scene, 'deadWood', (m) => {
    m.diffuseColor = new Color3(0.1, 0.08, 0.08);
    m.specularColor = Color3.Black();
  }), 'deadTrees');

  // The night sky, painted on a backdrop just beyond the houses so it shows
  // over them whenever the camera looks toward the back of the graveyard.
  const sky = MeshBuilder.CreatePlane('nightSky', { width: 320, height: 120 }, scene);
  sky.position.set(0, 48, hd + 16);
  sky.isPickable = false;
  sky.material = material(scene, 'nightSky', (m) => {
    m.emissiveTexture = skyTexture(scene, fog, 0.42);
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
    m.fogEnabled = false;
  });
  return { houses, sky };
}

/** Height of the ground outside the map (matches the outer ground's easing). */
function groundOut(terrain: Terrain, map: MapDef, x: number, z: number): number {
  const beyond = Math.max(Math.abs(x) - map.width / 2, Math.abs(z) - map.depth / 2);
  return terrain.surfaceHeight(x, z) * Math.max(0, 1 - beyond / 40) - 0.3;
}

// ----------------------------------------------------------------------------
//  Ghosts drifting up out of the graves
// ----------------------------------------------------------------------------

interface Ghost { body: Mesh; face: Mesh; stone: Tombstone | null; age: number; life: number; spin: number }

function buildGhosts(scene: Scene, count: number): Ghost[] {
  const sheet = merge([
    (() => {
      const h = MeshBuilder.CreateSphere('head', { diameter: 0.75, segments: 12 }, scene);
      h.position.y = 1.25;
      return h;
    })(),
    (() => {
      const b = MeshBuilder.CreateCylinder('robe', { diameterTop: 0.74, diameterBottom: 1.05, height: 1.1, tessellation: 12 }, scene);
      b.position.y = 0.72;
      return b;
    })(),
    (() => {
      const a = MeshBuilder.CreateCylinder('arms', { diameter: 0.18, height: 1.3, tessellation: 6 }, scene);
      a.rotation.z = Math.PI / 2 - 0.3;
      a.position.set(0, 0.95, -0.15);
      return a;
    })(),
  ], material(scene, 'ghost', (m) => {
    m.emissiveColor = new Color3(0.7, 0.85, 1);
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
    m.alpha = 0.55;
  }), 'ghost')!;
  const face = merge([
    ...[-0.13, 0.13].map((x) => {
      const e = MeshBuilder.CreateSphere('eye', { diameter: 0.15, segments: 6 }, scene);
      e.scaling.y = 1.5;
      e.position.set(x, 1.32, -0.33);
      return e;
    }),
    (() => {
      const m = MeshBuilder.CreateSphere('mouth', { diameter: 0.16, segments: 6 }, scene);
      m.scaling.set(0.9, 1.4, 0.6);
      m.position.set(0, 1.1, -0.34);
      return m;
    })(),
  ], material(scene, 'ghostFace', (m) => {
    m.diffuseColor = Color3.Black();
    m.emissiveColor = new Color3(0.02, 0.02, 0.06);
    m.disableLighting = true;
  }), 'ghostFace')!;
  const ghosts: Ghost[] = [];
  for (let i = 0; i < count; i++) {
    const body = i === 0 ? sheet : sheet.clone(`ghost${i}`)!;
    const f = i === 0 ? face : face.clone(`ghostFace${i}`)!;
    f.parent = body;
    f.position.setAll(0);
    body.setEnabled(false);
    ghosts.push({ body, face: f, stone: null, age: 0, life: 1, spin: 0 });
  }
  return ghosts;
}

// ----------------------------------------------------------------------------

export function createGraveyard(
  scene: Scene, map: MapDef, terrain: Terrain, glow: GlowLayer, ground: Color3, fog: Color3, tombstones?: Tombstones,
): Decor {
  buildOuterGround(scene, map, terrain, ground);
  const gazebos = map.rocks.filter((r) => r.look === 'gazebo').map((r) => buildGazebo(scene, r, terrain));
  const fence = buildFence(scene, map, terrain);
  const { houses, sky } = buildBeyond(scene, map, terrain, fog);
  // The sky and its moon are bright enough already; don't bloom the whole backdrop.
  glow.addExcludedMesh(sky);
  const ghosts = tombstones ? buildGhosts(scene, 8) : [];
  const stones = tombstones?.stones ?? [];

  let t = 0;
  let dark = false;
  let wind = 1;
  let nextGhost = 1;
  let fenceLevel = 1;

  const spawnGhost = (bossActive: boolean) => {
    const g = ghosts.find((o) => !o.stone);
    if (!g || !stones.length) return;
    // Out of a grave near where the player is looking (best of a few picks).
    const cam = scene.activeCamera as ArcRotateCamera | null;
    const tx = cam?.target.x ?? 0, tz = cam?.target.z ?? 0;
    let best: Tombstone | null = null, bestD = Infinity;
    for (let k = 0; k < 4; k++) {
      const s = stones[Math.floor(Math.random() * stones.length)];
      const d = Math.hypot(s.x - tx, s.z - tz);
      if (s.fall === 0 && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    if (!best) return;
    g.stone = best;
    g.age = 0;
    g.life = (bossActive ? 3.5 : 5) + Math.random() * 2;
    g.spin = (Math.random() - 0.5) * 1.2;
    g.body.setEnabled(true);
  };

  return {
    crumble(x, z, reach) {
      // Gravestones don't collapse like buildings; a stomp or blast knocks a few flat.
      return tombstones?.topple(x, z, Math.min(reach, 6), 4) ?? false;
    },
    blackout(on) {
      dark = on;
    },
    setWind(strength) {
      wind = strength;
    },
    update(dt, bossActive) {
      t += dt;
      tombstones?.update(dt, t);

      // Keep the sky's moon in view while panning sideways (it's very far away).
      const cam = scene.activeCamera as ArcRotateCamera | null;
      if (cam) sky.position.x = cam.target.x * 0.9;

      // The neon beams hum, flicker now and then, and die in a blackout.
      const buzz = 0.88 + 0.08 * Math.sin(t * 31) + (Math.sin(t * 0.7) > 0.97 ? -0.5 * Math.abs(Math.sin(t * 60)) : 0);
      const fenceTarget = dark ? 0.05 : bossActive ? buzz * (0.6 + 0.4 * Math.abs(Math.sin(t * 9))) : buzz;
      fenceLevel += (fenceTarget - fenceLevel) * Math.min(1, dt * 12);
      fence.core.emissiveColor = new Color3(0.85, 0.97, 1).scale(fenceLevel);
      fence.sheath.emissiveColor = new Color3(0.15, 0.5, 1).scale(fenceLevel);
      fence.sheath.alpha = 0.25 + 0.2 * fenceLevel;

      for (const gz of gazebos) {
        gz.lantern.rotation.x = Math.sin(t * 1.3) * 0.18 * wind;
        gz.lantern.rotation.z = Math.sin(t * 0.9 + 1) * 0.12 * wind;
        const flicker = dark ? 0 : 0.75 + 0.25 * Math.sin(t * 13) * Math.sin(t * 5.3) - (Math.sin(t * 2.1) > 0.95 ? 0.6 : 0);
        gz.bulb.emissiveColor = LANTERN.scale(Math.max(0.05, flicker));
        gz.light.intensity = Math.max(0, flicker) * 1.4;
        gz.beacon.emissiveColor = new Color3(1, 0.1, 0.1).scale(0.3 + 0.7 * Math.max(0, Math.sin(t * 1.6)));
      }

      for (const h of houses) {
        // Lamps guttering behind the glass; out in a blackout.
        const target = dark ? 0 : 0.8 + 0.2 * Math.sin(t * 7 + h.seed) * Math.sin(t * 2.3 + h.seed * 3) - (Math.sin(t * 0.5 + h.seed) > 0.96 ? 0.7 : 0);
        h.level += (target - h.level) * Math.min(1, dt * 10);
        h.windows.emissiveColor = WINDOW.scale(Math.max(0, h.level));
      }

      // Ghosts: every so often one rises out of a grave, wobbles up and fades away.
      nextGhost -= dt;
      if (nextGhost <= 0) {
        nextGhost = (bossActive ? 0.6 : 1.4) + Math.random() * (bossActive ? 1 : 2.6);
        spawnGhost(bossActive);
      }
      for (const g of ghosts) {
        const s = g.stone;
        if (!s) continue;
        g.age += dt;
        const f = g.age / g.life;
        if (f >= 1) {
          g.stone = null;
          g.body.setEnabled(false);
          continue;
        }
        const rise = 3.2 * (1 - (1 - f) * (1 - f));
        const sway = Math.sin(g.age * 2.2 + s.x) * 0.35 * wind;
        g.body.position.set(s.x + sway, s.y + 0.1 + rise + Math.sin(g.age * 3) * 0.08, s.z + Math.cos(g.age * 1.7) * 0.15);
        g.body.rotation.y = s.yaw + g.spin * g.age;
        g.body.rotation.z = -sway * 0.3;
        g.body.scaling.setAll(0.5 + 0.5 * Math.min(1, f * 4));
        const fade = Math.pow(Math.sin(Math.PI * f), 0.7);
        g.body.visibility = fade;
        g.face.visibility = fade;
      }
    },
  };
}
