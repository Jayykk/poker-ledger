<template>
  <div class="pot-display">
    <div class="chip-stack">
      <div class="chip chip-red"></div>
      <div class="chip chip-blue"></div>
      <div class="chip chip-green"></div>
    </div>
    <div class="pot-amount">${{ formattedPot }}</div>
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
  gap: 12px;
  background: rgba(0, 0, 0, 0.7);
  padding: 10px 20px;
  border-radius: 24px;
  border: 2px solid rgba(255, 215, 0, 0.6);
  margin-top: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.chip-stack {
  position: relative;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chip {
  position: absolute;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.3);
  box-shadow: 
    inset 0 2px 4px rgba(255, 255, 255, 0.3),
    0 2px 4px rgba(0, 0, 0, 0.4);
}

.chip-red {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  top: 0;
  left: 0;
}

.chip-blue {
  background: linear-gradient(135deg, #3498db, #2980b9);
  top: 4px;
  left: 4px;
}

.chip-green {
  background: linear-gradient(135deg, #2ecc71, #27ae60);
  top: 8px;
  left: 8px;
}

.pot-amount {
  font-size: 22px;
  font-weight: bold;
  color: #ffd700;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  font-family: 'Courier New', monospace;
}

@media (max-width: 768px) {
  .pot-display {
    padding: 8px 16px;
    gap: 8px;
  }

  .chip-stack {
    width: 28px;
    height: 28px;
  }

  .chip {
    width: 20px;
    height: 20px;
    border-width: 2px;
  }

  .chip-blue {
    top: 3px;
    left: 3px;
  }

  .chip-green {
    top: 6px;
    left: 6px;
  }

  .pot-amount {
    font-size: 18px;
  }
}
</style>
