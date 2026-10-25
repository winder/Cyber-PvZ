// Paints the default skins for some zombies, straight from their models'
// layouts, and writes them to public/skins as PNGs.
//
//   npm run skins             (all of them)
//   npm run skins -- satan    (just one)
//
// Wesley can repaint any of them in the Character Editor; this is only where
// the starting look comes from.

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { MODELS, faceRects, skinUnits, type FaceName, type ModelId, type PartRole, type Rect } from '../src/models/models.ts';

/** Pixels per skin unit. */
const K = 2;

type Color = string | null;
/** A face's painter: pixel (u, v) from the face's top-left, out of (w, h). */
type Paint = (u: number, v: number, w: number, h: number) => Color;

class Skin {
  readonly model: ModelId;
  readonly size: number;
  readonly img: Uint8Array;
  private seed: number;

  constructor(model: ModelId, seed: number) {
    this.model = model;
    this.size = skinUnits(model) * K;
    this.img = new Uint8Array(this.size * this.size * 4);
    this.seed = seed;
  }

  private rnd(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Paint one face of a part, with a little noise so it isn't flat. */
  face(role: PartRole, face: FaceName, paint: Paint): void {
    const part = MODELS[this.model].parts.find((p) => p.role === role);
    if (!part) throw new Error(`${this.model} has no ${role}`);
    const r: Rect = faceRects(part)[face];
    const w = r.w * K, h = r.h * K;
    for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
      const c = paint(u, v, w, h);
      if (!c) continue;
      const k = 0.93 + this.rnd() * 0.14;
      const i = ((r.y * K + v) * this.size + r.x * K + u) * 4;
      for (let ch = 0; ch < 3; ch++) this.img[i + ch] = Math.max(0, Math.min(255, Math.round(parseInt(c.slice(1 + ch * 2, 3 + ch * 2), 16) * k)));
      this.img[i + 3] = 255;
    }
  }

  /** Paint every face of a part; `sides` for the four round the middle. */
  part(role: PartRole, p: { top?: Paint; bottom?: Paint; front?: Paint; back?: Paint; left?: Paint; right?: Paint; sides?: Paint; all?: Paint }): void {
    for (const f of ['top', 'bottom', 'front', 'back', 'left', 'right'] as FaceName[]) {
      const paint = p[f] ?? (f === 'top' || f === 'bottom' ? undefined : p.sides) ?? p.all;
      if (paint) this.face(role, f, paint);
    }
  }

  write(path: string): void {
    const W = this.size;
    const crcTable = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
    const crc = (buf: Buffer) => {
      let c = 0xffffffff;
      for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type), data]);
      const sum = Buffer.alloc(4);
      sum.writeUInt32BE(crc(body));
      return Buffer.concat([len, body, sum]);
    };
    const raw = Buffer.alloc((W * 4 + 1) * W);
    for (let y = 0; y < W; y++) Buffer.from(this.img.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0);
    ihdr.writeUInt32BE(W, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    writeFileSync(path, Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
    ]));
  }
}

const fill = (c: string): Paint => () => c;
const blotch = (u: number, v: number, s: number) => Math.sin(u * 0.5 + s) * Math.cos(v * 0.6 - s * 2) > 0.7;

// ----------------------------------------------------------------------------
//  Satan
// ----------------------------------------------------------------------------

