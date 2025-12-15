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
  const withLoading = async (fn, text = '') => {
    startLoading(text);
    try {
      return await fn();
    } finally {
      stopLoading();
    }
  };

  return {
    startLoading,
    stopLoading,
    withLoading
  };
}
