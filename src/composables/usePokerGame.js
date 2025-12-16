/**
 * Poker Game Composable
 * Main composable for managing poker game state and actions
 */

import { computed } from 'vue';
import { usePokerStore } from '../store/modules/poker.js';
import { useAuthStore } from '../store/modules/auth.js';

export function usePokerGame() {
  const pokerStore = usePokerStore();
  const authStore = useAuthStore();

  // Game state
  const currentGame = computed(() => pokerStore.currentGame);
  const gameId = computed(() => pokerStore.gameId);
  const isInGame = computed(() => pokerStore.isInGame);
  const myHoleCards = computed(() => pokerStore.myHoleCards);
  const loading = computed(() => pokerStore.loading);
  const error = computed(() => pokerStore.error);

  // Player info
  const mySeat = computed(() => {
    if (!currentGame.value) return null;
    const userId = authStore.user?.uid;
    return Object.values(currentGame.value.seats || {})
      .find((seat) => seat && seat.odId === userId);
  });

  const myChips = computed(() => mySeat.value?.chips || 0);

  const isMyTurn = computed(() => {
    if (!currentGame.value) return false;
    const userId = authStore.user?.uid;
    return currentGame.value.table?.currentTurn === userId;
  });

  // Game info
  const potSize = computed(() => pokerStore.potSize);
  const communityCards = computed(() => pokerStore.communityCards);
  const currentRound = computed(() => pokerStore.currentRound);
  const activePlayers = computed(() => pokerStore.activePlayers);

  const currentBet = computed(() => currentGame.value?.table?.currentBet || 0);
  const minRaise = computed(() => currentGame.value?.table?.minRaise || 0);

  const callAmount = computed(() => {
    if (!mySeat.value) return 0;
    return currentBet.value - (mySeat.value.currentBet || 0);
  });

  const canCheck = computed(() => callAmount.value === 0);
  const canRaise = computed(() => myChips.value > callAmount.value);

  // Actions
  const createGame = async (config) => {
    return await pokerStore.createGame(config);
  };

  const joinSeat = async (gameId, seatNumber, buyIn) => {
    return await pokerStore.joinSeat(gameId, seatNumber, buyIn);
  };

  const leaveSeat = async () => {
    return await pokerStore.leaveSeat();
  };

  const startHand = async () => {
    return await pokerStore.startHand();
  };

  const joinGame = async (gameId) => {
    const userId = authStore.user?.uid;
    return await pokerStore.joinGameListener(gameId, userId);
  };

  const getAvailableGames = async () => {
    return await pokerStore.getAvailableGames();
  };

  return {
    // State
    currentGame,
    gameId,
    isInGame,
    myHoleCards,
    loading,
    error,

    // Player info
    mySeat,
    myChips,
    isMyTurn,

    // Game info
    potSize,
    communityCards,
    currentRound,
    activePlayers,
    currentBet,
    minRaise,
    callAmount,
    canCheck,
    canRaise,

    // Actions
    createGame,
    joinSeat,
    leaveSeat,
    startHand,
    joinGame,
    getAvailableGames,
  };
}
