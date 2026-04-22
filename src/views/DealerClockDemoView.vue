<template>
  <div class="dealer-clock-demo-view">
    <div class="demo-controls">
      <button class="demo-chip" :class="{ active: demoMode === 'running' }" @click="demoMode = 'running'">Running</button>
      <button class="demo-chip" :class="{ active: demoMode === 'break' }" @click="demoMode = 'break'">Break</button>
      <button class="demo-chip" :class="{ active: demoMode === 'ended' }" @click="demoMode = 'ended'">Ended</button>
    </div>

    <DealerClockDisplay
      title="Poker Game"
      :subtitle-text="demoSubtitle"
      :is-registration-closed="true"
      :entries="11"
      :players-remaining="3"
      :players-registered="6"
      :chips-in-play="220000"
      :average-stack="73333"
      :average-stack-bb="37"
      :current-level="6"
      :current-blinds="demoBlinds"
      :formatted-time="demoTime"
      :status="demoStatus"
      :is-break="demoMode === 'break'"
      :time-to-break="demoTimeToBreak"
      :prize-pool="2200"
      :payouts="demoPayouts"
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

const { t } = useI18n();
const demoMode = ref('break');

const demoBlinds = {
  small: 1000,
  big: 2000,
  ante: 100,
};

const demoPayouts = [
  { place: 1, amount: 1430 },
  { place: 2, amount: 770 },
];

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