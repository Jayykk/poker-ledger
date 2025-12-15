<template>
  <div class="space-y-3">
    <h3 class="text-sm font-bold text-gray-400 mb-2">{{ $t('hand.handHistory') }}</h3>
    
    <div v-if="hands.length === 0" class="text-center text-gray-500 py-6">
      {{ $t('hand.noHandRecords') }}
    </div>
    
    <BaseCard
      v-for="hand in hands"
      :key="hand.id"
      padding="md"
      @click="$emit('select', hand)"
      class="cursor-pointer hover:bg-slate-700/50 transition-colors"
    >
      <div class="space-y-2">
        <!-- Community cards -->
        <div v-if="hand.communityCards && hand.communityCards.length > 0" class="flex gap-1 flex-wrap">
          <div class="text-xs text-gray-400 mr-2">{{ $t('hand.communityCards') }}:</div>
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
          <div class="text-xs text-gray-500">
            {{ formatDate(hand.createdAt) }}
          </div>
        </div>
      </div>
    </BaseCard>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseCard from '../common/BaseCard.vue';

const props = defineProps({
  hands: {
    type: Array,
    default: () => []
  }
});

defineEmits(['select']);

const { locale } = useI18n();

const getCardColor = (card) => {
  if (card.includes('♥') || card.includes('♦')) {
    return 'text-red-500';
  }
  return 'text-gray-900 dark:text-white';
};

const getWinnerInfo = (hand) => {
  if (!hand.players || hand.players.length === 0) return '-';
  
  const winners = hand.players
    .filter(p => p.chips > 0)
    .sort((a, b) => b.chips - a.chips);
  
  if (winners.length === 0) return '-';
  
  const topWinner = winners[0];
  return `${topWinner.playerName} (+${topWinner.chips})`;
};

const formatDate = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleString(locale.value, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};
</script>
