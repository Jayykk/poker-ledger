<template>
  <BaseModal
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="$t('hand.viewDetails')"
  >
    <div v-if="hand" class="space-y-4">
      <!-- Community Cards -->
      <div v-if="hand.communityCards && hand.communityCards.length > 0" class="bg-slate-900 rounded-lg p-4">
        <div class="text-xs text-gray-400 mb-2">{{ $t('hand.communityCards') }}</div>
        <div class="flex gap-2 flex-wrap">
          <div
            v-for="(card, idx) in hand.communityCards"
            :key="idx"
            class="w-12 h-16 bg-white rounded border-2 border-gray-300 flex items-center justify-center"
          >
            <span :class="getCardColor(card)" class="text-xl font-bold">
              {{ card }}
            </span>
          </div>
        </div>
      </div>

      <!-- Players -->
      <div class="space-y-2">
        <div
          v-for="(player, idx) in hand.players"
          :key="idx"
          class="bg-slate-900 rounded-lg p-3"
        >
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <div class="font-bold text-white mb-2">{{ player.playerName }}</div>
              
              <!-- Player cards -->
              <div class="flex gap-2 mb-2">
                <div
                  v-for="(card, cardIdx) in player.cards"
                  :key="cardIdx"
                  class="w-10 h-14 bg-white rounded border border-gray-300 flex items-center justify-center"
                >
                  <span :class="getCardColor(card)" class="text-lg font-bold">
                    {{ card }}
                  </span>
                </div>
                <div v-if="!player.cards || player.cards.length === 0" class="text-gray-500 text-sm">
                  --
                </div>
              </div>
              
              <!-- Hand type -->
              <div v-if="player.handType" class="text-xs text-gray-400">
                {{ $t(`hand.handTypes.${player.handType}`) }}
              </div>
            </div>

            <!-- Chips -->
            <div
              class="font-mono font-bold text-lg"
              :class="player.chips >= 0 ? 'text-emerald-400' : 'text-rose-400'"
            >
              {{ player.chips > 0 ? '+' : '' }}{{ player.chips }}
            </div>
          </div>
        </div>
      </div>

      <!-- Timestamp -->
      <div class="text-xs text-gray-500 text-center">
        {{ formatDateTime(hand.createdAt) }}
      </div>
    </div>
  </BaseModal>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import BaseModal from '../common/BaseModal.vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  hand: {
    type: Object,
    default: null
  }
});

defineEmits(['update:modelValue']);

const { t } = useI18n();

const getCardColor = (card) => {
  if (card.includes('♥') || card.includes('♦')) {
    return 'text-red-500';
  }
  return 'text-gray-900';
};

const formatDateTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};
</script>
