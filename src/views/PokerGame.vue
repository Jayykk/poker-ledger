<template>
  <div class="poker-game-view">
    <div v-if="error" class="error-screen">
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

        <!-- Dropdown Menu (anchored to Top Bar) -->
        <Transition name="slide-down">
          <div v-if="menuOpen" class="dropdown-menu" role="menu" aria-label="Table actions">
            <button @click="handleShareInvite" class="menu-item" role="menuitem">
              <span class="menu-icon">🔗</span>
              <span>Invite Players</span>
            </button>
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
            
            <!-- Host Control Buttons -->
            <button 
              v-if="isCreator && currentGame.status === 'waiting' && hasEnoughPlayers"
              @click="handleStartGame" 
              class="menu-item"
              role="menuitem"
            >
              <span class="menu-icon">▶️</span>
              <span>Start Game</span>
            </button>
            <button 
              v-if="isCreator && currentGame.status === 'playing' && !isPaused"
              @click="handlePauseGame" 
              class="menu-item"
              role="menuitem"
            >
              <span class="menu-icon">⏸️</span>
              <span>Pause Game</span>
            </button>
            <button 
              v-if="isCreator && currentGame.status === 'paused'"
              @click="handleResumeGame" 
              class="menu-item"
              role="menuitem"
            >
              <span class="menu-icon">▶️</span>
              <span>Resume Game</span>
            </button>
            <button 
              v-if="isCreator && currentGame.status === 'playing' && isAutoNext"
              @click="handleStopAfterHand" 
              class="menu-item"
              role="menuitem"
            >
              <span class="menu-icon">⏹️</span>
              <span>Stop After This Hand</span>
            </button>
            
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
      </div>

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
        <PokerTable
          @animation-start="isRunoutPlaying = true"
          @animation-end="isRunoutPlaying = false"
        />
      </div>

      <!-- Bottom Bar (15vh) - Action Buttons (rendered inside PokerTable) -->
    </div>

    <!-- Loading / reconnect state (e.g. after a page refresh) -->
    <div v-else class="loading-screen">
      <div class="spinner"></div>
      <p>Loading table…</p>
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

    <!-- Waiting-for-players invite prompt (host nudge before 2nd player joins) -->
    <Transition name="slide-up">
      <div v-if="showInvitePrompt" class="invite-prompt">
        <span class="invite-text">Waiting for players…</span>
        <button type="button" class="invite-share-btn" @click="handleShareInvite">
          🔗 Share invite link
        </button>
      </div>
    </Transition>

    <!-- Auto-Start Countdown Overlay -->
    <Transition name="fade">
      <GameOverlay v-if="showAutoStartCountdown && !isRunoutPlaying">
        <span class="auto-start-capsule-text">Next hand in {{ autoStartCountdown }}...</span>
        <button
          type="button"
          class="auto-start-capsule-cancel"
          aria-label="Cancel auto-start"
          @click="handleStopAutoStart"
        >
          ✕
        </button>
      </GameOverlay>
    </Transition>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, watch, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePokerGame } from '../composables/usePokerGame.js';
import { usePokerStore } from '../store/modules/poker.js';
import { useAuthStore } from '../store/modules/auth.js';
import { shouldAutoStartFirstHand, resolveAutoSeat, buildPokerInviteUrl } from '../utils/pokerEntry.js';
import { useNotification } from '../composables/useNotification.js';
import { useConfirm } from '../composables/useConfirm.js';
import { useLiff } from '../composables/useLiff.js';
import { copyToClipboard } from '../utils/formatters.js';
import PokerTable from '../components/game/PokerTable.vue';
import GameOverlay from '../components/game/GameOverlay.vue';
import BaseModal from '../components/common/BaseModal.vue';

const route = useRoute();
const router = useRouter();
const pokerStore = usePokerStore();
const authStore = useAuthStore();
const { success } = useNotification();
const { confirm } = useConfirm();
const { isInLineClient, sharePokerInvite } = useLiff();

// Import error notification
const { error: showError } = useNotification();

const {
  currentGame,
  gameId,
  loading,
  error,
  joinGame,
  joinSeat,
  leaveSeat,
  mySeat,
} = usePokerGame();

