<template>
  <BaseModal
    v-model="isOpen"
    :title="modalTitle"
    closable
  >
    <div v-if="loading" class="flex justify-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
    </div>
    
    <div v-else-if="hands.length === 0" class="text-center text-gray-400 py-8">
      {{ $t('hand.noHandRecords') }}
    </div>
    
    <div v-else class="space-y-4">
      <div
        v-for="(hand, index) in hands"
        :key="index"
        class="bg-slate-700 rounded-lg p-4"
      >
        <!-- Hand Type -->
        <div class="flex items-center justify-between mb-3">
          <div class="text-amber-400 font-bold">
            {{ $t(`hand.handTypes.${hand.handType}`) }}
          </div>
          <div class="text-xs text-gray-400">
            {{ formatDate(hand.createdAt) }}
          </div>
        </div>
        
        <!-- Community Cards -->
        <div class="mb-2">
          <div class="text-xs text-gray-400 mb-1">{{ $t('hand.communityCards') }}</div>
          <div class="flex gap-1 flex-wrap">
            <div
              v-for="(card, cardIndex) in hand.communityCards"
              :key="cardIndex"
              class="px-2 py-1 rounded text-sm font-mono"
              :class="[
                getCardColor(card),
                isHandCard(card, hand) 
                  ? 'bg-amber-600 ring-2 ring-amber-400' 
                  : 'bg-slate-600'
              ]"
            >
              {{ card }}
            </div>
          </div>
        </div>
        
        <!-- Player Cards -->
        <div v-if="hand.playerCards && hand.playerCards.length > 0">
          <div class="text-xs text-gray-400 mb-1">{{ $t('game.playerName') }}</div>
          <div class="flex gap-1 flex-wrap">
            <div
              v-for="(card, cardIndex) in hand.playerCards"
              :key="cardIndex"
              class="px-2 py-1 rounded text-sm font-mono"
              :class="[
                getCardColor(card),
                isHandCard(card, hand) 
                  ? 'bg-amber-600 ring-2 ring-amber-400' 
                  : 'bg-slate-600'
              ]"
            >
              {{ card }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { collection, query, where, getDocs, limit, orderBy, collectionGroup } from 'firebase/firestore';
import { db } from '../../firebase-init.js';
import BaseModal from '../common/BaseModal.vue';
import { formatDate } from '../../utils/formatters.js';
import { SUITS, SPECIAL_HAND_TYPES } from '../../utils/constants.js';
import { getHandCards } from '../../utils/pokerHandEvaluator.js';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  userId: {
    type: String,
    default: ''
  },
  userName: {
    type: String,
    default: ''
  },
  handType: {
    type: String,
    default: 'total' // 'total', 'royalFlush', 'straightFlush', 'fourOfAKind', 'fullHouse'
  }
});

const emit = defineEmits(['update:modelValue']);

const { t } = useI18n();
const hands = ref([]);
const loading = ref(false);

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const modalTitle = computed(() => {
  if (props.userName) {
    return `${props.userName} - ${t('hand.handRecords')}`;
  }
  return t('hand.handRecords');
});

const getCardColor = (card) => {
  if (!card) return 'text-white';
  const suit = card.slice(-1);
  if (suit === SUITS.HEARTS || suit === SUITS.DIAMONDS) {
    return 'text-rose-400';
  }
  return 'text-white';
};

// Check if a card is part of the hand
const isHandCard = (card, hand) => {
  if (!hand || !hand.playerCards || !hand.communityCards) return false;
  const handCards = getHandCards(hand.playerCards, hand.communityCards);
  return handCards.includes(card);
};

const loadHandDetails = async () => {
  if (!props.userId) return;
  
  loading.value = true;
  hands.value = [];
  
  try {
    // Query all hands from all games
    // Note: Firestore collectionGroup queries don't support compound where clauses on player data
    // since players are in an array. For optimization with large datasets, consider:
    // 1. Creating a separate collection for special hands indexed by userId
    // 2. Implementing server-side filtering via Cloud Functions
    const handsQuery = query(
      collectionGroup(db, 'hands'),
      orderBy('createdAt', 'desc')
    );
    
    const handsSnapshot = await getDocs(handsQuery);
    const userHands = [];
    
    // Map hand type filter to constant values
    const handTypeMap = {
      'royalFlush': 'royal_flush',
      'straightFlush': 'straight_flush',
      'fourOfAKind': 'four_of_a_kind',
      'fullHouse': 'full_house'
    };
    
    handsSnapshot.forEach((doc) => {
      const handData = doc.data();
      
      if (handData.players && Array.isArray(handData.players)) {
        handData.players.forEach(player => {
          // Use playerUid if available, otherwise fall back to playerId
          const playerId = player.playerUid || player.playerId;
          
          if (playerId === props.userId && player.handType) {
            // If filtering by specific hand type, only include matching hands
            if (props.handType !== 'total') {
              const targetHandType = handTypeMap[props.handType];
              if (player.handType !== targetHandType) {
                return;
              }
            }
            
            // Only include special hands (royal flush, straight flush, four of a kind, full house)
            if (SPECIAL_HAND_TYPES.includes(player.handType)) {
              userHands.push({
                handType: player.handType,
                playerCards: player.cards || [],
                communityCards: handData.communityCards || [],
                createdAt: handData.createdAt
              });
            }
          }
        });
      }
    });
    
    // Take only the last 5 hands
    hands.value = userHands.slice(0, 5);
  } catch (err) {
    console.error('Load hand details error:', err);
  } finally {
    loading.value = false;
  }
};

// Watch for modal open and userId changes
watch(() => props.modelValue, (newValue) => {
  if (newValue) {
    loadHandDetails();
  }
});

watch(() => props.userId, () => {
  if (props.modelValue) {
    loadHandDetails();
  }
});

watch(() => props.handType, () => {
  if (props.modelValue) {
    loadHandDetails();
  }
});
</script>
