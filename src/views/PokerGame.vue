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
      <!-- Top Bar (15vh) - Game Header with Hamburger Menu -->
      <div class="top-bar">
        <button @click="handleLeave" class="btn-back">
          ←
        </button>
        <div class="game-info">
          <div class="table-id">Table #{{ gameId?.slice(0, 6) }}</div>
          <div class="hand-number">Hand #{{ currentGame.handNumber }}</div>
        </div>
        <button 
          @click="toggleMenu" 
          @keydown.enter="toggleMenu"
          @keydown.space.prevent="toggleMenu"
          class="btn-hamburger"
          aria-label="Open menu"
          :aria-expanded="String(menuOpen)"
          aria-haspopup="true"
        >
          ☰
        </button>
      </div>

      <!-- Dropdown Menu -->
      <Transition name="slide-down">
        <div v-if="menuOpen" class="dropdown-menu" role="menu" aria-label="Table actions">
          <button 
            v-if="mySeat && (currentGame.status === 'playing' || currentGame.status === 'waiting')"
            @click="handleLeaveSeat" 
            class="menu-item"
            :class="{ 'menu-item-pending': isPendingLeave }"
            role="menuitem"
          >
            <span class="menu-icon">{{ isPendingLeave ? '⏳' : '🚪' }}</span>
            <span>{{ isPendingLeave ? 'Cancel Leave' : 'Leave Seat' }}</span>
          </button>
          <button @click="handleShowTableInfo" class="menu-item" role="menuitem">
            <span class="menu-icon">ℹ️</span>
            <span>Table Info</span>
          </button>
          <div v-if="isCreator" class="menu-divider"></div>
          <button 
            v-if="isCreator && currentGame.status === 'playing'"
            @click="handleEndAfterHand" 
            class="menu-item menu-item-danger"
            role="menuitem"
          >
            <span class="menu-icon">🛑</span>
            <span>End After Hand</span>
          </button>
          <button 
            v-if="isCreator && (currentGame.status === 'waiting' || currentGame.status === 'ended')"
            @click="handleDeleteRoom" 
            class="menu-item menu-item-danger"
            role="menuitem"
          >
            <span class="menu-icon">🗑️</span>
            <span>Delete Room</span>
          </button>
        </div>
      </Transition>

      <!-- Table Info Modal -->
      <BaseModal v-model="showTableInfo" title="Table Information">
        <div class="table-info-content">
          <div class="info-row">
            <span class="info-label">Table ID:</span>
            <span class="info-value">#{{ gameId }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Blinds:</span>
            <span class="info-value">${{ currentGame.meta.blinds.small }}/${{ currentGame.meta.blinds.big }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Max Players:</span>
            <span class="info-value">{{ currentGame.meta.maxPlayers }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Hand Number:</span>
            <span class="info-value">#{{ currentGame.handNumber }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Status:</span>
            <span class="info-value">{{ currentGame.status }}</span>
          </div>
        </div>
      </BaseModal>

      <!-- Middle Section (70vh) - Poker Table -->
      <div class="middle-section">
        <PokerTable />
      </div>

      <!-- Bottom Bar (15vh) - Action Buttons (rendered inside PokerTable) -->
    </div>

    <!-- AFK Pause Overlay -->
    <Transition name="fade">
      <div v-if="isPaused" class="pause-overlay">
        <div class="pause-content">
          <span class="pause-icon">⏸️</span>
          <h2>遊戲暫停</h2>
          <p>{{ pauseReason === 'afk_protection' ? '無人操作，遊戲已暫停' : '遊戲已暫停' }}</p>
          <button 
            v-if="isCreator" 
            @click="handleResumeGame" 
            class="btn-resume"
          >
            ▶️ 繼續遊戲
          </button>
        </div>
      </div>
    </Transition>

    <!-- Pending Leave Toast -->
    <Transition name="slide-up">
      <div v-if="isPendingLeave" class="pending-leave-toast">
        <span class="toast-icon">⏳</span>
        <span class="toast-text">Leaving after this hand...</span>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, watch, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePokerGame } from '../composables/usePokerGame.js';
import { usePokerStore } from '../store/modules/poker.js';
import { useAuthStore } from '../store/modules/auth.js';
import { useNotification } from '../composables/useNotification.js';
import { useConfirm } from '../composables/useConfirm.js';
import PokerTable from '../components/game/PokerTable.vue';
import BaseModal from '../components/common/BaseModal.vue';

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

// Pause state
const isPaused = computed(() => currentGame.value?.status === 'paused');
const pauseReason = computed(() => currentGame.value?.table?.pauseReason);

// Menu state
const menuOpen = ref(false);
const showTableInfo = ref(false);

// Pending leave state
const isPendingLeave = ref(false);

const toggleMenu = () => {
  menuOpen.value = !menuOpen.value;
};

const closeMenu = () => {
  menuOpen.value = false;
};

const handleShowTableInfo = () => {
  showTableInfo.value = true;
  closeMenu();
};

// Watch for game completion - just show message, don't navigate away
watch(() => currentGame.value?.status, (status, oldStatus) => {
  if (status === 'completed' && oldStatus !== 'completed') {
    success('Game completed! Results saved to your history.');
    // Don't navigate away - let player stay and view results
  }
});

// Watch for showdown_complete to execute pending leave
watch(() => currentGame.value?.table?.stage, (stage) => {
  if (stage === 'showdown_complete' && isPendingLeave.value) {
    // Execute leave automatically
    leaveSeat()
      .then(() => {
        isPendingLeave.value = false;
        success('You left your seat');
      })
      .catch((error) => {
        console.error('Failed to leave seat:', error);
        isPendingLeave.value = false;
      });
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
  // If already pending leave, cancel it
  if (isPendingLeave.value) {
    isPendingLeave.value = false;
    success('Leave cancelled');
    closeMenu();
    return;
  }

  // Check if game is playing and player is active
  const isPlaying = currentGame.value?.status === 'playing';
  const playerStatus = mySeat.value?.status;
  const isActive = playerStatus !== 'folded' && playerStatus !== 'sitting_out';

  if (isPlaying && isActive) {
    // Set pending leave instead of leaving immediately
    isPendingLeave.value = true;
    success('Leaving after this hand...');
    closeMenu();
    return;
  }

  // Otherwise, proceed with normal leave confirmation
  const confirmed = await confirm({
    message: 'Leave your seat but stay at the table as spectator?',
    type: 'warning'
  });
  
  if (confirmed) {
    try {
      await leaveSeat();
      success('You left your seat');
      closeMenu();
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
      closeMenu();
    } catch (error) {
      console.error('Failed to end game:', error);
    }
  }
};

const handleResumeGame = async () => {
  try {
    await pokerStore.resumeGame(gameId.value);
    success('遊戲已繼續');
  } catch (error) {
    console.error('Failed to resume game:', error);
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
      closeMenu();
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
  height: 100vh;
}

.top-bar {
  height: 15vh;
  min-height: 60px;
  background: rgba(0, 0, 0, 0.5);
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid rgba(255, 215, 0, 0.3);
  flex-shrink: 0;
  position: relative;
}

.btn-back {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 8px 14px;
  border-radius: 6px;
  font-weight: bold;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 44px;
}

.btn-back:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
}

.btn-hamburger {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 8px 14px;
  border-radius: 6px;
  font-weight: bold;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 44px;
}

.btn-hamburger:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
}

.game-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: rgba(255, 255, 255, 0.9);
  font-weight: bold;
  text-align: center;
}

.table-id {
  font-size: 14px;
  color: #ffd700;
}

.hand-number {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 2px;
}

/* Dropdown Menu */
.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 20px;
  background: rgba(0, 0, 0, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  z-index: 1000;
  min-width: 200px;
  overflow: hidden;
}

.menu-item {
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: background 0.2s ease;
  text-align: left;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.menu-item-danger {
  color: #ff6b6b;
}

.menu-item-danger:hover {
  background: rgba(244, 67, 54, 0.2);
}

.menu-item-pending {
  color: #ffa500;
  font-weight: 600;
}

.menu-item-pending:hover {
  background: rgba(255, 165, 0, 0.2);
}

.menu-icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
}

.menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.2);
  margin: 4px 0;
}