function satan(): Skin {
  const s = new Skin('satan', 666);
  const RED = '#a3170f', RED_D = '#7a0f0a', RED_L = '#c9291b', BLACK = '#141012';
  const FUR = '#2e1d16', FUR_D = '#1c120d', FUR_L = '#4a3022', HOOF = '#0d0b0c';
  const LEATHER = '#1b1a1f', STUD = '#d9dde3', GOLD = '#ffd21f';
  const skin = (u: number, v: number) => (blotch(u, v, 3) ? RED_D : RED);

  // Head: slicked-back black hair to a widow's peak, pointed ears, yellow
  // slit-pupil eyes under arched brows, a fanged grin and a pointy goatee.
  s.part('head', {
    top: (u, v) => (v > 12 && Math.abs(u - 7.5) > 3 ? RED : BLACK),
    bottom: (u) => (Math.abs(u - 7.5) < 2 ? BLACK : RED_D),
    back: (u, v) => (v < 11 ? (u % 3 === 0 ? '#22202a' : BLACK) : RED_D),
    sides: (u, v) => {
      if (v < 4) return BLACK;
      // A pointed ear sticking up.
      if (u >= 5 && u <= 10 && v >= 4 && v <= 11 && v - 4 >= Math.abs(u - 7.5) * 1.6) return RED_L;
      return skin(u, v);
    },
    front: (u, v) => {
      // Widow's peak.
      if (v < 2 || (v < 4 && Math.abs(u - 7.5) < 2.5 - (v - 2))) return BLACK;
      // Arched brows.
      if ((v === 4 && ((u >= 2 && u <= 5) || (u >= 10 && u <= 13))) || (v === 5 && (u === 6 || u === 9))) return BLACK;
      // Eyes: yellow with a slit pupil.
      for (const ex of [4, 11]) {
        const dx = u - ex, dy = v - 6.5;
        if (Math.abs(dx) <= 1.6 && Math.abs(dy) <= 1) return Math.abs(dx) < 0.6 ? BLACK : GOLD;
      }
      if (v === 9 && (u === 7 || u === 8)) return RED_D; // nostrils
      // The grin, with fangs.
      if (v === 11 && u >= 3 && u <= 12) return BLACK;
      if (v === 12 && u >= 4 && u <= 11) return u === 5 || u === 10 ? '#f4efe4' : '#3a0505';
      if (v === 13 && (u === 5 || u === 10)) return '#f4efe4';
      // The goatee, to a point.
      if (v >= 13 && Math.abs(u - 7.5) <= 2.5 - (v - 13) * 0.8) return BLACK;
      return v > 10 ? RED_D : skin(u, v);
    },
  });

  // Body: an open black leather vest, studded, over a bare red chest. A
  // horned skull on the back.
  const vest = (u: number, v: number) => ((u + v) % 6 === 0 && v % 4 === 1 ? STUD : LEATHER);
  s.part('body', {
    top: (u) => (u < 4 || u > 15 ? LEATHER : RED),
    bottom: fill(RED_D),
    sides: vest,
    front: (u, v, w) => {
      const open = 5 + v * 0.15;
      if (Math.abs(u - w / 2 + 0.5) > open) return v % 4 === 1 && u % 3 === 0 ? STUD : LEATHER;
      // Pecs.
      if (v === 8 && Math.abs(u - w / 2 + 0.5) > 0.5 && Math.abs(u - w / 2 + 0.5) < 4) return RED_D;
      return Math.abs(u - w / 2 + 0.5) < 0.5 ? RED_D : RED;
    },
    back: (u, v, w) => {
      const cx = w / 2 - 0.5, dx = u - cx, dy = v - 9;
      // Horns.
      if (dy < -3 && dy > -7 && Math.abs(Math.abs(dx) - 4 - (dy + 5) * 0.4) < 0.9) return '#e9e4c8';
      // The skull.
      if (dx * dx / 16 + dy * dy / 14 < 1) {
        if ((Math.abs(dx - 1.8) < 1 || Math.abs(dx + 1.8) < 1) && Math.abs(dy + 0.5) < 1.2) return BLACK;
        if (dy > 2 && Math.abs(dx) < 2.2 && u % 2 === 0) return BLACK;
        return '#e9e4c8';
      }
      return vest(u, v);
    },
  });

  // The gut: big and round and red, a belt with a flaming skull buckle under it.
  s.part('gut', {
    top: fill(RED),
    bottom: fill(RED_D),
    sides: (u, v, w, h) => (v >= h - 3 ? LEATHER : skin(u, v)),
    front: (u, v, w, h) => {
      if (v >= h - 3) {
        if (Math.abs(u - w / 2 + 0.5) < 2.5) return Math.abs(u - w / 2 + 0.5) < 1.5 && v === h - 2 ? '#ff6a10' : GOLD;
        return u % 4 === 0 ? STUD : LEATHER;
      }
      if (Math.abs(u - w / 2 + 0.5) < 0.8 && Math.abs(v - h * 0.55) < 0.8) return RED_D; // the navel
      // Shading round the curve of it.
      const dx = (u - w / 2) / (w / 2), dy = (v - h * 0.45) / (h * 0.6);
      return dx * dx + dy * dy > 0.85 ? RED_D : dx * dx + dy * dy < 0.25 ? RED_L : RED;
    },
    back: (u, v, w, h) => (v >= h - 3 ? LEATHER : RED),
  });

  // Arms: red, with studded black wristbands and long black claws.
  for (const role of ['armR', 'armL'] as const) {
    s.part(role, {
      top: fill(LEATHER),
      bottom: (u) => (u % 3 === 0 ? BLACK : RED_D),
      sides: (u, v, w, h) => {
        if (v < 6) return v % 5 === 2 && u % 3 === 1 ? STUD : LEATHER; // vest shoulder
        if (v >= h - 7 && v < h - 3) return u % 3 === 1 && v === h - 5 ? STUD : BLACK; // wristband
        if (v >= h - 3) return u % 2 ? RED_D : BLACK; // claws
        return skin(u, v);
      },
    });
  }

  // Goat legs: shaggy dark fur, ending in black hooves.
  const fur = (u: number, v: number) => {
    const strand = (u * 7 + Math.floor(v / 3) * 3) % 5;
    return strand === 0 ? FUR_L : strand === 1 ? FUR_D : FUR;
  };
  for (const role of ['legR', 'legL'] as const) s.part(role, { top: fill(RED_D), bottom: fill(FUR_D), sides: fur });
  for (const role of ['footR', 'footL'] as const) {
    s.part(role, {
      top: fill(FUR_D),
      bottom: fill(HOOF),
      sides: (u, v, w, h) => (v >= h - 5 ? (v === h - 5 ? '#2a2326' : HOOF) : fur(u, v)),
      front: (u, v, w, h) => (v >= h - 5 ? (u === Math.floor(w / 2) ? '#000000' : HOOF) : fur(u, v)), // split hoof
    });
  }

  // The tail: red, getting darker toward the tip.
  s.part('tail', { all: (u, v) => (v % 7 === 0 ? RED_D : RED) });
  s.part('tailTip', { all: (u, v, w, h) => (v > h * 0.5 ? RED_D : RED) });
  return s;
}

// ----------------------------------------------------------------------------
//  Biker Zombie (humanoid layout)
// ----------------------------------------------------------------------------

function biker(): Skin {
  const s = new Skin('biker', 4321);
  const SKIN = '#8fae7a', SKIN_D = '#6f8c5e', ROT = '#5b6e4a';
  const LEATHER = '#16151a', LEATHER_L = '#2c2a33', ZIP = '#c9ccd2', BANDANA = '#b3121b', BEARD = '#8a8a8a';
  const DENIM = '#2d3a55', DENIM_D = '#222c42', BOOT = '#1a1210';
  const skin = (u: number, v: number) => (blotch(u, v, 2) ? ROT : SKIN);

  // A red bandana tied over the head, shades, a big grey beard.
  s.part('head', {
    top: (u, v) => ((u + v) % 5 === 0 ? '#f2efe6' : BANDANA),
    bottom: fill(BEARD),
    back: (u, v) => (v < 6 ? ((u + v) % 5 === 0 ? '#f2efe6' : BANDANA) : v < 8 && Math.abs(u - 7.5) < 2 ? BANDANA : BEARD),
    sides: (u, v) => (v < 5 ? BANDANA : v > 9 ? BEARD : skin(u, v)),
    front: (u, v) => {
      if (v < 4) return (u + v) % 5 === 0 ? '#f2efe6' : BANDANA;
      if (v >= 5 && v <= 7 && (u <= 6 || u >= 9)) return v === 5 ? '#3a3a3a' : '#0b0b0b'; // shades
      if (v === 6 && (u === 7 || u === 8)) return '#3a3a3a';
      if (v >= 10) return (v === 11 && u >= 5 && u <= 10) ? '#2a1f2f' : BEARD;
      if (v === 9 && (u <= 4 || u >= 11)) return BEARD;
      return skin(u, v);
    },
  });

  // A leather jacket with a winged skull on the back.
  const jacket = (u: number, v: number) => (v % 7 === 3 && u % 5 === 0 ? LEATHER_L : LEATHER);
  s.part('body', {
    top: fill(LEATHER),
    bottom: fill(DENIM),
    sides: jacket,
    front: (u, v, w) => {
      const cx = w / 2 - 0.5;
      if (Math.abs(u - cx) < 0.6 && v > 3) return ZIP; // zip, half open
      if (v < 6 && Math.abs(u - cx) < 3.5 - v * 0.5) return '#f2efe6'; // white tee at the collar
      if (v === 12 && u > 2 && u < 6) return '#d23a1a'; // a patch
      return jacket(u, v);
    },
    back: (u, v, w) => {
      const dx = u - (w / 2 - 0.5), dy = v - 10;
      if (Math.abs(dy) < 2 && Math.abs(dx) > 2 && Math.abs(dx) < 7 && (Math.abs(dx) + dy) % 2 < 1) return '#e9e4c8'; // wings
      if (dx * dx + dy * dy < 7) return Math.abs(dx) > 0.8 && Math.abs(dx) < 2 && dy < 0 ? LEATHER : '#e9e4c8'; // skull
      if (v === 3 || v === 20) return '#d23a1a'; // patch rockers
      return jacket(u, v);
    },
  });
  for (const role of ['armR', 'armL'] as const) {
    s.part(role, {
      top: fill(LEATHER),
      bottom: fill(SKIN_D),
      sides: (u, v, w, h) => (v >= h - 4 ? (v === h - 4 ? '#3a3a3a' : '#111111') : jacket(u, v)), // gloves
    });
  }
  for (const role of ['legR', 'legL'] as const) {
    s.part(role, {
      top: fill(DENIM),
      bottom: fill(BOOT),
      sides: (u, v, w, h) => (v >= h - 7 ? (v === h - 7 ? '#5a4030' : BOOT) : u % 4 === 0 ? DENIM_D : DENIM),
    });
  }
  return s;
}

