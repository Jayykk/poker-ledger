/**
 * Game Animation Composable
 * Manages animation timing and states for card reveals
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
 * Game animation hook for card reveals and transitions
 * Implements "animate while backend processes" strategy
 * @return {Object} Animation state and control functions
 */
export function useGameAnimation() {
  const animatingRound = ref(null); // 'flop', 'turn', 'river', null
  const flopCardIndex = ref(-1); // Which flop card is currently revealing (0, 1, 2)
  const isAnimating = ref(false);

  /**
   * Animate flop cards being revealed sequentially
   * Duration: 3 cards × 200ms = 600ms
   * @return {Promise<void>}
   */
  const animateFlop = async () => {
    isAnimating.value = true;
    animatingRound.value = 'flop';
    
    try {
      // Reveal each card with 200ms delay
      for (let i = 0; i < 3; i++) {
        flopCardIndex.value = i;
        await delay(200);
      }
      
      // Hold final state briefly
      await delay(200);
    } finally {
      animatingRound.value = null;
      flopCardIndex.value = -1;
      isAnimating.value = false;
    }
  };

  /**
   * Animate turn card being revealed
   * Duration: 400ms
   * @return {Promise<void>}
   */
  const animateTurn = async () => {
    isAnimating.value = true;
    animatingRound.value = 'turn';
    
    try {
      await delay(400);
    } finally {
      animatingRound.value = null;
      isAnimating.value = false;
    }
  };

  /**
   * Animate river card being revealed
   * Duration: 400ms
   * @return {Promise<void>}
   */
  const animateRiver = async () => {
    isAnimating.value = true;
    animatingRound.value = 'river';
    
    try {
      await delay(400);
    } finally {
      animatingRound.value = null;
      isAnimating.value = false;
    }
  };

  /**
   * Check if a specific card should be revealing now
   * @param {number} cardIndex - Index of card (0-4)
   * @param {string} round - Current game round
   * @return {boolean}
   */
  const shouldRevealCard = (cardIndex, round) => {
    if (animatingRound.value !== round) return false;
    
    if (round === 'flop') {
      // For flop, only reveal if index <= current flop card index
      return cardIndex <= flopCardIndex.value;
    }
    
    // For turn/river, reveal immediately when animating that round
    return true;
  };

  /**
   * Reset animation state
   */
  const reset = () => {
    animatingRound.value = null;
    flopCardIndex.value = -1;
    isAnimating.value = false;
  };

  return {
    // State
    animatingRound,
    flopCardIndex,
    isAnimating,
    
    // Methods
    animateFlop,
    animateTurn,
    animateRiver,
    shouldRevealCard,
    reset,
  };
}
