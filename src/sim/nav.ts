import type { Circle, Rect } from '../data/config';

/** Size of one hidden navigation cell, in map units. */
export const CELL = 0.5;

/** Plants block cells this much wider than their body so neighbors seal gaps. */
export const PLANT_BLOCK_PAD = 0.2;

const DIAG = Math.SQRT2;
const NEIGHBORS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, DIAG], [1, -1, DIAG], [-1, 1, DIAG], [-1, -1, DIAG],
];

export interface FieldSource { x: number; z: number; radius: number }

/**
 * Hidden grid over the map. Obstacles are impassable. Plant cells are
 * passable at a cost (time to chew through). A flow field built from every
 * standing structure tells each ground zombie which way is "downhill" toward
 * the nearest one.
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly width: number;
  readonly depth: number;
  /** 1 = obstacle. */
  readonly blocked: Uint8Array;
  /** Plant id occupying each cell, or -1. */
  readonly plantAt: Int32Array;
  /** Extra path cost of entering each cell (plants). */
  readonly extraCost: Float64Array;
  /** Distance-to-nearest-structure along the cheapest path. */
  readonly dist: Float64Array;

  constructor(width: number, depth: number) {
    this.width = width;
    this.depth = depth;
    this.cols = Math.round(width / CELL);
    this.rows = Math.round(depth / CELL);
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.plantAt = new Int32Array(n).fill(-1);
    this.extraCost = new Float64Array(n);
    this.dist = new Float64Array(n).fill(Infinity);
  }

  cellOf(x: number, z: number): number {
    const c = this.colOf(x);
    const r = this.rowOf(z);
    return r * this.cols + c;
  }

  colOf(x: number): number {
    return clamp(Math.floor((x + this.width / 2) / CELL), 0, this.cols - 1);
  }

  rowOf(z: number): number {
    return clamp(Math.floor((z + this.depth / 2) / CELL), 0, this.rows - 1);
  }

  centerX(cell: number): number {
    return (cell % this.cols + 0.5) * CELL - this.width / 2;
  }

  centerZ(cell: number): number {
    return (Math.floor(cell / this.cols) + 0.5) * CELL - this.depth / 2;
  }

  /** Calls fn for every cell whose center is within `r` of (x, z). */
  forCellsInCircle(x: number, z: number, r: number, fn: (cell: number) => void): void {
    const c0 = this.colOf(x - r), c1 = this.colOf(x + r);
    const r0 = this.rowOf(z - r), r1 = this.rowOf(z + r);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const cell = row * this.cols + col;
        const dx = this.centerX(cell) - x, dz = this.centerZ(cell) - z;
        if (dx * dx + dz * dz <= r * r) fn(cell);
      }
    }
  }

  addRock(c: Circle): void {
    this.forCellsInCircle(c.x, c.z, c.r, (cell) => { this.blocked[cell] = 1; });
  }

  addRavine(rect: Rect): void {
    const c0 = this.colOf(rect.x - rect.w / 2 + CELL / 2), c1 = this.colOf(rect.x + rect.w / 2 - CELL / 2);
    const r0 = this.rowOf(rect.z - rect.d / 2 + CELL / 2), r1 = this.rowOf(rect.z + rect.d / 2 - CELL / 2);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) this.blocked[row * this.cols + col] = 1;
    }
  }

  setPlant(id: number, x: number, z: number, radius: number, cost: number): void {
    this.forCellsInCircle(x, z, radius + PLANT_BLOCK_PAD, (cell) => {
      if (this.blocked[cell]) return;
      this.plantAt[cell] = id;
      this.extraCost[cell] = cost;
    });
  }

  clearPlant(id: number): void {
    for (let i = 0; i < this.plantAt.length; i++) {
      if (this.plantAt[i] === id) {
        this.plantAt[i] = -1;
        this.extraCost[i] = 0;
      }
    }
  }

  /** True when cell is an obstacle or a plant — zombies can't slip diagonally past it. */
  private solid(cell: number): boolean {
    return this.blocked[cell] === 1 || this.plantAt[cell] >= 0;
  }

  /** Can a zombie step from `cell` by (dc, dr) without cutting a corner? */
  canStep(cell: number, dc: number, dr: number): boolean {
    const col = cell % this.cols, row = Math.floor(cell / this.cols);
    const nc = col + dc, nr = row + dr;
    if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) return false;
    const next = nr * this.cols + nc;
    if (this.blocked[next]) return false;
    if (dc !== 0 && dr !== 0) {
      if (this.solid(row * this.cols + nc) || this.solid(nr * this.cols + col)) return false;
    }
    return true;
  }

  /** Rebuild the flow field toward the given sources (standing structures). */
  computeField(sources: FieldSource[]): void {
    const dist = this.dist;
    dist.fill(Infinity);
    const heap = new MinHeap();
    for (const s of sources) {
      this.forCellsInCircle(s.x, s.z, s.radius, (cell) => {
        if (dist[cell] !== 0) {
          dist[cell] = 0;
          heap.push(cell, 0);
        }
      });
    }
    while (heap.size > 0) {
      const [cell, d] = heap.pop();
      if (d > dist[cell]) continue;
      for (const [dc, dr, len] of NEIGHBORS) {
        // Reverse edge: a zombie at `next` stepping toward `cell`.
        const col = cell % this.cols, row = Math.floor(cell / this.cols);
        const nc = col + dc, nr = row + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const next = nr * this.cols + nc;
        if (this.blocked[next]) continue;
        if (!this.canStep(next, -dc, -dr)) continue;
        // Cost of entering `cell` from `next`.
        const nd = d + len * CELL + this.extraCost[cell];
        if (nd < dist[next]) {
          dist[next] = nd;
          heap.push(next, nd);
        }
      }
    }
  }

  /** The neighbor cell a zombie at `cell` should step into, or -1. */
  bestStep(cell: number): number {
    let best = -1;
    let bestD = Infinity;
    const here = this.dist[cell];
    const col = cell % this.cols, row = Math.floor(cell / this.cols);
    for (const [dc, dr, len] of NEIGHBORS) {
      if (!this.canStep(cell, dc, dr)) continue;
      const next = (row + dr) * this.cols + (col + dc);
      if (!(this.dist[next] < here)) continue;
      // Compare by what it costs to get there and onward, so plants aren't free.
      const d = this.dist[next] + len * CELL + this.extraCost[next];
      if (d < bestD) {
        bestD = d;
        best = next;
      }
    }
    return best;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

class MinHeap {
  private items: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, key: number): void {
    const items = this.items, keys = this.keys;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      items[i] = items[p];
      keys[i] = keys[p];
      i = p;
    }
    items[i] = item;
    keys[i] = key;
  }

  pop(): [number, number] {
    const items = this.items, keys = this.keys;
    const top: [number, number] = [items[0], keys[0]];
    const lastItem = items.pop()!;
    const lastKey = keys.pop()!;
    const n = items.length;
    if (n > 0) {
      let i = 0;
      while (true) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) break;
        items[i] = items[c];
        keys[i] = keys[c];
        i = c;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}
