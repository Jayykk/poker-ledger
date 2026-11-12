/**
 * Runs the real useTablePermissions composable (the admin table list and both
 * edit pages call it during setup, so it must not throw).
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

const auth = { user: null };
const admins = new Set();

vi.mock('../src/firebase-init.js', () => ({ db: {} }));
vi.mock('../src/store/modules/auth.js', () => ({ useAuthStore: () => auth }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, collection, id) => ({ collection, id }),
  getDoc: async (ref) => ({ exists: () => ref.collection === 'admins' && admins.has(ref.id) }),
}));

const { useTablePermissions } = await import('../src/composables/useTablePermissions.js');

describe('useTablePermissions', () => {
  beforeEach(() => {
    auth.user = { uid: 'host-1' };
    admins.clear();
  });

  it('can be set up, and exposes only functions that exist', () => {
    const api = useTablePermissions();
    expect(Object.keys(api).sort()).toEqual([
      'canEdit',
      'getItemStatus',
      'isAdmin',
      'isStatusLocked',
      'isStatusWarning',
      'loadPermissions',
      'permissionsLoaded',
    ]);
  });

  it('lets the host edit their own table, and nobody else', async () => {
    const { canEdit, loadPermissions, isAdmin } = useTablePermissions();
    await loadPermissions();
    expect(isAdmin.value).toBe(false);
    expect(canEdit({ hostUid: 'host-1' })).toBe(true);
    expect(canEdit({ hostUid: 'someone-else' })).toBe(false);
    expect(canEdit({})).toBe(false);
  });

  it('lets an admin edit any table, including an ended one', async () => {
    admins.add('host-1');
    const { canEdit, loadPermissions, isStatusLocked } = useTablePermissions();
    await loadPermissions();
    expect(canEdit({ hostUid: 'someone-else' })).toBe(true);
    expect(isStatusLocked({ status: 'ended' })).toBe(false);
  });

  it('locks ended tables for a non-admin and warns on running ones', async () => {
    const { loadPermissions, isStatusLocked, isStatusWarning } = useTablePermissions();
    await loadPermissions();
    expect(isStatusLocked({ status: 'ended' })).toBe(true);
    expect(isStatusLocked({ status: 'active' })).toBe(false);
    expect(isStatusWarning({ status: 'active' })).toBe(true);
    expect(isStatusWarning({ status: 'ended' })).toBe(false);
  });

  it('denies everything when signed out', async () => {
    auth.user = null;
    const { canEdit, loadPermissions, permissionsLoaded } = useTablePermissions();
    await loadPermissions();
    expect(permissionsLoaded.value).toBe(true);
    expect(canEdit({ hostUid: 'host-1' })).toBe(false);
  });
});