/* Slide down animation */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Table Info Modal */
.table-info-content {
  color: white;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  color: rgba(255, 255, 255, 0.7);
  font-weight: 500;
}

.info-value {
  color: #ffd700;
  font-weight: bold;
}

.middle-section {
  height: 70vh;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
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

/* Pause Overlay */
.pause-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(8px);
}

.pause-content {
  text-align: center;
  color: white;
  padding: 48px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 24px;
  border: 2px solid rgba(255, 255, 255, 0.1);
}

.pause-icon {
  font-size: 72px;
  display: block;
  margin-bottom: 24px;
}

.pause-content h2 {
  font-size: 32px;
  margin-bottom: 16px;
  color: #ffd700;
}

.pause-content p {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 32px;
}

.btn-resume {
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  color: white;
  border: none;
  padding: 16px 48px;
  font-size: 18px;
  font-weight: bold;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-resume:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(76, 175, 80, 0.4);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Pending Leave Toast */
.pending-leave-toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 165, 0, 0.95);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 999;
}

.toast-icon {
  font-size: 20px;
}

.toast-text {
  font-size: 14px;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

@media (max-width: 768px) {
  .top-bar {
    padding: 10px 16px;
    min-height: 50px;
  }

  .table-id {
    font-size: 12px;
  }

  .hand-number {
    font-size: 11px;
  }

  .dropdown-menu {
    right: 10px;
    min-width: 180px;
  }

  .menu-item {
    padding: 10px 14px;
    font-size: 13px;
  }
}
</style>
