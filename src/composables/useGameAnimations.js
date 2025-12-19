/**
 * Game Animations Composable
 * Handles stage transitions and triggers animations/sounds
 */

import { watch, ref } from 'vue';
import { usePokerGame } from './usePokerGame.js';

export function useGameAnimations() {
  const { currentGame, communityCards } = usePokerGame();
  
  const isRevealingCards = ref(false);
  const isShowdownActive = ref(false);
  const lastCardCount = ref(0);

  // Watch for stage changes
  watch(
    () => currentGame.value?.table?.stage,
    (newStage, oldStage) => {
      if (!newStage || newStage === oldStage) return;

      console.log(`Stage transition: ${oldStage} -> ${newStage}`);

      switch (newStage) {
        case 'preflop':
          triggerDealAnimation();
          break;
        case 'showdown':
          triggerShowdownAnimation();
          break;
      }
    }
  );

  // Watch for community cards changes (flop, turn, river)
  watch(
    () => communityCards.value?.length,
    (newCount, oldCount) => {
      if (!newCount || newCount === oldCount) return;

      if (newCount === 3 && oldCount !== 3) {
        // Flop dealt
        triggerFlopAnimation();
      } else if (newCount === 4 && oldCount === 3) {
        // Turn dealt
        triggerTurnAnimation();
      } else if (newCount === 5 && oldCount === 4) {
        // River dealt
        triggerRiverAnimation();
      }

      lastCardCount.value = newCount;
    }
  );

  // Animation trigger functions
  function triggerDealAnimation() {
    console.log('🎴 Dealing cards animation');
    // Play deal sound
    playSound('deal');
    isRevealingCards.value = true;
    setTimeout(() => {
      isRevealingCards.value = false;
    }, 1000);
  }

  function triggerFlopAnimation() {
    console.log('🃏 Flop animation - 3 cards');
    playSound('flop');
  }

  function triggerTurnAnimation() {
    console.log('🃏 Turn animation - 4th card');
    playSound('card');
  }

  function triggerRiverAnimation() {
    console.log('🃏 River animation - 5th card');
    playSound('card');
  }

  function triggerShowdownAnimation() {
    console.log('🏆 Showdown animation');
    isShowdownActive.value = true;
    playSound('showdown');
    
    // Reset after animation
    setTimeout(() => {
      isShowdownActive.value = false;
    }, 3000);
  }

  function playSound(soundName) {
    // Implement sound playing (can be enhanced with actual audio files)
    console.log(`🔊 Playing sound: ${soundName}`);
    // TODO: Add actual audio playback
    // const audio = new Audio(`/sounds/${soundName}.mp3`);
    // audio.play().catch(() => {});
  }

  return {
    isRevealingCards,
    isShowdownActive,
    playSound, // Export playSound for use in action handlers
  };
}
