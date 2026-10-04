import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, DynamicTexture, Engine, HemisphericLight,
  MeshBuilder, Scene, StandardMaterial, Texture, Vector3, type AbstractMesh,
} from '@babylonjs/core';
import { ZOMBIES, type ZombieId } from '../data/config';
import { MODELS } from '../models/models';
import { animate, assemble, buildPartMesh, skinMaterial, type BlockCharacter } from '../render/blockModel';
import { buildHair } from '../render/hair';
import { attachWeapon } from '../render/weapons';
import { skinUnits } from '../models/models';
import { clearCustomSkin, getCustomSkin, saveCustomSkin } from '../skins';
import { faceAt, faceLabel, layoutFaces, mirrorPixel, type FaceInfo } from './faces';

/**
 * Skin size in pixels for the character being edited: the Minecraft layout at
 * double detail (128×128), or bigger for models with more parts.
 */
let TEX = 128;
/** The flat view is drawn this many pixels across its longest side. */
const FLAT_SIZE = 768;
let FLAT_SCALE = FLAT_SIZE / TEX;
/** Part of the skin the flat view shows: just the area the parts use. */
let view = { x: 0, y: 0, w: 128, h: 128 };

function texSizeFor(id: ZombieId): number {
  return skinUnits(ZOMBIES[id].model!) * 2;
}
const UNDO_LIMIT = 60;
/** How different (0–255 per channel) a pixel can be and still get filled. */
const FILL_TOLERANCE = 40;

const PALETTE = [
  '#9a9ea6', '#7d8189', '#6c7078', '#2b2e35', '#86cdea', '#c4ecff', '#a4b33a', '#7e8d22',
  '#f0902a', '#ffd36a', '#ffffff', '#000000', '#ff3355', '#3cff6e', '#ff5fd2', '#8a6cff',
  '#4d7bff', '#8b5a2b',
];

type Tool = 'pencil' | 'eraser' | 'fill' | 'picker';

const characters = (Object.keys(ZOMBIES) as ZombieId[]).filter((id) => ZOMBIES[id].model);

const state = {
  id: characters[0],
  tool: 'pencil' as Tool,
  size: 1,
  color: '#86cdea',
  mirror: false,
  mode: 'paint' as 'paint' | 'turn',
  walk: false,
};

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

// -----------------------------------------------------------------------------
//  Skin documents: one canvas per character, with undo history.
// -----------------------------------------------------------------------------

interface Doc {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  faces: FaceInfo[];
  undo: ImageData[];
  redo: ImageData[];
  dirty: boolean;
}

const docs = new Map<ZombieId, Doc>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Draw any skin image into our 128×128 canvas, keeping pixels crisp. */
function drawSkinImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
  ctx.clearRect(0, 0, TEX, TEX);
  ctx.imageSmoothingEnabled = false;
  if (img.width === img.height * 2) {
    // Old 64×32 Minecraft skins: top half only.
    ctx.drawImage(img, 0, 0, TEX, TEX / 2);
  } else {
    ctx.drawImage(img, 0, 0, TEX, TEX);
  }
}

function blankSkin(doc: Doc): void {
  doc.ctx.clearRect(0, 0, TEX, TEX);
  doc.ctx.fillStyle = '#9a9ea6';
  for (const f of doc.faces) doc.ctx.fillRect(f.x, f.y, f.w, f.h);
}

async function loadOriginal(id: ZombieId, doc: Doc): Promise<void> {
  const file = ZOMBIES[id].skin;
  try {
    if (!file) throw new Error('no skin file');
    drawSkinImage(doc.ctx, await loadImage(`../${file}`));
  } catch {
    blankSkin(doc);
  }
}

async function getDoc(id: ZombieId): Promise<Doc> {
  const existing = docs.get(id);
  if (existing) return existing;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const doc: Doc = { canvas, ctx, faces: layoutFaces(ZOMBIES[id].model!, TEX), undo: [], redo: [], dirty: false };
  const saved = getCustomSkin(id);
  if (saved) {
    try {
      const img = await loadImage(saved);
      // Saved for an older version of this model? Start from the original instead.
      if (img.width !== TEX) throw new Error('outdated skin');
      drawSkinImage(ctx, img);
    } catch {
      await loadOriginal(id, doc);
    }
  } else {
    await loadOriginal(id, doc);
  }
  docs.set(id, doc);
  return doc;
}

