import { describe, it, expect, vi, beforeEach } from 'vitest';

// Enough Firestore for the projection and the hand-events backfill: nested
// doc / collection paths, collection get, where ==, batch, set with merge /
// mergeFields. Reads of a path listed in `failing` throw.
function fakeDb(initial = {}, { failing = [] } = {}) {
  const docs = new Map(Object.entries(initial));
  const writes = [];
  const depth = (path) => path.split('/').length;
  const write = (path, data, opts = {}) => {
    writes.push(path);
    const current = docs.get(path) || {};
    if (opts.mergeFields) {
      const next = { ...current };
      for (const key of opts.mergeFields) next[key] = data[key];
      docs.set(path, next);
    } else if (opts.merge) {
      docs.set(path, { ...current, ...data });
    } else {
      docs.set(path, { ...data });
    }
  };
  const snap = (path) => ({
    id: path.split('/').pop(), exists: docs.has(path), data: () => docs.get(path), ref: docRef(path),
  });
  const children = (path) => {
    if (failing.includes(path)) throw new Error(`read failed: ${path}`);
    return [...docs.keys()].filter((p) => p.startsWith(`${path}/`) && depth(p) === depth(path) + 1);
  };
  function docRef(path) {
    return {
      path,
      id: path.split('/').pop(),
      get: async () => snap(path),
      set: async (data, opts) => write(path, data, opts),
      collection: (name) => collectionRef(`${path}/${name}`),
    };
  }
  function collectionRef(path) {
    return {
      doc: (id) => docRef(`${path}/${id}`),
      get: async () => ({ docs: children(path).map(snap) }),
      where: (field, op, value) => ({
        get: async () => ({ docs: children(path).filter((p) => docs.get(p)[field] === value).map(snap) }),
      }),
    };
  }
  return {
    docs,
    writes,
    collection: collectionRef,
    batch: () => {
      const ops = [];
      return {
        set: (ref, data, opts) => ops.push(() => write(ref.path, data, opts)),
        delete: (ref) => ops.push(() => docs.delete(ref.path)),
        commit: async () => ops.forEach((op) => op()),
      };
    },
  };
}

let currentDb = null;
vi.mock('../../functions/src/utils/db.js', () => ({ getFirestore: () => currentDb }));
vi.mock('../../functions/src/handlers/leaderboardStats.js', () => ({
  recomputeLeaderboardStatsForUser: vi.fn(async () => ({})),
}));
vi.mock('../../functions/src/handlers/monthlyCrowns.js', () => ({
  recomputeMonthlyCrowns: vi.fn(async () => ({})),
}));

const { syncCompletedGameHistoryProjection } = await import('../../functions/src/handlers/gameHistoryProjection.js');
const {
  fillHandEventsForUser, loadGameHandEvents, sameHandEvents, refreshGameHandEvents,
} = await import('../../functions/src/handlers/gameHandEvents.js');
const { recomputeLeaderboardStatsForUser } = await import('../../functions/src/handlers/leaderboardStats.js');
const { emptyHandEvents } = await import('../../functions/src/utils/leaderboardStatsMath.js');

const roster = [
  { id: 'p1', uid: 'u1', name: 'A', buyIn: 1000, stack: 1500 },
  { id: 'p2', uid: 'u2', name: 'B', buyIn: 1000, stack: 500 },
  { id: 'g', name: 'Guest', buyIn: 1000, stack: 1000 },
];
const cashGame = { type: 'live', status: 'completed', name: 'Friday', completedAt: 1000, players: roster };
// p2's quads run into p1's straight flush (recorded types only); the guest's
// quads count for nobody
const quadsHand = {
  communityCards: [],
  players: [
    { playerId: 'p1', cards: [], handType: 'straight_flush', chips: 300, winner: true },
    { playerId: 'p2', cards: [], handType: 'four_of_a_kind', chips: -300 },
    { playerId: 'g', cards: [], handType: 'four_of_a_kind', chips: 0 },
  ],
};

