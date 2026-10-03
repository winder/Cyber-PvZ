import {
  Color3, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3,
} from '@babylonjs/core';
import { ABILITIES, PLANTS, STRUCTURES, ZOMBIES, type EdgeId, type PlantId } from '../data/config';
import type { Game, SimEvent } from '../sim/game';
import { animate } from './blockModel';
import {
  createPlantVisual, createStructureVisual, createZombieVisual, type Visual,
} from './visuals';
import type { World } from './world';

const FLY_HEIGHT = 2.6;

interface Tracked {
  visual: Visual;
  bar: Mesh;
  /** Visual position, eased toward the sim position for smooth motion. */
  x: number;
  z: number;
}

interface Effect {
  update(dt: number): boolean; // false = finished
  dispose(): void;
}

/** Converts our "0 = +x" angle into Babylon's Y rotation (models face +z). */
function yaw(facing: number): number {
  return Math.PI / 2 - facing;
}

export class Renderer {
  private plants = new Map<number, Tracked>();
  private zombies = new Map<number, Tracked>();
  private structures: Tracked[] = [];
  private effects: Effect[] = [];
  private ghost: TransformNode | null = null;
  private ghostType: PlantId | null = null;
  private ghostRing: Mesh;
  private ghostBad: StandardMaterial;
  private ghostGood: StandardMaterial;
  private selectRing: Mesh;
  private aimRing: Mesh;
  private beamMats: Record<string, StandardMaterial> = {};
  private barMats: StandardMaterial[] = [];
  private time = 0;

  constructor(private world: World, private game: Game) {
    const { scene } = world;

    // Health bar colors from green (full) to red (empty).
    for (let i = 0; i <= 10; i++) {
      const m = new StandardMaterial(`bar${i}`, scene);
      m.emissiveColor = Color3.Lerp(new Color3(1, 0.15, 0.1), new Color3(0.2, 1, 0.3), i / 10);
      m.disableLighting = true;
      this.barMats.push(m);
    }

    for (const s of game.structures) {
      const visual = createStructureVisual(scene, world.mats, s.type, `structure${s.index}`);
      visual.root.position.set(s.x, 0, s.z);
      if (s.type === 'spaceship') visual.root.rotation.y = Math.PI / 2;
      this.structures.push({ visual, bar: this.makeBar(visual, 2.5), x: s.x, z: s.z });
    }

    this.ghostGood = new StandardMaterial('ghostGood', scene);
    this.ghostGood.emissiveColor = new Color3(0.3, 1, 0.5);
    this.ghostGood.alpha = 0.25;
    this.ghostGood.disableLighting = true;
    this.ghostBad = new StandardMaterial('ghostBad', scene);
    this.ghostBad.emissiveColor = new Color3(1, 0.2, 0.2);
    this.ghostBad.alpha = 0.3;
    this.ghostBad.disableLighting = true;

    this.ghostRing = MeshBuilder.CreateDisc('ghostRing', { radius: 1, tessellation: 48 }, scene);
    this.ghostRing.rotation.x = Math.PI / 2;
    this.ghostRing.isPickable = false;
    this.ghostRing.setEnabled(false);

    this.selectRing = MeshBuilder.CreateTorus('selectRing', { diameter: 1.7, thickness: 0.08, tessellation: 32 }, scene);
    this.selectRing.material = world.mats.neon('#ffffff', 1.2);
    this.selectRing.isPickable = false;
    this.selectRing.setEnabled(false);

    this.aimRing = MeshBuilder.CreateTorus('aimRing', {
      diameter: ABILITIES.orbitalStrike.radius * 2, thickness: 0.12, tessellation: 48,
    }, scene);
    this.aimRing.material = world.mats.neon('#ff3355', 1.2, 0.8);
    this.aimRing.isPickable = false;
    this.aimRing.setEnabled(false);
  }

  private makeBar(visual: Visual, width: number): Mesh {
    const bar = MeshBuilder.CreatePlane('bar', { width, height: 0.14 }, this.world.scene);
    bar.billboardMode = Mesh.BILLBOARDMODE_ALL;
    bar.parent = visual.root;
    bar.position.y = visual.height + 0.35;
    bar.isPickable = false;
    bar.setEnabled(false);
    this.world.glow.addExcludedMesh(bar);
    return bar;
  }

