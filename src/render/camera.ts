import { ArcRotateCamera, Matrix, Scene, Vector3 } from '@babylonjs/core';
import { MAP } from '../data/config';

const NORTH = -Math.PI / 2;
const TILT = 0.9; // radians from straight down
const MIN_RADIUS = 10;
const MAX_RADIUS = 70;
const TAP_SLOP_TOUCH = 12;
const TAP_SLOP_MOUSE = 5;

export interface CameraCallbacks {
  /** A short tap/click at canvas pixel (x, y). */
  onTap(x: number, y: number): void;
  /** Mouse moved without dragging (for placement previews). */
  onHover(x: number, y: number): void;
  /** The pointer left the canvas or a touch drag started. */
  onHoverEnd(): void;
}

interface Pointer {
  x: number;
  y: number;
  startX: number;
  startY: number;
  button: number;
  touch: boolean;
}

/**
 * StarCraft-style camera: tilted down at the map.
 *  - one finger / left mouse drag: pan
 *  - pinch / mouse wheel: zoom
 *  - two-finger twist / right mouse drag: rotate freely
 *  - Q / E: snap-rotate 90°, WASD / arrows: pan
 */
export class RtsCamera {
  readonly camera: ArcRotateCamera;
  private pointers = new Map<number, Pointer>();
  private dragging = false;
  /** Set when a gesture used 2+ fingers; suppresses the tap on release. */
  private multiTouch = false;
  private keys = new Set<string>();
  private snapTarget: number | null = null;

  constructor(private scene: Scene, private canvas: HTMLCanvasElement, private cb: CameraCallbacks) {
    this.camera = new ArcRotateCamera('cam', NORTH, TILT, 26, new Vector3(-8, 0, 0), scene);
    this.camera.inputs.clear();
    this.camera.minZ = 0.5;
    this.camera.maxZ = 400;

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('pointerleave', () => this.cb.onHoverEnd());
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Rotation in radians away from north (for the compass). */
  get heading(): number {
    return this.camera.alpha - NORTH;
  }

  get target(): Vector3 {
    return this.camera.target;
  }

  faceNorth(): void {
    // Take the short way round.
    const a = this.camera.alpha;
    this.snapTarget = a + wrapAngle(NORTH - a);
  }

  snapRotate(dir: 1 | -1): void {
    const quarter = Math.PI / 2;
    const base = this.snapTarget ?? this.camera.alpha;
    const rel = (base - NORTH) / quarter;
    const next = dir > 0 ? Math.floor(rel + 1e-3) + 1 : Math.ceil(rel - 1e-3) - 1;
    this.snapTarget = NORTH + next * quarter;
  }

  lookAt(x: number, z: number): void {
    this.camera.target.x = x;
    this.camera.target.z = z;
    this.clampTarget();
  }

  /** Where a canvas pixel lands on the ground (y = 0), if it does. */
  groundPoint(px: number, py: number): { x: number; z: number } | null {
    const ray = this.scene.createPickingRay(px, py, Matrix.Identity(), this.camera);
    if (ray.direction.y >= -1e-4) return null;
    const t = -ray.origin.y / ray.direction.y;
    return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
  }

  update(dt: number): void {
    // Keyboard panning.
    let kx = 0, kz = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) kx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) kx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) kz += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) kz -= 1;
    if (kx || kz) {
      const speed = this.camera.radius * 1.1 * dt;
      const { right, forward } = this.groundAxes();
      this.camera.target.addInPlace(right.scale(kx * speed)).addInPlace(forward.scale(kz * speed));
      this.clampTarget();
    }

    if (this.snapTarget !== null) {
      const diff = this.snapTarget - this.camera.alpha;
      if (Math.abs(diff) < 0.002) {
        this.camera.alpha = this.snapTarget;
        this.snapTarget = null;
      } else {
        this.camera.alpha += diff * Math.min(1, dt * 10);
      }
    }
  }

  // --------------------------------------------------------------------------

  private groundAxes(): { right: Vector3; forward: Vector3 } {
    // Camera looks from its position toward the target; flatten onto the ground.
    const a = this.camera.alpha;
    const forward = new Vector3(-Math.cos(a), 0, -Math.sin(a));
    const right = new Vector3(forward.z, 0, -forward.x);
    return { right, forward };
  }

  private pan(dxPx: number, dyPx: number): void {
    const h = this.canvas.clientHeight || 1;
    const worldPerPx = (2 * this.camera.radius * Math.tan(this.camera.fov / 2)) / h;
    const { right, forward } = this.groundAxes();
    this.camera.target.addInPlace(right.scale(-dxPx * worldPerPx));
    this.camera.target.addInPlace(forward.scale(dyPx * worldPerPx * 1.4));
    this.clampTarget();
  }

  private zoom(factor: number): void {
    this.camera.radius = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, this.camera.radius * factor));
  }

  private rotate(radians: number): void {
    this.snapTarget = null;
    this.camera.alpha += radians;
  }

  private clampTarget(): void {
    const t = this.camera.target;
    t.x = Math.max(-MAP.width / 2, Math.min(MAP.width / 2, t.x));
    t.z = Math.max(-MAP.depth / 2, Math.min(MAP.depth / 2, t.z));
    t.y = 0;
  }

  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    const { x, y } = this.local(e);
    const touch = e.pointerType !== 'mouse';
    this.pointers.set(e.pointerId, { x, y, startX: x, startY: y, button: e.button, touch });
    if (this.pointers.size > 1) {
      this.multiTouch = true;
      this.dragging = true;
    }
    if (touch) this.cb.onHoverEnd();
  };

  private onMove = (e: PointerEvent): void => {
    const { x, y } = this.local(e);
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') this.cb.onHover(x, y);
      return;
    }

    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const before = pairInfo(a, b);
      p.x = x;
      p.y = y;
      const after = pairInfo(a, b);
      if (before.dist > 1) this.zoom(before.dist / Math.max(1, after.dist));
      this.rotate(wrapAngle(after.angle - before.angle));
      this.pan(after.midX - before.midX, after.midY - before.midY);
      return;
    }

    const dx = x - p.x, dy = y - p.y;
    p.x = x;
    p.y = y;
    if (!this.dragging) {
      const slop = p.touch ? TAP_SLOP_TOUCH : TAP_SLOP_MOUSE;
      if (Math.hypot(x - p.startX, y - p.startY) < slop) {
        if (!p.touch) this.cb.onHover(x, y);
        return;
      }
      this.dragging = true;
    }
    if (p.button === 2) this.rotate(dx * 0.008);
    else this.pan(dx, dy);
  };

  private onUp = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    const wasTap = !this.dragging && !this.multiTouch && p.button !== 2;
    if (this.pointers.size === 0) {
      this.dragging = false;
      this.multiTouch = false;
    }
    if (wasTap && e.type === 'pointerup') this.cb.onTap(p.x, p.y);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.zoom(Math.exp(e.deltaY * 0.0012));
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if (k === 'q') this.snapRotate(-1);
    else if (k === 'e') this.snapRotate(1);
    else this.keys.add(k);
  };
}

function pairInfo(a: Pointer, b: Pointer) {
  return {
    dist: Math.hypot(b.x - a.x, b.y - a.y),
    angle: Math.atan2(b.y - a.y, b.x - a.x),
    midX: (a.x + b.x) / 2,
    midY: (a.y + b.y) / 2,
  };
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
