<template>
  <div class="turn-timer-container">
    <svg class="timer-svg" :width="size" :height="size" viewBox="0 0 100 100">
      <!-- Background circle -->
      <circle
        cx="50"
        cy="50"
        :r="radius"
        fill="none"
        stroke="rgba(255, 255, 255, 0.1)"
        :stroke-width="strokeWidth"
      />
      
      <!-- Progress circle -->
      <circle
        cx="50"
        cy="50"
        :r="radius"
        fill="none"
        :stroke="progressColor"
        :stroke-width="strokeWidth"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
        stroke-linecap="round"
        transform="rotate(-90 50 50)"
        class="progress-ring"
      />
    </svg>
    
    <!-- Timer text -->
    <div class="timer-text" :style="{ fontSize: `${size / 3}px` }">
      {{ timeRemaining }}
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';

const props = defineProps({
  totalTime: {
    type: Number,
    default: 30,
  },
  expiresAt: {
    type: Number, // Firestore timestamp in milliseconds
    default: null,
  },
  size: {
    type: Number,
    default: 50,
  },
  strokeWidth: {
    type: Number,
    default: 6,
  },
});

const timeRemaining = ref(0);
const radius = computed(() => (100 - props.strokeWidth) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);

const percentage = computed(() => {
  if (props.totalTime === 0) return 0;
  return Math.max(0, Math.min(100, (timeRemaining.value / props.totalTime) * 100));
});

const dashOffset = computed(() => {
  return circumference.value * (1 - percentage.value / 100);
});

const progressColor = computed(() => {
  const pct = percentage.value;
  if (pct > 60) return '#4CAF50'; // Green
  if (pct > 30) return '#FFC107'; // Yellow
  return '#f44336'; // Red
});

let updateInterval = null;

const updateTimeRemaining = () => {
  if (!props.expiresAt) {
    timeRemaining.value = 0;
    return;
  }
  
  const now = Date.now();
  const remaining = Math.max(0, Math.ceil((props.expiresAt - now) / 1000));
  timeRemaining.value = remaining;
};

// Watch for changes in expiresAt
watch(() => props.expiresAt, (newExpiresAt) => {
  clearInterval(updateInterval);
  
  if (newExpiresAt) {
    updateTimeRemaining();
    updateInterval = setInterval(updateTimeRemaining, 1000);
  } else {
    timeRemaining.value = 0;
  }
}, { immediate: true });

onBeforeUnmount(() => {
  clearInterval(updateInterval);
});
</script>

<style scoped>
.turn-timer-container {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.timer-svg {
  display: block;
}

.progress-ring {
  transition: stroke-dashoffset 1s linear, stroke 0.3s ease;
}

.timer-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-weight: bold;
  color: white;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  font-family: 'Courier New', monospace;
}
</style>
