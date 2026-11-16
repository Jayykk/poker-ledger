import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useLoadingStore = defineStore('loading', () => {
  // The waits running now, one token each: two at once (a buy-in for each
  // of two players) keep the spinner up until both are done, and stopping
  // the same wait twice (a timeout freed the screen, then the call settled)
  // does nothing the second time
  const active = ref(new Set());
  const isLoading = computed(() => active.value.size > 0);
  const loadingText = ref('');
  let nextToken = 0;

  /** @return {number} token to pass to stopLoading */
  const startLoading = (text = '') => {
    nextToken += 1;
    active.value = new Set(active.value).add(nextToken);
    loadingText.value = text;
    return nextToken;
  };

  /**
   * End one wait (its token), or with no token free the screen of every wait
   * running now (e.g. a create that timed out).
   * @param {number} [token]
   */
  const stopLoading = (token) => {
    if (token === undefined) {
      active.value = new Set();
    } else if (active.value.has(token)) {
      const next = new Set(active.value);
      next.delete(token);
      active.value = next;
    }
    if (!active.value.size) loadingText.value = '';
  };

  return {
    isLoading,
    loadingText,
    startLoading,
    stopLoading
  };
});
