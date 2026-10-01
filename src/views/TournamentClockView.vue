<template>
  <div class="tournament-clock-view" :class="clockStyle === 'felt' ? 'style-felt' : 'style-scoreboard'">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-screen bg-slate-900">
      <LoadingSpinner />
    </div>

    <!-- Not found -->
    <div v-else-if="!session" class="flex flex-col items-center justify-center h-screen bg-slate-900 text-white">
      <i class="fas fa-exclamation-triangle text-4xl text-amber-400 mb-4"></i>
      <p class="text-xl">{{ $t('tournament.sessionNotFound') }}</p>
      <button @click="$router.push('/lobby')" class="mt-4 px-6 py-2 bg-amber-600 rounded-lg">
        {{ $t('common.back') }}
      </button>
    </div>

    <!-- Style 2: felt board -->
    <FeltClockBoard
      v-else-if="clockStyle === 'felt'"
      :name="config.name || 'Tournament'"
      :custom-subtitle="config.subtitle || ''"
      :is-timed="isTimed"
      :status="status"
      :buy-in-closed="isTimed ? isBuyInClosed : isRegistrationClosed"
      :cutoff-level="Number(config.reentryUntilLevel) || 0"
      :levels="levels"
      :current-level-index="currentLevelIndex"
      :current-level="currentLevel"
      :current-blinds="currentBlinds"
      :is-break="isBreak"
      :next-play-level-entry="nextPlayLevelEntry"
      :formatted-time="formattedTime"
      :local-time-left="localTimeLeft"
      :level-progress="levelProgress"
      :time-to-break="timeToBreak || ''"
      :time-to-end="timeToEnd || ''"
      :ends-at="endsAt || ''"
      :players-registered="playersRegistered"
      :players-remaining="playersRemaining"
      :entries="entries"
      :chips-in-play="chipsInPlay"
      :average-stack="averageStack"
      :averageStackBB="Number(averageStackBB) || 0"
      :prize-pool="prizePool"
      :bounty-per-head="config?.bounty?.type === 'mystery' ? entries * bountyPerHead : bountyPerHead"
      :bounty-label="bountyLabel"
      :payouts="payouts"
    >
      <template #actions-left>
        <button v-if="isHost" @click="showControls = !showControls" class="hud-control-btn felt-btn">
          <i class="fas fa-cog"></i>
        </button>
        <button @click="handleBack" class="hud-control-btn felt-btn">
          <i class="fas fa-arrow-left"></i>
        </button>
      </template>
      <template #actions-right>
        <button v-if="isHost" @click="handleToggleDealerMode" class="hud-control-btn felt-btn" :class="{ 'dealer-active': dealerModeEnabled }" :title="$t('tournament.dealerMode')">
          <i class="fas fa-user-shield"></i>
        </button>
        <button v-if="config?.bounty?.type === 'mystery' && session?.gameId && (isHost || dealerModeEnabled)" @click="setMysteryStage(true)" class="hud-control-btn felt-btn" :title="$t('mystery.openStage')">
          🎁
        </button>
      </template>
    </FeltClockBoard>

    <!-- Style 1: scoreboard -->
    <ScoreboardClockBoard
      v-else
      :name="config.name || 'Tournament'"
      :custom-subtitle="config.subtitle || ''"
      :is-timed="isTimed"
      :status="status"
      :buy-in-closed="isTimed ? isBuyInClosed : isRegistrationClosed"
      :cutoff-level="Number(config.reentryUntilLevel) || 0"
      :current-level-index="currentLevelIndex"
      :current-level="currentLevel"
      :current-blinds="currentBlinds"
      :is-break="isBreak"
      :next-play-level-entry="nextPlayLevelEntry"
      :formatted-time="formattedTime"
      :local-time-left="localTimeLeft"
      :level-progress="levelProgress"
      :time-to-break="timeToBreak || ''"
      :time-to-end="timeToEnd || ''"
      :ends-at="endsAt || ''"
      :players-registered="playersRegistered"
      :players-remaining="playersRemaining"
      :entries="entries"
      :average-stack="averageStack"
      :averageStackBB="Number(averageStackBB) || 0"
      :prize-pool="prizePool"
      :bounty-per-head="config?.bounty?.type === 'mystery' ? entries * bountyPerHead : bountyPerHead"
      :bounty-label="bountyLabel"
      :payouts="payouts"
    >
      <template #actions-left>
        <button v-if="isHost" @click="showControls = !showControls" class="hud-control-btn">
          <i class="fas fa-cog"></i>
        </button>
        <button @click="handleBack" class="hud-control-btn">
          <i class="fas fa-arrow-left"></i>
        </button>
      </template>
      <template #actions-right>
        <button v-if="isHost" @click="handleToggleDealerMode" class="hud-control-btn" :class="{ 'dealer-active': dealerModeEnabled }" :title="$t('tournament.dealerMode')">
          <i class="fas fa-user-shield"></i>
        </button>
        <button v-if="config?.bounty?.type === 'mystery' && session?.gameId && (isHost || dealerModeEnabled)" @click="setMysteryStage(true)" class="hud-control-btn" :title="$t('mystery.openStage')">
          🎁
        </button>
      </template>
    </ScoreboardClockBoard>

    <!-- Host Controls Overlay -->
    <TournamentControls
      v-if="session && isHost && showControls"
      :status="status"
      :players-registered="playersRegistered"
      :players-remaining="playersRemaining"
      :reentries="reentries"
      :current-level-index="currentLevelIndex"
      :total-levels="levels.length"
      :clock-style="clockStyle"
      @start="startClock"
      @pause="pauseClock"
      @advance="advanceLevel"
      @previous="previousLevel"
      @update-players="handleUpdatePlayers"
      @end="handleEnd"
      @set-style="setClockStyle"
      @close="showControls = false"
    />

    <!-- Dealer URL Modal -->
    <div v-if="showDealerUrlModal" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" @click.self="showDealerUrlModal = false">
      <div class="bg-slate-800 border border-slate-600 rounded-xl p-5 mx-4 max-w-sm w-full shadow-2xl">
        <h3 class="text-white font-bold text-sm mb-3">
          <i class="fas fa-user-shield text-amber-400 mr-1"></i>{{ $t('tournament.dealerMode') }}
        </h3>
        <p class="text-gray-400 text-xs mb-3">{{ $t('tournament.dealerUrlHint') }}</p>
        <div
          class="bg-slate-900 border border-slate-600 rounded-lg p-3 text-emerald-400 text-xs font-mono break-all select-all cursor-text"
          @click="selectAllText"
        >
          {{ dealerUrlText }}
        </div>
        <div class="flex gap-2 mt-4">
          <button @click="copyDealerUrlToClipboard" class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-sm font-semibold transition">
            <i class="fas fa-copy mr-1"></i>{{ $t('common.copy') }}
          </button>
          <button @click="showDealerUrlModal = false" class="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm font-semibold transition">
            {{ $t('common.close') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Mystery bounty: TV draw stage — reveals every new draw (from any
         device) and, when opened with 🎁, lets players draw from their phones -->
    <MysteryStage
      v-if="showStage"
      :game="stageGame"
      :current="stageCurrent"
      :can-control="canControlStage"
      :subtitle="stageSubtitle"
      @done="onStageDone"
      @close="setMysteryStage(false)"
      @draw="onStageDraw"
    />

    <!-- Audio element for alerts -->
    <audio ref="audioRef" preload="auto"></audio>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useTournamentClock } from '../composables/useTournamentClock.js';
import { useMysteryStage } from '../composables/useMysteryStage.js';
import MysteryStage from '../components/tournament/MysteryStage.vue';
import { useTournamentAudio, unlockAudio, startAudioHeartbeat, stopAudioHeartbeat } from '../composables/useTournamentAudio.js';
import { useNotification } from '../composables/useNotification.js';
import { useWakeLock } from '../composables/useWakeLock.js';
import { useGameStore } from '../store/modules/game.js';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import TournamentControls from '../components/tournament/TournamentControls.vue';
import FeltClockBoard from '../components/tournament/FeltClockBoard.vue';
import ScoreboardClockBoard from '../components/tournament/ScoreboardClockBoard.vue';
import {
  TIMER_WARNING_THRESHOLD, TIMER_DANGER_THRESHOLD, TIMER_CRITICAL_THRESHOLD,
} from '../utils/constants.js';

const route = useRoute();
const router = useRouter();
const gameStore = useGameStore();
const { t } = useI18n();
const { error: showError, success } = useNotification();
const { playSound } = useTournamentAudio();

useWakeLock();

const showControls = ref(false);
const audioRef = ref(null);
const showDealerUrlModal = ref(false);
const dealerUrlText = ref('');
let warningPlayed = false;

const {
  session, loading, localTimeLeft,
  isHost, config, status, currentLevel, currentLevelIndex,
  currentLevelEntry, currentBlinds, nextPlayLevelEntry,
  isBreak, levels, playersRegistered, playersRemaining,
  reentries, entries, chipsInPlay, averageStack, averageStackBB,
  isRegistrationClosed, prizePool, bountyPerHead, payouts,
  formattedTime, timeToBreak, dealerModeEnabled,
  isTimed, isBuyInClosed, timeToEnd, levelProgress, endsAt, clockStyle,
  joinSession, startClock, pauseClock, advanceLevel, previousLevel,
  updatePlayers, endTournament, toggleDealerMode, setClockStyle, setMysteryStage, setTvPresence, cleanup,
} = useTournamentClock();

// ── Mystery bounty TV stage ─────────────────────────
const stageGameId = computed(() => (config.value?.bounty?.type === 'mystery' ? session.value?.gameId || null : null));
const {
  game: stageGame, current: stageCurrent, next: stageNext, markDrawn: stageMarkDrawn, pendingCount: stagePending,
} = useMysteryStage(stageGameId);
const stageOpen = computed(() => session.value?.state?.mysteryStage?.open === true);
// Open with 🎁, or on its own while a draw is being revealed (8 s, then back)
const showStage = computed(() => !!stageGameId.value && !!stageGame.value && (stageOpen.value || !!stageCurrent.value));
const canControlStage = computed(() => isHost.value || session.value?.dealerModeEnabled === true);
const stageSubtitle = computed(() => [
  config.value?.name,
  isBreak.value ? t('tournament.breakTime') : `Level ${currentLevel.value}`,
  status.value === 'paused' ? t('clockFace.paused') : '',
].filter(Boolean).join(' · '));
const onStageDone = () => {
  stageNext();
  // Everyone's drawn: back to the clock (🎁 opens the stage again)
  if (canControlStage.value && stageOpen.value && !stageCurrent.value && !stagePending.value) {
    setMysteryStage(false).catch(() => {});
  }
};
const gameStoreForStage = useGameStore();

// Mystery: tell the players' phones the clock is on the TV (every 30 s)
let tvTimer = null;
watch(stageGameId, (id) => {
  clearInterval(tvTimer);
  tvTimer = null;
  if (!id) return;
  const ping = () => setTvPresence(true).catch(() => {});
  ping();
  tvTimer = setInterval(ping, 30 * 1000);
}, { immediate: true });
onUnmounted(() => {
  clearInterval(tvTimer);
  if (stageGameId.value) setTvPresence(false).catch(() => {});
});

async function onStageDraw(ticket, slot) {
  const ok = await gameStoreForStage.mysteryDraw(ticket.id, slot, stageGameId.value);
  if (ok) stageMarkDrawn(ticket.id, slot); // reveal now, don't wait for the listener
  else console.warn('Stage draw failed:', gameStoreForStage.error);
  return ok;
}


// Bounty pill on the clock faces: KO / PKO head, or the mystery pool
const bountyLabel = computed(() => ({ pko: '🎯 PKO', mystery: `🎁 ${t('mystery.short')}` }[config.value?.bounty?.type] || '🎯 KO'));

// Unlock audio on first interaction to prevent iOS blocking
function _handleFirstInteraction() {
  unlockAudio();
  startAudioHeartbeat();
  document.removeEventListener('click', _handleFirstInteraction, true);
  document.removeEventListener('touchstart', _handleFirstInteraction, true);
}

// Warning sound in the final seconds (the faces colour the timer themselves)
const timerColorClass = ref('');
watch(localTimeLeft, (val) => {
  if (status.value !== 'running') {
    timerColorClass.value = '';
    return;
  }
  if (val <= TIMER_CRITICAL_THRESHOLD) {
    timerColorClass.value = 'timer-critical';
    if (!warningPlayed) {
      playSound('warning');
      warningPlayed = true;
    }
  } else if (val <= TIMER_DANGER_THRESHOLD) {
    timerColorClass.value = 'timer-danger';
    warningPlayed = false;
  } else if (val <= TIMER_WARNING_THRESHOLD) {
    timerColorClass.value = 'timer-warning';
    warningPlayed = false;
  } else {
    timerColorClass.value = '';
    warningPlayed = false;
  }
});

// Play sound on level change
watch(currentLevelIndex, () => {
  playSound('levelUp');
});

// Timed game: chime when time is up
watch(status, (val, prev) => {
  if (isTimed.value && val === 'ended' && prev === 'running') playSound('levelUp');
});

function handleBack() {
  // If there's a linked game room, go back to tournament game view; otherwise go to lobby
  const gameId = session.value?.gameId;
  if (gameId && isTimed.value) {
    // Timed game: the room is a cash-ledger game (GameView). Only go there if
    // it's the room this device already has open.
    router.push(gameStore.game?.id === gameId ? '/game' : '/lobby');
  } else if (gameId) {
    router.push('/tournament-game');
  } else {
    router.push('/lobby');
  }
}

function handleUpdatePlayers({ registered, remaining }) {
  updatePlayers(registered, remaining);
}

async function handleEnd() {
  await endTournament();
  showControls.value = false;
}

async function handleToggleDealerMode() {
  const newState = !dealerModeEnabled.value;
  await toggleDealerMode(newState);
  if (newState) {
    copyDealerUrl();
  }
}

async function copyDealerUrl() {
  const baseUrl = window.location.origin + window.location.pathname;
  const dealerUrl = `${baseUrl}#/dealer-clock/${session.value?.id || route.params.sessionId}`;
  dealerUrlText.value = dealerUrl;
  // Try clipboard first — if it succeeds, no modal needed
  try {
    await navigator.clipboard.writeText(dealerUrl);
    success(t('common.copySuccess'));
  } catch {
    // Clipboard unavailable (LIFF / non-secure context) — show modal for manual copy
    showDealerUrlModal.value = true;
  }
}

function copyDealerUrlToClipboard() {
  navigator.clipboard.writeText(dealerUrlText.value).then(() => {
    success(t('common.copySuccess'));
    showDealerUrlModal.value = false;
  }).catch(() => {
    // Clipboard blocked (LIFF / non-secure context) — URL remains visible for manual copy
    showError(t('common.copyFailed'));
  });
}

function selectAllText(e) {
  const range = document.createRange();
  range.selectNodeContents(e.target);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// Request fullscreen on mount (optional)
function requestFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
}

onMounted(() => {
  document.addEventListener('click', _handleFirstInteraction, true);
  document.addEventListener('touchstart', _handleFirstInteraction, { capture: true, passive: true });

  const id = route.params.sessionId;
  if (id) {
    joinSession(id);
  }
});

onUnmounted(() => {
  stopAudioHeartbeat();
  document.removeEventListener('click', _handleFirstInteraction, true);
  document.removeEventListener('touchstart', _handleFirstInteraction, true);
  cleanup();
});
</script>

<style scoped>
/* Full-screen host clock; the face itself (ScoreboardClockBoard /
   FeltClockBoard) paints everything inside. */
.tournament-clock-view {
  position: fixed;
  inset: 0;
  z-index: 50;
  color: white;
  overflow: hidden;
  background: #0a1425;
}
.tournament-clock-view.style-felt { background: #0a2119; }

/* Header action buttons passed into the face's slots */
.hud-control-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}
.hud-control-btn:hover { background: rgba(255, 255, 255, 0.2); }
.hud-control-btn.dealer-active {
  background: rgba(245, 158, 11, 0.3);
  border-color: #f59e0b;
  color: #fbbf24;
}
.hud-control-btn.felt-btn {
  background: rgba(10, 33, 25, 0.6);
  border-color: rgba(207, 174, 106, 0.45);
  color: #f3ecdd;
}
.hud-control-btn.felt-btn:hover { background: rgba(207, 174, 106, 0.2); }

@media (min-width: 769px) {
  .hud-control-btn { width: 48px; height: 48px; font-size: 1.2rem; }
}
</style>
