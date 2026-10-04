import { Color3, Color4, Mesh, MeshBuilder, ParticleSystem, Vector3 } from '@babylonjs/core';
import type { SoundId, ThemeDef, WeatherDef } from '../data/config';
import type { SimEvent } from '../sim/game';
import type { RtsCamera } from './camera';
import { softDot } from './decor';
import type { World } from './world';

// Weather that rolls in partway through some battles: a dust storm down the
// Rust Corridor, a thunderstorm over the Neon Grid. Looks only: zombies are
// harder to see, but the rules (and the minimap) don't change.

export interface WeatherHooks {
  sound(id: SoundId): void;
  toast(text: string): void;
}

const DUST = Color3.FromHexString('#8a5228');
const STORM_SKY = Color3.FromHexString('#0b0d1c');
const FLASH_SKY = new Color3(0.55, 0.6, 0.85);

/** Seconds for the weather to roll in, and to clear. */
const ROLL_IN = 4;
const CLEAR = 3;

export class Weather {
  /** Light multiplier and lightning flash, for world.setLighting. */
  light = 1;
  flash = 0;

  private def?: WeatherDef;
  /** Battle seconds until it rolls in, or null if it isn't coming this wave. */
  private countdown: number | null = null;
  private active = false;
  /** How strong it is right now, 0 (clear) to 1. */
  private strength = 0;
  private particles: ParticleSystem | null = null;
  private emitter = new Vector3();
  private nextStrike = 0;
  private sinceStrike = Infinity;
  private bolt: { mesh: Mesh; life: number } | null = null;
  private windTimer = 0;
  private baseFog: Color3;
  private baseSky: Color3;

  constructor(private world: World, private theme: ThemeDef, private camera: RtsCamera, private hooks: WeatherHooks) {
    this.def = theme.weather;
    this.baseFog = Color3.FromHexString(theme.fog);
    this.baseSky = Color3.FromHexString(theme.sky);
  }

  handle(events: SimEvent[]): void {
    for (const e of events) {
      if (e.t === 'waveStart') {
        this.countdown = this.def?.waves.includes(e.wave + 1) ? this.def.after : null;
      } else if (e.t === 'waveCleared' || e.t === 'lost' || e.t === 'jumped') {
        this.countdown = null;
        this.active = false;
      }
    }
  }

  /** `dt` in real seconds; `battleDt` is how far the battle moved on (0 when paused). */
  update(dt: number, battleDt: number): void {
    if (!this.def) return;
    if (this.countdown !== null) {
      this.countdown -= battleDt;
      if (this.countdown <= 0) {
        this.countdown = null;
        this.active = true;
        this.hooks.toast(this.def.kind === 'dustStorm' ? '🌪️ A dust storm is rolling in!' : '⛈️ A thunderstorm is rolling in!');
        this.hooks.sound(this.def.kind === 'dustStorm' ? 'wind' : 'thunder');
      }
    }
    const goal = this.active ? 1 : 0;
    this.strength += Math.sign(goal - this.strength) * Math.min(Math.abs(goal - this.strength), dt / (this.active ? ROLL_IN : CLEAR));
    if (this.strength > 0 && !this.particles) this.particles = this.def.kind === 'dustStorm' ? this.makeDust() : this.makeRain();
    this.emitter.copyFrom(this.camera.target);

    if (this.def.kind === 'dustStorm') this.dustStorm(dt);
    else this.thunderstorm(dt);
  }

  // --------------------------------------------------------------------------

  private dustStorm(dt: number): void {
    const k = this.strength;
    const { scene } = this.world;
    scene.fogDensity = this.theme.fogDensity + (0.034 - this.theme.fogDensity) * k;
    scene.fogColor = Color3.Lerp(this.baseFog, DUST, k * 0.8);
    scene.clearColor = Color4.FromColor3(Color3.Lerp(this.baseSky, DUST, k * 0.8), 1);
    this.light = 1 - 0.3 * k;
    this.world.decor?.setWind(1 + 2.5 * k);
    if (this.particles) this.particles.emitRate = 320 * k;
    // The wind keeps howling while it blows.
    this.windTimer -= dt;
    if (this.active && k > 0.5 && this.windTimer <= 0) {
      this.windTimer = 3.5 + Math.random() * 2;
      this.hooks.sound('wind');
    }
  }