const isCreator = computed(() => {
  return currentGame.value?.meta?.createdBy === authStore.user?.uid;
});

// Auto-next computed properties
const isAutoNext = computed(() => currentGame.value?.table?.isAutoNext ?? false);
const autoStartDelay = computed(() => currentGame.value?.meta?.autoStartDelay ?? 5);
const hasEnoughPlayers = computed(() => {
  const seats = currentGame.value?.seats || {};
  return Object.values(seats).filter(s => s !== null).length >= 2;
});

// Nudge the host to invite while seated and still waiting for a 2nd player.
const showInvitePrompt = computed(() =>
  currentGame.value?.status === 'waiting' && !!mySeat.value && !hasEnoughPlayers.value,
);

// Pause state
const isPaused = computed(() => currentGame.value?.status === 'paused');
const pauseReason = computed(() => currentGame.value?.table?.pauseReason);

// Menu state
const menuOpen = ref(false);
const showTableInfo = ref(false);

// Pending leave state
const isPendingLeave = ref(false);

// Runout animation state (hide auto-start overlay during dramatic squeeze)
const isRunoutPlaying = ref(false);

// Auto-start countdown state (shared by first-hand and between-hands auto-start)
const autoStartCountdown = ref(0);
const showAutoStartCountdown = ref(false);
const autoStartInterval = ref(null);
const isStarting = ref(false); // Prevent double-submit
const firstHandAutoStartCancelled = ref(false); // host dismissed the first-hand countdown

const clearAutoStartCountdown = () => {
  if (autoStartInterval.value) {
    clearInterval(autoStartInterval.value);
    autoStartInterval.value = null;
  }
  showAutoStartCountdown.value = false;
};

const triggerStartHand = () => {
  if (isStarting.value) return;
  isStarting.value = true;
  const { startHand } = usePokerGame();
  startHand()
    .catch((err) => console.error('Failed to auto-start hand:', err))
    .finally(() => { isStarting.value = false; });
};

const beginAutoStartCountdown = () => {
  clearAutoStartCountdown();
  autoStartCountdown.value = autoStartDelay.value;
  showAutoStartCountdown.value = true;
  autoStartInterval.value = setInterval(() => {
    autoStartCountdown.value--;
    if (autoStartCountdown.value <= 0) {
      clearAutoStartCountdown();
      triggerStartHand();
    }
  }, 1000);
};

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

// Auto-start countdown — covers BOTH the first hand of a brand-new room and
// continuation between hands. These two cases are mutually exclusive (handNumber
// 0 + waiting vs. showdown_complete on a played hand), so they share one
// countdown:
//   • First hand: the host auto-deals once 2+ players are seated.
//   • Between hands: backend `isAutoNext` + showdown_complete drives the next hand.
watch(() => [
  currentGame.value?.table?.stage,
  currentGame.value?.handNumber,
  isAutoNext.value,
  currentGame.value?.status,
  isCreator.value,
  hasEnoughPlayers.value,
  isRunoutPlaying.value,
], () => {
  clearAutoStartCountdown();
  if (isStarting.value || isRunoutPlaying.value) return;

  const game = currentGame.value;
  const userId = authStore.user?.uid;

  // First hand of a new room.
  if (!firstHandAutoStartCancelled.value && shouldAutoStartFirstHand(game, userId)) {
    beginAutoStartCountdown();
    return;
  }

  // Between hands.
  if (game?.table?.stage === 'showdown_complete' && isAutoNext.value &&
      game?.status !== 'paused' && isCreator.value && hasEnoughPlayers.value) {
    beginAutoStartCountdown();
  }
});

