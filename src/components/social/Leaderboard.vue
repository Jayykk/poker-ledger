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

    <!-- 只看牌友: me + my 牌友圈 (userTitles pals), remembered on this device -->
    <div class="flex items-center gap-2 mb-3 min-w-0">
      <button
        type="button"
        @click="togglePalsOnly"
        class="px-3 py-1 rounded-lg text-sm transition flex-shrink-0"
        :class="palsOnly ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300 hover:bg-slate-600'"
        :aria-pressed="palsOnly"
        :title="$t('friends.palsHint')"
      >
        <i class="fas fa-user-group mr-1"></i>{{ $t('friends.palsOnly') }}
      </button>
      <span v-if="palsOnly" class="text-xs text-gray-400 truncate">
        {{ myPals.length ? $t('friends.palsCount', { n: myPals.length }) : $t('friends.noPals') }}
      </span>
    </div>

    <!-- Game format filter (hidden for special hands: counted the same in cash and tournaments) -->
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

    <!-- Min games filter for percentage-based rankings -->
    <div v-if="['winRate', 'itm', 'roi'].includes(selectedSort)" class="mb-3 flex items-center gap-2 text-xs text-gray-400">
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
        class="lb-row p-3 rounded-lg transition-colors"
        :class="[
          entry.uid === user?.uid ? 'bg-amber-600/20 border border-amber-600/50' : 'bg-slate-700',
          selectedSort === 'specialHands' ? 'cursor-pointer hover:bg-slate-600' : ''
        ]"
      >
        <!-- Rank: medal for top 3, number otherwise -->
        <div class="lb-rank w-8 h-8 rounded-full flex items-center justify-center font-bold text-base"
          :class="getRankClass(index)"
        >
          <span v-if="index === 0">🥇</span>
          <span v-else-if="index === 1">🥈</span>
          <span v-else-if="index === 2">🥉</span>
          <span v-else>{{ index + 1 }}</span>
        </div>

        <div class="lb-avatar"><PlayerAvatar size="sm" :src="avatarSrcOf(entry, user)" :name="entry.name" :uid="entry.uid" /></div>

        <div class="lb-body">
          <div class="lb-head">
            <div class="lb-who">
              <div class="text-white font-bold flex items-center gap-1.5 min-w-0">
                <span class="truncate">{{ entry.name }}</span>
                <span v-if="entry.uid === user?.uid" class="text-xs text-amber-400 flex-shrink-0">{{ $t('friends.you') }}</span>
              </div>
              <!-- Its own line under the name (as in a room), so neither is cut to "…" -->
              <div class="title-line"><TitleBadge :uid="entry.uid" /></div>
            </div>
            <!-- The number: beside the name, or under it when the row is too narrow -->
            <div class="lb-stat">
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
              <div v-else-if="selectedSort === 'itm'" class="text-xl font-mono font-bold text-emerald-400">
                {{ entry.itmRate.toFixed(1) }}%
              </div>
              <div v-else-if="selectedSort === 'roi'" class="text-xl font-mono font-bold" :class="roiClass(entry.roi)">
                {{ entry.roi > 0 ? '+' : '' }}{{ entry.roi.toFixed(1) }}%
              </div>
              <div v-else-if="selectedSort === 'hunter'" class="text-xl font-mono font-bold text-rose-300">
                🎯 {{ entry.knockouts }}
              </div>
              <div v-else-if="selectedSort === 'lucky'" class="text-xl font-mono font-bold text-amber-400">
                ${{ formatNumber(entry.mysteryWon) }}
              </div>
              <div v-else-if="selectedSort === 'specialHands'"
                class="text-xl font-mono font-bold text-amber-400"
              >
                {{ entry.specialHands }}
              </div>
            </div>
          </div>
          <div class="lb-meta">
            <span v-for="(part, i) in metaParts(entry)" :key="i" class="lb-part">{{ part }}</span>
          </div>
        </div>
      </div>

      <!-- Your rank (when user is outside top 10) -->
      <div
        v-if="myRankInfo"
        class="mt-3 pt-3 border-t border-slate-600"
      >
        <div class="lb-row p-3 rounded-lg bg-amber-600/20 border border-amber-600/50">
          <div class="lb-rank w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-slate-600 text-gray-200">
            {{ myRankInfo.rank }}
          </div>
          <div class="lb-avatar"><PlayerAvatar size="sm" :src="avatarSrcOf(myRankInfo, user)" :name="myRankInfo.name" :uid="myRankInfo.uid" /></div>
          <div class="lb-body">
            <div class="lb-head">
              <div class="lb-who">
                <div class="text-white font-bold flex items-center gap-1.5 min-w-0">
                  <span class="truncate">{{ myRankInfo.name }}</span>
                  <span class="text-xs text-amber-400 flex-shrink-0">{{ $t('friends.you') }}</span>
                </div>
                <div class="title-line"><TitleBadge :uid="myRankInfo.uid" /></div>
              </div>
              <!-- The number: beside the name, or under it when the row is too narrow -->
              <div class="lb-stat">
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
                <div v-else-if="selectedSort === 'itm'" class="text-xl font-mono font-bold text-emerald-400">
                  {{ myRankInfo.itmRate.toFixed(1) }}%
                </div>
                <div v-else-if="selectedSort === 'roi'" class="text-xl font-mono font-bold" :class="roiClass(myRankInfo.roi)">
                  {{ myRankInfo.roi > 0 ? '+' : '' }}{{ myRankInfo.roi.toFixed(1) }}%
                </div>
                <div v-else-if="selectedSort === 'hunter'" class="text-xl font-mono font-bold text-rose-300">
                  🎯 {{ myRankInfo.knockouts }}
                </div>
                <div v-else-if="selectedSort === 'lucky'" class="text-xl font-mono font-bold text-amber-400">
                  ${{ formatNumber(myRankInfo.mysteryWon) }}
                </div>
                <div v-else-if="selectedSort === 'specialHands'"
                  class="text-xl font-mono font-bold text-amber-400"
                >
                  {{ myRankInfo.specialHands }}
                </div>
              </div>
            </div>
            <div class="lb-meta">
              <span v-for="(part, i) in metaParts(myRankInfo)" :key="i" class="lb-part">{{ part }}</span>
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
      :periodKey="currentPeriodKey(selectedPeriod)"
    />
  </BaseCard>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase-init.js';
