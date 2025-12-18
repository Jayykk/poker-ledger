<template>
  <div class="player-seat-compact">
    <div v-if="seat" class="seat-content" :class="seatStatusClass">
      <!-- Circular Avatar with Status Badge -->
      <div class="avatar-wrapper">
        <div 
          class="avatar-circle"
          :class="{
            'is-current-turn': isCurrentTurn,
            'is-me': isMe,
            'is-folded': seat.status === 'folded',
            'is-sitting-out': seat.status === 'sitting_out',
          }"
        >
          {{ seat.odName?.charAt(0) || '?' }}
          
          <!-- Dealer Button Overlay -->
          <div v-if="seat.isDealer" class="dealer-badge">D</div>
          
          <!-- Status Badge (Check/Fold/All-in/Sitting Out) -->
          <div v-if="seat.status === 'folded'" class="status-badge badge-fold">✗</div>
          <div v-else-if="seat.status === 'all_in'" class="status-badge badge-all-in">★</div>
          <div v-else-if="seat.status === 'sitting_out'" class="status-badge badge-sitting-out">☕</div>
          
          <!-- Turn Timer Ring -->
          <div v-if="isCurrentTurn && turnExpiresAt" class="timer-ring">
            <TurnTimer 
              :expiresAt="turnExpiresAt"
              :totalTime="turnTimeout"
              :size="52"
              :strokeWidth="3"
            />
          </div>
        </div>
      </div>

      <!-- Player Label (Name + Chips) -->
      <div class="player-label">
        <span class="player-name">{{ seat.odName }}</span>
        <span class="player-stack">
          <span v-if="seat.isSmallBlind" class="blind-badge">SB</span>
          <span v-if="seat.isBigBlind" class="blind-badge">BB</span>
          ${{ seat.chips }}
        </span>
      </div>

      <!-- Bet Chip Display - use roundBet with fallback to currentBet -->
      <div v-if="seatBet > 0" class="bet-chip">
        <span class="chip-icon">🪙</span>
        <span class="bet-amount">${{ seatBet }}</span>
      </div>

      <!-- Hole Cards (show for current player or during showdown) -->
      <div v-if="shouldShowCards && holeCards.length > 0" class="hole-cards">
        <PlayingCard
          v-for="(card, i) in holeCards"
          :key="i"
          :card="card"
          size="mini"
          :revealing="isShowdownRevealing"
          :winning="isWinningCard(card)"
          :losing="isLosingInShowdown"
        />
      </div>

      <!-- Hand Result Badge (showdown only) -->
      <HandResultBadge
        v-if="showHandResult"
        :show="showHandResult"
        :hand-name="handResultName"
        :amount="winAmount"
        :is-winner="isWinner"
      />
    </div>

    <!-- Empty Seat (Join Button) -->
    <div v-else-if="!isAlreadySeated && canJoin" class="empty-seat" @click="handleJoinClick">
      <div class="empty-seat-inner">
        <div class="join-icon">+</div>
        <span class="join-text">Sit Here</span>
      </div>
    </div>

    <!-- Empty Seat (Locked - Already Seated or Game in Progress) -->
    <div v-else class="empty-seat locked">
      <div class="join-icon">🔒</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { usePokerGame } from '../../composables/usePokerGame.js';
import { useAuthStore } from '../../store/modules/auth.js';
import PlayingCard from './PlayingCard.vue';
import TurnTimer from './TurnTimer.vue';
import HandResultBadge from './HandResultBadge.vue';

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

const { myHoleCards, currentGame } = usePokerGame();
const authStore = useAuthStore();

// Constants
const DEFAULT_TURN_TIMEOUT = 30;

const holeCards = computed(() => {
  // Show cards if it's my seat
  if (props.isMe) return myHoleCards.value;

  // Show cards during showdown for all active players
  const gameStage = currentGame.value?.table?.stage;
  const gameRound = currentGame.value?.table?.currentRound;
  const isShowdown = gameStage === 'showdown_complete' || gameRound === 'showdown';

  if (isShowdown && props.seat && props.seat.status !== 'folded') {
    // Get cards from handResult
    const handResult = currentGame.value?.table?.handResult;
    if (handResult && handResult.allResults) {
      const playerResult = handResult.allResults.find(
        (r) => r.odId === props.seat.odId,
      );
      return playerResult?.holeCards || [];
    }
  }

  return [];
});

// Check if we should show cards
const shouldShowCards = computed(() => {
  return holeCards.value.length > 0;
});

// Showdown-related computed properties
const isShowdownRevealing = computed(() => {
  const gameStage = currentGame.value?.table?.stage;
  return gameStage === 'showdown_complete';
});

const showHandResult = computed(() => {
  if (!props.seat) return false;
  const gameStage = currentGame.value?.table?.stage;
  const handResult = currentGame.value?.table?.handResult;
  return gameStage === 'showdown_complete' && handResult;
});

const handResultName = computed(() => {
  if (!showHandResult.value) return '';
  const handResult = currentGame.value?.table?.handResult;
  const playerResult = handResult.allResults?.find(
    (r) => r.odId === props.seat.odId,
  );
  return playerResult?.handName || '';
});

const winAmount = computed(() => {
  if (!showHandResult.value) return 0;
  const handResult = currentGame.value?.table?.handResult;
  const winner = handResult.winners?.find(
    (w) => w.odId === props.seat.odId,
  );
  return winner?.amount || 0;
});

const isWinner = computed(() => {
  return winAmount.value > 0;
});

const isWinningCard = (card) => {
  if (!showHandResult.value || !isWinner.value) return false;
  const handResult = currentGame.value?.table?.handResult;
  const winner = handResult.winners?.find(
    (w) => w.odId === props.seat.odId,
  );
  return winner?.winningCards?.includes(card) || false;
};

