import {
  Color3, Color4, Mesh, MeshBuilder, ParticleSystem, Scene, StandardMaterial, TransformNode, Vector3, VertexData,
} from '@babylonjs/core';
import { STRUCTURES } from '../data/config';
import { canvasTexture, material, rng, softDot } from './decor';
import type { Materials, Visual } from './visuals';

// The Power Plant and the Spaceship, the bases beside the Mega-Brain
// Greenhouse on every level. Built from primitives and textures drawn in
// code (ADR 0011), with a little life to them: steam, a pulsing core and
// sparks at the plant; blinking nav lights and idling engines on the ship.

function part<T extends Mesh>(mesh: T, parent: TransformNode, x: number, y: number, z: number, mat: StandardMaterial): T {
  mesh.parent = parent;
  mesh.position.set(x, y, z);
  mesh.material = mat;
  mesh.isPickable = false;
  return mesh;
}

/** Steam (or smoke) rising off a point, drifting with the wind. */
function plume(scene: Scene, name: string, emitter: TransformNode, color: Color4, size: number, rate: number): ParticleSystem {
  const ps = new ParticleSystem(name, 60, scene);
  ps.particleTexture = softDot(scene, 'plumeDot');
  ps.emitter = emitter as unknown as Vector3;
  ps.minEmitBox = new Vector3(-0.15, 0, -0.15);
  ps.maxEmitBox = new Vector3(0.15, 0, 0.15);
  ps.color1 = color;
  ps.color2 = color;
  ps.colorDead = new Color4(color.r, color.g, color.b, 0);
  ps.minSize = size * 0.6;
  ps.maxSize = size * 1.3;
  ps.minScaleX = ps.minScaleY = 1;
  ps.minLifeTime = 1.6;
  ps.maxLifeTime = 3;
  ps.emitRate = rate;
  ps.direction1 = new Vector3(-0.1, 1, -0.1);
  ps.direction2 = new Vector3(0.1, 1, 0.1);
  ps.minEmitPower = 0.5;
  ps.maxEmitPower = 0.9;
  ps.gravity = new Vector3(0.25, 0.15, 0.1);
  ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  ps.start();
  return ps;
}

// ----------------------------------------------------------------------------
//  The Power Plant
// ----------------------------------------------------------------------------

