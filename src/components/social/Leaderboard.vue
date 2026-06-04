<template>
  <BaseCard :title="$t('friends.leaderboard')" padding="md">
    <!-- Time period selector -->
    <div class="flex gap-2 mb-3 flex-wrap">
      <button
        v-for="period in periods"
        :key="period.value"
        @click="selectedPeriod = period.value"
        class="px-3 py-1 rounded-lg text-sm transition"
        :class="selectedPeriod === period.value ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300 hover:bg-slate-600'"
      >
        {{ $t(`friends.${period.label}`) }}
      </button>
    </div>

    <!-- Sort selector -->
    <div class="mb-3">
      <div class="text-xs text-gray-400 mb-2">{{ $t('friends.sortBy') }}</div>
      <div class="flex gap-2 flex-wrap">
        <button
          v-for="option in sortOptions"
          :key="option.value"
          @click="selectedSort = option.value"
          class="px-3 py-1 rounded-lg text-sm transition"
          :class="selectedSort === option.value ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300 hover:bg-slate-600'"
        >
          {{ $t(`friends.${option.label}`) }}
        </button>
      </div>
    </div>

    <!-- Hand type filter (only visible when sorting by special hands) -->
    <div v-if="selectedSort === 'specialHands'" class="mb-3">
      <div class="text-xs text-gray-400 mb-2">{{ $t('friends.handType') }}</div>
      <div class="flex gap-2 flex-wrap">
        <button
          v-for="hand in handTypeOptions"
          :key="hand.value"
          @click="selectedHandType = hand.value"
          class="px-3 py-1 rounded-lg text-sm transition"
          :class="selectedHandType === hand.value ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300 hover:bg-slate-600'"
        >
          {{ $t(`friends.${hand.label}`) }}
        </button>
      </div>
    </div>

    <!-- Min games filter (only visible when sorting by winRate) -->
    <div v-if="selectedSort === 'winRate'" class="mb-3 flex items-center gap-2 text-xs text-gray-400">
      <i class="fas fa-filter"></i>
      <span>{{ $t('friends.minGames') }}</span>
      <select
        v-model.number="minGames"
        class="bg-slate-700 text-white text-xs rounded px-2 py-1 border border-slate-600 focus:outline-none focus:border-amber-500"
      >
        <option :value="1">1</option>
        <option :value="3">3</option>
        <option :value="5">5</option>
        <option :value="10">10</option>
      </select>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
      <div class="text-xs text-gray-400 mt-3">{{ $t('common.loading') }}</div>
    </div>

    <!-- Leaderboard -->
    <div v-else class="space-y-2">
      <div
        v-for="(entry, index) in leaderboard"
        :key="entry.uid"
        @click="selectedSort === 'specialHands' && handleViewHandDetails(entry)"
        class="flex items-center gap-3 p-3 rounded-lg transition-colors"
        :class="[
          entry.uid === user?.uid ? 'bg-amber-600/20 border border-amber-600/50' : 'bg-slate-700',
          selectedSort === 'specialHands' ? 'cursor-pointer hover:bg-slate-600' : ''
        ]"
      >
        <!-- Rank: medal for top 3, number otherwise -->
        <div class="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-base"
          :class="getRankClass(index)"
        >
          <span v-if="index === 0">🥇</span>
          <span v-else-if="index === 1">🥈</span>
          <span v-else-if="index === 2">🥉</span>
          <span v-else>{{ index + 1 }}</span>
        </div>

        <!-- User info -->
        <div class="flex-1 min-w-0">
          <div class="text-white font-bold flex items-center gap-2 truncate">
            <span class="truncate">{{ entry.name }}</span>
            <span v-if="entry.uid === user?.uid" class="text-xs text-amber-400 flex-shrink-0">{{ $t('friends.you') }}</span>
          </div>
          <div class="text-xs text-gray-400">
            {{ $t('friends.gamesCount', { n: entry.games }) }}
          </div>
        </div>

        <!-- Profit / Win Rate / Special Hands -->
        <div class="text-right flex-shrink-0">
          <div v-if="selectedSort === 'profit'"
            class="text-xl font-mono font-bold"
            :class="entry.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'"
          >
            {{ entry.profit >= 0 ? '+' : '' }}{{ formatNumber(entry.profit) }}
          </div>
          <div v-else-if="selectedSort === 'winRate'"
            class="text-xl font-mono font-bold text-emerald-400"
          >
            {{ entry.winRate }}%
          </div>
          <div v-else-if="selectedSort === 'specialHands'"
            class="text-xl font-mono font-bold text-amber-400"
          >
            {{ entry.specialHands }}
          </div>
          <div class="text-xs text-gray-400">
            <span v-if="selectedSort === 'profit'">{{ entry.winRate }}% {{ $t('friends.winRateLabel') }}</span>
            <span v-else-if="selectedSort === 'winRate'">{{ formatNumber(entry.profit) }} {{ $t('friends.profitLabel') }}</span>
            <span v-else-if="selectedSort === 'specialHands'">{{ entry.winRate }}% {{ $t('friends.winRateLabel') }}</span>
          </div>
        </div>
      </div>

      <!-- Your rank (when user is outside top 10) -->
      <div
        v-if="myRankInfo"
        class="mt-3 pt-3 border-t border-slate-600"
      >
        <div class="flex items-center gap-3 p-3 rounded-lg bg-amber-600/20 border border-amber-600/50">
          <div class="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm bg-slate-600 text-gray-200">
            {{ myRankInfo.rank }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-white font-bold flex items-center gap-2 truncate">
              <span class="truncate">{{ myRankInfo.name }}</span>
              <span class="text-xs text-amber-400 flex-shrink-0">{{ $t('friends.you') }}</span>
            </div>
            <div class="text-xs text-gray-400">
              {{ $t('friends.gamesCount', { n: myRankInfo.games }) }}
            </div>
          </div>
          <div class="text-right flex-shrink-0">
            <div v-if="selectedSort === 'profit'"
              class="text-xl font-mono font-bold"
              :class="myRankInfo.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'"
            >
              {{ myRankInfo.profit >= 0 ? '+' : '' }}{{ formatNumber(myRankInfo.profit) }}
            </div>
            <div v-else-if="selectedSort === 'winRate'"
              class="text-xl font-mono font-bold text-emerald-400"
            >
              {{ myRankInfo.winRate }}%
            </div>
            <div v-else-if="selectedSort === 'specialHands'"
              class="text-xl font-mono font-bold text-amber-400"
            >
              {{ myRankInfo.specialHands }}
            </div>
          </div>
        </div>
      </div>

      <div v-if="!isLoading && leaderboard.length === 0" class="text-center text-gray-500 py-8">
        <i class="fas fa-inbox text-3xl mb-2 opacity-50"></i>
        <div>{{ $t('friends.noLeaderboardData') }}</div>
      </div>
    </div>
    
    <!-- Hand Details Modal -->
    <HandDetailsModal
      v-model="showHandDetailsModal"
      :userId="selectedUserId"
      :userName="selectedUserName"
      :handType="selectedHandType"
    />
  </BaseCard>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { collection, getDocs, query, collectionGroup, doc } from 'firebase/firestore';
import { db } from '../../firebase-init.js';
import { useAuth } from '../../composables/useAuth.js';
import BaseCard from '../common/BaseCard.vue';
import HandDetailsModal from './HandDetailsModal.vue';
import { formatNumber } from '../../utils/formatters.js';
import { HAND_TYPES } from '../../utils/constants.js';

const { t } = useI18n();
const { user } = useAuth();

const selectedPeriod = ref('thisMonth');
const selectedSort = ref('profit');
const selectedHandType = ref('total'); // Filter for special hands - use 'total' instead of 'all'
const minGames = ref(3); // Minimum games threshold for win-rate sort
const leaderboardData = ref([]);
const specialHandsData = ref({});
const showHandDetailsModal = ref(false);
const selectedUserId = ref('');
const selectedUserName = ref('');
const isLoading = ref(true);

const periods = [
  { value: 'thisWeek', label: 'thisWeek' },
  { value: 'thisMonth', label: 'thisMonth' },
  { value: 'thisQuarter', label: 'thisQuarter' },
  { value: 'thisYear', label: 'thisYear' },
  { value: 'allTime', label: 'allTime' }
];

const sortOptions = [
  { value: 'profit', label: 'sortByProfit' },
  { value: 'winRate', label: 'sortByWinRate' },
  { value: 'specialHands', label: 'sortBySpecialHands' }
];

const handTypeOptions = [
  { value: 'royalFlush', label: 'royalFlush' },
  { value: 'straightFlush', label: 'straightFlush' },
  { value: 'fourOfAKind', label: 'fourOfAKind' },
  { value: 'fullHouse', label: 'fullHouse' },
  { value: 'total', label: 'allHands' }
];

const leaderboard = computed(() => {
  return rankedEntries.value.slice(0, 10);
});

// Show user's rank if they are NOT in the top 10 but DO have an entry
const myRankInfo = computed(() => {
  if (!user.value?.uid) return null;
  const all = rankedEntries.value;
  const myIndex = all.findIndex((e) => e.uid === user.value.uid);
  if (myIndex < 0 || myIndex < 10) return null; // not found, or already in top 10
  return {
    rank: myIndex + 1,
    ...all[myIndex]
  };
});

const rankedEntries = computed(() => {
  // Filter by selected period using actual calendar boundaries
  const now = new Date();
  let cutoffTime = 0;

  if (selectedPeriod.value === 'thisWeek') {
    // Start of current week (Monday 00:00:00)
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
    cutoffTime = monday.getTime();
  } else if (selectedPeriod.value === 'thisMonth') {
    cutoffTime = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  } else if (selectedPeriod.value === 'thisQuarter') {
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    cutoffTime = new Date(now.getFullYear(), quarterMonth, 1).getTime();
  } else if (selectedPeriod.value === 'thisYear') {
    cutoffTime = new Date(now.getFullYear(), 0, 1).getTime();
  } else {
    cutoffTime = 0; // allTime
  }
  
  // Filter data by selected period
  const filteredData = leaderboardData.value.map(entry => {
    const periodHistory = cutoffTime === 0
      ? entry.history.filter(h => (typeof h.createdAt === 'number' ? h.createdAt : 0) > 0)
      : entry.history.filter(h => {
          const timestamp = typeof h.createdAt === 'number' ? h.createdAt : 0;
          return timestamp > 0 && timestamp >= cutoffTime;
        });
    
    if (periodHistory.length === 0) return null;
    
    const totalProfit = periodHistory.reduce((sum, h) => {
      const rate = h.rate || 1;
      return sum + (h.profit / rate);
    }, 0);
    const games = periodHistory.length;
    const winningGames = periodHistory.filter(h => h.profit > 0).length;
    const winRate = games > 0 ? Math.round((winningGames / games) * 100) : 0;
    
    const userSpecialHands = specialHandsData.value[entry.uid] || {};
    const specialHandsCount = userSpecialHands[selectedHandType.value] || 0;
    
    return {
      uid: entry.uid,
      name: entry.name,
      games,
      profit: Math.round(totalProfit),
      winRate,
      specialHands: specialHandsCount
    };
  }).filter(entry => entry !== null);
  
  // Filter out entries with games === 0
  let validEntries = filteredData.filter(entry => entry.games > 0);
  
  // Sort based on selected mode
  if (selectedSort.value === 'profit') {
    validEntries.sort((a, b) => b.profit - a.profit);
  } else if (selectedSort.value === 'winRate') {
    // Apply min games threshold so flukes don't dominate
    validEntries = validEntries.filter(entry => entry.games >= minGames.value);
    validEntries.sort((a, b) => b.winRate - a.winRate || b.games - a.games);
  } else if (selectedSort.value === 'specialHands') {
    validEntries = validEntries.filter(entry => entry.specialHands > 0);
    validEntries.sort((a, b) => b.specialHands - a.specialHands);
  }
  
  return validEntries;
});

const getRankClass = (index) => {
  if (index <= 2) return 'bg-transparent'; // Medal emojis carry their own colors
  return 'bg-slate-600 text-gray-300';
};

// Convert a Firestore Timestamp / number / ISO string to a millisecond number
const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
};

