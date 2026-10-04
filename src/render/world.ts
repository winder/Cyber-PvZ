import {
  Color3, Color4, DirectionalLight, Engine, GlowLayer, HemisphericLight, Mesh, MeshBuilder,
  Scene, StandardMaterial, Vector3, VertexBuffer, VertexData,
} from '@babylonjs/core';
import { type EdgeId, type LevelDef } from '../data/config';
import { RAVINE_DEPTH, Terrain } from './terrain';
import { Materials } from './visuals';

export interface World {
  scene: Scene;
  mats: Materials;
  ground: Mesh;
  glow: GlowLayer;
  edgeMarkers: Record<EdgeId, Mesh>;
  terrain: Terrain;
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
  const top = hex(theme.ground), deep = hex(theme.ravine);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], z = positions[i + 2];
    const y = terrain.terrainHeight(x, z);
    positions[i + 1] = y;
    // Darker the further down into a ravine it goes.
    const t = Math.pow(Math.min(1, Math.max(0, (terrain.surfaceHeight(x, z) - y) / RAVINE_DEPTH)), 0.6);
    const c = Color3.Lerp(top, deep, t);
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
  earth.emissiveColor = top.scale(0.12);
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

  // Glowing border around the playable area.
  const border = MeshBuilder.CreateLines('border', {
    points: [
      ...onGround(-hw, -hd, hw, -hd, 0.03), ...onGround(hw, -hd, hw, hd, 0.03),
      ...onGround(hw, hd, -hw, hd, 0.03), ...onGround(-hw, hd, -hw, -hd, 0.03),
    ],
  }, scene);
  border.color = hex(theme.border);

  for (const [i, r] of map.rocks.entries()) {
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
    const path =
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

  return { scene, mats, ground, glow, edgeMarkers, terrain };
}