function snapshot(doc: Doc): void {
  doc.undo.push(doc.ctx.getImageData(0, 0, TEX, TEX));
  if (doc.undo.length > UNDO_LIMIT) doc.undo.shift();
  doc.redo.length = 0;
  doc.dirty = true;
}

// -----------------------------------------------------------------------------
//  Painting
// -----------------------------------------------------------------------------

let doc: Doc;

function setPixel(x: number, y: number): void {
  if (state.tool === 'eraser') doc.ctx.clearRect(x, y, 1, 1);
  else {
    doc.ctx.fillStyle = state.color;
    doc.ctx.fillRect(x, y, 1, 1);
  }
}

/** Paint a brush dab, staying on the face it started on. */
function dab(x: number, y: number): void {
  const face = faceAt(doc.faces, x, y);
  if (!face) return;
  const r0 = Math.floor((state.size - 1) / 2);
  for (let dy = 0; dy < state.size; dy++) {
    for (let dx = 0; dx < state.size; dx++) {
      const px = x - r0 + dx, py = y - r0 + dy;
      if (px < face.x || py < face.y || px >= face.x + face.w || py >= face.y + face.h) continue;
      setPixel(px, py);
      if (state.mirror) {
        const m = mirrorPixel(doc.faces, px, py);
        if (m) setPixel(m.x, m.y);
      }
    }
  }
}

