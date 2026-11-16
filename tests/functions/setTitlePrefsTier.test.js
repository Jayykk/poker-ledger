import { describe, it, expect } from 'vitest';
import { setTitlePrefs } from '../../functions/src/handlers/userTitles.js';

// Just enough Firestore for setTitlePrefs: doc refs, a transaction, set with
// mergeFields
function fakeDb(initial = {}) {
  const docs = new Map(Object.entries(initial));
  const ref = (id) => ({ id });
  const snap = (id) => ({ exists: docs.has(id), data: () => docs.get(id) });
  const set = (r, data, opts = {}) => {
    const next = { ...(docs.get(r.id) || {}) };
    for (const k of opts.mergeFields || Object.keys(data)) next[k] = data[k];
    docs.set(r.id, next);
  };
  return {
    docs,
    collection: () => ({ doc: ref }),
    runTransaction: async (fn) => fn({ get: async (r) => snap(r.id), set }),
  };
}

const NOW = Date.parse('2026-11-16T12:00:00+08:00');
const doc = (data = {}) => ({
  me: {
    uid: 'me',
    ladder: 2,
    unlocked: { regular: { tier: 6, at: 1 }, host: { tier: 3, at: 2 } },
    prefs: { mode: 'auto', frame: 'none' },
    display: null,
    ...data,
  },
});

describe('setTitlePrefs with a step (titleTier)', () => {
  it('stores the picked step and shows it', async () => {
    const db = fakeDb(doc());
    const result = await setTitlePrefs(db, 'me', { mode: 'pick', titleId: 'regular', titleTier: 2 }, NOW);
    expect(result.prefs).toMatchObject({ mode: 'pick', titleId: 'regular', titleTier: 2 });
    expect(result.display).toEqual({ familyId: 'regular', tier: 2, frame: null });
    expect(db.docs.get('me')).toMatchObject({
      prefs: { mode: 'pick', titleId: 'regular', titleTier: 2 },
      display: { familyId: 'regular', tier: 2, frame: null },
    });
  });

  it('null is the highest; another family without a step goes back to its highest', async () => {
    const db = fakeDb(doc({ prefs: { mode: 'pick', titleId: 'regular', titleTier: 2, frame: 'none' } }));
    let result = await setTitlePrefs(db, 'me', { mode: 'pick', titleId: 'regular', titleTier: null }, NOW);
    expect(result.display).toMatchObject({ familyId: 'regular', tier: 6 });
    await setTitlePrefs(db, 'me', { mode: 'pick', titleId: 'regular', titleTier: 3 }, NOW);
    result = await setTitlePrefs(db, 'me', { mode: 'pick', titleId: 'host' }, NOW);
    expect(result.prefs.titleTier).toBeNull();
    expect(result.display).toMatchObject({ familyId: 'host', tier: 3 });
  });

  it('a step above the one reached, or not a step at all, is refused and nothing is written', async () => {
    const db = fakeDb(doc());
    await expect(setTitlePrefs(db, 'me', { mode: 'pick', titleId: 'host', titleTier: 4 }, NOW))
      .rejects.toMatchObject({ code: 'failed-precondition', message: 'TITLE_PREFS_TIER_LOCKED' });
    await expect(setTitlePrefs(db, 'me', { mode: 'pick', titleId: 'host', titleTier: 'top' }, NOW))
      .rejects.toMatchObject({ code: 'invalid-argument', message: 'TITLE_PREFS_BAD_TIER' });
    expect(db.docs.get('me').prefs).toEqual({ mode: 'auto', frame: 'none' });
  });

  it('a crown ignores the step', async () => {
    const db = fakeDb(doc({ crowns: { crownHunter: '2026-11' } }));
    const result = await setTitlePrefs(db, 'me', { mode: 'pick', titleId: 'crownHunter', titleTier: 2 }, NOW);
    expect(result.prefs.titleTier).toBeNull();
    expect(result.display).toEqual({ familyId: 'crownHunter', tier: 4, frame: null, month: '2026-11' });
  });
});
