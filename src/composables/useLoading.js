import { useLoadingStore } from '../store/modules/loading.js';

export function useLoading() {
  const loadingStore = useLoadingStore();

  /** @return {number} token for stopLoading */
  const startLoading = (text = '') => loadingStore.startLoading(text);

  /**
   * End one wait by its token; with no token, free the screen of every wait
   * running now (a wrapped call that settles later then does nothing).
   * @param {number} [token]
   */
  const stopLoading = (token) => {
    loadingStore.stopLoading(token);
  };

  /**
   * Wraps an async function with loading state management
   * @param {Function} fn - Async function to execute
   * @param {string} text - Optional loading text
   * @param {{ delayMs?: number }} [options] - delayMs: show the overlay only
   *   if it's still running by then, so a write that's usually instant
   *   doesn't flash a spinner on every tap
   * @returns {Promise} - Result of the async function
   */
  const withLoading = async (fn, text = '', { delayMs = 0 } = {}) => {
    let token = null;
    let timer = null;
    const show = () => { token = startLoading(text); };
    if (delayMs > 0) timer = setTimeout(show, delayMs);
    else show();
    try {
      return await fn();
    } finally {
      if (timer) clearTimeout(timer);
      if (token !== null) stopLoading(token);
    }
  };

  return {
    startLoading,
    stopLoading,
    withLoading
  };
}