function line(x0: number, y0: number, x1: number, y1: number): void {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    dab(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Fill the touching same-colored area, but only on one face of one part. */
function floodFill(x: number, y: number): void {
  const face = faceAt(doc.faces, x, y);
  if (!face) return;
  const img = doc.ctx.getImageData(face.x, face.y, face.w, face.h);
  const d = img.data;
  const at = (fx: number, fy: number) => (fy * face.w + fx) * 4;
  const start = at(x - face.x, y - face.y);
  const target = [d[start], d[start + 1], d[start + 2], d[start + 3]];
  const c = state.tool === 'eraser' ? [0, 0, 0, 0] : [...Color3.FromHexString(state.color).asArray().map((v) => Math.round(v * 255)), 255];
  if (target.every((v, i) => v === c[i])) return;
  // Pencil-shaded skins are speckly, so "the same color" means "close enough".
  const same = (i: number) => {
    if (target[3] === 0 || d[i + 3] === 0) return d[i + 3] === target[3];
    return Math.max(Math.abs(d[i] - target[0]), Math.abs(d[i + 1] - target[1]), Math.abs(d[i + 2] - target[2])) <= FILL_TOLERANCE;
  };
  const done = new Uint8Array(face.w * face.h);
  const stack = [[x - face.x, y - face.y]];
  while (stack.length) {
    const [fx, fy] = stack.pop()!;
    if (fx < 0 || fy < 0 || fx >= face.w || fy >= face.h) continue;
    if (done[fy * face.w + fx]) continue;
    done[fy * face.w + fx] = 1;
    const i = at(fx, fy);
    if (!same(i)) continue;
    d.set(c, i);
    stack.push([fx + 1, fy], [fx - 1, fy], [fx, fy + 1], [fx, fy - 1]);
  }
  doc.ctx.putImageData(img, face.x, face.y);
}

function pickColor(x: number, y: number): void {
  const [r, g, b, a] = doc.ctx.getImageData(x, y, 1, 1).data;
  if (a === 0) return;
  setColor(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
  setTool('pencil');
}

/** One stroke = one undo step. */
let stroke: { x: number; y: number; face: FaceInfo | undefined } | null = null;

function strokeStart(x: number, y: number): void {
  if (state.tool === 'picker') {
    pickColor(x, y);
    return;
  }
  if (!faceAt(doc.faces, x, y)) return;
  snapshot(doc);
  if (state.tool === 'fill') {
    floodFill(x, y);
    if (state.mirror) {
      const m = mirrorPixel(doc.faces, x, y);
      if (m) floodFill(m.x, m.y);
    }
  } else {
    dab(x, y);
    stroke = { x, y, face: faceAt(doc.faces, x, y) };
  }
  changed();
}

function strokeMove(x: number, y: number): void {
  if (!stroke) return;
  if (x === stroke.x && y === stroke.y) return;
  const face = faceAt(doc.faces, x, y);
  // Join the dots on the same face; jumping to another face just starts fresh there.
  if (face && face === stroke.face) line(stroke.x, stroke.y, x, y);
  else dab(x, y);
  stroke = { x, y, face };
  changed();
}

function strokeEnd(): void {
  stroke = null;
}

function undo(): void {
  const prev = doc.undo.pop();
  if (!prev) return;
  doc.redo.push(doc.ctx.getImageData(0, 0, TEX, TEX));
  doc.ctx.putImageData(prev, 0, 0);
  doc.dirty = true;
  changed();
}

function redo(): void {
  const next = doc.redo.pop();
  if (!next) return;
  doc.undo.push(doc.ctx.getImageData(0, 0, TEX, TEX));
  doc.ctx.putImageData(next, 0, 0);
  doc.dirty = true;
  changed();
}

// -----------------------------------------------------------------------------
//  3D preview
// -----------------------------------------------------------------------------

const canvas3d = $<HTMLCanvasElement>('view3d');
const engine = new Engine(canvas3d, true, { preserveDrawingBuffer: true }, true);
engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));
const scene = new Scene(engine);
scene.clearColor = new Color4(0, 0, 0, 0);
const camera = new ArcRotateCamera('cam', 1.1, 1.25, 3.6, new Vector3(0, 0.85, 0), scene);
camera.inputs.clear();
camera.minZ = 0.05;
const hemi = new HemisphericLight('sky', new Vector3(0.3, 1, 0.4), scene);
hemi.intensity = 0.85;
hemi.groundColor = new Color3(0.25, 0.25, 0.35);
const sun = new DirectionalLight('sun', new Vector3(-0.4, -0.8, -0.6), scene);
sun.intensity = 0.5;

const pad = MeshBuilder.CreateCylinder('pad', { height: 0.06, diameter: 1.6, tessellation: 48 }, scene);
pad.position.y = -0.03;
const padMat = new StandardMaterial('pad', scene);
padMat.diffuseColor = new Color3(0.05, 0.08, 0.18);
padMat.emissiveColor = new Color3(0.05, 0.25, 0.35);
pad.material = padMat;
pad.isPickable = false;

let liveTex = new DynamicTexture('skin', { width: TEX, height: TEX }, scene, false, Texture.NEAREST_SAMPLINGMODE);
let liveCtx = liveTex.getContext() as unknown as CanvasRenderingContext2D;
const skinMat = skinMaterial('skinMat', liveTex, scene);

/** Swap in a texture of the right size when switching to a bigger/smaller skin. */
function resizeLiveTexture(size: number): void {
  if (liveTex.getSize().width === size) return;
  liveTex.dispose();
  liveTex = new DynamicTexture('skin', { width: size, height: size }, scene, false, Texture.NEAREST_SAMPLINGMODE);
  liveTex.hasAlpha = true;
  liveCtx = liveTex.getContext() as unknown as CanvasRenderingContext2D;
  skinMat.diffuseTexture = liveTex;
}

let character: BlockCharacter | null = null;
let extras: AbstractMesh[] = [];
const pickable = new Set<AbstractMesh>();

function buildCharacter(id: ZombieId): void {
  if (character) {
    for (const m of [...character.meshes, ...extras]) m.dispose();
    character.root.dispose();
    extras = [];
  }
  pickable.clear();
  const model = ZOMBIES[id].model!;
  const parts = MODELS[model].parts.map((def) => {
    const mesh = buildPartMesh(`part-${def.role}`, def, scene, skinUnits(model));
    mesh.material = skinMat;
    pickable.add(mesh);
    return { def, mesh };
  });
  character = assemble('character', scene, model, parts);
  // Hair isn't painted (it's 3D curls), but show it so you can see the look.
  // It's not pickable, so you can still paint the head underneath.
  const weapon = ZOMBIES[id].weapon;
  if (weapon) {
    const w = attachWeapon(scene, character, weapon, 'weapon');
    if (w) extras.push(...w.getChildMeshes());
  }
  const kind = ZOMBIES[id].hair;
  if (kind && character.joints.head) {
    const hair = buildHair(scene, 'hair', kind, model);
    hair.parent = character.joints.head;
    extras.push(hair);
  }
}

/** Texture pixel under a point on the 3D canvas, if it's on the character. */
function pick3d(px: number, py: number): { x: number; y: number } | null {
  const hit = scene.pick(px, py, (m) => pickable.has(m));
  const uv = hit?.hit ? hit.getTextureCoordinates() : null;
  if (!uv) return null;
  return {
    x: Math.min(TEX - 1, Math.max(0, Math.floor(uv.x * TEX))),
    y: Math.min(TEX - 1, Math.max(0, Math.floor((1 - uv.y) * TEX))),
  };
}

// Pointer handling on the 3D view: paint on the model, turn on the background.
{
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: 'paint' | 'turn' | 'pinch' | null = null;
  const local = (e: PointerEvent | WheelEvent) => {
    const r = canvas3d.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas3d.addEventListener('pointerdown', (e) => {
    canvas3d.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size >= 2) {
      strokeEnd();
      gesture = 'pinch';
      return;
    }
    const texel = state.mode === 'paint' && e.button !== 2 ? pick3d(p.x, p.y) : null;
    if (texel) {
      gesture = 'paint';
      strokeStart(texel.x, texel.y);
    } else {
      gesture = 'turn';
    }
  });

  canvas3d.addEventListener('pointermove', (e) => {
    const p = local(e);
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      const texel = pick3d(p.x, p.y);
      showWhere(texel ? faceAt(doc.faces, texel.x, texel.y) : undefined);
      return;
    }
    if (gesture === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const before = Math.hypot(a.x - b.x, a.y - b.y);
      prev.x = p.x;
      prev.y = p.y;
      const after = Math.hypot(a.x - b.x, a.y - b.y);
      if (before > 1 && after > 1) zoom(before / after);
      return;
    }
    const dx = p.x - prev.x, dy = p.y - prev.y;
    prev.x = p.x;
    prev.y = p.y;
    if (gesture === 'turn') {
      camera.alpha -= dx * 0.01;
      camera.beta = Math.min(2.7, Math.max(0.3, camera.beta - dy * 0.01));
    } else if (gesture === 'paint') {
      const texel = pick3d(p.x, p.y);
      if (texel) strokeMove(texel.x, texel.y);
      showWhere(texel ? faceAt(doc.faces, texel.x, texel.y) : undefined);
    }
  });

  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      if (gesture === 'paint') strokeEnd();
      gesture = null;
    }
  };
  canvas3d.addEventListener('pointerup', up);
  canvas3d.addEventListener('pointercancel', up);
  canvas3d.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas3d.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom(Math.exp(e.deltaY * 0.0015));
  }, { passive: false });
}

