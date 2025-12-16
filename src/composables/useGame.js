import { computed } from 'vue';
import { useGameStore } from '../store/modules/game.js';

/**
 * Composable for game management
 */
export function useGame() {
  const gameStore = useGameStore();

  const game = computed(() => gameStore.game);
  const gameId = computed(() => gameStore.gameId);
  const isInGame = computed(() => gameStore.isInGame);
  const isHost = computed(() => gameStore.isHost);
  const myPlayer = computed(() => gameStore.myPlayer);
  const totalPot = computed(() => gameStore.totalPot);
  const totalStack = computed(() => gameStore.totalStack);
  const gap = computed(() => gameStore.gap);
  const loading = computed(() => gameStore.loading);
  const error = computed(() => gameStore.error);

  const createGame = async (name, buyInAmount, type, options) => {
    return await gameStore.createGame(name, buyInAmount, type, options);
  };

  const checkGameStatus = async (id) => {
    return await gameStore.checkGameStatus(id);
  };

  const joinByBinding = async (id, playerId) => {
    return await gameStore.joinByBinding(id, playerId);
  };

  const joinAsNewPlayer = async (id, buyInAmount) => {
    return await gameStore.joinAsNewPlayer(id, buyInAmount);
  };

  const joinGameListener = async (id) => {
    return await gameStore.joinGameListener(id);
  };

  const addPlayer = async (name, buyIn) => {
    return await gameStore.addPlayer(name, buyIn);
  };

  const updatePlayer = async (player) => {
    return await gameStore.updatePlayer(player);
  };

  const removePlayer = async (player) => {
    return await gameStore.removePlayer(player);
  };

  const bindSeat = async (player) => {
    return await gameStore.bindSeat(player);
  };

  const settleGame = async (exchangeRate) => {
    return await gameStore.settleGame(exchangeRate);
  };

  const closeGame = async () => {
    return await gameStore.closeGame();
  };

  return {
    game,
    gameId,
    isInGame,
    isHost,
    myPlayer,
    totalPot,
    totalStack,
    gap,
    loading,
    error,
    createGame,
    checkGameStatus,
    joinByBinding,
    joinAsNewPlayer,
    joinGameListener,
    addPlayer,
    updatePlayer,
    removePlayer,
    bindSeat,
    settleGame,
    closeGame
  };
}