// ----------------------------------------------------------------------------
//  Roadie Zombie (humanoid layout)
// ----------------------------------------------------------------------------

function roadie(): Skin {
  const s = new Skin('humanoid', 2468);
  const SKIN = '#8fae7a', SKIN_D = '#6f8c5e', ROT = '#5b6e4a';
  const TEE = '#121214', BEANIE = '#4a4f57', SHORTS = '#8a7a52', SHORTS_D = '#6e6040', BOOT = '#191512', TAPE = '#b9bec6';
  const skin = (u: number, v: number) => (blotch(u, v, 5) ? ROT : SKIN);
  // Letters on a 3×5 grid, for CREW.
  const GLYPHS: Record<string, string[]> = {
    C: ['111', '100', '100', '100', '111'], R: ['110', '101', '110', '101', '101'],
    E: ['111', '100', '110', '100', '111'], W: ['101', '101', '101', '111', '101'],
  };
  const text = (word: string, u: number, v: number, x0: number, y0: number, px: number) => {
    const col = Math.floor((u - x0) / px), row = Math.floor((v - y0) / px);
    const letter = Math.floor(col / 4), cx = col % 4;
    if (row < 0 || row > 4 || letter < 0 || letter >= word.length || cx > 2 || u < x0) return false;
    return GLYPHS[word[letter]][row][cx] === '1';
  };

  // A grey beanie, tired eyes, and a headset mic.
  s.part('head', {
    top: (u, v) => (u % 3 === 0 ? '#3e434a' : BEANIE),
    bottom: fill(SKIN_D),
    back: (u, v) => (v < 6 ? (u % 3 === 0 ? '#3e434a' : BEANIE) : skin(u, v)),
    sides: (u, v) => (v < 6 ? BEANIE : v === 9 && u > 2 ? '#111111' : skin(u, v)),
    front: (u, v) => {
      if (v < 5) return v === 4 ? '#3e434a' : BEANIE;
      for (const ex of [4, 11]) if (Math.abs(u - ex) <= 1 && (v === 7 || v === 8)) return v === 7 ? '#2c3526' : '#e9e4c8';
      if (v === 8 && (u === 4 || u === 11)) return '#ff3b2f'; // bloodshot
      if (v === 12 && u >= 5 && u <= 10) return '#2a1f2f';
      if (v === 11 && u >= 11) return '#111111'; // headset mic
      return skin(u, v);
    },
  });

  // A black crew tee: CREW on the back, a laminated pass on a lanyard at the front.
  s.part('body', {
    top: fill(TEE),
    bottom: fill(SHORTS),
    sides: (u, v, w, h) => (v >= h - 4 ? (v === h - 4 ? '#3a2a1a' : SHORTS) : TEE),
    front: (u, v, w, h) => {
      if (v >= h - 4) return v === h - 4 ? '#3a2a1a' : u === 3 ? TAPE : SHORTS; // belt, a roll of tape on it
      if (v < 8 && Math.abs(Math.abs(u - (w / 2 - 0.5)) - (3.5 - v * 0.4)) < 0.6) return '#2b6bff'; // lanyard
      if (v >= 8 && v <= 13 && u >= 6 && u <= 9) return v === 8 ? '#2b6bff' : v < 11 ? '#ffd21f' : '#f2efe6'; // the pass
      if (text('CREW', u, v, 2, 16, 1)) return '#f2efe6';
      return TEE;
    },
    back: (u, v, w, h) => {
      if (v >= h - 4) return v === h - 4 ? '#3a2a1a' : SHORTS;
      if (text('CREW', u, v, 1, 5, 1)) return '#f2efe6';
      return TEE;
    },
  });
  for (const role of ['armR', 'armL'] as const) {
    s.part(role, {
      top: fill(TEE),
      bottom: fill(SKIN_D),
      sides: (u, v, w, h) => (v < 7 ? TEE : v >= h - 3 ? '#2f2f2f' : skin(u, v)), // work gloves
    });
  }
  for (const role of ['legR', 'legL'] as const) {
    s.part(role, {
      top: fill(SHORTS),
      bottom: fill(BOOT),
      sides: (u, v, w, h) => {
        if (v < 9) return v === 4 && u > 1 && u < 6 ? SHORTS_D : SHORTS; // a cargo pocket
        if (v >= h - 6) return v === h - 6 ? '#3a2a1a' : BOOT;
        return skin(u, v);
      },
    });
  }
  return s;
}

// ----------------------------------------------------------------------------
//  Riot Shield Bot (humanoid layout)
// ----------------------------------------------------------------------------

