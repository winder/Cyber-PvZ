import {
  Color3, Mesh, MeshBuilder, Scene, StandardMaterial, Texture, TransformNode,
} from '@babylonjs/core';
import {
  PLANTS, STRUCTURES, ZOMBIES, type PlantId, type StructureId, type ZombieId,
} from '../data/config';
import { skinUrl } from '../skins';
import {
  BlockTemplate, loadSkinTexture, skinMaterial, UNIT, type BlockCharacter,
} from './blockModel';
import { buildCurlyHair } from './hair';

/**
 * A thing drawn in the world. `root` is moved/rotated by the renderer.
 * `turret` (optional) is turned to aim. `height` is where the health bar goes.
 */
export interface Visual {
  root: TransformNode;
  turret?: TransformNode;
  height: number;
  /** Set for blocky skinned characters, so the renderer can animate them. */
  character?: BlockCharacter;
  /** Extra per-frame animation (e.g. bouncing hair). */
  update?(time: number, moving: boolean): void;
}

/** Shared neon materials, one per color+style. */
export class Materials {
  private cache = new Map<string, StandardMaterial>();
  constructor(private scene: Scene) {}

  /** Glowing neon surface. */
  neon(hex: string, glow = 0.7, alpha = 1): StandardMaterial {
    const key = `n${hex}${glow}${alpha}`;
    let m = this.cache.get(key);
    if (!m) {
      const c = Color3.FromHexString(hex);
      m = new StandardMaterial(key, this.scene);
      m.diffuseColor = c.scale(0.35);
      m.emissiveColor = c.scale(glow);
      m.specularColor = new Color3(0.2, 0.2, 0.2);
      m.alpha = alpha;
      this.cache.set(key, m);
    }
    return m;
  }

  /** Dark body with only a hint of color. */
  dark(hex: string): StandardMaterial {
    const key = `d${hex}`;
    let m = this.cache.get(key);
    if (!m) {
      const c = Color3.FromHexString(hex);
      m = new StandardMaterial(key, this.scene);
      m.diffuseColor = c.scale(0.25);
      m.emissiveColor = c.scale(0.08);
      m.specularColor = new Color3(0.1, 0.1, 0.1);
      this.cache.set(key, m);
    }
    return m;
  }

  /** A drawing on a flat card (for Wesley's art). */
  art(path: string): StandardMaterial {
    const key = `a${path}`;
    let m = this.cache.get(key);
    if (!m) {
      m = new StandardMaterial(key, this.scene);
      const tex = new Texture(path, this.scene);
      tex.hasAlpha = true;
      m.diffuseTexture = tex;
      m.emissiveColor = new Color3(0.6, 0.6, 0.6);
      m.useAlphaFromDiffuseTexture = true;
      m.backFaceCulling = false;
      this.cache.set(key, m);
    }
    return m;
  }
}

function part(mesh: Mesh, parent: TransformNode, x: number, y: number, z: number): Mesh {
  mesh.parent = parent;
  mesh.position.set(x, y, z);
  mesh.isPickable = false;
  return mesh;
}

/** A flat standee showing a drawing, always facing the camera. */
function standee(scene: Scene, mats: Materials, path: string, size: number, name: string): Visual {
  const root = new TransformNode(name, scene);
  const card = MeshBuilder.CreatePlane(`${name}-art`, { size }, scene);
  card.billboardMode = Mesh.BILLBOARDMODE_Y;
  card.material = mats.art(path);
  part(card, root, 0, size / 2, 0);
  return { root, height: size };
}

// ----------------------------------------------------------------------------
//  Plants
// ----------------------------------------------------------------------------

type Factory = (scene: Scene, mats: Materials, name: string) => Visual;

