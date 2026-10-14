import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEVELS, SCORE, ZOMBIES } from '../src/data/config';
import { countPlay, getRecord, submitScore, totalPlays } from '../src/records';
import { Game, TICK_RATE } from '../src/sim/game';

/** A stand-in for the browser's storage. */
function fakeStorage(): { data: Map<string, string>; getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

describe('level records', () => {
  let storage: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
  });

  it('starts every level at no plays and no high score', () => {
    expect(getRecord('neon')).toEqual({ plays: 0, highScore: 0 });
  });

  it('counts plays for each level separately', () => {
    countPlay('neon');
    countPlay('neon');
    countPlay('rust');
    expect(getRecord('neon').plays).toBe(2);
    expect(getRecord('rust').plays).toBe(1);
    expect(getRecord('cemetery').plays).toBe(0);
  });

  it('adds up plays across levels', () => {
    expect(totalPlays()).toBe(0);
    countPlay('neon');
    countPlay('rust');
    countPlay('rust');
    expect(totalPlays()).toBe(3);
  });

  it('keeps only the best score, and says when it was beaten', () => {
    expect(submitScore('neon', 1200)).toBe(true);
    expect(submitScore('neon', 900)).toBe(false);
    expect(submitScore('neon', 1200)).toBe(false);
    expect(getRecord('neon').highScore).toBe(1200);
    expect(submitScore('neon', 1500)).toBe(true);
    expect(getRecord('neon').highScore).toBe(1500);
    expect(getRecord('rust').highScore).toBe(0);
  });

  it('keeps plays and high score side by side', () => {
    countPlay('neon');
    submitScore('neon', 700);
    countPlay('neon');
    expect(getRecord('neon')).toEqual({ plays: 2, highScore: 700 });
  });

  it('shrugs off garbled or blocked storage', () => {
    storage.data.set('cyberPvZ.records', '{not json');
    expect(getRecord('neon')).toEqual({ plays: 0, highScore: 0 });
    storage.data.set('cyberPvZ.records', JSON.stringify({ neon: { plays: 'lots', highScore: -5 }, rust: null }));
    expect(getRecord('neon')).toEqual({ plays: 0, highScore: 0 });
    expect(getRecord('rust')).toEqual({ plays: 0, highScore: 0 });

    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    });
    expect(() => countPlay('neon')).not.toThrow();
    expect(submitScore('neon', 10)).toBe(true);
    expect(getRecord('neon')).toEqual({ plays: 0, highScore: 0 });
  });
});

describe('score', () => {
  it('starts at zero and pays for zombies beaten and the wave cleared', () => {
    const g = new Game(1, LEVELS[0]);
    expect(g.score).toBe(0);
    g.startWave();
    // Run until the first zombies are in, then beat everything that shows up.
    let beaten = 0;
    for (let i = 0; i < 600 * TICK_RATE && g.phase === 'battle'; i++) {
      for (const z of g.zombies) {
        z.hp = 0;
        beaten += Math.round(ZOMBIES[z.type].hp * SCORE.perZombieHp);
      }
      g.step();
    }
    expect(g.phase).toBe('build');
    expect(beaten).toBeGreaterThan(0);
    expect(g.score).toBe(beaten + SCORE.waveClear);
  });

  it('pays nothing for losing bases', () => {
    const g = new Game(1, LEVELS[0]);
    g.startWave();
    for (let i = 0; i < 900 * TICK_RATE && g.phase === 'battle'; i++) g.step();
    expect(g.phase).toBe('lost');
    expect(g.score).toBe(0);
  });
});
