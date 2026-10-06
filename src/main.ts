import { Engine } from '@babylonjs/core';
import { Audio } from './audio';
import {
  ABILITIES, GAME_SPEED, LEVELS, PLANTS, STRUCTURES, ZOMBIES, type AbilityId, type LevelDef, type PlantId,
} from './data/config';
import { Game, TICK_RATE, type SimEvent } from './sim/game';
import { isRotatable } from './sim/shapes';
import { RtsCamera } from './render/camera';
import { Renderer } from './render/renderer';
import { Spectacle } from './render/spectacle';
import { Weather } from './render/weather';
import { createWorld } from './render/world';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false }, true);
// Cap resolution on very sharp screens so tablets stay smooth.
engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));

const audio = new Audio();

/** Player interface state that the simulation doesn't care about. */
const ui = {
  selectedCard: null as PlantId | null,
  aiming: null as AbilityId | null,
  selectedPlant: null as number | null,
  /** Which way new walls face, and the wall just placed (so ↻ can turn it). */
  placeAngle: 0,
  lastWall: null as number | null,
  paused: false,
  speed: 1,
  started: false,
};

/** Which level: ?level=rust (by id) or ?level=2 (by number). Defaults to the first. */
function pickLevel(): LevelDef {
  const want = new URLSearchParams(location.search).get('level');
  if (!want) return LEVELS[0];
  return LEVELS.find((l) => l.id === want) ?? LEVELS[Number(want) - 1] ?? LEVELS[0];
}
const level = pickLevel();

const game = new Game(Date.now() & 0xffff, level);
const world = createWorld(engine, level);
const renderer = new Renderer(world, game);
const camera = makeCamera();
renderer.shake = (amount) => camera.shake(amount);
const minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, game, (x, z) => camera.lookAt(x, z));
const hud = makeHud();
const spectacle = new Spectacle(world, camera, game, level, {
  sound: (id) => audio.play(id),
  card: (title, subtitle, note) => hud.showCard(title, subtitle, note),
  clearCard: () => hud.hideCard(),
  banner: (title, subtitle) => hud.showBanner(title, subtitle),
  clearBanner: () => hud.hideBanner(),
  finished: () => {
    hud.hideBanner();
    hud.showOverlay('You Win! 🌱⚡', 'The Mega-Brain Greenhouse is safe.<br>The zombies have been laser-ed.', 'Play again');
  },
});
const weather = new Weather(world, level.theme, camera, {
  sound: (id) => audio.play(id),
  toast: (text) => hud.toast(text, 2500),
});

// -----------------------------------------------------------------------------
//  Debug mode: add ?debug to the address. Jump to any wave, unlimited sun.
// -----------------------------------------------------------------------------

const debug = { on: new URLSearchParams(location.search).has('debug'), unlimitedSun: true };

if (debug.on) {
  const panel = document.getElementById('debug')!;
  panel.hidden = false;
  const waves = document.getElementById('debug-waves')!;
  for (let i = 0; i < game.totalWaves; i++) {
    const b = document.createElement('button');
    b.textContent = String(i + 1);
    b.title = `Jump to wave ${i + 1}`;
    b.addEventListener('click', () => {
      ui.selectedCard = null;
      ui.selectedPlant = null;
      ui.aiming = null;
      ui.paused = false;
      ui.started = true;
      renderer.setGhost(null);
      renderer.setAim(false);
      hud.hideOverlay();
      game.jumpToWave(i);
    });
    waves.appendChild(b);
  }
  const sunBtn = document.getElementById('debug-sun')!;
  sunBtn.addEventListener('click', () => {
    debug.unlimitedSun = !debug.unlimitedSun;
    sunBtn.classList.toggle('on', debug.unlimitedSun);
  });
}

function updateDebug(): void {
  if (!debug.on) return;
  if (debug.unlimitedSun) game.sun = 99999;
  const buttons = document.getElementById('debug-waves')!.children;
  for (let i = 0; i < buttons.length; i++) buttons[i].classList.toggle('current', i === game.wave);
}

// Browsers only allow sound after the first touch or click.
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

