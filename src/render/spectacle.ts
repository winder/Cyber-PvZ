import {
  Color3, Color4, DynamicTexture, Mesh, MeshBuilder, ParticleSystem, StandardMaterial, Vector3,
} from '@babylonjs/core';
import { STRUCTURES, ZOMBIES, type LevelDef, type SoundId, type ZombieId } from '../data/config';
import type { Game, SimEvent } from '../sim/game';
import type { RtsCamera } from './camera';
import { softDot } from './decor';
import type { World } from './world';

// The big moments, staged: ZomWes's entrance, buildings coming down, and the
// slow-motion finishing blow. All for looks. A cinematic only holds the
// battle still (like the pause button); it never changes the rules.

export interface SpectacleHooks {
  sound(id: SoundId): void;
  /** The boss's name card. */
  card(title: string, subtitle: string, note: string): void;
  clearCard(): void;
  banner(title: string, subtitle: string): void;
  clearBanner(): void;
  /** The victory finale is over: show the win screen. */
  finished(): void;
}

interface Cue { at: number; run: () => void }

/** Seconds between buildings coming down from Giant stomps, so the street lasts. */
const CRUMBLE_COOLDOWN = 3;
/** How far a stomp reaches to bring down a building. */
const STOMP_REACH = 13;
const CONFETTI_COLORS = ['#ff5fd2', '#ffe14d', '#3cff6e', '#4de6ff'];

export class Spectacle {
  /** True while a cinematic holds the battle still. */
  holdSim = false;
  /** How fast the scene plays (slow motion below 1). */
  timeScale = 1;
  /** How bright the lights are (1 = normal). */
  light = 1;

  private lightTarget = 1;
  private clock = 0;
  private cues: Cue[] = [];
  /** Puts things back if the player taps to skip a cinematic. */
  private onSkip: (() => void) | null = null;
  private time = 0;
  private lastCrumble = -Infinity;
  private shadow: Mesh;
  private sweep: { from: Vector3; to: Vector3; t: number; dur: number } | null = null;

  constructor(
    private world: World,
    private camera: RtsCamera,
    private game: Game,
    private level: LevelDef,
    private hooks: SpectacleHooks,
  ) {
    const { scene } = world;
    // A huge soft shadow, as if something enormous passed overhead.
    this.shadow = MeshBuilder.CreateDisc('giantShadow', { radius: 1, tessellation: 48 }, scene);
    this.shadow.rotation.x = Math.PI / 2;
    this.shadow.isPickable = false;
    this.shadow.setEnabled(false);
    const m = new StandardMaterial('giantShadow', scene);
    m.diffuseColor = m.specularColor = m.emissiveColor = Color3.Black();
    m.disableLighting = true;
    m.opacityTexture = softDot(scene, 'giantShadowTex');
    m.alpha = 0;
    this.shadow.material = m;
    world.glow.addExcludedMesh(this.shadow);
  }

  handle(events: SimEvent[]): void {
    for (const e of events) {
      switch (e.t) {
        case 'bossSpawn': this.bossEntrance(e.type); break;
        case 'stomp':
          this.camera.shake(0.25);
          if (this.time - this.lastCrumble > CRUMBLE_COOLDOWN && this.crumble(e.x, e.z, STOMP_REACH)) {
            this.lastCrumble = this.time;
          }
          break;
        case 'strikeHit':
          this.camera.shake(0.35);
          this.crumble(e.x, e.z, e.radius + 1.5);
          break;
        case 'structureDestroyed': this.camera.shake(0.5); break;
        case 'zombieDied':
          if (ZOMBIES[e.type].boss) this.camera.shake(0.8);
          break;
        case 'won': {
          // Zoom in on whoever fell last.
          const last = events.filter((x) => x.t === 'zombieDied').pop();
          const home = this.game.structures[0];
          this.finale(last?.t === 'zombieDied' ? last : home);
          break;
        }
        case 'jumped': this.reset(); break;
        default: break;
      }
    }
  }

