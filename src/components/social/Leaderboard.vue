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
  // Filter by selected period
  const now = Date.now();
  const periodDays = {
    'thisMonth': 30,
    'thisQuarter': 90,
    'thisYear': 365
  };
  
  const daysToFilter = periodDays[selectedPeriod.value] || 30;
  const cutoffTime = now - (daysToFilter * 24 * 60 * 60 * 1000);
  
  // Filter data by selected period
  const filteredData = leaderboardData.value.map(entry => {
    const periodHistory = entry.history.filter(h => {
      // Ensure h.createdAt is a valid timestamp
      const timestamp = typeof h.createdAt === 'number' ? h.createdAt : Date.parse(h.createdAt);
      return !isNaN(timestamp) && timestamp >= cutoffTime;
    });
    
    if (periodHistory.length === 0) return null;
    
    const totalProfit = periodHistory.reduce((sum, h) => {
      // Prevent division by zero
      const rate = h.rate || 1;
      return sum + (h.profit / rate);
    }, 0);
    const games = periodHistory.length;
    const winningGames = periodHistory.filter(h => h.profit > 0).length;
    const winRate = games > 0 ? Math.round((winningGames / games) * 100) : 0;
    
    return {
      uid: entry.uid,
      name: entry.name,
      games,
      profit: Math.round(totalProfit),
      winRate
    };
  }).filter(entry => entry !== null);
  
  // Sort by profit and return top 10
  return filteredData
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10);
});

const getRankClass = (index) => {
  if (index === 0) return 'bg-amber-500 text-white';
  if (index === 1) return 'bg-gray-400 text-white';
  if (index === 2) return 'bg-orange-700 text-white';
  return 'bg-slate-600 text-gray-300';
};

const loadLeaderboard = async () => {
  try {
    // Fetch all users from Firestore
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    
    const userData = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.history && data.history.length > 0) {
        userData.push({
          uid: doc.id,
          name: data.displayName || data.email || 'Unknown',
          history: data.history
        });
      }
    });
    
    leaderboardData.value = userData;
  } catch (err) {
    console.error('Load leaderboard error:', err);
  }
};

onMounted(() => {
  loadLeaderboard();
});
</script>