function stem(scene: Scene, mats: Materials, root: TransformNode, name: string, h: number): void {
  const s = MeshBuilder.CreateCylinder(`${name}-stem`, { height: h, diameter: 0.15, tessellation: 6 }, scene);
  s.material = mats.neon('#2fbf4a', 0.4);
  part(s, root, 0, h / 2, 0);
  const pot = MeshBuilder.CreateCylinder(`${name}-pot`, { height: 0.3, diameterTop: 0.9, diameterBottom: 0.7, tessellation: 8 }, scene);
  pot.material = mats.dark('#7a8cff');
  part(pot, root, 0, 0.15, 0);
}

const plantFactories: Record<PlantId, Factory> = {
  solarFlower(scene, mats, name) {
    const root = new TransformNode(name, scene);
    stem(scene, mats, root, name, 0.9);
    const head = new TransformNode(`${name}-head`, scene);
    head.parent = root;
    head.position.y = 1.1;
    head.rotation.x = -0.5;
    const disc = MeshBuilder.CreateCylinder(`${name}-face`, { height: 0.12, diameter: 0.55, tessellation: 16 }, scene);
    disc.material = mats.neon('#ff9a1f', 0.8);
    part(disc, head, 0, 0, 0);
    const petals = MeshBuilder.CreateTorus(`${name}-petals`, { diameter: 0.85, thickness: 0.2, tessellation: 12 }, scene);
    petals.material = mats.neon(PLANTS.solarFlower.color, 1);
    part(petals, head, 0, 0, 0);
    return { root, turret: head, height: 1.6 };
  },

  laserPea(scene, mats, name) {
    const root = new TransformNode(name, scene);
    stem(scene, mats, root, name, 0.8);
    const head = new TransformNode(`${name}-head`, scene);
    head.parent = root;
    head.position.y = 1.0;
    const ball = MeshBuilder.CreateSphere(`${name}-ball`, { diameter: 0.6, segments: 8 }, scene);
    ball.material = mats.neon(PLANTS.laserPea.color, 0.6);
    part(ball, head, 0, 0, 0);
    const barrel = MeshBuilder.CreateCylinder(`${name}-barrel`, { height: 0.5, diameter: 0.2, tessellation: 8 }, scene);
    barrel.rotation.x = Math.PI / 2;
    barrel.material = mats.neon('#d6ff3c', 1);
    part(barrel, head, 0, 0.02, 0.4);
    const visor = MeshBuilder.CreateBox(`${name}-visor`, { width: 0.4, height: 0.08, depth: 0.1 }, scene);
    visor.material = mats.neon('#ff3c6e', 1);
    part(visor, head, 0, 0.13, 0.25);
    return { root, turret: head, height: 1.5 };
  },

  forceNut(scene, mats, name) {
    const root = new TransformNode(name, scene);
    const nut = MeshBuilder.CreateSphere(`${name}-nut`, { diameterX: 0.95, diameterY: 1.2, diameterZ: 0.85, segments: 8 }, scene);
    nut.material = mats.dark('#c08040');
    part(nut, root, 0, 0.6, 0);
    const field = MeshBuilder.CreateSphere(`${name}-field`, { diameterX: 1.35, diameterY: 1.6, diameterZ: 1.35, segments: 10 }, scene);
    field.material = mats.neon(PLANTS.forceNut.color, 0.8, 0.3);
    part(field, root, 0, 0.7, 0);
    const ring = MeshBuilder.CreateTorus(`${name}-ring`, { diameter: 1.3, thickness: 0.05, tessellation: 24 }, scene);
    ring.material = mats.neon(PLANTS.forceNut.color, 1.2);
    part(ring, root, 0, 0.7, 0);
    return { root, height: 1.6 };
  },

  cryoPea(scene, mats, name) {
    const root = new TransformNode(name, scene);
    stem(scene, mats, root, name, 0.8);
    const head = new TransformNode(`${name}-head`, scene);
    head.parent = root;
    head.position.y = 1.0;
    const ball = MeshBuilder.CreateIcoSphere(`${name}-ball`, { radius: 0.34, subdivisions: 1, flat: true }, scene);
    ball.material = mats.neon(PLANTS.cryoPea.color, 0.7);
    part(ball, head, 0, 0, 0);
    const barrel = MeshBuilder.CreateCylinder(`${name}-barrel`, { height: 0.45, diameterTop: 0.28, diameterBottom: 0.16, tessellation: 6 }, scene);
    barrel.rotation.x = Math.PI / 2;
    barrel.material = mats.neon('#e8fbff', 1);
    part(barrel, head, 0, 0, 0.4);
    for (let i = 0; i < 3; i++) {
      const spike = MeshBuilder.CreateCylinder(`${name}-ice${i}`, { height: 0.35, diameterTop: 0, diameterBottom: 0.12, tessellation: 4 }, scene);
      spike.material = mats.neon('#ffffff', 0.9);
      spike.rotation.z = (i - 1) * 0.5;
      part(spike, head, (i - 1) * 0.15, 0.38, -0.05);
    }
    return { root, turret: head, height: 1.5 };
  },
};

