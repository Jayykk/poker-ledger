<template>
  <div class="poker-game-view">
    <div v-if="loading" class="loading-screen">
      <div class="spinner"></div>
      <p>Loading game...</p>
    </div>

    <div v-else-if="error" class="error-screen">
      <p>{{ error }}</p>
      <button @click="goBack" class="btn-back">Back to Lobby</button>
    </div>

    <div v-else-if="currentGame" class="game-screen">
      <!-- Game Header -->
      <div class="game-header">
        <button @click="handleLeave" class="btn-leave">
          ← Leave Table
        </button>
        <div class="game-info">
          <span>Table #{{ gameId?.slice(0, 8) }}</span>
          <span class="separator">|</span>
          <span>Blinds: {{ currentGame.meta.blinds.small }}/{{ currentGame.meta.blinds.big }}</span>
          <span class="separator">|</span>
          <span>Hand: #{{ currentGame.handNumber }}</span>
        </div>
        <div class="header-actions">
          <button 
            v-if="mySeat && (currentGame.status === 'playing' || currentGame.status === 'waiting')"
            @click="handleLeaveSeat" 
            class="btn-leave-seat"
          >
            Leave Seat
          </button>
          <button 
            v-if="isCreator && currentGame.status === 'playing'"
            @click="handleEndAfterHand" 
            class="btn-end"
          >
            🛑 End After Hand
          </button>
          <button 
            v-if="isCreator && (currentGame.status === 'waiting' || currentGame.status === 'ended')"
            @click="handleDeleteRoom" 
            class="btn-delete"
          >
            🗑️ Delete Room
          </button>
        </div>
      </div>

      <!-- Main Poker Table -->
      <PokerTable />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePokerGame } from '../composables/usePokerGame.js';
import { usePokerStore } from '../store/modules/poker.js';
import { useAuthStore } from '../store/modules/auth.js';
import { useNotification } from '../composables/useNotification.js';
import { useConfirm } from '../composables/useConfirm.js';
import PokerTable from '../components/game/PokerTable.vue';

const route = useRoute();
const router = useRouter();
const pokerStore = usePokerStore();
const authStore = useAuthStore();
const { success } = useNotification();
const { confirm } = useConfirm();

const {
  currentGame,
  gameId,
  loading,
  error,
  joinGame,
  leaveSeat,
  mySeat,
} = usePokerGame();

const isCreator = computed(() => {
  return currentGame.value?.meta?.createdBy === authStore.user?.uid;
});

// Watch for game completion - just show message, don't navigate away
watch(() => currentGame.value?.status, (status, oldStatus) => {
  if (status === 'completed' && oldStatus !== 'completed') {
    success('Game completed! Results saved to your history.');
    // Don't navigate away - let player stay and view results
  }
});

onMounted(async () => {
  const id = route.params.gameId;
  if (id) {
    try {
      await joinGame(id);
    } catch (err) {
      console.error('Failed to join game:', err);
    }
  }
});

onUnmounted(() => {
  // Clean up listeners when leaving
  pokerStore.stopListeners();
});

const handleLeave = async () => {
  const confirmed = await confirm({
    message: 'Are you sure you want to leave this table?',
    type: 'warning'
  });
  
  if (confirmed) {
    try {
      // Leave seat if seated
      if (mySeat.value) {
        await leaveSeat();
      }
      // Stop listeners and go back to lobby
      pokerStore.stopListeners();
      goBack();
    } catch (error) {
      console.error('Failed to leave:', error);
    }
  }
};

const handleLeaveSeat = async () => {
  const confirmed = await confirm({
    message: 'Leave your seat but stay at the table as spectator?',
    type: 'warning'
  });
  
  if (confirmed) {
    try {
      await leaveSeat();
      success('You left your seat');
    } catch (error) {
      console.error('Failed to leave seat:', error);
    }
  }
};

const handleEndAfterHand = async () => {
  const confirmed = await confirm({
    message: 'End the game after this hand completes?',
    type: 'warning'
  });
  
  if (confirmed) {
    try {
      await pokerStore.endGameAfterHand(gameId.value);
    } catch (error) {
      console.error('Failed to end game:', error);
    }
  }
};

const handleDeleteRoom = async () => {
  const confirmed = await confirm({
    message: 'Are you sure you want to delete this room? This action cannot be undone.',
    type: 'danger'
  });
  
  if (confirmed) {
    try {
      await pokerStore.deleteRoom(gameId.value);
      goBack();
    } catch (error) {
      console.error('Failed to delete room:', error);
    }
  }
};

const goBack = () => {
  router.push({ name: 'GameLobby' });
};
</script>

<style scoped>
.poker-game-view {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a472a 0%, #0d291a 100%);
}

.loading-screen,
.error-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  color: white;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-screen p,
.error-screen p {
  margin-top: 20px;
  font-size: 18px;
}

.btn-back {
  margin-top: 20px;
  padding: 12px 24px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
}

.game-screen {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.game-header {
  background: rgba(0, 0, 0, 0.5);
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid rgba(255, 215, 0, 0.3);
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-leave {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-leave:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
}

.btn-leave-seat {
  background: rgba(255, 152, 0, 0.2);
  color: #ffb74d;
  border: 1px solid rgba(255, 152, 0, 0.4);
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 13px;
}

.btn-leave-seat:hover {
  background: rgba(255, 152, 0, 0.3);
  border-color: rgba(255, 152, 0, 0.6);
}

.btn-end {
  background: rgba(244, 67, 54, 0.2);
  color: #ff6b6b;
  border: 1px solid rgba(244, 67, 54, 0.4);
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 13px;
}

.btn-end:hover {
  background: rgba(244, 67, 54, 0.3);
  border-color: rgba(244, 67, 54, 0.6);
}

.btn-delete {
  background: rgba(156, 39, 176, 0.2);
  color: #ce93d8;
  border: 1px solid rgba(156, 39, 176, 0.4);
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 13px;
}

.btn-delete:hover {
  background: rgba(156, 39, 176, 0.3);
  border-color: rgba(156, 39, 176, 0.6);
}

.game-info {
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  font-weight: bold;
}

.separator {
  margin: 0 12px;
  color: rgba(255, 215, 0, 0.5);
}

@media (max-width: 768px) {
  .game-header {
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px;
  }

  .game-info {
    font-size: 12px;
  }

  .separator {
    margin: 0 8px;
  }
}
</style>
