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

const props = defineProps({
  // Default animation duration in seconds (0.8s matches existing behavior)
  duration: {
    type: Number,
    default: 0.8,
  },
});

const flyingChips = ref([]);

const toDurationMs = (options = {}) => {
  if (typeof options?.durationMs === 'number') return Math.max(0, options.durationMs);
  if (typeof options?.duration === 'number') return Math.max(0, options.duration * 1000);
  return Math.max(0, props.duration * 1000);
};

/**
 * Animate chips flying to a winner's position
 * @param {Object} targetPosition - { x: number, y: number }
 * @param {number} amount - Amount won
 */
const animateChipsToWinner = (targetPosition, amount) => {
  const durationMs = toDurationMs();
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
      durationMs,
    });

    // Remove chip after animation completes
    setTimeout(() => {
      flyingChips.value = flyingChips.value.filter((c) => c.id !== chipId);
    }, durationMs + 200 + i * 100);
  }
};

/**
 * Animate chips flying from seat bet positions to the pot center.
 * @param {Array<{x:number,y:number,amount:number}>} sources
 * @param {{x:number,y:number}} center
 */
const animateChipsToCenter = (sources = [], center = null, options = null) => {
  if (!Array.isArray(sources) || sources.length === 0) return;
  const durationMs = toDurationMs(options || {});
  const end = center || {
    x: window.innerWidth / 2,
    y: window.innerHeight * 0.4,
  };

  sources.forEach((src, idx) => {
    if (!src || typeof src.x !== 'number' || typeof src.y !== 'number') return;
    const amount = src.amount || 0;
    const chipCount = Math.min(Math.max(1, Math.ceil(amount / 100)), 6); // Max 6 per seat

    for (let i = 0; i < chipCount; i++) {
      const chipId = `chip-${Date.now()}-${idx}-${i}`;
      flyingChips.value.push({
        id: chipId,
        startX: src.x,
        startY: src.y,
        targetX: end.x,
        targetY: end.y,
        delay: (idx * 80) + (i * 60),
        durationMs,
      });

      setTimeout(() => {
        flyingChips.value = flyingChips.value.filter((c) => c.id !== chipId);
      }, durationMs + 200 + (idx * 80) + (i * 60));
    }
  });
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
    animationDuration: `${chip.durationMs || (props.duration * 1000)}ms`,
  };
};

// Expose method for parent components
defineExpose({
  animateChipsToWinner,
  animateChipsToCenter,
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
  animation-name: flyToWinner;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
  animation-duration: 0.8s;
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