  private thunderstorm(dt: number): void {
    const k = this.strength;
    const { scene } = this.world;
    // Lightning: a bright flash, a flicker, then it fades.
    this.sinceStrike += dt;
    const s = this.sinceStrike;
    this.flash = s < 0.07 ? 1 : s < 0.14 ? 0.15 : s < 0.22 ? 0.75 : Math.max(0, 0.75 - (s - 0.22) * 2.5);
    this.light = 1 - 0.4 * k;
    scene.fogDensity = this.theme.fogDensity + 0.006 * k;
    const sky = Color3.Lerp(this.baseSky, STORM_SKY, k).add(FLASH_SKY.scale(this.flash));
    scene.clearColor = Color4.FromColor3(sky, 1);
    scene.fogColor = sky;
    if (this.particles) this.particles.emitRate = 1600 * k;

    if (this.bolt) {
      this.bolt.life -= dt;
      this.bolt.mesh.visibility = this.bolt.life > 0.15 ? 1 : Math.max(0, this.bolt.life / 0.15);
      if (this.bolt.life <= 0) {
        this.bolt.mesh.dispose();
        this.bolt = null;
      }
    }
    this.nextStrike -= dt;
    if (this.active && k > 0.6 && this.nextStrike <= 0) {
      this.nextStrike = 2.5 + Math.random() * 4.5;
      this.strike();
    }
  }

  /** A jagged bolt from the clouds to somewhere near the middle of the view. */
  private strike(): void {
    const { scene, mats, terrain } = this.world;
    const t = this.camera.target;
    const x = t.x + (Math.random() - 0.5) * 36, z = t.z + (Math.random() - 0.5) * 24;
    const ground = terrain.surfaceHeight(x, z);
    const path: Vector3[] = [];
    const top = 45, steps = 14;
    let ox = (Math.random() - 0.5) * 10, oz = (Math.random() - 0.5) * 10;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      if (i > 0 && i < steps) {
        ox += (Math.random() - 0.5) * 4 * (1 - f);
        oz += (Math.random() - 0.5) * 4 * (1 - f);
      }
      path.push(new Vector3(x + ox * (1 - f), top + (ground - top) * f, z + oz * (1 - f)));
    }
    this.bolt?.mesh.dispose();
    const mesh = MeshBuilder.CreateTube('bolt', { path, radius: 0.14, tessellation: 5 }, scene);
    mesh.material = mats.neon('#d8e4ff', 3);
    mesh.isPickable = false;
    this.bolt = { mesh, life: 0.35 };
    this.sinceStrike = 0;
    // Thunder follows the flash.
    window.setTimeout(() => this.hooks.sound('thunder'), 200 + Math.random() * 600);
  }

  private makeDust(): ParticleSystem {
    const ps = new ParticleSystem('dustStorm', 1500, this.world.scene);
    ps.particleTexture = softDot(this.world.scene, 'stormDustTex');
    ps.emitter = this.emitter;
    // Blown in from upwind (east) and carried down the street.
    ps.minEmitBox = new Vector3(-20, 0, -30);
    ps.maxEmitBox = new Vector3(50, 7, 30);
    ps.direction1 = new Vector3(-1, -0.05, -0.15);
    ps.direction2 = new Vector3(-1, 0.15, 0.15);
    ps.minEmitPower = 9;
    ps.maxEmitPower = 16;
    ps.minLifeTime = 3;
    ps.maxLifeTime = 5;
    ps.minSize = 2;
    ps.maxSize = 6;
    ps.color1 = new Color4(0.62, 0.42, 0.26, 0.3);
    ps.color2 = new Color4(0.5, 0.34, 0.22, 0.2);
    ps.colorDead = new Color4(0.55, 0.38, 0.25, 0);
    ps.minAngularSpeed = -1;
    ps.maxAngularSpeed = 1;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.emitRate = 0;
    ps.start();
    return ps;
  }

  private makeRain(): ParticleSystem {
    const ps = new ParticleSystem('rain', 4000, this.world.scene);
    ps.particleTexture = softDot(this.world.scene, 'rainTex');
    ps.emitter = this.emitter;
    ps.minEmitBox = new Vector3(-35, 22, -30);
    ps.maxEmitBox = new Vector3(35, 26, 30);
    ps.direction1 = new Vector3(-0.2, -1, -0.05);
    ps.direction2 = new Vector3(-0.1, -1, 0.05);
    ps.minEmitPower = 26;
    ps.maxEmitPower = 32;
    ps.minLifeTime = 0.9;
    ps.maxLifeTime = 1.1;
    ps.minSize = 0.06;
    ps.maxSize = 0.1;
    ps.minScaleY = 8;
    ps.maxScaleY = 12;
    ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
    ps.color1 = new Color4(0.65, 0.75, 1, 0.55);
    ps.color2 = new Color4(0.5, 0.6, 0.9, 0.4);
    ps.colorDead = new Color4(0.5, 0.6, 0.9, 0.2);
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.emitRate = 0;
    ps.start();
    return ps;
  }
}
