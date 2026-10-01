/**
 * useMysteryStage — feeds the TV draw stage (MysteryStage.vue) on a clock
 * screen: the game's players / envelopes, and a queue of draws to reveal.
 *
 * Draws can be made on any device (the host's phone, the drawing player's
 * phone, the iPad itself). Every draw stamps its ticket with drawnAt, so this
 * listener spots new ones and queues them for the reveal — nothing extra has
 * to be sent to the TV. Draws already made when the screen opens are not
 * replayed; an undone draw that's drawn again plays again.
 *
 * A draw made on this screen is revealed as soon as it's written (markDrawn),
 * without waiting for the listener to bring it back.
 */
import { ref, computed, watch, onUnmounted } from 'vue';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase-init.js';
import { allTickets, pendingTickets, setTicketEnvelope } from '../utils/bounty.js';

// A draw older than this when it shows up (e.g. a reconnect) isn't replayed
const FRESH_MS = 2 * 60 * 1000;

export function useMysteryStage(gameIdRef) {
  const game = ref(null);
  const queue = ref([]);
  let seen = null; // ticket ids already drawn (and shown or skipped)
  let local = new Set(); // drawn here, not yet seen drawn in a snapshot
  let unsubscribe = null;

  function stop() {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
  }

  function start(gameId) {
    stop();
    seen = null;
    local = new Set();
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
      for (const id of [...local]) if (drawnIds.has(id)) local.delete(id);
      // An undone draw can be drawn (and revealed) again — but a snapshot
      // from before our own draw isn't an undo
      for (const id of [...seen]) if (!drawnIds.has(id) && !local.has(id)) seen.delete(id);
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

  /** A draw this screen just wrote: show it drawn and reveal it now. */
  function markDrawn(ticketId, slot) {
    if (!game.value || !seen || seen.has(ticketId)) return;
    const players = setTicketEnvelope(game.value.players || [], ticketId, slot);
    const tk = allTickets(players).find((t) => t.id === ticketId);
    if (!tk) return;
    game.value = { ...game.value, players };
    seen.add(ticketId);
    local.add(ticketId);
    queue.value = [...queue.value, tk];
  }

  /** Draws still waiting. */
  const pendingCount = computed(() => pendingTickets(game.value?.players || []).length);

  return { game, queue, current, next, markDrawn, pendingCount };
}
