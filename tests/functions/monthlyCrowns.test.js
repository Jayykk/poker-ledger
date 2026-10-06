import { describe, it, expect } from 'vitest';
import { recomputeMonthlyCrowns, rebuildCrownHistory } from '../../functions/src/handlers/monthlyCrowns.js';
import { recomputeUserTitles, setTitlePrefs } from '../../functions/src/handlers/userTitles.js';

// Enough Firestore for the crowns / pals handlers: paths, getAll, transactions
// (get / getAll / set with mergeFields / merge), collection get, where ==.
// Every read and write is logged by path.
function fakeDb(initial = {}) {
  const docs = new Map(Object.entries(initial));
  const reads = [];
  const writes = [];
  const ref = (path) => ({ path, id: path.split('/').pop() });
  const snap = (path) => {
    reads.push(path);
    return { id: path.split('/').pop(), exists: docs.has(path), data: () => docs.get(path) };
  };
  const set = (r, data, opts = {}) => {
    writes.push(r.path);
    const current = docs.get(r.path) || {};
    if (opts.mergeFields) {
      const next = { ...current };
      for (const k of opts.mergeFields) next[k] = data[k];
      docs.set(r.path, next);
    } else if (opts.merge) {
      docs.set(r.path, { ...current, ...data });
    } else {
      docs.set(r.path, { ...data });
    }
  };
  const inCollection = (name) => [...docs.keys()].filter((p) => p.startsWith(`${name}/`) && p.split('/').length === 2);
  const collection = (name) => ({
    doc: (id) => ref(`${name}/${id}`),
    get: async () => ({ docs: inCollection(name).map(snap) }),
    where: (field, op, value) => ({
      get: async () => ({ docs: inCollection(name).filter((p) => docs.get(p)[field] === value).map(snap) }),
    }),
  });
  return {
    docs,
    reads,
    writes,
    collection,
    getAll: async (...refs) => refs.map((r) => snap(r.path)),
    runTransaction: async (fn) => fn({
      get: async (r) => snap(r.path),
      getAll: async (...refs) => refs.map((r) => snap(r.path)),
      set,
    }),
  };
}

const OCT = '2026-10';
const NOW = Date.parse('2026-10-20T12:00:00+08:00');
const stats = (uid, { games = 1, profit = 0, knockouts = 0, period = OCT, hidden = false } = {}) => ({
  [`leaderboardStats/${uid}_${period}`]: {
    uid, name: uid, hidden, period, periodType: 'month',
    total: { games, profit, groupGames: 0, sumGroups: 0, sumSqGroups: 0 },
    cash: {},
    tournament: { knockouts },
  },
});
const titles = (uid, data) => ({ [`userTitles/${uid}`]: { uid, unlocked: {}, prefs: { mode: 'auto' }, display: null, ...data } });

describe('pals in the titles recompute', () => {
  it('stores the sorted pals; new candidates get one users read, hidden ones left out', async () => {
    const db = fakeDb({
      'users/amy': { name: 'Amy' },
      'users/bob': { name: 'Bob', isAnonymous: true },
      'users/cat': { name: '' },
    });
    const result = await recomputeUserTitles(db, 'me', null, NOW, { palCandidates: ['amy', 'bob', 'cat', 'zed'] });
    expect(result.pals).toEqual(['amy']);
    expect(db.docs.get('userTitles/me')).toMatchObject({ pals: ['amy'], palsUpdatedAt: NOW });
    expect(db.reads.filter((p) => p.startsWith('users/')).sort()).toEqual(['users/amy', 'users/bob', 'users/cat', 'users/zed']);
  });

  it('known pals are not re-read; an unchanged list writes nothing', async () => {
    const db = fakeDb({ ...titles('me', { pals: ['amy'] }), 'users/amy': { name: 'Amy' } });
    db.reads.length = 0;
    const result = await recomputeUserTitles(db, 'me', null, NOW, { palCandidates: ['amy'] });
    expect(result.written).toBe(false);
    expect(db.reads).toEqual(['userTitles/me']);
    expect(db.writes).toEqual([]);
  });

  it('a changed list is written with mergeFields: titles and crowns stay', async () => {
    const db = fakeDb({
      ...titles('me', { pals: ['amy'], crowns: { crownHunter: OCT }, unlocked: { regular: { tier: 1, at: 1 } } }),
      'users/bob': { name: 'Bob' },
    });
    await recomputeUserTitles(db, 'me', null, NOW, { palCandidates: ['bob'] });
    expect(db.docs.get('userTitles/me')).toMatchObject({
      pals: ['bob'], crowns: { crownHunter: OCT }, unlocked: { regular: { tier: 1, at: 1 } },
    });
  });

  it('no doc and nobody to play with: no doc', async () => {
    const db = fakeDb();
    await recomputeUserTitles(db, 'me', null, NOW, { palCandidates: [] });
    expect(db.docs.has('userTitles/me')).toBe(false);
  });
});

