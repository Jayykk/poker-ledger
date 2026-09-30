<template>
  <BaseModal :model-value="modelValue" :title="$t('bounty.knockoutTitle', { name: player?.name || '' })" @update:model-value="close">
    <div class="space-y-4">
      <p class="text-sm text-gray-300">
        {{ $t('bounty.whoKnockedOut') }}
        <span class="text-rose-300 font-semibold">🎯 ${{ formatNumber(perEntry) }}</span>
      </p>

      <div class="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
        <button
          v-for="p in candidates"
          :key="p.id"
          type="button"
          class="ko-opt"
          :class="{ active: selected.includes(p.id) }"
          @click="toggle(p.id)"
        >
          <span class="truncate">{{ p.name }}</span>
          <span v-if="selected.includes(p.id)" class="text-xs text-rose-300">+${{ formatNumber(shareOf(p.id)) }}</span>
        </button>
      </div>
      <p class="text-xs text-gray-500">{{ $t('bounty.splitHint') }}</p>

      <button type="button" class="ko-opt w-full" :class="{ active: noEliminator }" @click="chooseNone">
        <span>{{ $t('bounty.noEliminator') }}</span>
        <span class="text-xs text-gray-400">{{ $t('bounty.toPool') }}</span>
      </button>

      <p v-if="warning" class="text-amber-400 text-xs text-center">
        <i class="fas fa-exclamation-triangle mr-1"></i>{{ warning }}
      </p>

      <div class="flex gap-2">
        <BaseButton variant="ghost" class="flex-1" @click="close(false)">{{ $t('common.cancel') }}</BaseButton>
        <BaseButton variant="danger" class="flex-1" :disabled="!canConfirm" @click="confirm">
          {{ $t('bounty.confirmKnockout') }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>

<script setup>
// KO games: eliminating a player asks who knocked them out. Several
// eliminators split the head (see utils/bounty.js splitBounty); none sends it
// to the prize pool.
import { ref, computed, watch } from 'vue';
import BaseModal from '../common/BaseModal.vue';
import BaseButton from '../common/BaseButton.vue';
import { formatNumber } from '../../utils/formatters.js';
import { splitBounty } from '../../utils/bounty.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  player: { type: Object, default: null },
  // Players still in, other than `player`
  candidates: { type: Array, default: () => [] },
  perEntry: { type: Number, default: 0 },
  warning: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue', 'confirm']);

const selected = ref([]);
const noEliminator = ref(false);

watch(() => props.modelValue, (open) => {
  if (open) {
    selected.value = [];
    noEliminator.value = false;
  }
});

const split = computed(() => splitBounty(props.perEntry, selected.value));
const shareOf = (id) => split.value.find((a) => a.playerId === id)?.amount || 0;
const canConfirm = computed(() => selected.value.length > 0 || noEliminator.value);

function toggle(id) {
  noEliminator.value = false;
  selected.value = selected.value.includes(id)
    ? selected.value.filter((x) => x !== id)
    : [...selected.value, id];
}

function chooseNone() {
  selected.value = [];
  noEliminator.value = !noEliminator.value;
}

function close(value) {
  emit('update:modelValue', Boolean(value));
}

function confirm() {
  if (!canConfirm.value) return;
  emit('confirm', [...selected.value]);
  close(false);
}
</script>

<style scoped>
.ko-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.65rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid #475569;
  background: rgba(51, 65, 85, 0.5);
  color: #fff;
  font-size: 0.9rem;
  text-align: left;
  min-width: 0;
}
.ko-opt.active {
  border-color: #fb7185;
  background: rgba(244, 63, 94, 0.15);
}
</style>
