import { computed } from 'vue';
import { useHandStore } from '../store/modules/hand.js';

/**
 * Composable for hand record management
 */
export function useHand() {
  const handStore = useHandStore();

  const hands = computed(() => handStore.hands);
  const loading = computed(() => handStore.loading);
  const error = computed(() => handStore.error);

  const createHandRecord = async (gameId, handData) => {
    return await handStore.createHandRecord(gameId, handData);
  };

  const loadHandRecords = async (gameId) => {
    return await handStore.loadHandRecords(gameId);
  };

  const listenToHandRecords = (gameId) => {
    return handStore.listenToHandRecords(gameId);
  };

  const deleteHandRecord = async (gameId, handId) => {
    return await handStore.deleteHandRecord(gameId, handId);
  };

  const cleanup = () => {
    return handStore.cleanup();
  };

  return {
    hands,
    loading,
    error,
    createHandRecord,
    loadHandRecords,
    listenToHandRecords,
    deleteHandRecord,
    cleanup
  };
}
