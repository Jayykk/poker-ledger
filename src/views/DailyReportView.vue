<template>
  <div class="pt-8 px-4 pb-24">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <button @click="$router.back()" class="text-gray-400 hover:text-white transition">
          <i class="fas fa-arrow-left text-lg"></i>
        </button>
        <h2 class="text-2xl font-bold text-white">{{ $t('dailyReport.title') }}</h2>
      </div>
      <!-- Share dropdown -->
      <div v-if="totalGames > 0" class="flex gap-2">
        <button
          @click="handleShareSettlement"
          class="px-3 py-1.5 rounded-lg text-xs bg-[#06C755] text-white hover:bg-[#05b04d] transition flex items-center gap-1"
        >
          <i class="fab fa-line"></i>
          {{ $t('dailyReport.shareSettlement') }}
        </button>
        <button
          @click="handleShareRanking"
          class="px-3 py-1.5 rounded-lg text-xs bg-[#FF8C00] text-white hover:bg-[#e07e00] transition flex items-center gap-1"
        >
          <i class="fas fa-trophy"></i>
          {{ $t('dailyReport.shareRanking') }}
        </button>
      </div>
    </div>

    <!-- Date Range Picker -->
    <div class="mb-4 space-y-3">
      <div class="flex gap-2 items-center">
        <div class="flex-1">
          <label class="block text-xs text-gray-400 mb-1">{{ $t('dailyReport.startDate') }}</label>
          <input
            type="date"
            :value="startDateStr"
            @input="handleStartDateChange($event.target.value)"
            class="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600 focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div class="flex-1">
          <label class="block text-xs text-gray-400 mb-1">{{ $t('dailyReport.endDate') }}</label>
          <input
            type="date"
            :value="endDateStr"
            @input="handleEndDateChange($event.target.value)"
            class="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600 focus:border-amber-500 focus:outline-none"
          />
        </div>
      </div>
      <!-- Quick date buttons -->
      <div class="flex gap-2">
        <button
          @click="setToday()"
          class="px-3 py-1 rounded-lg text-xs transition"
          :class="isTodaySelected ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300 hover:bg-slate-600'"
        >
          {{ $t('dailyReport.today') }}
        </button>
        <button
          @click="setYesterday()"
          class="px-3 py-1 rounded-lg text-xs transition"
          :class="isYesterdaySelected ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300 hover:bg-slate-600'"
        >
          {{ $t('dailyReport.yesterday') }}
        </button>
        <button
          @click="setLast7Days()"
          class="px-3 py-1 rounded-lg text-xs transition"
          :class="isLast7DaysSelected ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300 hover:bg-slate-600'"
        >
          {{ $t('dailyReport.last7Days') }}
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="gamesInRange.length === 0" class="text-center text-gray-500 py-16">
      <i class="fas fa-calendar-xmark text-4xl mb-4 block"></i>
      <p>{{ $t('dailyReport.noGames') }}</p>
    </div>

    <template v-else>
      <!-- Overview Cards -->
      <div class="grid grid-cols-3 gap-3 mb-6">
        <BaseCard padding="sm">
          <div class="text-center">
            <div class="text-xs text-gray-400 mb-1">{{ $t('dailyReport.totalProfit') }}</div>
            <div
              class="text-xl font-mono font-bold"
              :class="totalProfitCash >= 0 ? 'text-emerald-400' : 'text-rose-400'"
            >
              {{ totalProfitCash > 0 ? '+' : '' }}${{ formatNumber(Math.round(totalProfitCash)) }}
            </div>
          </div>
        </BaseCard>
        <BaseCard padding="sm">
          <div class="text-center">
            <div class="text-xs text-gray-400 mb-1">{{ $t('dailyReport.gamesPlayed') }}</div>
            <div class="text-xl font-mono font-bold text-white">{{ totalGames }}</div>
          </div>
        </BaseCard>
        <BaseCard padding="sm">
          <div class="text-center">
            <div class="text-xs text-gray-400 mb-1">{{ $t('dailyReport.totalBuyIn') }}</div>
            <div class="text-xl font-mono font-bold text-amber-400">${{ formatNumber(Math.round(totalBuyInCash)) }}</div>
          </div>
        </BaseCard>
      </div>

      <!-- Player Ranking -->
      <BaseCard v-if="playerRanking.length > 0" padding="md" class="mb-6">
        <h3 class="text-white font-bold mb-3">
          <i class="fas fa-trophy text-amber-400 mr-2"></i>{{ $t('dailyReport.ranking') }}
        </h3>
        <div class="space-y-2">
          <div
            v-for="(player, index) in playerRanking"
            :key="player.odId || player.name"
            class="flex items-center gap-3 p-2 rounded-lg"
            :class="index < 3 ? 'bg-slate-700/50' : ''"
          >
            <!-- Rank -->
            <div
              class="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
              :class="rankClass(index)"
            >
              {{ index + 1 }}
            </div>
            <!-- Player info -->
            <div class="flex-1 min-w-0">
              <div class="text-white text-sm truncate">{{ player.name }}</div>
              <div class="text-xs text-gray-500">{{ $t('dailyReport.nGames', { n: player.games }) }}</div>
            </div>
            <!-- Profit -->
            <div
              class="font-mono font-bold text-sm"
              :class="player.profitCash >= 0 ? 'text-emerald-400' : 'text-rose-400'"
            >
              {{ player.profitCash > 0 ? '+' : '' }}${{ formatNumber(Math.round(player.profitCash)) }}
            </div>
          </div>
        </div>
      </BaseCard>

      <!-- Game Sessions -->
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-white font-bold">
          <i class="fas fa-list mr-2 text-gray-400"></i>{{ $t('dailyReport.gameSessions') }}
        </h3>
        <button
          @click="allSelected ? deselectAll() : selectAll()"
          class="text-xs text-amber-400 hover:text-amber-300 transition"
        >
          {{ allSelected ? $t('dailyReport.deselectAll') : $t('dailyReport.selectAll') }}
        </button>
      </div>
      <div class="space-y-2">
        <div
          v-for="game in gamesInRangeWithCash"
          :key="gameKey(game)"
          class="flex items-center gap-3 p-3 rounded-lg bg-slate-700 transition-colors"
          :class="isGameSelected(game) ? 'opacity-100' : 'opacity-40'"
        >
          <!-- Checkbox -->
          <button
            @click="toggleGame(game)"
            class="flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition"
            :class="isGameSelected(game) ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-500 text-transparent'"
          >
            <i class="fas fa-check text-xs"></i>
          </button>
          <!-- Game info (clickable for detail) -->
          <div
            class="flex-1 cursor-pointer hover:opacity-80 transition-opacity"
            @click="handleGameClick(game)"
          >
            <div class="text-white font-bold text-sm">{{ game.gameName || $t('dailyReport.untitled') }}</div>
            <div class="text-xs text-gray-400">
              {{ formatDate(game.createdAt || game.date) }}
              <span v-if="game.rate && game.rate !== 1" class="ml-1 text-gray-500">(1:{{ game.rate }})</span>
            </div>
          </div>
          <!-- Profit (cash) -->
          <div class="text-right">
            <div
              class="font-mono font-bold"
              :class="game.profitCash >= 0 ? 'text-emerald-400' : 'text-rose-400'"
            >
              {{ game.profitCash > 0 ? '+' : '' }}${{ formatNumber(Math.round(game.profitCash)) }}
            </div>
            <div v-if="game.rate && game.rate !== 1" class="text-xs text-gray-500 font-mono">
              {{ game.profit > 0 ? '+' : '' }}{{ formatNumber(game.profit) }} chips
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Settlement Detail Modal -->
    <SettlementDetailModal
      v-model="showSettlementModal"
      :record="selectedRecord"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDailyReport } from '../composables/useDailyReport.js';
