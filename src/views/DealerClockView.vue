<template>
  <div>
    <!-- Auth loading -->
    <div v-if="authLoading" class="flex flex-col items-center justify-center h-screen bg-slate-900 text-white">
      <LoadingSpinner />
      <p class="mt-4 text-gray-400">{{ $t('loading.loading') }}</p>
    </div>

    <!-- Data loading -->
    <div v-else-if="loading" class="flex items-center justify-center h-screen bg-slate-900">
      <LoadingSpinner />
    </div>

    <!-- Not found -->
    <div v-else-if="!session" class="flex flex-col items-center justify-center h-screen bg-slate-900 text-white">
      <i class="fas fa-exclamation-triangle text-4xl text-amber-400 mb-4"></i>
      <p class="text-xl">{{ $t('tournament.sessionNotFound') }}</p>
    </div>

    <!-- Main Clock Display -->
    <template v-else>
      <DealerClockDisplay
        :title="config.name || 'Tournament'"
        :subtitle-text="headerSubtitleText"
        :is-registration-closed="isTimed ? isBuyInClosed : isRegistrationClosed"
        :entries="entries"
        :players-remaining="playersRemaining"
        :players-registered="playersRegistered"
        :chips-in-play="chipsInPlay"
        :average-stack="averageStack"
        :averageStackBB="averageStackBB"
        :is-break="isBreak"
        :current-level="currentLevel"
        :current-blinds="currentBlinds"
        :time-to-break="timeToBreak"
        :is-timed="isTimed"
        :time-to-end="timeToEnd || ''"
        :formatted-time="formattedTime"
        :status="status"
        :next-play-level-entry="nextPlayLevelEntry"
        :prize-pool="prizePool"
        :bounty-per-head="config?.bounty?.type === 'mystery' ? entries * bountyPerHead : bountyPerHead"
      :bounty-label="bountyLabel"
        :payouts="payouts"
        :clock-style="clockStyle"
        :levels="levels"
        :current-level-index="currentLevelIndex"
        :local-time-left="localTimeLeft"
        :level-progress="levelProgress"
        :ends-at="endsAt || ''"
        :cutoff-level="Number(config.reentryUntilLevel) || 0"
        @toggle-settings="showControls = !showControls"
        @request-fullscreen="requestFullscreen"
      />

      <!-- Host Controls Overlay (always available in dealer mode) -->
      <TournamentControls
        v-if="showControls"
        :status="status"
        :players-registered="playersRegistered"
        :players-remaining="playersRemaining"
        :reentries="reentries"
        :current-level-index="currentLevelIndex"
        :total-levels="levels.length"
        :clock-style="clockStyle"
        @set-style="setClockStyle"
        @start="startClock"
        @pause="pauseClock"
        @advance="advanceLevel"
        @previous="previousLevel"
        @update-players="handleUpdatePlayers"
        @add-reentry="addReentry"
        @end="handleEnd"
        @close="showControls = false"
      />
    </template>
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
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase-init.js';
import { useTournamentClock } from '../composables/useTournamentClock.js';
import { useMysteryStage } from '../composables/useMysteryStage.js';
import { useGameStore } from '../store/modules/game.js';
import MysteryStage from '../components/tournament/MysteryStage.vue';
import { useTournamentAudio, unlockAudio, startAudioHeartbeat, stopAudioHeartbeat } from '../composables/useTournamentAudio.js';
import { useNotification } from '../composables/useNotification.js';
import { useWakeLock } from '../composables/useWakeLock.js';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import DealerClockDisplay from '../components/tournament/DealerClockDisplay.vue';
import TournamentControls from '../components/tournament/TournamentControls.vue';
import {
  TIMER_WARNING_THRESHOLD, TIMER_DANGER_THRESHOLD, TIMER_CRITICAL_THRESHOLD,
} from '../utils/constants.js';

const route = useRoute();
const { t } = useI18n();
const { error: showError } = useNotification();
const { playSound } = useTournamentAudio();

useWakeLock();

const authLoading = ref(true);
const showControls = ref(false);
let warningPlayed = false;

const {
  session, loading, localTimeLeft,
  config, status, currentLevel, currentLevelIndex,
  currentBlinds, nextPlayLevelEntry,
  isBreak, levels, playersRegistered, playersRemaining,
  reentries, entries, chipsInPlay, averageStack, averageStackBB,
  isRegistrationClosed, prizePool, bountyPerHead, payouts,
  formattedTime, timeToBreak,
  isTimed, isBuyInClosed, timeToEnd, levelProgress, endsAt, clockStyle,
  joinSession, startClock, pauseClock, advanceLevel, previousLevel,
  updatePlayers, addReentry, endTournament, setClockStyle, setMysteryStage, setTvPresence, isHost, cleanup,
} = useTournamentClock({ dealerMode: true });

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

const headerSubtitleText = computed(() => {
  if (isTimed.value) {
    if (isBuyInClosed.value) return t('timed.clock.buyInClosed');
    return config.value.reentryUntilLevel > 0
      ? `${t('timed.clock.label')} | ${t('timed.clock.cutoff', { level: config.value.reentryUntilLevel })}`
      : t('timed.clock.label');
  }
  if (config.value.subtitle) return config.value.subtitle;

  const buyInText = config.value.buyIn ? `BuyIn $${config.value.buyIn}` : '';
  const reentryText = config.value.reentryUntilLevel
    ? t('tournament.reentryUntil', { level: config.value.reentryUntilLevel })
    : '';

  return [buyInText, reentryText].filter(Boolean).join(' | ');
});

// Timer color class
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

function formatNumber(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString();
}

function handleUpdatePlayers({ registered, remaining }) {
  updatePlayers(registered, remaining);
}

async function handleEnd() {
  await endTournament();
  showControls.value = false;
}

function requestFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
}

// Unlock AudioContext on first user interaction (dealer viewers never tap
// a control button, so we must listen on the document level).
function _handleFirstInteraction() {
  unlockAudio();
  startAudioHeartbeat();
  document.removeEventListener('click', _handleFirstInteraction, true);
  document.removeEventListener('touchstart', _handleFirstInteraction, true);
}

onMounted(async () => {
  document.addEventListener('click', _handleFirstInteraction, true);
  document.addEventListener('touchstart', _handleFirstInteraction, { capture: true, passive: true });

  const sessionId = route.params.sessionId;
  if (!sessionId) return;

  try {
    // Auto sign-in anonymously for dealer mode (bypasses LINE login requirement)
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
    authLoading.value = false;

    // Register this anonymous user as a dealer and join the session
    joinSession(sessionId);
  } catch (e) {
    authLoading.value = false;
    showError(e.message);
  }
});

onUnmounted(() => {
  stopAudioHeartbeat();
  document.removeEventListener('click', _handleFirstInteraction, true);
  document.removeEventListener('touchstart', _handleFirstInteraction, true);
  cleanup();
});
</script>
