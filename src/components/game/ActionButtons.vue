<template>
  <div class="action-buttons">
    <!-- Fold Button -->
    <button class="btn btn-fold" :disabled="!isMyTurn" @click="emit('fold')">
      Fold
    </button>

    <!-- Check/Call Button -->
    <button
      v-if="canCheck"
      class="btn btn-check"
      :disabled="!isMyTurn"
      @click="emit('check')"
    >
      Check
    </button>
    <button
      v-else
      class="btn btn-call"
      :disabled="!isMyTurn"
      @click="emit('call')"
    >
      Call {{ callAmount }}
    </button>

    <!-- Raise Button (opens bet controls) -->
    <button
      v-if="canRaise"
      class="btn btn-raise"
      :disabled="!isMyTurn"
      @click="toggleBetControls"
    >
      Raise
    </button>

    <!-- All-In Button -->
    <button class="btn btn-allin" :disabled="!isMyTurn" @click="handleAllIn">
      All-In {{ myChips }}
    </button>

    <!-- Bet Controls (shown when raising) -->
    <div v-if="showBetControls" class="bet-controls">
      <div class="bet-slider-container">
        <input
          v-model.number="betAmount"
          type="range"
          :min="minBet"
          :max="maxBet"
          :step="bigBlind"
          class="bet-slider"
        />
        <div class="bet-amount-display">{{ betAmount }}</div>
      </div>
      
      <div class="quick-bet-buttons">
        <button @click="setBetAmount(minBet)" class="quick-bet">Min</button>
        <button @click="setBetAmount(halfPot)" class="quick-bet">½ Pot</button>
        <button @click="setBetAmount(threeFourthPot)" class="quick-bet">¾ Pot</button>
        <button @click="setBetAmount(potSize)" class="quick-bet">Pot</button>
      </div>

      <button @click="confirmRaise" class="btn btn-confirm">
        Confirm Raise
      </button>
    </div>
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

const handleAllIn = () => {
  if (confirm(`Go all-in with ${props.myChips} chips?`)) {
    emit('all-in');
  }
};
</script>

<style scoped>
.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: rgba(0, 0, 0, 0.8);
  padding: 20px;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  min-width: 400px;
}

.btn {
  padding: 14px 28px;
  font-size: 16px;
  font-weight: bold;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn:disabled:hover,
.btn:disabled:active {
  transform: none;
  box-shadow: none;
}

.btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.btn:active:not(:disabled) {
  transform: translateY(0);
}

.btn-fold {
  background: linear-gradient(135deg, #666 0%, #444 100%);
  color: white;
}

.btn-fold:hover {
  background: linear-gradient(135deg, #777 0%, #555 100%);
}

.btn-check {
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  color: white;
}

.btn-call {
  background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
  color: white;
}

.btn-raise {
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
  color: white;
}

.btn-allin {
  background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
  color: white;
}

.btn-confirm {
  background: linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%);
  color: white;
  margin-top: 12px;
}

.bet-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  margin-top: 8px;
}

.bet-slider-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bet-slider {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  outline: none;
  background: #ddd;
  -webkit-appearance: none;
}

.bet-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ff9800;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.bet-slider::-moz-range-thumb {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ff9800;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  border: none;
}

.bet-amount-display {
  text-align: center;
  font-size: 24px;
  font-weight: bold;
  color: #ffd700;
  font-family: 'Courier New', monospace;
}

.quick-bet-buttons {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.quick-bet {
  padding: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: white;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
}

.quick-bet:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
}

/* Responsive */
@media (max-width: 768px) {
  .action-buttons {
    min-width: unset;
    width: calc(100vw - 40px);
    padding: 16px;
  }

  .btn {
    padding: 12px 20px;
    font-size: 14px;
  }

  .bet-amount-display {
    font-size: 20px;
  }
}
</style>