function zoom(factor: number): void {
  camera.radius = Math.min(8, Math.max(1.4, camera.radius * factor));
}

// -----------------------------------------------------------------------------
//  Flat (unfolded) skin view
// -----------------------------------------------------------------------------

const flat = $<HTMLCanvasElement>('flat');
const flatCtx = flat.getContext('2d')!;
let hoverFace: FaceInfo | undefined;

function drawFlat(): void {
  const s = FLAT_SCALE;
  const g = flatCtx;
  g.imageSmoothingEnabled = false;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#05060c';
  g.fillRect(0, 0, flat.width, flat.height);
  g.translate(-view.x * s, -view.y * s);
  // Checkerboard behind each face so see-through pixels are obvious.
  for (const f of doc.faces) {
    for (let y = f.y; y < f.y + f.h; y += 2) {
      for (let x = f.x; x < f.x + f.w; x += 2) {
        g.fillStyle = ((x + y) / 2) % 2 ? '#2a2d3a' : '#3a3e4e';
        g.fillRect(x * s, y * s, 2 * s, 2 * s);
      }
    }
  }
  g.drawImage(doc.canvas, 0, 0, TEX * s, TEX * s);
  g.lineWidth = 1;
  for (const f of doc.faces) {
    g.strokeStyle = f === hoverFace ? 'rgba(60,255,110,0.95)' : 'rgba(80,220,255,0.25)';
    g.lineWidth = f === hoverFace ? 3 : 1;
    g.strokeRect(f.x * s + 0.5, f.y * s + 0.5, f.w * s - 1, f.h * s - 1);
  }
}