describe('setTitlePrefs with a crown', () => {
  it('picks a crown held this month; the display carries its month', async () => {
    const db = fakeDb(titles('me', {
      unlocked: { regular: { tier: 2, at: 1 } },
      crowns: { crownHunter: OCT },
      pals: ['amy'],
      display: { familyId: 'crownHunter', tier: 4, frame: null, month: OCT },
    }));
    const result = await setTitlePrefs(db, 'me', { mode: 'pick', titleId: 'crownHunter' }, NOW);
    expect(result.display).toEqual({ familyId: 'crownHunter', tier: 4, frame: null, month: OCT });
    // Back to a normal title: the crown's month must not linger on the display
    await setTitlePrefs(db, 'me', { mode: 'pick', titleId: 'regular' }, NOW);
    expect(db.docs.get('userTitles/me').display).toEqual({ familyId: 'regular', tier: 2, frame: null });
    expect(db.docs.get('userTitles/me').pals).toEqual(['amy']);
  });

  it('a crown from an older month cannot be picked', async () => {
    const db = fakeDb(titles('me', { crowns: { crownHunter: '2026-09' } }));
    await expect(setTitlePrefs(db, 'me', { mode: 'pick', titleId: 'crownHunter' }, NOW))
      .rejects.toThrow('TITLE_PREFS_NOT_UNLOCKED');
  });
});

