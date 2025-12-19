<template>
  <div class="poker-table-container">
    <!-- Poker Table Felt (vertical oval) -->
    <div ref="tableEl" class="poker-table-felt">
      <!-- Community Cards Area (centered on table) -->
      <div class="community-cards-area">
      <CommunityCards
        :cards="communityCards"
        :round="currentRound"
        :hand-result="currentGame?.table?.handResult"
        @animation-start="emit('animation-start')"
        @animation-end="emit('animation-end')"
      />
      <PotDisplay ref="potRef" :pot="displayPot" />

      <!-- Win-by-fold: winner can choose to Show or Muck (default) -->
        <div v-if="showWinByFoldPrompt" class="win-by-fold-prompt">
        <div class="win-by-fold-timer">
          <div class="win-by-fold-countdown">{{ winByFoldSecondsLeft }}s</div>
          <div class="win-by-fold-progress" aria-hidden="true">
            <div class="win-by-fold-progress-bar" :style="{ transform: `scaleX(${winByFoldProgress})` }" />
          </div>
        </div>

        <button
          class="btn-confirm"
          :disabled="!hasMyHoleCards || isWinByFoldDecisionExpired"
          @click="handleVoluntaryShow"
        >
          Show Cards
        </button>
        <button class="btn-cancel" :disabled="isWinByFoldDecisionExpired" @click="handleMuck">
          Muck
        </button>
      </div>
      </div>

      <!-- Player Seats (positioned using fixed coordinate map) -->
      <div
        v-for="seatInfo in visibleSeats"
        :key="seatInfo.actualSeatNum"
        :style="seatInfo.seatStyle"
      >
        <PlayerSeat
          :seat="seatInfo.seat"
          :seatNumber="seatInfo.actualSeatNum"
          :isCurrentTurn="isCurrentTurn(seatInfo.actualSeatNum)"
          :isMe="isMySeat(seatInfo.actualSeatNum)"
          :visible="true"
          :betAmount="displayBetsBySeat[seatInfo.actualSeatNum] || 0"
          :position="seatInfo.position"
          @join-seat="showBuyInModal"
          @auto-action="handleAutoAction"
          @animate-bet="handleAnimateBet"
        />
      </div>

      <!-- Flying chips: gather bets to center (visual only) -->
      <ChipAnimation ref="chipAnimationEl" />

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

    <!-- Action Controls (bottom of screen) - Always visible with proper states -->
    <div class="action-controls">
      <ActionButtons
        :can-check="canCheck"
        :can-raise="canRaise"
        :call-amount="callAmount"
        :my-chips="myChips"
        :is-my-turn="isMyTurn"
        :actions-disabled="actionsDisabled"
        @fold="handleFold"
        @check="handleCheck"
        @call="handleCall"
        @raise="handleRaise"
        @all-in="handleAllIn"
      />
    </div>

    <!-- Buy-in Modal -->
    <BaseModal v-model="showBuyInModalDialog" title="Join Seat">
      <div class="buy-in-content">
        <p class="mb-4 text-gray-300">Enter buy-in amount:</p>
        <input
          v-model="buyInAmount"
          type="number"
          :placeholder="String(DEFAULT_BUY_IN)"
          class="buy-in-input"
          @keyup.enter="handleBuyInConfirm"
        />
        <div class="modal-actions">
          <button @click="handleBuyInConfirm" class="btn-confirm">
            Join
          </button>
          <button @click="showBuyInModalDialog = false" class="btn-cancel">
            Cancel
          </button>
        </div>
      </div>
    </BaseModal>
  </div>
</template>

<script setup>
import { computed, ref, provide, watch, onUnmounted, nextTick } from 'vue';
import { usePokerGame } from '../../composables/usePokerGame.js';
import { useGameActions } from '../../composables/useGameActions.js';
import { useGameAnimations } from '../../composables/useGameAnimations.js';
import { useAuthStore } from '../../store/modules/auth.js';
import { useNotification } from '../../composables/useNotification.js';
import CommunityCards from './CommunityCards.vue';
import PotDisplay from './PotDisplay.vue';
import PlayerSeat from './PlayerSeat.vue';
import ActionButtons from './ActionButtons.vue';
import BaseModal from '../common/BaseModal.vue';
import ChipAnimation from './ChipAnimation.vue';

