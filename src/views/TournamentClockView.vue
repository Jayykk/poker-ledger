<template>
  <div class="tournament-clock-view" :class="{ 'is-break': isBreak, 'time-critical': timerColorClass === 'timer-critical' && status === 'running' }">
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

    <!-- Main Clock Display -->
    <div v-else class="clock-container">
      <!-- Header -->
      <header class="clock-header">
        <div class="header-left">
          <button v-if="isHost" @click="showControls = !showControls" class="hud-control-btn">
            <i class="fas fa-cog"></i>
          </button>
          <button @click="handleBack" class="hud-control-btn">
            <i class="fas fa-arrow-left"></i>
          </button>
        </div>
        <div class="header-center">
          <h1 class="tournament-name">{{ config.name || 'Tournament' }}</h1>
          <p class="tournament-subtitle" :class="{ 'registration-closed': isRegistrationClosed }">
            <template v-if="isRegistrationClosed">{{ $t('tournament.registrationClosed') }}</template>
            <template v-else>{{ config.subtitle || `BuyIn $${config.buyIn} | ${$t('tournament.reentryUntil', { level: config.reentryUntilLevel })}` }}</template>
          </p>
        </div>
        <div class="header-right">
          <button v-if="isHost" @click="handleToggleDealerMode" class="hud-control-btn" :class="{ 'dealer-active': dealerModeEnabled }" :title="$t('tournament.dealerMode')">
            <i class="fas fa-user-shield"></i>
          </button>
          <button v-if="isHost" @click="showTimeBankFromClock" class="hud-control-btn" :title="$t('timeBank.title')">
            <i class="fas fa-hourglass-half"></i>
          </button>
        </div>
      </header>

      <!-- Body: 3-column layout -->
      <div class="clock-body">
        <!-- Left Panel -->
        <aside class="info-panel left-panel">
          <div class="info-item">
            <div class="info-label">{{ $t('tournament.entries') }}</div>
            <div class="info-value">{{ entries }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">{{ $t('tournament.playersLeft') }}</div>
            <div class="info-value">{{ playersRemaining }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">{{ $t('tournament.totalPlayers') }}</div>
            <div class="info-value">{{ playersRegistered }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">{{ $t('tournament.chipsInPlay') }}</div>
            <div class="info-value">{{ formatNumber(chipsInPlay) }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">{{ $t('tournament.averageStack') }}</div>
            <div class="info-value">{{ formatNumber(averageStack) }}<span v-if="averageStackBB" class="avg-bb"> ({{ averageStackBB }} BB)</span></div>
          </div>
          <div class="info-item" v-if="timeToBreak">
            <div class="info-label">{{ $t('tournament.breakIn') }}</div>
            <div class="info-value">{{ timeToBreak }}</div>
          </div>
        </aside>

        <!-- Center: Main Clock -->
        <main class="clock-center">
          <!-- Level indicator -->
          <div class="level-indicator">
            <template v-if="isBreak">
              <span class="level-text break-text">☕ {{ $t('tournament.breakTime') }}</span>
            </template>
            <template v-else>
              <span class="level-text">{{ $t('tournament.level') }} {{ currentLevel }}</span>
            </template>
          </div>

          <!-- Blinds display -->
          <div class="blinds-display" v-if="!isBreak">
            <span class="blinds-value">{{ formatNumber(currentBlinds.small) }} / {{ formatNumber(currentBlinds.big) }}<span v-if="currentBlinds.ante" class="ante-value"> ({{ formatNumber(currentBlinds.ante) }})</span></span>
          </div>

          <!-- Timer -->
          <div class="timer-display" :class="timerColorClass">
            {{ formattedTime }}
          </div>

          <!-- Status badge -->
          <div v-if="status === 'waiting'" class="status-badge waiting">
            {{ $t('tournament.waitingToStart') }}
          </div>
          <div v-else-if="status === 'paused'" class="status-badge paused">
            <i class="fas fa-pause mr-2"></i>{{ $t('tournament.paused') }}
          </div>
          <div v-else-if="status === 'ended'" class="status-badge ended">
            {{ $t('tournament.ended') }}
          </div>

          <!-- Next blinds -->
          <div class="next-blinds" v-if="nextPlayLevelEntry && !isBreak">
            {{ $t('tournament.nextBlinds') }}: {{ formatNumber(nextPlayLevelEntry.small) }} / {{ formatNumber(nextPlayLevelEntry.big) }}
            <span v-if="nextPlayLevelEntry.ante"> ({{ $t('tournament.ante') }} {{ formatNumber(nextPlayLevelEntry.ante) }})</span>
          </div>
          <div class="next-blinds" v-else-if="isBreak && nextPlayLevelEntry">
            {{ $t('tournament.nextLevel') }}: {{ formatNumber(nextPlayLevelEntry.small) }} / {{ formatNumber(nextPlayLevelEntry.big) }}
          </div>
        </main>

        <!-- Right Panel -->
        <aside class="info-panel right-panel">
          <div class="info-item">
            <div class="info-label">{{ $t('tournament.prizePool') }}</div>
            <div class="info-value prize">${{ formatNumber(prizePool) }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">{{ $t('tournament.payouts') }}</div>
            <div class="payout-list">
              <div v-for="p in payouts" :key="p.place" class="payout-row">
                <span class="payout-place">{{ p.place }}.</span>
                <span class="payout-amount">${{ formatNumber(p.amount) }}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <!-- Host Controls Overlay -->
      <TournamentControls
        v-if="isHost && showControls"
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
        @end="handleEnd"
        @close="showControls = false"
      />
    </div>

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

    <!-- Audio element for alerts -->
    <audio ref="audioRef" preload="auto"></audio>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useTournamentClock } from '../composables/useTournamentClock.js';
import { useNotification } from '../composables/useNotification.js';
import { useWakeLock } from '../composables/useWakeLock.js';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import TournamentControls from '../components/tournament/TournamentControls.vue';
import {
  TIMER_WARNING_THRESHOLD, TIMER_DANGER_THRESHOLD, TIMER_CRITICAL_THRESHOLD,
} from '../utils/constants.js';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { error: showError, success } = useNotification();

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
  isRegistrationClosed, prizePool, payouts,
  formattedTime, timeToBreak, dealerModeEnabled,
  joinSession, startClock, pauseClock, advanceLevel, previousLevel,
  updatePlayers, endTournament, toggleDealerMode, cleanup,
} = useTournamentClock();

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

function handleBack() {
  // If there's a linked game room, go back to tournament game view; otherwise go to lobby
  const gameId = session.value?.gameId;
  if (gameId) {
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

function showTimeBankFromClock() {
  // Open time bank in a new window/tab so clock keeps running
  const url = router.resolve('/time-bank/new').href;
  window.open(url, '_blank');
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

function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'warning') {
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'levelUp') {
      osc.frequency.value = 1200;
      gain.gain.value = 0.2;
      osc.start();
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.value = 1600;
        gain2.gain.value = 0.2;
        osc2.start();
        osc2.stop(ctx.currentTime + 0.2);
      }, 150);
      osc.stop(ctx.currentTime + 0.15);
    }
  } catch {
    // Audio not available
  }
}

// Request fullscreen on mount (optional)
function requestFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
}

