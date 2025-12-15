<template>
  <BaseModal
    :modelValue="modelValue"
    @update:modelValue="$emit('update:modelValue', $event)"
    :title="record?.gameName || '牌局結算'"
  >
    <div v-if="record" class="space-y-4">
      <!-- Game Info -->
      <div class="space-y-2 pb-4 border-b border-slate-700">
        <div class="flex items-center text-gray-400">
          <i class="fas fa-dice mr-2"></i>
          <span class="text-sm">{{ record.gameName || '未命名' }}</span>
        </div>
        <div class="flex items-center text-gray-400">
          <i class="fas fa-calendar mr-2"></i>
          <span class="text-sm">{{ formatDate(record.date) }}</span>
        </div>
        <div class="flex items-center text-gray-400">
          <i class="fas fa-coins mr-2"></i>
          <span class="text-sm">匯率: 1:{{ record.rate || 1 }}</span>
        </div>
      </div>

      <!-- Settlement Details -->
      <div v-if="hasSettlement" class="space-y-2">
        <h4 class="text-sm font-bold text-gray-400 mb-3">所有玩家結算</h4>
        <div
          v-for="(player, index) in sortedSettlement"
          :key="index"
          class="flex justify-between items-center p-3 bg-slate-700/50 rounded-lg"
        >
          <div>
            <div class="text-white font-medium">{{ player.name }}</div>
            <div class="text-xs text-gray-400">
              買入: {{ formatNumber(player.buyIn) }} | 籌碼: {{ formatNumber(player.stack) }}
            </div>
          </div>
          <div class="text-right">
            <div
              class="font-mono font-bold text-lg"
              :class="getProfitColorClass(player.profit)"
            >
              {{ player.profit > 0 ? '+' : '' }}{{ formatNumber(player.profit) }}
            </div>
            <div class="text-xs text-gray-500">
              Cash: {{ player.profit > 0 ? '+' : '' }}{{ formatCash(player.profit, record.rate) }}
            </div>
          </div>
        </div>
      </div>

      <!-- No Settlement Data -->
      <div v-else class="text-center text-gray-500 py-4">
        此紀錄無詳細結算資訊
      </div>
    </div>
  </BaseModal>
</template>

<script setup>
import { computed } from 'vue';
import BaseModal from './BaseModal.vue';
import { formatNumber, formatCash, formatDate, getProfitColorClass } from '../../utils/formatters.js';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  record: {
    type: Object,
    default: null
  }
});

defineEmits(['update:modelValue']);

const hasSettlement = computed(() => {
  return props.record?.settlement && Array.isArray(props.record.settlement) && props.record.settlement.length > 0;
});

const sortedSettlement = computed(() => {
  if (!hasSettlement.value) return [];
  // Sort by profit (highest first)
  return [...props.record.settlement].sort((a, b) => b.profit - a.profit);
});
</script>