  private setBar(bar: Mesh, frac: number): void {
    const show = frac < 0.999 && frac > 0;
    bar.setEnabled(show);
    if (!show) return;
    bar.scaling.x = Math.max(0.02, frac);
    bar.material = this.barMats[Math.round(frac * 10)];
  }

  /** Mirror the simulation into the scene. Called every frame. */
  sync(dt: number): void {
    this.time += dt;
    const { scene, mats } = this.world;
    const g = this.game;
    const ease = Math.min(1, dt * 15);
    const hyper = g.hyperTimer > 0;

    // Plants
    const seenPlants = new Set<number>();
    for (const p of g.plants) {
      seenPlants.add(p.id);
      let t = this.plants.get(p.id);
      if (!t) {
        const visual = createPlantVisual(scene, mats, p.type, `plant${p.id}`);
        visual.root.position.set(p.x, 0, p.z);
        t = { visual, bar: this.makeBar(visual, 1), x: p.x, z: p.z };
        this.plants.set(p.id, t);
        this.pop(visual.root);
      }
      if (t.visual.turret) t.visual.turret.rotation.y = yaw(p.facing);
      const pulse = hyper ? 1 + 0.08 * Math.sin(this.time * 20 + p.id) : 1;
      if (!this.popping.has(t.visual.root)) t.visual.root.scaling.setAll(pulse);
      this.setBar(t.bar, p.hp / PLANTS[p.type].hp);
    }
    for (const [id, t] of this.plants) {
      if (!seenPlants.has(id)) {
        t.visual.root.dispose();
        this.plants.delete(id);
      }
    }

    // Zombies
    const seenZombies = new Set<number>();
    for (const z of g.zombies) {
      seenZombies.add(z.id);
      const def = ZOMBIES[z.type];
      let t = this.zombies.get(z.id);
      if (!t) {
        const visual = createZombieVisual(scene, mats, z.type, `zombie${z.id}`);
        t = { visual, bar: this.makeBar(visual, 0.9), x: z.x, z: z.z };
        this.zombies.set(z.id, t);
      }
      t.x += (z.x - t.x) * ease;
      t.z += (z.z - t.z) * ease;
      const root = t.visual.root;
      const chewing = z.attacking !== null;
      const bob = def.flying
        ? FLY_HEIGHT + Math.sin(this.time * 4 + z.id) * 0.2
        : chewing ? Math.abs(Math.sin(this.time * 12 + z.id)) * 0.12 : Math.abs(Math.sin(this.time * 8 + z.id)) * 0.06;
      root.position.set(t.x, bob, t.z);
      root.rotation.y = yaw(z.facing);
      const character = t.visual.character;
      if (character) {
        animate(character, this.time, { moving: !chewing, chewing, flying: def.flying }, z.id);
        t.visual.update?.(this.time, !chewing);
        // Flyers lean into the wind; walkers bob instead of tilting.
        root.rotation.x = def.flying ? 0.3 : 0;
        if (!def.flying) root.position.y = 0;
      } else {
        root.rotation.x = chewing ? 0.25 : 0;
      }
      this.setBar(t.bar, z.hp / def.hp);
    }
    for (const [id, t] of this.zombies) {
      if (!seenZombies.has(id)) {
        t.visual.root.dispose();
        this.zombies.delete(id);
      }
    }

    // Structures
    for (const s of g.structures) {
      const t = this.structures[s.index];
      if (!s.alive) {
        t.bar.setEnabled(false);
        continue;
      }
      this.setBar(t.bar, s.hp / STRUCTURES[s.type].hp);
    }

    // Effects
    for (let i = this.effects.length - 1; i >= 0; i--) {
      if (!this.effects[i].update(dt)) {
        this.effects[i].dispose();
        this.effects.splice(i, 1);
      }
    }
    this.updatePops(dt);
  }

  // --------------------------------------------------------------------------
  //  Events → effects
  // --------------------------------------------------------------------------