function makeCamera(): RtsCamera {
  return new RtsCamera(world.scene, canvas, {
    onTap: handleTap,
    onHover: handleHover,
    onHoverEnd: () => {
      renderer.setGhost(null);
      if (ui.aiming) renderer.setAim(false);
    },
  }, world.terrain);
}

function makeHud(): Hud {
  return new Hud(game, {
    onCard(id) {
      audio.play('click');
      ui.selectedPlant = null;
      ui.lastWall = null;
      ui.selectedCard = ui.selectedCard === id ? null : id;
      if (!ui.selectedCard) renderer.setGhost(null);
    },
    onAbility(id) {
      const check = game.canUseAbility(id);
      if (!check.ok) {
        hud.toast(check.reason);
        audio.play('error');
        return;
      }
      if (id === 'orbitalStrike') {
        ui.aiming = ui.aiming === id ? null : id;
        if (ui.aiming) hud.toast('Tap where to strike!');
        else renderer.setAim(false);
        audio.play('click');
      } else {
        game.useAbility(id);
      }
    },
    onGo() {
      ui.selectedCard = null;
      ui.selectedPlant = null;
      ui.lastWall = null;
      renderer.setGhost(null);
      game.startWave();
    },
    onSell() {
      if (ui.selectedPlant !== null) game.sell(ui.selectedPlant);
      ui.selectedPlant = null;
    },
    onCancelSell() {
      ui.selectedPlant = null;
    },
    onRotate() {
      rotate();
    },
    onPause() {
      ui.paused = !ui.paused;
      audio.play('click');
    },
    onSpeed() {
      ui.speed = ui.speed === 1 ? 2 : 1;
      audio.play('click');
    },
    onCompass() {
      camera.faceNorth();
    },
    onMute() {
      audio.muted = !audio.muted;
    },
    onOverlay() {
      audio.unlock();
      if (!ui.started) {
        ui.started = true;
        hud.hideOverlay();
        return;
      }
      restart();
    },
  });
}

/** Walls turn in 45° steps (after 180° a wall looks the same, so 4 directions). */
const TURN = Math.PI / 4;

function canRotate(): boolean {
  if (game.phase !== 'build') return false;
  if (ui.selectedPlant !== null) {
    const p = game.plants.find((pl) => pl.id === ui.selectedPlant);
    return !!p && isRotatable(p.type);
  }
  return !!ui.selectedCard && isRotatable(ui.selectedCard);
}

/**
 * ↻ / R: turn the selected wall; or, while placing walls, turn the next one
 * (and the one just placed, so on a tablet you can tap, then turn it).
 */
function rotate(): void {
  if (!canRotate()) return;
  if (ui.selectedPlant !== null) {
    const p = game.plants.find((pl) => pl.id === ui.selectedPlant)!;
    const r = game.rotatePlant(p.id, (p.angle + TURN) % Math.PI);
    if (!r.ok) {
      hud.toast(r.reason);
      audio.play('error');
      return;
    }
    ui.placeAngle = p.angle;
    audio.play('click');
    return;
  }
  ui.placeAngle = (ui.placeAngle + TURN) % Math.PI;
  if (ui.lastWall !== null) {
    const r = game.rotatePlant(ui.lastWall, ui.placeAngle);
    if (!r.ok) hud.toast(r.reason);
  }
  if (lastHover) handleHover(lastHover.px, lastHover.py);
  audio.play('click');
}

function handleTap(px: number, py: number): void {
  if (spectacle.skip()) return;
  const pt = camera.groundPoint(px, py);
  if (!pt) return;

  if (game.phase === 'battle') {
    if (ui.aiming) {
      const r = game.useAbility(ui.aiming, pt.x, pt.z);
      if (!r.ok) {
        hud.toast(r.reason);
        audio.play('error');
      }
      ui.aiming = null;
      renderer.setAim(false);
    }
    return;
  }

  if (game.phase !== 'build') return;

  if (ui.selectedCard) {
    const r = game.place(ui.selectedCard, pt.x, pt.z, ui.placeAngle);
    ui.lastWall = r.ok && isRotatable(r.plant.type) ? r.plant.id : null;
    if (!r.ok) {
      hud.toast(r.reason);
      audio.play('error');
    } else if (game.sun < PLANTS[ui.selectedCard].cost) {
      // Out of sun for another one: put the card down.
      ui.selectedCard = null;
      renderer.setGhost(null);
    }
    return;
  }

  ui.lastWall = null;
  const plant = game.plantAt(pt.x, pt.z);
  ui.selectedPlant = plant ? plant.id : null;
  if (plant) audio.play('click');
}

