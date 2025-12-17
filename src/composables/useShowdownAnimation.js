/**
 * Showdown Animation Composable
 * Manages the timing and steps of showdown animations
 * Implements sequential player card reveals with winner highlighting
 */

import { ref, computed } from 'vue';

/**
 * Delay helper
 * @param {number} ms - Milliseconds to delay
 * @return {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Showdown animation hook
 * Total duration: ~6-8 seconds depending on number of players
 * @return {Object} Animation state and control functions
 */
export function useShowdownAnimation() {
  const isShowingDown = ref(false);
  const showdownStep = ref(0); // 0: none, 1: reveal, 2: highlight, 3: distribute
  const revealingPlayerIndex = ref(-1); // Which player's cards are currently revealing
  const highlightingWinner = ref(false);
  const movingChips = ref(false);

  /**
   * Play complete showdown animation sequence
   * @param {Object} handResult - Showdown result data
   * @param {Array} activePlayers - List of active players in showdown
   * @return {Promise<void>}
   */
  const playShowdown = async (handResult, activePlayers = []) => {
    if (!handResult) return;

    isShowingDown.value = true;

    try {
      // Step 1: Reveal hole cards sequentially (500ms per player)
      showdownStep.value = 1;
      
      for (let i = 0; i < activePlayers.length; i++) {
        revealingPlayerIndex.value = i;
        await delay(500);
      }
      
      // Brief pause after all reveals
      await delay(300);

      // Step 2: Show hand rankings and highlight winning cards
      showdownStep.value = 2;
      highlightingWinner.value = true;
      await delay(1500);

      // Step 3: Animate chips flying to winner(s)
      showdownStep.value = 3;
      movingChips.value = true;
      await delay(1200);

      // Step 4: Update chip counts and finish
      await delay(800);

      // Reset state
      isShowingDown.value = false;
      showdownStep.value = 0;
      revealingPlayerIndex.value = -1;
      highlightingWinner.value = false;
      movingChips.value = false;
    } catch (error) {
      console.error('Showdown animation error:', error);
      reset();
    }
  };

  /**
   * Check if a specific player should reveal cards now
   * @param {number} playerIndex - Index in active players array
   * @return {boolean}
   */
  const shouldRevealPlayer = (playerIndex) => {
    return showdownStep.value >= 1 && revealingPlayerIndex.value >= playerIndex;
  };

  /**
   * Check if currently revealing a specific player's cards
   * @param {number} playerIndex - Index in active players array
   * @return {boolean}
   */
  const isRevealingPlayer = (playerIndex) => {
    return showdownStep.value === 1 && revealingPlayerIndex.value === playerIndex;
  };

  /**
   * Skip to end of animation
   */
  const skipShowdown = () => {
    reset();
  };

  /**
   * Reset all animation state
   */
  const reset = () => {
    isShowingDown.value = false;
    showdownStep.value = 0;
    revealingPlayerIndex.value = -1;
    highlightingWinner.value = false;
    movingChips.value = false;
  };

  return {
    // State
    isShowingDown,
    showdownStep,
    revealingPlayerIndex,
    highlightingWinner,
    movingChips,
    
    // Methods
    playShowdown,
    shouldRevealPlayer,
    isRevealingPlayer,
    skipShowdown,
    reset,
  };
}
