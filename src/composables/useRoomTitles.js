// 房內即時稱號 for a room view: computeRoomTitles() over the live game and
// transaction log, with each player's own opt-out (userTitles
// prefs.showRoomTitles). The players' userTitles docs are the ones the name
// badges load anyway (shared cache), so this adds no reads. A player whose doc
// hasn't loaded yet gets no live title until it has (they may have opted out).
import { computed, unref, watch } from 'vue';
import { allowsRoomTitles, ensureUserTitles } from './useUserTitles.js';
import { computeRoomTitles } from '../utils/roomTitles.js';

/**
 * @param {import('vue').Ref<?object>} gameRef The room's game doc.
 * @param {object} [options]
 * @param {import('vue').Ref<Array>} [options.transactions] The room's log (首殺).
 * @param {boolean} [options.tournament] Tournament room.
 * @return {import('vue').ComputedRef<Object<string, string>>} playerId → title id.
 */
export function useRoomTitles(gameRef, { transactions, tournament } = {}) {
  watch(
    () => (unref(gameRef)?.players || []).map((p) => p.uid).filter(Boolean).join(','),
    (uids) => { if (uids) ensureUserTitles(uids.split(',')); },
    { immediate: true },
  );

  return computed(() => computeRoomTitles(unref(gameRef), {
    transactions: unref(transactions) || undefined,
    tournament,
    prefsOf: (uid) => ({ showRoomTitles: allowsRoomTitles(uid) === true }),
  }));
}
