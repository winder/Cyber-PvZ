import { Engine } from '@babylonjs/core';
import { Audio } from './audio';
import { ABILITIES, PLANTS, STRUCTURES, type AbilityId, type PlantId } from './data/config';
import { Game, TICK_RATE, type SimEvent } from './sim/game';
import { RtsCamera } from './render/camera';
import { Renderer } from './render/renderer';
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
  paused: false,
  speed: 1,
  started: false,
};

const game = new Game(Date.now() & 0xffff);
const world = createWorld(engine);
const renderer = new Renderer(world, game);
const camera = makeCamera();
const minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, game, (x, z) => camera.lookAt(x, z));
const hud = makeHud();

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
  });
}

function makeHud(): Hud {
  return new Hud(game, {
    onCard(id) {
      audio.play('click');
      ui.selectedPlant = null;
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

function handleTap(px: number, py: number): void {
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
    const r = game.place(ui.selectedCard, pt.x, pt.z);
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

  const plant = game.plantAt(pt.x, pt.z);
  ui.selectedPlant = plant ? plant.id : null;
  if (plant) audio.play('click');
}

function handleHover(px: number, py: number): void {
  const pt = camera.groundPoint(px, py);
  if (!pt) return;
  if (ui.selectedCard && game.phase === 'build') {
    renderer.setGhost(ui.selectedCard, pt.x, pt.z, game.canPlace(ui.selectedCard, pt.x, pt.z).ok);
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
      case 'zombieDied': audio.play('zombieDie'); break;
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
      case 'won':
        audio.play('win');
        hud.showOverlay('You Win! 🌱⚡', 'The Mega-Brain Greenhouse is safe.<br>The zombies have been laser-ed.', 'Play again');
        break;
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
    sessionStorage.setItem('laserPlants.skipTitle', '1');
  } catch {
    // Fine: they'll just see the title screen again.
  }
  location.reload();
}

window.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    ui.paused = !ui.paused;
    e.preventDefault();
  } else if (e.key === 'f') {
    ui.speed = ui.speed === 1 ? 2 : 1;
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
  if (ui.started && !ui.paused && game.phase === 'battle') {
    acc += dt * ui.speed;
    let steps = 0;
    while (acc >= STEP && steps < 8) {
      game.step();
      acc -= STEP;
      steps++;
    }
  } else {
    acc = 0;
  }

  const events = game.drainEvents();
  renderer.handle(events);
  react(events);

  camera.update(dt);
  renderer.sync(ui.paused ? 0 : dt * ui.speed);
  renderer.setSelected(game.phase === 'build' ? ui.selectedPlant : null);
  renderer.showEdges(game.phase === 'build' ? game.wavePreview().map((l) => l.edge) : []);
  if (game.phase !== 'battle' && ui.aiming) {
    ui.aiming = null;
    renderer.setAim(false);
  }

  hud.update({ ...ui, heading: camera.heading, muted: audio.muted });
  minimap.draw({ x: camera.target.x, z: camera.target.z, radius: camera.camera.radius, heading: camera.heading });
  world.scene.render();
});

window.addEventListener('resize', () => engine.resize());

let skipTitle = false;
try {
  skipTitle = sessionStorage.getItem('laserPlants.skipTitle') === '1';
  sessionStorage.removeItem('laserPlants.skipTitle');
} catch {
  // Storage can be blocked; just show the title screen.
}
if (skipTitle) {
  ui.started = true;
  hud.hideOverlay();
} else hud.showOverlay(
  'Laser Plants',
  `Futuristic zombies are coming for the <b>Mega-Brain Greenhouse</b>!<br>
   Plant your defense, then press <b>GO</b>. Survive ${game.totalWaves} waves.<br>
   <small>Drag to move · pinch or scroll to zoom · twist or right-drag to turn</small>`,
  'Play',
);

// Handy for debugging in the browser console.
Object.assign(window, { game, camera, ABILITIES });
