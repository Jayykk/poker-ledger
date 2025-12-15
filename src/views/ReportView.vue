<template>
  <div class="pt-8 px-4 pb-24">
    <h2 class="text-2xl font-bold text-white mb-6">{{ $t('report.title') }}</h2>

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

    <!-- History -->
    <h3 class="text-sm font-bold text-gray-400 mb-2">{{ $t('report.history') }}</h3>
    
    <div v-if="formattedHistory.length === 0" class="text-center text-gray-500 py-6">
      {{ $t('report.noRecords') }}
    </div>
    
    <div class="space-y-3">
      <BaseCard
        v-for="(record, i) in formattedHistory"
        :key="i"
        padding="md"
        @click="handleRecordClick(record)"
        class="cursor-pointer hover:bg-slate-700/50 transition-colors"
      >
        <div class="flex justify-between items-center">
          <div>
            <div class="text-white font-bold">{{ record.gameName || 'Untitled' }}</div>
            <div class="text-xs text-gray-400">{{ record.dateStr }}</div>
          </div>
          <div class="text-right">
            <div
              class="font-mono font-bold"
              :class="record.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'"
            >
              {{ record.profit > 0 ? '+' : '' }}{{ formatNumber(record.profit) }}
            </div>
            <div class="text-[10px] text-gray-500">
              Cash: {{ formatCash(record.profit, record.rate) }}
            </div>
          </div>
        </div>
      </BaseCard>
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
import BaseCard from '../components/common/BaseCard.vue';
import BaseButton from '../components/common/BaseButton.vue';
import SettlementDetailModal from '../components/common/SettlementDetailModal.vue';
import ProfitTrendChart from '../components/chart/ProfitTrendChart.vue';
import WinRateChart from '../components/chart/WinRateChart.vue';
import { formatNumber, formatCash } from '../utils/formatters.js';
import { exportHistoryToCSV } from '../utils/exportReport.js';

const { t } = useI18n();
const userStore = useUserStore();
const { success } = useNotification();

const formattedHistory = computed(() => userStore.formattedHistory);

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
