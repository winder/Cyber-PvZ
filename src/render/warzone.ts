import {
  Color3, DynamicTexture, GlowLayer, Matrix, Mesh, MeshBuilder, ParticleSystem, Quaternion, Scene,
  StandardMaterial, TransformNode, Vector3, VertexBuffer, VertexData, Color4,
} from '@babylonjs/core';
import type { Barrier, MapDef, Rect, ZoneId } from '../data/config';
import type { SimEvent } from '../sim/game';
import { canvasTexture, material, merge, rng, softDot, type Decor } from './decor';
import type { Terrain } from './terrain';
import type { Materials } from './visuals';

// Scenery for the War Zone: an army base gone bad. Brick walls topped with
// sandbags line the corridor; lines of sandbags and barbed wire (the
// trenches) stand across it. The zones open off it: the mess hall (bunks and
// long tables, the kitchen at the back), the armory (a tank, a jeep, crates,
// racks of guns), the hospital (the morgue's bodies on gurneys, the operating
// theatre), the jail (a row of cells, a guard tower, the execution range's
// firing wall) and the training field. Headquarters stands behind the bases.
// All for looks: the walls and furniture are barriers to the rules.

const hex = (c: string) => Color3.FromHexString(c);

/** How tall the corridor's brick walls are (before the sandbags on top). */
const WALL_H = 1.5;
/** How tall a line of sandbags is. */
const BAGS_H = 1.05;

// ----------------------------------------------------------------------------
//  The ground, painted
// ----------------------------------------------------------------------------

/**
 * The whole base, painted: olive dirt everywhere, the corridor's cracked
 * concrete with tyre tracks and scorch marks, and each zone's floor (the
 * mess hall's checkered lino, the armory's hazard-striped concrete, the
 * hospital's tiles, the jail's grey slab and the range's sand).
 */
export function armyBaseTexture(scene: Scene, map: MapDef): DynamicTexture {
  const ppu = 18;
  const W = Math.min(2048, Math.round(map.width * ppu)), H = Math.min(1280, Math.round(map.depth * ppu));
  const sx = W / map.width, sz = H / map.depth;
  const hw = map.width / 2, hd = map.depth / 2;
  const X = (x: number) => (x + hw) * sx;
  const Z = (z: number) => (hd - z) * sz;
  return canvasTexture(scene, 'armyBase', W, H, (g) => {
    const rand = rng(4242);
    const rect = (r: Rect, color: string) => {
      g.fillStyle = color;
      g.fillRect(X(r.x - r.w / 2), Z(r.z + r.d / 2), r.w * sx, r.d * sz);
    };
    const speckle = (r: Rect, n: number, colors: string[], size: [number, number], alpha = 1) => {
      g.globalAlpha = alpha;
      for (let i = 0; i < n; i++) {
        g.fillStyle = colors[Math.floor(rand() * colors.length)];
        const s = size[0] + rand() * (size[1] - size[0]);
        g.fillRect(X(r.x - r.w / 2) + rand() * r.w * sx, Z(r.z + r.d / 2) + rand() * r.d * sz, s, s * (0.6 + rand() * 0.8));
      }
      g.globalAlpha = 1;
    };
    const blob = (x: number, z: number, r: number, color: string, alpha: number) => {
      const grad = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), r * sx);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = alpha;
      g.fillStyle = grad;
      g.fillRect(X(x) - r * sx, Z(z) - r * sx, r * 2 * sx, r * 2 * sx);
      g.globalAlpha = 1;
    };
    const all: Rect = { x: 0, z: 0, w: map.width, d: map.depth };

    // Olive dirt, trampled.
    rect(all, '#6b6347');
    speckle(all, 16000, ['#5e5740', '#756c4d', '#5a533a', '#80775a', '#4f4a35'], [2, 6]);
    for (let i = 0; i < 40; i++) blob((rand() - 0.5) * map.width, (rand() - 0.5) * map.depth, 2 + rand() * 5, '#3d3826', 0.35);

    // The corridor: big concrete slabs, cracked, stained and scorched.
    const wall = 9.6;
    const road: Rect = { x: 0, z: 0, w: map.width, d: wall * 2 };
    rect(road, '#8a867a');
    for (let x = -hw; x < hw; x += 4) {
      for (let z = -wall; z < wall; z += 4) {
        const k = 0.9 + rand() * 0.18;
        g.fillStyle = `rgb(${138 * k},${134 * k},${122 * k})`;
        g.fillRect(X(x) + 1, Z(z + 4) + 1, 4 * sx - 2, 4 * sz - 2);
      }
    }
    speckle(road, 9000, ['#7a766a', '#959186', '#6c685e', '#a19d92'], [1, 4]);
    // Cracks.
    g.strokeStyle = 'rgba(40,36,30,0.6)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 90; i++) {
      let x = X((rand() - 0.5) * map.width), z = Z((rand() - 0.5) * wall * 2);
      g.beginPath();
      g.moveTo(x, z);
      for (let k = 0; k < 5; k++) {
        x += (rand() - 0.5) * 18;
        z += (rand() - 0.5) * 18;
        g.lineTo(x, z);
      }
      g.stroke();
    }
    // Tyre tracks down the middle, and yellow lane dashes.
    g.fillStyle = 'rgba(40,38,34,0.35)';
    for (const z of [-3.2, -2.2, 2.2, 3.2]) g.fillRect(0, Z(z + 0.25), W, 0.5 * sz);
    g.fillStyle = '#d9b43a';
    for (let x = -hw + 1; x < hw; x += 5) g.fillRect(X(x), Z(0.12), 2.6 * sx, 0.24 * sz);
    // Oil stains and blast scorches.
    for (let i = 0; i < 26; i++) blob((rand() - 0.5) * map.width, (rand() - 0.5) * wall * 1.8, 0.8 + rand() * 1.8, '#1c1a16', 0.5);
    for (let i = 0; i < 9; i++) blob((rand() - 0.2) * hw, (rand() - 0.5) * wall * 1.6, 2 + rand() * 1.5, '#0e0c0a', 0.55);

    const zones = map.zones ?? {};
    // Mess hall: checkered lino.
    if (zones.barracks) {
      const a = zones.barracks.area;
      for (let x = a.x - a.w / 2; x < a.x + a.w / 2; x += 1) {
        for (let z = a.z - a.d / 2; z < a.z + a.d / 2; z += 1) {
          const even = (Math.floor(x) + Math.floor(z)) % 2 === 0;
          g.fillStyle = even ? '#cfc6a6' : '#5e7a52';
          g.fillRect(X(x), Z(z + 1), sx + 0.5, sz + 0.5);
        }
      }
      speckle(a, 3000, ['#3e3a2a', '#a49c80'], [1, 3], 0.4);
      for (let i = 0; i < 8; i++) blob(a.x + (rand() - 0.5) * a.w, a.z + (rand() - 0.5) * a.d, 1 + rand(), '#7a3a12', 0.35); // spilt stew
    }
    // Armory: concrete with hazard stripes round the vehicle bay.
    if (zones.armory) {
      const a = zones.armory.area;
      rect(a, '#77746c');
      speckle(a, 4000, ['#6a675f', '#85827a', '#5c5a53'], [1, 4]);
      for (let i = 0; i < 6; i++) blob(a.x + (rand() - 0.5) * a.w, a.z + (rand() - 0.5) * a.d, 1.2 + rand() * 1.5, '#1a1814', 0.5);
      const stripes = (r: Rect) => {
        g.save();
        g.beginPath();
        g.rect(X(r.x - r.w / 2), Z(r.z + r.d / 2), r.w * sx, r.d * sz);
        g.clip();
        for (let k = -40; k < 200; k++) {
          g.fillStyle = k % 2 ? '#e0b020' : '#1b1b1b';
          g.beginPath();
          const x0 = X(r.x - r.w / 2) + k * 8;
          g.moveTo(x0, Z(r.z + r.d / 2));
          g.lineTo(x0 + 8, Z(r.z + r.d / 2));
          g.lineTo(x0 + 8 - r.d * sz, Z(r.z - r.d / 2));
          g.lineTo(x0 - r.d * sz, Z(r.z - r.d / 2));
          g.fill();
        }
        g.restore();
      };
      // A box round the bay, and a line along the racks.
      for (const r of [
        { x: 22, z: 19.3, w: 10, d: 0.5 }, { x: 22, z: 28.7, w: 10, d: 0.5 },
        { x: 17.2, z: 24, w: 0.5, d: 9.9 }, { x: 26.8, z: 24, w: 0.5, d: 9.9 }, { x: 28.5, z: 29.5, w: 22, d: 0.4 },
      ]) stripes(r);
    }
    // Hospital: pale green tiles, a big red cross, and blood.
    if (zones.hospital) {
      const a = zones.hospital.area;
      for (let x = a.x - a.w / 2; x < a.x + a.w / 2; x += 0.8) {
        for (let z = a.z - a.d / 2; z < a.z + a.d / 2; z += 0.8) {
          const k = 0.94 + rand() * 0.08;
          g.fillStyle = `rgb(${196 * k},${214 * k},${204 * k})`;
          g.fillRect(X(x) + 0.5, Z(z + 0.8) + 0.5, 0.8 * sx - 1, 0.8 * sz - 1);
        }
      }
      // Grout.
      g.fillStyle = 'rgba(90,110,100,0.25)';
      const cross = { x: a.x + 6, z: a.z - 1 };
      g.fillStyle = '#c4161c';
      g.fillRect(X(cross.x - 2.5), Z(cross.z + 0.8), 5 * sx, 1.6 * sz);
      g.fillRect(X(cross.x - 0.8), Z(cross.z + 2.5), 1.6 * sx, 5 * sz);
      // Blood: pools under the gurneys and the operating tables, smeared trails to the door.
      for (const s of zones.hospital.spots) blob(s.x + 0.3, s.z - 0.2, 0.9, '#6e0a0a', 0.5);
      for (let i = 0; i < 6; i++) blob(zones.hospital.lair.x + (rand() - 0.5) * 6, zones.hospital.lair.z + (rand() - 0.5) * 6, 0.6 + rand(), '#7a0b0b', 0.6);
      g.strokeStyle = 'rgba(110,10,10,0.45)';
      g.lineWidth = 5;
      for (let i = 0; i < 4; i++) {
        const s = zones.hospital.spots[Math.floor(rand() * zones.hospital.spots.length)];
        g.beginPath();
        g.moveTo(X(s.x), Z(s.z));
        g.bezierCurveTo(X(s.x + 2), Z(s.z + 2), X(zones.hospital.door.x - 1), Z(zones.hospital.door.z - 3), X(zones.hospital.door.x), Z(zones.hospital.door.z));
        g.stroke();
      }
    }
    // Jail: grey slab; dark cell floors; the range's sand, bloody by the firing wall.
    if (zones.jail) {
      const a = zones.jail.area;
      rect(a, '#6f6f6c');
      speckle(a, 4000, ['#5f5f5c', '#7d7d79', '#545451'], [1, 4]);
      rect({ x: 25.25, z: -29.5, w: 21, d: 5 }, '#444442');
      speckle({ x: 25.25, z: -29.5, w: 21, d: 5 }, 1500, ['#3a3a38', '#50504c'], [1, 3]);
      const range: Rect = { x: 38.7, z: -21, w: 6.6, d: 18 };
      rect(range, '#a8915e');
      speckle(range, 2500, ['#957f50', '#b8a06c', '#8a7448'], [1, 4]);
      for (let i = 0; i < 7; i++) blob(39 - rand() * 1.5, -27 + rand() * 11, 0.5 + rand() * 0.6, '#6e0a0a', 0.55);
    }
    // Training field: churned mud and puddles.
    const field: Rect = { x: 49, z: 0, w: 14, d: map.depth };
    g.globalAlpha = 0.85;
    rect(field, '#5a4a32');
    g.globalAlpha = 1;
    speckle(field, 5000, ['#4a3c28', '#66553a', '#3e3222', '#705e42'], [2, 6]);
    for (let i = 0; i < 18; i++) blob(43 + rand() * 13, (rand() - 0.5) * map.depth, 0.8 + rand() * 1.6, '#2c2a26', 0.6);
    // Bootprints across it.
    g.fillStyle = 'rgba(30,24,16,0.5)';
    for (let i = 0; i < 300; i++) g.fillRect(X(43 + rand() * 13), Z((rand() - 0.5) * map.depth), 3, 5);
    // HQ: gravel, and a helipad.
    for (const side of [1, -1]) {
      const hq: Rect = { x: -35, z: side * 21.4, w: 42, d: 21.2 };
      rect(hq, '#7c7868');
      speckle(hq, 7000, ['#6d6a5b', '#8a8676', '#5e5b4e', '#999584'], [1, 4]);
    }
    const pad = { x: -42, z: 22 };
    g.fillStyle = '#4a4a46';
    g.beginPath();
    g.arc(X(pad.x), Z(pad.z), 5 * sx, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#e8e2c8';
    g.lineWidth = 0.35 * sx;
    g.beginPath();
    g.arc(X(pad.x), Z(pad.z), 4.2 * sx, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#e8e2c8';
    g.fillRect(X(pad.x - 1.6), Z(pad.z + 2), 0.6 * sx, 4 * sz);
    g.fillRect(X(pad.x + 1), Z(pad.z + 2), 0.6 * sx, 4 * sz);
    g.fillRect(X(pad.x - 1.6), Z(pad.z + 0.3), 3.2 * sx, 0.6 * sz);
  });
}