// Link-to-seat: someone who opens a share link and isn't seated yet is
// auto-seated with the room's buy-in ("open link → sit down"). Falls back to the
// manual / spectate path only when already seated, the table is full, or the
// game isn't joinable. Pass ?spectate to skip and just watch.
const hasAttemptedAutoSeat = ref(false);
watch(() => [currentGame.value, authStore.user?.uid], () => {
  if (hasAttemptedAutoSeat.value) return;
  if (route.query.spectate) {
    hasAttemptedAutoSeat.value = true;
    return;
  }

  const game = currentGame.value;
  const userId = authStore.user?.uid;
  if (!game || !userId) return; // wait until the snapshot + auth are both ready

  const buyIn = resolveAutoSeat(game, userId);
  hasAttemptedAutoSeat.value = true; // attempt at most once per mount
  if (buyIn === null) return; // already seated / full / not joinable

  joinSeat(gameId.value, undefined, buyIn).catch((err) => {
    console.error('Auto-seat failed; manual seat selection available:', err);
  });
}, { immediate: true });

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
  
  // Clean up auto-start countdown
  if (autoStartInterval.value) {
    clearInterval(autoStartInterval.value);
    autoStartInterval.value = null;
  }
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
    await pokerStore.togglePause(gameId.value);
    closeMenu();
  } catch (error) {
    console.error('Failed to resume game:', error);
  }
};

const handleStartGame = async () => {
  if (isStarting.value) return; // Prevent double-submit
  if (currentGame.value?.status === 'playing') return; // Do not start if active
  
  isStarting.value = true;
  try {
    const { startHand } = usePokerGame();
    await startHand();
    closeMenu();
    success('Game started!');
  } catch (error) {
    console.error('Failed to start game:', error);
    // If error indicates game is already in progress, fail silently (show toast only)
    // Do NOT redirect the user
    if (error.message && (error.message.includes('already in progress') || error.message.includes('Game already started'))) {
      showError('Game already in progress');
    } else {
      showError('Failed to start game: ' + error.message);
    }
  } finally {
    isStarting.value = false;
  }
};

const handleShareInvite = async () => {
  closeMenu();
  const hostName = mySeat.value?.odName || authStore.user?.displayName || '朋友';

  // Inside LINE: native share sheet, link opens straight into the table.
  if (isInLineClient.value) {
    const shared = await sharePokerInvite(gameId.value, hostName);
    if (shared) {
      success('Invite sent');
      return;
    }
  }

  // Anywhere else (or if the LINE share was dismissed): copy the web link.
  const url = buildPokerInviteUrl(gameId.value, window.location.origin, import.meta.env.BASE_URL);
  const copied = await copyToClipboard(url);
  if (copied) {
    success('Invite link copied — send it to your friends');
  } else {
    showError('Could not copy the link');
  }
};

const handlePauseGame = async () => {
  try {
    await pokerStore.togglePause(gameId.value);
    closeMenu();
    success('Game paused');
  } catch (error) {
    console.error('Failed to pause game:', error);
  }
};

const handleStopAfterHand = async () => {
  try {
    await pokerStore.stopNextHand(gameId.value);
    closeMenu();
    success('Auto-next disabled. Game will end after this hand.');
  } catch (error) {
    console.error('Failed to stop next hand:', error);
  }
};

const handleStopAutoStart = async () => {
  // Always dismiss the visible countdown immediately.
  clearAutoStartCountdown();

  const game = currentGame.value;
  const isFirstHand = (game?.handNumber ?? 0) === 0 && game?.status === 'waiting';
  if (isFirstHand) {
    // No backend isAutoNext yet — suppress locally until the host starts manually.
    firstHandAutoStartCancelled.value = true;
    success('Auto-start cancelled');
    return;
  }

  try {
    await pokerStore.stopNextHand(gameId.value);
    success('Auto-start cancelled');
  } catch (error) {
    console.error('Failed to cancel auto-start:', error);
    showError('Failed to cancel auto-start');
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

/* Waiting-for-players invite prompt */
.invite-prompt {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 14px;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgba(255, 215, 0, 0.4);
  border-radius: 9999px;
  padding: 10px 14px 10px 20px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  z-index: 998;
  max-width: calc(100vw - 32px);
}

.invite-text {
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  white-space: nowrap;
}

.invite-share-btn {
  flex-shrink: 0;
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  color: white;
  border: none;
  border-radius: 9999px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}

.invite-share-btn:hover {
  transform: scale(1.03);
  box-shadow: 0 4px 14px rgba(76, 175, 80, 0.45);
}

/* Auto-Start Countdown Overlay */
.auto-start-capsule-text {
  flex: 1;
  min-width: 0;
  color: white;
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.auto-start-capsule-cancel {
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.25);
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.auto-start-capsule-cancel:hover {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.4);
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
