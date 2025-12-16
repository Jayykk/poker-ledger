<template>
  <BaseModal v-model="isOpen" :title="$t('poker.runItTwice')">
    <div class="space-y-4">
      <!-- Explanation -->
      <div class="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
        <p class="text-gray-400 text-sm mb-2">
          {{ $t('poker.runItTwiceDesc') }}
        </p>
        <p class="text-gray-500 text-xs">
          {{ $t('poker.runItTwiceNote') }}
        </p>
      </div>

      <!-- Current Pot -->
      <div class="flex justify-between items-center bg-slate-800 rounded-lg p-3">
        <span class="text-gray-400">{{ $t('poker.currentPot') }}:</span>
        <span class="text-amber-400 font-mono font-bold text-lg">{{ formatChips(pot) }}</span>
      </div>

      <!-- Split Pot -->
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-blue-900/30 rounded-lg p-3 border border-blue-700/50">
          <div class="text-xs text-gray-400 mb-1">{{ $t('poker.runOne') }}</div>
          <div class="text-blue-400 font-mono font-bold">{{ formatChips(pot / 2) }}</div>
        </div>
        <div class="bg-purple-900/30 rounded-lg p-3 border border-purple-700/50">
          <div class="text-xs text-gray-400 mb-1">{{ $t('poker.runTwo') }}</div>
          <div class="text-purple-400 font-mono font-bold">{{ formatChips(pot / 2) }}</div>
        </div>
      </div>

      <!-- Agreement Status -->
      <div v-if="opponent" class="bg-slate-800 rounded-lg p-3">
        <div class="text-sm text-gray-400 mb-2">{{ $t('poker.agreementStatus') }}:</div>
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-2 flex-1">
            <i class="fas fa-check text-emerald-400"></i>
            <span class="text-white text-sm">{{ $t('common.you') }}</span>
          </div>
          <div class="flex items-center gap-2 flex-1">
            <i :class="opponentAgreed ? 'fas fa-check text-emerald-400' : 'fas fa-clock text-amber-400'"></i>
            <span class="text-white text-sm">{{ opponent }}</span>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex gap-3">
        <BaseButton
          @click="handleAgree"
          variant="primary"
          fullWidth
          :disabled="loading"
        >
          <i class="fas fa-handshake mr-2"></i>
          {{ $t('poker.agree') }}
        </BaseButton>
        <BaseButton
          @click="handleDecline"
          variant="secondary"
          fullWidth
          :disabled="loading"
        >
          {{ $t('common.cancel') }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from '../common/BaseModal.vue';
import BaseButton from '../common/BaseButton.vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  pot: {
    type: Number,
    default: 0
  },
  opponent: {
    type: String,
    default: ''
  },
  opponentAgreed: {
    type: Boolean,
    default: false
  },
  loading: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:modelValue', 'agree', 'decline']);

const { t } = useI18n();

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const formatChips = (amount) => {
  return new Intl.NumberFormat().format(Math.floor(amount));
};

const handleAgree = () => {
  emit('agree');
};

const handleDecline = () => {
  isOpen.value = false;
  emit('decline');
};
</script>
