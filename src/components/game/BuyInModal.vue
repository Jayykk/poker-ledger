<template>
  <BaseModal :modelValue="modelValue" @update:modelValue="$emit('update:modelValue', $event)" :title="$t('transaction.buyInFor')">
    <!-- Target player selector -->
    <div class="mb-4">
      <label class="text-xs text-gray-400 block mb-2">{{ $t('transaction.selectPlayer') }}</label>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="player in players"
          :key="player.id"
          @click="selectedPlayer = player"
          class="p-3 rounded-xl border text-sm text-left transition-all"
          :class="selectedPlayer?.id === player.id
            ? 'border-amber-500 bg-amber-500/10 text-amber-400'
            : 'border-slate-700 bg-slate-800 text-gray-300 hover:border-slate-500'"
        >
          <div class="font-bold truncate">{{ player.name }}</div>
          <div class="text-[10px] text-gray-500 mt-1">
            {{ $t('game.buyIn') }}: {{ formatNumber(player.buyIn) }}
          </div>
        </button>
      </div>
    </div>

    <!-- Amount input -->
    <div class="mb-4">
      <label class="text-xs text-gray-400 block mb-2">{{ $t('transaction.amount') }}</label>
      <div class="flex gap-2 items-center">
        <BaseButton @click="amount = Math.max(minBuyIn, amount - chipStep)" size="sm">
          -{{ chipStep }}
        </BaseButton>
        <BaseInput
          v-model.number="amount"
          type="number"
          :min="minBuyIn"
          :step="chipStep"
          class="flex-1 text-center"
        />
        <BaseButton @click="amount += chipStep" size="sm">
          +{{ chipStep }}
        </BaseButton>
      </div>
    </div>

    <!-- Preview -->
    <div v-if="selectedPlayer" class="bg-slate-900 p-3 rounded-xl mb-4 text-sm text-gray-300">
      <template v-if="isSelfBuyIn">
        {{ $t('transaction.previewSelf', { amount: formatNumber(amount) }) }}
      </template>
      <template v-else>
        {{ $t('transaction.previewOther', { target: selectedPlayer.name, amount: formatNumber(amount) }) }}
      </template>
    </div>

    <!-- Confirm button -->
    <BaseButton
      @click="handleConfirm"
      :disabled="!selectedPlayer || !amount || amount <= 0 || loading"
      :loading="loading"
      variant="primary"
      fullWidth
    >
      {{ $t('common.confirm') }}
    </BaseButton>
  </BaseModal>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuth } from '../../composables/useAuth.js';
import BaseModal from '../common/BaseModal.vue';
import BaseButton from '../common/BaseButton.vue';
import BaseInput from '../common/BaseInput.vue';
import { formatNumber } from '../../utils/formatters.js';

const { t } = useI18n();
const { user } = useAuth();

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  players: { type: Array, default: () => [] },
  baseBuyIn: { type: Number, default: 2000 },
  loading: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'confirm']);

const selectedPlayer = ref(null);
const amount = ref(props.baseBuyIn);
const minBuyIn = 100;
const chipStep = 100;

const isSelfBuyIn = computed(() => {
  if (!selectedPlayer.value || !user.value) return true;
  return selectedPlayer.value.uid === user.value.uid;
});

// Reset when modal opens
watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    amount.value = props.baseBuyIn;
    selectedPlayer.value = null;
  }
});

const handleConfirm = () => {
  if (!selectedPlayer.value || !amount.value || amount.value <= 0) return;
  emit('confirm', {
    targetUid: selectedPlayer.value.uid || null,
    targetName: selectedPlayer.value.name,
    amount: amount.value,
  });
};
</script>