const loadLeaderboard = async () => {
  try {
    // Fetch all users from Firestore
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);

    const candidates = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      // Exclude anonymous users
      if (data.isAnonymous) return;

      // Priority: name > displayName
      const name = data.name || data.displayName || null;
      if (!name) return;

      candidates.push({
        uid: doc.id,
        name,
        legacyHistory: Array.isArray(data.history) ? data.history : [],
      });
    });

    // For every candidate, also fetch history_sub (projected per-game records).
    // Merge legacy + projected, deduped by gameId. This mirrors the merge logic
    // used by the user store (src/store/modules/user.js).
    const merged = await Promise.all(
      candidates.map(async (entry) => {
        let projected = [];
        try {
          const historySubRef = collection(db, 'users', entry.uid, 'history_sub');
          const historySubSnapshot = await getDocs(historySubRef);
          projected = historySubSnapshot.docs.map((d) => ({
            ...d.data(),
            gameId: d.id,
          }));
        } catch (err) {
          console.error(`Error loading history_sub for user ${entry.uid}:`, err);
        }

        const byGameId = new Map();

        // Legacy first; projected overwrites if same gameId (projection is canonical)
        entry.legacyHistory.forEach((record, index) => {
          const key = record.gameId || `legacy-${index}`;
          byGameId.set(key, {
            ...record,
            createdAt: toMillis(record.createdAt) || toMillis(record.completedAt) || toMillis(record.date),
          });
        });

        projected.forEach((record, index) => {
          const key = record.gameId || `projected-${index}`;
          byGameId.set(key, {
            ...record,
            createdAt: toMillis(record.createdAt) || toMillis(record.completedAt) || toMillis(record.date),
          });
        });

        const history = Array.from(byGameId.values());
        if (history.length === 0) return null;

        return {
          uid: entry.uid,
          name: entry.name,
          history,
        };
      })
    );

    leaderboardData.value = merged.filter((entry) => entry !== null);
  } catch (err) {
    console.error('Load leaderboard error:', err);
  }
};

