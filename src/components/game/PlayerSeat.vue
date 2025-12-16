<template>
  <div
    class="player-seat"
    :class="{
      'is-current-turn': isCurrentTurn,
      'is-me': isMe,
      'is-empty': !seat,
    }"
  >
    <div v-if="seat" class="seat-content">
      <!-- Player Info -->
      <div class="player-info">
        <div class="player-avatar">
          {{ seat.odName?.charAt(0) || '?' }}
        </div>
        <div class="player-details">
          <div class="player-name">{{ seat.odName }}</div>
          <div class="player-chips">💵 {{ seat.chips }}</div>
        </div>
      </div>

      <!-- Current Bet -->
      <div v-if="seat.currentBet > 0" class="current-bet">
        Bet: {{ seat.currentBet }}
      </div>

      <!-- Status Indicators -->
      <div class="status-indicators">
        <span v-if="seat.isDealer" class="badge dealer">D</span>
        <span v-if="seat.isSmallBlind" class="badge sb">SB</span>
        <span v-if="seat.isBigBlind" class="badge bb">BB</span>
        <span v-if="seat.status === 'folded'" class="badge folded">Folded</span>
        <span v-if="seat.status === 'all_in'" class="badge all-in">All-In</span>
      </div>

      <!-- Turn Timer -->
      <div v-if="isCurrentTurn && timeRemaining > 0" class="turn-timer">
        <div class="timer-bar" :style="{ width: timerPercentage + '%' }"></div>
        <span class="timer-text">{{ timeRemaining }}s</span>
      </div>

      <!-- Hole Cards (only show for current player) -->
      <div v-if="isMe && holeCards.length > 0" class="hole-cards">
        <div v-for="(card, i) in holeCards" :key="i" class="card-mini">
          {{ card }}
        </div>
      </div>
    </div>

    <!-- Empty Seat (Join Button) -->
    <div v-else-if="!isAlreadySeated" class="empty-seat" @click="handleJoinClick">
      <div class="join-icon">+</div>
      <div class="join-text">Join</div>
    </div>

    <!-- Empty Seat (Locked - Already Seated) -->
    <div v-else class="empty-seat locked">
      <div class="join-icon">🔒</div>
      <div class="join-text">Locked</div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { usePokerGame } from '../../composables/usePokerGame.js';
import { useAuthStore } from '../../store/modules/auth.js';

const props = defineProps({
  seat: {
    type: Object,
    default: null,
  },
  seatNumber: {
    type: Number,
    required: true,
  },
  isCurrentTurn: {
    type: Boolean,
    default: false,
  },
  isMe: {
    type: Boolean,
    default: false,
  },
  visible: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(['join-seat', 'auto-action']);

const { myHoleCards, currentGame, canCheck, callAmount, currentBet } = usePokerGame();
const authStore = useAuthStore();

// Constants
const DEFAULT_TURN_TIMEOUT = 30;

const holeCards = computed(() => {
  return props.isMe ? myHoleCards.value : [];
});

// Check if current user is already seated anywhere
const isAlreadySeated = computed(() => {
  if (!currentGame.value) return false;
  const userId = authStore.user?.uid;
  return Object.values(currentGame.value.seats || {})
    .some((seat) => seat && seat.odId === userId);
});

// Timer logic
const timeRemaining = ref(0);
const turnTimeout = computed(() => currentGame.value?.table?.turnTimeout || DEFAULT_TURN_TIMEOUT);
let timerInterval = null;

const timerPercentage = computed(() => {
  return (timeRemaining.value / turnTimeout.value) * 100;
});

// Auto-action when timer reaches 0
const handleTimeoutAction = () => {
  if (props.isMe && props.isCurrentTurn) {
    // Priority: CHECK if possible, otherwise FOLD
    const action = canCheck.value ? 'check' : 'fold';
    emit('auto-action', action);
  }
};

// Watch for turn changes
watch(() => props.isCurrentTurn, (isTurn) => {
  if (isTurn) {
    // Start timer
    timeRemaining.value = turnTimeout.value;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (timeRemaining.value > 0) {
        timeRemaining.value--;
      } else {
        clearInterval(timerInterval);
        // Trigger auto-action when timer expires
        handleTimeoutAction();
      }
    }, 1000);
  } else {
    // Clear timer
    clearInterval(timerInterval);
    timeRemaining.value = 0;
  }
}, { immediate: true });

onBeforeUnmount(() => {
  clearInterval(timerInterval);
});

const handleJoinClick = () => {
  // Emit event to parent to show buy-in modal (non-blocking)
  emit('join-seat', props.seatNumber);
};
</script>

<style scoped>
.player-seat {
  background: rgba(0, 0, 0, 0.4);
  border: 2px solid #555;
  border-radius: 12px;
  padding: 12px;
  min-width: 140px;
  transition: all 0.3s ease;
}

.player-seat.is-current-turn {
  border-color: #ffd700;
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.6);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.6); }
  50% { box-shadow: 0 0 30px rgba(255, 215, 0, 0.9); }
}

.player-seat.is-me {
  border-color: #4CAF50;
}

.player-seat.is-empty {
  background: rgba(0, 0, 0, 0.2);
  border-style: dashed;
  cursor: pointer;
}

.player-seat.is-empty:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #888;
}

.seat-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.player-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.player-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: bold;
  color: white;
}

.player-details {
  flex: 1;
}

.player-name {
  font-size: 14px;
  font-weight: bold;
  color: white;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-chips {
  font-size: 12px;
  color: #ffd700;
  font-family: 'Courier New', monospace;
}

.current-bet {
  font-size: 12px;
  color: #ff6b6b;
  font-weight: bold;
  text-align: center;
  background: rgba(255, 107, 107, 0.2);
  padding: 4px 8px;
  border-radius: 4px;
}

.status-indicators {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: bold;
  text-transform: uppercase;
}

.badge.dealer {
  background: #ffd700;
  color: #000;
}

.badge.sb {
  background: #4CAF50;
  color: white;
}

.badge.bb {
  background: #2196F3;
  color: white;
}

.badge.folded {
  background: #666;
  color: white;
}

.badge.all-in {
  background: #f44336;
  color: white;
}

.turn-timer {
  position: relative;
  margin-top: 8px;
  height: 20px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 10px;
  overflow: hidden;
}

.timer-bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, #4CAF50 0%, #FFC107 50%, #f44336 100%);
  transition: width 1s linear;
}

.timer-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  font-weight: bold;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.hole-cards {
  display: flex;
  gap: 4px;
  justify-content: center;
}

.card-mini {
  width: 32px;
  height: 45px;
  background: white;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.empty-seat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
}

.empty-seat.locked {
  cursor: not-allowed;
  opacity: 0.5;
}

.join-icon {
  font-size: 36px;
  color: #888;
}

.join-text {
  font-size: 14px;
  color: #888;
  font-weight: bold;
}

@media (max-width: 768px) {
  .player-seat {
    min-width: 100px;
    padding: 8px;
  }

  .player-avatar {
    width: 32px;
    height: 32px;
    font-size: 14px;
  }

  .player-name {
    font-size: 12px;
  }

  .player-chips {
    font-size: 10px;
  }
}
</style>
