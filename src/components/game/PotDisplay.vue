<template>
  <div class="pot-display">
    <div class="pot-icon">💰</div>
    <div class="pot-amount">{{ formattedPot }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  pot: {
    type: Number,
    default: 0,
  },
});

const formattedPot = computed(() => {
  return props.pot.toLocaleString();
});
</script>

<style scoped>
.pot-display {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.6);
  padding: 12px 24px;
  border-radius: 24px;
  border: 2px solid #ffd700;
  margin-top: 16px;
}

.pot-icon {
  font-size: 24px;
}

.pot-amount {
  font-size: 24px;
  font-weight: bold;
  color: #ffd700;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  font-family: 'Courier New', monospace;
}

@media (max-width: 768px) {
  .pot-display {
    padding: 8px 16px;
  }

  .pot-icon {
    font-size: 20px;
  }

  .pot-amount {
    font-size: 20px;
  }
}
</style>
