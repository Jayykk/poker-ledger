/**
 * Game Animations Composable
 * Watches Firestore-driven stage / community-card changes and plays the
 * matching sound cues. Cues are pushed through a serial animation queue so a
 * burst of updates (e.g. an all-in runout that reveals flop+turn+river almost
 * at once) plays in sequence instead of all at once — and a multi-card jump
 * (0 → 5) still fires the right cues for every street.
 */

import { watch, ref } from 'vue';
import { usePokerGame } from './usePokerGame.js';
import { usePokerSound } from './usePokerSound.js';
import { createAnimationQueue } from '../utils/animationQueue.js';
import { logger } from "../utils/logger.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const REVEAL_GAP_MS = 180;

export function useGameAnimations() {
  const { currentGame, communityCards } = usePokerGame();
  const { playPokerSound } = usePokerSound();

  const isRevealingCards = ref(false);
  const isShowdownActive = ref(false);

  // Serial queue so reveal cues never overlap.
  const cueQueue = createAnimationQueue();

  function enqueueSound(name, gapMs = REVEAL_GAP_MS) {
    cueQueue.enqueue(async () => {
      logger.debug(`🔊 ${name}`);
      playPokerSound(name);
      if (gapMs > 0) await delay(gapMs);
    });
  }

  // Stage transitions: deal on preflop, chime on showdown.
  watch(
    () => currentGame.value?.table?.stage,
    (newStage, oldStage) => {
      if (!newStage || newStage === oldStage) return;
      logger.debug(`Stage transition: ${oldStage} -> ${newStage}`);

      if (newStage === 'preflop') {
        enqueueSound('deal', 0);
        isRevealingCards.value = true;
        setTimeout(() => { isRevealingCards.value = false; }, 1000);
      } else if (newStage === 'showdown') {
        enqueueSound('showdown', 0);
        isShowdownActive.value = true;
        setTimeout(() => { isShowdownActive.value = false; }, 3000);
      }
    },
  );

  // Community cards: enqueue a cue for every newly revealed card, robust to
  // multi-card jumps. Reaching 3 cards is the flop (one grouped cue); each card
  // beyond that (turn, river) gets its own tick.
  watch(
    () => communityCards.value?.length || 0,
    (newCount, oldCount) => {
      const prev = oldCount || 0;
      if (newCount < prev) {
        // Board reset for a new hand — drop any pending cues.
        cueQueue.clear();
        return;
      }
      if (newCount <= prev) return;

      if (prev < 3 && newCount >= 3) {
        enqueueSound('flop');
      }
      for (let i = Math.max(4, prev + 1); i <= newCount; i++) {
        enqueueSound('card');
      }
    },
  );

  /** Kept for backward compatibility; delegates to the real sound system. */
  function playSound(soundName) {
    enqueueSound(soundName, 0);
  }

  return {
    isRevealingCards,
    isShowdownActive,
    playSound,
  };
}
