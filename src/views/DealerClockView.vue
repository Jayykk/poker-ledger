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
        :is-registration-closed="isRegistrationClosed"
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
        :formatted-time="formattedTime"
        :timer-color-class="timerColorClass"
        :status="status"
        :next-play-level-entry="nextPlayLevelEntry"
        :prize-pool="prizePool"
        :payouts="payouts"
        @toggle-settings="showControls = !showControls"
        @open-time-bank="showTimeBankFromClock"
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
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase-init.js';
import { useTournamentClock } from '../composables/useTournamentClock.js';
import { useTournamentAudio } from '../composables/useTournamentAudio.js';
import { useNotification } from '../composables/useNotification.js';
import { useWakeLock } from '../composables/useWakeLock.js';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import DealerClockDisplay from '../components/tournament/DealerClockDisplay.vue';
import TournamentControls from '../components/tournament/TournamentControls.vue';
import {
  TIMER_WARNING_THRESHOLD, TIMER_DANGER_THRESHOLD, TIMER_CRITICAL_THRESHOLD,
} from '../utils/constants.js';

const route = useRoute();
const router = useRouter();
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
  isRegistrationClosed, prizePool, payouts,
  formattedTime, timeToBreak,
  joinSession, startClock, pauseClock, advanceLevel, previousLevel,
  updatePlayers, addReentry, endTournament, cleanup,
} = useTournamentClock({ dealerMode: true });

const headerSubtitleText = computed(() => {
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

function showTimeBankFromClock() {
  const url = router.resolve('/time-bank/new').href;
  window.open(url, '_blank');
}

function requestFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
}

onMounted(async () => {
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
  cleanup();
});
</script>