/** Crop the flat view to the parts (with a small margin) so they're big enough to paint. */
function fitFlatView(): void {
  const pad = 2;
  const x0 = Math.max(0, Math.min(...doc.faces.map((f) => f.x)) - pad);
  const y0 = Math.max(0, Math.min(...doc.faces.map((f) => f.y)) - pad);
  const x1 = Math.min(TEX, Math.max(...doc.faces.map((f) => f.x + f.w)) + pad);
  const y1 = Math.min(TEX, Math.max(...doc.faces.map((f) => f.y + f.h)) + pad);
  view = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  FLAT_SCALE = FLAT_SIZE / Math.max(view.w, view.h);
  flat.width = Math.round(view.w * FLAT_SCALE);
  flat.height = Math.round(view.h * FLAT_SCALE);
}

function flatPixel(e: PointerEvent): { x: number; y: number } {
  const r = flat.getBoundingClientRect();
  return {
    x: Math.min(TEX - 1, Math.max(0, view.x + Math.floor(((e.clientX - r.left) / r.width) * view.w))),
    y: Math.min(TEX - 1, Math.max(0, view.y + Math.floor(((e.clientY - r.top) / r.height) * view.h))),
  };
}

flat.addEventListener('pointerdown', (e) => {
  flat.setPointerCapture(e.pointerId);
  const p = flatPixel(e);
  strokeStart(p.x, p.y);
});
flat.addEventListener('pointermove', (e) => {
  const p = flatPixel(e);
  const f = faceAt(doc.faces, p.x, p.y);
  if (f !== hoverFace) {
    hoverFace = f;
    showWhere(f);
    needsDraw = true;
  }
  if (e.buttons || e.pointerType !== 'mouse') strokeMove(p.x, p.y);
});
flat.addEventListener('pointerup', strokeEnd);
flat.addEventListener('pointercancel', strokeEnd);
flat.addEventListener('pointerleave', () => {
  hoverFace = undefined;
  showWhere(undefined);
  needsDraw = true;
});

function showWhere(f: FaceInfo | undefined): void {
  $('where').textContent = f ? faceLabel(f) : ' ';
}

// -----------------------------------------------------------------------------
//  UI
// -----------------------------------------------------------------------------

let needsDraw = true;

/** The skin changed: refresh the 3D texture and flat view on the next frame. */
function changed(): void {
  needsDraw = true;
}

function refresh(): void {
  liveCtx.clearRect(0, 0, TEX, TEX);
  liveCtx.drawImage(doc.canvas, 0, 0);
  liveTex.update(true);
  drawFlat();
  $('btn-undo').toggleAttribute('disabled', doc.undo.length === 0);
  $('btn-redo').toggleAttribute('disabled', doc.redo.length === 0);
  $('btn-save').classList.toggle('dirty', doc.dirty);
}

function toast(text: string): void {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout((toast as unknown as { t: number }).t);
  (toast as unknown as { t: number }).t = window.setTimeout(() => el.classList.remove('show'), 2200);
}

function setTool(tool: Tool): void {
  state.tool = tool;
  for (const b of document.querySelectorAll<HTMLElement>('#tool button')) b.classList.toggle('on', b.dataset.tool === tool);
}

function setColor(color: string): void {
  state.color = color;
  $<HTMLInputElement>('custom-color').value = color;
  for (const b of document.querySelectorAll<HTMLElement>('.swatch')) b.classList.toggle('on', b.dataset.color === color);
  if (state.tool === 'eraser' || state.tool === 'picker') setTool('pencil');
}

async function selectCharacter(id: ZombieId): Promise<void> {
  state.id = id;
  for (const b of document.querySelectorAll<HTMLElement>('#characters button')) b.classList.toggle('on', b.dataset.id === id);
  TEX = texSizeFor(id);
  resizeLiveTexture(TEX);
  doc = await getDoc(id);
  fitFlatView();
  buildCharacter(id);
  changed();
}

