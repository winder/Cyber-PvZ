import {
  ABILITIES, PLANTS, STRUCTURES, ZOMBIES, type AbilityId, type EdgeId, type PlantId,
} from '../data/config';
import type { Game } from '../sim/game';

export interface HudHandlers {
  onCard(id: PlantId): void;
  onAbility(id: AbilityId): void;
  onGo(): void;
  onSell(): void;
  onCancelSell(): void;
  onPause(): void;
  onSpeed(): void;
  onCompass(): void;
  onMute(): void;
  onOverlay(): void;
}

const EDGE_NAMES: Record<EdgeId, string> = { north: 'North', south: 'South', east: 'East', west: 'West' };

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

/** Everything drawn on top of the 3D view, as plain HTML. */
export class Hud {
  private cards = new Map<PlantId, HTMLButtonElement>();
  private abilityBtns = new Map<AbilityId, { btn: HTMLButtonElement; cd: HTMLElement }>();
  private toastTimer = 0;
  private lastPreviewWave = -1;

  constructor(private game: Game, h: HudHandlers) {
    const cards = $('cards');
    for (const id of Object.keys(PLANTS) as PlantId[]) {
      const def = PLANTS[id];
      const btn = document.createElement('button');
      btn.className = 'card-btn';
      btn.title = def.description;
      btn.innerHTML = `<span class="icon">${def.icon}</span><span class="name">${def.name}</span><span class="cost">${def.cost}</span>`;
      btn.addEventListener('click', () => h.onCard(id));
      cards.appendChild(btn);
      this.cards.set(id, btn);
    }

    const abilities = $('abilities');
    for (const id of Object.keys(ABILITIES) as AbilityId[]) {
      const def = ABILITIES[id];
      const btn = document.createElement('button');
      btn.className = 'card-btn';
      btn.title = def.description;
      btn.innerHTML = `<span class="icon">${def.icon}</span><span class="name">${def.name}</span><span class="cost">${def.cost}</span><div class="cooldown"></div>`;
      btn.addEventListener('click', () => h.onAbility(id));
      abilities.appendChild(btn);
      this.abilityBtns.set(id, { btn, cd: btn.querySelector('.cooldown') as HTMLElement });
    }

    $('btn-go').addEventListener('click', h.onGo);
    $('btn-pause').addEventListener('click', h.onPause);
    $('btn-speed').addEventListener('click', h.onSpeed);
    $('btn-compass').addEventListener('click', h.onCompass);
    $('btn-mute').addEventListener('click', h.onMute);
    $('overlay-btn').addEventListener('click', h.onOverlay);

    const sellbar = $('sellbar');
    sellbar.innerHTML = '<span id="sell-name"></span><button class="sell" id="btn-sell"></button><button id="btn-cancel">✕</button>';
    $('btn-sell').addEventListener('click', h.onSell);
    $('btn-cancel').addEventListener('click', h.onCancelSell);
  }

  update(ui: {
    selectedCard: PlantId | null;
    aiming: AbilityId | null;
    selectedPlant: number | null;
    paused: boolean;
    speed: number;
    heading: number;
    muted: boolean;
  }): void {
    const g = this.game;
    const build = g.phase === 'build';
    const battle = g.phase === 'battle';

    $('sun').textContent = String(Math.floor(g.sun));
    $('sun-rate').textContent = battle ? `+${g.sunPerSecond().toFixed(1)}/s` : '';
    const waveNum = Math.min(g.wave + 1, g.totalWaves);
    const final = waveNum === g.totalWaves ? ' — FINAL WAVE!' : '';
    $('wave').textContent = `Wave ${waveNum} / ${g.totalWaves}${final}${build ? ' · get ready' : ''}`;

    // Bottom bar: cards in build, abilities in battle, sell bar when a plant is picked.
    const selling = build && ui.selectedPlant !== null;
    $('cards').style.display = build && !selling ? 'flex' : 'none';
    $('btn-go').style.display = build ? 'block' : 'none';
    $('abilities').style.display = battle ? 'flex' : 'none';
    $('sellbar').style.display = selling ? 'flex' : 'none';

    for (const [id, btn] of this.cards) {
      btn.classList.toggle('selected', ui.selectedCard === id);
      btn.classList.toggle('poor', g.sun < PLANTS[id].cost);
    }

    if (selling) {
      const p = g.plants.find((pl) => pl.id === ui.selectedPlant);
      if (p) {
        $('sell-name').textContent = `${PLANTS[p.type].icon} ${PLANTS[p.type].name}`;
        $('btn-sell').textContent = `Sell +${PLANTS[p.type].cost}☀`;
      }
    }

    const online = g.abilitiesOnline();
    for (const [id, { btn, cd }] of this.abilityBtns) {
      const left = g.cooldowns[id];
      cd.style.height = `${(left / ABILITIES[id].cooldown) * 100}%`;
      btn.disabled = !online;
      btn.classList.toggle('selected', ui.aiming === id);
      btn.classList.toggle('poor', g.sun < ABILITIES[id].cost);
    }

    const pause = $('btn-pause');
    pause.textContent = ui.paused ? '▶' : '⏸';
    pause.classList.toggle('on', ui.paused);
    const speed = $('btn-speed');
    speed.textContent = `${ui.speed}×`;
    speed.classList.toggle('on', ui.speed > 1);
    $('needle').style.transform = `rotate(${(ui.heading * 180) / Math.PI}deg)`;
    $('btn-mute').textContent = ui.muted ? '🔇' : '🔊';

    this.updateStructures();
    this.updatePreview(build);
  }

  private updateStructures(): void {
    const el = $('structures');
    if (!el.childElementCount) {
      for (const s of this.game.structures) {
        const row = document.createElement('div');
        row.className = 'struct';
        row.innerHTML = `<div>${STRUCTURES[s.type].name}</div><div class="bar"><div class="fill"></div></div>`;
        el.appendChild(row);
      }
    }
    this.game.structures.forEach((s, i) => {
      const row = el.children[i] as HTMLElement;
      const frac = Math.max(0, s.hp / STRUCTURES[s.type].hp);
      row.classList.toggle('dead', !s.alive);
      const fill = row.querySelector('.fill') as HTMLElement;
      fill.style.width = `${frac * 100}%`;
      fill.style.background = frac > 0.5 ? 'var(--good)' : frac > 0.25 ? 'var(--sun)' : 'var(--bad)';
    });
  }

  private updatePreview(build: boolean): void {
    const el = $('preview');
    el.style.display = build ? 'block' : 'none';
    if (!build || this.lastPreviewWave === this.game.wave) return;
    this.lastPreviewWave = this.game.wave;
    const lines = this.game.wavePreview()
      .map((l) => `<div>${ZOMBIES[l.zombie].icon} ${l.count} × ${ZOMBIES[l.zombie].name} <small>from ${EDGE_NAMES[l.edge]}</small></div>`)
      .join('');
    el.innerHTML = `<h3>INCOMING</h3>${lines}`;
  }

  toast(text: string, ms = 1800): void {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), ms);
  }

  showOverlay(title: string, text: string, button: string): void {
    $('overlay-title').textContent = title;
    $('overlay-text').innerHTML = text;
    $('overlay-btn').textContent = button;
    $('overlay').classList.remove('hidden');
  }

  hideOverlay(): void {
    $('overlay').classList.add('hidden');
  }
}
