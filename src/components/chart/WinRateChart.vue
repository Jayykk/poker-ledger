<template>
  <BaseCard :title="$t('report.winRate')" padding="md">
    <!-- Chart -->
    <div class="relative h-64 w-full">
      <canvas :id="canvasId"></canvas>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-3 gap-4 mt-4">
      <div class="text-center">
        <div class="text-xs text-gray-400">Wins</div>
        <div class="text-xl font-bold text-emerald-400">{{ winCount }}</div>
      </div>
      <div class="text-center">
        <div class="text-xs text-gray-400">Losses</div>
        <div class="text-xl font-bold text-rose-400">{{ lossCount }}</div>
      </div>
      <div class="text-center">
        <div class="text-xs text-gray-400">Draws</div>
        <div class="text-xl font-bold text-gray-400">{{ drawCount }}</div>
      </div>
    </div>

    <!-- Win Rate -->
    <div class="mt-4 text-center">
      <div class="text-xs text-gray-400 mb-1">Win Rate</div>
      <div class="text-3xl font-bold text-white">{{ winRate }}%</div>
    </div>

    <!-- Streak -->
    <div v-if="currentStreak !== 0" class="mt-4 text-center">
      <div
        class="inline-block px-4 py-2 rounded-lg"
        :class="currentStreak > 0 ? 'bg-emerald-600/20 text-emerald-400' : 'bg-rose-600/20 text-rose-400'"
      >
        <div class="text-xs">Current Streak</div>
        <div class="text-xl font-bold">
          {{ currentStreak > 0 ? '+' : '' }}{{ currentStreak }}
        </div>
      </div>
    </div>
  </BaseCard>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useChart } from '../../composables/useChart.js';
import { useUserStore } from '../../store/modules/user.js';
import BaseCard from '../common/BaseCard.vue';
import { CHART_COLORS } from '../../utils/constants.js';

const { t } = useI18n();
const { createPieChart } = useChart();
const userStore = useUserStore();

// Store chart instance locally
let chartInstance = null;

const canvasId = ref(`winrate-chart-${Math.random().toString(36).substr(2, 9)}`);

const winCount = computed(() => {
  return userStore.history.filter(h => h.profit > 0).length;
});

const lossCount = computed(() => {
  return userStore.history.filter(h => h.profit < 0).length;
});

const drawCount = computed(() => {
  return userStore.history.filter(h => h.profit === 0).length;
});

const winRate = computed(() => {
  const total = userStore.history.length;
  return total > 0 ? Math.round((winCount.value / total) * 100) : 0;
});

const currentStreak = computed(() => {
  const history = [...userStore.history].reverse(); // Most recent first
  if (history.length === 0) return 0;
  
  let streak = 0;
  const firstResult = history[0].profit > 0 ? 'win' : history[0].profit < 0 ? 'loss' : 'draw';
  
  if (firstResult === 'draw') return 0;
  
  for (const h of history) {
    if (firstResult === 'win' && h.profit > 0) streak++;
    else if (firstResult === 'loss' && h.profit < 0) streak--;
    else break;
  }
  
  return streak;
});

const chartData = computed(() => {
  return {
    labels: ['Wins', 'Losses', 'Draws'],
    datasets: [{
      data: [winCount.value, lossCount.value, drawCount.value],
      backgroundColor: [
        CHART_COLORS.profit,
        CHART_COLORS.loss,
        CHART_COLORS.neutral
      ],
      borderWidth: 0
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
    
    chartInstance = createPieChart(canvasId.value, chartData.value, {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#cbd5e1',
            padding: 15,
            font: {
              size: 12
            }
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.label || '';
              const value = context.parsed || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
              return `${label}: ${value} (${percentage}%)`;
            }
          }
        }
      }
    });
  });
};

onMounted(() => {
  renderChart();
});

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.destroy();
  }
});
</script>
