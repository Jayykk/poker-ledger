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

    <!-- Sort selector -->
    <div class="mb-4">
      <div class="text-xs text-gray-400 mb-2">{{ $t('friends.sortBy') }}</div>
      <div class="flex gap-2">
        <button
          v-for="option in sortOptions"
          :key="option.value"
          @click="selectedSort = option.value"
          class="px-3 py-1 rounded-lg text-sm transition"
          :class="selectedSort === option.value ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300'"
        >
          {{ $t(`friends.${option.label}`) }}
        </button>
      </div>
    </div>

    <!-- Hand type filter (only visible when sorting by special hands) -->
    <div v-if="selectedSort === 'specialHands'" class="mb-4">
      <div class="text-xs text-gray-400 mb-2">{{ $t('friends.handType') }}</div>
      <div class="flex gap-2 flex-wrap">
        <button
          @click="selectedHandType = 'royalFlush'"
          class="px-3 py-1 rounded-lg text-sm transition"
          :class="selectedHandType === 'royalFlush' ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300'"
        >
          {{ $t('friends.royalFlush') }}
        </button>
        <button
          @click="selectedHandType = 'straightFlush'"
          class="px-3 py-1 rounded-lg text-sm transition"
          :class="selectedHandType === 'straightFlush' ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300'"
        >
          {{ $t('friends.straightFlush') }}
        </button>
        <button
          @click="selectedHandType = 'fourOfAKind'"
          class="px-3 py-1 rounded-lg text-sm transition"
          :class="selectedHandType === 'fourOfAKind' ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300'"
        >
          {{ $t('friends.fourOfAKind') }}
        </button>
        <button
          @click="selectedHandType = 'fullHouse'"
          class="px-3 py-1 rounded-lg text-sm transition"
          :class="selectedHandType === 'fullHouse' ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300'"
        >
          {{ $t('friends.fullHouse') }}
        </button>
        <button
          @click="selectedHandType = 'total'"
          class="px-3 py-1 rounded-lg text-sm transition"
          :class="selectedHandType === 'total' ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300'"
        >
          {{ $t('friends.allHands') }}
        </button>
      </div>
    </div>

    <!-- Leaderboard -->
    <div class="space-y-2">
      <div
        v-for="(entry, index) in leaderboard"
        :key="entry.uid"
        @click="selectedSort === 'specialHands' && handleViewHandDetails(entry)"
        class="flex items-center gap-3 p-3 rounded-lg"
        :class="[
          entry.uid === user?.uid ? 'bg-amber-600/20 border border-amber-600/50' : 'bg-slate-700',
          selectedSort === 'specialHands' ? 'cursor-pointer hover:bg-slate-600 transition-colors' : ''
        ]"
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

        <!-- Profit / Win Rate / Special Hands -->
        <div class="text-right">
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
            <span v-if="selectedSort === 'profit'">{{ entry.winRate }}% win rate</span>
            <span v-else-if="selectedSort === 'winRate'">{{ formatNumber(entry.profit) }} profit</span>
            <span v-else-if="selectedSort === 'specialHands'">{{ entry.winRate }}% win rate</span>
          </div>
        </div>
      </div>

      <div v-if="leaderboard.length === 0" class="text-center text-gray-500 py-8">
        No data available
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
const leaderboardData = ref([]);
const specialHandsData = ref({});
const showHandDetailsModal = ref(false);
const selectedUserId = ref('');
const selectedUserName = ref('');

const periods = [
  { value: 'thisMonth', label: 'thisMonth' },
  { value: 'thisQuarter', label: 'thisQuarter' },
  { value: 'thisYear', label: 'thisYear' }
];

const sortOptions = [
  { value: 'profit', label: 'sortByProfit' },
  { value: 'winRate', label: 'sortByWinRate' },
  { value: 'specialHands', label: 'sortBySpecialHands' }
];

const leaderboard = computed(() => {
  // Filter by selected period using actual calendar boundaries
  const now = new Date();
  let cutoffTime;

  if (selectedPeriod.value === 'thisMonth') {
    // First day of current month at 00:00:00
    cutoffTime = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  } else if (selectedPeriod.value === 'thisQuarter') {
    // First day of current quarter at 00:00:00
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    cutoffTime = new Date(now.getFullYear(), quarterMonth, 1).getTime();
  } else {
    // thisYear: first day of current year at 00:00:00
    cutoffTime = new Date(now.getFullYear(), 0, 1).getTime();
  }
  
  // Filter data by selected period
  const filteredData = leaderboardData.value.map(entry => {
    const periodHistory = entry.history.filter(h => {
      // createdAt is already normalized to millis by loadLeaderboard
      const timestamp = typeof h.createdAt === 'number' ? h.createdAt : 0;
      return timestamp > 0 && timestamp >= cutoffTime;
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
    
    // Get special hands count for this user
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
  const validEntries = filteredData.filter(entry => entry.games > 0);
  
  // Sort based on selected mode
  let sorted = [...validEntries];
  if (selectedSort.value === 'profit') {
    sorted.sort((a, b) => b.profit - a.profit);
  } else if (selectedSort.value === 'winRate') {
    sorted.sort((a, b) => b.winRate - a.winRate);
  } else if (selectedSort.value === 'specialHands') {
    // When sorting by special hands, filter out entries with specialHands === 0
    sorted = sorted.filter(entry => entry.specialHands > 0);
    sorted.sort((a, b) => b.specialHands - a.specialHands);
  }
  
  return sorted.slice(0, 10);
});

const getRankClass = (index) => {
  if (index === 0) return 'bg-amber-500 text-white';
  if (index === 1) return 'bg-gray-400 text-white';
  if (index === 2) return 'bg-orange-700 text-white';
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

onMounted(() => {
  loadLeaderboard();
  loadSpecialHands();
});
</script>