const isLosingInShowdown = computed(() => {
  return showHandResult.value && !isWinner.value;
});

// Check if current user is already seated anywhere
const isAlreadySeated = computed(() => {
  if (!currentGame.value) return false;
  const userId = authStore.user?.uid;
  return Object.values(currentGame.value.seats || {})
    .some((seat) => seat && seat.odId === userId);
});

// Get turn timeout and expiration from Firestore
const turnTimeout = computed(() => currentGame.value?.table?.turnTimeout || DEFAULT_TURN_TIMEOUT);
const turnExpiresAt = computed(() => {
  // Get the expiresAt timestamp from Firestore (should be set when turn starts)
  const expiresAt = currentGame.value?.table?.turnExpiresAt;
  if (!expiresAt) return null;
  
  // Convert Firestore timestamp to milliseconds
  if (expiresAt.toMillis) {
    return expiresAt.toMillis();
  }
  if (expiresAt.seconds) {
    return expiresAt.seconds * 1000;
  }
  return expiresAt;
});

const handleJoinClick = () => {
  // Emit event to parent to show buy-in modal (non-blocking)
  emit('join-seat', props.seatNumber);
};

// Add computed for seat bet (use roundBet with fallback)
const seatBet = computed(() => {
  return props.seat?.roundBet ?? props.seat?.currentBet ?? 0;
});

// Add computed for seat status class
const seatStatusClass = computed(() => {
  if (!props.seat) return '';
  return {
    'status-playing': props.seat.status === 'playing' || props.seat.status === 'active',
    'status-folded': props.seat.status === 'folded',
    'status-allin': props.seat.status === 'all_in',
    'status-sitting-out': props.seat.status === 'sitting_out',
  };
});

// Add computed for canJoin
const canJoin = computed(() => {
  // Can join if game is waiting or playing (will be spectator until next hand)
  const status = currentGame.value?.status;
  return status === 'waiting' || status === 'playing';
});
</script>

<style scoped>
.player-seat-compact {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  position: relative;
}

.seat-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  position: relative;
}

/* Avatar Wrapper */
.avatar-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Circular Avatar */
.avatar-circle {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: bold;
  color: white;
  position: relative;
  border: 2px solid rgba(255, 255, 255, 0.3);
  transition: all 0.3s ease;
  z-index: 2;
}

.avatar-circle.is-current-turn {
  border-color: #ffd700;
  box-shadow: 0 0 16px rgba(255, 215, 0, 0.8);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 16px rgba(255, 215, 0, 0.8); }
  50% { box-shadow: 0 0 24px rgba(255, 215, 0, 1); }
}

.avatar-circle.is-sitting-out {
  filter: grayscale(80%);
  opacity: 0.6;
}

.avatar-circle.is-folded {
  filter: grayscale(100%);
  opacity: 0.4;
}

.avatar-circle.is-me {
  border-color: #4CAF50;
  border-width: 3px;
}

.status-folded .player-label {
  opacity: 0.5;
}

/* Dealer Badge (top-right of avatar) */
.dealer-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffd700, #ffed4e);
  color: #000;
  font-size: 10px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(0, 0, 0, 0.3);
  z-index: 3;
}

/* Status Badge (bottom-right of avatar) */
.status-badge {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
  z-index: 3;
  border: 2px solid rgba(0, 0, 0, 0.5);
}

.badge-check {
  background: #22c55e;
  color: white;
}

.badge-fold {
  background: #ef4444;
  color: white;
}

.badge-all-in {
  background: #f59e0b;
  color: white;
}

.badge-sitting-out {
  background: #607d8b;
  color: white;
}

/* Turn Timer Ring */
.timer-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1;
  pointer-events: none;
}

/* Player Label (Name + Chips below avatar) */
.player-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(0, 0, 0, 0.7);
  padding: 2px 8px;
  border-radius: 8px;
  min-width: 60px;
  text-align: center;
}

.player-name {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80px;
}

.player-stack {
  font-size: 11px;
  font-weight: bold;
  color: #ffd700;
  font-family: 'Courier New', monospace;
  display: flex;
  align-items: center;
  gap: 3px;
}

.blind-badge {
  font-size: 8px;
  padding: 1px 3px;
  border-radius: 3px;
  background: rgba(76, 175, 80, 0.6);
  color: white;
  font-weight: bold;
}

/* Bet Chip Display */
.bet-chip {
  position: absolute;
  top: 50px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.85);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  color: #ffd700;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
  z-index: 4;
  border: 1px solid rgba(255, 215, 0, 0.3);
}

.chip-icon {
  font-size: 12px;
}

.bet-amount {
  font-family: 'Courier New', monospace;
}

/* Hole Cards */
.hole-cards {
  display: flex;
  gap: 2px;
  justify-content: center;
  margin-top: 2px;
}

/* Empty Seat */
.empty-seat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.2);
  border: 2px dashed #555;
  cursor: pointer;
  transition: all 0.3s ease;
}

.empty-seat-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.join-text {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: bold;
}

.empty-seat:hover .join-text {
  color: rgba(255, 255, 255, 0.8);
}

.empty-seat:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #888;
  transform: scale(1.1);
}

.empty-seat.locked {
  cursor: not-allowed;
  opacity: 0.4;
}

.empty-seat.locked:hover {
  transform: none;
}

.join-icon {
  font-size: 24px;
  color: #888;
}

/* Responsive */
@media (max-width: 768px) {
  .avatar-circle {
    width: 40px;
    height: 40px;
    font-size: 16px;
  }

  .player-name {
    font-size: 9px;
    max-width: 70px;
  }

  .player-stack {
    font-size: 10px;
  }

  .bet-chip {
    font-size: 10px;
    padding: 1px 6px;
  }
}
</style>