import { useLiff } from '../composables/useLiff.js';
import { useNotification } from '../composables/useNotification.js';
import BaseCard from '../components/common/BaseCard.vue';
import SettlementDetailModal from '../components/common/SettlementDetailModal.vue';
import { formatNumber, formatDate, formatShortDate } from '../utils/formatters.js';

const { t } = useI18n();
const { success, error: showError } = useNotification();
const { sendDailySettlementMessage, sendDailyRankingMessage } = useLiff();

const {
  startDate,
  endDate,
  gamesInRange,
  selectedGames,
  selectedGamesWithCash,
  toggleGame,
  isGameSelected,
  selectAll,
  deselectAll,
  totalProfitCash,
  totalGames,
  totalBuyInCash,
  playerRanking,
  topWinners,
  topLosers,
  setDateRange,
  setToday,
  gameKey,
} = useDailyReport();

// ── Date helpers ─────────────────────────────────────────────────

const toLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const startDateStr = computed(() => toLocalDateStr(startDate.value));
const endDateStr = computed(() => toLocalDateStr(endDate.value));

const handleStartDateChange = (val) => {
  const d = new Date(val + 'T00:00:00');
  if (!isNaN(d)) setDateRange(d, endDate.value);
};

const handleEndDateChange = (val) => {
  const d = new Date(val + 'T23:59:59.999');
  if (!isNaN(d)) setDateRange(startDate.value, d);
};

