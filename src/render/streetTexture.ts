import { DynamicTexture, Scene, Texture } from '@babylonjs/core';
import type { MapDef } from '../data/config';

// A painted ground for the ruined-city level, covering the whole map:
// cracked asphalt with worn road lines, curbs and paved sidewalks, rubble
// lots behind the ravines, all dusted with blown orange sand.

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distance from the road's center to the curb, and to the sidewalk's back edge. */
export const CURB = 6.6;
export const SIDEWALK = 8.2;

export function streetTexture(scene: Scene, map: MapDef): DynamicTexture {
  const ppu = 24; // pixels per map unit
  const W = Math.min(2048, Math.round(map.width * ppu)), H = Math.min(1024, Math.round(map.depth * ppu));
  const sx = W / map.width, sz = H / map.depth;
  const tex = new DynamicTexture('street', { width: W, height: H }, scene, true);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  const rand = rng(1234);
  const hw = map.width / 2, hd = map.depth / 2;
  // Canvas top = north edge (texture rows run north → south).
  const X = (x: number) => (x + hw) * sx;
  const Z = (z: number) => (hd - z) * sz;
  const band = (z0: number, z1: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(0, Z(Math.max(z0, z1)), W, Math.abs(z1 - z0) * sz);
  };
  const speckle = (z0: number, z1: number, n: number, colors: string[], size: [number, number]) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = colors[Math.floor(rand() * colors.length)];
      const s = size[0] + rand() * (size[1] - size[0]);
      g.fillRect(rand() * W, Z(z1) + rand() * (z1 - z0) * sz, s, s * (0.6 + rand() * 0.8));
    }
  };

  // Rubble lots behind the ravines, and the ravine beds.
  band(-hd, hd, '#6e5238');
  speckle(-hd, hd, 7000, ['#5a4230', '#6d5038', '#4a3a2c', '#735a42', '#62452f'], [2, 6]);
  // Broken bricks and concrete chunks.
  for (let i = 0; i < 900; i++) {
    const zz = (rand() < 0.5 ? 1 : -1) * (SIDEWALK + rand() * (hd - SIDEWALK));
    g.save();
    g.translate(rand() * W, Z(zz));
    g.rotate(rand() * Math.PI);
    g.fillStyle = rand() < 0.65 ? '#6a3a24' : '#6e6258';
    g.fillRect(-3, -1.5, 4 + rand() * 4, 2 + rand() * 2);
    g.restore();
  }

  // Sidewalks: paving slabs, some cracked or missing.
  for (const side of [1, -1]) {
    const z0 = side * CURB, z1 = side * SIDEWALK;
    band(Math.min(z0, z1), Math.max(z0, z1), '#8d7c68');
    const slab = 1.1;
    for (let x = -hw; x < hw; x += slab) {
      for (let z = Math.min(z0, z1); z < Math.max(z0, z1) - 0.05; z += slab * 0.8) {
        const v = 115 + rand() * 30;
        g.fillStyle = rand() < 0.06 ? '#4e3c2c' : `rgb(${v + 12},${v},${v - 14})`;
        g.fillRect(X(x) + 1, Z(z + slab * 0.8) + 1, slab * sx - 2, slab * 0.8 * sz - 2);
      }
    }
    // Curb: a pale concrete edge with a dark gutter beside it.
    g.fillStyle = '#b3a38e';
    g.fillRect(0, Z(side * (CURB + 0.25)) - (side > 0 ? 0 : 0.25 * sz), W, 0.25 * sz);
    g.fillStyle = 'rgba(30,22,16,0.6)';
    g.fillRect(0, Z(side * CURB) - (side > 0 ? 0 : 0.18 * sz) + (side > 0 ? 0 : 0), W, 0.18 * sz);
  }

  // Asphalt.
  band(-CURB, CURB, '#3e3732');
  speckle(-CURB, CURB, 26000, ['#35302c', '#47403a', '#2f2a26', '#504840', '#3a3430'], [1, 3]);
  // Patches of newer and older tarmac.
  for (let i = 0; i < 70; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(25,22,20,0.35)' : 'rgba(90,80,70,0.25)';
    g.fillRect(rand() * W, Z(CURB) + rand() * 2 * CURB * sz, (1 + rand() * 4) * sx, (0.8 + rand() * 2) * sz);
  }
  // Oil stains.
  for (let i = 0; i < 40; i++) {
    const x = rand() * W, y = Z(CURB) + rand() * 2 * CURB * sz, r = (0.4 + rand() * 1.2) * sx;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(10,8,8,0.55)');
    grad.addColorStop(1, 'rgba(10,8,8,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Road lines: a worn double yellow down the middle, faded white lane dashes.
  const line = (z: number, width: number, color: string, dash = 0, gap = 0) => {
    for (let x = -hw; x < hw; x += dash || 0.5) {
      const len = dash || 0.5;
      if (rand() < 0.15) continue; // worn away
      g.fillStyle = color;
      g.globalAlpha = 0.55 + rand() * 0.4;
      g.fillRect(X(x), Z(z) - (width * sz) / 2, len * sx - (dash ? gap * sx : 0), width * sz);
    }
    g.globalAlpha = 1;
  };
  line(0.2, 0.13, '#d9a92a');
  line(-0.2, 0.13, '#d9a92a');
  for (const z of [-3.4, 3.4]) line(z, 0.12, '#cfc6b4', 2.4, 1.6);

  // Cracks across everything paved.
  g.strokeStyle = 'rgba(18,14,12,0.85)';
  for (let i = 0; i < 160; i++) {
    let x = rand() * W, y = Z(SIDEWALK) + rand() * 2 * SIDEWALK * sz;
    g.lineWidth = 0.6 + rand() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    let a = rand() * Math.PI * 2;
    for (let k = 0; k < 10 + rand() * 18; k++) {
      a += (rand() - 0.5) * 1.2;
      x += Math.cos(a) * 6;
      y += Math.sin(a) * 6;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // Debris: paper, glass, bricks scattered on the road.
  speckle(-SIDEWALK, SIDEWALK, 450, ['#5e3624', '#5a5048', '#2a2420', '#6c5e50'], [1, 2.5]);

  // Blown sand: soft orange drifts, thickest at the edges of the road.
  for (let i = 0; i < 260; i++) {
    const edge = rand() < 0.6;
    const zz = edge ? (rand() < 0.5 ? 1 : -1) * (CURB - rand() * 2.5) : (rand() - 0.5) * 2 * CURB;
    const x = rand() * W, y = Z(zz), r = (0.8 + rand() * 2.8) * sx;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(196,128,64,0.45)');
    grad.addColorStop(1, 'rgba(196,128,64,0)');
    g.fillStyle = grad;
    g.save();
    g.translate(x, y);
    g.scale(2.2, 1); // drifts stretched along the wind
    g.translate(-x, -y);
    g.fillRect(x - r, y - r, r * 2, r * 2);
    g.restore();
  }
  // An overall dusty orange wash.
  g.fillStyle = 'rgba(190,110,50,0.12)';
  g.fillRect(0, 0, W, H);

  tex.update(true);
  tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 8;
  return tex;
}