for (const id of characters) {
  const b = document.createElement('button');
  b.dataset.id = id;
  b.textContent = `${ZOMBIES[id].icon} ${ZOMBIES[id].name}`;
  b.addEventListener('click', () => void selectCharacter(id));
  $('characters').appendChild(b);
}

for (const color of PALETTE) {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.dataset.color = color;
  b.style.background = color;
  b.title = color;
  b.addEventListener('click', () => setColor(color));
  $('swatches').appendChild(b);
}
$<HTMLInputElement>('custom-color').addEventListener('input', (e) => setColor((e.target as HTMLInputElement).value));

for (const b of document.querySelectorAll<HTMLElement>('#tool button')) {
  b.addEventListener('click', () => setTool(b.dataset.tool as Tool));
}
for (const b of document.querySelectorAll<HTMLElement>('#size button')) {
  b.addEventListener('click', () => {
    state.size = Number(b.dataset.size);
    for (const o of document.querySelectorAll<HTMLElement>('#size button')) o.classList.toggle('on', o === b);
  });
}
for (const b of document.querySelectorAll<HTMLElement>('#mode button')) {
  b.addEventListener('click', () => {
    state.mode = b.dataset.mode as 'paint' | 'turn';
    for (const o of document.querySelectorAll<HTMLElement>('#mode button')) o.classList.toggle('on', o === b);
  });
}

function toggleMirror(): void {
  state.mirror = !state.mirror;
  $('btn-mirror').classList.toggle('on', state.mirror);
  toast(state.mirror ? '🪞 Mirror on: paint one side, get both' : 'Mirror off');
}

$('btn-mirror').addEventListener('click', toggleMirror);
$('btn-walk').addEventListener('click', () => {
  state.walk = !state.walk;
  $('btn-walk').classList.toggle('on', state.walk);
});
$('btn-undo').addEventListener('click', undo);
$('btn-redo').addEventListener('click', redo);

$('btn-save').addEventListener('click', () => {
  if (saveCustomSkin(state.id, doc.canvas.toDataURL('image/png'))) {
    doc.dirty = false;
    changed();
    toast(`💾 Saved! Press Play to see your ${ZOMBIES[state.id].name}.`);
  } else {
    toast('Could not save (is private browsing on?)');
  }
});

$('btn-reset').addEventListener('click', async () => {
  snapshot(doc);
  await loadOriginal(state.id, doc);
  clearCustomSkin(state.id);
  doc.dirty = false;
  changed();
  toast('⟲ Back to the original (↩️ undo if that was a mistake)');
});

$('btn-download').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = doc.canvas.toDataURL('image/png');
  a.download = `${state.id}.png`;
  a.click();
});

$<HTMLInputElement>('file').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    snapshot(doc);
    drawSkinImage(doc.ctx, img);
    changed();
    toast('⬆ Loaded! Save to use it in the game.');
  } catch {
    toast('That file is not a picture.');
  } finally {
    URL.revokeObjectURL(url);
  }
});

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  } else if ((e.ctrlKey || e.metaKey) && k === 'y') {
    e.preventDefault();
    redo();
  } else if (e.ctrlKey || e.metaKey || e.altKey) {
    return;
  } else if (k === 'b') setTool('pencil');
  else if (k === 'e') setTool('eraser');
  else if (k === 'g') setTool('fill');
  else if (k === 'i') setTool('picker');
  else if (k === 'm') toggleMirror();
});

window.addEventListener('beforeunload', (e) => {
  if ([...docs.values()].some((d) => d.dirty)) e.preventDefault();
});

new ResizeObserver(() => engine.resize()).observe(canvas3d);

engine.runRenderLoop(() => {
  if (!doc) return;
  if (needsDraw) {
    needsDraw = false;
    refresh();
  }
  if (character) {
    const t = performance.now() / 1000;
    const flying = ZOMBIES[state.id].flying;
    animate(character, t, { moving: state.walk, chewing: false, flying: state.walk && flying });
  }
  scene.render();
});

setColor(state.color);
void selectCharacter(state.id);

// Handy for debugging in the browser console.
Object.assign(window, { editor: { state, docs, camera, view: () => view } });
