<template>
  <transition name="pop">
    <div v-if="show" class="hand-result-badge" :class="{ winner: isWinner }">
      <span class="hand-name">{{ handName }}</span>
      <span v-if="amount > 0" class="win-amount">+${{ amount }}</span>
    </div>
  </transition>
</template>

<script setup>
defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  handName: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    default: 0,
  },
  isWinner: {
    type: Boolean,
    default: false,
  },
});
</script>

<style scoped>
.hand-result-badge {
  position: absolute;
  bottom: -30px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.85);
  padding: 4px 12px;
  border-radius: 12px;
  white-space: nowrap;
  font-size: 12px;
  color: white;
  z-index: 10;
  pointer-events: none;
  text-align: center;
  min-width: 100px;
}

.hand-result-badge.winner {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  font-weight: bold;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
}

.hand-name {
  display: block;
  font-size: 11px;
}

.win-amount {
  display: block;
  color: #4ade80;
  font-weight: bold;
  font-size: 13px;
  margin-top: 2px;
}

/* Pop-in animation */
.pop-enter-active {
  animation: popIn 0.3s ease;
}

.pop-leave-active {
  animation: popOut 0.2s ease;
}

@keyframes popIn {
  0% {
    transform: translateX(-50%) scale(0);
    opacity: 0;
  }
  50% {
    transform: translateX(-50%) scale(1.2);
  }
  100% {
    transform: translateX(-50%) scale(1);
    opacity: 1;
  }
}

@keyframes popOut {
  0% {
    transform: translateX(-50%) scale(1);
    opacity: 1;
  }
  100% {
    transform: translateX(-50%) scale(0);
    opacity: 0;
  }
}

/* Responsive */
@media (max-width: 768px) {
  .hand-result-badge {
    font-size: 11px;
    padding: 3px 10px;
    min-width: 90px;
  }

  .hand-name {
    font-size: 10px;
  }

  .win-amount {
    font-size: 12px;
  }
}
</style>