const loadSpecialHands = async () => {
  try {
    // Count special hands for each user by type
    const specialHandsCount = {};
    
    // Map hand types to property names for cleaner counting
    const handTypePropertyMap = {
      [HAND_TYPES.ROYAL_FLUSH]: 'royalFlush',
      [HAND_TYPES.STRAIGHT_FLUSH]: 'straightFlush',
      [HAND_TYPES.FOUR_OF_A_KIND]: 'fourOfAKind',
      [HAND_TYPES.FULL_HOUSE]: 'fullHouse'
    };
    
    // Query all hand records from all games
    const handsQuery = query(collectionGroup(db, 'hands'));
    const handsSnapshot = await getDocs(handsQuery);
    
    handsSnapshot.forEach((doc) => {
      const hand = doc.data();
      if (hand.players && Array.isArray(hand.players)) {
        hand.players.forEach(player => {
          // Use playerUid if available (new format), otherwise fall back to playerId for backward compatibility
          const userId = player.playerUid || player.playerId;
          
          if (userId && player.handType) {
            const propertyName = handTypePropertyMap[player.handType];
            
            // Only count if it's a special hand type
            if (propertyName) {
              // Initialize user's special hands object if not exists
              if (!specialHandsCount[userId]) {
                specialHandsCount[userId] = {
                  total: 0,
                  royalFlush: 0,
                  straightFlush: 0,
                  fourOfAKind: 0,
                  fullHouse: 0
                };
              }
              
              // Increment both the specific hand type and total
              specialHandsCount[userId][propertyName]++;
              specialHandsCount[userId].total++;
            }
          }
        });
      }
    });
    
    specialHandsData.value = specialHandsCount;
  } catch (err) {
    console.error('Load special hands error:', err);
  }
};

const handleViewHandDetails = (entry) => {
  selectedUserId.value = entry.uid;
  selectedUserName.value = entry.name;
  showHandDetailsModal.value = true;
};

onMounted(async () => {
  isLoading.value = true;
  try {
    await Promise.all([loadLeaderboard(), loadSpecialHands()]);
  } finally {
    isLoading.value = false;
  }
});
</script>