function riotBot(): Skin {
  const s = new Skin('humanoid', 1357);
  const SKIN = '#93b07c', SKIN_D = '#718d5f', ROT = '#5c704b';
  const HELMET = '#1d2333', HELMET_L = '#2c3550', VISOR = '#57c8ff', VISOR_D = '#2a7fd6';
  const ARMOR = '#27304a', ARMOR_L = '#3a4669', PAD = '#161b28', GLOW = '#6fd8ff', PANTS = '#2b3140', BOOT = '#111318';
  const skin = (u: number, v: number) => (blotch(u, v, 3) ? ROT : SKIN);
  // Letters on a 3×5 grid, for RIOT.
  const GLYPHS: Record<string, string[]> = {
    R: ['110', '101', '110', '101', '101'], I: ['111', '010', '010', '010', '111'],
    O: ['111', '101', '101', '101', '111'], T: ['111', '010', '010', '010', '010'],
  };
  const text = (word: string, u: number, v: number, x0: number, y0: number) => {
    const col = u - x0, row = v - y0;
    const letter = Math.floor(col / 4), cx = col % 4;
    if (row < 0 || row > 4 || col < 0 || letter >= word.length || cx > 2) return false;
    return GLYPHS[word[letter]][row][cx] === '1';
  };

  // A riot helmet with a glowing blue visor; red eyes and a rotten jaw below it.
  s.part('head', {
    top: (u, v) => (u === 7 || u === 8 ? HELMET_L : HELMET),
    bottom: fill(SKIN_D),
    back: (u, v) => (v < 11 ? (v === 10 ? HELMET_L : HELMET) : skin(u, v)),
    sides: (u, v, w) => (v < 4 || (v < 11 && u > 3) ? (v === 3 ? HELMET_L : HELMET) : v < 11 ? (v === 10 ? VISOR_D : VISOR) : skin(u, v)),
    front: (u, v) => {
      if (v < 3) return v === 2 ? HELMET_L : HELMET;
      if (v < 10) {
        if (v === 3 || v === 9) return VISOR_D; // the visor's edge
        for (const ex of [4, 11]) if (Math.abs(u - ex) <= 1 && v >= 5 && v <= 6) return v === 5 ? '#ff2040' : '#b0102a';
        return (u + v) % 7 === 0 ? '#bfeaff' : VISOR; // glints
      }
      if (v === 12 && u >= 4 && u <= 11) return u % 2 ? '#2a1f2f' : '#d8d2b0'; // teeth
      return skin(u, v);
    },
  });

  // An armored vest: plates down the front with a glowing strip, RIOT on the back.
  s.part('body', {
    top: fill(ARMOR),
    bottom: fill(PANTS),
    sides: (u, v, w, h) => (v >= h - 4 ? (v === h - 4 ? PAD : PANTS) : v % 6 === 5 ? PAD : ARMOR),
    front: (u, v, w, h) => {
      if (v >= h - 4) return v === h - 4 ? PAD : PANTS;
      if (v === 2 && u > 2 && u < w - 3) return GLOW;
      if (u === w / 2 - 1 || u === w / 2) return PAD; // the seam
      if (v % 6 === 5) return PAD;
      return (v % 6 < 2) ? ARMOR_L : ARMOR;
    },
    back: (u, v, w, h) => {
      if (v >= h - 4) return v === h - 4 ? PAD : PANTS;
      if (text('RIOT', u, v, 1, 4)) return GLOW;
      return v % 6 === 5 ? PAD : ARMOR;
    },
  });
  // Armored shoulders, rotten forearms, black gloves.
  for (const role of ['armR', 'armL'] as const) {
    s.part(role, {
      top: fill(ARMOR_L),
      bottom: fill(PAD),
      sides: (u, v, w, h) => (v < 8 ? (v === 7 ? PAD : ARMOR_L) : v >= h - 4 ? PAD : skin(u, v)),
    });
  }
  // Dark trousers, glowing knee pads, boots.
  for (const role of ['legR', 'legL'] as const) {
    s.part(role, {
      top: fill(PANTS),
      bottom: fill(BOOT),
      sides: (u, v, w, h) => {
        if (v >= 8 && v <= 12) return v === 10 ? GLOW : PAD;
        if (v >= h - 6) return v === h - 6 ? PAD : BOOT;
        return v > 14 && blotch(u, v, 7) ? skin(u, v) : PANTS; // torn, rotten skin showing
      },
    });
  }
  return s;
}

// ----------------------------------------------------------------------------
//  Headless Horseman (humanoid layout, no head)
// ----------------------------------------------------------------------------

function horseman(): Skin {
  const s = new Skin('horseman', 1031);
  const STEEL = '#b9bfc9', STEEL_L = '#e2e6ec', STEEL_D = '#7d838f', IRON = '#3a3d45', RIVET = '#f4f6f9';
  const MAIL = '#8a909b', MAIL_D = '#5c616b', GLOVE = '#16131a', BELT = '#2a1a14', GOLD = '#c9a43a';
  const STUMP = '#4a0a0e', STUMP_D = '#1c0406', GREEN = '#5dff7a';
  // Plate armor: bright toward the top of each plate, darker at the lap below it.
  const plate = (v: number, every: number) => (v % every === every - 1 ? STEEL_D : v % every === 0 ? STEEL_L : STEEL);
  const mail = (u: number, v: number) => ((u + (v % 2)) % 2 ? MAIL : MAIL_D);

  // The breastplate: a ridge down the middle, rivets, a belt with a gold
  // buckle. On top, a gorget round the stump where his head should be.
  s.part('body', {
    top: (u, v, w, h) => {
      const dx = (u - (w / 2 - 0.5)) / (w / 2), dy = (v - (h / 2 - 0.5)) / (h / 2);
      const r = dx * dx + dy * dy;
      if (r < 0.18) return (u + v) % 4 === 0 ? GREEN : STUMP_D; // the dark hole, a green glow deep inside
      if (r < 0.5) return STUMP;
      return r < 0.75 ? STEEL_D : STEEL;
    },
    bottom: fill(MAIL_D),
    sides: (u, v, w, h) => (v >= h - 5 ? (v === h - 5 ? BELT : mail(u, v)) : plate(v, 6)),
    front: (u, v, w, h) => {
      const cx = w / 2 - 0.5;
      if (v >= h - 5) {
        if (v === h - 5 || v === h - 4) return Math.abs(u - cx) < 1.6 ? GOLD : BELT;
        return mail(u, v); // a mail skirt below the belt
      }
      if (Math.abs(u - cx) < 0.6) return STEEL_L; // the ridge
      if ((u === 1 || u === w - 2) && v % 4 === 2) return RIVET;
      if (v < 3) return v === 0 ? STEEL_D : IRON; // the gorget's rim
      return plate(v, 6);
    },
    back: (u, v, w, h) => (v >= h - 5 ? (v === h - 5 ? BELT : mail(u, v)) : v < 3 ? IRON : plate(v, 6)),
  });
  // Pauldrons on the shoulders, mail at the elbow, black gauntlets.
  for (const role of ['armR', 'armL'] as const) {
    s.part(role, {
      top: fill(STEEL_L),
      bottom: fill(GLOVE),
      sides: (u, v, w, h) => {
        if (v < 8) return v === 7 ? STEEL_D : v % 3 === 0 ? STEEL_L : STEEL;
        if (v < 12) return mail(u, v);
        if (v >= h - 6) return v === h - 6 ? IRON : GLOVE;
        return plate(v, 4);
      },
    });
  }
  // Greaves with a knee cop, over black riding boots.
  for (const role of ['legR', 'legL'] as const) {
    s.part(role, {
      top: fill(MAIL_D),
      bottom: fill(GLOVE),
      sides: (u, v, w, h) => {
        if (v >= h - 7) return v === h - 7 ? IRON : GLOVE;
        if (v >= 9 && v <= 13) return v === 11 && u % 4 === 1 ? RIVET : v === 9 || v === 13 ? STEEL_D : STEEL_L;
        return plate(v, 5);
      },
    });
  }
  return s;
}

// ----------------------------------------------------------------------------
//  The War Zone
// ----------------------------------------------------------------------------