// ----------------------------------------------------------------------------
//  Zombies
// ----------------------------------------------------------------------------

function zombieBody(scene: Scene, mats: Materials, root: TransformNode, name: string, color: string, scale: number): void {
  const legs = MeshBuilder.CreateBox(`${name}-legs`, { width: 0.4 * scale, height: 0.5 * scale, depth: 0.25 * scale }, scene);
  legs.material = mats.dark('#445566');
  part(legs, root, 0, 0.25 * scale, 0);
  const body = MeshBuilder.CreateBox(`${name}-body`, { width: 0.55 * scale, height: 0.6 * scale, depth: 0.35 * scale }, scene);
  body.material = mats.neon(color, 0.35);
  part(body, root, 0, 0.8 * scale, 0);
  const head = MeshBuilder.CreateBox(`${name}-head`, { size: 0.38 * scale }, scene);
  head.material = mats.neon(color, 0.45);
  part(head, root, 0, 1.3 * scale, 0.05 * scale);
  const eye = MeshBuilder.CreateBox(`${name}-eye`, { width: 0.28 * scale, height: 0.07 * scale, depth: 0.05 }, scene);
  eye.material = mats.neon('#ff2040', 1.5);
  part(eye, root, 0, 1.35 * scale, 0.25 * scale);
  for (const side of [-1, 1]) {
    const arm = MeshBuilder.CreateBox(`${name}-arm${side}`, { width: 0.12 * scale, height: 0.12 * scale, depth: 0.55 * scale }, scene);
    arm.material = mats.neon(color, 0.3);
    part(arm, root, side * 0.34 * scale, 0.95 * scale, 0.25 * scale);
  }
}

const zombieFactories: Partial<Record<ZombieId, Factory>> = {
  cyborg(scene, mats, name) {
    const root = new TransformNode(name, scene);
    zombieBody(scene, mats, root, name, ZOMBIES.cyborg.color, 1);
    return { root, height: 1.6 };
  },

  riotBot(scene, mats, name) {
    const root = new TransformNode(name, scene);
    zombieBody(scene, mats, root, name, '#8899aa', 1.2);
    const shield = MeshBuilder.CreateBox(`${name}-shield`, { width: 0.9, height: 1.1, depth: 0.06 }, scene);
    shield.material = mats.neon(ZOMBIES.riotBot.color, 0.9, 0.6);
    part(shield, root, 0, 0.8, 0.6);
    return { root, height: 1.9 };
  },

  jetpack(scene, mats, name) {
    const root = new TransformNode(name, scene);
    zombieBody(scene, mats, root, name, '#9fbf7a', 0.9);
    const pack = MeshBuilder.CreateBox(`${name}-pack`, { width: 0.45, height: 0.55, depth: 0.25 }, scene);
    pack.material = mats.dark('#aaaaaa');
    part(pack, root, 0, 0.8, -0.3);
    for (const side of [-1, 1]) {
      const flame = MeshBuilder.CreateCylinder(`${name}-flame${side}`, { height: 0.6, diameterTop: 0.18, diameterBottom: 0, tessellation: 6 }, scene);
      flame.material = mats.neon(ZOMBIES.jetpack.color, 1.6);
      part(flame, root, side * 0.13, 0.25, -0.32);
    }
    return { root, height: 1.6 };
  },
};

