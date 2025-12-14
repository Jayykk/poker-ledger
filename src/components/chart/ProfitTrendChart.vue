<template>
  <BaseCard :title="$t('report.profitTrend')" padding="md">
    <!-- Time Period Selector -->
    <div class="flex gap-2 mb-4">
      <button
        v-for="period in periods"
        :key="period"
        @click="selectedPeriod = period"
        class="px-3 py-1 rounded-lg text-sm transition"
        :class="selectedPeriod === period ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300'"
      >
        {{ $t(`report.timePeriod.${period}`) }}
      </button>
    </div>

    <!-- Chart -->
    <div class="relative h-64 w-full">
      <canvas :id="canvasId"></canvas>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 gap-4 mt-4">
      <div class="text-center">
        <div class="text-xs text-gray-400">Total Games</div>
        <div class="text-xl font-bold text-white">{{ stats.games }}</div>
      </div>
      <div class="text-center">
        <div class="text-xs text-gray-400">Total Profit</div>
        <div
          class="text-xl font-bold font-mono"
          :class="stats.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'"
        >
          {{ stats.totalProfit >= 0 ? '+' : '' }}{{ formatNumber(stats.totalProfit) }}
        </div>
      </div>
    </div>
  </BaseCard>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useChart } from '../../composables/useChart.js';
import { useUserStore } from '../../store/modules/user.js';
import BaseCard from '../common/BaseCard.vue';
import { formatNumber } from '../../utils/formatters.js';
import { TIME_PERIODS, CHART_COLORS } from '../../utils/constants.js';

const { t } = useI18n();
const { createLineChart } = useChart();
const userStore = useUserStore();

// Store chart instance locally
let chartInstance = null;

const canvasId = ref(`profit-chart-${Math.random().toString(36).substr(2, 9)}`);
const selectedPeriod = ref(TIME_PERIODS.ALL);
const periods = [TIME_PERIODS.WEEK, TIME_PERIODS.MONTH, TIME_PERIODS.YEAR, TIME_PERIODS.ALL];

const filteredHistory = computed(() => {
  return userStore.getHistoryByPeriod(selectedPeriod.value);
});

const stats = computed(() => {
  return userStore.getStatsByPeriod(selectedPeriod.value);
});

const chartData = computed(() => {
  const history = filteredHistory.value;
  
  if (history.length === 0) {
    return {
      labels: [],
      datasets: [{
        label: 'Profit',
        data: [],
        borderColor: CHART_COLORS.profit,
        backgroundColor: CHART_COLORS.background,
        fill: true,
        tension: 0.4
      }]
    };
  }

  let accumulated = 0;
  const data = history.map(h => {
    accumulated += h.profit / (h.rate || 1);
    return Math.round(accumulated);
  });

  return {
    labels: history.map((_, i) => i + 1),
    datasets: [{
      label: 'Cumulative Profit',
      data,
      borderColor: CHART_COLORS.profit,
      backgroundColor: CHART_COLORS.background,
      fill: true,
      tension: 0.4
    }]
  };
});

const renderChart = () => {
  nextTick(() => {
    // Destroy old chart instance before creating a new one
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    
    chartInstance = createLineChart(canvasId.value, chartData.value, {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              return `Profit: ${context.parsed.y >= 0 ? '+' : ''}${formatNumber(context.parsed.y)}`;
            }
          }
        }
      },
      scales: {
        x: {
          display: true,
          grid: {
            display: false
          },
          ticks: {
            color: '#94a3b8'
          }
        },
        y: {
          grid: {
            color: '#334155'
          },
          ticks: {
            color: '#94a3b8',
            callback: (value) => formatNumber(value)
          }
        }
      }
    });
  });
};

// Only watch selectedPeriod to avoid infinite loops
watch(selectedPeriod, () => {
  renderChart();
});

onMounted(() => {
  renderChart();
});

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.destroy();
  }
});
</script>
