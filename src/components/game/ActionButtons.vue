<template>
  <div class="action-buttons">
    <!-- Main action buttons - horizontal layout -->
    <div class="main-buttons">
      <!-- Call Button -->
      <button
        v-if="!canCheck"
        class="btn btn-call"
        :class="{ 'btn-active': isMyTurn, 'btn-locked': !isMyTurn }"
        :disabled="!isMyTurn"
        @click="emit('call')"
      >
        <span class="btn-icon">💰</span>
        <span class="btn-label">CALL</span>
        <span class="btn-amount">{{ callAmount }}</span>
      </button>

      <!-- Raise Button -->
      <button
        v-if="canRaise"
        class="btn btn-raise"
        :class="{ 'btn-active': isMyTurn && !showBetControls, 'btn-locked': !isMyTurn, 'btn-selected': showBetControls }"
        :disabled="!isMyTurn"
        @click="toggleBetControls"
      >
        <span class="btn-icon">📈</span>
        <span class="btn-label">RAISE</span>
      </button>

      <!-- Check Button -->
      <button
        v-if="canCheck"
        class="btn btn-check"
        :class="{ 'btn-active': isMyTurn, 'btn-locked': !isMyTurn }"
        :disabled="!isMyTurn"
        @click="emit('check')"
      >
        <span class="btn-icon">✓</span>
        <span class="btn-label">CHECK</span>
      </button>

      <!-- Fold Button -->
      <button 
        class="btn btn-fold" 
        :class="{ 'btn-active': isMyTurn, 'btn-locked': !isMyTurn }"
        :disabled="!isMyTurn" 
        @click="emit('fold')"
      >
        <span class="btn-icon">🚫</span>
        <span class="btn-label">FOLD</span>
      </button>
    </div>

    <!-- Bet Controls (shown above main buttons when raising) -->
    <Transition name="slide-up">
      <div v-if="showBetControls" class="bet-controls">
        <div class="bet-slider-container">
          <div class="bet-amount-display">💵 {{ betAmount }}</div>
          <input
            v-model.number="betAmount"
            type="range"
            :min="minBet"
            :max="maxBet"
            :step="bigBlind"
            class="bet-slider"
          />
        </div>
        
        <div class="quick-bet-buttons">
          <button @click="setBetAmount(minBet)" :disabled="!isMyTurn" class="quick-bet">Min</button>
          <button @click="setBetAmount(halfPot)" :disabled="!isMyTurn" class="quick-bet">½ Pot</button>
          <button @click="setBetAmount(potSize)" :disabled="!isMyTurn" class="quick-bet">Pot</button>
          <button @click="setBetAmount(maxBet)" :disabled="!isMyTurn" class="quick-bet">All-In</button>
        </div>

        <button @click="confirmRaise" :disabled="!isMyTurn" class="btn-confirm">
          Confirm Raise {{ betAmount }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { usePokerGame } from '../../composables/usePokerGame.js';

const props = defineProps({
  canCheck: {
    type: Boolean,
    default: false,
  },
  canRaise: {
    type: Boolean,
    default: false,
  },
  callAmount: {
    type: Number,
    default: 0,
  },
  myChips: {
    type: Number,
    default: 0,
  },
  isMyTurn: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['fold', 'check', 'call', 'raise', 'all-in']);

const { currentGame, minRaise, potSize: currentPot } = usePokerGame();

const showBetControls = ref(false);
const betAmount = ref(0);

const bigBlind = computed(() => currentGame.value?.meta?.blinds?.big || 20);

const minBet = computed(() => {
  return props.callAmount + (minRaise.value || bigBlind.value);
});

const maxBet = computed(() => {
  return props.myChips;
});

const potSize = computed(() => currentPot.value || 0);

const halfPot = computed(() => {
  return Math.min(Math.floor(potSize.value / 2), maxBet.value);
});

const threeFourthPot = computed(() => {
  return Math.min(Math.floor(potSize.value * 0.75), maxBet.value);
});

const toggleBetControls = () => {
  showBetControls.value = !showBetControls.value;
  if (showBetControls.value) {
    betAmount.value = minBet.value;
  }
};

const setBetAmount = (amount) => {
  betAmount.value = Math.max(minBet.value, Math.min(amount, maxBet.value));
};

const confirmRaise = () => {
  emit('raise', betAmount.value);
  showBetControls.value = false;
};
</script>

<style scoped>
.action-buttons {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.95), rgba(0, 0, 0, 0.8));
  padding: 8px 12px;
  padding-bottom: 8px;
  padding-bottom: max(8px, env(safe-area-inset-bottom)); /* iPhone safe area */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5);
}

/* Main buttons container - horizontal layout */
.main-buttons {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  max-width: 600px;
  justify-content: center;
}

.btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 12px 16px;
  flex: 1;
  max-width: 140px;
  min-height: 64px; /* Touch-friendly minimum target */
  font-weight: bold;
  border: 2px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  position: relative;
  overflow: hidden;
}

.btn-icon {
  font-size: 24px;
  filter: grayscale(100%);
  transition: all 0.3s ease;
}

