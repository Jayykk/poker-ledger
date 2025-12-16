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

      <!-- Hole Cards (only show for current player) -->
      <div v-if="isMe && holeCards.length > 0" class="hole-cards">
        <div v-for="(card, i) in holeCards" :key="i" class="card-mini">
          {{ card }}
        </div>
      </div>
    </div>

    <!-- Empty Seat (Join Button) -->
    <div v-else class="empty-seat" @click="handleJoinClick">
      <div class="join-icon">+</div>
      <div class="join-text">Join</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { usePokerGame } from '../../composables/usePokerGame.js';

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
});

const emit = defineEmits(['join-seat']);

const { myHoleCards } = usePokerGame();

const holeCards = computed(() => {
  return props.isMe ? myHoleCards.value : [];
});

const handleJoinClick = () => {
  // Simple buy-in dialog (in real app, would show modal)
  const buyIn = prompt('Enter buy-in amount:', '1000');
  if (buyIn) {
    emit('join-seat', props.seatNumber, parseInt(buyIn));
  }
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