const emit = defineEmits(['animation-start', 'animation-end']);

const authStore = useAuthStore();
const { error: showError } = useNotification();

// Initialize game animations
const { isRevealingCards, isShowdownActive } = useGameAnimations();
const {
  currentGame,
  isMyTurn,
  myChips,
  myHoleCards,
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

const { fold, check, call, raise, allIn, actionsDisabled, showCards } = useGameActions();

// Constants
const DEFAULT_BUY_IN = 1000;
const MAX_SEATS = 10;

// Fixed coordinate seat layouts for the vertical-oval felt.
// Index is the *display position* (after rotation so "me" is position 0).
// These are hardcoded percentages (no runtime trig) tuned for portrait/mobile.
const SEAT_LAYOUTS = {
  6: [
    { style: { bottom: '-10%', left: '50%', transform: 'translateX(-50%)' }, pos: 'bottom' },
    { style: { bottom: '15%', left: '-5%' }, pos: 'left' },
    { style: { top: '15%', left: '-5%' }, pos: 'left' },
    { style: { top: '-10%', left: '50%', transform: 'translateX(-50%)' }, pos: 'top' },
    { style: { top: '15%', right: '-5%' }, pos: 'right' },
    { style: { bottom: '15%', right: '-5%' }, pos: 'right' },
  ],
  7: [
    { style: { bottom: '-10%', left: '50%', transform: 'translateX(-50%)' }, pos: 'bottom' },
    { style: { bottom: '18%', left: '-6%' }, pos: 'left' },
    { style: { top: '50%', left: '-9%', transform: 'translateY(-50%)' }, pos: 'left' },
    { style: { top: '18%', left: '-6%' }, pos: 'left' },
    { style: { top: '-10%', left: '50%', transform: 'translateX(-50%)' }, pos: 'top' },
    { style: { top: '18%', right: '-6%' }, pos: 'right' },
    { style: { bottom: '18%', right: '-6%' }, pos: 'right' },
  ],
  8: [
    { style: { bottom: '-10%', left: '50%', transform: 'translateX(-50%)' }, pos: 'bottom' },
    { style: { bottom: '18%', left: '-6%' }, pos: 'left' },
    { style: { top: '55%', left: '-9%', transform: 'translateY(-50%)' }, pos: 'left' },
    { style: { top: '18%', left: '-6%' }, pos: 'left' },
    { style: { top: '-10%', left: '50%', transform: 'translateX(-50%)' }, pos: 'top' },
    { style: { top: '18%', right: '-6%' }, pos: 'right' },
    { style: { top: '55%', right: '-9%', transform: 'translateY(-50%)' }, pos: 'right' },
    { style: { bottom: '18%', right: '-6%' }, pos: 'right' },
  ],
  9: [
    { style: { bottom: '-6%', left: '50%', transform: 'translateX(-50%)' }, pos: 'bottom' },
    { style: { bottom: '18%', left: '-2%' }, pos: 'left' },
    { style: { top: '55%', left: '-4%', transform: 'translateY(-50%)' }, pos: 'left' },
    { style: { top: '18%', left: '-2%' }, pos: 'left' },
    { style: { top: '-6%', left: '50%', transform: 'translateX(-50%)' }, pos: 'top' },
    { style: { top: '22%', left: '50%', transform: 'translateX(-50%)' }, pos: 'top' },
    { style: { top: '18%', right: '-2%' }, pos: 'right' },
    { style: { top: '55%', right: '-4%', transform: 'translateY(-50%)' }, pos: 'right' },
    { style: { bottom: '18%', right: '-2%' }, pos: 'right' },
  ],
  10: [
    { style: { bottom: '-12%', left: '50%', transform: 'translateX(-50%)' }, pos: 'bottom' },

    // Right side (curved layout)
    { style: { bottom: '15%', right: '1%' }, pos: 'right' },
    { style: { bottom: '35%', right: '-8%' }, pos: 'right' },
    { style: { top: '35%', right: '-8%' }, pos: 'right' },
    { style: { top: '15%', right: '1%' }, pos: 'right' },

    { style: { top: '-12%', left: '50%', transform: 'translateX(-50%)' }, pos: 'top' },

    // Left side (curved layout)
    { style: { top: '15%', left: '1%' }, pos: 'left' },
    { style: { top: '35%', left: '-8%' }, pos: 'left' },
    { style: { bottom: '35%', left: '-8%' }, pos: 'left' },
    { style: { bottom: '15%', left: '1%' }, pos: 'left' },
  ],
};

function getSeatLayout(totalPlayers) {
  const n = Math.max(6, Math.min(10, totalPlayers || 9));
  return SEAT_LAYOUTS[n] || SEAT_LAYOUTS[9];
}

function getSeatStyle(index, totalPlayers) {
  const layout = getSeatLayout(totalPlayers);
  return layout[index]?.style || {};
}

function getSeatPositionTag(index, totalPlayers) {
  const layout = getSeatLayout(totalPlayers);
  return layout[index]?.pos || 'bottom';
}

// Push chips (avatar -> bet) animation controls
const PUSH_BET_ANIMATION_MS = 400;
const pushBetFreezeUntil = ref({});

// Chip gathering (bet -> pot) animation controls
const GATHER_ANIMATION_MS = 800;
const tableEl = ref(null);
const chipAnimationEl = ref(null);
const potRef = ref(null);
const isGatherAnimating = ref(false);

// Display state decoupled from server values so we can "freeze" during animation.
// We show: displayPot = serverPot - sum(roundBets) (until gather), then jump to serverPot.
const displayPot = ref(0);
const displayBetsBySeat = ref({});

const getSeatBetAmount = (seat) => {
  if (!seat) return 0;
  return seat.roundBet ?? seat.currentBet ?? 0;
};

const getServerBetsBySeat = () => {
  const out = {};
  for (let i = 0; i < maxSeats.value; i++) {
    out[i] = getSeatBetAmount(seats.value[i]);
  }
  return out;
};

const getServerBetsTotal = () => {
  let total = 0;
  for (let i = 0; i < maxSeats.value; i++) {
    total += getSeatBetAmount(seats.value[i]);
  }
  return total;
};

const getServerCollectedPot = () => {
  const serverPot = potSize.value || 0;
  const betsTotal = getServerBetsTotal();
  return Math.max(0, serverPot - betsTotal);
};

const syncDisplayFromServer = () => {
  if (isGatherAnimating.value) return;
  displayPot.value = getServerCollectedPot();

  const now = Date.now();
  const serverBets = getServerBetsBySeat();
  const nextBets = { ...(displayBetsBySeat.value || {}) };

  // Update bets from server, unless a push animation is freezing this seat.
  for (let i = 0; i < maxSeats.value; i++) {
    const freezeUntil = pushBetFreezeUntil.value?.[i] || 0;
    if (freezeUntil > now) continue;
    nextBets[i] = serverBets[i] || 0;
  }

  displayBetsBySeat.value = nextBets;
};

async function handleAnimateBet(payload) {
  const seatNum = payload?.seatNumber;
  if (!Number.isInteger(seatNum)) return;

  const startRect = payload?.startRect;
  if (!startRect || typeof startRect.left !== 'number' || typeof startRect.top !== 'number') return;

  const end = getSeatBetTargetPxFromStartRect(seatNum, startRect);
  if (!end) return;

  // Freeze the bet amount so it updates when the chip lands.
  const freezeUntil = Date.now() + PUSH_BET_ANIMATION_MS;
  pushBetFreezeUntil.value = { ...(pushBetFreezeUntil.value || {}), [seatNum]: freezeUntil };

  const oldVal = typeof payload?.oldVal === 'number' ? payload.oldVal : (displayBetsBySeat.value?.[seatNum] || 0);
  displayBetsBySeat.value = { ...(displayBetsBySeat.value || {}), [seatNum]: oldVal };

  setTimeout(() => {
    const current = pushBetFreezeUntil.value?.[seatNum];
    if (current === freezeUntil) {
      const next = { ...(pushBetFreezeUntil.value || {}) };
      delete next[seatNum];
      pushBetFreezeUntil.value = next;
    }
    syncDisplayFromServer();
  }, PUSH_BET_ANIMATION_MS);

  const startX = startRect.left + (startRect.width || 0) / 2;
  const startY = startRect.top + (startRect.height || 0) / 2;
  const delta = typeof payload?.delta === 'number' ? payload.delta : 0;

  await nextTick();
  try {
    chipAnimationEl.value?.animateChipsToCenter?.(
      [{ x: startX, y: startY, amount: Math.max(1, delta) }],
      { x: end.x, y: end.y },
      { durationMs: PUSH_BET_ANIMATION_MS },
    );
  } catch (e) {
    console.warn('Push bet animation failed:', { seatNum, message: e?.message });
  }
}

// Keep display state in sync during normal play (not animating)
watch(
  () => [potSize.value, currentGame.value?.seats, currentGame.value?.meta?.maxPlayers],
  () => syncDisplayFromServer(),
  { immediate: true },
);

function getSeatBetPositionPx(seatNum) {
  const container = tableEl.value;
  if (!container) return null;

  // Prefer the real DOM position of the bet chip badge (most accurate).
  const chipEl = container.querySelector?.(`.bet-chip-badge[data-seat-number="${seatNum}"]`);
  if (chipEl && typeof chipEl.getBoundingClientRect === 'function') {
    const r = chipEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // Fallback: aim relative to the avatar based on the seat's position tag.
  const avatarEl = container.querySelector?.(`.avatar-circle[data-seat-number="${seatNum}"]`);
  if (!avatarEl || typeof avatarEl.getBoundingClientRect !== 'function') return null;
  const ar = avatarEl.getBoundingClientRect();
  const base = { x: ar.left + ar.width / 2, y: ar.top + ar.height / 2 };

  const seatInfo = visibleSeats.value.find((s) => s.actualSeatNum === seatNum);
  const pos = seatInfo?.position || 'bottom';
  const d = 48;
  if (pos === 'top') return { x: base.x, y: base.y + d };
  if (pos === 'left') return { x: base.x + d, y: base.y };
  if (pos === 'right') return { x: base.x - d, y: base.y };
  return { x: base.x, y: base.y - d };
}

function getSeatBetTargetPxFromStartRect(seatNum, startRect) {
  const seatInfo = visibleSeats.value.find((s) => s.actualSeatNum === seatNum);
  const pos = seatInfo?.position || 'bottom';
  const startX = startRect.left + (startRect.width || 0) / 2;
  const startY = startRect.top + (startRect.height || 0) / 2;
  const d = 48;
  if (pos === 'top') return { x: startX, y: startY + d };
  if (pos === 'left') return { x: startX + d, y: startY };
  if (pos === 'right') return { x: startX - d, y: startY };
  return { x: startX, y: startY - d };
}

function getPotCenterPx() {
  const container = tableEl.value;
  if (!container) {
    return { x: window.innerWidth / 2, y: window.innerHeight * 0.4 };
  }

  const containerRect = container.getBoundingClientRect();

  // potRef can be either a component instance (PotDisplay) or a DOM element.
  const potEl = potRef.value?.$el ?? potRef.value;
  if (potEl && typeof potEl.getBoundingClientRect === 'function') {
    const potRect = potEl.getBoundingClientRect();

    // Compute relative-to-container target, then convert back to absolute.
    // This matches the mental model of "aim inside the pot", regardless of screen size.
    const targetXRel = (potRect.left - containerRect.left) + (potRect.width / 2);
    const targetYRel = (potRect.top - containerRect.top) + (potRect.height / 2);

    return {
      x: containerRect.left + targetXRel,
      y: containerRect.top + targetYRel,
    };
  }

  // Fallback: approximate center of table if pot DOM isn't available yet.
  return {
    x: containerRect.left + (containerRect.width * 0.5),
    y: containerRect.top + (containerRect.height * 0.5),
  };
}

async function startGatherAnimation(trigger) {
  if (isGatherAnimating.value) return;

  // Snapshot the currently displayed bets (so they don't change mid-flight)
  const betsSnapshot = { ...(displayBetsBySeat.value || {}) };
  const betSeatNums = Object.keys(betsSnapshot)
    .map((k) => parseInt(k, 10))
    .filter((n) => Number.isInteger(n) && (betsSnapshot[n] || 0) > 0);

  // Nothing to gather: just ensure display matches server and exit.
  if (betSeatNums.length === 0) {
    syncDisplayFromServer();
    return;
  }

  isGatherAnimating.value = true;
  const potCenter = getPotCenterPx();

  // Fire visual chip flight (best-effort; no hard dependency)
  await nextTick();
  try {
    const sources = betSeatNums
      .map((seatNum) => {
        const pos = getSeatBetPositionPx(seatNum);
        if (!pos) return null;
        return {
          x: pos.x,
          y: pos.y,
          amount: betsSnapshot[seatNum] || 0,
        };
      })
      .filter(Boolean);

    chipAnimationEl.value?.animateChipsToCenter?.(sources, potCenter, { durationMs: GATHER_ANIMATION_MS });
  } catch (e) {
    console.warn('Chip gather animation failed:', { trigger, message: e?.message });
  }

  // After animation ends, update the pot number to include gathered bets and clear bet chips.
  setTimeout(() => {
    displayPot.value = potSize.value || 0;
    const cleared = { ...(displayBetsBySeat.value || {}) };
    Object.keys(cleared).forEach((k) => {
      cleared[k] = 0;
    });
    displayBetsBySeat.value = cleared;

    isGatherAnimating.value = false;
    syncDisplayFromServer();
  }, GATHER_ANIMATION_MS);
}

// UI Reset System - provide key that increments on hand changes
const uiResetKey = ref(0);
provide('uiResetKey', uiResetKey);

// Watch for new hand to trigger UI reset
watch(() => currentGame.value?.handNumber, (newHand, oldHand) => {
  if (oldHand !== undefined && newHand !== oldHand) {
    uiResetKey.value++; // Trigger reset in child components
  }
});

// Winner reveal UI state (default is muck)
const dismissedWinByFoldPrompt = ref(false);
watch(() => currentGame.value?.handNumber, () => {
  dismissedWinByFoldPrompt.value = false;
});

// Win-by-fold decision countdown (backend enforces 5s timeout)
const WIN_BY_FOLD_DECISION_MS = 5000;
const winByFoldEndAtMs = ref(null);
const winByFoldNowMs = ref(Date.now());
const winByFoldInterval = ref(null);

const winByFoldRemainingMs = computed(() => {
  if (!winByFoldEndAtMs.value) return 0;
  return Math.max(0, winByFoldEndAtMs.value - winByFoldNowMs.value);
});

const winByFoldSecondsLeft = computed(() => Math.max(0, Math.ceil(winByFoldRemainingMs.value / 1000)));
const winByFoldProgress = computed(() => {
  if (!winByFoldEndAtMs.value) return 0;
  return Math.max(0, Math.min(1, winByFoldRemainingMs.value / WIN_BY_FOLD_DECISION_MS));
});

const isWinByFoldDecisionExpired = computed(() => winByFoldRemainingMs.value <= 0);

const stopWinByFoldTimer = () => {
  if (winByFoldInterval.value) {
    clearInterval(winByFoldInterval.value);
    winByFoldInterval.value = null;
  }
  winByFoldEndAtMs.value = null;
};

const myUserId = computed(() => authStore.user?.uid);
const isWinByFold = computed(() => currentGame.value?.table?.stage === 'win_by_fold');
const lastHandWinnerId = computed(() => currentGame.value?.table?.lastHand?.winnerId);
const hasMyHoleCards = computed(() => (myHoleCards.value?.length || 0) >= 2);

const showWinByFoldPrompt = computed(() => {
  if (!isWinByFold.value) return false;
  if (!myUserId.value) return false;
  if (lastHandWinnerId.value !== myUserId.value) return false;
  if (alreadyRevealedMine.value) return false;
  if (dismissedWinByFoldPrompt.value) return false;
  // Must be seated to have private cards
  return mySeatNumber.value !== null;
});

watch(showWinByFoldPrompt, (show) => {
  if (!show) {
    stopWinByFoldTimer();
    return;
  }

  stopWinByFoldTimer();
  winByFoldNowMs.value = Date.now();
  winByFoldEndAtMs.value = winByFoldNowMs.value + WIN_BY_FOLD_DECISION_MS;
  winByFoldInterval.value = setInterval(() => {
    winByFoldNowMs.value = Date.now();
    if (winByFoldRemainingMs.value <= 0) {
      // Backend will auto-muck and start next hand; dismiss the UI locally.
      handleMuck();
      stopWinByFoldTimer();
    }
  }, 100);
});

watch(
  () => [currentGame.value?.table?.stage, currentGame.value?.table?.lastHand?.voluntaryShowExpired],
  ([stage, expired]) => {
    if (stage !== 'win_by_fold') {
      stopWinByFoldTimer();
      return;
    }
    if (expired) {
      handleMuck();
      stopWinByFoldTimer();
    }
  },
);

const handleVoluntaryShow = async () => {
  try {
    if (!currentGame.value?.id) return;
    await showCards(currentGame.value.id);
    dismissedWinByFoldPrompt.value = true;
    stopWinByFoldTimer();
  } catch (e) {
    console.error('Failed to show cards:', e);
  }
};

const handleMuck = () => {
  dismissedWinByFoldPrompt.value = true;
  stopWinByFoldTimer();
};

onUnmounted(() => {
  stopWinByFoldTimer();
});

// Watch for game start (waiting -> playing) to trigger UI reset
watch(() => currentGame.value?.status, (newStatus, oldStatus) => {
  if (oldStatus === 'waiting' && newStatus === 'playing') {
    uiResetKey.value++; // Trigger reset in child components
  }
});

// Chip gathering triggers:
// A) When stage changes OR communityCards length increases
// B) When handResult becomes available (instant showdown)
watch(
  () => currentGame.value?.table?.stage,
  (newStage, oldStage) => {
    if (!newStage || newStage === oldStage) return;
    startGatherAnimation('stage');
  },
);

watch(
  () => communityCards.value?.length || 0,
  (newLen, oldLen) => {
    if (newLen <= oldLen) return;
    startGatherAnimation('communityCards');
  },
);

watch(
  () => currentGame.value?.table?.handResult,
  (newResult, oldResult) => {
    if (!newResult || newResult === oldResult) return;
    startGatherAnimation('handResult');
  },
);

// Buy-in modal state
const showBuyInModalDialog = ref(false);
const buyInAmount = ref(String(DEFAULT_BUY_IN));
const selectedSeatNumber = ref(null);

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

// SECURITY: whether my cards have been revealed to everyone.
// Backend reveals by writing to PUBLIC `seats[mySeat].holeCards`.
const alreadyRevealedMine = computed(() => {
  if (!myUserId.value) return false;
  if (mySeatNumber.value === null) return false;
  const seat = seats.value?.[mySeatNumber.value];
  return Array.isArray(seat?.holeCards) && seat.holeCards.length > 0;
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
      const seatStyle = getSeatStyle(displayPos, maxSeats.value);
      const position = getSeatPositionTag(displayPos, maxSeats.value);
      
      visible.push({
        actualSeatNum: i,
        displayPosition: displayPos,
        seat: seat,
        position,
        seatStyle: {
          position: 'absolute',
          zIndex: 10,
          ...seatStyle,
        },
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

const showBuyInModal = (seatNumber) => {
  selectedSeatNumber.value = seatNumber;
  buyInAmount.value = String(DEFAULT_BUY_IN); // Reset to default
  showBuyInModalDialog.value = true;
};

const handleBuyInConfirm = async () => {
  const amount = parseInt(buyInAmount.value);
  if (isNaN(amount) || amount <= 0) {
    showError('Please enter a valid buy-in amount');
    return;
  }
  
  showBuyInModalDialog.value = false;
  await handleJoinSeat(selectedSeatNumber.value, amount);
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

const handleFold = () => {
  fold();
};

const handleCheck = () => {
  check();
};

const handleCall = () => {
  call();
};

const handleRaise = (amount) => {
  raise(amount);
};

const handleAllIn = () => {
  allIn();
};

const handleAutoAction = (action) => {
  if (action === 'check') {
    check();
  } else if (action === 'fold') {
    fold();
  }
};
</script>

<style scoped>
.poker-table-container {
  width: 100%;
  height: 100%;
  position: relative;
  background: linear-gradient(135deg, #0d1b2a 0%, #1b263b 50%, #0d1b2a 100%);
  /* Allow side seats/chips to render without clipping */
  overflow: visible;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

/* Poker Table Felt - explicit vertical oval sizing */
.poker-table-felt {
  position: relative;
  width: 90vw;
  height: 65vh;
  max-width: 520px;
  max-height: 620px;
  margin: 60px auto 0 auto;
  background: radial-gradient(ellipse at center, #1a5c3a 0%, #0f3d26 50%, #0a2818 100%);
  border: 12px solid #8b6914;
  border-radius: 50%;
  box-shadow:
    inset 0 0 60px rgba(0, 0, 0, 0.8),
    inset 0 -15px 30px rgba(0, 0, 0, 0.4),
    0 10px 40px rgba(0, 0, 0, 0.9),
    0 0 0 3px #654321,
    0 0 0 6px #3d2817;
  z-index: 0;
  pointer-events: auto;
}

.win-by-fold-prompt {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  justify-content: center;
  align-items: center;
  pointer-events: auto;
}

.win-by-fold-timer {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: center;
}

.win-by-fold-countdown {
  color: white;
  font-weight: bold;
  min-width: 40px;
  text-align: right;
}

.win-by-fold-progress {
  width: 140px;
  height: 10px;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  overflow: hidden;
}

.win-by-fold-progress-bar {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  transform-origin: left;
  transition: transform 0.1s linear;
}

.poker-table-felt::after {
  content: '';
  position: absolute;
  top: 15px;
  left: 15px;
  right: 15px;
  bottom: 15px;
  border-radius: 50%;
  background: radial-gradient(ellipse at 30% 30%, rgba(255, 255, 255, 0.05) 0%, transparent 50%);
  pointer-events: none;
}

.community-cards-area {
  position: absolute;
  top: 45%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  z-index: 5;
  pointer-events: none;
}

.action-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  /* Prevent the felt from showing through below the bottom UI */
  background: linear-gradient(135deg, #0d1b2a 0%, #1b263b 50%, #0d1b2a 100%);
  padding-bottom: env(safe-area-inset-bottom);
}

.start-hand-controls {
  position: absolute;
  top: 45%;
  left: 50%;
  /* Nudge upward so it sits slightly above dead-center */
  transform: translate(-50%, -50%) translateY(-40px);
  z-index: 50;
  pointer-events: auto;
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
  padding: 14px 40px;
  font-size: 18px;
}

/* Responsive Design */
@media (max-width: 768px) {
  .poker-table-felt {
    width: 90vw;
    height: 65vh;
    max-width: 440px;
    max-height: 560px;
    border-width: 10px;
  }

  .btn-primary {
    padding: 10px 24px;
    font-size: 16px;
  }

  .btn-lg {
    padding: 12px 32px;
    font-size: 16px;
  }
}

/* Buy-in Modal Styles */
.buy-in-content {
  color: white;
}

.buy-in-input {
  width: 100%;
  padding: 12px;
  background: rgba(0, 0, 0, 0.4);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: white;
  font-size: 16px;
  margin-bottom: 16px;
}

.buy-in-input:focus {
  outline: none;
  border-color: #4CAF50;
}

.modal-actions {
  display: flex;
  gap: 12px;
}

.btn-confirm {
  flex: 1;
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  color: white;
  border: none;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: bold;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-confirm:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.btn-cancel {
  flex: 1;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 12px 24px;
  font-size: 16px;
  font-weight: bold;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
}
</style>
