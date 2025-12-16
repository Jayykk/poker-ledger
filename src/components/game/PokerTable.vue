<template>
  <div class="poker-table-container">
    <!-- Poker Table -->
    <div class="poker-table">
      <!-- Community Cards Area -->
      <div class="community-cards-area">
        <CommunityCards :cards="communityCards" :round="currentRound" />
        <PotDisplay :pot="potSize" />
      </div>

      <!-- Player Seats (arranged in circle with rotation) -->
      <div
        v-for="seatInfo in visibleSeats"
        :key="seatInfo.actualSeatNum"
        :class="['player-seat-wrapper', `seat-${seatInfo.displayPosition}`]"
      >
        <PlayerSeat
          :seat="seatInfo.seat"
          :seatNumber="seatInfo.actualSeatNum"
          :isCurrentTurn="isCurrentTurn(seatInfo.actualSeatNum)"
          :isMe="isMySeat(seatInfo.actualSeatNum)"
          :visible="true"
          @join-seat="handleJoinSeat"
        />
      </div>
    </div>

    <!-- Action Controls (bottom of screen) -->
    <div v-if="isMyTurn" class="action-controls">
      <ActionButtons
        :can-check="canCheck"
        :can-raise="canRaise"
        :call-amount="callAmount"
        :my-chips="myChips"
        :is-my-turn="isMyTurn"
        @fold="handleFold"
        @check="handleCheck"
        @call="handleCall"
        @raise="handleRaise"
        @all-in="handleAllIn"
      />
    </div>

    <!-- Start Hand Button (for game creator when waiting) -->
    <div v-if="canStartHand" class="start-hand-controls">
      <button
        @click="handleStartHand"
        class="btn-primary btn-lg"
        :disabled="loading"
      >
        {{ loading ? 'Starting...' : 'Start Hand' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { usePokerGame } from '../../composables/usePokerGame.js';
import { useGameActions } from '../../composables/useGameActions.js';
import { useAuthStore } from '../../store/modules/auth.js';
import CommunityCards from './CommunityCards.vue';
import PotDisplay from './PotDisplay.vue';
import PlayerSeat from './PlayerSeat.vue';
import ActionButtons from './ActionButtons.vue';

const authStore = useAuthStore();
const {
  currentGame,
  isMyTurn,
  myChips,
  potSize,
  communityCards,
  currentRound,
  callAmount,
  canCheck,
  canRaise,
  loading,
  startHand,
  joinSeat,
} = usePokerGame();

const { fold, check, call, raise, allIn } = useGameActions();

// Computed
const maxSeats = computed(() => currentGame.value?.meta?.maxPlayers || 10);

const seats = computed(() => {
  const seatMap = {};
  for (let i = 0; i < maxSeats.value; i++) {
    seatMap[i] = currentGame.value?.seats?.[i] || null;
  }
  return seatMap;
});

// Find my seat number
const mySeatNumber = computed(() => {
  const userId = authStore.user?.uid;
  if (!userId) return null;
  
  for (let i = 0; i < maxSeats.value; i++) {
    const seat = seats.value[i];
    if (seat && seat.odId === userId) {
      return i;
    }
  }
  return null;
});

// Calculate display position based on seat rotation (first-person view)
const getDisplayPosition = (actualSeatNum) => {
  if (mySeatNumber.value === null) {
    // No rotation if not seated
    return actualSeatNum;
  }
  // Rotate so my seat appears at position 0 (bottom center)
  return (actualSeatNum - mySeatNumber.value + maxSeats.value) % maxSeats.value;
};

// Get visible seats (only show occupied seats)
const visibleSeats = computed(() => {
  const visible = [];
  for (let i = 0; i < maxSeats.value; i++) {
    const seat = seats.value[i];
    // Show seat if:
    // 1. It's my seat (even if I haven't sat yet for joining)
    // 2. Seat is occupied
    // 3. I'm not seated yet (show all seats for joining)
    if (mySeatNumber.value === null || i === mySeatNumber.value || seat !== null) {
      const displayPos = getDisplayPosition(i);
      visible.push({
        actualSeatNum: i,
        displayPosition: displayPos,
        seat: seat,
      });
    }
  }
  return visible;
});

const canStartHand = computed(() => {
  if (!currentGame.value) return false;
  const isCreator = currentGame.value.meta?.createdBy === authStore.user?.uid;
  const isWaiting = currentGame.value.status === 'waiting';
  const hasPlayers = Object.values(seats.value)
    .filter((s) => s !== null).length >= 2;
  return isCreator && isWaiting && hasPlayers;
});

// Methods
const isCurrentTurn = (seatNum) => {
  const seat = seats.value[seatNum];
  if (!seat) return false;
  return currentGame.value?.table?.currentTurn === seat.odId;
};

const isMySeat = (seatNum) => {
  const seat = seats.value[seatNum];
  if (!seat) return false;
  return seat.odId === authStore.user?.uid;
};

const handleJoinSeat = async (seatNumber, buyIn) => {
  try {
    await joinSeat(currentGame.value.id, seatNumber, buyIn);
  } catch (error) {
    console.error('Failed to join seat:', error);
  }
};

const handleStartHand = async () => {
  try {
    await startHand();
  } catch (error) {
    console.error('Failed to start hand:', error);
  }
};

const handleFold = async () => {
  try {
    await fold();
  } catch (error) {
    console.error('Failed to fold:', error);
  }
};

const handleCheck = async () => {
  try {
    await check();
  } catch (error) {
    console.error('Failed to check:', error);
  }
};

const handleCall = async () => {
  try {
    await call();
  } catch (error) {
    console.error('Failed to call:', error);
  }
};

const handleRaise = async (amount) => {
  try {
    await raise(amount);
  } catch (error) {
    console.error('Failed to raise:', error);
  }
};

const handleAllIn = async () => {
  try {
    await allIn();
  } catch (error) {
    console.error('Failed to go all-in:', error);
  }
};
</script>

<style scoped>
.poker-table-container {
  position: relative;
  width: 100%;
  height: 100vh;
  background: linear-gradient(135deg, #0d1b2a 0%, #1b263b 50%, #0d1b2a 100%);
  overflow: hidden;
}

.poker-table {
  position: relative;
  width: 90%;
  max-width: 1200px;
  height: 70vh;
  margin: 5vh auto;
  background: 
    radial-gradient(ellipse at center, #1a5c3a 0%, #0f3d26 50%, #0a2818 100%);
  border: 16px solid #8b6914;
  border-radius: 50%;
  box-shadow: 
    inset 0 0 80px rgba(0, 0, 0, 0.8),
    inset 0 -20px 40px rgba(0, 0, 0, 0.4),
    0 15px 50px rgba(0, 0, 0, 0.9),
    0 0 0 4px #654321,
    0 0 0 8px #3d2817;
  position: relative;
}

.poker-table::before {
  content: '';
  position: absolute;
  inset: 20px;
  border-radius: 50%;
  background: radial-gradient(ellipse at 30% 30%, rgba(255, 255, 255, 0.05) 0%, transparent 50%);
  pointer-events: none;
}

.poker-table::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: 
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 0, 0, 0.03) 2px,
      rgba(0, 0, 0, 0.03) 4px
    );
  pointer-events: none;
}

.community-cards-area {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

/* Position seats around the table */
.player-seat-wrapper {
  position: absolute;
}

/* 10-player seat positions arranged in oval */
.seat-0 { bottom: 20%; left: 50%; transform: translateX(-50%); }
.seat-1 { bottom: 25%; left: 25%; }
.seat-2 { top: 45%; left: 8%; transform: translateY(-50%); }
.seat-3 { top: 20%; left: 15%; }
.seat-4 { top: 8%; left: 35%; }
.seat-5 { top: 5%; left: 50%; transform: translateX(-50%); }
.seat-6 { top: 8%; right: 35%; }
.seat-7 { top: 20%; right: 15%; }
.seat-8 { top: 45%; right: 8%; transform: translateY(-50%); }
.seat-9 { bottom: 25%; right: 25%; }

.action-controls {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
}

.start-hand-controls {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
}

.btn-primary {
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  color: white;
  border: none;
  padding: 12px 32px;
  font-size: 18px;
  font-weight: bold;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.4);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-lg {
  padding: 16px 48px;
  font-size: 20px;
}

/* Responsive Design */
@media (max-width: 768px) {
  .poker-table {
    width: 95%;
    height: 60vh;
  }

  .seat-0 { bottom: 15%; left: 50%; }
  .seat-1 { bottom: 20%; left: 30%; }
  .seat-2 { top: 40%; left: 10%; }
  .seat-3 { top: 25%; left: 18%; }
  .seat-4 { top: 15%; left: 38%; }
  .seat-5 { top: 10%; left: 50%; }
  .seat-6 { top: 15%; right: 38%; }
  .seat-7 { top: 25%; right: 18%; }
  .seat-8 { top: 40%; right: 10%; }
  .seat-9 { bottom: 20%; right: 30%; }
}
</style>
