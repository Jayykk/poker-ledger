/**
 * Game Actions Composable
 * Handles poker game actions (fold, check, call, raise, all-in, show cards, chat)
 */

import { usePokerStore } from '../store/modules/poker.js';
import { useNotification } from './useNotification.js';
import { getFunctions, httpsCallable } from 'firebase/functions';

export function useGameActions() {
  const pokerStore = usePokerStore();
  const { success, error: showError } = useNotification();

  /**
   * Fold current hand
   */
  const fold = async () => {
    try {
      await pokerStore.performAction('fold');
      success('You folded');
    } catch (error) {
      showError(`Error: ${error.message}`);
      throw error;
    }
  };

  /**
   * Check (no bet)
   */
  const check = async () => {
    try {
      await pokerStore.performAction('check');
      success('You checked');
    } catch (error) {
      showError(`Error: ${error.message}`);
      throw error;
    }
  };

  /**
   * Call current bet
   */
  const call = async () => {
    try {
      await pokerStore.performAction('call');
      success('You called');
    } catch (error) {
      showError(`Error: ${error.message}`);
      throw error;
    }
  };

  /**
   * Raise bet by amount
   */
  const raise = async (amount) => {
    try {
      await pokerStore.performAction('raise', amount);
      success(`You raised ${amount}`);
    } catch (error) {
      showError(`Error: ${error.message}`);
      throw error;
    }
  };

  /**
   * Go all-in
   */
  const allIn = async () => {
    try {
      await pokerStore.performAction('all_in');
      success('You went all-in!');
    } catch (error) {
      showError(`Error: ${error.message}`);
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

