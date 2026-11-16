import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useLoadingStore = defineStore('loading', () => {
  // How many waits are running: two at once (a buy-in for each of two
  // players) keep the spinner up until both are done, not just the first
  const active = ref(0);
  const isLoading = computed(() => active.value > 0);
  const loadingText = ref('');

  const startLoading = (text = '') => {
    active.value += 1;
    loadingText.value = text;
  };

  const stopLoading = () => {
    active.value = Math.max(0, active.value - 1);
    if (!active.value) loadingText.value = '';
  };

  return {
    isLoading,
    loadingText,
    startLoading,
    stopLoading
  };
});
