<template>
  <Transition name="chip-appear">
    <div v-if="amount > 0" class="bet-chip">
      <span class="chip-icon">🪙</span>
      <span class="chip-amount">${{ formattedAmount }}</span>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  amount: {
    type: Number,
    default: 0,
  },
});

const formattedAmount = computed(() => {
  if (props.amount >= 1000) {
    return `${(props.amount / 1000).toFixed(1)}K`;
  }
  return props.amount;
});
</script>

<style scoped>
.bet-chip {
  background: rgba(0, 0, 0, 0.85);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  color: #ffd700;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  border: 1px solid rgba(255, 215, 0, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.chip-icon {
  font-size: 14px;
}

.chip-amount {
  font-family: 'Courier New', monospace;
}

/* Chip appear animation (drop from above) */
.chip-appear-enter-active {
  animation: chipDrop 0.4s ease-out;
}

.chip-appear-leave-active {
  animation: chipFly 0.5s ease-in;
}

@keyframes chipDrop {
  0% {
    transform: translateY(-20px) scale(0.5);
    opacity: 0;
  }
  60% {
    transform: translateY(5px) scale(1.1);
  }
  100% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

@keyframes chipFly {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: translateY(-30px) scale(0.3);
    opacity: 0;
  }
}

/* Responsive */
@media (max-width: 768px) {
  .bet-chip {
    font-size: 11px;
    padding: 3px 8px;
  }

  .chip-icon {
    font-size: 12px;
  }
}
</style>
