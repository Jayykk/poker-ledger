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

      <!-- Hand Records Section -->
      <div v-if="record.gameId" class="pt-4 border-t border-slate-700">
        <h4 class="text-sm font-bold text-gray-400 mb-3 flex items-center">
          <i class="fas fa-file-alt mr-2"></i>
          {{ $t('hand.handRecords') }} ({{ hands.length }})
        </h4>
        
        <!-- Loading state -->
        <div v-if="loadingHands" class="text-center text-gray-500 py-4">
          <i class="fas fa-spinner fa-spin mr-2"></i>{{ $t('common.loading') }}
        </div>

        <!-- No records -->
        <div v-else-if="hands.length === 0" class="text-center text-gray-500 py-4">
          {{ $t('hand.noHandRecords') }}
        </div>

        <!-- Hand records list -->
        <div v-else class="space-y-3">
          <div
            v-for="hand in hands"
            :key="hand.id"
            class="bg-slate-700/50 rounded-lg overflow-hidden"
          >
            <!-- Collapsed view (default) -->
            <div
              @click="toggleHand(hand.id)"
              class="p-3 cursor-pointer hover:bg-slate-700/70 transition-colors"
            >
              <div class="space-y-2">
                <!-- Community cards -->
                <div v-if="hand.communityCards && hand.communityCards.length > 0" class="flex gap-1 flex-wrap items-center">
                  <span class="text-xs text-gray-400 mr-2">{{ $t('hand.communityCards') }}:</span>
                  <span
                    v-for="(card, idx) in hand.communityCards"
                    :key="idx"
                    :class="getCardColor(card)"
                    class="font-bold text-sm"
                  >
                    {{ card }}
                  </span>
                </div>

                <!-- Winner info -->
                <div class="flex justify-between items-center">
                  <div class="text-sm">
                    <span class="text-gray-400">{{ $t('hand.winner') }}:</span>
                    <span class="text-white font-bold ml-2">{{ getWinnerInfo(hand) }}</span>
                  </div>
                  <i
                    class="fas text-gray-400 transition-transform"
                    :class="expandedHands[hand.id] ? 'fa-chevron-up' : 'fa-chevron-down'"
                  ></i>
                </div>
              </div>
            </div>

            <!-- Expanded view (participants) -->
            <div
              v-if="expandedHands[hand.id]"
              class="px-3 pb-3 border-t border-slate-600"
            >
              <div class="text-xs text-gray-400 mb-2 mt-3">{{ $t('hand.participants') }}:</div>
              <div class="space-y-2">
                <div
                  v-for="(player, idx) in getParticipants(hand)"
                  :key="idx"
                  class="flex justify-between items-start text-sm"
                >
                  <div class="flex-1">
                    <div class="text-white font-medium mb-1">{{ player.playerName }}</div>
                    <div class="flex gap-2 items-center">
                      <!-- Player cards -->
                      <span
                        v-if="player.cards && player.cards.length > 0"
                        class="text-xs"
                      >
                        <span
                          v-for="(card, cardIdx) in player.cards"
                          :key="cardIdx"
                          :class="getCardColor(card)"
                          class="font-bold mr-1"
                        >
                          {{ card }}
                        </span>
                      </span>
                      <span v-else class="text-gray-500 text-xs">--</span>

                      <!-- Hand type -->
                      <span v-if="player.handType" class="text-gray-400 text-xs">
                        {{ getHandTypeText(player.handType) }}
                      </span>
                      <span v-else class="text-gray-500 text-xs">--</span>
                    </div>
                  </div>

                  <!-- Chips -->
                  <div
                    class="font-mono font-bold text-sm ml-2"
                    :class="player.chips >= 0 ? 'text-emerald-400' : 'text-rose-400'"
                  >
                    {{ player.chips > 0 ? '+' : '' }}{{ player.chips }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from './BaseModal.vue';
import { formatNumber, formatCash, formatDate, getProfitColorClass } from '../../utils/formatters.js';
import { useHand } from '../../composables/useHand.js';

const { t } = useI18n();

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

const { hands, loadHandRecords, cleanup } = useHand();
const loadingHands = ref(false);
const expandedHands = ref({});

const hasSettlement = computed(() => {
  return props.record?.settlement && Array.isArray(props.record.settlement) && props.record.settlement.length > 0;
});

const sortedSettlement = computed(() => {
  if (!hasSettlement.value) return [];
  // Sort by profit (highest first)
  return [...props.record.settlement].sort((a, b) => b.profit - a.profit);
});

// Load hand records when modal opens with a gameId
watch(() => props.modelValue, async (isOpen) => {
  if (isOpen && props.record?.gameId) {
    loadingHands.value = true;
    expandedHands.value = {};
    try {
      await loadHandRecords(props.record.gameId);
    } catch (error) {
      console.error('Failed to load hand records:', error);
    } finally {
      loadingHands.value = false;
    }
  } else if (!isOpen) {
    cleanup();
    expandedHands.value = {};
  }
});

const toggleHand = (handId) => {
  expandedHands.value[handId] = !expandedHands.value[handId];
};

const getCardColor = (card) => {
  if (card.includes('♥') || card.includes('♦')) {
    return 'text-red-500';
  }
  return 'text-white';
};

const getWinnerInfo = (hand) => {
  if (!hand.players || hand.players.length === 0) return '-';
  
  const winners = hand.players
    .filter(p => p.chips > 0)
    .sort((a, b) => b.chips - a.chips);
  
  if (winners.length === 0) return '-';
  
  // If multiple winners (split pot), show all
  if (winners.length > 1) {
    return winners.map(w => `${w.playerName} (+${w.chips})`).join(', ');
  }
  
  const topWinner = winners[0];
  return `${topWinner.playerName} (+${topWinner.chips})`;
};

const getParticipants = (hand) => {
  if (!hand.players) return [];
  // Return all players - the saved data only contains participating players
  return hand.players;
};

const getHandTypeText = (handType) => {
  try {
    const key = `hand.handTypes.${handType}`;
    const translation = t(key);
    // If translation is same as key, it means translation doesn't exist
    return translation === key ? handType : translation;
  } catch (error) {
    return handType;
  }
};
</script>
