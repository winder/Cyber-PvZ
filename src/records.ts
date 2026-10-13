// Each level's record (its high score and how many times it's been played)
// lives in this browser's storage, like the editor's skins: no server, so a
// record belongs to one device.

const KEY = 'cyberPvZ.records';

export interface LevelRecord {
  /** Games started on this level (GO pressed on the first wave). */
  plays: number;
  /** Best score from a finished game, won or lost. */
  highScore: number;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function load(): Record<string, LevelRecord> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!saved || typeof saved !== 'object') return {};
    const records: Record<string, LevelRecord> = {};
    for (const [id, r] of Object.entries(saved as Record<string, Partial<LevelRecord> | null>)) {
      records[id] = { plays: count(r?.plays), highScore: count(r?.highScore) };
    }
    return records;
  } catch {
    // Storage blocked or garbled: start from nothing.
    return {};
  }
}

function save(records: Record<string, LevelRecord>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    // Storage can be blocked or full; the game plays on without records.
  }
}

export function getRecord(levelId: string): LevelRecord {
  return load()[levelId] ?? { plays: 0, highScore: 0 };
}

/** One more game started on this level. */
export function countPlay(levelId: string): void {
  const records = load();
  const r = records[levelId] ?? { plays: 0, highScore: 0 };
  records[levelId] = { ...r, plays: r.plays + 1 };
  save(records);
}

/** A game ended with this score. Returns true if it's the level's new high score. */
export function submitScore(levelId: string, score: number): boolean {
  const records = load();
  const r = records[levelId] ?? { plays: 0, highScore: 0 };
  if (count(score) <= r.highScore) return false;
  records[levelId] = { ...r, highScore: count(score) };
  save(records);
  return true;
}
