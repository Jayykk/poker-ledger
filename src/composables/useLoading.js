import { useLoadingStore } from '../store/modules/loading.js';

export function useLoading() {
  const loadingStore = useLoadingStore();

  const startLoading = (text = '') => {
    loadingStore.startLoading(text);
  };

  const stopLoading = () => {
    loadingStore.stopLoading();
  };

  /**
   * Wraps an async function with loading state management
   * @param {Function} fn - Async function to execute
   * @param {string} text - Optional loading text
   * @returns {Promise} - Result of the async function
   */
  const withLoading = async (fn, text = '', { delayMs = 0 } = {}) => {
    // delayMs: show the overlay only if it's still running by then, so a
    // write that's usually instant doesn't flash a spinner on every tap
    let shown = false;
    let timer = null;
    const show = () => { shown = true; startLoading(text); };
    if (delayMs > 0) timer = setTimeout(show, delayMs);
    else show();
    try {
      return await fn();
    } finally {
      if (timer) clearTimeout(timer);
      if (shown) stopLoading();
    }
  };

  return {
    startLoading,
    stopLoading,
    withLoading
  };
}
