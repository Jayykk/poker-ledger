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

    <!-- Game format filter (hidden for special hands: those are online-poker global) -->
    <div v-if="selectedSort !== 'specialHands'" class="mb-3">
      <div class="text-xs text-gray-400 mb-2">{{ $t('friends.gameType') }}</div>
      <div class="flex gap-2 flex-wrap">
        <button
          v-for="gt in gameTypeOptions"
          :key="gt.value"
          @click="selectedGameType = gt.value"
          class="px-3 py-1 rounded-lg text-sm transition"
          :class="selectedGameType === gt.value ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300 hover:bg-slate-600'"
        >
          {{ $t(`friends.${gt.label}`) }}
        </button>
      </div>
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
          <div v-else-if="selectedSort === 'champion'"
            class="text-xl font-mono font-bold text-amber-400"
          >
            🏆 {{ entry.champion }}
          </div>
          <div v-else-if="selectedSort === 'specialHands'"
            class="text-xl font-mono font-bold text-amber-400"
          >
            {{ entry.specialHands }}
          </div>
          <div class="text-xs text-gray-400">
            <span v-if="selectedSort === 'profit'">{{ entry.winRate }}% {{ $t('friends.winRateLabel') }}</span>
            <span v-else-if="selectedSort === 'winRate'">{{ formatNumber(entry.profit) }} {{ $t('friends.profitLabel') }}</span>
            <span v-else-if="selectedSort === 'champion'">🥈 {{ entry.runnerUp }}</span>
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
            <div v-else-if="selectedSort === 'champion'"
              class="text-xl font-mono font-bold text-amber-400"
            >
              🏆 {{ myRankInfo.champion }}
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
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { collection, getDocs, query, where, collectionGroup, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase-init.js';
import { useAuth } from '../../composables/useAuth.js';
import BaseCard from '../common/BaseCard.vue';
import HandDetailsModal from './HandDetailsModal.vue';
import { formatNumber } from '../../utils/formatters.js';
import { HAND_TYPES } from '../../utils/constants.js';
// Shared with the Cloud Function recompute so period boundaries always agree.
// (Vite bundles across functions/; the reverse import direction would not
// survive `firebase deploy`, which uploads the functions folder only.)
import { periodKeysForMillis } from '../../../functions/src/utils/leaderboardStatsMath.js';

const { t } = useI18n();
const { user } = useAuth();

const selectedPeriod = ref('thisMonth');
const selectedGameType = ref('all');
const selectedSort = ref('profit');
const selectedHandType = ref('total'); // Filter for special hands - use 'total' instead of 'all'
const minGames = ref(3); // Minimum games threshold for win-rate sort
const statsRows = ref([]);
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

const gameTypeOptions = [
  { value: 'all', label: 'typeAll' },
  { value: 'cash', label: 'typeCash' },
  { value: 'tournament', label: 'typeTournament' }
];

// Champion sort only makes sense within the tournament format
const sortOptions = computed(() => {
  const options = [
    { value: 'profit', label: 'sortByProfit' },
    { value: 'winRate', label: 'sortByWinRate' },
  ];
  if (selectedGameType.value === 'tournament') {
    options.push({ value: 'champion', label: 'sortByChampion' });
  }
  options.push({ value: 'specialHands', label: 'sortBySpecialHands' });
  return options;
});

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
  // Special hands are an online-poker tally, orthogonal to the ledger game
  // format — always rank them against the overall (total) bucket.
  const bucketKey = selectedSort.value === 'specialHands' ? 'all' : selectedGameType.value;

  const entries = statsRows.value.map((row) => {
    const bucket = bucketKey === 'all' ? row.total : row[bucketKey];
    if (!bucket || bucket.games <= 0) return null;

    const userSpecialHands = specialHandsData.value[row.uid] || {};

    return {
      uid: row.uid,
      name: row.name,
      games: bucket.games,
      profit: Math.round(bucket.profit),
      winRate: Math.round((bucket.wins / bucket.games) * 100),
      champion: row.tournament?.champion || 0,
      runnerUp: row.tournament?.runnerUp || 0,
      specialHands: userSpecialHands[selectedHandType.value] || 0
    };
  }).filter(entry => entry !== null);

  // Sort based on selected mode
  if (selectedSort.value === 'profit') {
    return [...entries].sort((a, b) => b.profit - a.profit);
  }
  if (selectedSort.value === 'winRate') {
    // Apply min games threshold so flukes don't dominate
    return entries
      .filter(entry => entry.games >= minGames.value)
      .sort((a, b) => b.winRate - a.winRate || b.games - a.games);
  }
  if (selectedSort.value === 'champion') {
    return entries
      .filter(entry => entry.champion + entry.runnerUp > 0)
      .sort((a, b) => b.champion - a.champion || b.runnerUp - a.runnerUp || b.profit - a.profit);
  }
  // specialHands
  return entries
    .filter(entry => entry.specialHands > 0)
    .sort((a, b) => b.specialHands - a.specialHands);
});

const getRankClass = (index) => {
  if (index <= 2) return 'bg-transparent'; // Medal emojis carry their own colors
  return 'bg-slate-600 text-gray-300';
};

// Map a UI period tab to its leaderboardStats period key (Asia/Taipei calendar,
// same helper the Cloud Function recompute uses — see leaderboardStatsMath.js).
const currentPeriodKey = (periodValue) => {
  const keys = periodKeysForMillis(Date.now());
  return {
    thisWeek: keys.week,
    thisMonth: keys.month,
    thisQuarter: keys.quarter,
    thisYear: keys.year,
    allTime: keys.all,
  }[periodValue] || keys.all;
};

// One query per period tab, cached for the component's lifetime. Replaces the
// old O(users × games) full scan (every user doc + every history_sub subcollection).
const statsCache = new Map();

const loadStats = async () => {
  const key = currentPeriodKey(selectedPeriod.value);
  if (statsCache.has(key)) {
    statsRows.value = statsCache.get(key);
    return;
  }

  isLoading.value = true;
  try {
    const statsQuery = query(collection(db, 'leaderboardStats'), where('period', '==', key));
    const snapshot = await getDocs(statsQuery);
    // Anonymous / nameless accounts are flagged server-side and never rank
    const rows = snapshot.docs
      .map((docSnap) => docSnap.data())
      .filter((row) => !row.hidden && row.name);
    statsCache.set(key, rows);
    statsRows.value = rows;
  } catch (err) {
    console.error('Load leaderboard stats error:', err);
    statsRows.value = [];
  } finally {
    isLoading.value = false;
  }
};

watch(selectedPeriod, loadStats);

// Leaving the tournament format invalidates the champion sort
watch(selectedGameType, (gameType) => {
  if (gameType !== 'tournament' && selectedSort.value === 'champion') {
    selectedSort.value = 'profit';
  }
});

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
    
    // Query recent hand records from all games. Bounded: an unbounded
    // collection-group scan grows with every game ever played; the special
    // hands tally covers the most recent 1000 hands.
    const handsQuery = query(
      collectionGroup(db, 'hands'),
      orderBy('createdAt', 'desc'),
      limit(1000)
    );
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
    await Promise.all([loadStats(), loadSpecialHands()]);
  } finally {
    isLoading.value = false;
  }
});
</script>
