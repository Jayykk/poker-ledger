/**
 * Game Actions Composable
 * Handles poker game actions (fold, check, call, raise, all-in, show cards, chat)
 */

import { usePokerStore } from '../store/modules/poker.js';
import { useNotification } from './useNotification.js';
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

  /**
   * Fold current hand
   */
  const fold = async () => {
    try {
      await pokerStore.performAction('fold');
      success(SUCCESS_MESSAGES.FOLD);
    } catch (error) {
      const message = getErrorMessage(error.code);
      showError(message);
      throw error;
    }
  };

  /**
   * Check (no bet)
   */
  const check = async () => {
    try {
      await pokerStore.performAction('check');
      success(SUCCESS_MESSAGES.CHECK);
    } catch (error) {
      const message = getErrorMessage(error.code);
      showError(message);
      throw error;
    }
  };

  /**
   * Call current bet
   */
  const call = async () => {
    try {
      await pokerStore.performAction('call');
      success(SUCCESS_MESSAGES.CALL);
    } catch (error) {
      const message = getErrorMessage(error.code);
      showError(message);
      throw error;
    }
  };

  /**
   * Raise bet by amount
   */
  const raise = async (amount) => {
    try {
      await pokerStore.performAction('raise', amount);
      success(SUCCESS_MESSAGES.RAISE(amount));
    } catch (error) {
      const message = getErrorMessage(error.code);
      showError(message);
      throw error;
    }
  };

  /**
   * Go all-in
   */
  const allIn = async () => {
    try {
      await pokerStore.performAction('all_in');
      success(SUCCESS_MESSAGES.ALL_IN);
    } catch (error) {
      const message = getErrorMessage(error.code);
      showError(message);
      throw error;
    }
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
  };
}

