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

const PAINTERS: Record<string, () => Skin> = { satan, biker, roadie, riotBot };

const want = process.argv.slice(2);
for (const [name, paint] of Object.entries(PAINTERS)) {
  if (want.length && !want.includes(name)) continue;
  const path = `public/skins/${name}.png`;
  paint().write(path);
  console.log(`painted ${path}`);
}
