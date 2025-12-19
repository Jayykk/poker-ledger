/**
 * Game Actions Composable
 * Handles poker game actions (fold, check, call, raise, all-in, show cards, chat)
 * With optimistic UI updates for instant feedback
 */

import { ref } from 'vue';
import { usePokerStore } from '../store/modules/poker.js';
import { useNotification } from './useNotification.js';
import { useGameAnimations } from './useGameAnimations.js';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Error message mapping
const ERROR_MESSAGES = {
  NOT_YOUR_TURN: '還沒輪到你',
  INSUFFICIENT_CHIPS: '籌碼不足',
  INVALID_ACTION: '無效的操作',
  GAME_NOT_ACTIVE: '遊戲尚未開始',
  INVALID_RAISE_AMOUNT: '加注金額無效',
  ALREADY_FOLDED: '你已經棄牌了',
  PLAYER_NOT_FOUND: '找不到玩家',
  GAME_NOT_FOUND: '找不到遊戲',
  INVALID_PLAYER_STATUS: '玩家狀態無效',
  CANNOT_CHECK: '不能過牌，必須跟注或棄牌',
  NOTHING_TO_CALL: '沒有需要跟注的金額',
  NOT_ENOUGH_CHIPS: '籌碼不足',
  NO_CHIPS_FOR_ALL_IN: '沒有籌碼可以全下',
  GAME_ALREADY_IN_PROGRESS: '遊戲已經開始',
  NOT_ENOUGH_PLAYERS: '至少需要2位玩家才能開始',
  STALE_ACTION: '此操作已過期，請重試',  // ✨ NEW
  GAME_PAUSED: '遊戲已暫停',  // ✨ NEW
};

// Success message mapping
const SUCCESS_MESSAGES = {
  FOLD: '你棄牌了',
  CHECK: '你過牌了',
  CALL: '你跟注了',
  RAISE: (amount) => `你加注了 ${amount}`,
  ALL_IN: '你全下了！',
};

// Optimistic UI constants
const OPTIMISTIC_ACTION_TIMEOUT_MS = 500;

/**
 * Get user-friendly error message from error code
 * @param {string} code - Error code
 * @return {string} Error message
 */
function getErrorMessage(code) {
  return ERROR_MESSAGES[code] || code || '發生錯誤';
}

export function useGameActions() {
  const pokerStore = usePokerStore();
  const { success, error: showError } = useNotification();
  const { playSound } = useGameAnimations();
  
  // Track if buttons are disabled (for optimistic UI)
  const actionsDisabled = ref(false);

  /**
   * Perform optimistic action with instant feedback
   * @param {string} action - Action name
   * @param {number} amount - Optional amount for raise
   * @param {string} soundName - Sound to play
   * @param {string} successMessage - Success message to show
   */
  const performOptimisticAction = (action, amount, soundName, successMessage) => {
    // 1. Instant visual feedback
    playSound(soundName);
    
    // 2. Instant disable action buttons
    actionsDisabled.value = true;
    
    // 3. Background API call with optimistic flag (fire-and-forget)
    pokerStore.performAction(action, amount, { optimistic: true });
    
    // 4. Re-enable buttons after timeout
    // Note: Buttons will be controlled by turn state from real-time listeners
    setTimeout(() => {
      actionsDisabled.value = false;
    }, OPTIMISTIC_ACTION_TIMEOUT_MS);
  };

  /**
   * Fold current hand
   */
  const fold = () => {
    performOptimisticAction('fold', 0, 'fold', SUCCESS_MESSAGES.FOLD);
  };

  /**
   * Check (no bet)
   */
  const check = () => {
    performOptimisticAction('check', 0, 'check', SUCCESS_MESSAGES.CHECK);
  };

  /**
   * Call current bet
   */
  const call = () => {
    performOptimisticAction('call', 0, 'call', SUCCESS_MESSAGES.CALL);
  };

  /**
   * Raise bet by amount
   */
  const raise = (amount) => {
    performOptimisticAction('raise', amount, 'raise', SUCCESS_MESSAGES.RAISE(amount));
  };

  /**
   * Go all-in
   */
  const allIn = () => {
    performOptimisticAction('all_in', 0, 'allin', SUCCESS_MESSAGES.ALL_IN);
  };

  /**
   * Show cards voluntarily
   */
  const showCards = async (gameId) => {
    try {
      const functions = getFunctions();
      const showPokerCards = httpsCallable(functions, 'showPokerCards');

      const result = await showPokerCards({ gameId });
      if (result.data.success) {
        success('Cards shown');
        return result.data.result;
      }
    } catch (error) {
      showError(`Error showing cards: ${error.message}`);
      throw error;
    }
  };

  /**
   * Send chat message
   */
  const sendMessage = async (gameId, message) => {
    try {
      const functions = getFunctions();
      const sendChatMessage = httpsCallable(functions, 'sendChatMessage');

      const result = await sendChatMessage({ gameId, message });
      if (result.data.success) {
        return result.data.result;
      }
    } catch (error) {
      showError(`Error sending message: ${error.message}`);
      throw error;
    }
  };

  /**
   * Join as spectator
   */
  const joinAsSpectator = async (gameId) => {
    try {
      const functions = getFunctions();
      const joinPokerSpectator = httpsCallable(functions, 'joinPokerSpectator');

      const result = await joinPokerSpectator({ gameId });
      if (result.data.success) {
        success('Joined as spectator');
        return result.data.result;
      }
    } catch (error) {
      showError(`Error joining as spectator: ${error.message}`);
      throw error;
    }
  };

  /**
   * Leave spectator mode
   */
  const leaveSpectator = async (gameId) => {
    try {
      const functions = getFunctions();
      const leavePokerSpectator = httpsCallable(functions, 'leavePokerSpectator');

      const result = await leavePokerSpectator({ gameId });
      if (result.data.success) {
        success('Left spectator mode');
      }
    } catch (error) {
      showError(`Error leaving spectator: ${error.message}`);
      throw error;
    }
  };

  return {
    fold,
    check,
    call,
    raise,
    allIn,
    showCards,
    sendMessage,
    joinAsSpectator,
    leaveSpectator,
    actionsDisabled, // Export disabled state for UI
  };
}