let lastHover: { px: number; py: number } | null = null;

function handleHover(px: number, py: number): void {
  lastHover = { px, py };
  const pt = camera.groundPoint(px, py);
  if (!pt) return;
  if (ui.selectedCard && game.phase === 'build') {
    renderer.setGhost(ui.selectedCard, pt.x, pt.z, game.canPlace(ui.selectedCard, pt.x, pt.z, ui.placeAngle).ok, ui.placeAngle);
  } else {
    renderer.setGhost(null);
  }
  renderer.setAim(ui.aiming !== null && game.phase === 'battle', pt.x, pt.z);
}

/** Sounds, messages and screens triggered by things happening in the game. */
function react(events: SimEvent[]): void {
  for (const e of events) {
    switch (e.t) {
      case 'shot': audio.play(e.kind === 'cryoPea' ? 'cryo' : 'laser'); break;
      case 'zombieDied':
        if (ZOMBIES[e.type].boss) {
          audio.play('bossDie');
          hud.toast(`🎉 ${ZOMBIES[e.type].name} is DOWN! 🎉`, 3500);
        } else {
          audio.play('zombieDie');
        }
        break;
      // Its entrance (name card and all) is staged by the Spectacle.
      case 'bossSpawn': audio.play('bossRoar'); break;
      case 'stomp': audio.play('stomp'); break;
      case 'wander':
        hud.toast(`👣 ${ZOMBIES[e.type].name} is stomping toward the ${STRUCTURES[game.structures[e.to].type].name}!`, 3000);
        break;
      case 'plantPlaced': audio.play('place'); break;
      case 'plantSold': audio.play('sell'); break;
      case 'plantDied': audio.play('plantDie'); break;
      case 'chomp': audio.play('chomp'); break;
      case 'structureHit': audio.play('structureHit'); break;
      case 'strikeHit': audio.play('orbital'); break;
      case 'hyperSun':
        audio.play('hyperSun');
        hud.toast('🌞 HYPER SUN! 🌞');
        break;
      case 'structureDestroyed': {
        const s = game.structures[e.index];
        audio.play('structureDie');
        const def = STRUCTURES[s.type];
        let msg = `💥 ${def.name} destroyed!`;
        if (def.powersAbilities) msg += ' No more abilities!';
        if (def.sunPerSecond) msg += ' Less sun!';
        hud.toast(msg, 3000);
        break;
      }
      case 'waveStart':
        audio.play('waveStart');
        hud.toast(e.wave === game.totalWaves - 1 ? '⚠️ FINAL WAVE! ⚠️' : `Wave ${e.wave + 1}!`);
        break;
      case 'waveCleared':
        audio.play('waveClear');
        ui.aiming = null;
        renderer.setAim(false);
        if (e.bonus) hud.toast(`Wave cleared! +${e.bonus}☀`, 2500);
        break;
      case 'jumped':
        audio.play('click');
        hud.toast(`🐞 Jumped to wave ${e.wave + 1}${e.wave === game.totalWaves - 1 ? ' (final wave!)' : ''}`);
        break;
      // 'won': the Spectacle plays the finale, then shows the win screen.
      case 'lost':
        audio.play('lose');
        hud.showOverlay('Brains Eaten! 🧟', `The zombies got the Mega-Brain Greenhouse on wave ${game.wave + 1}.`, 'Try again');
        break;
      default: break;
    }
  }
}

/** Start over. A fresh page load is the simplest way to reset everything. */
function restart(): void {
  try {
    sessionStorage.setItem('cyberPvZ.skipTitle', '1');
  } catch {
    // Fine: they'll just see the title screen again.
  }
  location.reload();
}