const setYesterday = () => {
  const now = new Date();
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  setDateRange(
    new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0),
    new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999),
  );
};

const setLast7Days = () => {
  const now = new Date();
  setDateRange(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0),
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
  );
};

// Quick-date highlight helpers
const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const isTodaySelected = computed(() => {
  const now = new Date();
  return isSameDay(startDate.value, now) && isSameDay(endDate.value, now);
});

const isYesterdaySelected = computed(() => {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return isSameDay(startDate.value, y) && isSameDay(endDate.value, y);
});

const isLast7DaysSelected = computed(() => {
  const now = new Date();
  const d6 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  return isSameDay(startDate.value, d6) && isSameDay(endDate.value, now);
});

const allSelected = computed(() =>
  gamesInRange.value.length > 0 && selectedGames.value.length === gamesInRange.value.length
);

// ── Enriched game list with cash values for display ──────────────
const gamesInRangeWithCash = computed(() =>
  gamesInRange.value.map((h) => {
    const rate = h.rate || 1;
    return { ...h, profitCash: (h.profit || 0) / rate };
  })
);

// ── Settlement modal ─────────────────────────────────────────────
const showSettlementModal = ref(false);
const selectedRecord = ref(null);

const handleGameClick = (game) => {
  selectedRecord.value = game;
  showSettlementModal.value = true;
};

// ── Ranking badge styles ─────────────────────────────────────────
const rankClass = (index) => {
  if (index === 0) return 'bg-amber-500 text-white';
  if (index === 1) return 'bg-gray-400 text-white';
  if (index === 2) return 'bg-amber-700 text-white';
  return 'bg-slate-600 text-gray-300';
};

// ── LINE share ───────────────────────────────────────────────────
const getDateLabel = () =>
  isTodaySelected.value
    ? t('dailyReport.today')
    : `${formatShortDate(startDate.value)} ~ ${formatShortDate(endDate.value)}`;

const handleShareSettlement = async () => {
  const ok = await sendDailySettlementMessage({
    dateLabel: getDateLabel(),
    totalProfitCash: totalProfitCash.value,
    totalGames: totalGames.value,
    games: selectedGamesWithCash.value,
  });
  if (ok) success(t('dailyReport.shared'));
  else showError(t('dailyReport.shareError'));
};

const handleShareRanking = async () => {
  const ok = await sendDailyRankingMessage({
    dateLabel: getDateLabel(),
    topWinners: topWinners.value,
    topLosers: topLosers.value,
  });
  if (ok) success(t('dailyReport.shared'));
  else showError(t('dailyReport.shareError'));
};
</script>
