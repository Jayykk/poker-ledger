<template>
  <div>
    <!-- Selected cards display -->
    <div v-if="selectedCards.length > 0" class="flex gap-2 mb-3 flex-wrap">
      <div
        v-for="(card, idx) in selectedCards"
        :key="idx"
        class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-700 border border-slate-600"
      >
        <span :class="getCardColor(card)">{{ card }}</span>
        <button
          @click="removeCard(idx)"
          class="text-gray-400 hover:text-white text-xs"
        >
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>

    <!-- Card selection UI -->
    <div v-if="selectedCards.length < maxCards" class="space-y-3">
      <!-- Step 1: Select suit -->
      <div class="grid grid-cols-4 gap-2">
        <button
          v-for="(symbol, suit) in SUITS"
          :key="suit"
          @click="selectSuit(suit)"
          :class="[
            'p-3 rounded-lg text-2xl transition',
            selectedSuit === suit 
              ? 'bg-amber-600 text-white' 
              : 'bg-slate-700 hover:bg-slate-600 text-gray-300'
          ]"
        >
          <div :class="getCardColor(symbol)">{{ symbol }}</div>
          <div class="text-[10px] mt-1">{{ $t(`hand.${getSuitName(suit)}`) }}</div>
        </button>
      </div>

      <!-- Step 2: Select rank (shown when suit is selected) -->
      <div v-if="selectedSuit" class="space-y-2">
        <div class="text-xs text-gray-400">{{ $t('hand.selectRank') }}</div>
        <div class="grid grid-cols-7 gap-2">
          <button
            v-for="rank in RANKS"
            :key="rank"
            @click="selectRank(rank)"
            :disabled="isRankDisabled(rank)"
            :class="[
              'p-2 rounded-lg text-sm font-bold transition',
              isRankDisabled(rank)
                ? 'bg-slate-800 text-gray-600 cursor-not-allowed opacity-50'
                : 'bg-slate-700 hover:bg-slate-600 text-white'
            ]"
          >
            {{ rank }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="selectedCards.length >= maxCards" class="text-xs text-gray-400 text-center">
      {{ $t('common.max') }} {{ maxCards }} {{ $t('hand.selectedCards') }}
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { SUITS, RANKS } from '../../utils/constants.js';

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  maxCards: {
    type: Number,
    default: 5
  },
  excludedCards: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['update:modelValue']);

const selectedCards = ref([...props.modelValue]);
const selectedSuit = ref(null);

watch(() => props.modelValue, (newVal) => {
  selectedCards.value = [...newVal];
});

// Check if a specific rank + current suit is excluded
const isRankDisabled = (rank) => {
  if (!selectedSuit.value) return false;
  const card = rank + SUITS[selectedSuit.value];
  return selectedCards.value.includes(card) || props.excludedCards.includes(card);
};

const getSuitName = (suit) => {
  const names = {
    SPADES: 'spades',
    HEARTS: 'hearts',
    DIAMONDS: 'diamonds',
    CLUBS: 'clubs'
  };
  return names[suit];
};

const getCardColor = (card) => {
  if (card.includes('♥') || card.includes('♦')) {
    return 'text-red-500';
  }
  return 'text-gray-900 dark:text-white';
};

const selectSuit = (suit) => {
  selectedSuit.value = suit;
};

const selectRank = (rank) => {
  if (selectedCards.value.length >= props.maxCards) return;
  
  const card = rank + SUITS[selectedSuit.value];
  
  // Check if card is already selected or excluded
  if (selectedCards.value.includes(card) || props.excludedCards.includes(card)) {
    return;
  }
  
  selectedCards.value.push(card);
  emit('update:modelValue', selectedCards.value);
  selectedSuit.value = null;
};

const removeCard = (index) => {
  selectedCards.value.splice(index, 1);
  emit('update:modelValue', selectedCards.value);
};
</script>
