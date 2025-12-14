<template>
  <BaseCard :title="$t('friends.leaderboard')" padding="md">
    <!-- Time period selector -->
    <div class="flex gap-2 mb-4">
      <button
        v-for="period in periods"
        :key="period.value"
        @click="selectedPeriod = period.value"
        class="px-3 py-1 rounded-lg text-sm transition"
        :class="selectedPeriod === period.value ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300'"
      >
        {{ $t(`friends.${period.label}`) }}
      </button>
    </div>

    <!-- Leaderboard -->
    <div class="space-y-2">
      <div
        v-for="(entry, index) in leaderboard"
        :key="entry.uid"
        class="flex items-center gap-3 p-3 rounded-lg"
        :class="entry.uid === user?.uid ? 'bg-amber-600/20 border border-amber-600/50' : 'bg-slate-700'"
      >
        <!-- Rank -->
        <div class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold"
          :class="getRankClass(index)"
        >
          {{ index + 1 }}
        </div>

        <!-- User info -->
        <div class="flex-1">
          <div class="text-white font-bold flex items-center gap-2">
            {{ entry.name }}
            <span v-if="entry.uid === user?.uid" class="text-xs text-amber-400">(You)</span>
          </div>
          <div class="text-xs text-gray-400">
            {{ entry.games }} {{ entry.games === 1 ? 'game' : 'games' }}
          </div>
        </div>

        <!-- Profit -->
        <div class="text-right">
          <div
            class="text-xl font-mono font-bold"
            :class="entry.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'"
          >
            {{ entry.profit >= 0 ? '+' : '' }}{{ formatNumber(entry.profit) }}
          </div>
          <div class="text-xs text-gray-400">
            {{ entry.winRate }}% win rate
          </div>
        </div>
      </div>

      <div v-if="leaderboard.length === 0" class="text-center text-gray-500 py-8">
        No data available
      </div>
    </div>
  </BaseCard>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase-init.js';
import { useAuth } from '../../composables/useAuth.js';
import BaseCard from '../common/BaseCard.vue';
import { formatNumber } from '../../utils/formatters.js';

const { t } = useI18n();
const { user } = useAuth();

const selectedPeriod = ref('thisMonth');
const leaderboardData = ref([]);

const periods = [
  { value: 'thisMonth', label: 'thisMonth' },
  { value: 'thisQuarter', label: 'thisQuarter' },
  { value: 'thisYear', label: 'thisYear' }
];

const leaderboard = computed(() => {
  // Filter and sort by selected period
  // This is a simplified version - in production, you'd query Firestore with proper filters
  return [...leaderboardData.value]
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10); // Top 10
});

const getRankClass = (index) => {
  if (index === 0) return 'bg-amber-500 text-white';
  if (index === 1) return 'bg-gray-400 text-white';
  if (index === 2) return 'bg-orange-700 text-white';
  return 'bg-slate-600 text-gray-300';
};

const loadLeaderboard = async () => {
  try {
    // In a real implementation, you'd fetch this from a dedicated leaderboard collection
    // or aggregate from user stats
    
    // Mock data for demonstration
    leaderboardData.value = [
      { uid: '1', name: 'Player 1', games: 15, profit: 12500, winRate: 60 },
      { uid: '2', name: 'Player 2', games: 12, profit: 8300, winRate: 58 },
      { uid: '3', name: 'Player 3', games: 20, profit: 6700, winRate: 55 },
      { uid: user.value?.uid, name: user.value?.displayName || 'You', games: 8, profit: 3200, winRate: 50 },
      { uid: '5', name: 'Player 5', games: 10, profit: -1500, winRate: 40 }
    ];
  } catch (err) {
    console.error('Load leaderboard error:', err);
  }
};

onMounted(() => {
  loadLeaderboard();
});
</script>
