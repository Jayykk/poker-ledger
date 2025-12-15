import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useLoadingStore = defineStore('loading', () => {
  const isLoading = ref(false);
  const loadingText = ref('');

  const startLoading = (text = '') => {
    isLoading.value = true;
    loadingText.value = text;
  };

  const stopLoading = () => {
    isLoading.value = false;
    loadingText.value = '';
  };

  return {
    isLoading,
    loadingText,
    startLoading,
    stopLoading
  };
});
