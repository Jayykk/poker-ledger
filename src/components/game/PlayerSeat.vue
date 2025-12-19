<template>
  <div class="player-seat-compact" :class="positionClass">
    <div v-if="seat" class="seat-content" :class="seatStatusClass">
      <!-- Circular Avatar with Status Badge -->
      <div class="avatar-wrapper">
        <div 
          ref="avatarRef"
          class="avatar-circle"
          :data-seat-number="seatNumber"
          :class="{
            'is-current-turn': isCurrentTurn,
            'is-me': isMe,
            'is-folded': seat.status === 'folded',
            'is-sitting-out': seat.status === 'sitting_out',
            'is-waiting': seat.status === 'waiting_for_hand',
          }"
        >
          {{ seat.odName?.charAt(0) || '?' }}
          
          <!-- Dealer Button Overlay -->
          <div v-if="seat.isDealer" class="dealer-badge">D</div>
          
          <!-- Status Badge (Check/Fold/All-in/Sitting Out/Waiting) -->
          <div v-if="seat.status === 'folded'" class="status-badge badge-fold">✗</div>
          <div v-else-if="seat.status === 'all_in'" class="status-badge badge-all-in">★</div>
          <div v-else-if="seat.status === 'sitting_out'" class="status-badge badge-sitting-out">☕</div>
          <div v-else-if="seat.status === 'waiting_for_hand'" class="status-badge badge-waiting">⏳</div>
          
          <!-- Turn Timer Ring -->
          <div v-if="isCurrentTurn && turnExpiresAt" class="timer-ring">
            <TurnTimer 
              :expiresAt="turnExpiresAt"
              :totalTime="turnTimeout"
              :size="64"
              :strokeWidth="5"
              :paused="isPaused"
            />
          </div>
        </div>

        <!-- Bet Chip (placed toward table center based on seat position) -->
        <div v-if="seat && betAmount > 0" class="bet-chip-badge" :data-seat-number="seatNumber">
          <BetChip :amount="betAmount" />
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

      <!-- Hole Cards (show for me; otherwise show backs, reveal at showdown) -->
      <div v-if="displayHoleCards.length > 0" class="hole-cards">
        <PlayingCard
          v-for="(card, i) in displayHoleCards"
          :key="i"
          :card="card"
          size="mini"
          :hidden="shouldHideHoleCards"
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
import { computed, ref, inject, watch, nextTick } from 'vue';
import { usePokerGame } from '../../composables/usePokerGame.js';
import { useAuthStore } from '../../store/modules/auth.js';
import PlayingCard from './PlayingCard.vue';
import TurnTimer from './TurnTimer.vue';
import HandResultBadge from './HandResultBadge.vue';
import BetChip from './BetChip.vue';

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
  betAmount: {
    type: Number,
    default: 0,
  },
  // One of: bottom | top | left | right
  position: {
    type: String,
    default: 'bottom',
  },
});

const emit = defineEmits(['join-seat', 'auto-action', 'animate-bet']);

const { myHoleCards, currentGame } = usePokerGame();
const authStore = useAuthStore();

const avatarRef = ref(null);
const lastRoundBet = ref(null);

// Check if game is paused
const isPaused = computed(() => currentGame.value?.status === 'paused');

// Inject UI reset key from parent
const uiResetKey = inject('uiResetKey', ref(0));

// Constants
const DEFAULT_TURN_TIMEOUT = 30;

// Local state for UI elements (not derived from server)
const localIsWinner = ref(false);
const localWinAmount = ref(0);
const localHandName = ref('');
const localShowdownCards = ref([]);

// Reset local state when UI reset key changes
watch(uiResetKey, () => {
  localIsWinner.value = false;
  localWinAmount.value = 0;
  localHandName.value = '';
  localShowdownCards.value = [];
});

// Push-chips animation: detect bet/call/raise by roundBet increase.
watch(
  () => props.seat?.roundBet,
  async (newVal) => {
    if (!props.seat) {
      lastRoundBet.value = null;
      return;
    }

    if (typeof newVal !== 'number') {
      lastRoundBet.value = null;
      return;
    }

    const prev = typeof lastRoundBet.value === 'number' ? lastRoundBet.value : null;
    lastRoundBet.value = newVal;

    // Don't animate on first observation.
    if (prev === null) return;
    if (newVal <= prev) return;

    await nextTick();
    const el = avatarRef.value;
    if (!el || typeof el.getBoundingClientRect !== 'function') return;

    const r = el.getBoundingClientRect();
    emit('animate-bet', {
      seatNumber: props.seatNumber,
      startRect: { left: r.left, top: r.top, width: r.width, height: r.height },
      oldVal: prev,
      newVal,
      delta: newVal - prev,
    });
  },
);

const holeCards = computed(() => {
  // Show cards if it's my seat
  if (props.isMe) return myHoleCards.value;

  // SECURITY: Opponent cards are only available if backend explicitly reveals
  // them by writing to the PUBLIC seat.holeCards.
  const revealed = props.seat?.holeCards;
  if (Array.isArray(revealed) && revealed.length > 0) {
    return revealed;
  }

  return [];
});