const ZSKIN = '#8fae7a', ZSKIN_D = '#6f8c5e', ZROT = '#5b6e4a';
const BLOOD = '#8a0d0d', BLOOD_D = '#5a0606';
/** Rotten green skin, blotched. */
const zskin = (u: number, v: number, s = 1) => (blotch(u, v, s) ? ZROT : ZSKIN);
/** Splashes of blood, here and there. */
const splat = (u: number, v: number, s: number) => Math.sin(u * 0.9 + s * 3.1) * Math.sin(v * 0.7 - s * 1.7) > 0.82;
/** Letters on a 3×5 grid. */
const GLYPHS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  A: ['111', '101', '111', '101', '101'], C: ['111', '100', '100', '100', '111'], E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'], I: ['111', '010', '010', '010', '111'], K: ['101', '110', '100', '110', '101'],
  N: ['111', '101', '101', '101', '101'], O: ['111', '101', '101', '101', '111'], P: ['111', '101', '111', '100', '100'],
  R: ['110', '101', '110', '101', '101'], S: ['111', '100', '111', '001', '111'], T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'], W: ['101', '101', '101', '111', '101'], Y: ['101', '101', '010', '010', '010'],
};
/** Is pixel (u, v) part of `word`, written from (x0, y0) one pixel per grid square? */
const text = (word: string, u: number, v: number, x0: number, y0: number) => {
  const col = u - x0, row = v - y0;
  const letter = Math.floor(col / 4), cx = col % 4;
  if (row < 0 || row > 4 || col < 0 || letter >= word.length || cx > 2) return false;
  const g = GLYPHS[word[letter]];
  return !!g && g[row][cx] === '1';
};

/**
 * A zombie's face (16×16): dead eyes (one maybe missing or blacked), a
 * slack mouth of crooked teeth. `brow` darkens the brow line.
 */
function zombieFace(u: number, v: number, opts: { seed: number; eyes?: string; blackEye?: boolean; stitches?: boolean }): string {
  for (const ex of [4, 11]) {
    if (Math.abs(u - ex) <= 1 && (v === 6 || v === 7)) {
      if (opts.blackEye && ex === 4) return v === 6 ? '#2a1f3a' : '#ff3b2f';
      return v === 6 ? (opts.eyes ?? '#e9e4c8') : '#e9e4c8';
    }
    if (Math.abs(u - ex) <= 2 && v === 5) return ZSKIN_D;
    if (opts.blackEye && ex === 4 && Math.abs(u - ex) <= 2 && v >= 5 && v <= 8) return '#3e2f4a';
  }
  if (v === 6 && (u === 4 || u === 11)) return '#ff3b2f';
  if (v === 9 && (u === 7 || u === 8)) return ZSKIN_D;
  if (v === 11 && u >= 4 && u <= 11) return '#2a1f2f';
  if (v === 12 && u >= 4 && u <= 11) return u % 2 ? '#2a1f2f' : '#d8d2b0';
  if (opts.stitches && u === 13 && v >= 3 && v <= 12) return v % 2 ? '#1a1414' : ZROT;
  if (opts.stitches && v % 2 === 0 && v >= 3 && v <= 12 && (u === 12 || u === 14)) return '#1a1414';
  return zskin(u, v, opts.seed);
}

/** An orange (or striped) prison outfit, with a number on the chest and the back. */
function prisoner(s: Skin, look: 'orange' | 'stripes', number: string, seed: number, extras: { bald?: boolean; cap?: boolean; blackEye?: boolean; torn?: boolean } = {}): Skin {
  const ORANGE = '#ff7a1a', ORANGE_D = '#d45a0c', BLACK = '#161616', WHITE = '#ecebe4';
  const cloth = (u: number, v: number) => (look === 'orange'
    ? ((u * 3 + v * 5) % 11 === 0 ? ORANGE_D : ORANGE)
    : (Math.floor(v / 4) % 2 ? BLACK : WHITE));
  const torn = (u: number, v: number) => extras.torn && blotch(u, v, seed + 2) && v > 10;
  const HAIR = '#2a2420';
  s.part('head', {
    top: (u, v) => (extras.cap ? cloth(u, v) : extras.bald ? zskin(u, v, seed) : (u + v) % 3 === 0 ? ZSKIN_D : HAIR),
    bottom: fill(ZSKIN_D),
    back: (u, v) => (extras.cap && v < 4 ? cloth(u, v) : !extras.bald && v < 5 ? HAIR : zskin(u, v, seed)),
    sides: (u, v) => (extras.cap && v < 4 ? cloth(u, v) : !extras.bald && v < 3 ? HAIR : zskin(u, v, seed)),
    front: (u, v) => {
      if (extras.cap && v < 3) return cloth(u, v + 1);
      if (!extras.bald && !extras.cap && v < 2) return HAIR;
      // A scruffy stubble on the jaw.
      if (v >= 10 && (u + v * 3) % 4 === 0) return '#3e4a34';
      return zombieFace(u, v, { seed, blackEye: extras.blackEye, stitches: extras.bald });
    },
  });
  s.part('body', {
    top: (u, v) => cloth(u, v),
    bottom: (u, v) => cloth(u, v),
    sides: (u, v) => (torn(u, v) ? zskin(u, v, seed) : cloth(u, v)),
    front: (u, v, w) => {
      if (v < 3 && Math.abs(u - (w / 2 - 0.5)) < 3 - v) return zskin(u, v, seed); // the V-neck
      // A patch with the prisoner number.
      if (v >= 5 && v <= 11 && u >= 2 && u <= 14) return text(number, u, v, 3, 6) ? BLACK : WHITE;
      if (torn(u, v)) return zskin(u, v, seed);
      return cloth(u, v);
    },
    back: (u, v) => {
      if (v >= 4 && v <= 10 && u >= 1 && u <= 14) return text(number, u, v, 2, 5) ? (look === 'orange' ? BLACK : ORANGE) : look === 'orange' ? ORANGE : WHITE;
      if (text('PRISON', u, v, -6, 15) || text('JAIL', u, v, 0, 15)) return BLACK;
      return cloth(u, v);
    },
  });
  for (const role of ['armR', 'armL'] as const) {
    s.part(role, {
      top: (u, v) => cloth(u, v),
      bottom: fill(ZSKIN_D),
      sides: (u, v, w, h) => (v >= h - 5 ? zskin(u, v, seed) : torn(u, v) ? zskin(u, v, seed) : cloth(u, v)),
    });
  }
  for (const role of ['legR', 'legL'] as const) {
    s.part(role, {
      top: (u, v) => cloth(u, v),
      bottom: fill('#1a1716'),
      sides: (u, v, w, h) => (v >= h - 4 ? (v === h - 4 ? '#f2efe6' : '#1a1716') : torn(u, v) ? zskin(u, v, seed) : cloth(u, v)),
    });
  }
  return s;
}