onMounted(() => {
  const id = route.params.sessionId;
  if (id) {
    joinSession(id);
  }
});

onUnmounted(() => {
  cleanup();
});
</script>

<style scoped>
.tournament-clock-view {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%);
  color: white;
  font-family: 'Inter', system-ui, sans-serif;
  overflow: hidden;
}

.tournament-clock-view.is-break {
  background: linear-gradient(135deg, #064e3b 0%, #065f46 50%, #064e3b 100%);
}

.tournament-clock-view.time-critical {
  animation: borderPulse 1s ease-in-out infinite;
}

@keyframes borderPulse {
  0%, 100% { box-shadow: inset 0 0 30px rgba(239, 68, 68, 0); }
  50% { box-shadow: inset 0 0 30px rgba(239, 68, 68, 0.3); }
}

.clock-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
}

/* Header */
.clock-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  background: rgba(0, 0, 0, 0.4);
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
}

.header-left, .header-right {
  display: flex;
  gap: 0.5rem;
  min-width: 80px;
}

.header-right {
  justify-content: flex-end;
}

.header-center {
  text-align: center;
  flex: 1;
}

.tournament-name {
  font-size: clamp(1.5rem, 4vw, 3rem);
  font-weight: 800;
  letter-spacing: 0.02em;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.tournament-subtitle {
  font-size: clamp(0.85rem, 1.8vw, 1.2rem);
  color: rgba(255, 255, 255, 0.7);
  margin-top: 0.25rem;
}

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
}