describe('projection: history_sub.handEvents', () => {
  beforeEach(() => {
    currentDb = null;
  });

  it('every participant gets their counts; the existing fields stay', async () => {
    currentDb = fakeDb({
      'games/g1': cashGame,
      'games/g1/hands/h1': quadsHand,
      'users/u1/history_sub/g1': { gameId: 'g1', note: 'kept' },
    });
    await syncCompletedGameHistoryProjection('g1');
    const u1 = currentDb.docs.get('users/u1/history_sub/g1');
    const u2 = currentDb.docs.get('users/u2/history_sub/g1');
    expect(u1).toMatchObject({ note: 'kept', profit: 500, type: 'live', status: 'completed' });
    expect(u1.handEvents).toEqual({ ...emptyHandEvents(), straightFlush: 1 });
    expect(u2.handEvents).toEqual({ ...emptyHandEvents(), quads: 1, tragicHero: 1 });
    expect(currentDb.docs.has('users/undefined/history_sub/g1')).toBe(false);
  });

  it('a tournament adds revenge from its eliminate transactions', async () => {
    const award = (playerId) => ({ awards: [{ playerId, amount: 100 }] });
    currentDb = fakeDb({
      'games/t1': {
        type: 'tournament',
        status: 'completed',
        completedAt: 1000,
        players: roster,
        settlementSnapshot: [
          { odId: 'u1', name: 'A', placement: 2, buyIn: 2000, prize: 0, profit: -2000 },
          { odId: 'u2', name: 'B', placement: 1, buyIn: 1000, prize: 3000, profit: 2000 },
        ],
      },
      'transactions/x1': { gameId: 't1', type: 'eliminate', status: 'active', targetId: 'p2', restore: { seq: 1, bounty: award('p1') } },
      'transactions/x2': { gameId: 't1', type: 'eliminate', status: 'active', targetId: 'p1', restore: { seq: 2, bounty: award('p2') } },
      'transactions/x3': { gameId: 'other', type: 'eliminate', status: 'active', targetId: 'p2', restore: { seq: 3, bounty: award('p1') } },
      'transactions/x4': { gameId: 't1', type: 'buy_in', status: 'active', targetId: 'p1' },
    });
    await syncCompletedGameHistoryProjection('t1');
    expect(currentDb.docs.get('users/u2/history_sub/t1').handEvents.revenge).toBe(1);
    expect(currentDb.docs.get('users/u1/history_sub/t1').handEvents.revenge).toBe(0);
  });

  it('a failed read is logged and the projection still lands (without handEvents)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    currentDb = fakeDb({
      'games/g1': cashGame,
      'users/u1/history_sub/g1': { gameId: 'g1', handEvents: { ...emptyHandEvents(), quads: 2 } },
    }, { failing: ['games/g1/hands'] });
    await syncCompletedGameHistoryProjection('g1');
    expect(currentDb.docs.get('users/u1/history_sub/g1')).toMatchObject({ profit: 500, handEvents: { quads: 2 } });
    expect(currentDb.docs.get('users/u2/history_sub/g1').handEvents).toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('backfill: fillHandEventsForUser', () => {
  it('recomputes from the game, caches per game, and is idempotent', async () => {
    const db = fakeDb({
      'games/g1': cashGame,
      'games/g1/hands/h1': quadsHand,
      'users/u1/history_sub/g1': { gameId: 'g1', profit: 500 },
      'users/u2/history_sub/g1': { gameId: 'g1', profit: -500, handEvents: { quads: 9, legacy: 1 } },
      'users/u2/history_sub/gone': { gameId: 'gone', profit: 0 },
    });
    const cache = new Map();
    expect(await fillHandEventsForUser(db, 'u1', cache)).toEqual({ checked: 1, written: 1, skipped: 0 });
    expect(await fillHandEventsForUser(db, 'u2', cache)).toEqual({ checked: 1, written: 1, skipped: 1 });
    expect([...cache.keys()].sort()).toEqual(['g1', 'gone']);
    expect(db.docs.get('users/u1/history_sub/g1')).toEqual({
      gameId: 'g1', profit: 500, handEvents: { ...emptyHandEvents(), straightFlush: 1 },
    });
    // The whole map is replaced (no stale keys), the rest of the doc kept
    expect(db.docs.get('users/u2/history_sub/g1')).toEqual({
      gameId: 'g1', profit: -500, handEvents: { ...emptyHandEvents(), quads: 1, tragicHero: 1 },
    });
    expect(db.docs.has('users/u2/history_sub/gone')).toBe(true);
    expect(db.docs.get('users/u2/history_sub/gone').handEvents).toBeUndefined();

    // Second run (fresh cache, as a re-run of the script): nothing to write
    db.writes.length = 0;
    const again = new Map();
    expect(await fillHandEventsForUser(db, 'u1', again)).toMatchObject({ written: 0 });
    expect(await fillHandEventsForUser(db, 'u2', again)).toMatchObject({ written: 0 });
    expect(db.writes).toEqual([]);
  });

  it('sameHandEvents: missing keys are 0, unknown keys differ', () => {
    expect(sameHandEvents({ quads: 1 }, { ...emptyHandEvents(), quads: 1 })).toBe(true);
    expect(sameHandEvents({ quads: 1, legacy: 0 }, { ...emptyHandEvents(), quads: 1 })).toBe(false);
    expect(sameHandEvents(null, emptyHandEvents())).toBe(false);
  });

  it('loadGameHandEvents: cash games skip the transactions read', async () => {
    const db = fakeDb({ 'games/g1/hands/h1': quadsHand }, { failing: ['transactions'] });
    const got = await loadGameHandEvents(db, 'g1', cashGame);
    expect(got.u2).toMatchObject({ quads: 1, tragicHero: 1 });
  });
});

describe('hands trigger: refreshGameHandEvents (補記手牌)', () => {
  // A finished game whose projection already ran (zeros), u3 not projected yet
  const projected = (extra = {}) => ({
    'games/g1': { ...cashGame, historyProjection: { syncedUserIds: ['u1', 'u2'] }, ...extra },
    'users/u1/history_sub/g1': { gameId: 'g1', profit: 500, handEvents: emptyHandEvents() },
    'users/u2/history_sub/g1': { gameId: 'g1', profit: -500, handEvents: emptyHandEvents() },
  });
  beforeEach(() => recomputeLeaderboardStatsForUser.mockClear());

  it('a hand added afterwards: patches the changed players, then rebuilds their stats + titles', async () => {
    const db = fakeDb({ ...projected(), 'games/g1/hands/h1': { ...quadsHand, recordedAfter: true, recordedBy: 'u2' } });
    const result = await refreshGameHandEvents(db, 'g1');
    expect(result).toEqual({ status: 'done', written: ['u1', 'u2'], recomputed: ['u1', 'u2'] });
    expect(db.docs.get('users/u1/history_sub/g1')).toEqual({
      gameId: 'g1', profit: 500, handEvents: { ...emptyHandEvents(), straightFlush: 1 },
    });
    expect(db.docs.get('users/u2/history_sub/g1').handEvents).toEqual({ ...emptyHandEvents(), quads: 1, tragicHero: 1 });
    expect(recomputeLeaderboardStatsForUser.mock.calls.map(([, uid]) => uid)).toEqual(['u1', 'u2']);
    // recomputed exactly as at completion: no options that could turn a title on
    expect(recomputeLeaderboardStatsForUser.mock.calls.every((call) => call.length === 2)).toBe(true);
  });

  it('idempotent: run again, nothing written, nobody recomputed', async () => {
    const db = fakeDb({ ...projected(), 'games/g1/hands/h1': quadsHand });
    await refreshGameHandEvents(db, 'g1');
    db.writes.length = 0;
    recomputeLeaderboardStatsForUser.mockClear();
    expect(await refreshGameHandEvents(db, 'g1')).toEqual({ status: 'done', written: [], recomputed: [] });
    expect(db.writes).toEqual([]);
    expect(recomputeLeaderboardStatsForUser).not.toHaveBeenCalled();
  });

  it('a hand removed: the counts go back down', async () => {
    const db = fakeDb({
      ...projected(),
      'users/u2/history_sub/g1': { gameId: 'g1', profit: -500, handEvents: { ...emptyHandEvents(), quads: 1, tragicHero: 1 } },
    });
    const result = await refreshGameHandEvents(db, 'g1');
    expect(result.written).toEqual(['u2']);
    expect(db.docs.get('users/u2/history_sub/g1').handEvents).toEqual(emptyHandEvents());
  });

  it('test hands marked out of the titles stay out', async () => {
    const db = fakeDb({ ...projected(), 'games/g1/hands/h1': { ...quadsHand, excludeFromTitles: true } });
    expect((await refreshGameHandEvents(db, 'g1')).written).toEqual([]);
    expect(db.writes).toEqual([]);
  });

  it('a history the projection has not written yet is not created', async () => {
    const db = fakeDb({
      'games/g1': cashGame,
      'games/g1/hands/h1': quadsHand,
      'users/u1/history_sub/g1': { gameId: 'g1', handEvents: emptyHandEvents() },
    });
    const result = await refreshGameHandEvents(db, 'g1');
    expect(result.written).toEqual(['u1']);
    expect(db.docs.has('users/u2/history_sub/g1')).toBe(false);
  });

  it('active or missing games are left to the projection', async () => {
    const db = fakeDb({ ...projected({ status: 'active' }), 'games/g1/hands/h1': quadsHand });
    expect((await refreshGameHandEvents(db, 'g1')).status).toBe('not-completed');
    expect((await refreshGameHandEvents(db, 'nope')).status).toBe('not-found');
    expect(db.writes).toEqual([]);
    expect(recomputeLeaderboardStatsForUser).not.toHaveBeenCalled();
  });

  it('failures are logged, never thrown', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failingRead = fakeDb({ ...projected(), 'games/g1/hands/h1': quadsHand }, { failing: ['games/g1/hands'] });
    expect((await refreshGameHandEvents(failingRead, 'g1')).status).toBe('failed');
    expect(failingRead.writes).toEqual([]);

    recomputeLeaderboardStatsForUser.mockRejectedValueOnce(new Error('stats down'));
    const db = fakeDb({ ...projected(), 'games/g1/hands/h1': quadsHand });
    const result = await refreshGameHandEvents(db, 'g1');
    expect(result).toEqual({ status: 'done', written: ['u1', 'u2'], recomputed: ['u2'] });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
