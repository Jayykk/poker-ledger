<template>
  <div class="dealer-clock-demo-view">
    <div class="demo-controls">
      <button class="demo-chip" :class="{ active: demoMode === 'running' }" @click="demoMode = 'running'">Running</button>
      <button class="demo-chip" :class="{ active: demoMode === 'break' }" @click="demoMode = 'break'">Break</button>
      <button class="demo-chip" :class="{ active: demoMode === 'ended' }" @click="demoMode = 'ended'">Ended</button>
      <span class="demo-sep"></span>
      <button class="demo-chip" :class="{ active: demoStyle === 'classic' }" @click="demoStyle = 'classic'">Style 1</button>
      <button class="demo-chip" :class="{ active: demoStyle === 'felt' }" @click="demoStyle = 'felt'">Style 2</button>
      <span class="demo-sep"></span>
      <button class="demo-chip" :class="{ active: !demoTimed }" @click="demoTimed = false">Tournament</button>
      <button class="demo-chip" :class="{ active: demoTimed }" @click="demoTimed = true">Timed</button>
    </div>

    <DealerClockDisplay
      title="Poker Game"
      :subtitle-text="demoSubtitle"
      :is-registration-closed="true"
      :entries="demoStats.entries"
      :players-remaining="demoPlayersRemaining"
      :players-registered="demoPlayersRegistered"
      :chips-in-play="demoStats.chipsInPlay"
      :average-stack="demoStats.averageStack"
      :averageStackBB="demoStats.averageStackBB"
      :current-level="6"
      :current-blinds="demoBlinds"
      :formatted-time="demoTime"
      :status="demoStatus"
      :is-break="demoMode === 'break'"
      :time-to-break="demoTimeToBreak"
      :prize-pool="2200"
      :payouts="demoPayouts"
      :clock-style="demoStyle"
      :is-timed="demoTimed"
      :levels="demoLevels"
      :current-level-index="demoLevelIndex"
      :local-time-left="demoMode === 'ended' ? 0 : 300"
      :level-progress="demoMode === 'ended' ? 0 : 0.42"
      :next-play-level-entry="demoMode === 'ended' ? null : demoLevels[7]"
      :time-to-end="demoTimed ? '1:12:30' : ''"
      :ends-at="demoTimed && demoMode !== 'ended' ? '21:50' : ''"
      :cutoff-level="6"
      :show-settings-button="false"
      :show-time-bank-button="false"
      @request-fullscreen="requestFullscreen"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import DealerClockDisplay from '../components/tournament/DealerClockDisplay.vue';
import { buildTournamentStats } from '../utils/tournamentStats.js';

const { t } = useI18n();
const demoMode = ref('break');
const demoStyle = ref('classic');
const demoTimed = ref(false);
// Sample structure for the progress strip: 8 levels, break after level 4
const demoLevels = [
  { level: 1, small: 100, big: 200, ante: 0, duration: 20 },
  { level: 2, small: 200, big: 400, ante: 25, duration: 20 },
  { level: 3, small: 300, big: 600, ante: 50, duration: 20 },
  { level: 4, small: 400, big: 800, ante: 75, duration: 20 },
  { level: 0, small: 0, big: 0, ante: 0, duration: 10, isBreak: true },
  { level: 5, small: 500, big: 1000, ante: 100, duration: 20 },
  { level: 6, small: 1000, big: 2000, ante: 100, duration: 20 },
  { level: 7, small: 1500, big: 3000, ante: 200, duration: 20 },
  { level: 8, small: 2000, big: 4000, ante: 300, duration: 20 },
];
const demoLevelIndex = computed(() => (demoMode.value === 'break' ? 4 : 6));
const demoPlayersRegistered = 6;
const demoReentries = 5;
const demoPlayersRemaining = 3;
const demoStartingChips = 20000;

const demoBlinds = {
  small: 1000,
  big: 2000,
  ante: 100,
};

const demoPayouts = [
  { place: 1, amount: 1430 },
  { place: 2, amount: 770 },
];

const demoStats = computed(() => buildTournamentStats({
  playersRegistered: demoPlayersRegistered,
  reentries: demoReentries,
  playersRemaining: demoPlayersRemaining,
  startingChips: demoStartingChips,
  bigBlind: demoBlinds.big,
}));

const demoSubtitle = computed(() => `BuyIn $200 | ${t('tournament.reentryUntil', { level: 6 })}`);
const demoStatus = computed(() => (demoMode.value === 'ended' ? 'ended' : 'running'));
const demoTime = computed(() => {
  if (demoMode.value === 'ended') return '05:00';
  if (demoMode.value === 'break') return '10:00';
  return '05:00';
});
const demoTimeToBreak = computed(() => (demoMode.value === 'running' ? '08:00' : ''));

function requestFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
}
</script>

<style scoped>
.dealer-clock-demo-view {
  position: relative;
}

.demo-controls {
  position: fixed;
  top: 1rem;
  left: 1rem;
  z-index: 80;
  display: flex;
  gap: 0.45rem;
  padding: 0.5rem;
  border-radius: 9999px;
  background: rgba(8, 15, 30, 0.78);
  border: 1px solid rgba(226, 232, 240, 0.12);
  backdrop-filter: blur(12px);
}

.demo-chip {
  min-height: 36px;
  padding: 0.45rem 0.9rem;
  border-radius: 9999px;
  border: 1px solid rgba(226, 232, 240, 0.12);
  background: rgba(15, 23, 42, 0.5);
  color: rgba(226, 232, 240, 0.78);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.demo-sep {
  width: 1px;
  align-self: stretch;
  background: rgba(226, 232, 240, 0.18);
}

.demo-chip.active {
  background: rgba(59, 130, 246, 0.32);
  border-color: rgba(96, 165, 250, 0.45);
  color: #eff6ff;
}

@media (max-width: 768px) {
  .demo-controls {
    top: 0.75rem;
    left: 0.75rem;
    right: 0.75rem;
    justify-content: center;
  }

  .demo-chip {
    flex: 1;
    min-width: 0;
  }
}
</style>