// ----------------------------------------------------------------------------
//  Structures
// ----------------------------------------------------------------------------

const structureFactories: Record<StructureId, Factory> = {
  greenhouse(scene, mats, name) {
    const root = new TransformNode(name, scene);
    const r = STRUCTURES.greenhouse.radius;
    const base = MeshBuilder.CreateCylinder(`${name}-base`, { height: 0.5, diameter: r * 2, tessellation: 24 }, scene);
    base.material = mats.dark('#5566aa');
    part(base, root, 0, 0.25, 0);
    // Full sphere; the bottom half is hidden under the ground.
    const dome = MeshBuilder.CreateSphere(`${name}-dome`, { diameterX: r * 1.9, diameterY: r * 2.2, diameterZ: r * 1.9, segments: 16 }, scene);
    dome.material = mats.neon('#3cff9e', 0.5, 0.25);
    part(dome, root, 0, 0.5, 0);
    const brain = MeshBuilder.CreateSphere(`${name}-brain`, { diameterX: 1.8, diameterY: 1.3, diameterZ: 1.5, segments: 12 }, scene);
    brain.material = mats.neon(STRUCTURES.greenhouse.color, 0.9);
    part(brain, root, 0, 1.4, 0);
    const ring = MeshBuilder.CreateTorus(`${name}-ring`, { diameter: r * 2, thickness: 0.1, tessellation: 32 }, scene);
    ring.material = mats.neon('#3cff9e', 1.2);
    part(ring, root, 0, 0.5, 0);
    return { root, height: 3.4 };
  },

  powerPlant(scene, mats, name) {
    const root = new TransformNode(name, scene);
    const base = MeshBuilder.CreateBox(`${name}-base`, { width: 3, height: 0.6, depth: 2.4 }, scene);
    base.material = mats.dark('#667788');
    part(base, root, 0, 0.3, 0);
    for (const [x, z] of [[-0.8, -0.5], [0.8, 0.5]]) {
      const tower = MeshBuilder.CreateCylinder(`${name}-tower`, { height: 2.6, diameterTop: 0.7, diameterBottom: 1.1, tessellation: 12 }, scene);
      tower.material = mats.dark('#99aabb');
      part(tower, root, x, 1.6, z);
      const core = MeshBuilder.CreateTorus(`${name}-core`, { diameter: 0.75, thickness: 0.12, tessellation: 16 }, scene);
      core.material = mats.neon(STRUCTURES.powerPlant.color, 1.4);
      part(core, root, x, 2.9, z);
    }
    return { root, height: 3.4 };
  },

  spaceship(scene, mats, name) {
    const root = new TransformNode(name, scene);
    const hull = MeshBuilder.CreateCylinder(`${name}-hull`, { height: 3.6, diameterTop: 0, diameterBottom: 1.4, tessellation: 8 }, scene);
    hull.rotation.x = Math.PI / 2;
    hull.material = mats.dark('#ccccdd');
    part(hull, root, 0, 1.2, 0.2);
    const wings = MeshBuilder.CreateBox(`${name}-wings`, { width: 3.6, height: 0.12, depth: 1.2 }, scene);
    wings.material = mats.neon(STRUCTURES.spaceship.color, 0.5);
    part(wings, root, 0, 1, -0.6);
    for (const x of [-0.5, 0.5]) {
      const engine = MeshBuilder.CreateCylinder(`${name}-engine`, { height: 0.5, diameter: 0.45, tessellation: 10 }, scene);
      engine.rotation.x = Math.PI / 2;
      engine.material = mats.neon('#4de1ff', 1.5);
      part(engine, root, x, 1.1, -1.7);
    }
    for (const x of [-1, 1]) {
      const leg = MeshBuilder.CreateCylinder(`${name}-leg`, { height: 1, diameter: 0.12 }, scene);
      leg.material = mats.dark('#888899');
      part(leg, root, x, 0.5, -0.5);
    }
    return { root, height: 2.6 };
  },
};