  /** Tap to skip a cinematic that holds the battle. True if there was one. */
  skip(): boolean {
    if (!this.onSkip) return false;
    const undo = this.onSkip;
    this.onSkip = null;
    this.cues = [];
    undo();
    return true;
  }

  /** Drop whatever is playing and hand everything back (debug wave jumps). */
  private reset(): void {
    if (this.skip()) return;
    this.cues = [];
    this.timeScale = 1;
    this.lightTarget = 1;
    this.hooks.clearBanner();
    this.camera.release(4);
  }

  /** Called every frame with real (unscaled) seconds. */
  update(dt: number): void {
    this.time += dt;
    this.clock += dt;
    while (this.cues.length && this.cues[0].at <= this.clock) this.cues.shift()!.run();
    this.light += (this.lightTarget - this.light) * Math.min(1, dt * 4);

    if (this.sweep) {
      const s = this.sweep;
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      this.shadow.position.copyFrom(Vector3.Lerp(s.from, s.to, k));
      (this.shadow.material as StandardMaterial).alpha = 0.75 * Math.sin(k * Math.PI);
      if (k >= 1) {
        this.sweep = null;
        this.shadow.setEnabled(false);
      }
    }
  }

  // --------------------------------------------------------------------------

  private play(cues: Cue[], onSkip: (() => void) | null): void {
    this.clock = 0;
    this.cues = cues.sort((a, b) => a.at - b.at);
    this.onSkip = onSkip;
  }

  private crumble(x: number, z: number, reach: number): boolean {
    if (!this.world.decor?.crumble(x, z, reach)) return false;
    this.hooks.sound('crumble');
    this.camera.shake(0.6);
    return true;
  }

  /**
   * ZomWes arrives: the ground rumbles, the lights die, a vast shadow slides
   * over the player's base, then the camera swoops to the boss for its name card.
   */
  private bossEntrance(type: ZombieId): void {
    const boss = this.game.zombies.find((z) => z.type === type);
    if (!boss) return;
    const def = ZOMBIES[type];
    const decor = this.world.decor;
    const start = this.camera.current();

    const end = () => {
      this.hooks.clearCard();
      this.camera.release(2.5);
      this.lightTarget = 1;
      decor?.blackout(false);
    };
    this.holdSim = true;
    this.lightTarget = 0.3;
    decor?.blackout(true);
    this.camera.shake(0.5);
    this.shadowSweep(boss.x, boss.z, start.x, start.z);

    // Low and in front of it, looking up as it strides in toward the bases.
    const inward = Math.atan2(-boss.z, -boss.x);
    const shot = { x: boss.x, z: boss.z, radius: 50, beta: 1.25, alpha: inward + 0.35 };
    const guards = def.guards;
    this.play([
      { at: 0.6, run: () => this.camera.shake(0.6) },
      { at: 1.5, run: () => this.camera.fly(shot, 2.2) },
      {
        at: 2.8,
        run: () => {
          this.hooks.sound('bossIntro');
          this.camera.shake(1.2);
          this.hooks.card(
            def.name.toUpperCase(),
            `HAS ENTERED THE ${this.level.name.toUpperCase()}`,
            guards ? `with ${guards.count} ${ZOMBIES[guards.zombie].name}s` : '',
          );
          // It smashes its way in.
          this.crumble(boss.x, boss.z, 40);
        },
      },
      { at: 5.6, run: () => { this.onSkip = null; end(); } },
      { at: 6.4, run: () => { this.holdSim = false; } },
    ], () => {
      end();
      this.holdSim = false;
    });
  }

  private shadowSweep(bossX: number, bossZ: number, viewX: number, viewZ: number): void {
    const dx = viewX - bossX, dz = viewZ - bossZ;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len;
    // High enough to pass over the plants and bases, like a shadow cast from far above.
    const y = Math.max(0, this.world.terrain.surfaceHeight(viewX, viewZ)) + 4;
    this.sweep = {
      from: new Vector3(viewX - ux * 40, y, viewZ - uz * 40),
      to: new Vector3(viewX + ux * 40, y, viewZ + uz * 40),
      t: 0,
      dur: 2.2,
    };
    this.shadow.rotation.y = -Math.atan2(uz, ux);
    this.shadow.scaling.set(18, 9, 1);
    this.shadow.setEnabled(true);
  }