const isHandActive = computed(() => {
  const status = currentGame.value?.status;
  const round = currentGame.value?.table?.currentRound;

  if (status !== 'playing') return false;
  if (!round) return false;
  return round !== 'waiting';
});

const shouldHideHoleCards = computed(() => {
  // If backend revealed this seat's cards, show face.
  if (Array.isArray(props.seat?.holeCards) && props.seat.holeCards.length > 0) return false;

  if (props.isMe) {
    // If my private cards haven't arrived yet, show as backs.
    return (myHoleCards.value?.length || 0) < 2;
  }
  return true;
});

const displayHoleCards = computed(() => {
  if (!props.seat) return [];
  if (props.seat.status === 'folded') return [];

  // During an active hand, always reserve 2 card slots so the UI doesn't look empty.
  if (isHandActive.value) {
    if (props.isMe) {
      const mine = myHoleCards.value || [];
      if (mine.length >= 2) return mine.slice(0, 2);
      return [null, null];
    }

    // Other players: show backs until backend reveals seat.holeCards.
    const revealed = props.seat?.holeCards;
    if (Array.isArray(revealed) && revealed.length >= 2) {
      return revealed.slice(0, 2);
    }
    return [null, null];
  }

  // Outside of a hand, show revealed cards only (e.g., showdown view lingering)
  return holeCards.value || [];
});

// Winner display logic: driven by presence of handResult (not stage name)
watch(
  () => currentGame.value?.table?.handResult,
  (handResult) => {
    if (!handResult || !props.seat || props.seat.status === 'folded') {
      localIsWinner.value = false;
      localWinAmount.value = 0;
      localHandName.value = '';
      localShowdownCards.value = [];
      return;
    }

    const playerResult = handResult?.allResults?.find(
      (r) => r.odId === props.seat.odId,
    );

    if (playerResult) {
      localHandName.value = playerResult.handName || '';
    } else {
      localHandName.value = '';
    }

    const winner = handResult?.winners?.find(
      (w) => w.odId === props.seat.odId,
    );
    if (winner) {
      localIsWinner.value = true;
      localWinAmount.value = winner.amount || 0;
    } else {
      localIsWinner.value = false;
      localWinAmount.value = 0;
    }
  },
  { immediate: true },
);

// Showdown-related computed properties - use local state
const isShowdownRevealing = computed(() => {
  const gameStage = currentGame.value?.table?.stage;
  return gameStage === 'showdown';
});

const showHandResult = computed(() => {
  if (!props.seat) return false;
  const handResult = currentGame.value?.table?.handResult;
  return !!handResult && (localHandName.value !== '' || localWinAmount.value > 0);
});

const handResultName = computed(() => {
  return localHandName.value;
});

const winAmount = computed(() => {
  return localWinAmount.value;
});

const isWinner = computed(() => {
  return localIsWinner.value;
});

const isWinningCard = (card) => {
  if (!showHandResult.value || !isWinner.value) return false;
  const handResult = currentGame.value?.table?.handResult;
  const winner = handResult?.winners?.find(
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

const positionClass = computed(() => {
  const p = props.position;
  if (p === 'top' || p === 'bottom' || p === 'left' || p === 'right') {
    return `pos-${p}`;
  }
  return '';
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
  width: 70px;
  height: 70px;
}

.bet-chip-badge {
  position: absolute;
  z-index: 1;
  pointer-events: none;
}

/* Push the chip toward table center based on seat location */
.pos-bottom .bet-chip-badge {
  top: -40px;
  left: 50%;
  transform: translateX(-50%);
}

.pos-top .bet-chip-badge {
  bottom: -40px;
  left: 50%;
  transform: translateX(-50%);
}

.pos-left .bet-chip-badge {
  right: -40px;
  top: 50%;
  transform: translateY(-50%);
}

.pos-right .bet-chip-badge {
  left: -40px;
  top: 50%;
  transform: translateY(-50%);
}

/* Circular Avatar */
.avatar-circle {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
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
  transition: all 0.3s ease-out;
}

.avatar-circle.is-waiting {
  filter: brightness(0.7);
  opacity: 0.7;
  transition: all 0.3s ease-out;
}

.avatar-circle.is-folded {
  filter: grayscale(100%);
  opacity: 0.4;
  transition: all 0.3s ease-out;
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

.badge-waiting {
  background: #ff9800;
  color: white;
}

/* Turn Timer Ring */
.timer-ring {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4;
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
  transition: all 0.3s ease-out;
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
  transition: all 0.3s ease-out;
}

.blind-badge {
  font-size: 8px;
  padding: 1px 3px;
  border-radius: 3px;
  background: rgba(76, 175, 80, 0.6);
  color: white;
  font-weight: bold;
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
  width: 60px;
  height: 60px;
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
  .avatar-wrapper {
    width: 64px;
    height: 64px;
  }

  .avatar-circle {
    width: 54px;
    height: 54px;
    font-size: 20px;
  }

  .player-name {
    font-size: 9px;
    max-width: 70px;
  }

  .player-stack {
    font-size: 10px;
  }
}
</style>