function convict(): Skin {
  return prisoner(new Skin('humanoid', 8801), 'orange', '2187', 4, { blackEye: true });
}

function jailbird(): Skin {
  return prisoner(new Skin('humanoid', 8802), 'stripes', '1313', 6, { cap: true });
}

function chainGang(): Skin {
  return prisoner(new Skin('humanoid', 8803), 'orange', '6660', 8, { bald: true, torn: true });
}

/** Woodland camouflage: blotches of green, brown and black. */
const camo = (u: number, v: number, s: number) => {
  const a = Math.sin(u * 0.55 + s) + Math.sin(v * 0.45 - s * 0.7) + Math.sin((u + v) * 0.3 + s * 2);
  return a > 1.3 ? '#2a2a1a' : a > 0.4 ? '#5a4a2a' : a > -0.6 ? '#4f6a2e' : '#6e7a42';
};

function woundedSoldier(): Skin {
  const s = new Skin('humanoid', 8804);
  const BANDAGE = '#e8e4d8', BANDAGE_D = '#c9c4b4';
  const bandage = (u: number, v: number) => (splat(u, v, 1) || (v % 5 === 2 && u % 4 === 1) ? BLOOD : v % 3 === 0 ? BANDAGE_D : BANDAGE);
  // A bandage wrapped round the head over one eye, soaked through.
  s.part('head', {
    top: (u, v) => (v > 5 && v < 10 ? bandage(u, v) : '#2a2420'),
    bottom: fill(ZSKIN_D),
    back: (u, v) => (v >= 3 && v <= 7 ? bandage(u, v) : v < 3 ? '#2a2420' : zskin(u, v, 9)),
    sides: (u, v) => (v >= 3 && v <= 7 ? bandage(u, v) : v < 3 ? '#2a2420' : zskin(u, v, 9)),
    front: (u, v) => {
      if (v >= 3 && v <= 7 && u <= 8) return u < 7 && v > 4 && v < 7 ? BLOOD : bandage(u, v);
      if (v >= 3 && v <= 4) return bandage(u, v);
      if (v < 3) return '#2a2420';
      if (v >= 12 && splat(u, v, 4)) return BLOOD;
      return zombieFace(u, v, { seed: 9 });
    },
  });
  // Camo fatigues, torn and bloodied; dog tags; a bandaged chest wound.
  const fatigues = (u: number, v: number) => (splat(u, v, 5) ? BLOOD : splat(u, v, 7) ? BLOOD_D : camo(u, v, 1));
  s.part('body', {
    top: (u, v) => camo(u, v, 1),
    bottom: fill('#3a3a22'),
    sides: (u, v, w, h) => (v >= h - 3 ? (v === h - 3 ? '#2a2016' : '#3a3a22') : fatigues(u, v)),
    front: (u, v, w, h) => {
      const cx = w / 2 - 0.5;
      if (v >= h - 3) return v === h - 3 ? (Math.abs(u - cx) < 1.5 ? '#c9a43a' : '#2a2016') : camo(u, v, 1);
      if (v < 5 && Math.abs(Math.abs(u - cx) - (2.5 - v * 0.4)) < 0.6) return '#c0c4ca'; // dog tag chain
      if (v === 5 && Math.abs(u - cx) < 1) return '#d8dce2'; // the tags
      // A wad of bandage on the chest, bleeding through.
      if (v >= 9 && v <= 15 && u >= 9 && u <= 14) return (u - 11) ** 2 + (v - 12) ** 2 < 4 ? BLOOD : bandage(u, v);
      if (Math.abs(u - cx) < 0.5) return '#2a2a1a';
      return fatigues(u, v);
    },
    back: (u, v) => (text('US', u, v, 5, 4) ? '#1a1a12' : fatigues(u, v)),
  });
  for (const [role, wrap] of [['armR', true], ['armL', false]] as const) {
    s.part(role, {
      top: (u, v) => camo(u, v, 2),
      bottom: fill(ZSKIN_D),
      sides: (u, v, w, h) => {
        if (v >= h - 4) return zskin(u, v, 3);
        if (wrap && v >= 10 && v <= 16) return bandage(u, v); // a bandaged forearm
        return fatigues(u, v);
      },
    });
  }
  for (const [role, wrap] of [['legR', false], ['legL', true]] as const) {
    s.part(role, {
      top: (u, v) => camo(u, v, 3),
      bottom: fill('#1a1410'),
      sides: (u, v, w, h) => {
        if (v >= h - 7) return v === h - 7 ? '#2a2016' : (u + v) % 4 === 0 ? '#2a2016' : '#1a1410'; // laced boots
        if (wrap && v >= 4 && v <= 10) return bandage(u, v);
        return fatigues(u, v);
      },
    });
  }
  return s;
}

