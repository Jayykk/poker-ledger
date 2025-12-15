<template>
  <BaseModal
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="$t('hand.recordHandResult')"
    :close-on-click-outside="false"
  >
    <div class="space-y-4 max-h-[70vh] overflow-y-auto">
      <!-- Community Cards -->
      <div class="bg-slate-900 rounded-lg p-3">
        <div class="text-xs text-gray-400 mb-2">{{ $t('hand.communityCards') }}</div>
        <CardPicker v-model="handRecord.communityCards" :max-cards="5" />
      </div>

      <!-- Players -->
      <div class="space-y-3">
        <div
          v-for="(playerRecord, idx) in handRecord.players"
          :key="idx"
          class="bg-slate-900 rounded-lg p-3"
        >
          <!-- Player header with checkbox -->
          <div class="flex items-center gap-2 mb-2">
            <input
              v-model="playerRecord.participating"
              @change="handleParticipationChange(playerRecord)"
              type="checkbox"
              class="w-4 h-4 rounded border-gray-600 text-amber-600 focus:ring-amber-500"
            />
            <span class="text-white font-bold flex-1">{{ playerRecord.playerName }}</span>
          </div>

          <!-- Player details (shown only if participating) -->
          <div v-if="playerRecord.participating" class="space-y-3 pl-6">
            <!-- Chips input -->
            <div>
              <div class="text-xs text-gray-400 mb-1">{{ $t('game.chips') }}</div>
              <ChipsInput v-model="playerRecord.chips" />
            </div>

            <!-- Player cards -->
            <div>
              <div class="text-xs text-gray-400 mb-1">{{ $t('hand.selectCards') }}</div>
              <CardPicker v-model="playerRecord.cards" :max-cards="2" />
            </div>

            <!-- Hand type -->
            <div>
              <div class="text-xs text-gray-400 mb-1">{{ $t('hand.selectHandType') }}</div>
              <select
                v-model="playerRecord.handType"
                class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
              >
                <option value="">{{ $t('hand.selectHandType') }}</option>
                <option
                  v-for="(type, key) in HAND_TYPES"
                  :key="key"
                  :value="type"
                >
                  {{ $t(`hand.handTypes.${type}`) }}
                </option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Chips balance indicator -->
      <div
        :class="[
          'p-3 rounded-lg text-center font-bold',
          isBalanced ? 'bg-emerald-900/50 text-emerald-400' : 'bg-rose-900/50 text-rose-400'
        ]"
      >
        {{ $t('hand.chipsBalance') }}: {{ isBalanced ? '✅' : '❌' }} {{ totalChips }}
      </div>

      <!-- Validation errors -->
      <div v-if="validationErrors.length > 0" class="space-y-1">
        <div
          v-for="(error, idx) in validationErrors"
          :key="idx"
          class="text-xs text-rose-400"
        >
          • {{ error }}
        </div>
      </div>
    </div>

    <!-- Footer with save button -->
    <template #footer>
      <BaseButton
        @click="handleSave"
        :disabled="!isBalanced || validationErrors.length > 0"
        variant="primary"
        fullWidth
      >
        {{ $t('common.save') }}
      </BaseButton>
    </template>
  </BaseModal>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useHand } from '../../composables/useHand.js';
import { useNotification } from '../../composables/useNotification.js';
import { HAND_TYPES, CARD_LIMITS } from '../../utils/constants.js';
import BaseModal from '../common/BaseModal.vue';
import BaseButton from '../common/BaseButton.vue';
import CardPicker from './CardPicker.vue';
import ChipsInput from './ChipsInput.vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  gameId: {
    type: String,
    required: true
  },
  players: {
    type: Array,
    required: true
  }
});

const emit = defineEmits(['update:modelValue', 'saved']);

const { t } = useI18n();
const { createHandRecord } = useHand();
const { success, error } = useNotification();

const handRecord = ref({
  communityCards: [],
  players: []
});

// Initialize player records when players prop changes
watch(() => props.players, (newPlayers) => {
  if (newPlayers && newPlayers.length > 0) {
    handRecord.value.players = newPlayers.map(p => ({
      playerId: p.id,
      playerName: p.name,
      cards: [],
      handType: '',
      chips: 0,
      participating: true
    }));
  }
}, { immediate: true });

// Handle participation changes - reset non-participating players
const handleParticipationChange = (player) => {
  if (!player.participating) {
    player.chips = 0;
    player.cards = [];
    player.handType = '';
  }
};

const totalChips = computed(() => {
  return handRecord.value.players.reduce((sum, p) => sum + (p.chips || 0), 0);
});

const isBalanced = computed(() => totalChips.value === 0);

const allCards = computed(() => {
  const cards = [...handRecord.value.communityCards];
  handRecord.value.players.forEach(p => {
    if (p.participating && p.cards) {
      cards.push(...p.cards);
    }
  });
  return cards;
});

const hasDuplicateCards = computed(() => {
  const cards = allCards.value;
  const cardSet = new Set(cards);
  return cardSet.size !== cards.length;
});

const validationErrors = computed(() => {
  const errors = [];
  
  // Check chips balance
  if (!isBalanced.value) {
    errors.push(t('hand.errors.chipsNotBalanced'));
  }
  
  // Check for duplicate cards
  if (hasDuplicateCards.value) {
    errors.push(t('hand.errors.duplicateCards'));
  }
  
  // Check community cards limit
  if (handRecord.value.communityCards.length > CARD_LIMITS.COMMUNITY_MAX) {
    errors.push(t('hand.errors.tooManyCommunityCards'));
  }
  
  // Check player cards limit
  handRecord.value.players.forEach(p => {
    if (p.participating && p.cards && p.cards.length > CARD_LIMITS.PLAYER_HAND_MAX) {
      errors.push(t('hand.errors.tooManyPlayerCards'));
    }
  });
  
  return errors;
});

const handleSave = async () => {
  if (!isBalanced.value || validationErrors.value.length > 0) {
    return;
  }
  
  const data = {
    communityCards: handRecord.value.communityCards,
    players: handRecord.value.players
      .filter(p => p.participating)
      .map(p => ({
        playerId: p.playerId,
        playerName: p.playerName,
        cards: p.cards || [],
        handType: p.handType || '',
        chips: p.chips || 0
      }))
  };
  
  const handId = await createHandRecord(props.gameId, data);
  
  if (handId) {
    success(t('common.save'));
    emit('update:modelValue', false);
    emit('saved');
    
    // Reset form
    handRecord.value.communityCards = [];
    handRecord.value.players.forEach(p => {
      p.cards = [];
      p.handType = '';
      p.chips = 0;
      p.participating = true;
    });
  } else {
    error(t('common.error'));
  }
};
</script>