// ----------------------------------------------------------------------------
//  Public: the renderer only calls these.
// ----------------------------------------------------------------------------

export function createPlantVisual(scene: Scene, mats: Materials, type: PlantId, name: string): Visual {
  const art = PLANTS[type].art;
  if (art) return standee(scene, mats, art, 1.6, name);
  return plantFactories[type](scene, mats, name);
}

export function createZombieVisual(scene: Scene, mats: Materials, type: ZombieId, name: string): Visual {
  const def = ZOMBIES[type];
  if (def.art) return standee(scene, mats, def.art, 1.8, name);
  if (def.model) return skinnedZombie(scene, mats, type, name);
  return (zombieFactories[type] ?? zombieFactories.cyborg!)(scene, mats, name);
}

const templates = new WeakMap<Scene, Map<ZombieId, BlockTemplate>>();
const hairTemplates = new WeakMap<Scene, Mesh>();

function hairTemplate(scene: Scene): Mesh {
  let hair = hairTemplates.get(scene);
  if (!hair) {
    hair = buildCurlyHair(scene, 'tpl-hair');
    hair.setEnabled(false);
    scene.getGlowLayerByName('glow')?.addExcludedMesh(hair);
    hairTemplates.set(scene, hair);
  }
  return hair;
}

function zombieTemplate(scene: Scene, type: ZombieId): BlockTemplate {
  let byType = templates.get(scene);
  if (!byType) {
    byType = new Map();
    templates.set(scene, byType);
  }
  let t = byType.get(type);
  if (!t) {
    const def = ZOMBIES[type];
    const tex = loadSkinTexture(skinUrl(type, def.skin ?? ''), scene);
    t = new BlockTemplate(scene, def.model!, skinMaterial(`skin-${type}`, tex, scene), `tpl-${type}`);
    // Skins shouldn't bloom like the neon parts do.
    const glow = scene.getGlowLayerByName('glow');
    for (const p of t.parts) glow?.addExcludedMesh(p.mesh);
    byType.set(type, t);
  }
  return t;
}

function skinnedZombie(scene: Scene, mats: Materials, type: ZombieId, name: string): Visual {
  const character = zombieTemplate(scene, type).spawn(name, scene);
  const pack = character.joints.jetpack;
  if (pack) {
    // Neon flames out of the nozzle.
    for (const side of [-1, 1]) {
      const flame = MeshBuilder.CreateCylinder(`${name}-flame${side}`, { height: 0.5, diameterTop: 0.14, diameterBottom: 0, tessellation: 6 }, scene);
      flame.material = mats.neon('#ff8a3d', 1.6);
      part(flame, pack, side * 0.06, -0.55, -1.5 * UNIT);
    }
  }
  const def = ZOMBIES[type];
  const scale = def.scale ?? 1;
  character.root.scaling.setAll(scale);
  let update: Visual['update'];
  if (def.hair && character.joints.head) {
    const hair = hairTemplate(scene).createInstance(`${name}-hair`);
    hair.isPickable = false;
    hair.parent = character.joints.head;
    update = (time, moving) => {
      // Springy curls: a little bounce and sway.
      const bounce = moving ? Math.abs(Math.sin(time * 3.5)) : 0.3 + 0.3 * Math.sin(time * 1.5);
      hair.scaling.y = 1 - bounce * 0.025;
      hair.rotation.z = Math.sin(time * 1.8) * 0.03;
      hair.rotation.x = moving ? -0.03 : 0;
    };
  }
  return { root: character.root, height: 1.7, character, update };
}

export function createStructureVisual(scene: Scene, mats: Materials, type: StructureId, name: string): Visual {
  const art = STRUCTURES[type].art;
  if (art) return standee(scene, mats, art, STRUCTURES[type].radius * 2, name);
  return structureFactories[type](scene, mats, name);
}
