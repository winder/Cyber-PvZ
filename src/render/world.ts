import {
  Color3, Color4, DirectionalLight, Engine, GlowLayer, HemisphericLight, Mesh, MeshBuilder,
  Scene, StandardMaterial, Vector3, VertexBuffer, VertexData,
} from '@babylonjs/core';
import { type EdgeId, type LevelDef } from '../data/config';
import { insideRect } from '../sim/arena';
import { arenaTexture } from './arenaFloor';
import { createConcert } from './concert';
import { buildCarWreck, createRuinedCity, type Decor } from './decor';
import { buildTombstones, createGraveyard, type Tombstones } from './graveyard';
import { createJungle } from './jungle';
import { streetTexture } from './streetTexture';
import { RAVINE_DEPTH, Terrain } from './terrain';
import { Materials } from './visuals';

export interface World {
  scene: Scene;
  mats: Materials;
  ground: Mesh;
  glow: GlowLayer;
  edgeMarkers: Record<EdgeId, Mesh>;
  terrain: Terrain;
  /** Animated scenery (lamps, tumbleweeds), if the level has any. */
  decor?: Decor;
  /** The graveyard's tombstones, which Tombstone Zombies rise out of. */
  tombstones?: Tombstones;
  /**
   * Scale the theme's lights (1 = normal) and add a flash of white on top.
   * Cinematics and weather multiply their dimming together before calling this.
   */
  setLighting(scale: number, flash: number): void;
}

const SCORCH = new Color3(0.16, 0.12, 0.08);
const EARTH = new Color3(0.36, 0.27, 0.16);

/** Jungle floor: the base green, mottled with darker moss and patches of bare earth. */
function jungleFloor(base: Color3, x: number, z: number): Color3 {
  const moss = 0.5 + 0.5 * Math.sin(x * 0.45 + Math.sin(z * 0.3) * 2) * Math.cos(z * 0.38 - x * 0.12);
  const dirt = Math.max(0, Math.sin(x * 0.21 + 1.3) * Math.sin(z * 0.27 - 0.8) + 0.25 * Math.sin(x * 1.1 + z * 0.9) - 0.45) * 2.2;
  return Color3.Lerp(base.scale(0.75 + moss * 0.4), EARTH, Math.min(0.8, dirt));
}