  handle(events: SimEvent[]): void {
    for (const e of events) {
      switch (e.t) {
        case 'shot': this.beam(e.fromX, e.fromZ, e.toX, e.toZ, e.toAir, PLANTS[e.kind].color); break;
        case 'zombieDied': {
          const def = ZOMBIES[e.type];
          if (def.boss) {
            // A big one deserves a big finish.
            for (let i = 0; i < 6; i++) {
              const a = (i / 6) * Math.PI * 2;
              this.burst(e.x + Math.cos(a) * 1.5, e.z + Math.sin(a) * 1.5, i % 2 ? def.color : '#ffcc66', 1 + i);
            }
            this.strikeBlast(e.x, e.z, 4);
          } else {
            this.burst(e.x, e.z, def.color, def.flying ? FLY_HEIGHT : 0.6);
          }
          break;
        }
        case 'plantDied': this.burst(e.x, e.z, '#3cff6e', 0.6); break;
        case 'strikeTargeted': this.strikeMarker(e.x, e.z, e.delay); break;
        case 'strikeHit': this.strikeBlast(e.x, e.z, e.radius); break;
        case 'structureDestroyed': this.destroyStructure(e.index); break;
        default: break;
      }
    }
  }

  private beamMat(color: string): StandardMaterial {
    let m = this.beamMats[color];
    if (!m) {
      m = new StandardMaterial(`beam${color}`, this.world.scene);
      m.emissiveColor = Color3.FromHexString(color);
      m.disableLighting = true;
      this.beamMats[color] = m;
    }
    return m;
  }

