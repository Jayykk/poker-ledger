/**
 * Game Actions Composable
 * Handles poker game actions (fold, check, call, raise, all-in)
 */

import { usePokerStore } from '../store/modules/poker.js';
import { useNotification } from './useNotification.js';

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

  return {
    fold,
    check,
    call,
    raise,
    allIn,
  };
}
