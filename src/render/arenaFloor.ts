import { DynamicTexture, Scene } from '@babylonjs/core';
import type { MapDef } from '../data/config';
import { rng } from './decor';

// A painted floor for the Hellfire Arena, covering the whole map: scuffed
// black concrete strewn with confetti, spilled drinks and taped-down cables,
// the stage's black boards at the narrow end, and the mosh pit worn pale in
// a ring of hazard stripes.

export function arenaTexture(scene: Scene, map: MapDef): DynamicTexture {
  const ppu = 27; // pixels per map unit
  const W = Math.min(2048, Math.round(map.width * ppu)), H = Math.min(2048, Math.round(map.depth * ppu));
  const sx = W / map.width, sz = H / map.depth;
  const tex = new DynamicTexture('arenaFloor', { width: W, height: H }, scene, true);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  const rand = rng(666);
  const hw = map.width / 2, hd = map.depth / 2;
  // Canvas top = north edge (texture rows run north → south).
  const X = (x: number) => (x + hw) * sx;
  const Z = (z: number) => (hd - z) * sz;
  const fan = map.fan!;

  // Concrete, in big slabs.
  g.fillStyle = '#26232b';
  g.fillRect(0, 0, W, H);
  for (let x = -hw; x < hw; x += 4) {
    for (let z = -hd; z < hd; z += 4) {
      const v = 30 + rand() * 10;
      g.fillStyle = `rgb(${v},${v * 0.95},${v * 1.1})`;
      g.fillRect(X(x) + 1, Z(z + 4) + 1, 4 * sx - 2, 4 * sz - 2);
    }
  }
  // Scuffs and grime.
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '90,80,100'},${0.08 + rand() * 0.15})`;
    g.beginPath();
    g.ellipse(rand() * W, rand() * H, 2 + rand() * 14, 1 + rand() * 6, rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // Sticky puddles of spilled drinks.
  for (let i = 0; i < 40; i++) {
    const x = rand() * W, y = rand() * H, r = 8 + rand() * 26;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const c = rand() < 0.5 ? '160,110,30' : '90,40,60';
    grad.addColorStop(0, `rgba(${c},0.35)`);
    grad.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Cables snaking from the back of the floor to the stage, taped down.
  for (let k = 0; k < 4; k++) {
    let x = 20 + k * 3, z = (k - 1.5) * 4;
    g.strokeStyle = k % 2 ? '#0b0b0d' : '#131316';
    g.lineWidth = 0.18 * sx;
    g.beginPath();
    g.moveTo(X(x), Z(z));
    while (x > -30) {
      x -= 1.5;
      z += (rand() - 0.5) * 1.6 - z * 0.04;
      g.lineTo(X(x), Z(z));
      if (rand() < 0.25) {
        // A strip of yellow gaffer tape across it.
        g.save();
        g.fillStyle = 'rgba(240,200,40,0.8)';
        g.translate(X(x), Z(z));
        g.rotate(rand() * 0.6 - 0.3);
        g.fillRect(-0.12 * sx, -0.35 * sz, 0.24 * sx, 0.7 * sz);
        g.restore();
      }
    }
    g.stroke();
  }
  // Confetti everywhere.
  const confetti = ['#ff2fd0', '#ffe14d', '#3cff6e', '#4de6ff', '#ff5a2a', '#ffffff'];
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = confetti[Math.floor(rand() * confetti.length)];
    g.save();
    g.translate(rand() * W, rand() * H);
    g.rotate(rand() * 3);
    g.fillRect(0, 0, 4 + rand() * 4, 2 + rand() * 2);
    g.restore();
  }
  // White tape crosses (spike marks) dotted about.
  g.strokeStyle = 'rgba(235,235,235,0.6)';
  g.lineWidth = 0.15 * sx;
  for (let i = 0; i < 18; i++) {
    const x = X(-hw + rand() * map.width), y = Z(-hd + rand() * map.depth), s = 0.4 * sx;
    g.beginPath();
    g.moveTo(x - s, y - s); g.lineTo(x + s, y + s);
    g.moveTo(x + s, y - s); g.lineTo(x - s, y + s);
    g.stroke();
  }

  // The stage: black boards running across it, a few taped marks, and the
  // set list stuck down by the front edge.
  const stage = map.stage;
  if (stage) {
    g.save();
    g.beginPath();
    g.arc(X(fan.x), Z(fan.z), stage.radius * sx, -Math.PI / 2, Math.PI / 2, false);
    g.closePath();
    g.clip();
    g.fillStyle = '#111014';
    g.fillRect(0, 0, W, H);
    for (let z = -hd; z < hd; z += 0.5) {
      const v = 14 + rand() * 10;
      g.fillStyle = `rgb(${v},${v},${v + 3})`;
      g.fillRect(0, Z(z + 0.5) + 1, W, 0.5 * sz - 2);
      // Board ends, staggered.
      g.fillStyle = 'rgba(0,0,0,0.6)';
      for (let x = -hw + rand() * 6; x < hw; x += 4 + rand() * 4) g.fillRect(X(x), Z(z + 0.5), 2, 0.5 * sz);
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(255,255,255,${0.02 + rand() * 0.05})`;
      g.fillRect(rand() * W, rand() * H, 1 + rand() * 6, 1);
    }
    g.restore();
    // The set list, taped to the boards near the front.
    const lx = X(fan.x + stage.radius - 2.2), ly = Z(5.5);
    g.save();
    g.translate(lx, ly);
    g.rotate(-0.15);
    g.fillStyle = '#f2efe6';
    g.fillRect(0, 0, 1.6 * sx, 2.2 * sz);
    g.fillStyle = '#1b1b1b';
    g.font = `bold ${Math.round(0.22 * sx)}px Arial, sans-serif`;
    ['SET LIST', '1. BRAINS', '2. NIGHT OF', '   THE LASER', '3. MOSH!!', '4. ENCORE'].forEach((line, i) => g.fillText(line, 0.12 * sx, (0.35 + i * 0.32) * sz));
    g.restore();
  }

  // The mosh pit: worn pale in the middle, ringed with hazard stripes, and
  // MOSH PIT painted round it twice.
  const pit = map.moshPit;
  if (pit) {
    const cx = X(pit.x), cy = Z(pit.z), r = pit.r * sx;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(120,100,130,0.45)');
    grad.addColorStop(0.8, 'rgba(90,70,100,0.25)');
    grad.addColorStop(1, 'rgba(90,70,100,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    // Boot scuffs going round and round.
    for (let i = 0; i < 260; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r * 0.95;
      g.strokeStyle = `rgba(10,8,12,${0.15 + rand() * 0.25})`;
      g.lineWidth = 1 + rand() * 2;
      g.beginPath();
      g.arc(cx, cy, d, a, a + 0.2 + rand() * 0.4);
      g.stroke();
    }
    const band = 0.45 * sx;
    for (let k = 0; k < 48; k++) {
      g.strokeStyle = k % 2 ? '#111111' : '#ffd21f';
      g.lineWidth = band;
      g.beginPath();
      g.arc(cx, cy, r - band / 2, (k / 48) * Math.PI * 2, ((k + 1) / 48) * Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#ffd21f';
    g.font = `bold ${Math.round(0.8 * sx)}px Impact, Arial Black, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const text = 'MOSH PIT  ★  MOSH PIT  ★  ';
    for (let i = 0; i < text.length; i++) {
      const a = (i / text.length) * Math.PI * 2;
      g.save();
      g.translate(cx + Math.cos(a) * (r - band * 2), cy + Math.sin(a) * (r - band * 2));
      g.rotate(a + Math.PI / 2);
      g.fillText(text[i], 0, 0);
      g.restore();
    }
  }
  tex.update(true);
  return tex;
}
