import { describe, it, expect } from 'vitest';
import { setTitlePrefs } from '../../functions/src/handlers/userTitles.js';
import { THEME_FRAMES } from '../../functions/src/utils/titleRules.js';

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

describe('setTitlePrefs with a themed frame', () => {
  // Read from the catalog, so a frame id can change without touching this
  const [frame, other] = THEME_FRAMES;
  const withFamily = (tier, data = {}) => doc({
    unlocked: { regular: { tier: 6, at: 1 }, [frame.family]: { tier, at: 2 } },
    ...data,
  });

  it('stores an earned themed frame and puts it on the display', async () => {
    const db = fakeDb(withFamily(5, { prefs: { mode: 'off', frame: 'none' } }));
    const result = await setTitlePrefs(db, 'me', { frame: frame.id }, NOW);
    expect(result.prefs.frame).toBe(frame.id);
    expect(result.display).toEqual({ familyId: null, tier: null, frame: frame.id });
    expect(db.docs.get('me')).toMatchObject({
      prefs: { mode: 'off', frame: frame.id },
      display: { familyId: null, tier: null, frame: frame.id },
    });
  });

  it('next to a title, and other prefs leave it alone', async () => {
    const db = fakeDb(withFamily(7));
    await setTitlePrefs(db, 'me', { frame: frame.id }, NOW);
    const result = await setTitlePrefs(db, 'me', { mode: 'pick', titleId: 'regular', titleTier: 2 }, NOW);
    expect(result.prefs.frame).toBe(frame.id);
    expect(result.display).toEqual({ familyId: 'regular', tier: 2, frame: frame.id });
  });

  it('one step short (or another family\'s frame) is refused and nothing is written', async () => {
    const db = fakeDb(withFamily(4));
    await expect(setTitlePrefs(db, 'me', { frame: frame.id }, NOW))
      .rejects.toMatchObject({ code: 'failed-precondition', message: 'TITLE_PREFS_FRAME_LOCKED' });
    await expect(setTitlePrefs(db, 'me', { frame: other.id }, NOW))
      .rejects.toMatchObject({ code: 'failed-precondition', message: 'TITLE_PREFS_FRAME_LOCKED' });
    await expect(setTitlePrefs(db, 'me', { frame: 'ruby' }, NOW))
      .rejects.toMatchObject({ code: 'invalid-argument', message: 'TITLE_PREFS_BAD_FRAME' });
    expect(db.docs.get('me').prefs).toEqual({ mode: 'auto', frame: 'none' });
    expect(db.docs.get('me').display).toBeNull();
  });

  it('a stored themed pick that is no longer earned shows the tier frame, and auto / none can still be set', async () => {
    // 6 + 4 = 10 titles → bronze
    const db = fakeDb(withFamily(4, { prefs: { mode: 'off', frame: frame.id } }));
    let result = await setTitlePrefs(db, 'me', { showRoomTitles: true }, NOW);
    expect(result.prefs).toMatchObject({ frame: frame.id, showRoomTitles: true });
    expect(result.display).toEqual({ familyId: null, tier: null, frame: 'bronze' });
    result = await setTitlePrefs(db, 'me', { frame: 'none' }, NOW);
    expect(result.display).toBeNull();
  });
});

describe('setTitlePrefs with a name set (nameSet)', () => {
  it('stores the set and puts it on the display, for viewers', async () => {
    const db = fakeDb(doc());
    const result = await setTitlePrefs(db, 'me', { nameSet: 'chuuni' }, NOW);
    expect(result.prefs).toMatchObject({ mode: 'auto', nameSet: 'chuuni' });
    expect(result.display).toEqual({ familyId: 'regular', tier: 6, frame: null, nameSet: 'chuuni' });
    expect(db.docs.get('me')).toMatchObject({
      prefs: { mode: 'auto', nameSet: 'chuuni' },
      display: { familyId: 'regular', tier: 6, frame: null, nameSet: 'chuuni' },
    });
  });

  it('other prefs leave it alone; classic takes it off the display again', async () => {
    const db = fakeDb(doc({ prefs: { mode: 'auto', frame: 'none', nameSet: 'chuuni' } }));
    let result = await setTitlePrefs(db, 'me', { mode: 'pick', titleId: 'host', titleTier: 2 }, NOW);
    expect(result.prefs.nameSet).toBe('chuuni');
    expect(result.display).toEqual({ familyId: 'host', tier: 2, frame: null, nameSet: 'chuuni' });
    result = await setTitlePrefs(db, 'me', { nameSet: 'classic' }, NOW);
    expect(result.prefs).toMatchObject({ mode: 'pick', titleId: 'host', titleTier: 2, nameSet: 'classic' });
    expect(result.display).toEqual({ familyId: 'host', tier: 2, frame: null });
    // mergeFields: the stored display is replaced whole, no nameSet left behind
    expect(db.docs.get('me').display).toEqual({ familyId: 'host', tier: 2, frame: null });
    expect(db.docs.get('me').prefs.nameSet).toBe('classic');
  });

  it('a doc from before name sets is classic; with titles off the set is stored and nothing shows', async () => {
    const db = fakeDb(doc({ prefs: { mode: 'off', frame: 'none' } }));
    let result = await setTitlePrefs(db, 'me', { showRoomTitles: true }, NOW);
    expect(result.prefs.nameSet).toBe('classic');
    result = await setTitlePrefs(db, 'me', { nameSet: 'chuuni' }, NOW);
    expect(result.prefs).toMatchObject({ mode: 'off', nameSet: 'chuuni' });
    expect(result.display).toBeNull();
    // Turned on later: in the set picked earlier
    result = await setTitlePrefs(db, 'me', { mode: 'auto' }, NOW);
    expect(result.display).toEqual({ familyId: 'regular', tier: 6, frame: null, nameSet: 'chuuni' });
  });

  it('a crown shows in its one set of names', async () => {
    const db = fakeDb(doc({ crowns: { crownHunter: '2026-11' } }));
    const result = await setTitlePrefs(db, 'me', { nameSet: 'chuuni' }, NOW);
    expect(result.prefs.nameSet).toBe('chuuni');
    expect(result.display).toEqual({ familyId: 'crownHunter', tier: 4, frame: null, month: '2026-11' });
  });

  it('an unknown set is refused and nothing is written', async () => {
    const db = fakeDb(doc());
    for (const bad of ['emo', '', null, 1]) {
      await expect(setTitlePrefs(db, 'me', { nameSet: bad }, NOW))
        .rejects.toMatchObject({ code: 'invalid-argument', message: 'TITLE_PREFS_BAD_NAME_SET' });
    }
    expect(db.docs.get('me').prefs).toEqual({ mode: 'auto', frame: 'none' });
  });
});