.btn-label {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.3);
  transition: all 0.3s ease;
}

.btn-amount {
  font-size: 11px;
  font-weight: bold;
  color: rgba(255, 215, 0, 0.5);
  font-family: 'Courier New', monospace;
  transition: all 0.3s ease;
}

/* Locked state - not player's turn */
.btn-locked {
  opacity: 0.3;
  cursor: not-allowed;
  background: rgba(100, 100, 100, 0.2);
  border-color: rgba(150, 150, 150, 0.2);
}

.btn-locked .btn-icon {
  filter: grayscale(100%);
}

.btn-locked .btn-label {
  color: rgba(150, 150, 150, 0.4);
}

/* Active state - player's turn, button lights up */
.btn-active {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
  opacity: 1;
  cursor: pointer;
}

.btn-active .btn-icon {
  filter: grayscale(0%);
  transform: scale(1.05);
}

.btn-active .btn-label {
  color: rgba(255, 255, 255, 0.9);
}

.btn-active:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
}

/* Specific button colors when active */
.btn-fold.btn-active {
  border-color: rgba(244, 67, 54, 0.6);
  background: linear-gradient(135deg, rgba(244, 67, 54, 0.2) 0%, rgba(211, 47, 47, 0.15) 100%);
}

.btn-fold.btn-active:hover {
  background: linear-gradient(135deg, rgba(244, 67, 54, 0.3) 0%, rgba(211, 47, 47, 0.25) 100%);
  box-shadow: 0 6px 16px rgba(244, 67, 54, 0.4);
}

.btn-check.btn-active {
  border-color: rgba(76, 175, 80, 0.6);
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.2) 0%, rgba(56, 142, 60, 0.15) 100%);
}

.btn-check.btn-active:hover {
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.3) 0%, rgba(56, 142, 60, 0.25) 100%);
  box-shadow: 0 6px 16px rgba(76, 175, 80, 0.4);
}

.btn-call.btn-active {
  border-color: rgba(76, 175, 80, 0.6);
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.2) 0%, rgba(56, 142, 60, 0.15) 100%);
}

.btn-call.btn-active:hover {
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.3) 0%, rgba(56, 142, 60, 0.25) 100%);
  box-shadow: 0 6px 16px rgba(76, 175, 80, 0.4);
}

.btn-call.btn-active .btn-amount {
  color: rgba(255, 215, 0, 1);
}

.btn-raise.btn-active {
  border-color: rgba(255, 193, 7, 0.6);
  background: linear-gradient(135deg, rgba(255, 193, 7, 0.2) 0%, rgba(255, 152, 0, 0.15) 100%);
}

.btn-raise.btn-active:hover,
.btn-raise.btn-selected {
  background: linear-gradient(135deg, rgba(255, 193, 7, 0.3) 0%, rgba(255, 152, 0, 0.25) 100%);
  box-shadow: 0 6px 16px rgba(255, 193, 7, 0.4);
}

/* Bet Controls - appears above buttons */
.bet-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 2px solid rgba(255, 152, 0, 0.4);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
  width: 100%;
  max-width: 600px;
}

.bet-slider-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bet-amount-display {
  text-align: center;
  font-size: 24px;
  font-weight: bold;
  color: #ffd700;
  font-family: 'Courier New', monospace;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.bet-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  outline: none;
  background: rgba(255, 255, 255, 0.2);
  -webkit-appearance: none;
  cursor: pointer;
}

.bet-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.bet-slider::-moz-range-thumb {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.quick-bet-buttons {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.quick-bet {
  padding: 8px 6px;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: white;
  font-size: 11px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 44px; /* Touch-friendly */
}

.quick-bet:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.quick-bet:hover:not(:disabled) {
  background: rgba(255, 152, 0, 0.3);
  border-color: rgba(255, 152, 0, 0.6);
  transform: translateY(-1px);
}

.btn-confirm {
  padding: 12px 24px;
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  min-height: 48px; /* Touch-friendly */
}

.btn-confirm:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(255, 152, 0, 0.5);
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Slide up animation */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

/* Responsive */
@media (max-width: 768px) {
  .action-buttons {
    padding: 6px 8px;
    padding-bottom: 6px;
  padding-bottom: max(6px, env(safe-area-inset-bottom));
  }

  .main-buttons {
    gap: 8px;
  }

  .btn {
    min-width: 70px;
    max-width: 110px;
    min-height: 60px;
    padding: 10px 12px;
  }

  .btn-icon {
    font-size: 20px;
  }

  .btn-label {
    font-size: 10px;
  }

  .btn-amount {
    font-size: 10px;
  }

  .bet-controls {
    padding: 10px;
  }

  .bet-amount-display {
    font-size: 20px;
  }

  .quick-bet-buttons {
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }

  .quick-bet {
    min-height: 40px;
    padding: 8px 4px;
    font-size: 10px;
  }

  .btn-confirm {
    padding: 10px 20px;
    font-size: 13px;
    min-height: 44px;
  }
}
</style>
