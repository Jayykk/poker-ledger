<template>
  <div class="dealer-button" :class="{ 'dealer-button-small': size === 'small' }">
    <div class="button-circle">
      <span class="button-text">D</span>
    </div>
    <div v-if="showLabel" class="button-label">Dealer</div>
  </div>
</template>

<script setup>
defineProps({
  size: {
    type: String,
    default: 'normal', // 'normal' or 'small'
    validator: (value) => ['normal', 'small'].includes(value),
  },
  showLabel: {
    type: Boolean,
    default: false,
  },
});
</script>

<style scoped>
.dealer-button {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  user-select: none;
}

.button-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  border: 3px solid #ffffff;
  box-shadow: 0 4px 12px rgba(251, 191, 36, 0.6),
              inset 0 2px 4px rgba(255, 255, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  transition: all 0.3s ease;
  animation: dealer-glow 2s ease-in-out infinite;
}

@keyframes dealer-glow {
  0%, 100% {
    box-shadow: 0 4px 12px rgba(251, 191, 36, 0.6),
                inset 0 2px 4px rgba(255, 255, 255, 0.3);
  }
  50% {
    box-shadow: 0 6px 20px rgba(251, 191, 36, 0.9),
                inset 0 2px 4px rgba(255, 255, 255, 0.5);
  }
}

.button-text {
  font-size: 18px;
  font-weight: 900;
  color: #000000;
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.5);
  letter-spacing: 1px;
}

.button-label {
  font-size: 10px;
  font-weight: bold;
  color: #fbbf24;
  text-transform: uppercase;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  letter-spacing: 1px;
}

.dealer-button-small .button-circle {
  width: 28px;
  height: 28px;
  border-width: 2px;
}

.dealer-button-small .button-text {
  font-size: 14px;
}

.dealer-button-small .button-label {
  font-size: 8px;
}

/* Hover effect */
.dealer-button:hover .button-circle {
  transform: scale(1.1);
}
</style>
