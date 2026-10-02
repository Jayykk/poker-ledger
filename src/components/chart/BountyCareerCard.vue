<template>
  <BaseCard v-if="stats && stats.bountyGames > 0" padding="md">
    <div class="text-white font-bold mb-3">🎯 {{ $t('report.bounty.title') }}</div>
    <div class="grid grid-cols-3 gap-2">
      <div class="bc-tile">
        <div class="bc-k">{{ $t('report.bounty.knockouts') }}</div>
        <div class="bc-v">{{ stats.knockouts }}</div>
      </div>
      <div class="bc-tile">
        <div class="bc-k">{{ $t('report.bounty.won') }}</div>
        <div class="bc-v">${{ formatNumber(Math.round(stats.bountyWon)) }}</div>
      </div>
      <div class="bc-tile">
        <div class="bc-k">{{ $t('report.bounty.games') }}</div>
        <div class="bc-v">{{ $t('report.bounty.gamesN', { n: stats.bountyGames }) }}</div>
      </div>
    </div>

    <template v-if="stats.draws > 0">
      <div class="text-amber-400 font-bold text-sm mt-4 mb-2">🎁 {{ $t('report.bounty.mystery') }}</div>
      <div class="grid grid-cols-3 gap-2">
        <div class="bc-tile">
          <div class="bc-k">{{ $t('report.bounty.draws') }}</div>
          <div class="bc-v">{{ $t('report.bounty.drawsN', { n: stats.draws }) }}</div>
        </div>
        <div class="bc-tile">
          <div class="bc-k">{{ $t('report.bounty.topDraws') }}</div>
          <div class="bc-v">{{ $t('report.bounty.drawsN', { n: stats.topDraws }) }}</div>
          <div class="bc-k">{{ topRate }}%</div>
        </div>
        <div class="bc-tile">
          <div class="bc-k">{{ $t('report.bounty.best') }}</div>
          <div class="bc-v">${{ formatNumber(Math.round(stats.bestDraw)) }}</div>
        </div>
      </div>
    </template>
  </BaseCard>
</template>

<script setup>
// Career bounty stats (戰績 → 生涯): knockouts and bounty won in KO / PKO /
// mystery games, plus the mystery envelopes drawn. Same aggregation as the
// leaderboard (leaderboardStatsMath), run over this user's own history.
import { computed } from 'vue';
import BaseCard from '../common/BaseCard.vue';
import { formatNumber } from '../../utils/formatters.js';
import { aggregateHistoryRecords } from '../../../functions/src/utils/leaderboardStatsMath.js';

const props = defineProps({
  uid: { type: String, default: '' },
  records: { type: Array, default: () => [] },
});

const stats = computed(() => {
  if (!props.uid) return null;
  return aggregateHistoryRecords(props.uid, props.records).get('all')?.tournament || null;
});
const topRate = computed(() => (stats.value?.draws
  ? Math.round((stats.value.topDraws / stats.value.draws) * 100)
  : 0));
</script>

<style scoped>
.bc-tile { border-radius: 0.6rem; padding: 0.5rem 0.6rem; background: rgb(var(--tw-slate-900) / 0.6); }
.bc-k { font-size: 0.72rem; color: rgb(var(--tw-slate-400)); }
.bc-v { font-family: 'JetBrains Mono', monospace; font-size: 1.1rem; font-weight: 700; color: rgb(var(--tw-white)); font-variant-numeric: tabular-nums; }
</style>
