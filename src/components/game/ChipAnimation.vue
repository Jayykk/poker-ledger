<template>
  <div class="chip-animation-container">
    <transition-group name="chip-fly" tag="div">
      <div
        v-for="chip in flyingChips"
        :key="chip.id"
        class="flying-chip"
        :style="getChipStyle(chip)"
      >
        🪙
      </div>
    </transition-group>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const flyingChips = ref([]);

/**
 * Animate chips flying to a winner's position
 * @param {Object} targetPosition - { x: number, y: number }
 * @param {number} amount - Amount won
 */
const animateChipsToWinner = (targetPosition, amount) => {
  const chipCount = Math.min(Math.ceil(amount / 100), 10); // Max 10 chips
  const potCenterX = window.innerWidth / 2;
  const potCenterY = window.innerHeight * 0.4; // Center of poker table

  for (let i = 0; i < chipCount; i++) {
    const chipId = `chip-${Date.now()}-${i}`;
    flyingChips.value.push({
      id: chipId,
      startX: potCenterX,
      startY: potCenterY,
      targetX: targetPosition.x,
      targetY: targetPosition.y,
      delay: i * 100, // Stagger by 100ms
    });

    // Remove chip after animation completes
    setTimeout(() => {
      flyingChips.value = flyingChips.value.filter((c) => c.id !== chipId);
    }, 1000 + i * 100);
  }
};

/**
 * Get CSS style for flying chip
 * @param {Object} chip - Chip object
 * @return {Object} CSS styles
 */
const getChipStyle = (chip) => {
  return {
    '--start-x': `${chip.startX}px`,
    '--start-y': `${chip.startY}px`,
    '--end-x': `${chip.targetX}px`,
    '--end-y': `${chip.targetY}px`,
    animationDelay: `${chip.delay}ms`,
  };
};

// Expose method for parent components
defineExpose({
  animateChipsToWinner,
});
</script>

<style scoped>
.chip-animation-container {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 999;
}

.flying-chip {
  position: fixed;
  font-size: 24px;
  z-index: 1000;
  pointer-events: none;
  animation: flyToWinner 0.8s ease-out forwards;
  left: var(--start-x);
  top: var(--start-y);
}

@keyframes flyToWinner {
  0% {
    transform: translate(0, 0) scale(1) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translate(
      calc(var(--end-x) - var(--start-x)),
      calc(var(--end-y) - var(--start-y))
    ) scale(0.5) rotate(720deg);
    opacity: 0;
  }
}

/* Responsive */
@media (max-width: 768px) {
  .flying-chip {
    font-size: 20px;
  }
}
</style>