function chef(): Skin {
  const s = new Skin('chef', 8805);
  const WHITE = '#efece2', WHITE_D = '#cfcabb', BUTTON = '#2a2a2a', CHECK_D = '#1a1a1a', CHECK_L = '#d8d8d0';
  const KERCHIEF = '#c4161c', SKIN = '#9ab884', SKIN_D = '#7a9a66';
  const jacket = (u: number, v: number) => (splat(u, v, 2) ? BLOOD : splat(u, v, 3) ? BLOOD_D : v % 6 === 5 ? WHITE_D : WHITE);
  const jowl = (u: number, v: number) => (blotch(u, v, 11) ? SKIN_D : SKIN);
  // A fat face: heavy brows, little mean eyes, a big curly mustache, double chin.
  s.part('head', {
    top: fill(WHITE),
    bottom: fill(SKIN_D),
    back: (u, v) => (v < 3 ? WHITE : v < 6 ? '#3a2a20' : jowl(u, v)),
    sides: (u, v) => (v < 3 ? WHITE : v >= 12 ? SKIN_D : jowl(u, v)),
    front: (u, v) => {
      if (v < 2) return WHITE; // the hat's band
      if (v === 4 && ((u >= 2 && u <= 6) || (u >= 9 && u <= 13))) return '#2a1f18'; // brows, scowling
      if (v === 5 && (u === 6 || u === 9)) return '#2a1f18';
      if (v === 6 && (u === 4 || u === 11)) return '#ffdd33';
      if (v === 6 && (u === 3 || u === 5 || u === 10 || u === 12)) return '#e9e4c8';
      if (v >= 7 && v <= 9 && u >= 6 && u <= 9) return v === 9 && (u === 6 || u === 9) ? '#5a3a30' : '#c46a6a'; // a big red nose
      // The mustache, curling up at the ends.
      if (v === 10 && u >= 3 && u <= 12) return '#2a1f18';
      if (v === 9 && (u === 2 || u === 13)) return '#2a1f18';
      if (v === 8 && (u === 1 || u === 14)) return '#2a1f18';
      if (v === 12 && u >= 5 && u <= 10) return u % 2 ? '#3a0a0a' : '#d8d2b0';
      if (v >= 14) return SKIN_D; // the double chin
      return blotch(u, v, 11) ? ZROT : SKIN;
    },
  });
  // A double-breasted chef's jacket, splashed with blood, a red kerchief.
  s.part('body', {
    top: fill(WHITE),
    bottom: fill(WHITE),
    sides: jacket,
    front: (u, v, w) => {
      const cx = w / 2 - 0.5;
      if (v < 3 && Math.abs(u - cx) < 4) return KERCHIEF;
      if ((u === Math.round(cx - 4) || u === Math.round(cx + 4)) && v % 4 === 1 && v > 3) return BUTTON;
      return jacket(u, v);
    },
    back: (u, v, w) => (v < 2 && Math.abs(u - (w / 2 - 0.5)) < 3 ? KERCHIEF : jacket(u, v)),
  });
  // The gut: an apron tied round it, filthy, a ladle tucked in.
  s.part('gut', {
    top: fill(WHITE),
    bottom: (u) => (u % 3 === 0 ? CHECK_D : CHECK_L),
    sides: (u, v, w, h) => (v === 2 ? '#a89f86' : jacket(u, v)),
    front: (u, v, w, h) => {
      if (v === 1) return '#a89f86'; // the apron strings
      if (splat(u, v, 9) || splat(u, v, 4)) return BLOOD;
      if ((u + v) % 9 === 0) return '#b8a888';
      return v > h - 3 ? WHITE_D : WHITE;
    },
    back: jacket,
  });
  for (const role of ['armR', 'armL'] as const) {
    s.part(role, {
      top: fill(WHITE),
      bottom: fill(SKIN_D),
      sides: (u, v, w, h) => (v >= h - 6 ? (v === h - 6 ? WHITE_D : jowl(u, v)) : jacket(u, v)), // sleeves rolled up
    });
  }
  // Checked kitchen trousers and black clogs.
  for (const role of ['legR', 'legL'] as const) {
    s.part(role, {
      top: fill(CHECK_D),
      bottom: fill('#111111'),
      sides: (u, v, w, h) => (v >= h - 4 ? '#111111' : (Math.floor(u / 2) + Math.floor(v / 2)) % 2 ? CHECK_D : CHECK_L),
    });
  }
  return s;
}

function executioner(): Skin {
  const s = new Skin('executioner', 8806);
  const HOOD = '#141214', HOOD_L = '#2a262a', LEATHER = '#3a2618', LEATHER_D = '#24170e', BUCKLE = '#b8b4a8';
  const GREY = '#8a9a80', GREY_D = '#6a7a62';
  const flesh = (u: number, v: number) => (blotch(u, v, 13) ? GREY_D : GREY);
  // A black hood with two eye holes, glowing red inside.
  s.part('head', {
    top: (u, v) => ((u + v) % 7 === 0 ? HOOD_L : HOOD),
    bottom: fill(HOOD),
    back: (u, v) => ((u * 2 + v) % 9 === 0 ? HOOD_L : HOOD),
    sides: (u, v) => ((u * 2 + v) % 9 === 0 ? HOOD_L : HOOD),
    front: (u, v) => {
      for (const ex of [4.5, 10.5]) {
        const dx = u - ex, dy = v - 6.5;
        if (dx * dx / 4 + dy * dy / 2.2 < 1) return Math.abs(dx) < 0.8 && Math.abs(dy) < 0.8 ? '#ff2a1a' : '#4a0a08';
      }
      if (v === 12 && u >= 6 && u <= 9) return HOOD_L; // stitched mouth
      return (u * 2 + v) % 9 === 0 ? HOOD_L : HOOD;
    },
  });
  // A bare grey chest, scarred, with leather straps crossing it.
  const strap = (u: number, v: number, w: number) => Math.abs(u - v * (w / 24) - 0) < 1.5 || Math.abs((w - 1 - u) - v * (w / 24)) < 1.5;
  s.part('body', {
    top: fill(GREY),
    bottom: fill(LEATHER),
    sides: (u, v, w, h) => (v >= h - 4 ? LEATHER : flesh(u, v)),
    front: (u, v, w, h) => {
      if (v >= h - 4) return v === h - 3 && Math.abs(u - (w / 2 - 0.5)) < 2 ? BUCKLE : LEATHER; // the belt
      if (strap(u, v, w)) return (u + v) % 6 === 0 ? BUCKLE : LEATHER_D;
      if (v === 8 && Math.abs(u - (w / 2 - 0.5)) > 1 && Math.abs(u - (w / 2 - 0.5)) < 6) return GREY_D; // pecs
      if (v >= 12 && v <= 17 && u % 4 === 1 && (v % 2 === 0)) return GREY_D; // abs
      if (u > w / 2 + 2 && Math.abs(v - (u - w / 2) * 1.2 - 4) < 0.6) return '#5a3a3a'; // a scar
      return flesh(u, v);
    },
    back: (u, v, w, h) => (v >= h - 4 ? LEATHER : strap(u, v, w) ? LEATHER_D : flesh(u, v)),
  });
  // Huge grey arms, leather bracers, black gloves.
  for (const role of ['armR', 'armL'] as const) {
    s.part(role, {
      top: fill(GREY),
      bottom: fill('#111111'),
      sides: (u, v, w, h) => {
        if (v >= h - 4) return '#111111';
        if (v >= h - 10) return v % 3 === 0 ? BUCKLE : LEATHER;
        if (v === 4) return LEATHER_D; // an arm band
        return flesh(u, v);
      },
    });
  }
  for (const role of ['legR', 'legL'] as const) {
    s.part(role, {
      top: fill(LEATHER),
      bottom: fill('#111111'),
      sides: (u, v, w, h) => (v >= h - 8 ? (v === h - 8 ? BUCKLE : '#111111') : u % 4 === 0 ? LEATHER_D : LEATHER),
    });
  }
  return s;
}