/** Weathered concrete with formwork bands, and red-and-white stripes up top. */
function towerTexture(scene: Scene) {
  return canvasTexture(scene, 'coolingTower', 128, 256, (g) => {
    const rand = rng(41);
    g.fillStyle = '#a7a59c';
    g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 12) {
      g.fillStyle = 'rgba(70,68,62,0.25)';
      g.fillRect(0, y, 128, 1.5);
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '60,58,52' : '200,198,190'},${0.08 + rand() * 0.12})`;
      g.fillRect(rand() * 128, rand() * 256, 2, 2);
    }
    // Water stains running down from the rim.
    for (let i = 0; i < 14; i++) {
      g.fillStyle = 'rgba(60,62,58,0.22)';
      g.fillRect(rand() * 128, 30, 3 + rand() * 5, 60 + rand() * 120);
    }
    // Aviation stripes round the top.
    for (let k = 0; k < 3; k++) {
      g.fillStyle = k % 2 ? '#e8e4dc' : '#c4281c';
      g.fillRect(0, k * 9, 128, 9);
    }
  });
}

/** The turbine hall's wall: corrugated panels, a row of lit windows. */
function hallTexture(scene: Scene) {
  return canvasTexture(scene, 'turbineHall', 256, 128, (g) => {
    g.fillStyle = '#6f7880';
    g.fillRect(0, 0, 256, 128);
    for (let x = 0; x < 256; x += 6) {
      g.fillStyle = 'rgba(30,34,40,0.35)';
      g.fillRect(x, 0, 2, 128);
    }
    for (let x = 14; x < 250; x += 30) {
      g.fillStyle = '#20262c';
      g.fillRect(x, 26, 20, 26);
      g.fillStyle = '#ffd86a';
      g.fillRect(x + 2, 28, 16, 22);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x + 2, 28, 16, 4);
    }
    // A hazard band along the bottom.
    for (let x = -20; x < 256; x += 16) {
      g.fillStyle = '#ffc21f';
      g.beginPath();
      g.moveTo(x, 128); g.lineTo(x + 8, 128); g.lineTo(x + 20, 108); g.lineTo(x + 12, 108);
      g.fill();
    }
    g.fillStyle = '#1b1b1b';
    g.fillRect(0, 106, 256, 2);
  });
}

/** A hyperbolic cooling tower's outline: wide at the foot, pinched near the top. */
function towerShape(height: number, foot: number, waist: number, lip: number): Vector3[] {
  const pts: Vector3[] = [];
  const pinch = 0.75;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const d = (t - pinch) / (t < pinch ? pinch : 1 - pinch);
    const r = waist + (t < pinch ? foot - waist : lip - waist) * d * d;
    pts.push(new Vector3(r, t * height, 0));
  }
  return pts;
}

export function buildPowerPlant(scene: Scene, mats: Materials, name: string): Visual {
  const root = new TransformNode(name, scene);
  const color = STRUCTURES.powerPlant.color;
  const concrete = material(scene, 'pp-concrete', (m) => {
    m.diffuseTexture = towerTexture(scene);
    m.specularColor = new Color3(0.04, 0.04, 0.04);
    m.backFaceCulling = false;
  });
  const steel = mats.dark('#99aabb');
  const pipeMat = material(scene, 'pp-pipe', (m) => {
    m.diffuseColor = Color3.FromHexString('#8a9098');
    m.specularColor = new Color3(0.5, 0.5, 0.5);
  });
  const hall = material(scene, 'pp-hall', (m) => {
    m.diffuseTexture = hallTexture(scene);
    m.emissiveColor = new Color3(0.12, 0.1, 0.06);
    m.specularColor = new Color3(0.1, 0.1, 0.1);
  });

  // The pad, edged in hazard yellow.
  part(MeshBuilder.CreateBox(`${name}-pad`, { width: 3.6, height: 0.25, depth: 3.2 }, scene), root, 0, 0.12, 0, mats.dark('#667788'));
  part(MeshBuilder.CreateBox(`${name}-edge`, { width: 3.7, height: 0.08, depth: 3.3 }, scene), root, 0, 0.18, 0, mats.neon('#ffc21f', 0.35));

  // Two cooling towers, steam pouring off the top, a glowing ring round each rim.
  const plumes: ParticleSystem[] = [];
  for (const [x, z, h] of [[-0.85, -0.55, 2.7], [0.8, 0.6, 2.3]] as const) {
    const tower = MeshBuilder.CreateLathe(`${name}-tower`, { shape: towerShape(h, 0.62, 0.36, 0.42), tessellation: 20, sideOrientation: Mesh.DOUBLESIDE }, scene);
    part(tower, root, x, 0.25, z, concrete);
    const ring = part(MeshBuilder.CreateTorus(`${name}-core`, { diameter: 0.86, thickness: 0.09, tessellation: 20 }, scene), root, x, 0.25 + h, z, mats.neon(color, 1.4));
    ring.rotation.x = 0;
    const top = new TransformNode(`${name}-steamAt`, scene);
    top.parent = root;
    top.position.set(x, 0.3 + h, z);
    plumes.push(plume(scene, `${name}-steam`, top, new Color4(0.95, 0.95, 0.95, 0.35), 0.9, 8));
  }

  // The reactor: a glass dome over a glowing, pulsing core.
  const core = part(MeshBuilder.CreateSphere(`${name}-reactor`, { diameter: 0.6, segments: 14 }, scene), root, 0.85, 0.55, -0.75, mats.neon('#ffb81f', 0.8));
  part(MeshBuilder.CreateSphere(`${name}-dome`, { diameter: 1.15, segments: 16, slice: 0.5 }, scene), root, 0.85, 0.25, -0.75, mats.neon('#9fd8ff', 0.15, 0.35));
  part(MeshBuilder.CreateTorus(`${name}-domeRing`, { diameter: 1.15, thickness: 0.08, tessellation: 24 }, scene), root, 0.85, 0.27, -0.75, steel);

  // The turbine hall along the front, lit windows, vents on the roof.
  part(MeshBuilder.CreateBox(`${name}-hall`, { width: 1.6, height: 0.85, depth: 0.8 }, scene), root, -0.6, 0.67, 0.95, hall);
  part(MeshBuilder.CreateBox(`${name}-hallRoof`, { width: 1.7, height: 0.08, depth: 0.9 }, scene), root, -0.6, 1.12, 0.95, steel);
  for (const vx of [-1.05, -0.6, -0.15]) part(MeshBuilder.CreateCylinder(`${name}-vent`, { height: 0.2, diameter: 0.18, tessellation: 8 }, scene), root, vx, 1.25, 0.95, steel);

  // Pipes from the hall round to the towers and the reactor.
  const pipe = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const p = part(MeshBuilder.CreateCylinder(`${name}-pipe`, { height: len, diameter: 0.14, tessellation: 8 }, scene), root, (x0 + x1) / 2, y, (z0 + z1) / 2, pipeMat);
    p.rotation.set(Math.PI / 2, Math.atan2(x1 - x0, z1 - z0), 0);
  };
  pipe(-0.6, 0.55, -0.85, -0.2, 0.45);
  pipe(0.2, 0.95, 0.8, 0.95, 0.4);
  pipe(0.85, -0.3, 0.85, 0.3, 0.4);

  // A tesla coil on the corner, crackling now and then over to a tower.
  const coilX = 1.35, coilZ = -1.25;
  part(MeshBuilder.CreateCylinder(`${name}-coilMast`, { height: 1.6, diameterTop: 0.08, diameterBottom: 0.2, tessellation: 8 }, scene), root, coilX, 1.05, coilZ, steel);
  for (const [k, y] of [0.7, 1.0, 1.3].entries()) {
    part(MeshBuilder.CreateTorus(`${name}-coil${k}`, { diameter: 0.42 - k * 0.08, thickness: 0.05, tessellation: 16 }, scene), root, coilX, 0.25 + y, coilZ, mats.neon('#b8a0ff', 0.9));
  }
  const ball = part(MeshBuilder.CreateSphere(`${name}-coilBall`, { diameter: 0.3, segments: 10 }, scene), root, coilX, 1.95, coilZ, mats.neon('#d8ccff', 1.4));

  // A red warning light on top of the tall tower.
  const warning = part(MeshBuilder.CreateSphere(`${name}-warning`, { diameter: 0.14, segments: 6 }, scene), root, -0.85 + 0.42, 3.0, -0.55, mats.neon('#ff2020', 1.6));

  let arc: Mesh | null = null, arcLeft = 0, nextArc = 1.5, last = 0, wrecked = false;
  const update = (time: number) => {
    const dt = Math.min(0.1, Math.max(0, time - last));
    last = time;
    if (wrecked) return;
    core.scaling.setAll(1 + 0.12 * Math.sin(time * 4));
    warning.setEnabled(time % 1.6 < 0.6);
    ball.scaling.setAll(1 + 0.15 * Math.sin(time * 23));
    // A spark leaps from the coil to the tall tower's rim, flickering.
    nextArc -= dt;
    if (arcLeft > 0) {
      arcLeft -= dt;
      arc?.dispose();
      arc = null;
      if (arcLeft > 0) {
        const from = new Vector3(coilX, 1.95, coilZ), to = new Vector3(-0.45, 2.9, -0.55);
        const path = [from];
        for (let k = 1; k < 6; k++) path.push(Vector3.Lerp(from, to, k / 6).add(new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).scale(0.35)));
        path.push(to);
        arc = MeshBuilder.CreateTube(`${name}-arc`, { path, radius: 0.025, tessellation: 4 }, scene);
        arc.parent = root;
        arc.material = mats.neon('#e0d8ff', 2.2);
        arc.isPickable = false;
      }
    } else if (nextArc <= 0) {
      arcLeft = 0.35;
      nextArc = 2 + Math.random() * 3;
    }
  };
  const wreck = () => {
    wrecked = true;
    arc?.dispose();
    for (const p of plumes) p.stop();
    warning.setEnabled(false);
  };
  return { root, height: 3.4, update, wreck };
}

// ----------------------------------------------------------------------------
//  The Spaceship
// ----------------------------------------------------------------------------

/** White hull plating: panel lines, rivets, a scorched underside, a purple stripe. */
function hullTexture(scene: Scene) {
  return canvasTexture(scene, 'shipHull', 256, 256, (g) => {
    const rand = rng(77);
    g.fillStyle = '#d8dce4';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1200; i++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '120,124,140' : '250,250,255'},${0.08 + rand() * 0.12})`;
      g.fillRect(rand() * 256, rand() * 256, 2, 2);
    }
    g.strokeStyle = 'rgba(70,76,96,0.55)';
    g.lineWidth = 1.5;
    for (let k = 16; k < 256; k += 40) {
      g.beginPath(); g.moveTo(0, k); g.lineTo(256, k); g.stroke();
      g.beginPath(); g.moveTo(k + 10, 0); g.lineTo(k + 10, 256); g.stroke();
    }
    g.fillStyle = 'rgba(70,76,96,0.6)';
    for (let k = 16; k < 256; k += 40) for (let x = 3; x < 256; x += 8) g.fillRect(x, k + 3, 1.5, 1.5);
    g.fillStyle = '#7d4dff';
    g.fillRect(0, 120, 256, 10);
    g.fillStyle = '#b18cff';
    g.fillRect(0, 132, 256, 4);
    const scorch = g.createLinearGradient(0, 190, 0, 256);
    scorch.addColorStop(0, 'rgba(40,36,40,0)');
    scorch.addColorStop(1, 'rgba(40,36,40,0.55)');
    g.fillStyle = scorch;
    g.fillRect(0, 190, 256, 66);
  });
}

