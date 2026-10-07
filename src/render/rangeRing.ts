import { Color3, Mesh, Scene, StandardMaterial, VertexData } from '@babylonjs/core';
import type { Terrain } from './terrain';

/** Drawn after the world, so hills and buildings never hide the ring. */
export const RING_GROUP = 1;

const SEGMENTS = 96;
const RINGS = 8;
/** How far above the ground the ring floats (it still follows every bump). */
const LIFT = 0.05;
const DASH_WIDTH = 0.14;
/** Roughly how long one dash and its gap are, along the edge. */
const DASH_SPACING = 0.6;
/** How fast the dashes march round (units per second along the edge). */
const MARCH = 0.5;

const LOOKS = {
  good: { fill: Color3.FromHexString('#3cff6e'), dash: Color3.FromHexString('#11702a') },
  bad: { fill: Color3.FromHexString('#ff3344'), dash: Color3.FromHexString('#8a1020') },
};

/**
 * The range circle shown while placing a plant: a soft fill that's clearer in
 * the middle and stronger toward the edge, ringed by darker dashes that march
 * slowly round. It drapes over the ground and draws on top of it.
 */
export class RangeRing {
  private fill: Mesh;
  private dashes: Mesh | null = null;
  private dashCount = 0;
  private mat: StandardMaterial;
  private shown = false;
  private x = 0;
  private z = 0;
  private radius = 1;
  private valid = true;
  private march = 0;

  constructor(
    private scene: Scene,
    private terrain: Terrain,
    /** Keeps a mesh out of the glow, so the dashes stay crisp. */
    private exclude: (m: Mesh) => void,
  ) {
    this.mat = new StandardMaterial('rangeRing', scene);
    this.mat.disableLighting = true;
    this.mat.emissiveColor = Color3.White();
    this.mat.backFaceCulling = false;

    this.fill = new Mesh('rangeFill', scene);
    const indices: number[] = [];
    // Vertex 0 is the center; then RINGS rings of SEGMENTS, inside out.
    for (let s = 0; s < SEGMENTS; s++) indices.push(0, 1 + s, 1 + ((s + 1) % SEGMENTS));
    for (let r = 1; r < RINGS; r++) {
      const a = 1 + (r - 1) * SEGMENTS, b = 1 + r * SEGMENTS;
      for (let s = 0; s < SEGMENTS; s++) {
        const n = (s + 1) % SEGMENTS;
        indices.push(a + s, b + s, b + n, a + s, b + n, a + n);
      }
    }
    const count = 1 + RINGS * SEGMENTS;
    const data = new VertexData();
    data.positions = new Array(count * 3).fill(0);
    data.colors = new Array(count * 4).fill(0);
    data.indices = indices;
    data.applyToMesh(this.fill, true);
    this.setup(this.fill);
    exclude(this.fill);
  }

  private setup(mesh: Mesh): void {
    mesh.material = this.mat;
    mesh.hasVertexAlpha = true;
    mesh.isPickable = false;
    mesh.renderingGroupId = RING_GROUP;
    mesh.setEnabled(false);
  }

  show(x: number, z: number, radius: number, valid: boolean): void {
    this.shown = true;
    this.x = x;
    this.z = z;
    this.radius = radius;
    this.valid = valid;
    this.draw();
  }

  hide(): void {
    this.shown = false;
    this.fill.setEnabled(false);
    this.dashes?.setEnabled(false);
  }

  /** Keep the dashes marching. */
  update(dt: number): void {
    if (!this.shown) return;
    this.march += dt * MARCH;
    this.draw();
  }

  /** The ground's top surface: the ring spans ravines at rim height rather than hanging into them. */
  private groundAt(x: number, z: number): number {
    return this.terrain.surfaceHeight(x, z) + LIFT;
  }

  private draw(): void {
    const look = this.valid ? LOOKS.good : LOOKS.bad;
    const { x, z, radius } = this;

    // The fill: see-through in the middle, stronger toward the edge.
    const pos: number[] = [x, this.groundAt(x, z), z];
    const col: number[] = [look.fill.r, look.fill.g, look.fill.b, 0.05];
    for (let r = 1; r <= RINGS; r++) {
      const k = r / RINGS;
      const rr = radius * k;
      const alpha = 0.05 + 0.27 * k * k * k;
      for (let s = 0; s < SEGMENTS; s++) {
        const a = (s / SEGMENTS) * Math.PI * 2;
        const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
        pos.push(px, this.groundAt(px, pz), pz);
        col.push(look.fill.r, look.fill.g, look.fill.b, alpha);
      }
    }
    this.fill.updateVerticesData('position', pos);
    this.fill.updateVerticesData('color', col);
    this.fill.refreshBoundingInfo();
    this.fill.setEnabled(true);

    // The dashed edge, just inside the rim so it reads as the circle's border.
    const count = Math.max(12, 2 * Math.round((Math.PI * radius) / DASH_SPACING));
    if (count !== this.dashCount) this.buildDashes(count);
    const dashes = this.dashes!;
    const SUB = 4;
    const inner = Math.max(0.05, radius - DASH_WIDTH), outer = radius;
    const shift = this.march / radius;
    const dpos: number[] = [];
    const dcol: number[] = [];
    for (let d = 0; d < count; d++) {
      const start = (d / count) * Math.PI * 2 + shift;
      const len = (Math.PI * 2) / count * 0.55;
      for (let i = 0; i <= SUB; i++) {
        const a = start + (len * i) / SUB;
        for (const r of [inner, outer]) {
          const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
          dpos.push(px, this.groundAt(px, pz) + 0.01, pz);
          dcol.push(look.dash.r, look.dash.g, look.dash.b, 0.95);
        }
      }
    }
    dashes.updateVerticesData('position', dpos);
    dashes.updateVerticesData('color', dcol);
    dashes.refreshBoundingInfo();
    dashes.setEnabled(true);
  }

  private buildDashes(count: number): void {
    this.dashes?.dispose();
    const SUB = 4;
    const indices: number[] = [];
    for (let d = 0; d < count; d++) {
      const base = d * (SUB + 1) * 2;
      for (let i = 0; i < SUB; i++) {
        const a = base + i * 2;
        indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
    }
    const n = count * (SUB + 1) * 2;
    const mesh = new Mesh('rangeDashes', this.scene);
    const data = new VertexData();
    data.positions = new Array(n * 3).fill(0);
    data.colors = new Array(n * 4).fill(0);
    data.indices = indices;
    data.applyToMesh(mesh, true);
    this.setup(mesh);
    // Always over the fill (they share a center, so depth sorting can't tell).
    mesh.alphaIndex = 1;
    this.exclude(mesh);
    this.dashes = mesh;
    this.dashCount = count;
  }
}