function gunner(): Skin {
  const s = new Skin('gunner', 8807);
  const BRASS = '#d9b43a', BRASS_D = '#9a7a20', BELT = '#3a2a16', PAINT = '#1a1a12';
  const fatigue = (u: number, v: number) => (splat(u, v, 6) ? BLOOD : camo(u, v, 4));
  // Wild, bloodshot eyes, war paint, a scar, a chewed cigar.
  s.part('head', {
    top: fill('#3a3a22'),
    bottom: fill(ZSKIN_D),
    back: (u, v) => (v < 4 ? '#3a3a22' : zskin(u, v, 15)),
    sides: (u, v) => (v < 3 ? '#3a3a22' : v === 7 && u > 3 ? PAINT : zskin(u, v, 15)),
    front: (u, v) => {
      if (v < 3) return '#3a3a22';
      // War paint across the eyes.
      if (v === 8 && (u <= 2 || u >= 13)) return PAINT;
      for (const ex of [4, 11]) {
        const dx = u - ex, dy = v - 6;
        if (Math.abs(dx) <= 1.6 && Math.abs(dy) <= 1.2) return Math.abs(dx) < 0.6 && Math.abs(dy) < 0.6 ? '#111111' : (u + v) % 3 === 0 ? '#ff3b2f' : '#f4efe4';
        if (Math.abs(dx) <= 2.5 && Math.abs(dy) <= 2.2) return PAINT;
      }
      if (v >= 3 && v <= 12 && u === 12 && v > 8) return '#5a2a2a'; // scar
      // A grin, teeth clenched round a cigar with a glowing tip.
      if (v === 11 && u >= 4 && u <= 11) return u % 2 ? '#d8d2b0' : '#2a1f2f';
      if (v === 11 && u >= 12) return u === 15 ? '#ff6a10' : '#6a4a2a';
      return zskin(u, v, 15);
    },
  });
  // Camo fatigues with two belts of bullets crossing the chest, grenades on the belt.
  const bandolier = (u: number, v: number, w: number) => {
    const k = w / 24;
    return Math.abs(u - v * k * 0.9 - 1) < 1.6 || Math.abs((w - 1 - u) - v * k * 0.9 - 1) < 1.6;
  };
  s.part('body', {
    top: (u, v) => camo(u, v, 4),
    bottom: fill(BELT),
    sides: (u, v, w, h) => (v >= h - 4 ? BELT : fatigue(u, v)),
    front: (u, v, w, h) => {
      if (v >= h - 4) {
        if (v >= h - 3 && (u === 3 || u === 4 || u === w - 4 || u === w - 5)) return '#4a5a2a'; // grenades
        return v === h - 3 && Math.abs(u - (w / 2 - 0.5)) < 1.5 ? BRASS : BELT;
      }
      if (bandolier(u, v, w)) return v % 2 ? BRASS : BRASS_D;
      return fatigue(u, v);
    },
    back: (u, v, w, h) => (v >= h - 4 ? BELT : bandolier(u, v, w) ? (v % 2 ? BRASS : BRASS_D) : text('RAMPAGE', u, v, 0, 4) ? PAINT : fatigue(u, v)),
  });
  for (const role of ['armR', 'armL'] as const) {
    s.part(role, {
      top: (u, v) => camo(u, v, 5),
      bottom: fill('#111111'),
      sides: (u, v, w, h) => {
        if (v >= h - 4) return '#111111'; // fingerless gloves
        if (v >= h - 11) return zskin(u, v, 16); // sleeves rolled up over big arms
        return fatigue(u, v);
      },
    });
  }
  for (const role of ['legR', 'legL'] as const) {
    s.part(role, {
      top: (u, v) => camo(u, v, 6),
      bottom: fill('#1a1410'),
      sides: (u, v, w, h) => (v >= h - 7 ? ((u + v) % 4 === 0 ? '#2a2016' : '#1a1410') : v === 6 && u > 1 && u < 8 ? '#3a3a22' : fatigue(u, v)),
    });
  }
  return s;
}

function surgeon(): Skin {
  const s = new Skin('surgeon', 8808);
  const SCRUB = '#5fb8a4', SCRUB_D = '#4a9886', MASK = '#d8eef0', GLOVE = '#a8d0ec';
  const gown = (u: number, v: number) => (splat(u, v, 8) || splat(u, v, 2) ? BLOOD : splat(u, v, 5) ? BLOOD_D : v % 7 === 6 ? SCRUB_D : SCRUB);
  // A scrub cap, mad staring eyes (one twitching wider), a mask splashed red.
  s.part('head', {
    top: (u, v) => ((u + v) % 6 === 0 ? SCRUB_D : SCRUB),
    bottom: fill(ZSKIN_D),
    back: (u, v) => (v < 6 ? SCRUB : v === 9 ? '#e8e8e8' : zskin(u, v, 17)), // the mask's strings
    sides: (u, v) => (v < 4 ? SCRUB : v === 9 ? '#e8e8e8' : zskin(u, v, 17)),
    front: (u, v) => {
      if (v < 3) return SCRUB;
      if (v === 3) return '#9a9a9a'; // wild grey hair poking out
      if (v === 4 && ((u >= 2 && u <= 6) || (u >= 10 && u <= 13))) return '#5a5a5a';
      for (const [ex, r] of [[4, 1.6], [11, 2.1]] as const) {
        const dx = u - ex, dy = v - 6.3;
        if (dx * dx + dy * dy < r * r) return dx * dx + dy * dy < 0.6 ? '#111111' : '#f4f2e4';
      }
      // The mask, nose to chin.
      if (v >= 9) return splat(u, v, 3) || (u > 9 && v > 11) ? BLOOD : (v === 10 || v === 13) ? '#bcd8da' : MASK;
      return zskin(u, v, 17);
    },
  });
  s.part('body', {
    top: fill(SCRUB),
    bottom: fill(SCRUB_D),
    sides: gown,
    front: (u, v, w) => {
      const cx = w / 2 - 0.5;
      if (v < 4 && Math.abs(u - cx) < 3 - v * 0.6) return zskin(u, v, 17); // V-neck
      // A pocket full of scalpels.
      if (v >= 5 && v <= 9 && u >= 2 && u <= 6) return v === 5 && u % 2 === 0 ? '#e0e4e8' : SCRUB_D;
      return gown(u, v);
    },
    back: gown,
  });
  for (const role of ['armR', 'armL'] as const) {
    s.part(role, {
      top: fill(SCRUB),
      bottom: fill(GLOVE),
      sides: (u, v, w, h) => (v >= h - 6 ? (splat(u, v, 4) ? BLOOD : GLOVE) : v >= h - 11 ? zskin(u, v, 18) : gown(u, v)),
    });
  }
  for (const role of ['legR', 'legL'] as const) {
    s.part(role, {
      top: fill(SCRUB),
      bottom: fill('#e8e8e8'),
      sides: (u, v, w, h) => (v >= h - 4 ? (splat(u, v, 1) ? BLOOD : '#e8e8e8') : gown(u, v)), // white clogs
    });
  }
  return s;
}

const PAINTERS: Record<string, () => Skin> = {
  satan, biker, roadie, riotBot, horseman,
  convict, jailbird, chainGang, woundedSoldier, chef, executioner, gunner, surgeon,
};

const want = process.argv.slice(2);
for (const [name, paint] of Object.entries(PAINTERS)) {
  if (want.length && !want.includes(name)) continue;
  const path = `public/skins/${name}.png`;
  paint().write(path);
  console.log(`painted ${path}`);
}