import { useAuth } from '../../composables/useAuth.js';
import BaseCard from '../common/BaseCard.vue';
import TitleBadge from '../common/TitleBadge.vue';
import PlayerAvatar from '../common/PlayerAvatar.vue';
import { avatarSrcOf } from '../../utils/avatar.js';
import HandDetailsModal from './HandDetailsModal.vue';
import { formatNumber } from '../../utils/formatters.js';
// Shared with the Cloud Function recompute so period boundaries always agree.
// (Vite bundles across functions/; the reverse import direction would not
// survive `firebase deploy`, which uploads the functions folder only.)
import { periodKeysForMillis } from '../../../functions/src/utils/leaderboardStatsMath.js';
import { buildTournamentLeaderboardEntry, filterToCircle, rankLeaderboardEntries } from '../../utils/leaderboardRanking.js';
import { STORAGE_KEYS } from '../../utils/constants.js';
import { ensureUserTitles, palsOf } from '../../composables/useUserTitles.js';

const { t } = useI18n();
const { user } = useAuth();

// 只看牌友 (storage can be blocked: private mode, LIFF)
const readPalsOnly = () => {
  try {
    return localStorage.getItem(STORAGE_KEYS.LEADERBOARD_PALS_ONLY) === 'true';
  } catch {
    return false;
  }
};
const palsOnly = ref(readPalsOnly());
const togglePalsOnly = () => {
  palsOnly.value = !palsOnly.value;
  try {
    localStorage.setItem(STORAGE_KEYS.LEADERBOARD_PALS_ONLY, String(palsOnly.value));
  } catch {
    // Not remembered; the toggle still works for this visit
  }
};
// My pals come with my userTitles doc (the same cached read my badge makes)
const myPals = computed(() => palsOf(user.value?.uid));
watch(() => user.value?.uid, (uid) => {
  if (uid) ensureUserTitles(uid);
}, { immediate: true });

const selectedPeriod = ref('thisMonth');
const selectedGameType = ref('all');
const selectedSort = ref('profit');
const selectedHandType = ref('total'); // Filter for special hands: a key of SPECIAL_HAND_STATS
const minGames = ref(3); // Minimum games threshold for win-rate sort
const statsRows = ref([]);
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
    options.push(
      { value: 'champion', label: 'sortByChampion' },
      { value: 'itm', label: 'sortByItm' },
      { value: 'roi', label: 'sortByRoi' },
      { value: 'hunter', label: 'sortByHunter' },
      { value: 'lucky', label: 'sortByLucky' },
    );
  }
  options.push({ value: 'specialHands', label: 'sortBySpecialHands' });
  return options;
});

