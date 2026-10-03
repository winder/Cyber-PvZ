import { describe, expect, it } from 'vitest';
import { faceAt, layoutFaces, mirrorPixel } from '../src/editor/faces';

describe('skin faces', () => {
  const faces = layoutFaces('jetpackHumanoid', 128);

  it('finds the face under a pixel', () => {
    // Head front is units (8,8)-(16,16) → pixels (16,16)-(32,32) at 128px.
    expect(faceAt(faces, 20, 20)).toMatchObject({ role: 'head', face: 'front' });
    expect(faceAt(faces, 127, 127)).toMatchObject({ role: 'jetpack' });
    expect(faceAt(faces, 0, 0)).toBeUndefined(); // unused corner
  });

  it('no two faces overlap', () => {
    const seen = new Set<number>();
    for (const f of faces) {
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
        expect(seen.has(y * 128 + x)).toBe(false);
        seen.add(y * 128 + x);
      }
    }
  });

  it('mirrors arms onto each other and flips columns', () => {
    const armR = faces.find((f) => f.role === 'armR' && f.face === 'front')!;
    const armL = faces.find((f) => f.role === 'armL' && f.face === 'front')!;
    expect(mirrorPixel(faces, armR.x, armR.y + 3)).toEqual({ x: armL.x + armL.w - 1, y: armL.y + 3 });
  });

  it('mirrors the head onto itself, swapping its sides', () => {
    const right = faces.find((f) => f.role === 'head' && f.face === 'right')!;
    const left = faces.find((f) => f.role === 'head' && f.face === 'left')!;
    expect(mirrorPixel(faces, right.x + 2, right.y + 5)).toEqual({ x: left.x + left.w - 3, y: left.y + 5 });
    // Mirroring twice gets you back.
    const m = mirrorPixel(faces, right.x + 2, right.y + 5)!;
    expect(mirrorPixel(faces, m.x, m.y)).toEqual({ x: right.x + 2, y: right.y + 5 });
  });
});
