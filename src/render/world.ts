import {
  Color3, Color4, DirectionalLight, Engine, GlowLayer, HemisphericLight, Mesh, MeshBuilder,
  Scene, StandardMaterial, Vector3,
} from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials/grid/gridMaterial';
import { MAP, type EdgeId } from '../data/config';
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

  const ground = MeshBuilder.CreateGround('ground', { width: MAP.width, height: MAP.depth }, scene);
  const grid = new GridMaterial('grid', scene);
  grid.mainColor = new Color3(0.03, 0.04, 0.1);
  grid.lineColor = new Color3(0.1, 0.5, 0.7);
  grid.gridRatio = 1;
  grid.majorUnitFrequency = 6;
  grid.minorUnitVisibility = 0.25;
  grid.opacity = 0.99;
  ground.material = grid;
  ground.isPickable = false;

  // Glowing border around the playable area.
  const hw = MAP.width / 2, hd = MAP.depth / 2;
  const border = MeshBuilder.CreateLines('border', {
    points: [
      new Vector3(-hw, 0.02, -hd), new Vector3(hw, 0.02, -hd), new Vector3(hw, 0.02, hd),
      new Vector3(-hw, 0.02, hd), new Vector3(-hw, 0.02, -hd),
    ],
  }, scene);
  border.color = new Color3(0.3, 0.9, 1);

  for (const [i, r] of MAP.rocks.entries()) {
    const rock = MeshBuilder.CreatePolyhedron(`rock${i}`, { type: (i % 3) + 1, size: r.r * 0.8 }, scene);
    rock.position.set(r.x, r.r * 0.45, r.z);
    rock.scaling.y = 0.75;
    rock.rotation.y = i * 1.7;
    rock.material = mats.dark('#8a6cff');
    rock.enableEdgesRendering();
    rock.edgesWidth = 3;
    rock.edgesColor = new Color4(0.6, 0.4, 1, 1);
    rock.isPickable = false;
  }

  for (const [i, c] of MAP.cliffs.entries()) {
    const cliff = MeshBuilder.CreateBox(`cliff${i}`, { width: c.w, height: 2.4, depth: c.d }, scene);
    cliff.position.set(c.x, 1.2, c.z);
    cliff.material = mats.dark('#4a5a8a');
    cliff.enableEdgesRendering();
    cliff.edgesWidth = 4;
    cliff.edgesColor = new Color4(0.3, 0.8, 1, 1);
    cliff.isPickable = false;
  }

  // Red danger strips along edges where the next wave comes from.
  const danger = new StandardMaterial('danger', scene);
  danger.emissiveColor = new Color3(1, 0.1, 0.2);
  danger.diffuseColor = Color3.Black();
  danger.alpha = 0.7;
  const edgeMarkers = {} as Record<EdgeId, Mesh>;
  for (const edge of Object.keys(MAP.edges) as EdgeId[]) {
    const { from, to } = MAP.edges[edge];
    const len = to - from, mid = (from + to) / 2;
    const horizontal = edge === 'north' || edge === 'south';
    const strip = MeshBuilder.CreateBox(`edge-${edge}`, {
      width: horizontal ? len : 0.6, height: 0.1, depth: horizontal ? 0.6 : len,
    }, scene);
    if (edge === 'east') strip.position.set(hw - 0.3, 0.05, mid);
    if (edge === 'west') strip.position.set(-hw + 0.3, 0.05, mid);
    if (edge === 'north') strip.position.set(mid, 0.05, hd - 0.3);
    if (edge === 'south') strip.position.set(mid, 0.05, -hd + 0.3);
    strip.material = danger;
    strip.isPickable = false;
    strip.setEnabled(false);
    edgeMarkers[edge] = strip;
  }

  return { scene, mats, ground, glow, edgeMarkers };
}
