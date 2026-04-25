import { ref } from 'vue';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase-init.js';
import { useAuthStore } from '../store/modules/auth.js';

/**
 * Composable for table/tournament edit permission checks.
 *
 * Permission model:
 *  - Admin (`admins/{uid}` document exists): can edit any game or tournament session.
 *  - Host (`item.hostUid === currentUser.uid` or `item.meta.createdBy === currentUser.uid`): can edit their own items.
 *  - Others: read-only.
 *
 * Status restrictions (non-admin):
 *  - ended: editing blocked.
 *  - active/running/playing: editing allowed with a warning.
 */
export function useTablePermissions() {
  const authStore = useAuthStore();
  const isAdmin = ref(false);
  const permissionsLoaded = ref(false);

  async function loadPermissions() {
    permissionsLoaded.value = false;
    if (!authStore.user?.uid) {
      isAdmin.value = false;
      permissionsLoaded.value = true;
      return;
    }
    try {
      const adminDoc = await getDoc(doc(db, 'admins', authStore.user.uid));
      isAdmin.value = adminDoc.exists();
    } catch (err) {
      console.error('[useTablePermissions] Failed to load admin status:', err);
      isAdmin.value = false;
    } finally {
      permissionsLoaded.value = true;
    }
  }

  function canEdit(item) {
    if (!authStore.user?.uid) return false;
    if (isAdmin.value) return true;
    const uid = authStore.user.uid;
    // Support both new schema (hostUid) and old pokerGames schema (meta.createdBy)
    return item?.hostUid === uid || item?.meta?.createdBy === uid;
  }

  function getItemStatus(item) {
    return item?.status || item?.state?.status || 'unknown';
  }

  /**
   * Returns true when the item is ended and the current user is not admin.
   * In this case all editing should be blocked.
   */
  function isStatusLocked(item) {
    const status = getItemStatus(item);
    return status === 'ended' && !isAdmin.value;
  }

  /**
   * Returns true when the item is active/running, meaning risky edits should
   * show a warning before saving.
   */
  function isStatusWarning(item) {
    const status = getItemStatus(item);
    return status === 'active' || status === 'running' || status === 'playing';
  }

  return {
    isAdmin,
    permissionsLoaded,
    loadPermissions,
    canEdit,
    isStatusLocked,
    isStatusWarning,
    getItemStatus,
  };
}