/** A flat plate the shape of `outline` (x, z points), `thick` deep: wings and fins. */
function plate(scene: Scene, name: string, outline: [number, number][], thick: number): Mesh {
  const n = outline.length;
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  for (const y of [thick / 2, -thick / 2]) for (const [x, z] of outline) {
    positions.push(x, y, z);
    uvs.push(x * 0.5 + 0.5, z * 0.5 + 0.5);
  }
  // Top and bottom: a fan (the outlines are convex).
  for (let i = 1; i < n - 1; i++) {
    indices.push(0, i + 1, i);
    indices.push(n, n + i, n + i + 1);
  }
  // The edges.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, j, n + j, i, n + j, n + i);
  }
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.uvs = uvs;
  data.normals = [];
  VertexData.ComputeNormals(positions, indices, data.normals);
  data.applyToMesh(mesh);
  return mesh;
}

/**
 * A sleek little starfighter on its landing legs, nose along +z: a tapered
 * white hull with a purple stripe, a glowing canopy, swept wings with
 * blinking nav lights, twin tail fins, and two engines idling blue.
 */
export function buildSpaceship(scene: Scene, mats: Materials, name: string): Visual {
  const root = new TransformNode(name, scene);
  const color = STRUCTURES.spaceship.color;
  const hull = material(scene, 'ship-hull', (m) => {
    m.diffuseTexture = hullTexture(scene);
    m.specularColor = new Color3(0.5, 0.5, 0.55);
    m.specularPower = 48;
    m.backFaceCulling = false;
  });
  const metal = mats.dark('#888899');
  const H = 1.15; // how high the hull's middle rides

  // The hull: a lathe from the needle nose back to the engine block.
  const profile: Vector3[] = [];
  const L = 3.9;
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    const r = t < 0.55 ? 0.62 * Math.sin((t / 0.55) * Math.PI / 2) ** 0.8 : 0.62 - (t - 0.55) * 0.35;
    profile.push(new Vector3(Math.max(0.001, r), (0.5 - t) * L, 0));
  }
  const body = MeshBuilder.CreateLathe(`${name}-hull`, { shape: profile, tessellation: 18, sideOrientation: Mesh.DOUBLESIDE }, scene);
  part(body, root, 0, H, 0, hull);
  body.rotation.x = Math.PI / 2;
  body.scaling.set(1, 1, 0.78); // a little flatter than round

  // The canopy: a long glass bubble, lit inside.
  part(MeshBuilder.CreateSphere(`${name}-canopy`, { diameterX: 0.62, diameterY: 0.5, diameterZ: 1.4, segments: 14 }, scene), root, 0, H + 0.4, 0.55, mats.neon('#4de1ff', 0.6, 0.75));
  part(MeshBuilder.CreateBox(`${name}-canopyFrame`, { width: 0.05, height: 0.05, depth: 1.2 }, scene), root, 0, H + 0.66, 0.5, metal);

  // Swept wings, a purple glow along each leading edge, nav lights at the tips.
  const lights: Mesh[] = [];
  for (const side of [-1, 1]) {
    // (The left wing's outline runs the other way round, so its faces still point outward.)
    const outline: [number, number][] = [[0, 0.7], [side * 2.0, -0.7], [side * 2.0, -1.1], [0, -1.2]];
    const wing = plate(scene, `${name}-wing`, side > 0 ? outline : outline.reverse(), 0.1);
    part(wing, root, side * 0.3, H - 0.1, 0, hull);
    const edge = part(MeshBuilder.CreateBox(`${name}-wingGlow`, { width: 2.25, height: 0.04, depth: 0.06 }, scene), root, side * 1.32, H - 0.05, -0.02, mats.neon(color, 1.3));
    edge.rotation.y = side * Math.atan2(1.4, 2.0);
    const tip = part(MeshBuilder.CreateSphere(`${name}-nav`, { diameter: 0.16, segments: 6 }, scene), root, side * 2.3, H - 0.05, -0.85, mats.neon(side < 0 ? '#ff2a2a' : '#2aff6a', 1.8));
    lights.push(tip);
    // A wing cannon under each wing.
    const gun = part(MeshBuilder.CreateCylinder(`${name}-gun`, { height: 1.1, diameter: 0.09, tessellation: 8 }, scene), root, side * 1.2, H - 0.22, 0.05, metal);
    gun.rotation.x = Math.PI / 2;
    // Twin tail fins, canted out.
    const fin = plate(scene, `${name}-fin`, [[0, -0.6], [0, -1.6], [0.9, -1.75], [0.9, -1.35]].map(([y, z]) => [y, z] as [number, number]), 0.07);
    part(fin, root, side * 0.32, H + 0.15, 0, hull);
    // Stood up on edge (its x becomes up), leaning out.
    fin.rotation.z = Math.PI / 2 - side * 0.35;
  }

  // Two engines at the back, nozzles glowing, blue flames flickering out.
  const flames: Mesh[] = [];
  for (const side of [-1, 1]) {
    const pod = part(MeshBuilder.CreateCylinder(`${name}-engine`, { height: 1.2, diameterTop: 0.42, diameterBottom: 0.5, tessellation: 14 }, scene), root, side * 0.48, H - 0.05, -1.45, metal);
    pod.rotation.x = Math.PI / 2;
    const ring = part(MeshBuilder.CreateTorus(`${name}-nozzle`, { diameter: 0.42, thickness: 0.06, tessellation: 16 }, scene), root, side * 0.48, H - 0.05, -2.06, mats.neon('#4de1ff', 1.6));
    ring.rotation.x = Math.PI / 2;
    part(MeshBuilder.CreateDisc(`${name}-glow`, { radius: 0.19, tessellation: 16 }, scene), root, side * 0.48, H - 0.05, -2.04, mats.neon('#bff6ff', 2)).rotation.y = Math.PI;
    const flame = part(MeshBuilder.CreateCylinder(`${name}-flame`, { height: 0.7, diameterTop: 0.34, diameterBottom: 0, tessellation: 10 }, scene), root, side * 0.48, H - 0.05, -2.4, mats.neon('#4de1ff', 1.6, 0.6));
    flame.rotation.x = -Math.PI / 2;
    flames.push(flame);
  }

  // Landing legs: one at the nose, two under the wings, each on a round pad.
  for (const [x, z] of [[0, 1.2], [-0.95, -0.7], [0.95, -0.7]] as const) {
    const leg = part(MeshBuilder.CreateCylinder(`${name}-leg`, { height: H - 0.15, diameter: 0.1, tessellation: 8 }, scene), root, x, (H - 0.15) / 2 + 0.05, z, metal);
    leg.rotation.z = x * 0.15;
    part(MeshBuilder.CreateCylinder(`${name}-pad`, { height: 0.06, diameter: 0.4, tessellation: 12 }, scene), root, x * 1.12, 0.04, z, metal);
  }
  // A sensor dish on the spine, slowly turning.
  const dish = new TransformNode(`${name}-dish`, scene);
  dish.parent = root;
  dish.position.set(0, H + 0.48, -0.45);
  const bowl = MeshBuilder.CreateSphere(`${name}-bowl`, { diameter: 0.38, slice: 0.35, segments: 10, sideOrientation: Mesh.DOUBLESIDE }, scene);
  part(bowl, dish, 0, 0.12, 0, mats.dark('#ccccdd')).rotation.x = -Math.PI / 2 - 0.5;
  // A purple glow underneath, where it hovers ready.
  const underglow = part(MeshBuilder.CreateDisc(`${name}-underglow`, { radius: 1.3, tessellation: 24 }, scene), root, 0, 0.06, -0.2, mats.neon(color, 0.6, 0.35));
  underglow.rotation.x = Math.PI / 2;

  let wrecked = false;
  const update = (time: number) => {
    if (wrecked) return;
    for (const [k, f] of flames.entries()) f.scaling.set(1, 0.7 + 0.35 * Math.sin(time * 31 + k * 2) + Math.random() * 0.2, 1);
    lights[0].setEnabled(time % 1.2 < 0.5);
    lights[1].setEnabled((time + 0.6) % 1.2 < 0.5);
    dish.rotation.y = time * 0.9;
    underglow.visibility = 0.6 + 0.3 * Math.sin(time * 3);
  };
  const wreck = () => {
    wrecked = true;
    for (const f of flames) f.setEnabled(false);
  };
  return { root, height: 2.6, update, wreck };
}
