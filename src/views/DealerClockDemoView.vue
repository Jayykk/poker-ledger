<template>
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
    formatted-time="05:00"
    status="ended"
    :prize-pool="2200"
    :payouts="demoPayouts"
    :show-settings-button="false"
    :show-time-bank-button="false"
    @request-fullscreen="requestFullscreen"
  />
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import DealerClockDisplay from '../components/tournament/DealerClockDisplay.vue';

const { t } = useI18n();

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

function requestFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
}
</script>