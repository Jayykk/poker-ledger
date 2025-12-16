<template>
  <div v-if="showOdds" class="odds-display bg-slate-800/90 rounded-lg p-4 border border-slate-700">
    <h3 class="text-white font-bold text-sm mb-3 flex items-center gap-2">
      <i class="fas fa-chart-line text-blue-400"></i>
      {{ $t('poker.oddsCalculator') }}
    </h3>

    <div v-if="loading" class="text-center py-4">
      <i class="fas fa-spinner fa-spin text-gray-400"></i>
    </div>

    <div v-else-if="odds" class="space-y-3">
      <!-- Win Probability -->
      <div class="flex justify-between items-center">
        <span class="text-gray-400 text-sm">{{ $t('poker.winProbability') }}:</span>
        <div class="flex items-center gap-2">
          <div class="text-emerald-400 font-bold text-lg">{{ odds.exact }}%</div>
          <div class="text-xs text-gray-500">(~{{ odds.approximate }}%)</div>
        </div>
      </div>

      <!-- Outs -->
      <div class="flex justify-between items-center">
        <span class="text-gray-400 text-sm">{{ $t('poker.outs') }}:</span>
        <div class="text-white font-mono font-bold">{{ odds.outs }}</div>
      </div>

      <!-- Odds Ratio -->
      <div class="flex justify-between items-center">
        <span class="text-gray-400 text-sm">{{ $t('poker.odds') }}:</span>
        <div class="text-amber-400 font-mono">{{ odds.odds }}</div>
      </div>

      <!-- Breakdown (if available) -->
      <div v-if="outsBreakdown" class="mt-4 pt-3 border-t border-slate-700">
        <div class="text-xs text-gray-500 mb-2">{{ $t('poker.outsBreakdown') }}:</div>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div v-if="outsBreakdown.toFlush > 0" class="flex justify-between">
            <span class="text-gray-400">{{ $t('poker.toFlush') }}:</span>
            <span class="text-white">{{ outsBreakdown.toFlush }}</span>
          </div>
          <div v-if="outsBreakdown.toStraight > 0" class="flex justify-between">
            <span class="text-gray-400">{{ $t('poker.toStraight') }}:</span>
            <span class="text-white">{{ outsBreakdown.toStraight }}</span>
          </div>
          <div v-if="outsBreakdown.toTrips > 0" class="flex justify-between">
            <span class="text-gray-400">{{ $t('poker.toTrips') }}:</span>
            <span class="text-white">{{ outsBreakdown.toTrips }}</span>
          </div>
          <div v-if="outsBreakdown.toFullHouse > 0" class="flex justify-between">
            <span class="text-gray-400">{{ $t('poker.toFullHouse') }}:</span>
            <span class="text-white">{{ outsBreakdown.toFullHouse }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="text-center text-gray-500 text-sm py-2">
      {{ $t('poker.noOddsData') }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  odds: {
    type: Object,
    default: null
  },
  outsBreakdown: {
    type: Object,
    default: null
  },
  loading: {
    type: Boolean,
    default: false
  }
});

const { t } = useI18n();

const showOdds = computed(() => {
  return props.loading || props.odds !== null;
});
</script>

<style scoped>
.odds-display {
  backdrop-filter: blur(8px);
}
</style>
