import { describe, it, expect } from 'vitest';
import { recountTitleStats } from '../../functions/src/handlers/titleStats.js';

// Just enough Firestore for the recount: a userTitles scan with a read time,
// and a transaction over titleStats/global. A scan can be held back, so two
// recounts can finish out of order.
function fakeDb(titles) {
  const docs = new Map();
  let clock = 1000;
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
          clock += 1;
          const readTime = clock;
          const data = titles.map((t) => ({ ...t }));
          const gate = held.shift();
          if (gate) await gate;
          return {
            size: data.length,
            readTime: { toMillis: () => readTime },
            docs: data.map((d) => ({ data: () => d })),
          };
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

describe('recountTitleStats', () => {
  it('writes the counts with the read time of its scan; the same counts again write nothing', async () => {
    const db = fakeDb([player(2), player(1)]);
    const first = await recountTitleStats(db, { now: NOW });
    expect(first).toEqual({ players: 2, docs: 2, written: true });
    const stored = db.docs.get('titleStats/global');
    expect(stored.titles.regular.slice(0, 3)).toEqual([2, 1, 0]);
    expect(stored.countedAt).toBe(1001);
    expect(stored.month).toBe('2026-11');
    expect((await recountTitleStats(db, { now: NOW })).written).toBe(false);
  });

  it('an older scan finishing last never replaces a newer one', async () => {
    const db = fakeDb([player(1)]);
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
});
