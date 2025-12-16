/**
 * Game Actions Composable
 * Handles poker game actions (fold, check, call, raise, all-in)
 */

import { usePokerStore } from '../store/modules/poker.js';
import { useNotification } from './useNotification.js';

export function useGameActions() {
  const pokerStore = usePokerStore();
  const { showNotification } = useNotification();

  /**
   * Fold current hand
   */
  const fold = async () => {
    try {
      await pokerStore.performAction('fold');
      showNotification('You folded', 'info');
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
      throw error;
    }
  };

  /**
   * Check (no bet)
   */
  const check = async () => {
    try {
      await pokerStore.performAction('check');
      showNotification('You checked', 'info');
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
      throw error;
    }
  };

  /**
   * Call current bet
   */
  const call = async () => {
    try {
      await pokerStore.performAction('call');
      showNotification('You called', 'info');
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
      throw error;
    }
  };

  /**
   * Raise bet by amount
   */
  const raise = async (amount) => {
    try {
      await pokerStore.performAction('raise', amount);
      showNotification(`You raised ${amount}`, 'info');
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
      throw error;
    }
  };

  /**
   * Go all-in
   */
  const allIn = async () => {
    try {
      await pokerStore.performAction('all_in');
      showNotification('You went all-in!', 'warning');
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
      throw error;
    }
  };

  return {
    fold,
    check,
    call,
    raise,
    allIn,
  };
}
