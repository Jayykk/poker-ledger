/**
 * useMysteryStage — feeds the TV draw stage (MysteryStage.vue) on a clock
 * screen: the game's players / envelopes, and a queue of draws to reveal.
 *
 * Draws can be made on any device (the host's phone, the drawing player's
 * phone, the iPad itself). Every draw stamps its ticket with drawnAt, so this
 * listener spots new ones and queues them for the reveal — nothing extra has
 * to be sent to the TV. Draws already made when the screen opens are not
 * replayed; an undone draw that's drawn again plays again.
 */
import { ref, computed, watch, onUnmounted } from 'vue';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase-init.js';
import { allTickets } from '../utils/bounty.js';

// A draw older than this when it shows up (e.g. a reconnect) isn't replayed
const FRESH_MS = 2 * 60 * 1000;

export function useMysteryStage(gameIdRef) {
  const game = ref(null);
  const queue = ref([]);
  let seen = null; // ticket ids already drawn (and shown or skipped)
  let unsubscribe = null;

  function stop() {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
  }

  function start(gameId) {
    stop();
    seen = null;
    queue.value = [];
    game.value = null;
    if (!gameId) return;
    unsubscribe = onSnapshot(doc(db, 'games', gameId), (snap) => {
      if (!snap.exists()) return;
      game.value = { id: snap.id, ...snap.data() };
      const drawn = allTickets(game.value.players || [])
        .filter((t) => t.envelope !== null && t.envelope !== undefined);
      const drawnIds = new Set(drawn.map((t) => t.id));
      if (!seen) {
        seen = drawnIds;
        return;
      }
      // An undone draw can be drawn (and revealed) again
      for (const id of [...seen]) if (!drawnIds.has(id)) seen.delete(id);
      const fresh = drawn
        .filter((t) => !seen.has(t.id))
        .sort((a, b) => (a.drawnAt || 0) - (b.drawnAt || 0));
      for (const t of fresh) {
        seen.add(t.id);
        if (Date.now() - (Number(t.drawnAt) || 0) < FRESH_MS) queue.value = [...queue.value, t];
      }
    }, (err) => console.warn('Mystery stage listener:', err?.code || err));
  }

  watch(gameIdRef, (id) => start(id), { immediate: true });
  onUnmounted(stop);

  /** The draw being revealed now (the queue's head). */
  const current = computed(() => queue.value[0] || null);
  const next = () => { queue.value = queue.value.slice(1); };

  return { game, queue, current, next };
}
