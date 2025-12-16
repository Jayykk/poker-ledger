<template>
  <div class="poker-table-container">
    <!-- Poker Table -->
    <div class="poker-table">
      <!-- Community Cards Area -->
      <div class="community-cards-area">
        <CommunityCards :cards="communityCards" :round="currentRound" />
        <PotDisplay :pot="potSize" />
      </div>

      <!-- Player Seats (arranged in circle) -->
      <div
        v-for="seatNum in maxSeats"
        :key="seatNum"
        :class="['player-seat-wrapper', `seat-${seatNum}`]"
      >
        <PlayerSeat
          :seat="seats[seatNum]"
          :seatNumber="seatNum"
          :isCurrentTurn="isCurrentTurn(seatNum)"
          :isMe="isMySeat(seatNum)"
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
const maxSeats = computed(() => currentGame.value?.meta?.maxPlayers || 6);

const seats = computed(() => {
  const seatMap = {};
  for (let i = 0; i < maxSeats.value; i++) {
    seatMap[i] = currentGame.value?.seats?.[i] || null;
  }
  return seatMap;
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
  background: linear-gradient(135deg, #1a472a 0%, #0d291a 100%);
  overflow: hidden;
}

.poker-table {
  position: relative;
  width: 90%;
  max-width: 1200px;
  height: 70vh;
  margin: 5vh auto;
  background: radial-gradient(ellipse at center, #0a5d2c 0%, #064020 100%);
  border: 12px solid #8b4513;
  border-radius: 50%;
  box-shadow: 
    inset 0 0 50px rgba(0, 0, 0, 0.5),
    0 10px 40px rgba(0, 0, 0, 0.8);
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

.seat-0 { top: 50%; left: 10%; transform: translateY(-50%); }
.seat-1 { top: 15%; left: 20%; }
.seat-2 { top: 5%; left: 50%; transform: translateX(-50%); }
.seat-3 { top: 15%; right: 20%; }
.seat-4 { top: 50%; right: 10%; transform: translateY(-50%); }
.seat-5 { bottom: 15%; left: 50%; transform: translateX(-50%); }

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

  .seat-0 { top: 50%; left: 5%; }
  .seat-1 { top: 20%; left: 15%; }
  .seat-2 { top: 10%; left: 50%; }
  .seat-3 { top: 20%; right: 15%; }
  .seat-4 { top: 50%; right: 5%; }
  .seat-5 { bottom: 10%; left: 50%; }
}
</style>