const handTypeOptions = [
  { value: 'royalFlush', label: 'royalFlush' },
  { value: 'straightFlush', label: 'straightFlush' },
  { value: 'fourOfAKind', label: 'fourOfAKind' },
  { value: 'total', label: 'allHands' }
];
// Special hands come from the period's stats doc (the hand events of its
// games, counted the way 稱號 count them: by the game's date, a board-only
// 四條 belongs to nobody). Each filter → the counts it adds up.
const SPECIAL_HAND_STATS = {
  royalFlush: ['royalFlush'],
  straightFlush: ['straightFlush'],
  fourOfAKind: ['quads'],
  total: ['royalFlush', 'straightFlush', 'quads'],
};
const specialHandsOf = (bucket) => (SPECIAL_HAND_STATS[selectedHandType.value] || [])
  .reduce((sum, key) => sum + (Number(bucket?.[key]) || 0), 0);

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
  // Special hands are counted in the total bucket only (cash and tournaments
  // alike) — always rank them against it.
  const bucketKey = selectedSort.value === 'specialHands' ? 'all' : selectedGameType.value;

  const rows = palsOnly.value ? filterToCircle(statsRows.value, user.value?.uid, myPals.value) : statsRows.value;
  const entries = rows.map((row) => {
    const bucket = bucketKey === 'all' ? row.total : row[bucketKey];
    if (!bucket || bucket.games <= 0) return null;

    const baseEntry = {
      uid: row.uid,
      name: row.name,
      games: bucket.games,
      profit: Math.round(bucket.profit),
      winRate: Math.round((bucket.wins / bucket.games) * 100),
      champion: row.tournament?.champion || 0,
      runnerUp: row.tournament?.runnerUp || 0,
      specialHands: specialHandsOf(row.total)
    };
    return bucketKey === 'tournament'
      ? { ...baseEntry, ...buildTournamentLeaderboardEntry(row), specialHands: baseEntry.specialHands }
      : baseEntry;
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
  if (['itm', 'roi', 'hunter', 'lucky'].includes(selectedSort.value)) {
    return rankLeaderboardEntries(entries, selectedSort.value, minGames.value);
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

// The sort's second stat, shown after the games count under the name
const statLine = (entry) => {
  switch (selectedSort.value) {
    case 'profit':
    case 'specialHands': return `${entry.winRate}% ${t('friends.winRateLabel')}`;
    case 'winRate': return `${formatNumber(entry.profit)} ${t('friends.profitLabel')}`;
    case 'champion': return `🥈 ${entry.runnerUp}`;
    case 'itm': return t('friends.itmCount', { n: entry.itmCount });
    case 'roi': return entry.rebuyComplete ? t('friends.rebuyCount', { n: entry.rebuyCount }) : t('common.unknown');
    case 'hunter': return t('friends.bountyWon', { amount: formatNumber(entry.bountyWon) });
    case 'lucky': return t('friends.luckyLine', { draws: entry.draws, top: entry.topDraws, rate: entry.topRate });
    default: return '';
  }
};
// Cut at " · " so a narrow row (a phone's large system font, LINE's in-app
// browser) wraps between parts, never inside one
const metaParts = (entry) => [
  t('friends.gamesCount', { n: entry.games }),
  ...statLine(entry).split(' · '),
].filter(Boolean);

const roiClass = (roi) => roi > 0 ? 'text-emerald-400' : roi < 0 ? 'text-rose-400' : 'text-gray-300';

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
  if (gameType !== 'tournament' && ['champion', 'itm', 'roi'].includes(selectedSort.value)) {
    selectedSort.value = 'profit';
  }
});

const handleViewHandDetails = (entry) => {
  selectedUserId.value = entry.uid;
  selectedUserName.value = entry.name;
  showHandDetailsModal.value = true;
};

onMounted(async () => {
  isLoading.value = true;
  try {
    await loadStats();
  } finally {
    isLoading.value = false;
  }
});
</script>

<style scoped>
/* Rank, avatar, then the body: the name (its title under it) beside the
   number, and the games / second-stat line under both. A narrow row (a
   phone's large system font, LINE's in-app browser) never squeezes the name
   to one letter: the line wraps between its parts, and past that the number
   drops under the name */
.lb-row { display: flex; align-items: center; gap: 0.5rem; }
.lb-rank, .lb-avatar { flex-shrink: 0; }
.lb-avatar { display: flex; }
.lb-body { flex: 1 1 0; min-width: 0; }
.lb-head { display: flex; flex-wrap: wrap; align-items: center; column-gap: 0.5rem; }
.lb-who { flex: 1 1 0; min-width: 4.5em; }
.lb-stat { margin-left: auto; text-align: right; white-space: nowrap; }
.lb-meta { font-size: 0.75rem; line-height: 1.35; color: rgb(var(--tw-gray-400)); }
/* A part moves to the next line whole (its " ·" with it); only one wider
   than the line breaks inside */
.lb-part { display: inline-block; max-width: 100%; }
.lb-part:not(:last-child) { margin-right: 0.35em; }
.lb-part:not(:last-child)::after { content: ' ·'; }
</style>
