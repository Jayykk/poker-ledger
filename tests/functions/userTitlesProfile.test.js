import { describe, it, expect } from 'vitest';
import {
  publicProfileOf, recomputeUserTitles, syncPublicProfile,
} from '../../functions/src/handlers/userTitles.js';

// Just enough Firestore for the userTitles handlers: doc refs, transactions,
// set with merge / mergeFields
function fakeDb(initial = {}) {
  const docs = new Map(Object.entries(initial));
  const writes = [];
  const ref = (id) => ({ id });
  const snap = (id) => ({ exists: docs.has(id), data: () => docs.get(id) });
  const set = (r, data, opts = {}) => {
    writes.push(r.id);
    const current = docs.get(r.id) || {};
    if (opts.mergeFields) {
      const next = { ...current };
      for (const k of opts.mergeFields) next[k] = data[k];
      docs.set(r.id, next);
    } else if (opts.merge) {
      docs.set(r.id, { ...current, ...data });
    } else {
      docs.set(r.id, { ...data });
    }
  };
  return {
    docs,
    writes,
    collection: () => ({ doc: ref }),
    runTransaction: async (fn) => fn({ get: async (r) => snap(r.id), set }),
  };
}

const stats = (total = {}) => ({ total: { games: 0, ...total }, cash: {}, tournament: {} });

describe('public profile in userTitles (LINE photo + name)', () => {
  it('takes the LINE photo and the name from users/{uid}', () => {
    expect(publicProfileOf({ avatarUrl: 'https://p/a.jpg', name: '阿傑', email: 'x@y' }))
      .toEqual({ avatar: 'https://p/a.jpg', name: '阿傑' });
    expect(publicProfileOf({ displayName: 'Bo' })).toEqual({ avatar: null, name: 'Bo' });
    expect(publicProfileOf(null)).toEqual({ avatar: null, name: null });
  });

  it('a recompute (and so the backfill) writes the profile next to the titles', async () => {
    const db = fakeDb();
    const profile = { avatar: 'https://p/a.jpg', name: '阿傑' };
    await recomputeUserTitles(db, 'u1', stats({ games: 10 }), 5, { profile });
    expect(db.docs.get('u1')).toMatchObject({ uid: 'u1', avatar: 'https://p/a.jpg', name: '阿傑', unlocked: { regular: { tier: 1, at: 5 } } });
  });

  it('a photo but no titles yet still gets a doc; neither gets none', async () => {
    const db = fakeDb();
    await recomputeUserTitles(db, 'u1', stats(), 5, { profile: { avatar: 'https://p/a.jpg', name: 'A' } });
    await recomputeUserTitles(db, 'u2', stats(), 5, { profile: { avatar: null, name: 'B' } });
    expect(db.docs.get('u1')).toMatchObject({ avatar: 'https://p/a.jpg', unlocked: {} });
    expect(db.docs.has('u2')).toBe(false);
  });

  it('nothing changed → no write; a recompute without a profile keeps the stored one', async () => {
    const profile = { avatar: 'https://p/a.jpg', name: 'A' };
    const db = fakeDb();
    await recomputeUserTitles(db, 'u1', stats({ games: 10 }), 5, { profile });
    db.writes.length = 0;
    expect((await recomputeUserTitles(db, 'u1', stats({ games: 12 }), 9, { profile })).written).toBe(false);
    expect(db.writes).toEqual([]);
    // A rebuild that changes titles but carries no profile leaves the photo alone
    await recomputeUserTitles(db, 'u1', stats({ games: 40 }), 9);
    expect(db.docs.get('u1')).toMatchObject({ avatar: 'https://p/a.jpg', unlocked: { regular: { tier: 2 } } });
  });

  it('a rebuild replaces the unlocked map whole (dropped tiers go)', async () => {
    const db = fakeDb({ u1: { uid: 'u1', avatar: 'x', unlocked: { regular: { tier: 3, at: 1 }, bubble: { tier: 3, at: 1 } }, prefs: {}, display: null } });
    await recomputeUserTitles(db, 'u1', stats({ games: 66 }), 9, { rebuild: true });
    expect(db.docs.get('u1').unlocked).toEqual({ regular: { tier: 2, at: 1 } });
    expect(db.docs.get('u1').avatar).toBe('x');
  });

  it('users/{uid} trigger: a new photo or name syncs; other edits are skipped', async () => {
    const db = fakeDb({ u1: { uid: 'u1', avatar: 'old', name: 'A', unlocked: { regular: { tier: 1, at: 1 } } } });
    const before = { avatarUrl: 'old', name: 'A', email: 'a@b' };
    expect(await syncPublicProfile(db, 'u1', before, { ...before, lineNotifyEnabled: false })).toBe(false);
    expect(await syncPublicProfile(db, 'u1', before, { ...before, avatarUrl: 'new' })).toBe(true);
    expect(db.docs.get('u1')).toMatchObject({ avatar: 'new', name: 'A', unlocked: { regular: { tier: 1, at: 1 } } });
    // Deleted user: nothing
    expect(await syncPublicProfile(db, 'u1', before, null)).toBe(false);
    // First write of someone with no photo and no titles: no doc
    expect(await syncPublicProfile(db, 'u9', null, { name: 'Z' })).toBe(false);
    expect(db.docs.has('u9')).toBe(false);
    // First LINE login with a photo: a doc
    expect(await syncPublicProfile(db, 'u8', null, { name: 'Y', avatarUrl: 'https://p/y.jpg' })).toBe(true);
    expect(db.docs.get('u8')).toMatchObject({ uid: 'u8', avatar: 'https://p/y.jpg', name: 'Y' });
  });
});