export function createWorld(engine: Engine, level: LevelDef): World {
  const { map, theme } = level;
  const terrain = new Terrain(map);
  const hex = (c: string) => Color3.FromHexString(c);
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromColor3(hex(theme.sky), 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = theme.fogDensity;
  scene.fogColor = hex(theme.fog);
  scene.skipPointerMovePicking = true;

  const hemi = new HemisphericLight('sky', new Vector3(0.2, 1, -0.3), scene);
  hemi.intensity = theme.lightIntensity;
  hemi.diffuse = hex(theme.light);
  hemi.groundColor = hex(theme.bounce);
  const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, 0.4), scene);
  sun.intensity = theme.sunIntensity;
  sun.diffuse = hex(theme.sun);

  const glow = new GlowLayer('glow', scene, { blurKernelSize: 32 });
  glow.intensity = theme.glow;

  const mats = new Materials(scene);

  // The ground: a finely divided sheet bent into hills, with ravines carved
  // into it. Its cliff faces are part of the same surface.
  const ground = MeshBuilder.CreateGround('ground', {
    width: map.width,
    height: map.depth,
    subdivisionsX: map.width * 4,
    subdivisionsY: map.depth * 4,
    updatable: true,
  }, scene);
  const positions = ground.getVerticesData(VertexBuffer.PositionKind)!;
  const colors: number[] = [];
  // A painted ground is lit as-is (white), and still darkens down in the ravines.
  const painted = theme.groundStyle === 'cityStreet' || theme.groundStyle === 'arenaFloor';
  const top = painted ? Color3.White() : hex(theme.ground), deep = hex(theme.ravine);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], z = positions[i + 2];
    const y = terrain.terrainHeight(x, z);
    positions[i + 1] = y;
    // Darker the further down into a ravine it goes.
    const t = Math.pow(Math.min(1, Math.max(0, (terrain.surfaceHeight(x, z) - y) / RAVINE_DEPTH)), 0.6);
    // Patches of moss and bare earth on a jungle floor; crater floors are scorched.
    const floor = theme.groundStyle === 'jungleFloor' ? jungleFloor(top, x, z) : top;
    const c = Color3.Lerp(Color3.Lerp(floor, SCORCH, terrain.scorch(x, z) * 0.8), deep, t);
    colors.push(c.r, c.g, c.b, 1);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, ground.getIndices()!, normals);
  ground.updateVerticesData(VertexBuffer.PositionKind, positions);
  ground.updateVerticesData(VertexBuffer.NormalKind, normals);
  ground.setVerticesData(VertexBuffer.ColorKind, colors);
  ground.refreshBoundingInfo();
  const earth = new StandardMaterial('terrain', scene);
  earth.diffuseColor = Color3.White(); // vertex colors do the shading
  earth.specularColor = new Color3(0.04, 0.04, 0.05);
  earth.emissiveColor = painted ? new Color3(0.05, 0.035, 0.025) : top.scale(0.12);
  if (painted) {
    earth.diffuseTexture = theme.groundStyle === 'arenaFloor' ? arenaTexture(scene, map) : streetTexture(scene, map);
    // Texture covers the whole map: u runs west→east, v south→north.
    const uv = ground.getVerticesData(VertexBuffer.UVKind)!;
    for (let i = 0, v = 0; i < positions.length; i += 3, v += 2) {
      uv[v] = (positions[i] + map.width / 2) / map.width;
      uv[v + 1] = (positions[i + 2] + map.depth / 2) / map.depth;
    }
    ground.setVerticesData(VertexBuffer.UVKind, uv);
  }
  ground.material = earth;
  ground.isPickable = false;

  const hw = map.width / 2, hd = map.depth / 2;
  /** Points along a straight line on the ground, following the hills. */
  const onGround = (x0: number, z0: number, x1: number, z1: number, lift: number) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5));
    const pts: Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      pts.push(new Vector3(x, terrain.surfaceHeight(x, z) + lift, z));
    }
    return pts;
  };

  // Glowing border around the playable area (an arena's runs round its floor).
  const fan = map.fan;
  const outline = fan ? fanOutline(level, onGround) : [
    ...onGround(-hw, -hd, hw, -hd, 0.03), ...onGround(hw, -hd, hw, hd, 0.03),
    ...onGround(hw, hd, -hw, hd, 0.03), ...onGround(-hw, hd, -hw, -hd, 0.03),
  ];
  const border = MeshBuilder.CreateLines('border', { points: outline }, scene);
  border.color = hex(theme.border);

  // Tombstones are drawn all together (thin instances); landmarks like the
  // gazebo are drawn by the decor.
  const tombstones = theme.rocks === 'tombstone' ? buildTombstones(scene, map.rocks, terrain) : undefined;
  for (const [i, r] of map.rocks.entries()) {
    // Ship wrecks are drawn by the jungle decor.
    if (r.look || tombstones || theme.rocks === 'shipWreck') continue;
    if (theme.rocks === 'carWreck') {
      // Burnt-out car husks instead of boulders, sat a little into the dirt.
      const car = buildCarWreck(scene, `wreck${i}`, r.r, 100 + i);
      car.position.set(r.x, terrain.surfaceHeight(r.x, r.z) - 0.1, r.z);
      car.rotation.set((i % 2 ? 0.05 : -0.04), i * 2.1 + 0.6, (i % 3 ? 0.06 : -0.08));
      continue;
    }
    const rock = MeshBuilder.CreatePolyhedron(`rock${i}`, { type: (i % 3) + 1, size: r.r * 0.8 }, scene);
    rock.position.set(r.x, terrain.surfaceHeight(r.x, r.z) + r.r * 0.35, r.z);
    rock.scaling.y = 0.75;
    rock.rotation.y = i * 1.7;
    rock.material = mats.dark(theme.rock);
    rock.enableEdgesRendering();
    rock.edgesWidth = 3;
    rock.edgesColor = Color4.FromColor3(hex(theme.rockEdge), 1);
    rock.isPickable = false;
  }

  // Red danger lines along edges where the next wave comes from.
  const danger = new StandardMaterial('danger', scene);
  danger.emissiveColor = new Color3(1, 0.1, 0.2);
  danger.diffuseColor = Color3.Black();
  danger.alpha = 0.8;
  const edgeMarkers = {} as Record<EdgeId, Mesh>;
  for (const edge of Object.keys(map.edges) as EdgeId[]) {
    const { from, to } = map.edges[edge];
    const inset = 0.4;
    // In an arena, zombies come out of a tunnel: ring its mouth instead.
    const tunnel = fan && (map.tunnels ?? []).find((t) => {
      const mid = (from + to) / 2;
      const x = edge === 'east' ? hw - 0.5 : edge === 'west' ? -hw + 0.5 : mid;
      const z = edge === 'north' ? hd - 0.5 : edge === 'south' ? -hd + 0.5 : mid;
      return insideRect(t, x, z);
    });
    if (fan && !tunnel) {
      edgeMarkers[edge] = new Mesh(`edge-${edge}`, scene);
      continue;
    }
    const path = tunnel ? [
      ...onGround(tunnel.x - tunnel.w / 2, tunnel.z - tunnel.d / 2, tunnel.x + tunnel.w / 2, tunnel.z - tunnel.d / 2, 0.15),
      ...onGround(tunnel.x + tunnel.w / 2, tunnel.z - tunnel.d / 2, tunnel.x + tunnel.w / 2, tunnel.z + tunnel.d / 2, 0.15),
      ...onGround(tunnel.x + tunnel.w / 2, tunnel.z + tunnel.d / 2, tunnel.x - tunnel.w / 2, tunnel.z + tunnel.d / 2, 0.15),
      ...onGround(tunnel.x - tunnel.w / 2, tunnel.z + tunnel.d / 2, tunnel.x - tunnel.w / 2, tunnel.z - tunnel.d / 2, 0.15),
    ].map((p) => new Vector3(Math.max(-hw + inset, Math.min(hw - inset, p.x)), p.y, Math.max(-hd + inset, Math.min(hd - inset, p.z))))
    :
      edge === 'east' ? onGround(hw - inset, from, hw - inset, to, 0.15)
      : edge === 'west' ? onGround(-hw + inset, from, -hw + inset, to, 0.15)
      : edge === 'north' ? onGround(from, hd - inset, to, hd - inset, 0.15)
      : onGround(from, -hd + inset, to, -hd + inset, 0.15);
    const strip = MeshBuilder.CreateTube(`edge-${edge}`, { path, radius: 0.25, tessellation: 8 }, scene);
    strip.material = danger;
    strip.isPickable = false;
    strip.setEnabled(false);
    edgeMarkers[edge] = strip;
  }

  const decor = theme.decor === 'ruinedCity' ? createRuinedCity(scene, map, terrain, glow, hex(theme.ground))
    : theme.decor === 'graveyard' ? createGraveyard(scene, map, terrain, glow, hex(theme.ground), hex(theme.fog), tombstones)
    : theme.decor === 'jungle' ? createJungle(scene, map, terrain, hex(theme.ground))
    : theme.decor === 'concert' ? createConcert(scene, map, terrain, glow, mats)
    : undefined;

  const setLighting = (scale: number, flash: number) => {
    hemi.intensity = theme.lightIntensity * scale + flash * 2.5;
    sun.intensity = theme.sunIntensity * scale + flash;
    hemi.diffuse = Color3.Lerp(hex(theme.light), new Color3(0.8, 0.85, 1), Math.min(1, flash));
  };

  return { scene, mats, ground, glow, edgeMarkers, terrain, decor, tombstones, setLighting };
}

/**
 * Round the edge of an arena's floor: from the map's west edge up one side
 * of the fan, round the back, and down the other side.
 */
function fanOutline(level: LevelDef, onGround: (x0: number, z0: number, x1: number, z1: number, lift: number) => Vector3[]): Vector3[] {
  const f = level.map.fan!;
  const hw = level.map.width / 2;
  const point = (r: number, a: number) => [f.x + Math.cos(a) * r, f.z + Math.sin(a) * r] as const;
  // Where each side meets the map's west edge.
  const r0 = (-hw - f.x) / Math.cos(f.halfAngle);
  const [ax, az] = point(r0, f.halfAngle), [bx, bz] = point(f.radius, f.halfAngle);
  const pts = [...onGround(ax, az, bx, bz, 0.05)];
  for (let a = f.halfAngle; a >= -f.halfAngle; a -= 0.01) {
    const [x, z] = point(f.radius, a);
    pts.push(...onGround(x, z, x, z, 0.05).slice(0, 1));
  }
  const [cx, cz] = point(f.radius, -f.halfAngle), [dx, dz] = point(r0, -f.halfAngle);
  pts.push(...onGround(cx, cz, dx, dz, 0.05));
  return pts;
}