// ----------------------------------------------------------------------------
//  Textures for things standing up
// ----------------------------------------------------------------------------

function brickTex(scene: Scene): DynamicTexture {
  return canvasTexture(scene, 'warBrick', 256, 128, (g) => {
    const rand = rng(77);
    g.fillStyle = '#5a4a3e';
    g.fillRect(0, 0, 256, 128);
    const bh = 16, bw = 32;
    for (let row = 0; row < 128 / bh; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < 256 + bw; x += bw) {
        const k = rand() < 0.08 ? 0.55 : 0.85 + rand() * 0.25;
        g.fillStyle = `rgb(${132 * k},${62 * k},${44 * k})`;
        g.fillRect(x + off + 2, row * bh + 2, bw - 4, bh - 4);
      }
    }
    // Bullet holes and chips.
    for (let i = 0; i < 26; i++) {
      const x = rand() * 256, y = rand() * 128, r = 1.5 + rand() * 3;
      g.fillStyle = '#2a201a';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(190,170,150,0.5)';
      g.beginPath();
      g.arc(x, y, r + 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1a120e';
      g.beginPath();
      g.arc(x, y, r * 0.6, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 600; i++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '20,14,10' : '170,140,110'},${0.15 + rand() * 0.2})`;
      g.fillRect(rand() * 256, rand() * 128, 1 + rand() * 3, 1 + rand() * 3);
    }
  });
}

/** Burlap: a rough weave with a stitched seam. */
function burlapTex(scene: Scene): DynamicTexture {
  return canvasTexture(scene, 'burlap', 64, 64, (g) => {
    const rand = rng(5);
    g.fillStyle = '#9a8a5e';
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 64; i += 2) {
      g.fillStyle = `rgba(80,66,40,${0.2 + rand() * 0.2})`;
      g.fillRect(i, 0, 1, 64);
      g.fillRect(0, i, 64, 1);
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '60,50,30' : '190,175,130'},0.3)`;
      g.fillRect(rand() * 64, rand() * 64, 2, 2);
    }
  });
}