  private beam(fx: number, fz: number, tx: number, tz: number, toAir: boolean, color: string): void {
    const from = new Vector3(fx, 1.05, fz);
    const to = new Vector3(tx, toAir ? FLY_HEIGHT + 0.8 : 0.9, tz);
    const len = Vector3.Distance(from, to);
    const mesh = MeshBuilder.CreateCylinder('beam', { height: len, diameter: 0.09, tessellation: 6 }, this.world.scene);
    mesh.material = this.beamMat(color);
    mesh.isPickable = false;
    mesh.position = Vector3.Center(from, to);
    // Cylinders point up (+y); tip it over to point from → to.
    const dir = to.subtract(from).normalize();
    const axis = Vector3.Cross(Vector3.Up(), dir);
    const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(Vector3.Up(), dir))));
    if (axis.lengthSquared() > 1e-8) mesh.rotate(axis.normalize(), angle);
    let life = 0.12;
    this.effects.push({
      update: (dt) => {
        life -= dt;
        mesh.scaling.x = mesh.scaling.z = Math.max(0.1, life / 0.12);
        return life > 0;
      },
      dispose: () => mesh.dispose(),
    });
  }

  private burst(x: number, z: number, color: string, y: number): void {
    const mesh = MeshBuilder.CreateIcoSphere('burst', { radius: 0.5, subdivisions: 1 }, this.world.scene);
    mesh.material = this.world.mats.neon(color, 1.5, 0.6);
    mesh.position.set(x, y, z);
    mesh.isPickable = false;
    let t = 0;
    this.effects.push({
      update: (dt) => {
        t += dt;
        mesh.scaling.setAll(1 + t * 6);
        mesh.visibility = Math.max(0, 1 - t / 0.35);
        return t < 0.35;
      },
      dispose: () => mesh.dispose(),
    });
  }

  private strikeMarker(x: number, z: number, delay: number): void {
    const r = ABILITIES.orbitalStrike.radius;
    const ring = MeshBuilder.CreateTorus('strikeRing', { diameter: r * 2, thickness: 0.15, tessellation: 48 }, this.world.scene);
    ring.material = this.world.mats.neon('#ff3355', 1.5);
    ring.position.set(x, 0.1, z);
    ring.isPickable = false;
    const beam = MeshBuilder.CreateCylinder('strikeBeam', { height: 40, diameter: 0.15, tessellation: 8 }, this.world.scene);
    beam.material = this.world.mats.neon('#ff6677', 1.5, 0.5);
    beam.position.set(x, 20, z);
    beam.isPickable = false;
    let t = 0;
    this.effects.push({
      update: (dt) => {
        if (this.game.phase === 'battle') t += dt;
        ring.scaling.setAll(1.3 - 0.3 * Math.min(1, t / delay));
        ring.rotation.y += dt * 3;
        return t < delay;
      },
      dispose: () => { ring.dispose(); beam.dispose(); },
    });
  }

  private strikeBlast(x: number, z: number, radius: number): void {
    const { scene, mats } = this.world;
    const column = MeshBuilder.CreateCylinder('blastCol', { height: 30, diameter: radius * 1.2, tessellation: 24 }, scene);
    column.material = mats.neon('#ff4466', 2, 0.7);
    column.position.set(x, 15, z);
    column.isPickable = false;
    const dome = MeshBuilder.CreateSphere('blastDome', { diameter: radius * 2, segments: 16 }, scene);
    dome.material = mats.neon('#ffcc66', 2, 0.6);
    dome.position.set(x, 0, z);
    dome.isPickable = false;
    let t = 0;
    this.effects.push({
      update: (dt) => {
        t += dt;
        const k = t / 0.5;
        column.scaling.x = column.scaling.z = Math.max(0.01, 1 - k);
        dome.scaling.setAll(0.3 + k);
        dome.visibility = Math.max(0, 1 - k);
        return t < 0.5;
      },
      dispose: () => { column.dispose(); dome.dispose(); },
    });
  }

  private destroyStructure(index: number): void {
    const t = this.structures[index];
    const s = this.game.structures[index];
    this.burst(s.x, s.z, STRUCTURES[s.type].color, 1.5);
    this.burst(s.x + 1, s.z - 0.5, '#ffaa33', 1);
    const root = t.visual.root;
    for (const m of root.getChildMeshes()) m.material = this.world.mats.dark('#333344');
    root.scaling.y = 0.4;
  }

  // --------------------------------------------------------------------------
  //  Spawn pop animation
  // --------------------------------------------------------------------------

  private popping = new Map<TransformNode, number>();

  private pop(node: TransformNode): void {
    this.popping.set(node, 0);
    node.scaling.setAll(0.01);
  }

  private updatePops(dt: number): void {
    for (const [node, t0] of this.popping) {
      const t = t0 + dt;
      if (t >= 0.25 || node.isDisposed()) {
        node.scaling.setAll(1);
        this.popping.delete(node);
        continue;
      }
      const k = t / 0.25;
      node.scaling.setAll(k < 0.7 ? (k / 0.7) * 1.15 : 1.15 - ((k - 0.7) / 0.3) * 0.15);
      this.popping.set(node, t);
    }
  }

  // --------------------------------------------------------------------------
  //  Build helpers: placement ghost, selection, edge preview, aiming
  // --------------------------------------------------------------------------

  /** Show a see-through plant where it would be placed. Pass null to hide. */
  setGhost(type: PlantId | null, x = 0, z = 0, valid = true): void {
    if (type !== this.ghostType) {
      this.ghost?.dispose();
      this.ghost = null;
      this.ghostType = type;
      if (type) {
        const v = createPlantVisual(this.world.scene, this.world.mats, type, 'ghost');
        for (const m of v.root.getChildMeshes()) m.visibility = 0.45;
        this.ghost = v.root;
      }
    }
    if (!type || !this.ghost) {
      this.ghostRing.setEnabled(false);
      return;
    }
    this.ghost.position.set(x, 0, z);
    const range = PLANTS[type].attack?.range ?? PLANTS[type].radius + 0.3;
    this.ghostRing.setEnabled(true);
    this.ghostRing.position.set(x, 0.04, z);
    this.ghostRing.scaling.setAll(range);
    this.ghostRing.material = valid ? this.ghostGood : this.ghostBad;
  }

  setSelected(plantId: number | null): void {
    const p = plantId === null ? undefined : this.game.plants.find((pl) => pl.id === plantId);
    this.selectRing.setEnabled(!!p);
    if (p) this.selectRing.position.set(p.x, 0.08, p.z);
  }

  setAim(on: boolean, x = 0, z = 0): void {
    this.aimRing.setEnabled(on);
    if (on) this.aimRing.position.set(x, 0.12, z);
  }

  showEdges(edges: EdgeId[]): void {
    for (const [edge, mesh] of Object.entries(this.world.edgeMarkers)) {
      mesh.setEnabled(edges.includes(edge as EdgeId));
    }
    const pulse = 0.5 + 0.4 * Math.sin(this.time * 4);
    for (const mesh of Object.values(this.world.edgeMarkers)) mesh.visibility = pulse;
  }
}
