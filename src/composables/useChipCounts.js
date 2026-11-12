// The final-stack form of a table with chip denominations
// (utils/chipDenominations.js): counting chips sets the stack, and typing the
// stack instead drops the counts — so what is saved always adds up.
import { computed, ref, watch } from 'vue';
import {
  normalizeDenominations, normalizeChipCounts, chipCountTotal, countsForStack,
} from '../utils/chipDenominations.js';

/**
 * @param {import('vue').Ref<?object>} game           games/{id} data (its `denominations`)
 * @param {import('vue').Ref<?object>} editingPlayer  the seat being edited (its `stack` is written)
 */
export function useChipCounts(game, editingPlayer) {
  const denominations = computed(() => normalizeDenominations(game.value?.denominations));
  const counts = ref({});

  /** Start editing a seat: its saved counts, while they still match its stack. */
  function loadCounts(player) {
    counts.value = countsForStack(player, denominations.value);
  }

  /** The chips were counted: the stack follows. */
  function setCounts(next) {
    counts.value = normalizeChipCounts(next, denominations.value);
    if (editingPlayer.value) editingPlayer.value.stack = chipCountTotal(counts.value);
  }

  // The stack was typed (or changed) to something the counts don't add up to
  watch(() => editingPlayer.value?.stack, (stack) => {
    if (Object.keys(counts.value).length && (Number(stack) || 0) !== chipCountTotal(counts.value)) {
      counts.value = {};
    }
  }, { flush: 'sync' });

  /** What to save for the seat: the stack and the counts behind it ({} = none). */
  function stackFields() {
    return { stack: editingPlayer.value?.stack, stackCounts: { ...counts.value } };
  }

  return { denominations, counts, loadCounts, setCounts, stackFields };
}
