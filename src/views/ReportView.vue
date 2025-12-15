<template>
  <div class="pt-8 px-4 pb-24">
    <h2 class="text-2xl font-bold text-white mb-6">{{ $t('report.title') }}</h2>

    <!-- Tab selector -->
    <div class="flex gap-2 mb-6">
      <button
        @click="activeTab = 'recent'"
        class="px-4 py-2 rounded-lg text-sm transition"
        :class="activeTab === 'recent' ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300'"
      >
        {{ $t('report.recentRecords') }}
      </button>
      <button
        @click="activeTab = 'career'"
        class="px-4 py-2 rounded-lg text-sm transition"
        :class="activeTab === 'career' ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300'"
      >
        {{ $t('report.careerStats') }}
      </button>
    </div>

    <!-- Recent Records Tab -->
    <div v-if="activeTab === 'recent'">
      <!-- Game count selector -->
      <div class="flex gap-2 mb-4">
        <button
          v-for="count in gameCounts"
          :key="count"
          @click="selectedGameCount = count"
          class="px-3 py-1 rounded-lg text-sm transition"
          :class="selectedGameCount === count ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300'"
        >
          {{ $t('report.lastNGames', { n: count }) }}
        </button>
      </div>

      <!-- Recent records list -->
      <div v-if="recentRecords.length === 0" class="text-center text-gray-500 py-6">
        {{ $t('report.noRecords') }}
      </div>
      
      <div class="space-y-2">
        <div
          v-for="(record, i) in recentRecords"
          :key="i"
          @click="handleRecordClick(record)"
          class="flex items-center gap-3 p-3 rounded-lg bg-slate-700 cursor-pointer hover:bg-slate-700/50 transition-colors"
        >
          <!-- Game number -->
          <div class="flex-shrink-0 w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-sm font-bold text-gray-300">
            {{ i + 1 }}
          </div>

          <!-- Game info -->
          <div class="flex-1">
            <div class="text-white font-bold">{{ record.gameName || 'Untitled' }}</div>
            <div class="text-xs text-gray-400">{{ record.dateStr }}</div>
          </div>

          <!-- Result -->
          <div class="text-right">
            <div class="text-sm text-gray-400">
              {{ record.profit >= 0 ? $t('report.win') : $t('report.loss') }}
            </div>
            <div
              class="text-lg font-mono font-bold"
              :class="record.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'"
            >
              {{ record.profit > 0 ? '+' : '' }}{{ formatNumber(record.profit) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Career Stats Tab -->
    <div v-if="activeTab === 'career'">
      <!-- Charts -->
      <div class="space-y-4 mb-6">
        <ProfitTrendChart />
        <WinRateChart />
      </div>

      <!-- Export buttons -->
      <div class="flex gap-3 mb-6">
        <BaseButton @click="handleExportCSV" variant="ghost" fullWidth>
          <i class="fas fa-file-csv mr-2"></i>{{ $t('report.exportCSV') }}
        </BaseButton>
      </div>
    </div>
    
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
import { useUserStore } from '../store/modules/user.js';
import { useNotification } from '../composables/useNotification.js';
import BaseButton from '../components/common/BaseButton.vue';
import SettlementDetailModal from '../components/common/SettlementDetailModal.vue';
import ProfitTrendChart from '../components/chart/ProfitTrendChart.vue';
import WinRateChart from '../components/chart/WinRateChart.vue';
import { formatNumber, formatDate } from '../utils/formatters.js';
import { exportHistoryToCSV } from '../utils/exportReport.js';

const { t } = useI18n();
const userStore = useUserStore();
const { success } = useNotification();

const activeTab = ref('recent');
const selectedGameCount = ref(10);
const gameCounts = [5, 10, 20];

const recentRecords = computed(() => {
  // Get sorted history (newest first)
  const sorted = [...userStore.history]
    .sort((a, b) => {
      const dateA = typeof a.createdAt === 'number' ? a.createdAt : (Date.parse(a.createdAt || a.date) || 0);
      const dateB = typeof b.createdAt === 'number' ? b.createdAt : (Date.parse(b.createdAt || b.date) || 0);
      return dateB - dateA;
    })
    .slice(0, selectedGameCount.value);
  
  // Format with date strings
  return sorted.map(h => ({
    ...h,
    dateStr: formatDate(h.createdAt || h.date)
  }));
});

const showSettlementModal = ref(false);
const selectedRecord = ref(null);

const handleRecordClick = (record) => {
  selectedRecord.value = record;
  showSettlementModal.value = true;
};

const handleExportCSV = () => {
  const filename = `poker-history-${new Date().toISOString().split('T')[0]}.csv`;
  exportHistoryToCSV(userStore.history, filename);
  success('Exported successfully!');
};
</script>