window.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    if (!spectacle.skip()) ui.paused = !ui.paused;
    e.preventDefault();
  } else if (e.key === 'f') {
    ui.speed = ui.speed === 1 ? 2 : 1;
  } else if (e.key === 'r' || e.key === 'R') {
    rotate();
  } else if (e.key === 'Escape') {
    ui.selectedCard = null;
    ui.selectedPlant = null;
    ui.aiming = null;
    renderer.setGhost(null);
    renderer.setAim(false);
  } else if (e.key === 'Enter' && game.phase === 'build' && ui.started) {
    game.startWave();
  } else if (/^[1-4]$/.test(e.key) && game.phase === 'build') {
    const id = (Object.keys(PLANTS) as PlantId[])[Number(e.key) - 1];
    ui.selectedCard = ui.selectedCard === id ? null : id;
    if (!ui.selectedCard) renderer.setGhost(null);
  }
});

// -----------------------------------------------------------------------------
//  Main loop: fixed-step simulation, render every frame.
// -----------------------------------------------------------------------------

const STEP = 1 / TICK_RATE;
let acc = 0;

engine.runRenderLoop(() => {
  const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
  // A cinematic holds the battle still, like the pause button.
  const running = ui.started && !ui.paused && !spectacle.holdSim && game.phase === 'battle';
  if (running) {
    acc += dt * GAME_SPEED * ui.speed;
    // Enough steps to keep up at top speed on a slow frame, without spiralling.
    let steps = 0;
    while (acc >= STEP && steps < 16) {
      game.step();
      acc -= STEP;
      steps++;
    }
    if (steps === 16) acc = 0;
  } else {
    acc = 0;
  }

  updateDebug();
  const events = game.drainEvents();
  renderer.handle(events);
  spectacle.handle(events);
  weather.handle(events);
  react(events);

  spectacle.update(dt);
  weather.update(dt, running ? dt * GAME_SPEED * ui.speed : 0);
  world.setLighting(spectacle.light * weather.light, weather.flash);
  camera.update(dt);
  renderer.sync(ui.paused ? 0 : dt * GAME_SPEED * ui.speed * spectacle.timeScale);
  renderer.setSelected(game.phase === 'build' ? ui.selectedPlant : null);
  renderer.showEdges(game.phase === 'build' ? game.wavePreview().flatMap((l) => (l.edge === 'graves' ? [] : [l.edge])) : []);
  if (game.phase !== 'battle' && ui.aiming) {
    ui.aiming = null;
    renderer.setAim(false);
  }

  hud.update({ ...ui, heading: camera.heading, muted: audio.muted, canRotate: canRotate() });
  minimap.draw({ x: camera.target.x, z: camera.target.z, radius: camera.camera.radius, heading: camera.heading });
  world.scene.render();
});

window.addEventListener('resize', () => engine.resize());

let skipTitle = false;
try {
  skipTitle = sessionStorage.getItem('cyberPvZ.skipTitle') === '1';
  sessionStorage.removeItem('cyberPvZ.skipTitle');
} catch {
  // Storage can be blocked; just show the title screen.
}
if (skipTitle) {
  ui.started = true;
  hud.hideOverlay();
} else hud.showOverlay(
  'Cyber Plants vs Zombies',
  `${levelPicker()}
   Futuristic zombies are coming for the <b>Mega-Brain Greenhouse</b>!<br>
   Plant your defense, then press <b>GO</b>. Survive ${game.totalWaves} waves.<br>
   <small>Drag to move · pinch or scroll to zoom · twist or right-drag to turn</small><br>
   <a class="editor-link" href="editor/">🎨 Paint your zombies in the Character Editor</a>`,
  'Play',
);

/** Level buttons for the title screen. Each is a link, keeping other options like ?debug. */
function levelPicker(): string {
  const buttons = LEVELS.map((l, i) => {
    const params = new URLSearchParams(location.search);
    params.set('level', l.id);
    const on = l === level ? ' on' : '';
    return `<a class="level${on}" href="?${params}"><span class="level-icon">${l.icon}</span>` +
      `<b>${i + 1}. ${l.name}</b><small>${l.description}</small></a>`;
  }).join('');
  return `<div class="levels">${buttons}</div>`;
}

// Handy for debugging in the browser console.
Object.assign(window, { game, camera, renderer, spectacle, weather, ABILITIES });
