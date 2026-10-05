import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, VertexBuffer, VertexData } from '@babylonjs/core';

// The Mega-Brain: a realistic(ish) brain built in code. A sphere is pushed
// into the shape of the two hemispheres, then folded with gyri and sulci
// (the grooves follow where a smooth noise field crosses zero, which makes
// the winding lines real brains have). The cerebellum has its fine parallel
// ridges, a brain stem drops into the base, and the colors darken down in
// the folds, with a few veins, under a wet shine.

const PINK = new Color3(1, 0.5, 0.64);
const FOLD = new Color3(0.5, 0.12, 0.22);
const VEIN = new Color3(0.6, 0.08, 0.2);

// ----------------------------------------------------------------------------
//  Smooth 3D value noise (seeded, so the brain is the same every time)
// ----------------------------------------------------------------------------

function lattice(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(seed, 144269);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Smooth noise, about 0 to 1. */
function noise(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => lattice(xi + dx, yi + dy, zi + dz, seed);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

/** Noise with its coordinates bent by more noise, for meandering shapes. Centered on 0. */
function warped(x: number, y: number, z: number, f: number, seed: number): number {
  const wx = x + 0.35 * (noise(x * 2, y * 2, z * 2, seed + 1) - 0.5);
  const wy = y + 0.35 * (noise(x * 2, y * 2, z * 2, seed + 2) - 0.5);
  const wz = z + 0.35 * (noise(x * 2, y * 2, z * 2, seed + 3) - 0.5);
  return noise(wx * f, wy * f, wz * f, seed) * 0.75 + noise(wx * f * 2, wy * f * 2, wz * f * 2, seed + 7) * 0.25 - 0.5;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ----------------------------------------------------------------------------
//  Shaping
// ----------------------------------------------------------------------------

/**
 * Reshape a unit sphere's vertices. `shape` maps a direction to a surface
 * point and how deep in a fold it is (0 = top of a ridge, 1 = bottom of a groove).
 */
function sculpt(mesh: Mesh, shape: (x: number, y: number, z: number) => { x: number; y: number; z: number; fold: number; vein: number }): void {
  const pos = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const colors: number[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    const len = Math.hypot(pos[i], pos[i + 1], pos[i + 2]) || 1;
    const p = shape(pos[i] / len, pos[i + 1] / len, pos[i + 2] / len);
    pos[i] = p.x;
    pos[i + 1] = p.y;
    pos[i + 2] = p.z;
    // Darker and redder down in the folds; veins over the top.
    const c = Color3.Lerp(Color3.Lerp(PINK, FOLD, Math.pow(p.fold, 1.5)), VEIN, p.vein * 0.75);
    const tint = 0.94 + 0.12 * noise(p.x * 9, p.y * 9, p.z * 9, 99);
    colors.push(c.r * tint, c.g * tint, c.b * tint, 1);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(pos, mesh.getIndices()!, normals);
  mesh.updateVerticesData(VertexBuffer.PositionKind, pos);
  mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
}

/** The cerebrum: two hemispheres, `length` front to back (along z). */
function cerebrum(scene: Scene, length: number): Mesh {
  const m = MeshBuilder.CreateSphere('cerebrum', { diameter: 2, segments: 120, updatable: true }, scene);
  const rx = length * 0.42, ry = length * 0.34, rz = length * 0.5;
  sculpt(m, (dx, dy, dz) => {
    let x = dx * rx, y = dy * ry, z = dz * rz;
    // Flat underneath, a little lower and narrower at the front.
    if (y < 0) y *= 0.72;
    const front = smoothstep(0, 1, dz);
    x *= 1 - 0.1 * front;
    y -= 0.05 * length * front * (dy > 0 ? 1 : 0.4);
    // Temporal lobes bulging low on each side.
    const temporal = Math.exp(-((dy + 0.45) ** 2) / 0.05 - ((dz - 0.1) ** 2) / 0.12) * Math.abs(dx);
    x += Math.sign(dx) * temporal * 0.08 * length;
    y -= temporal * 0.06 * length;

    // The deep groove between the hemispheres, along the top.
    const mid = Math.exp(-(dx * dx) / 0.0035) * smoothstep(-0.35, 0.1, dy);
    // The Sylvian fissure: a long groove on each side, sloping up toward the back.
    const sylvian = Math.exp(-((dy - (-0.12 - 0.3 * dz)) ** 2) / 0.004) * smoothstep(0.35, 0.6, Math.abs(dx)) * smoothstep(0.75, 0.2, Math.abs(dz + 0.1));
    // Gyri and sulci: grooves where the noise crosses zero, rounded ridges between.
    const n = warped(dx, dy, dz, 4.4, 11);
    const sulcus = 1 - smoothstep(0, 0.07, Math.abs(n));
    const gyrus = smoothstep(0.02, 0.2, Math.abs(n));
    const under = smoothstep(-0.55, -0.85, dy); // smoother underneath
    const fold = Math.min(1, Math.max(sulcus * (1 - under * 0.7), mid, sylvian));
    const out = (gyrus * 0.025 - sulcus * 0.06 * (1 - under * 0.7)) * length - mid * 0.13 * length - sylvian * 0.05 * length;

    // A few veins winding over the surface, mostly on the ridges.
    const v = warped(dx + 3, dy, dz, 2.2, 23);
    const vein = (1 - smoothstep(0, 0.012, Math.abs(v))) * gyrus * smoothstep(-0.2, 0.3, dy);

    const len = Math.hypot(x, y, z);
    const k = 1 + out / len;
    return { x: x * k, y: y * k, z: z * k, fold, vein };
  });
  return m;
}

/** The cerebellum, tucked under the back: two lobes covered in fine parallel ridges. */
function cerebellum(scene: Scene, length: number): Mesh {
  const m = MeshBuilder.CreateSphere('cerebellum', { diameter: 2, segments: 64, updatable: true }, scene);
  const rx = length * 0.3, ry = length * 0.15, rz = length * 0.19;
  sculpt(m, (dx, dy, dz) => {
    const x = dx * rx, y = dy * ry, z = dz * rz;
    const mid = Math.exp(-(dx * dx) / 0.01);
    const ridge = Math.abs(Math.sin((dy * 1.2 + dz * 0.6) * 22 + 2 * warped(dx, dy, dz, 2, 31)));
    const fold = Math.max(1 - smoothstep(0, 0.35, ridge), mid * 0.8);
    const out = (-0.035 * (1 - smoothstep(0, 0.35, ridge)) - 0.06 * mid) * length;
    const len = Math.hypot(x, y, z);
    const k = 1 + out / len;
    return { x: x * k, y: y * k - 0.27 * length, z: z * k - 0.36 * length, fold, vein: 0 };
  });
  return m;
}

function stem(scene: Scene, length: number): Mesh {
  const m = MeshBuilder.CreateCylinder('brainStem', {
    diameterTop: 0.2 * length, diameterBottom: 0.13 * length, height: 0.5 * length, tessellation: 16,
  }, scene);
  m.position.set(0, -0.42 * length, -0.18 * length);
  m.rotation.x = 0.25;
  m.bakeCurrentTransformIntoVertices();
  const n = m.getTotalVertices();
  const colors: number[] = [];
  for (let i = 0; i < n; i++) colors.push(PINK.r * 0.85, PINK.g * 0.8, PINK.b * 0.82, 1);
  m.setVerticesData(VertexBuffer.ColorKind, colors);
  return m;
}

let material: StandardMaterial | null = null;

/** A brain about `length` long (front to back along z), centered on its middle. */
export function createBrain(scene: Scene, name: string, length: number): Mesh {
  const brain = Mesh.MergeMeshes([cerebrum(scene, length), cerebellum(scene, length), stem(scene, length)], true, true)!;
  brain.name = name;
  if (!material || material.getScene() !== scene) {
    material = new StandardMaterial('brain', scene);
    material.diffuseColor = Color3.White(); // the vertex colors do the coloring
    // Wet and glistening, with a faint glow of its own so it reads at night too.
    material.specularColor = new Color3(0.35, 0.28, 0.3);
    material.specularPower = 40;
    material.emissiveColor = new Color3(0.24, 0.07, 0.12);
  }
  brain.material = material;
  return brain;
}
