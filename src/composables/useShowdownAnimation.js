/**
 * Showdown Animation Composable
 * Manages the timing and steps of showdown animations
 */

import { ref } from 'vue';

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
 * Total duration: ~5.5 seconds
 * @return {Object} Animation state and control functions
 */
export function useShowdownAnimation() {
  const isShowingDown = ref(false);
  const showdownStep = ref(0); // 0: none, 1: reveal, 2: highlight, 3: distribute

  /**
   * Play complete showdown animation sequence
   * @param {Object} handResult - Showdown result data
   * @return {Promise<void>}
   */
  const playShowdown = async (handResult) => {
    if (!handResult) return;

    isShowingDown.value = true;

    try {
      // Step 1: Reveal all hole cards (0.5s delay + 1s animation)
      showdownStep.value = 1;
      await delay(1500);

      // Step 2: Show hand rankings and highlight winning cards (2s)
      showdownStep.value = 2;
      await delay(2000);

      // Step 3: Animate chips flying to winner(s) (1s)
      showdownStep.value = 3;
      await delay(1000);

      // Step 4: Update chip counts and finish (1s)
      await delay(1000);

      // Reset state
      isShowingDown.value = false;
      showdownStep.value = 0;
    } catch (error) {
      console.error('Showdown animation error:', error);
      isShowingDown.value = false;
      showdownStep.value = 0;
    }
  };

  /**
   * Skip to end of animation
   */
  const skipShowdown = () => {
    isShowingDown.value = false;
    showdownStep.value = 0;
  };

  return {
    isShowingDown,
    showdownStep,
    playShowdown,
    skipShowdown,
  };
}