describe('recomputeMonthlyCrowns', () => {
  // amy – bob – cat in a row of pals: amy and cat are not pals of each other
  const base = () => ({
    ...titles('amy', { pals: ['bob'] }),
    ...titles('bob', { pals: ['amy', 'cat'] }),
    ...titles('cat', { pals: ['bob', 'dan'] }),
    ...titles('dan', { pals: ['cat'] }),
    ...stats('amy', { knockouts: 5, games: 3 }),
    ...stats('bob', { knockouts: 2, games: 3 }),
    ...stats('cat', { knockouts: 3, games: 1, profit: 900 }),
    ...stats('dan', { knockouts: 3, games: 2, profit: -400 }),
  });

  it('judges the players and their pals, each in their own circle', async () => {
    const db = fakeDb(base());
    const summary = await recomputeMonthlyCrowns(db, ['bob'], [OCT, OCT], { now: NOW });
    // bob's game: bob, amy, cat judged (dan is a pal of a pal: read, not judged)
    expect(summary.evaluated).toBe(3);
    expect(db.docs.get('userTitles/amy').crowns).toEqual({ crownHunter: OCT, crownRegular: OCT });
    // bob ties amy on games: ties share the crown
    expect(db.docs.get('userTitles/bob').crowns).toEqual({ crownRegular: OCT });
    // cat and dan tie on knockouts inside cat's circle: shared
    expect(db.docs.get('userTitles/cat').crowns).toEqual({ crownHunter: OCT, crownProfit: OCT });
    expect(db.docs.get('userTitles/dan').crowns).toBeUndefined();
    // Auto display shows the first crown held
    expect(db.docs.get('userTitles/amy').display).toEqual({ familyId: 'crownHunter', tier: 4, frame: null, month: OCT });
  });

  it('batched reads; only changed docs written; a second run writes nothing', async () => {
    const db = fakeDb(base());
    const first = await recomputeMonthlyCrowns(db, ['bob'], [OCT], { now: NOW });
    expect(first.written).toBe(3);
    const statReads = db.reads.filter((p) => p.startsWith('leaderboardStats/'));
    // amy, bob, cat, dan once each
    expect(statReads.sort()).toEqual(['amy', 'bob', 'cat', 'dan'].map((u) => `leaderboardStats/${u}_${OCT}`));
    db.writes.length = 0;
    const again = await recomputeMonthlyCrowns(db, ['bob'], [OCT], { now: NOW });
    expect(again.written).toBe(0);
    expect(db.writes).toEqual([]);
  });

  it('a pal passing you takes the crown (lost); a pal tying you does not', async () => {
    const db = fakeDb(base());
    await recomputeMonthlyCrowns(db, ['bob'], [OCT], { now: NOW });
    // bob ties amy on knockouts: both hold, amy keeps it
    db.docs.set(`leaderboardStats/bob_${OCT}`, stats('bob', { knockouts: 5, games: 3 })[`leaderboardStats/bob_${OCT}`]);
    const tie = await recomputeMonthlyCrowns(db, ['bob'], [OCT], { now: NOW });
    // Only cat loses one: bob now passes cat inside cat's circle
    expect(tie.lost).toEqual([{ uid: 'cat', crownId: 'crownHunter' }]);
    expect(db.docs.get('userTitles/amy').crowns.crownHunter).toBe(OCT);
    expect(db.docs.get('userTitles/bob').crowns.crownHunter).toBe(OCT);
    // bob passes amy: amy loses it this month (no history: the month isn't over)
    db.docs.set(`leaderboardStats/bob_${OCT}`, stats('bob', { knockouts: 6, games: 3 })[`leaderboardStats/bob_${OCT}`]);
    const pass = await recomputeMonthlyCrowns(db, ['bob'], [OCT], { now: NOW });
    expect(pass.lost).toEqual([{ uid: 'amy', crownId: 'crownHunter' }]);
    expect(db.docs.get('userTitles/amy').crowns).toEqual({ crownRegular: OCT });
    expect(db.docs.get('userTitles/amy').crownHistory).toEqual({});
    expect(db.docs.get('userTitles/amy').display.familyId).toBe('crownRegular');
  });

  it('next month: last month\'s crowns are finalised into the history', async () => {
    const db = fakeDb(base());
    await recomputeMonthlyCrowns(db, ['bob'], [OCT], { now: NOW });
    const nov = Date.parse('2026-11-03T12:00:00+08:00');
    await recomputeMonthlyCrowns(db, ['amy'], ['2026-11'], { now: nov });
    expect(db.docs.get('userTitles/amy')).toMatchObject({
      crowns: {},
      crownHistory: { crownHunter: [OCT], crownRegular: [OCT] },
      display: null,
    });
  });

  it('users without a pals list yet are not judged; future months are ignored', async () => {
    const db = fakeDb({ ...titles('amy', {}), ...stats('amy', { knockouts: 9 }) });
    expect((await recomputeMonthlyCrowns(db, ['amy'], [OCT], { now: NOW })).evaluated).toBe(0);
    expect((await recomputeMonthlyCrowns(db, ['amy'], ['2027-01'], { now: NOW })).evaluated).toBe(0);
    expect(await recomputeMonthlyCrowns(db, [], [OCT], { now: NOW })).toMatchObject({ evaluated: 0, written: 0 });
  });
});

describe('rebuildCrownHistory (backfill --crown-history)', () => {
  it('replays every month with today\'s pals, from scratch, idempotent', async () => {
    const db = fakeDb({
      ...titles('amy', { pals: ['bob'], crownHistory: { crownLoss: ['2026-01'] } }),
      ...titles('bob', { pals: ['amy'] }),
      ...stats('amy', { knockouts: 4, period: '2026-08' }),
      ...stats('bob', { knockouts: 2, period: '2026-08' }),
      ...stats('amy', { knockouts: 1, period: '2026-09' }),
      ...stats('bob', { knockouts: 3, period: '2026-09' }),
      ...stats('bob', { games: 3, period: OCT }),
    });
    const result = await rebuildCrownHistory(db, { now: NOW });
    expect(result).toMatchObject({ evaluated: 2, months: 3 });
    expect(db.docs.get('userTitles/amy')).toMatchObject({ crowns: {}, crownHistory: { crownHunter: ['2026-08'] } });
    expect(db.docs.get('userTitles/bob')).toMatchObject({
      crowns: { crownRegular: OCT },
      crownHistory: { crownHunter: ['2026-09'] },
    });
    db.writes.length = 0;
    expect((await rebuildCrownHistory(db, { now: NOW })).written).toBe(0);
    expect(db.writes).toEqual([]);
  });
});
