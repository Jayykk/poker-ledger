<template>
  <button
    v-if="canShow"
    @click="handleShowCards"
    :disabled="loading"
    class="show-cards-btn bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
  >
    <i class="fas fa-eye"></i>
    <span>{{ $t('poker.showCards') }}</span>
  </button>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { getFunctions, httpsCallable } from 'firebase/functions';

const props = defineProps({
  gameId: {
    type: String,
    required: true
  },
  hasCards: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['cards-shown', 'error']);

const { t } = useI18n();
const loading = ref(false);

const canShow = computed(() => props.hasCards && !loading.value);

const handleShowCards = async () => {
  if (!props.gameId) {
    emit('error', 'No game ID');
    return;
  }

  loading.value = true;
  try {
    const functions = getFunctions();
    const showPokerCards = httpsCallable(functions, 'showPokerCards');

    const result = await showPokerCards({
      gameId: props.gameId
    });

    if (result.data.success) {
      emit('cards-shown', result.data.result);
    }
  } catch (error) {
    console.error('Error showing cards:', error);
    emit('error', error.message);
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.show-cards-btn {
  font-size: 0.875rem;
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.show-cards-btn:hover:not(:disabled) {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}
</style>