.hud-control-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.hud-control-btn.dealer-active {
  background: rgba(245, 158, 11, 0.3);
  border-color: #f59e0b;
  color: #fbbf24;
}

/* Body */
.clock-body {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  gap: 1rem;
  padding: 1rem 1.5rem;
  min-height: 0;
}

/* Info Panels */
.info-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1.5rem;
}

.info-item {
  text-align: center;
}

.info-label {
  font-size: clamp(0.85rem, 1.5vw, 1.1rem);
  font-weight: 700;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.8);
  letter-spacing: 0.05em;
  margin-bottom: 0.25rem;
}

.info-value {
  font-size: clamp(1.15rem, 2.2vw, 1.6rem);
  font-weight: 600;
  color: white;
}

.info-value.prize {
  color: #fbbf24;
  font-size: clamp(1.4rem, 2.8vw, 2.2rem);
  font-weight: 800;
}

.payout-list {
  margin-top: 0.5rem;
}

.payout-row {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  font-size: clamp(0.9rem, 1.6vw, 1.2rem);
  padding: 0.15rem 0;
}

.payout-place {
  color: rgba(255, 255, 255, 0.6);
  min-width: 1.5em;
  text-align: right;
}

.payout-amount {
  font-weight: 600;
}

/* Center */
.clock-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.level-indicator {
  margin-bottom: 0.5rem;
}

.level-text {
  font-size: clamp(1.15rem, 2.2vw, 1.6rem);
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.break-text {
  color: #6ee7b7;
  font-size: clamp(1.4rem, 2.8vw, 2rem);
}

.blinds-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.blinds-value {
  font-size: clamp(2.8rem, 7vw, 5.5rem);
  font-weight: 800;
  color: white;
  text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.5);
}

.ante-value {
  font-size: clamp(1.6rem, 4vw, 3rem);
  font-weight: 800;
  color: rgba(255, 255, 255, 0.85);
}

.avg-bb {
  font-size: clamp(0.75rem, 1.2vw, 1rem);
  color: rgba(255, 255, 255, 0.5);
  font-weight: 400;
}

.tournament-subtitle.registration-closed {
  background: rgba(220, 38, 38, 0.35);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.5);
  padding: 0.15rem 0.75rem;
  border-radius: 4px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.timer-display {
  font-size: clamp(4.5rem, 13vw, 11rem);
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
  line-height: 1;
  padding: 1rem 2rem;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 1rem;
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
  transition: color 0.3s;
}

.timer-warning {
  color: #fbbf24;
}

.timer-danger {
  color: #f87171;
}

.timer-critical {
  color: #ef4444;
  animation: timerPulse 0.5s ease-in-out infinite;
}

@keyframes timerPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.02); }
}

.status-badge {
  padding: 0.5rem 1.5rem;
  border-radius: 9999px;
  font-size: clamp(0.9rem, 1.8vw, 1.2rem);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.status-badge.waiting {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(251, 191, 36, 0.4);
}

.status-badge.paused {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(251, 191, 36, 0.4);
  animation: pauseBlink 2s ease-in-out infinite;
}

@keyframes pauseBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.status-badge.ended {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.4);
}

.next-blinds {
  font-size: clamp(1rem, 2.2vw, 1.5rem);
  color: rgba(255, 255, 255, 0.7);
  font-weight: 600;
  margin-top: 0.5rem;
}

/* ── Tablet & large screen responsive (≥ 769px) ─── */
@media (min-width: 769px) {
  .info-label {
    font-size: 1.7rem;
  }

  .info-value {
    font-size: 2.8rem;
  }

  .info-value.prize {
    font-size: 3.5rem;
  }

  .payout-row {
    font-size: 1.8rem;
  }

  .blinds-value {
    font-size: 4rem;
  }

  .timer-display {
    font-size: 7rem;
  }

  .level-text {
    font-size: 1.3rem;
  }

  .hud-control-btn {
    width: 48px;
    height: 48px;
    font-size: 1.2rem;
  }
}

/* ── Mobile responsive ─────────────────────────── */
@media (max-width: 768px) {
  .clock-body {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto;
    padding: 0.5rem;
    gap: 0.5rem;
  }

  .left-panel, .right-panel {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.75rem;
  }

  .info-item {
    min-width: 80px;
  }

  .blinds-value {
    font-size: 2.5rem;
  }

  .timer-display {
    font-size: 4rem;
    padding: 0.5rem 1rem;
  }
}
</style>