  /**
   * The last zombie falls: everything slows right down while the camera
   * closes in, then confetti and a victory banner before the win screen.
   */
  private finale(at: { x: number; z: number }): void {
    const start = this.camera.current();
    this.timeScale = 0.15;
    this.hooks.sound('slowMo');
    this.camera.fly({ x: at.x, z: at.z, radius: 13, beta: 1.05, alpha: start.alpha + 0.5 }, 2.5);
    this.play([
      {
        at: 2.4,
        run: () => {
          this.timeScale = 1;
          this.camera.shake(0.3);
          this.hooks.sound('win');
          this.hooks.banner('VICTORY!', `The ${STRUCTURES.greenhouse.name} is safe!`);
          this.confetti(at.x, at.z);
        },
      },
      { at: 6.5, run: () => this.hooks.finished() },
    ], null);
  }

  /** A burst of confetti from the spot, and more drifting down over the view. */
  private confetti(x: number, z: number): void {
    const { scene } = this.world;
    const tex = new DynamicTexture('confettiTex', { width: 8, height: 8 }, scene, false);
    const g = tex.getContext();
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 8, 8);
    tex.update();
    const ground = Math.max(0, this.world.terrain.surfaceHeight(x, z));
    for (const hex of CONFETTI_COLORS) {
      const c = Color3.FromHexString(hex);
      // The burst.
      const burst = new ParticleSystem('confetti', 220, scene);
      burst.particleTexture = tex;
      burst.emitter = new Vector3(x, ground + 1, z);
      burst.minEmitBox = new Vector3(-0.5, 0, -0.5);
      burst.maxEmitBox = new Vector3(0.5, 0.5, 0.5);
      burst.direction1 = new Vector3(-1, 2.2, -1);
      burst.direction2 = new Vector3(1, 3, 1);
      // Particle units: speeds scale by ~0.6 and gravity by ~0.36 per second.
      burst.minEmitPower = 4;
      burst.maxEmitPower = 7;
      burst.gravity = new Vector3(0, -22, 0);
      burst.manualEmitCount = 160;
      this.confettiLook(burst, c);
      burst.targetStopDuration = 6;
      burst.disposeOnStop = true;
      burst.start();
      // The shower.
      const rain = new ParticleSystem('confettiRain', 400, scene);
      rain.particleTexture = tex;
      rain.emitter = new Vector3(x, ground + 10, z);
      rain.minEmitBox = new Vector3(-14, 0, -14);
      rain.maxEmitBox = new Vector3(14, 2, 14);
      rain.direction1 = new Vector3(-0.5, -1, -0.5);
      rain.direction2 = new Vector3(0.5, -0.5, 0.5);
      rain.minEmitPower = 1;
      rain.maxEmitPower = 2;
      rain.gravity = new Vector3(0, -4, 0);
      rain.emitRate = 60;
      this.confettiLook(rain, c);
      rain.targetStopDuration = 5;
      rain.disposeOnStop = true;
      rain.start();
    }
  }

  private confettiLook(ps: ParticleSystem, c: Color3): void {
    ps.color1 = Color4.FromColor3(c, 1);
    ps.color2 = Color4.FromColor3(c.scale(0.75), 1);
    ps.colorDead = Color4.FromColor3(c.scale(0.6), 0);
    ps.minSize = 0.2;
    ps.maxSize = 0.34;
    ps.minScaleX = 0.6;
    ps.maxScaleX = 1.4;
    ps.minLifeTime = 2.2;
    ps.maxLifeTime = 3.2;
    ps.minAngularSpeed = -6;
    ps.maxAngularSpeed = 6;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  }
}
