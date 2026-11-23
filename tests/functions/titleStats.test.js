import { describe, it, expect } from 'vitest';
import { recountTitleStats } from '../../functions/src/handlers/titleStats.js';
import { readAtOrAfter } from '../../functions/src/utils/titleStatsMath.js';

// Just enough Firestore for the recount: a userTitles scan with a read time
// (a Timestamp-like { seconds, nanoseconds }), and a transaction over
// titleStats/global. A scan can be held back, so recounts can finish out of
// order; read times advance by `step` nanoseconds, so several can fall in one
// millisecond.
function fakeDb(titles, { step = 1e6 } = {}) {
  const docs = new Map();
  let nanos = 0;
  const held = [];
  return {
    docs,
    titles,
    // The next scan waits until release() is called
    holdNextScan() {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      held.push(gate);
      return release;
    },
    collection: (name) => ({
      doc: (id) => ({ path: `${name}/${id}` }),
      select: () => ({
        get: async () => {
          // Read now (the data and the read time), answer later if held
          nanos += step;
          const readTime = { seconds: 1000 + Math.floor(nanos / 1e9), nanoseconds: nanos % 1e9 };
          const data = titles.map((t) => ({ ...t }));
          const gate = held.shift();
          if (gate) await gate;
          return { size: data.length, readTime, docs: data.map((d) => ({ data: () => d })) };
        },
      }),
    }),
    runTransaction: async (fn) => fn({
      get: async (r) => ({ exists: docs.has(r.path), data: () => docs.get(r.path) }),
      set: (r, data) => docs.set(r.path, data),
    }),
  };
}

const NOW = Date.parse('2026-11-20T12:00:00+08:00');
const player = (tier) => ({ unlocked: { regular: { tier, at: 1 } } });

describe('readAtOrAfter', () => {
  it('compares to the nanosecond; millis still read; nothing stored is always older', () => {
    expect(readAtOrAfter({ seconds: 5, nanoseconds: 2 }, { seconds: 5, nanoseconds: 1 })).toBe(true);
    expect(readAtOrAfter({ seconds: 5, nanoseconds: 1 }, { seconds: 5, nanoseconds: 2 })).toBe(false);
    expect(readAtOrAfter({ seconds: 5, nanoseconds: 1 }, { seconds: 5, nanoseconds: 1 })).toBe(true);
    expect(readAtOrAfter({ seconds: 6, nanoseconds: 0 }, { seconds: 5, nanoseconds: 999999999 })).toBe(true);
    expect(readAtOrAfter(5001, { seconds: 5, nanoseconds: 1e6 })).toBe(true);
    expect(readAtOrAfter(5000, { seconds: 5, nanoseconds: 1 })).toBe(false);
    expect(readAtOrAfter(undefined, { seconds: 5, nanoseconds: 1 })).toBe(false);
    expect(readAtOrAfter({ seconds: 5, nanoseconds: 1 }, undefined)).toBe(true);
  });
});

describe('recountTitleStats', () => {
  it('stores the counts with the full read time of its scan', async () => {
    const db = fakeDb([player(2), player(1)]);
    const first = await recountTitleStats(db, { now: NOW });
    expect(first).toEqual({ players: 2, docs: 2, written: true, changed: true });
    const stored = db.docs.get('titleStats/global');
    expect(stored.titles.regular.slice(0, 3)).toEqual([2, 1, 0]);
    expect(stored.countedAt).toEqual({ seconds: 1000, nanoseconds: 1e6 });
    expect(stored.month).toBe('2026-11');
    // Nothing moved: still the newest scan, so its time is stored
    const again = await recountTitleStats(db, { now: NOW });
    expect(again).toMatchObject({ written: true, changed: false });
    expect(db.docs.get('titleStats/global').countedAt).toEqual({ seconds: 1000, nanoseconds: 2e6 });
  });

  it('an older scan finishing last never replaces a newer one, even in the same millisecond', async () => {
    // 100 ns apart: the same millisecond
    const db = fakeDb([player(1)], { step: 100 });
    // A scans first (one player at tier 1) and is held back...
    const releaseA = db.holdNextScan();
    const a = recountTitleStats(db, { now: NOW });
    await Promise.resolve();
    // ...B scans after a second player joined and lands first
    db.titles.push(player(3));
    await recountTitleStats(db, { now: NOW });
    expect(db.docs.get('titleStats/global').players).toBe(2);
    releaseA();
    expect((await a).written).toBe(false);
    expect(db.docs.get('titleStats/global').players).toBe(2);
  });

  it('a newer scan with nothing new still blocks an older one that saw less', async () => {
    const db = fakeDb([player(1), player(2)]);
    await recountTitleStats(db, { now: NOW });
    // A player leaves (a rebuild dropped their titles): A reads that...
    db.titles.pop();
    const releaseA = db.holdNextScan();
    const a = recountTitleStats(db, { now: NOW });
    await Promise.resolve();
    // ...then they are back before B reads: B sees what is stored, no change
    db.titles.push(player(2));
    expect(await recountTitleStats(db, { now: NOW })).toMatchObject({ written: true, changed: false });
    releaseA();
    expect((await a).written).toBe(false);
    expect(db.docs.get('titleStats/global').players).toBe(2);
  });
});
