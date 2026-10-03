import {
  FACE_LABELS, MODELS, SKIN_UNITS, faceRects, type FaceName, type ModelId, type PartRole,
} from '../models/models';

/** One face of one part, in skin pixels. */
export interface FaceInfo {
  role: PartRole;
  partLabel: string;
  face: FaceName;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function layoutFaces(model: ModelId, texSize: number): FaceInfo[] {
  const s = texSize / SKIN_UNITS;
  const out: FaceInfo[] = [];
  for (const part of MODELS[model].parts) {
    const rects = faceRects(part);
    for (const face of Object.keys(rects) as FaceName[]) {
      const r = rects[face];
      out.push({ role: part.role, partLabel: part.label, face, x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s });
    }
  }
  return out;
}

export function faceAt(faces: FaceInfo[], x: number, y: number): FaceInfo | undefined {
  return faces.find((f) => x >= f.x && y >= f.y && x < f.x + f.w && y < f.y + f.h);
}

export function faceLabel(f: FaceInfo): string {
  return `${f.partLabel} · ${FACE_LABELS[f.face]}`;
}

const MIRROR_ROLE: Partial<Record<PartRole, PartRole>> = { armR: 'armL', armL: 'armR', legR: 'legL', legL: 'legR' };
const MIRROR_FACE: Partial<Record<FaceName, FaceName>> = { right: 'left', left: 'right' };

/**
 * The pixel on the other side of the character (left ↔ right). Every face is
 * drawn as seen from outside, so mirroring flips the column and keeps the row.
 */
export function mirrorPixel(faces: FaceInfo[], x: number, y: number): { x: number; y: number } | null {
  const f = faceAt(faces, x, y);
  if (!f) return null;
  const role = MIRROR_ROLE[f.role] ?? f.role;
  const face = MIRROR_FACE[f.face] ?? f.face;
  const t = faces.find((o) => o.role === role && o.face === face);
  if (!t) return null;
  return { x: t.x + (t.w - 1 - (x - f.x)), y: t.y + (y - f.y) };
}
