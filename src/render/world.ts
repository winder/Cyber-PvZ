import {
  Color3, Color4, DirectionalLight, Engine, GlowLayer, HemisphericLight, Mesh, MeshBuilder,
  Scene, StandardMaterial, Vector3, VertexBuffer, VertexData,
} from '@babylonjs/core';
import { GradientMaterial } from '@babylonjs/materials/gradient/gradientMaterial';
import { GridMaterial } from '@babylonjs/materials/grid/gridMaterial';
import { MAP, type EdgeId } from '../data/config';
import { RAVINE_DEPTH, surfaceHeight, terrainHeight } from './terrain';
import { Materials } from './visuals';

export interface World {
  scene: Scene;
  mats: Materials;
  ground: Mesh;
  glow: GlowLayer;
  edgeMarkers: Record<EdgeId, Mesh>;
}

export function createWorld(engine: Engine): World {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.02, 0.07, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.006;
  scene.fogColor = new Color3(0.02, 0.02, 0.07);
  scene.skipPointerMovePicking = true;

  const hemi = new HemisphericLight('sky', new Vector3(0.2, 1, -0.3), scene);
  hemi.intensity = 0.7;
  hemi.groundColor = new Color3(0.1, 0.05, 0.2);
  const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, 0.4), scene);
  sun.intensity = 0.5;

  const glow = new GlowLayer('glow', scene, { blurKernelSize: 32 });
  glow.intensity = 0.7;

  const mats = new Materials(scene);

  // The ground: a finely divided sheet bent into hills, with ravines cut into it.
  // Vertices land exactly on ravine edges, so the walls drop straight down.
  const ground = MeshBuilder.CreateGround('ground', {
    width: MAP.width,
    height: MAP.depth,
    subdivisionsX: MAP.width * 4,
    subdivisionsY: MAP.depth * 4,
    updatable: true,
  }, scene);
  const positions = ground.getVerticesData(VertexBuffer.PositionKind)!;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i + 1] = terrainHeight(positions[i], positions[i + 2]);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, ground.getIndices()!, normals);
  ground.updateVerticesData(VertexBuffer.PositionKind, positions);
  ground.updateVerticesData(VertexBuffer.NormalKind, normals);
  ground.refreshBoundingInfo();

  // Neon grid in 3D: on hills and ravine walls its height lines read like contours.
  const grid = new GridMaterial('grid', scene);
  grid.mainColor = new Color3(0.03, 0.04, 0.1);
  grid.lineColor = new Color3(0.1, 0.5, 0.7);
  grid.gridRatio = 1;
  grid.majorUnitFrequency = 6;
  grid.minorUnitVisibility = 0.25;
  grid.opacity = 0.99;
  ground.material = grid;
  ground.isPickable = false;

  const hw = MAP.width / 2, hd = MAP.depth / 2;
  /** Points along a straight line on the ground, following the hills. */
  const onGround = (x0: number, z0: number, x1: number, z1: number, lift: number) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5));
    const pts: Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      pts.push(new Vector3(x, surfaceHeight(x, z) + lift, z));
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
  border.color = new Color3(0.3, 0.9, 1);

  for (const [i, r] of MAP.rocks.entries()) {
    const rock = MeshBuilder.CreatePolyhedron(`rock${i}`, { type: (i % 3) + 1, size: r.r * 0.8 }, scene);
    rock.position.set(r.x, surfaceHeight(r.x, r.z) + r.r * 0.35, r.z);
    rock.scaling.y = 0.75;
    rock.rotation.y = i * 1.7;
    rock.material = mats.dark('#8a6cff');
    rock.enableEdgesRendering();
    rock.edgesWidth = 3;
    rock.edgesColor = new Color4(0.6, 0.4, 1, 1);
    rock.isPickable = false;
  }

  // Ravines: lined with walls that glow faintly at the rim and fade to black
  // at the bottom, so you can see how deep they go. Plus a glowing rim.
  const depthMat = new GradientMaterial('ravineDepth', scene);
  depthMat.topColor = new Color3(0.08, 0.35, 0.5);
  depthMat.bottomColor = new Color3(0, 0, 0.01);
  depthMat.scale = 1 / RAVINE_DEPTH; // y = 0 → top color, y = -depth → bottom color
  depthMat.offset = 1;
  depthMat.smoothness = 1.4;
  depthMat.disableLighting = true;
  depthMat.backFaceCulling = false;
  for (const [i, r] of MAP.ravines.entries()) {
    // Just inside the terrain's own (one-step) wall, so these cover it.
    const e = 0.27;
    const x0 = r.x - r.w / 2 + e, x1 = r.x + r.w / 2 - e, z0 = r.z - r.d / 2 + e, z1 = r.z + r.d / 2 - e;
    const ring = [
      ...onGround(x0, z0, x1, z0, 0), ...onGround(x1, z0, x1, z1, 0),
      ...onGround(x1, z1, x0, z1, 0), ...onGround(x0, z1, x0, z0, 0),
    ];
    const bottom = -RAVINE_DEPTH + 0.05;
    const positions: number[] = [];
    const indices: number[] = [];
    for (const pt of ring) positions.push(pt.x, pt.y, pt.z, pt.x, bottom, pt.z);
    for (let k = 0; k < ring.length - 1; k++) {
      const a = k * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    // Floor.
    const f = positions.length / 3;
    positions.push(x0, bottom, z0, x1, bottom, z0, x1, bottom, z1, x0, bottom, z1);
    indices.push(f, f + 1, f + 2, f, f + 2, f + 3);
    const walls = new Mesh(`ravineWalls${i}`, scene);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.applyToMesh(walls);
    walls.material = depthMat;
    walls.isPickable = false;
  }

  for (const [i, r] of MAP.ravines.entries()) {
    const x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, z0 = r.z - r.d / 2, z1 = r.z + r.d / 2;
    const rim = MeshBuilder.CreateLines(`ravine${i}`, {
      points: [
        ...onGround(x0, z0, x1, z0, 0.05), ...onGround(x1, z0, x1, z1, 0.05),
        ...onGround(x1, z1, x0, z1, 0.05), ...onGround(x0, z1, x0, z0, 0.05),
      ],
    }, scene);
    rim.color = new Color3(0.35, 0.95, 1);
    rim.isPickable = false;
  }

  // Red danger lines along edges where the next wave comes from.
  const danger = new StandardMaterial('danger', scene);
  danger.emissiveColor = new Color3(1, 0.1, 0.2);
  danger.diffuseColor = Color3.Black();
  danger.alpha = 0.8;
  const edgeMarkers = {} as Record<EdgeId, Mesh>;
  for (const edge of Object.keys(MAP.edges) as EdgeId[]) {
    const { from, to } = MAP.edges[edge];
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

  return { scene, mats, ground, glow, edgeMarkers };
}