/** Cement, pocked with bullet holes and splashed with blood. */
function cementTex(scene: Scene): DynamicTexture {
  return canvasTexture(scene, 'cement', 256, 128, (g) => {
    const rand = rng(31);
    g.fillStyle = '#9a978e';
    g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 2000; i++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '60,58,52' : '190,188,180'},${0.1 + rand() * 0.2})`;
      g.fillRect(rand() * 256, rand() * 128, 1 + rand() * 3, 1 + rand() * 3);
    }
    // Blood splashed at chest height, running down.
    for (let i = 0; i < 9; i++) {
      const x = 20 + rand() * 216, y = 40 + rand() * 30;
      g.fillStyle = `rgba(${110 + rand() * 40},8,8,0.75)`;
      g.beginPath();
      g.arc(x, y, 5 + rand() * 9, 0, Math.PI * 2);
      g.fill();
      for (let k = 0; k < 3; k++) g.fillRect(x - 6 + rand() * 12, y, 1.5 + rand() * 2, 15 + rand() * 40);
    }
    for (let i = 0; i < 70; i++) {
      const x = rand() * 256, y = 25 + rand() * 60;
      g.fillStyle = '#3a3730';
      g.beginPath();
      g.arc(x, y, 1.5 + rand() * 2, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** A chain-link fence (see-through between the wires). */
function chainLinkTex(scene: Scene): DynamicTexture {
  const tex = canvasTexture(scene, 'chainLink', 64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(190,195,200,0.95)';
    g.lineWidth = 2;
    for (let k = -64; k < 128; k += 16) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + 64, 64);
      g.stroke();
      g.beginPath();
      g.moveTo(k + 64, 0);
      g.lineTo(k, 64);
      g.stroke();
    }
  });
  tex.hasAlpha = true;
  return tex;
}

/** A painted sign: big stencilled letters on a board. */
function signTex(scene: Scene, name: string, text: string, bg: string, fg: string): DynamicTexture {
  return canvasTexture(scene, `sign-${name}`, 512, 128, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = fg;
    g.lineWidth = 8;
    g.strokeRect(8, 8, 496, 112);
    g.fillStyle = fg;
    g.font = 'bold 76px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 68);
  });
}

// ----------------------------------------------------------------------------
//  Builders
// ----------------------------------------------------------------------------

/** Stretch a box's texture so it repeats every `tile` units along its width (and height). */
function tileBox(mesh: Mesh, w: number, h: number, d: number, tile: number): void {
  const uvs = mesh.getVerticesData(VertexBuffer.UVKind)!;
  // Babylon box faces: front, back, right, left, top, bottom; 4 vertices each.
  const spans = [[w, h], [w, h], [d, h], [d, h], [w, d], [w, d]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = (f * 4 + v) * 2;
      uvs[i] *= spans[f][0] / tile;
      uvs[i + 1] *= spans[f][1] / tile;
    }
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uvs);
}

/** A box at (x, y-bottom, z), turned `yaw` about its middle. */
function box(scene: Scene, name: string, w: number, h: number, d: number, x: number, y: number, z: number, yaw = 0): Mesh {
  const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
  m.position.set(x, y + h / 2, z);
  m.rotation.y = yaw;
  m.isPickable = false;
  return m;
}

function cyl(scene: Scene, name: string, h: number, d: number, x: number, y: number, z: number, tess = 10): Mesh {
  const m = MeshBuilder.CreateCylinder(name, { height: h, diameter: d, tessellation: tess }, scene);
  m.position.set(x, y + h / 2, z);
  m.isPickable = false;
  return m;
}

/** Solid colors, a little shiny or not. */
function paint(scene: Scene, name: string, color: string, glow = 0, spec = 0.05): StandardMaterial {
  return material(scene, `war-${name}`, (m) => {
    m.diffuseColor = hex(color);
    m.emissiveColor = hex(color).scale(glow);
    m.specularColor = new Color3(spec, spec, spec);
  });
}

/** Many copies of one small mesh, as thin instances (sandbags, posts, tires). */
class Scatter {
  readonly mesh: Mesh;
  private matrices: Matrix[] = [];
  constructor(mesh: Mesh) {
    this.mesh = mesh;
    mesh.isPickable = false;
  }

  add(x: number, y: number, z: number, yaw = 0, sx = 1, sy = 1, sz = 1, roll = 0, pitch = 0): void {
    this.matrices.push(Matrix.Compose(new Vector3(sx, sy, sz), Quaternion.FromEulerAngles(pitch, yaw, roll), new Vector3(x, y, z)));
  }

  done(): void {
    if (this.matrices.length === 0) {
      this.mesh.setEnabled(false);
      return;
    }
    const buf = new Float32Array(this.matrices.length * 16);
    this.matrices.forEach((m, i) => m.copyToArray(buf, i * 16));
    this.mesh.thinInstanceSetBuffer('matrix', buf, 16);
  }
}

/** A sandbag: a fat rounded pillow, 0.8 long. */
function sandbagMesh(scene: Scene): Mesh {
  const m = MeshBuilder.CreateSphere('sandbag', { diameterX: 0.86, diameterY: 0.34, diameterZ: 0.48, segments: 6 }, scene);
  m.material = material(scene, 'war-sandbag', (mat) => {
    mat.diffuseTexture = burlapTex(scene);
    mat.diffuseColor = new Color3(1, 1, 1);
    mat.specularColor = new Color3(0.02, 0.02, 0.02);
  });
  return m;
}

/** Stack sandbags along a line from (x1, z1) to (x2, z2), `rows` high, starting at height y0. */
function stackBags(bags: Scatter, terrain: Terrain, x1: number, z1: number, x2: number, z2: number, rows: number, y0: number, seed: number, rand: () => number): void {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const yaw = -Math.atan2(z2 - z1, x2 - x1);
  const n = Math.max(1, Math.round(len / 0.78));
  for (let row = 0; row < rows; row++) {
    const off = row % 2 ? 0.5 : 0;
    for (let i = 0; i < n - (row % 2); i++) {
      const k = (i + 0.5 + off) / n;
      const x = x1 + (x2 - x1) * k, z = z1 + (z2 - z1) * k;
      const y = terrain.surfaceHeight(x, z) + y0 + 0.16 + row * 0.3;
      bags.add(x, y, z, yaw + (rand() - 0.5) * 0.25, 0.95 + rand() * 0.1, 1, 1, (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.1);
    }
    seed++;
  }
}

/** A coil of barbed wire along a line: a spring of wire with barbs. */
function barbedCoil(scene: Scene, terrain: Terrain, x1: number, z1: number, x2: number, z2: number, y0: number, r: number, name: string): Mesh {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const ux = (x2 - x1) / len, uz = (z2 - z1) / len;
  const turns = Math.round(len / 0.45);
  const path: Vector3[] = [];
  for (let i = 0; i <= turns * 12; i++) {
    const t = i / 12, a = t * Math.PI * 2;
    const along = (t / turns) * len;
    const side = Math.cos(a) * r;
    const x = x1 + ux * along - uz * side, z = z1 + uz * along + ux * side;
    path.push(new Vector3(x, terrain.surfaceHeight(x, z) + y0 + r + Math.sin(a) * r, z));
  }
  const wire = MeshBuilder.CreateTube(name, { path, radius: 0.02, tessellation: 3 }, scene);
  wire.material = paint(scene, 'wire', '#8d9096', 0.05, 0.6);
  wire.isPickable = false;
  return wire;
}

// ----------------------------------------------------------------------------

export function createWarZone(scene: Scene, map: MapDef, terrain: Terrain, glow: GlowLayer, mats: Materials): Decor {
  const rand = rng(906);
  const ground = (x: number, z: number) => terrain.surfaceHeight(x, z);
  const bags = new Scatter(sandbagMesh(scene));
  const walls: Mesh[] = [];
  const caps: Mesh[] = [];
  const wood: Mesh[] = [];
  const steel: Mesh[] = [];
  const darkSteel: Mesh[] = [];
  const olive: Mesh[] = [];
  const cloth: Mesh[] = [];
  const white: Mesh[] = [];
  const cement: Mesh[] = [];
  const reds: Mesh[] = [];
  const boards: Mesh[] = [];
  /** Animations run every frame; one that returns false is finished and dropped. */
  const updates: ((dt: number, t: number) => void | boolean)[] = [];

  // --------------------------------------------------------------------------
  //  Barriers: walls, trenches, fences, furniture
  // --------------------------------------------------------------------------

  const fencePosts: Mesh[] = [];
  const fencePanels: Mesh[] = [];
  for (const [i, b] of (map.barriers ?? []).entries()) {
    const long = b.w >= b.d;
    const x1 = long ? b.x - b.w / 2 : b.x, x2 = long ? b.x + b.w / 2 : b.x;
    const z1 = long ? b.z : b.z - b.d / 2, z2 = long ? b.z : b.z + b.d / 2;
    const len = Math.max(b.w, b.d), thick = Math.min(b.w, b.d);
    const y = ground(b.x, b.z);
    switch (b.look) {
      case 'brickWall': {
        const w = box(scene, `wall${i}`, b.w, WALL_H + 0.4, b.d, b.x, y - 0.4, b.z);
        tileBox(w, b.w, WALL_H + 0.4, b.d, 2.2);
        walls.push(w);
        // A concrete cap, then a row of sandbags on top.
        caps.push(box(scene, `cap${i}`, b.w + 0.1, 0.12, b.d + 0.1, b.x, y + WALL_H, b.z));
        stackBags(bags, terrain, x1, z1, x2, z2, 2, WALL_H + 0.1, i, rand);
        break;
      }
      case 'sandbags': {
        // Two lines of bags, back to back, with barbed wire in front (east).
        for (const k of [-0.32, 0.32]) {
          const ox = long ? 0 : k * thick, oz = long ? k * thick : 0;
          stackBags(bags, terrain, x1 + ox, z1 + oz, x2 + ox, z2 + oz, 4, 0, i, rand);
        }
        barbedCoil(scene, terrain, x1, z1, x2, z2, BAGS_H + 0.05, 0.22, `coil${i}`);
        // Stakes along it holding the wire up.
        for (let k = 0; k <= len; k += 2) {
          const px = long ? x1 + k : b.x, pz = long ? b.z : z1 + k;
          wood.push(box(scene, `stake${i}-${k}`, 0.1, BAGS_H + 0.7, 0.1, px, ground(px, pz), pz));
        }
        break;
      }
      case 'fence': {
        for (let k = 0; k <= len + 0.01; k += 2.5) {
          const px = long ? x1 + k : b.x, pz = long ? b.z : z1 + k;
          fencePosts.push(cyl(scene, `fpost${i}-${k}`, 2.6, 0.1, px, ground(px, pz), pz, 6));
          // An arm leaning out at the top, for the wire.
          const arm = box(scene, `farm${i}-${k}`, 0.06, 0.6, 0.06, px, ground(px, pz) + 2.5, pz);
          arm.rotation.z = long ? 0 : 0.5;
          arm.rotation.x = long ? 0.5 : 0;
          fencePosts.push(arm);
        }
        const panel = MeshBuilder.CreatePlane(`fence${i}`, { width: len, height: 2.4, sideOrientation: Mesh.DOUBLESIDE }, scene);
        panel.position.set(b.x, y + 1.2, b.z);
        panel.rotation.y = long ? 0 : Math.PI / 2;
        const uv = panel.getVerticesData(VertexBuffer.UVKind)!;
        for (let k = 0; k < uv.length; k += 2) {
          uv[k] *= len / 0.8;
          uv[k + 1] *= 2.4 / 0.8;
        }
        panel.setVerticesData(VertexBuffer.UVKind, uv);
        fencePanels.push(panel);
        barbedCoil(scene, terrain, x1, z1, x2, z2, 2.45, 0.2, `fcoil${i}`);
        break;
      }
      case 'firingWall': {
        const w = box(scene, `firing${i}`, b.w, 3.2, b.d, b.x, y, b.z);
        cement.push(w);
        // Posts in front, ropes dangling, and sandbags at the foot.
        for (const dz of [-3, 0, 3]) {
          wood.push(box(scene, `epost${dz}`, 0.22, 2, 0.22, b.x - 2.2, y, b.z + dz));
          cloth.push(box(scene, `rope${dz}`, 0.25, 0.08, 0.25, b.x - 2.2, y + 1.1, b.z + dz));
        }
        stackBags(bags, terrain, b.x - 0.8, b.z - b.d / 2, b.x - 0.8, b.z + b.d / 2, 2, 0, i, rand);
        break;
      }
      case 'bunk': buildBunk(b, y); break;
      case 'table': buildTable(b, y); break;
      case 'counter': buildCounter(b, y); break;
      case 'tank': buildTank(b, y); break;
      case 'jeep': buildJeep(b, y); break;
      case 'crates': buildCrates(b, y); break;
      case 'rack': buildRack(b, y); break;
      case 'cabinet': buildCabinets(b, y); break;
      case 'grounds': break;
    }
  }

  // ---- Furniture ----

  function buildBunk(b: Barrier, y: number): void {
    // A two-high metal bunk, mattresses and olive blankets, a pillow at the west end.
    for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      darkSteel.push(box(scene, 'bunkPost', 0.08, 1.7, 0.08, b.x + dx * (b.w / 2 - 0.1), y, b.z + dz * (b.d / 2 - 0.1)));
    }
    for (const h of [0.45, 1.3]) {
      darkSteel.push(box(scene, 'bunkFrame', b.w, 0.08, b.d, b.x, y + h, b.z));
      white.push(box(scene, 'mattress', b.w - 0.2, 0.16, b.d - 0.15, b.x, y + h + 0.08, b.z));
      olive.push(box(scene, 'blanket', b.w * 0.62, 0.06, b.d - 0.1, b.x + b.w * 0.17, y + h + 0.24, b.z));
      white.push(box(scene, 'pillow', 0.5, 0.12, b.d * 0.6, b.x - b.w / 2 + 0.45, y + h + 0.24, b.z));
    }
    // A footlocker at the end.
    olive.push(box(scene, 'locker', 0.6, 0.45, b.d * 0.8, b.x + b.w / 2 + 0.05, y, b.z));
  }

  function buildTable(b: Barrier, y: number): void {
    // A long mess table with a bench either side, trays and cups on it.
    wood.push(box(scene, 'tableTop', b.w, 0.1, 0.9, b.x, y + 0.75, b.z));
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) darkSteel.push(box(scene, 'tableLeg', 0.08, 0.75, 0.08, b.x + dx * (b.w / 2 - 0.2), y, b.z + dz * 0.35));
    for (const dz of [-1, 1]) {
      wood.push(box(scene, 'bench', b.w, 0.08, 0.3, b.x, y + 0.42, b.z + dz * (b.d / 2 - 0.12)));
      for (const dx of [-1, 1]) darkSteel.push(box(scene, 'benchLeg', 0.06, 0.42, 0.06, b.x + dx * (b.w / 2 - 0.3), y, b.z + dz * (b.d / 2 - 0.12)));
    }
    for (let k = 0; k < 6; k++) {
      const tx = b.x - b.w / 2 + 0.7 + k * ((b.w - 1.4) / 5), tz = b.z + (k % 2 ? 0.22 : -0.22);
      steel.push(box(scene, 'tray', 0.55, 0.04, 0.38, tx, y + 0.8, tz, (rand() - 0.5) * 0.5));
      if (rand() < 0.7) olive.push(box(scene, 'slop', 0.2, 0.05, 0.16, tx - 0.08, y + 0.84, tz));
      if (rand() < 0.5) white.push(cyl(scene, 'cup', 0.14, 0.1, tx + 0.18, y + 0.8, tz + 0.1, 6));
    }
  }

  function buildCounter(b: Barrier, y: number): void {
    // The kitchen's serving counter, big steaming pots on it, a stove behind.
    steel.push(box(scene, 'counter', b.w, 1, b.d, b.x, y, b.z));
    for (let k = 0; k < 3; k++) {
      const px = b.x - b.w / 2 + 1.5 + k * (b.w - 3) / 2;
      darkSteel.push(cyl(scene, 'pot', 0.55, 0.8, px, y + 1, b.z, 12));
      const stew = cyl(scene, 'stew', 0.05, 0.7, px, y + 1.5, b.z, 12);
      stew.material = paint(scene, k === 1 ? 'stewGreen' : 'stew', k === 1 ? '#6f9a22' : '#8a4a1c', 0.25);
      steam(px, y + 1.6, b.z);
    }
    darkSteel.push(box(scene, 'stove', b.w * 0.7, 0.9, 1, b.x + 0.5, y, b.z + 2));
    // A meat hook rail with hams.
    darkSteel.push(box(scene, 'hookRail', b.w * 0.6, 0.06, 0.06, b.x, y + 2.6, b.z + 3.2));
    for (let k = 0; k < 4; k++) {
      const ham = MeshBuilder.CreateSphere('ham', { diameterX: 0.35, diameterY: 0.6, diameterZ: 0.35, segments: 6 }, scene);
      ham.position.set(b.x - b.w * 0.25 + k * b.w * 0.17, y + 2.2, b.z + 3.2);
      ham.material = paint(scene, 'ham', '#a8484a', 0.08);
      ham.isPickable = false;
    }
  }

  function buildTank(b: Barrier, y: number): void {
    // A tank, nose to the south (toward the door): treads, hull, turret, a long gun.
    const root = new TransformNode('tank', scene);
    root.position.set(b.x, y, b.z);
    const add = (m: Mesh, mat: StandardMaterial) => { m.parent = root; m.material = mat; return m; };
    const camo = paint(scene, 'tankGreen', '#4d5a2e', 0.05, 0.15);
    const tread = paint(scene, 'tread', '#262626', 0, 0.2);
    for (const dx of [-1, 1]) {
      add(box(scene, 'tread', 1.0, 1.0, b.d, dx * (b.w / 2 - 0.5), 0, 0), tread);
      for (let k = 0; k < 6; k++) {
        const wheel = add(MeshBuilder.CreateCylinder('roadWheel', { height: 1.04, diameter: 0.7, tessellation: 10 }, scene), tread);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(dx * (b.w / 2 - 0.5), 0.45, -b.d / 2 + 0.7 + k * (b.d - 1.4) / 5);
      }
    }
    add(box(scene, 'hull', b.w - 1.8, 0.9, b.d - 0.4, 0, 0.35, 0), camo);
    add(box(scene, 'deck', b.w, 0.25, b.d - 0.6, 0, 1.0, 0), camo);
    const turret = new TransformNode('turret', scene);
    turret.parent = root;
    turret.position.set(0, 1.25, 0.3);
    const t = add(box(scene, 'turretBody', 2.4, 0.8, 2.6, 0, 0, 0), camo);
    t.parent = turret;
    const gun = add(MeshBuilder.CreateCylinder('gun', { height: 3.6, diameter: 0.24, tessellation: 8 }, scene), tread);
    gun.parent = turret;
    gun.rotation.x = Math.PI / 2 - 0.08;
    gun.position.set(0, 0.45, -2.9);
    const hatch = add(cyl(scene, 'hatch', 0.2, 0.7, 0.5, 0.8, 0.5, 8), camo);
    hatch.parent = turret;
    // A white star on each side.
    for (const dx of [-1, 1]) {
      const star = MeshBuilder.CreateDisc('star', { radius: 0.35, tessellation: 5 }, scene);
      star.parent = root;
      star.material = paint(scene, 'star', '#e8e2c8', 0.2);
      star.position.set(dx * (b.w / 2 - 0.88), 0.85, 0.5);
      star.rotation.y = -dx * Math.PI / 2;
      star.isPickable = false;
    }
    // The turret creaks round, looking for trouble.
    updates.push((_dt, time) => { turret.rotation.y = Math.sin(time * 0.25) * 0.7; });
  }

  function buildJeep(b: Barrier, y: number): void {
    const root = new TransformNode('jeep', scene);
    root.position.set(b.x, y, b.z);
    root.rotation.y = 0.15;
    const add = (m: Mesh, mat: StandardMaterial) => { m.parent = root; m.material = mat; return m; };
    const green = paint(scene, 'jeepGreen', '#56603a', 0.04, 0.15);
    const black = paint(scene, 'tread', '#262626', 0, 0.2);
    add(box(scene, 'jeepBody', b.w - 0.4, 0.75, b.d - 0.6, 0, 0.45, 0), green);
    add(box(scene, 'jeepHood', b.w - 0.4, 0.2, 1.4, 0, 1.2, -b.d / 2 + 1.1), green);
    add(box(scene, 'windshield', b.w - 0.5, 0.7, 0.06, 0, 1.2, -b.d / 2 + 1.8), black);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
      const wheel = add(MeshBuilder.CreateCylinder('jeepWheel', { height: 0.4, diameter: 0.9, tessellation: 12 }, scene), black);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(dx * (b.w / 2 - 0.15), 0.45, dz * (b.d / 2 - 0.8));
    }
    // A machine gun on a post in the back.
    add(box(scene, 'mgPost', 0.1, 0.9, 0.1, 0, 1.2, 1), black);
    const mg = add(MeshBuilder.CreateCylinder('mg', { height: 1.3, diameter: 0.12, tessellation: 6 }, scene), black);
    mg.rotation.x = Math.PI / 2;
    mg.position.set(0, 2.15, 0.7);
  }

  function buildCrates(b: Barrier, y: number): void {
    const crateMat = material(scene, 'war-crate', (m) => {
      m.diffuseTexture = canvasTexture(scene, 'crateTex', 128, 128, (g) => {
        g.fillStyle = '#6a5a32';
        g.fillRect(0, 0, 128, 128);
        for (let k = 0; k < 128; k += 21) {
          g.fillStyle = '#58492a';
          g.fillRect(0, k, 128, 2);
        }
        g.strokeStyle = '#3e321c';
        g.lineWidth = 8;
        g.strokeRect(4, 4, 120, 120);
        g.fillStyle = '#e8d890';
        g.font = 'bold 26px Impact, sans-serif';
        g.textAlign = 'center';
        g.fillText('AMMO', 64, 58);
        g.font = 'bold 16px Impact, sans-serif';
        g.fillText('7.62 MM', 64, 84);
      });
      m.specularColor = new Color3(0.02, 0.02, 0.02);
    });
    const crates: Mesh[] = [];
    const n = Math.round(b.w / 1.0);
    for (let k = 0; k < n; k++) {
      for (let r = 0; r < Math.round(b.d / 1.0); r++) {
        const h = 1 + Math.floor(rand() * 3);
        for (let s = 0; s < h; s++) {
          const c = box(scene, 'crate', 0.95, 0.95, 0.95, b.x - b.w / 2 + 0.5 + k, y + s * 0.95, b.z - b.d / 2 + 0.5 + r, (rand() - 0.5) * 0.3);
          crates.push(c);
        }
      }
    }
    merge(crates, crateMat, 'crates');
  }

  function buildRack(b: Barrier, y: number): void {
    // A long rack of rifles along the armory's back wall, with rockets beside.
    wood.push(box(scene, 'rackBack', b.w, 2.2, 0.2, b.x, y, b.z + 0.3));
    wood.push(box(scene, 'rackShelf', b.w, 0.1, 0.6, b.x, y + 0.4, b.z));
    for (let x = b.x - b.w / 2 + 0.4; x < b.x + b.w / 2; x += 0.42) {
      const rifle = box(scene, 'rifle', 0.08, 1.4, 0.12, x, y + 0.45, b.z - 0.05);
      rifle.rotation.x = 0.12;
      darkSteel.push(rifle);
      const stock = box(scene, 'stock', 0.1, 0.4, 0.2, x, y + 0.45, b.z - 0.05);
      wood.push(stock);
    }
    // A missile on a trailer in front of the rack's east end.
    const mx = b.x + b.w / 2 - 3, mz = b.z - 2.6;
    darkSteel.push(box(scene, 'trailer', 4.5, 0.3, 1.1, mx, y + 0.4, mz));
    const missile = MeshBuilder.CreateCylinder('missile', { height: 4, diameter: 0.5, tessellation: 12 }, scene);
    missile.rotation.z = Math.PI / 2;
    missile.position.set(mx, y + 1.05, mz);
    missile.material = paint(scene, 'missile', '#c8c9c0', 0.05, 0.3);
    missile.isPickable = false;
    const tip = MeshBuilder.CreateCylinder('missileTip', { height: 0.8, diameterTop: 0, diameterBottom: 0.5, tessellation: 12 }, scene);
    tip.rotation.z = -Math.PI / 2;
    tip.position.set(mx + 2.4, y + 1.05, mz);
    tip.material = paint(scene, 'missileTip', '#c4161c', 0.15);
    tip.isPickable = false;
  }

  function buildCabinets(b: Barrier, y: number): void {
    for (let x = b.x - b.w / 2 + 0.7; x < b.x + b.w / 2; x += 1.4) {
      white.push(box(scene, 'cabinet', 1.3, 2, b.d, x, y, b.z));
      reds.push(box(scene, 'cabCross', 0.4, 0.12, 0.02, x, y + 1.5, b.z + b.d / 2 + 0.01));
      reds.push(box(scene, 'cabCross', 0.12, 0.4, 0.02, x, y + 1.36, b.z + b.d / 2 + 0.01));
    }
  }

  /** Steam curling up off a pot (or smoke off a fire). */
  function steam(x: number, y: number, z: number, color = new Color4(1, 1, 1, 0.25), size = 0.6, rate = 6): ParticleSystem {
    const ps = new ParticleSystem('steam', 40, scene);
    ps.particleTexture = softDot(scene, 'steamDot');
    ps.emitter = new Vector3(x, y, z);
    ps.minEmitBox = new Vector3(-0.2, 0, -0.2);
    ps.maxEmitBox = new Vector3(0.2, 0, 0.2);
    ps.color1 = color;
    ps.color2 = color;
    ps.colorDead = new Color4(color.r, color.g, color.b, 0);
    ps.minSize = size * 0.6;
    ps.maxSize = size * 1.4;
    ps.minLifeTime = 1.5;
    ps.maxLifeTime = 3;
    ps.emitRate = rate;
    ps.direction1 = new Vector3(-0.2, 1, -0.2);
    ps.direction2 = new Vector3(0.2, 1, 0.2);
    ps.minEmitPower = 0.3;
    ps.maxEmitPower = 0.7;
    ps.gravity = new Vector3(0.15, 0.1, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.start();
    return ps;
  }

  // --------------------------------------------------------------------------
  //  The hospital: the morgue's bodies on gurneys, and the operating theatre
  // --------------------------------------------------------------------------

  const sheetMat = material(scene, 'war-sheet', (m) => {
    m.diffuseTexture = canvasTexture(scene, 'sheetTex', 128, 128, (g) => {
      const r = rng(19);
      g.fillStyle = '#e6e3da';
      g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = 'rgba(160,150,140,0.25)';
        g.fillRect(0, r() * 128, 128, 1);
      }
      // Blood soaking through.
      for (let i = 0; i < 5; i++) {
        const x = 20 + r() * 88, y = 30 + r() * 70;
        const grad = g.createRadialGradient(x, y, 0, x, y, 10 + r() * 16);
        grad.addColorStop(0, 'rgba(130,8,8,0.95)');
        grad.addColorStop(0.6, 'rgba(150,20,20,0.6)');
        grad.addColorStop(1, 'rgba(150,20,20,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
      }
    });
    m.specularColor = new Color3(0.02, 0.02, 0.02);
  });
  const skinMat = paint(scene, 'deadSkin', '#8fae7a');
  /** The morgue's bodies, by spot: hidden as each one gets up. */
  const bodies: TransformNode[] = [];
  const hospital = map.zones?.hospital;
  if (hospital) {
    for (const [i, s] of hospital.spots.entries()) {
      const y = ground(s.x, s.z);
      // A gurney: a steel top on legs with little wheels.
      steel.push(box(scene, 'gurney', 2.1, 0.08, 0.8, s.x, y + 0.75, s.z));
      for (const dx of [-0.9, 0.9]) for (const dz of [-0.32, 0.32]) {
        darkSteel.push(box(scene, 'gurneyLeg', 0.05, 0.75, 0.05, s.x + dx, y, s.z + dz));
        darkSteel.push(box(scene, 'gurneyWheel', 0.12, 0.12, 0.06, s.x + dx, y, s.z + dz));
      }
      // The body under a bloody sheet, its feet sticking out, a toe tag on.
      const body = new TransformNode(`body${i}`, scene);
      body.position.set(s.x, y + 0.83, s.z);
      body.rotation.y = (rand() - 0.5) * 0.1;
      const add = (m: Mesh, mat: StandardMaterial) => { m.parent = body; m.material = mat; m.isPickable = false; return m; };
      add(MeshBuilder.CreateBox('torso', { width: 1.5, height: 0.3, depth: 0.6 }, scene), sheetMat).position.set(-0.1, 0.15, 0);
      add(MeshBuilder.CreateSphere('headBump', { diameterX: 0.42, diameterY: 0.3, diameterZ: 0.42, segments: 8 }, scene), sheetMat).position.set(-0.85, 0.16, 0);
      for (const dz of [-0.12, 0.12]) add(MeshBuilder.CreateBox('foot', { width: 0.14, height: 0.24, depth: 0.12 }, scene), skinMat).position.set(0.72, 0.2, dz);
      const tag = add(MeshBuilder.CreateBox('toeTag', { width: 0.02, height: 0.14, depth: 0.1 }, scene), paint(scene, 'tag', '#e8d890', 0.2));
      tag.position.set(0.82, 0.16, 0.12);
      // One arm flopped out from under the sheet.
      if (i % 3 === 1) add(MeshBuilder.CreateBox('arm', { width: 0.12, height: 0.12, depth: 0.5 }, scene), skinMat).position.set(-0.3, 0.05, 0.42);
      bodies.push(body);
    }
    // The operating theatre: two tables under big round lamps, a heart
    // monitor, trays of tools, an IV stand and a curtain.
    const { x: ox, z: oz } = hospital.lair;
    for (const dx of [-2.6, 2.6]) {
      const tx = ox + dx, tz = oz + 1, y = ground(tx, tz);
      darkSteel.push(cyl(scene, 'opBase', 0.8, 0.35, tx, y, tz, 8));
      white.push(box(scene, 'opTable', 0.9, 0.18, 2.2, tx, y + 0.8, tz));
      // The lamp, on an arm over the table.
      steel.push(cyl(scene, 'lampPole', 2.6, 0.1, tx + 0.8, y, tz - 1.2, 6));
      steel.push(box(scene, 'lampArm', 0.9, 0.08, 0.08, tx + 0.4, y + 2.55, tz - 1.2));
      const lamp = MeshBuilder.CreateCylinder('opLamp', { height: 0.25, diameterTop: 0.5, diameterBottom: 1.1, tessellation: 16 }, scene);
      lamp.position.set(tx, y + 2.35, tz - 0.6);
      lamp.material = paint(scene, 'lampShade', '#cfd4d8', 0.1, 0.5);
      lamp.isPickable = false;
      const bulb = MeshBuilder.CreateDisc('opBulb', { radius: 0.45, tessellation: 16 }, scene);
      bulb.rotation.x = Math.PI / 2;
      bulb.position.set(tx, y + 2.22, tz - 0.6);
      bulb.material = mats.neon('#fffbe8', 1.4);
      bulb.isPickable = false;
      // Bloody tools on a tray.
      steel.push(box(scene, 'toolTray', 0.7, 0.04, 0.45, tx - 1, y + 1, tz + 0.6));
      darkSteel.push(cyl(scene, 'trayStand', 1, 0.06, tx - 1, y, tz + 0.6, 6));
      for (let k = 0; k < 4; k++) {
        const tool = box(scene, 'tool', 0.05, 0.03, 0.35, tx - 1.25 + k * 0.16, y + 1.04, tz + 0.6);
        tool.material = paint(scene, k % 2 ? 'bloodySteel' : 'steelTool', k % 2 ? '#8a2020' : '#d0d4d8', 0.1, 0.6);
      }
    }
    // A heart monitor, flatlining (then not).
    const my = ground(ox, oz - 2);
    darkSteel.push(box(scene, 'monitorCart', 0.8, 1.1, 0.6, ox, my, oz - 2.2));
    const screen = MeshBuilder.CreatePlane('monitor', { width: 0.7, height: 0.5 }, scene);
    screen.position.set(ox, my + 1.45, oz - 2.2);
    screen.rotation.x = -0.3;
    screen.rotation.y = Math.PI;
    const ecg = new DynamicTexture('ecg', { width: 128, height: 96 }, scene, false);
    screen.material = material(scene, 'war-ecg', (m) => {
      m.diffuseTexture = ecg;
      m.emissiveTexture = ecg;
      m.disableLighting = true;
    });
    screen.isPickable = false;
    darkSteel.push(box(scene, 'monitorBox', 0.8, 0.6, 0.3, ox, my + 1.15, oz - 2.05));
    let beat = 0;
    updates.push((dt) => {
      beat += dt;
      if (beat < 0.1) return;
      beat = 0;
      const g = ecg.getContext() as unknown as CanvasRenderingContext2D;
      g.fillStyle = '#031208';
      g.fillRect(0, 0, 128, 96);
      g.strokeStyle = '#39ff6a';
      g.lineWidth = 3;
      g.beginPath();
      for (let x = 0; x < 128; x++) {
        const t = (x / 128 + time * 0.6) % 1;
        const spike = t > 0.45 && t < 0.55 ? Math.sin((t - 0.45) * Math.PI * 20) * 30 : 0;
        g.lineTo(x, 50 - spike);
      }
      g.stroke();
      ecg.update(false);
    });
    // IV stands with bags of blood.
    for (const [dx, dz] of [[-4.2, -1], [4.2, 2.6], [0, 3.4]]) {
      const ix = ox + dx, iz = oz + dz, y = ground(ix, iz);
      steel.push(cyl(scene, 'ivPole', 2.2, 0.05, ix, y, iz, 6));
      const bag = box(scene, 'ivBag', 0.25, 0.35, 0.08, ix + 0.15, y + 1.75, iz);
      bag.material = paint(scene, 'bloodBag', '#a01010', 0.3);
    }
    // A curtain screening off the morgue.
    const curtain = box(scene, 'curtain', 0.06, 2.2, 7, ox - 5.4, ground(ox - 5.4, oz), oz + 1);
    curtain.material = paint(scene, 'curtain', '#8fc4b4', 0.05);
  }

  // --------------------------------------------------------------------------
  //  The jail: a row of cells, and a guard tower
  // --------------------------------------------------------------------------

  /** Each cell's door (by cell), and whether it's been burst open. */
  const cellDoors: { door: TransformNode; open: boolean; t: number; spin: Vector3; vel: Vector3 }[] = [];
  const alarms: { light: Mesh; beam: Mesh }[] = [];
  const jail = map.zones?.jail;
  const cellXs = jail ? jail.spots.slice(0, jail.spots.length / 2).map((s) => s.x) : [];
  const CELL_W = 3.5, CELL_FRONT = -27, CELL_BACK = -map.depth / 2;
  if (jail) {
    const y = ground(25, -29);
    const x0 = cellXs[0] - CELL_W / 2, x1 = cellXs[cellXs.length - 1] + CELL_W / 2;
    const block: Mesh[] = [];
    // The back wall, and the walls between the cells.
    block.push(box(scene, 'cellBack', x1 - x0 + 0.4, 3, 0.4, (x0 + x1) / 2, y, CELL_BACK + 0.2));
    for (let k = 0; k <= cellXs.length; k++) {
      block.push(box(scene, 'cellWall', 0.3, 3, CELL_FRONT - CELL_BACK, x0 + k * CELL_W, y, (CELL_FRONT + CELL_BACK) / 2));
    }
    // A strip of concrete over the front, holding the bars.
    block.push(box(scene, 'cellLintel', x1 - x0 + 0.3, 0.4, 0.45, (x0 + x1) / 2, y + 2.6, CELL_FRONT));
    merge(block, paint(scene, 'cellConcrete', '#8a8780'), 'cellBlock');
    const barMat = paint(scene, 'bars', '#4a4d52', 0.03, 0.6);
    for (const [k, cx] of cellXs.entries()) {
      // A cot and a toilet in each.
      olive.push(box(scene, 'cot', 0.8, 0.45, 2, cx - 1, y, CELL_BACK + 1.6));
      white.push(box(scene, 'pillowCell', 0.6, 0.1, 0.4, cx - 1, y + 0.45, CELL_BACK + 0.8));
      white.push(cyl(scene, 'toilet', 0.45, 0.5, cx + 1.1, y, CELL_BACK + 0.8, 10));
      // The door: a barred panel the width of the cell.
      const door = new TransformNode(`cellDoor${k}`, scene);
      door.position.set(cx, y, CELL_FRONT);
      const bars: Mesh[] = [];
      for (let bx = -CELL_W / 2 + 0.3; bx < CELL_W / 2 - 0.1; bx += 0.3) bars.push(box(scene, 'bar', 0.06, 2.4, 0.06, bx, 0.05, 0));
      for (const by of [0.15, 1.2, 2.3]) bars.push(box(scene, 'crossbar', CELL_W - 0.4, 0.08, 0.1, 0, by, 0));
      const merged = merge(bars, barMat, `cellBars${k}`)!;
      merged.parent = door;
      cellDoors.push({ door, open: false, t: 0, spin: Vector3.Zero(), vel: Vector3.Zero() });
      // A red alarm light over each door, dark until the breakout.
      const light = MeshBuilder.CreateSphere(`alarm${k}`, { diameter: 0.3, segments: 8 }, scene);
      light.position.set(cx, y + 3.05, CELL_FRONT);
      light.material = paint(scene, 'alarmOff', '#5a1010', 0.1);
      light.isPickable = false;
      const beam = MeshBuilder.CreateCylinder(`alarmBeam${k}`, { height: 2.4, diameterTop: 0.1, diameterBottom: 1.4, tessellation: 12 }, scene);
      beam.rotation.z = Math.PI / 2;
      beam.position.set(cx, y + 3.05, CELL_FRONT);
      beam.material = mats.neon('#ff2020', 1, 0.25);
      beam.isPickable = false;
      beam.setEnabled(false);
      alarms.push({ light, beam });
      // A number over the door.
      const plate = MeshBuilder.CreatePlane(`cellNo${k}`, { width: 0.8, height: 0.35 }, scene);
      plate.position.set(cx, y + 2.6, CELL_FRONT - 0.24);
      plate.material = material(scene, `war-cellNo${k}`, (m) => {
        m.diffuseTexture = signTex(scene, `cell${k}`, `C-${k + 1}`, '#1c1c1c', '#ff7a1a');
        m.emissiveColor = new Color3(0.4, 0.4, 0.4);
      });
      plate.isPickable = false;
    }
    // A guard tower in the corner, its searchlight sweeping the yard.
    tower(16.8, -13.6, 'jailTower', 0);
  }

  /** A wooden watchtower on stilts with a hut on top and a searchlight. */
  function tower(x: number, z: number, name: string, phase: number): void {
    const y = ground(x, z);
    const H = 5;
    for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const leg = box(scene, `${name}Leg`, 0.2, H + 0.2, 0.2, x + dx * 1.1, y, z + dz * 1.1);
      leg.rotation.z = -dx * 0.05;
      leg.rotation.x = dz * 0.05;
      wood.push(leg);
    }
    for (const h of [1.6, 3.3]) {
      wood.push(box(scene, `${name}Brace`, 2.4, 0.12, 0.12, x, y + h, z - 1.1));
      wood.push(box(scene, `${name}Brace`, 2.4, 0.12, 0.12, x, y + h, z + 1.1));
    }
    wood.push(box(scene, `${name}Floor`, 2.8, 0.15, 2.8, x, y + H, z));
    olive.push(box(scene, `${name}Hut`, 2.8, 0.9, 2.8, x, y + H + 0.15, z));
    const roof = MeshBuilder.CreateCylinder(`${name}Roof`, { height: 0.9, diameterTop: 0.2, diameterBottom: 4.2, tessellation: 4 }, scene);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(x, y + H + 2.5, z);
    roof.material = paint(scene, 'tin', '#5a5f5a', 0.03, 0.3);
    roof.isPickable = false;
    for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) wood.push(box(scene, `${name}RoofPost`, 0.1, 1.1, 0.1, x + dx * 1.3, y + H + 1, z + dz * 1.3));
    // The searchlight: a lamp and a soft cone of light down to the ground.
    const pivot = new TransformNode(`${name}Light`, scene);
    pivot.position.set(x, y + H + 1.3, z);
    const lamp = MeshBuilder.CreateCylinder(`${name}Lamp`, { height: 0.5, diameter: 0.5, tessellation: 12 }, scene);
    lamp.rotation.x = Math.PI / 2;
    lamp.parent = pivot;
    lamp.material = paint(scene, 'lampBody', '#2a2a2a', 0, 0.4);
    lamp.isPickable = false;
    const cone = MeshBuilder.CreateCylinder(`${name}Cone`, { height: 12, diameterTop: 0.4, diameterBottom: 4, tessellation: 16, cap: Mesh.NO_CAP }, scene);
    cone.parent = pivot;
    cone.rotation.x = Math.PI / 2;
    cone.position.z = 6;
    cone.material = material(scene, 'war-searchCone', (m) => {
      m.emissiveColor = new Color3(1, 0.95, 0.75);
      m.diffuseColor = Color3.Black();
      m.disableLighting = true;
      m.alpha = 0.09;
      m.backFaceCulling = false;
      m.disableDepthWrite = true;
    });
    cone.isPickable = false;
    glow.addExcludedMesh(cone);
    updates.push((_dt, t) => {
      pivot.rotation.y = phase + Math.sin(t * 0.4 + phase) * 1.4;
      pivot.rotation.x = 0.55 + Math.sin(t * 0.7 + phase) * 0.1;
    });
  }

  // --------------------------------------------------------------------------
  //  Headquarters (behind the bases) and the training grounds (out east)
  // --------------------------------------------------------------------------

  const tentMat = paint(scene, 'tent', '#5f6a3e', 0.04);
  tentMat.backFaceCulling = false;
  function tent(x: number, z: number, w: number, d: number, yaw: number): void {
    const y = ground(x, z);
    // A ridge tent: two sheets of canvas leaning together, ends closed.
    const root = new TransformNode('tent', scene);
    root.position.set(x, y, z);
    root.rotation.y = yaw;
    root.computeWorldMatrix(true);
    const canvas: Mesh[] = [];
    const h = w * 0.55, slope = Math.hypot(w / 2, h), lean = Math.atan2(w / 2, h);
    for (const side of [-1, 1]) {
      const sheet = MeshBuilder.CreateBox('tentSide', { width: 0.06, height: slope, depth: d }, scene);
      sheet.parent = root;
      sheet.position.set(side * w / 4, h / 2, 0);
      sheet.rotation.z = side * lean;
      canvas.push(sheet);
    }
    for (const end of [-1, 1]) {
      const gable = new Mesh('tentEnd', scene);
      const data = new VertexData();
      // Both faces, each with its own corners so each gets its own normal.
      const tri = [-w / 2, 0, end * d / 2, w / 2, 0, end * d / 2, 0, h, end * d / 2];
      data.positions = [...tri, ...tri];
      data.indices = [0, 1, 2, 5, 4, 3];
      data.uvs = [0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0, 0.5, 1];
      data.normals = [];
      VertexData.ComputeNormals(data.positions, data.indices, data.normals);
      data.applyToMesh(gable);
      gable.parent = root;
      canvas.push(gable);
    }
    merge(canvas, tentMat, 'tent');
    root.dispose();
    // A flap open at the front.
    const flap = box(scene, 'flap', w * 0.35, w * 0.45, 0.04, x + Math.sin(yaw) * (d / 2 + 0.01), y, z + Math.cos(yaw) * (d / 2 + 0.01), yaw);
    flap.material = paint(scene, 'tentDark', '#1e2214');
  }

  const HQ_N = 21.4;
  // North: the helipad (with a helicopter), the command tent, a radio mast.
  helicopter(-42, 22);
  tent(-28, HQ_N + 2, 5, 7, 0);
  tent(-20, HQ_N + 4, 4, 5, 0.2);
  // The flag, waving.
  const flagY = ground(-33, 13.5);
  steel.push(cyl(scene, 'flagpole', 7, 0.15, -33, flagY, 13.5, 8));
  const flag = MeshBuilder.CreateGround('flag', { width: 2.4, height: 1.5, subdivisionsX: 12, subdivisionsY: 2, updatable: true }, scene);
  flag.rotation.x = -Math.PI / 2;
  flag.position.set(-31.8, flagY + 6.2, 13.5);
  flag.material = material(scene, 'war-flag', (m) => {
    m.diffuseTexture = canvasTexture(scene, 'flagTex', 128, 80, (g) => {
      g.fillStyle = '#2f3a20';
      g.fillRect(0, 0, 128, 80);
      // A zombie-green skull on army olive.
      g.fillStyle = '#9cff5a';
      g.beginPath();
      g.arc(64, 36, 20, 0, Math.PI * 2);
      g.fill();
      g.fillRect(52, 46, 24, 16);
      g.fillStyle = '#2f3a20';
      g.beginPath();
      g.arc(56, 36, 5, 0, Math.PI * 2);
      g.arc(72, 36, 5, 0, Math.PI * 2);
      g.fill();
      for (let k = 0; k < 4; k++) g.fillRect(55 + k * 6, 54, 2, 8);
    });
    m.backFaceCulling = false;
    m.emissiveColor = new Color3(0.2, 0.2, 0.2);
  });
  flag.isPickable = false;
  const flagBase = flag.getVerticesData(VertexBuffer.PositionKind)!.slice();
  updates.push((_dt, t) => {
    const pos = flag.getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 0; i < pos.length; i += 3) {
      const u = (flagBase[i] + 1.2) / 2.4;
      pos[i + 1] = flagBase[i + 1] + Math.sin(t * 4 - u * 5) * 0.18 * u;
    }
    flag.updateVerticesData(VertexBuffer.PositionKind, pos);
  });
  // Radio mast, its light blinking.
  steel.push(cyl(scene, 'mast', 10, 0.2, -50, ground(-50, 28), 28, 6));
  const blink = MeshBuilder.CreateSphere('mastLight', { diameter: 0.4, segments: 8 }, scene);
  blink.position.set(-50, ground(-50, 28) + 10.1, 28);
  blink.material = mats.neon('#ff2020', 1.5);
  blink.isPickable = false;
  updates.push((_dt, t) => blink.setEnabled(t % 1.4 < 0.5));
  // South: rows of tents, a water tower, fuel drums, a radar dish.
  for (const [k, tx] of [-52, -45, -38, -31, -24].entries()) {
    tent(tx, -17, 4, 5, Math.PI);
    if (k % 2 === 0) tent(tx + 2, -26, 4, 5, Math.PI);
  }
  waterTower(-48, -28);
  const drums = new Scatter(MeshBuilder.CreateCylinder('drum', { height: 0.9, diameter: 0.6, tessellation: 10 }, scene));
  drums.mesh.material = paint(scene, 'drum', '#4a5a7a', 0.05, 0.3);
  for (const [dx, dz] of [[0, 0], [0.65, 0.1], [0.3, 0.6], [1.3, 0.2], [0.9, 0.75], [-0.4, 0.5]]) drums.add(-18 + dx, ground(-18, -14) + 0.45, -14 + dz);
  for (const [dx, dz] of [[0, 0], [0.65, 0.1], [0.3, 0.6]]) drums.add(-36 + dx, ground(-36, 14) + 0.45, 14 + dz);
  radar(-20, -27);
  tower(-15.5, 30.5, 'hqTowerN', 2);
  tower(-15.5, -30.5, 'hqTowerS', 4);

  function helicopter(x: number, z: number): void {
    const y = ground(x, z);
    const root = new TransformNode('helicopter', scene);
    root.position.set(x, y, z);
    root.rotation.y = 0.6;
    const green = paint(scene, 'heliGreen', '#4a5530', 0.04, 0.2);
    const add = (m: Mesh, mat: StandardMaterial) => { m.parent = root; m.material = mat; m.isPickable = false; return m; };
    add(MeshBuilder.CreateSphere('heliBody', { diameterX: 2, diameterY: 1.8, diameterZ: 3.6, segments: 10 }, scene), green).position.set(0, 1.4, 0);
    add(MeshBuilder.CreateSphere('heliGlass', { diameterX: 1.6, diameterY: 1.2, diameterZ: 1.4, segments: 10 }, scene), paint(scene, 'glass', '#6a8a9a', 0.15, 0.8)).position.set(0, 1.6, -1.3);
    const tail = add(MeshBuilder.CreateCylinder('heliTail', { height: 4, diameterTop: 0.25, diameterBottom: 0.6, tessellation: 8 }, scene), green);
    tail.rotation.x = Math.PI / 2;
    tail.position.set(0, 1.7, 3.4);
    add(box(scene, 'heliFin', 0.1, 1, 0.7, 0, 1.6, 5.2), green);
    for (const dx of [-0.8, 0.8]) add(box(scene, 'skid', 0.1, 0.1, 3, dx, 0, 0), paint(scene, 'darkSteel', '#3a3d42', 0.02, 0.3));
    add(cyl(scene, 'rotorHub', 0.4, 0.2, 0, 2.2, 0, 6), paint(scene, 'darkSteel', '#3a3d42', 0.02, 0.3));
    const rotor = new TransformNode('rotor', scene);
    rotor.parent = root;
    rotor.position.y = 2.65;
    for (const a of [0, Math.PI / 2]) {
      const blade = add(box(scene, 'blade', 7, 0.04, 0.3, 0, 0, 0), paint(scene, 'darkSteel', '#3a3d42', 0.02, 0.3));
      blade.parent = rotor;
      blade.rotation.y = a;
    }
    // Idling: the rotor turning slowly.
    updates.push((dt) => { rotor.rotation.y += dt * 1.2; });
  }

  function waterTower(x: number, z: number): void {
    const y = ground(x, z);
    for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) steel.push(box(scene, 'wtLeg', 0.2, 6, 0.2, x + dx * 1.2, y, z + dz * 1.2));
    const tank = cyl(scene, 'wtTank', 2.2, 3.4, x, y + 6, z, 16);
    tank.material = paint(scene, 'wtTank', '#6f7a5a', 0.04, 0.2);
    const top = MeshBuilder.CreateCylinder('wtTop', { height: 0.8, diameterTop: 0.2, diameterBottom: 3.6, tessellation: 16 }, scene);
    top.position.set(x, y + 8.6, z);
    top.material = tank.material;
    top.isPickable = false;
  }

  function radar(x: number, z: number): void {
    const y = ground(x, z);
    olive.push(box(scene, 'radarHut', 3, 2, 2.5, x, y, z));
    const dish = new TransformNode('radar', scene);
    dish.position.set(x, y + 2.6, z);
    steel.push(cyl(scene, 'radarPost', 0.7, 0.3, x, y + 2, z, 8));
    const bowl = MeshBuilder.CreateSphere('dish', { diameter: 2.6, slice: 0.35, segments: 12, sideOrientation: Mesh.DOUBLESIDE }, scene);
    bowl.rotation.x = -Math.PI / 2 - 0.4;
    bowl.position.y = 0.6;
    bowl.parent = dish;
    bowl.material = paint(scene, 'dish', '#c9ccc4', 0.08, 0.3);
    bowl.isPickable = false;
    updates.push((dt) => { dish.rotation.y += dt * 0.8; });
  }

  // Training grounds: targets, a tire run, a climbing wall, a barbed wire crawl.
  const targetMat = material(scene, 'war-target', (m) => {
    m.diffuseTexture = canvasTexture(scene, 'targetTex', 128, 128, (g) => {
      g.fillStyle = '#e8e2c8';
      g.fillRect(0, 0, 128, 128);
      for (const [r, c] of [[60, '#e8e2c8'], [50, '#c4161c'], [38, '#e8e2c8'], [26, '#c4161c'], [14, '#e8e2c8'], [6, '#c4161c']] as const) {
        g.fillStyle = c;
        g.beginPath();
        g.arc(64, 64, r, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#111';
      for (let i = 0; i < 12; i++) {
        g.beginPath();
        g.arc(40 + Math.sin(i * 7.1) * 30 + 24, 64 + Math.cos(i * 3.3) * 30, 2.5, 0, Math.PI * 2);
        g.fill();
      }
    });
    m.specularColor = new Color3(0.02, 0.02, 0.02);
    m.backFaceCulling = false;
  });
  function target(x: number, z: number, yaw: number): void {
    const y = ground(x, z);
    for (const dx of [-0.5, 0.5]) wood.push(box(scene, 'targetLeg', 0.1, 1.3, 0.1, x + Math.cos(yaw) * dx, y, z - Math.sin(yaw) * dx));
    const board = MeshBuilder.CreatePlane('target', { size: 1.3 }, scene);
    board.position.set(x, y + 1.6, z);
    board.rotation.y = yaw;
    boards.push(board);
  }
  // In the training field's spawn area, facing the corridor; and out on the range.
  for (const z of [-7.5, -3.5, 3.5, 7.5]) target(55.2, z, Math.PI / 2);
  for (const side of [1, -1]) {
    for (let k = 0; k < 4; k++) target(53.5, side * (14 + k * 4), Math.PI / 2);
    // A tire run.
    const tires = new Scatter(MeshBuilder.CreateTorus('tire', { diameter: 0.8, thickness: 0.28, tessellation: 12 }, scene));
    tires.mesh.material = paint(scene, 'tire', '#1e1e1e', 0, 0.1);
    for (let r = 0; r < 6; r++) for (let c = 0; c < 2; c++) tires.add(45 + r * 0.85, ground(45, side * 15) + 0.12, side * (14.5 + c * 0.85) + (r % 2) * 0.2);
    tires.done();
    // A climbing wall with a rope.
    const cx = 46.5, cz = side * 24;
    wood.push(box(scene, 'climbWall', 4, 3, 0.4, cx, ground(cx, cz), cz));
    for (const dx of [-2.2, 2.2]) wood.push(box(scene, 'climbPost', 0.25, 3.4, 0.25, cx + dx, ground(cx, cz), cz));
    cloth.push(box(scene, 'climbRope', 0.06, 2.6, 0.06, cx + 0.8, ground(cx, cz) + 0.3, cz - side * 0.25));
    // Barbed wire to crawl under, strung on low posts.
    for (let k = 0; k < 4; k++) {
      const wx = 44.5 + k * 1.6;
      for (const dz of [-1.2, 1.2]) wood.push(box(scene, 'crawlPost', 0.08, 0.6, 0.08, wx, ground(wx, side * 29), side * 29 + dz));
    }
    for (const dz of [-1.2, 0, 1.2]) barbedCoil(scene, terrain, 44.5, side * 29 + dz, 49.3, side * 29 + dz, 0.45, 0.06, 'crawlWire');
  }

  // --------------------------------------------------------------------------
  //  Round the outside: a perimeter wall with towers, scorched land beyond,
  //  and smoke rising from fires all over the base
  // --------------------------------------------------------------------------

  const hw = map.width / 2, hd = map.depth / 2;
  const beyond = MeshBuilder.CreateGround('beyond', { width: map.width + 160, height: map.depth + 160 }, scene);
  beyond.position.y = -0.6;
  beyond.material = paint(scene, 'beyond', '#4e4834');
  beyond.isPickable = false;
  const perimeter: Mesh[] = [];
  for (const [x1, z1, x2, z2] of [[-hw, hd, hw, hd], [-hw, -hd, hw, -hd], [-hw, -hd, -hw, hd], [hw, -hd, hw, hd]]) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const w = box(scene, 'perimeter', x1 === x2 ? 0.8 : len + 0.8, 3.2, x1 === x2 ? len + 0.8 : 0.8, (x1 + x2) / 2 + (x1 === x2 ? Math.sign(x1) * 0.4 : 0), -0.2, (z1 + z2) / 2 + (z1 === z2 ? Math.sign(z1) * 0.4 : 0));
    tileBox(w, x1 === x2 ? 0.8 : len, 3.2, x1 === x2 ? len : 0.8, 3);
    perimeter.push(w);
    barbedCoil(scene, terrain, x1 + (x1 === x2 ? Math.sign(x1) * 0.4 : 0), z1 + (z1 === z2 ? Math.sign(z1) * 0.4 : 0), x2 + (x1 === x2 ? Math.sign(x1) * 0.4 : 0), z2 + (z1 === z2 ? Math.sign(z1) * 0.4 : 0), 3.0, 0.25, 'perimeterWire');
  }
  merge(perimeter, material(scene, 'war-perimeter', (m) => {
    m.diffuseTexture = cementTex(scene);
    m.specularColor = new Color3(0.02, 0.02, 0.02);
  }), 'perimeterWall');
  // Burning barrels, and a smoldering wreck or two out beyond the wall.
  const fireTex = softDot(scene, 'fireDot');
  for (const [fx, fz] of [[-17, 12.5], [11, -12.5], [47, 12], [-52, -12.5], [41, -12.3], [-6, 30.5]]) {
    const y = ground(fx, fz);
    const barrel = cyl(scene, 'fireBarrel', 1, 0.7, fx, y, fz, 10);
    barrel.material = paint(scene, 'rustDrum', '#5a3420', 0.03, 0.2);
    const fire = new ParticleSystem('fire', 60, scene);
    fire.particleTexture = fireTex;
    fire.emitter = new Vector3(fx, y + 1, fz);
    fire.minEmitBox = new Vector3(-0.2, 0, -0.2);
    fire.maxEmitBox = new Vector3(0.2, 0, 0.2);
    fire.color1 = new Color4(1, 0.7, 0.2, 1);
    fire.color2 = new Color4(1, 0.35, 0.1, 1);
    fire.colorDead = new Color4(0.3, 0.1, 0, 0);
    fire.minSize = 0.4;
    fire.maxSize = 0.9;
    fire.minLifeTime = 0.3;
    fire.maxLifeTime = 0.7;
    fire.emitRate = 40;
    fire.direction1 = new Vector3(-0.2, 1, -0.2);
    fire.direction2 = new Vector3(0.2, 1, 0.2);
    fire.minEmitPower = 1;
    fire.maxEmitPower = 2;
    fire.blendMode = ParticleSystem.BLENDMODE_ADD;
    fire.start();
    steam(fx, y + 1.8, fz, new Color4(0.2, 0.2, 0.2, 0.35), 1.2, 8);
  }
  // Big columns of smoke out past the wall: the war going on all round.
  for (const [sx, sz] of [[-70, 45], [20, 50], [75, -30], [-40, -48], [70, 30]]) {
    const ps = steam(sx, 0, sz, new Color4(0.18, 0.17, 0.15, 0.5), 7, 10);
    ps.maxLifeTime = 9;
    ps.minEmitPower = 1.5;
    ps.maxEmitPower = 2.5;
    ps.gravity = new Vector3(0.6, 0.2, 0);
  }

  // ---- Merge the static meshes by material ----

  const wallMat = material(scene, 'war-brick', (m) => {
    m.diffuseTexture = brickTex(scene);
    m.specularColor = new Color3(0.03, 0.03, 0.03);
  });
  merge(walls, wallMat, 'warWalls');
  merge(caps, paint(scene, 'cap', '#8d8a80'), 'warCaps');
  merge(wood, paint(scene, 'wood', '#6a4a2a'), 'warWood');
  merge(steel, paint(scene, 'steel', '#a7acb2', 0.05, 0.5), 'warSteel');
  merge(darkSteel, paint(scene, 'darkSteel', '#3a3d42', 0.02, 0.3), 'warDarkSteel');
  merge(olive, paint(scene, 'olive', '#55603a'), 'warOlive');
  merge(cloth, paint(scene, 'rope', '#b8a77a'), 'warRope');
  merge(white, paint(scene, 'white', '#dedbd0', 0.06), 'warWhite');
  merge(cement, material(scene, 'war-cement', (m) => {
    m.diffuseTexture = cementTex(scene);
    m.specularColor = new Color3(0.02, 0.02, 0.02);
  }), 'warCement');
  drums.done();
  merge(reds, paint(scene, 'red', '#c4161c', 0.4), 'warReds');
  merge(boards, targetMat, 'targets');
  merge(fencePosts, paint(scene, 'fencePost', '#7d8288', 0.03, 0.4), 'warFencePosts');
  merge(fencePanels, material(scene, 'war-chainLink', (m) => {
    m.diffuseTexture = chainLinkTex(scene);
    m.useAlphaFromDiffuseTexture = true;
    m.backFaceCulling = false;
    m.specularColor = new Color3(0.2, 0.2, 0.2);
  }), 'warFence');
  bags.done();

  // --------------------------------------------------------------------------
  //  Signs over each zone's door
  // --------------------------------------------------------------------------

  const SIGNS: Partial<Record<ZoneId, [string, string, string]>> = {
    barracks: ['MESS HALL', '#3d4a2a', '#e8e2c8'],
    armory: ['ARMORY', '#2a2a2a', '#ffc21f'],
    hospital: ['HOSPITAL', '#f0ece0', '#c4161c'],
    jail: ['JAIL', '#1c1c1c', '#ff7a1a'],
    training: ['TRAINING', '#3d4a2a', '#e8e2c8'],
  };
  for (const [id, zone] of Object.entries(map.zones ?? {}) as [ZoneId, NonNullable<MapDef['zones']>[ZoneId]][]) {
    if (!zone) continue;
    const [text, bg, fg] = SIGNS[id] ?? [zone.name.toUpperCase(), '#333', '#fff'];
    const across = Math.abs(zone.door.z) < 1;
    const { x, z } = zone.door;
    const y = ground(x, z);
    // Two posts either side of the door, the sign between them up top.
    const span = across ? 6 : 6.2;
    for (const s of [-1, 1]) {
      const p = box(scene, `signPost${id}`, 0.25, 4, 0.25, across ? x : x + s * span / 2, y, across ? z + s * span / 2 : z);
      p.material = paint(scene, 'darkWood', '#3a2a1a');
    }
    const sign = MeshBuilder.CreatePlane(`sign${id}`, { width: span, height: span / 4, sideOrientation: Mesh.DOUBLESIDE }, scene);
    sign.position.set(x, y + 3.6, z);
    sign.rotation.y = across ? Math.PI / 2 : 0;
    sign.material = material(scene, `war-sign-${id}`, (m) => {
      m.diffuseTexture = signTex(scene, id, text, bg, fg);
      m.emissiveColor = new Color3(0.35, 0.35, 0.35);
      m.backFaceCulling = false;
    });
    sign.isPickable = false;
    glow.addExcludedMesh(sign);
  }

  /** A body sits up out from under its sheet: the sheet slides off onto the floor. */
  function bodyRises(spot: number): void {
    const body = bodies[spot];
    if (!body?.isEnabled()) return;
    body.setEnabled(false);
    const sheet = MeshBuilder.CreateBox('fallenSheet', { width: 1.3, height: 0.06, depth: 0.8 }, scene);
    sheet.material = sheetMat;
    sheet.position.set(body.position.x + 0.2, ground(body.position.x, body.position.z) + 0.03, body.position.z + 0.75);
    sheet.rotation.y = rand() * 0.6;
    sheet.isPickable = false;
  }

  /** A cell door bursts off its hinges and flies out into the yard; the alarms start. */
  function breakOut(cell: number): void {
    const d = cellDoors[cell];
    if (!d || d.open) return;
    d.open = true;
    d.vel = new Vector3((rand() - 0.5) * 2, 4.5, 5 + rand() * 2);
    d.spin = new Vector3(-3 - rand() * 2, (rand() - 0.5) * 4, (rand() - 0.5) * 3);
    alarmOn = true;
  }

  let alarmOn = false;
  updates.push((dt, t) => {
    for (const d of cellDoors) {
      if (!d.open || d.t > 1.6) continue;
      d.t += dt;
      d.vel.y -= 14 * dt;
      d.door.position.addInPlace(d.vel.scale(dt));
      d.door.rotation.addInPlace(d.spin.scale(dt));
      const floor = ground(d.door.position.x, d.door.position.z);
      if (d.door.position.y < floor) {
        // Clang: down flat in the dust.
        d.door.position.y = floor;
        d.vel.setAll(0);
        d.spin.setAll(0);
        d.door.rotation.set(-Math.PI / 2, d.door.rotation.y, 0);
        d.t = 2;
      }
    }
    if (!alarmOn) return;
    for (const [k, a] of alarms.entries()) {
      a.light.material = paint(scene, 'alarmOn', '#ff2020', 1.2);
      a.beam.setEnabled(true);
      a.beam.rotation.y = t * 5 + k;
    }
  });

  // --------------------------------------------------------------------------
  //  The Air Strike: a jet screams in low over the target and drops a stick
  //  of bombs, which go off together where the strike lands.
  // --------------------------------------------------------------------------

  function buildJet(): TransformNode {
    const jet = new TransformNode('jet', scene);
    const grey = paint(scene, 'jetGrey', '#7d858c', 0.05, 0.5);
    const add = (m: Mesh, mat: StandardMaterial) => { m.parent = jet; m.material = mat; m.isPickable = false; return m; };
    const body = add(MeshBuilder.CreateCylinder('jetBody', { height: 6, diameterTop: 0.2, diameterBottom: 0.9, tessellation: 10 }, scene), grey);
    body.rotation.x = Math.PI / 2;
    add(box(scene, 'jetWing', 5.5, 0.12, 1.8, 0, 0, -0.3), grey);
    add(box(scene, 'jetTail', 2.2, 0.1, 0.8, 0, 0, -2.6), grey);
    add(box(scene, 'jetFin', 0.1, 1.2, 1, 0, 0, -2.6), grey);
    add(MeshBuilder.CreateSphere('jetCanopy', { diameterX: 0.5, diameterY: 0.4, diameterZ: 1.4, segments: 8 }, scene), paint(scene, 'glass', '#6a8a9a', 0.15, 0.8)).position.set(0, 0.35, 1.2);
    const burner = add(MeshBuilder.CreateCylinder('afterburner', { height: 1.6, diameterTop: 0.7, diameterBottom: 0, tessellation: 8 }, scene), mats.neon('#ffb21f', 1.8, 0.8));
    burner.rotation.x = Math.PI / 2;
    burner.position.z = -3.6;
    return jet;
  }

  interface Run { jet: TransformNode; x: number; z: number; t: number; delay: number; bombs: Mesh[]; dropped: boolean }
  const runs: Run[] = [];
  function airStrike(x: number, z: number, delay: number): void {
    const jet = buildJet();
    runs.push({ jet, x, z, t: 0, delay, bombs: [], dropped: false });
  }
  /** Over the target when the bombs must land: fly in from the west, 40 a second. */
  const JET_SPEED = 40, JET_ALT = 9;
  updates.push((dt) => {
    for (let i = runs.length - 1; i >= 0; i--) {
      const r = runs[i];
      r.t += dt;
      // The bombs fall for 0.45 s, so they're let go that long before the hit, from right over it.
      const over = r.delay - 0.45;
      const along = (r.t - over) * JET_SPEED;
      r.jet.position.set(r.x + along, ground(r.x, r.z) + JET_ALT + Math.max(0, -along) * 0.08, r.z);
      r.jet.rotation.set(0.05, Math.PI / 2, Math.sin(r.t * 3) * 0.1);
      if (!r.dropped && r.t >= over) {
        r.dropped = true;
        for (let k = 0; k < 3; k++) {
          const bomb = MeshBuilder.CreateCapsule('bomb', { radius: 0.18, height: 0.9 }, scene);
          bomb.material = paint(scene, 'bomb', '#3a3d32', 0.03, 0.3);
          bomb.isPickable = false;
          bomb.position.set(r.x + (k - 1) * 0.9, r.jet.position.y - 0.4, r.z + (k - 1) * 0.4);
          bomb.rotation.z = Math.PI / 2;
          r.bombs.push(bomb);
        }
      }
      if (r.dropped) {
        const k = Math.min(1, (r.t - over) / 0.45);
        for (const b of r.bombs) {
          b.position.y = ground(b.position.x, b.position.z) + (JET_ALT - 0.4) * (1 - k * k);
          b.rotation.z = Math.PI / 2 - k * 1.3; // nosing over as they fall
          b.setEnabled(k < 1);
        }
      }
      if (r.t > r.delay + 2) {
        r.jet.dispose();
        for (const b of r.bombs) b.dispose();
        runs.splice(i, 1);
      }
    }
  });

  /** The bombs go off: a fireball, a ring of fire racing out, a column of black smoke, and a scorch mark. */
  function bombBlast(x: number, z: number, radius: number): void {
    const y = ground(x, z);
    const fireball = MeshBuilder.CreateSphere('bombFire', { diameter: radius * 2, segments: 12 }, scene);
    fireball.material = mats.neon('#ff6a1a', 0.9, 0.8);
    fireball.position.set(x, y, z);
    fireball.isPickable = false;
    const core = MeshBuilder.CreateSphere('bombCore', { diameter: radius, segments: 10 }, scene);
    core.material = mats.neon('#ffc21f', 1.2, 0.9);
    core.position.set(x, y + 0.3, z);
    core.isPickable = false;
    const ring = MeshBuilder.CreateTorus('bombRing', { diameter: radius * 2, thickness: 0.3, tessellation: 40 }, scene);
    ring.material = mats.neon('#ff6a10', 1.6, 0.8);
    ring.position.set(x, y + 0.15, z);
    ring.isPickable = false;
    const scorch = MeshBuilder.CreateDisc('scorch', { radius: radius * 0.8, tessellation: 24 }, scene);
    scorch.rotation.x = Math.PI / 2;
    scorch.position.set(x, y + 0.03, z);
    scorch.material = material(scene, 'war-scorch', (m) => {
      m.diffuseColor = new Color3(0.05, 0.04, 0.03);
      m.opacityTexture = softDot(scene, 'scorchDot');
      m.specularColor = Color3.Black();
    });
    scorch.isPickable = false;
    const smoke = steam(x, y + 0.5, z, new Color4(0.12, 0.11, 0.1, 0.7), 2.2, 40);
    smoke.maxLifeTime = 4;
    smoke.minEmitPower = 2;
    smoke.maxEmitPower = 4;
    let t = 0;
    updates.push((dt) => {
      t += dt;
      const k = Math.min(1, t / 0.6);
      // The fireball swells and rises, rolling over into the smoke.
      fireball.scaling.set(0.3 + k * 1.1, 0.3 + k * 1.4, 0.3 + k * 1.1);
      fireball.position.y = y + k * 1.8;
      fireball.visibility = Math.max(0, 1 - t / 1.2);
      core.scaling.setAll(0.4 + k * 1.2);
      core.visibility = Math.max(0, 1 - t / 0.7);
      ring.scaling.setAll(0.2 + k * 1.4);
      ring.visibility = Math.max(0, 1 - t / 0.8);
      if (t > 0.6 && smoke.isStarted()) smoke.stop();
      scorch.visibility = Math.max(0, 1 - Math.max(0, t - 3) / 2);
      if (t <= 5) return true;
      for (const m of [fireball, core, ring, scorch]) m.dispose();
      smoke.dispose();
      return false;
    });
  }

  let time = 0;
  return {
    replacesStrike: true,
    update(dt) {
      time += dt;
      for (let i = updates.length - 1; i >= 0; i--) if (updates[i](dt, time) === false) updates.splice(i, 1);
    },
    handle(events: SimEvent[]) {
      for (const e of events) {
        if (e.t === 'strikeTargeted') airStrike(e.x, e.z, e.delay);
        if (e.t === 'strikeHit') bombBlast(e.x, e.z, e.radius);
        if (e.t !== 'zoneSpawn' || e.spot < 0) continue;
        if (e.zone === 'hospital') bodyRises(e.spot);
        if (e.zone === 'jail') breakOut(e.spot % cellDoors.length);
      }
    },
    crumble() { return false; },
    blackout() {},
    setWind() {},
  };
}
