<template>
  <BaseModal :model-value="modelValue" :title="$t('bounty.knockoutTitle', { name: player?.name || '' })" @update:model-value="close">
    <div class="space-y-4">
      <p class="text-sm text-gray-300">
        <template v-if="mystery">{{ $t('bounty.whoKnockedOut').replace(/[？?].*$/, '？') }} <span class="text-amber-300 font-semibold">🎁 {{ $t('mystery.willDraw') }}</span></template>
        <template v-else>
        {{ $t('bounty.whoKnockedOut') }}
        <span class="text-rose-300 font-semibold">🎯 ${{ formatNumber(perEntry) }}</span>
        </template>
        <span v-if="cashShare < 1" class="block text-xs text-gray-400 mt-1">{{ $t('bounty.pkoSplitHint', { cash: Math.round(cashShare * 100) }) }}</span>
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
          <span v-if="selected.includes(p.id) && !mystery" class="text-xs text-rose-300 text-right leading-tight">
            +${{ formatNumber(shareOf(p.id)) }}
            <span v-if="growOf(p.id)" class="block text-[10px] text-amber-300">{{ $t('bounty.headGrow', { amount: formatNumber(growOf(p.id)) }) }}</span>
          </span>
        </button>
      </div>
      <p class="text-xs text-gray-500">{{ $t('bounty.splitHint') }}</p>

      <button type="button" class="ko-opt w-full" :class="{ active: noEliminator }" @click="chooseNone">
        <span>{{ $t('bounty.noEliminator') }}</span>
        <span class="text-xs text-gray-400">{{ mystery ? $t('mystery.toPoolNoDraw') : $t('bounty.toPool') }}</span>
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
  // Value of this player's head (PKO heads grow) and the part paid in cash
  perEntry: { type: Number, default: 0 },
  cashShare: { type: Number, default: 1 },
  // Mystery: the knockout earns a draw instead of a known amount
  mystery: { type: Boolean, default: false },
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

const cash = computed(() => Math.round(props.perEntry * props.cashShare));
const split = computed(() => splitBounty(cash.value, selected.value));
const grow = computed(() => splitBounty(props.perEntry - cash.value, selected.value));
const shareOf = (id) => split.value.find((a) => a.playerId === id)?.amount || 0;
const growOf = (id) => grow.value.find((a) => a.playerId === id)?.amount || 0;
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
  border: 1px solid rgb(var(--tw-slate-600));
  background: rgb(var(--tw-slate-700) / 0.5);
  color: rgb(var(--tw-white));
  font-size: 0.9rem;
  text-align: left;
  min-width: 0;
}
.ko-opt.active {
  border-color: rgb(var(--tw-rose-400));
  background: rgb(var(--tw-rose-500) / 0.15);
}
</style>
