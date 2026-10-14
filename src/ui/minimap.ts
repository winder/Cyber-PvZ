import { PLANTS, STRUCTURES, ZOMBIES } from '../data/config';
import type { Game } from '../sim/game';

/** StarCraft-style overview in the corner. Tap or drag on it to move the camera. */
export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private scale = 1;

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
    onJump: (x: number, z: number) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    // Same shape as the map (the corridor level is long and thin).
    canvas.style.aspectRatio = `${game.map.width} / ${game.map.depth}`;
    canvas.style.height = 'auto';
    let down = false;
    const map = game.map;
    const jump = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5) * map.width;
      const z = (0.5 - (e.clientY - r.top) / r.height) * map.depth;
      onJump(x, z);
    };
    canvas.addEventListener('pointerdown', (e) => {
      down = true;
      canvas.setPointerCapture(e.pointerId);
      jump(e);
    });
    canvas.addEventListener('pointermove', (e) => { if (down) jump(e); });
    canvas.addEventListener('pointerup', () => { down = false; });
    canvas.addEventListener('pointercancel', () => { down = false; });
  }

  draw(cam: { x: number; z: number; radius: number; heading: number }): void {
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = this.ctx;
    const map = this.game.map;
    this.scale = w / map.width;
    const s = this.scale;
    const X = (x: number) => (x + map.width / 2) * s;
    const Z = (z: number) => (map.depth / 2 - z) * s;

    ctx.clearRect(0, 0, w, h);

    // An arena: the stands all round, the floor fanning out, its tunnels,
    // rows of seats, and the mosh pit.
    const fan = map.fan;
    if (fan) {
      ctx.fillStyle = 'rgba(40, 10, 40, 0.75)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(70, 60, 90, 0.5)';
      ctx.beginPath();
      ctx.moveTo(X(fan.x), Z(fan.z));
      ctx.arc(X(fan.x), Z(fan.z), fan.radius * s, -fan.halfAngle, fan.halfAngle);
      ctx.closePath();
      ctx.fill();
      for (const t of map.tunnels ?? []) ctx.fillRect(X(t.x - t.w / 2), Z(t.z + t.d / 2), t.w * s, t.d * s);
      ctx.strokeStyle = 'rgba(255, 60, 90, 0.85)';
      ctx.lineWidth = 1.8 * s;
      ctx.lineCap = 'round';
      for (const r of map.seats ?? []) {
        ctx.beginPath();
        ctx.moveTo(X(r.x1), Z(r.z1));
        ctx.lineTo(X(r.x2), Z(r.z2));
        ctx.stroke();
      }
      const pit = map.moshPit;
      if (pit) {
        ctx.strokeStyle = 'rgba(255, 210, 31, 0.9)';
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.arc(X(pit.x), Z(pit.z), pit.r * s, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.fillStyle = 'rgba(120, 100, 255, 0.55)';
    for (const [i, r] of map.rocks.entries()) {
      if (this.game.risen.has(i)) continue;
      ctx.beginPath();
      ctx.arc(X(r.x), Z(r.z), r.r * s, 0, Math.PI * 2);
      ctx.fill();
    }
    // Ravines: dark trenches with a glowing rim.
    ctx.fillStyle = '#000003';
    ctx.strokeStyle = 'rgba(90, 240, 255, 0.9)';
    ctx.lineWidth = dpr;
    for (const r of map.ravines) {
      ctx.fillRect(X(r.x - r.w / 2), Z(r.z + r.d / 2), r.w * s, r.d * s);
      ctx.strokeRect(X(r.x - r.w / 2), Z(r.z + r.d / 2), r.w * s, r.d * s);
    }

    for (const st of this.game.structures) {
      const def = STRUCTURES[st.type];
      ctx.fillStyle = st.alive ? def.color : '#333';
      ctx.beginPath();
      ctx.arc(X(st.x), Z(st.z), def.radius * s, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of this.game.plants) {
      ctx.fillStyle = PLANTS[p.type].color;
      ctx.fillRect(X(p.x) - 1.5 * dpr, Z(p.z) - 1.5 * dpr, 3 * dpr, 3 * dpr);
    }

    for (const zb of this.game.zombies) {
      ctx.fillStyle = ZOMBIES[zb.type].flying ? '#ffaa33' : '#ff3355';
      ctx.beginPath();
      ctx.arc(X(zb.x), Z(zb.z), 1.6 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Camera view: a box roughly the size of what's on screen, turned with the camera.
    const viewW = cam.radius * 1.4, viewD = cam.radius * 0.9;
    ctx.save();
    ctx.translate(X(cam.x), Z(cam.z));
    ctx.rotate(-cam.heading);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.2 * dpr;
    ctx.strokeRect((-viewW / 2) * s, (-viewD / 2) * s, viewW * s, viewD * s);
    ctx.restore();
  }
}
