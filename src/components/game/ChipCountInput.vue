<template>
  <div class="cc">
    <div class="cc-head">
      <span class="cc-title">{{ $t('chipSet.countTitle') }}</span>
      <button v-if="hasCounts" type="button" class="cc-clear" @click="clear">{{ $t('chipSet.clear') }}</button>
    </div>
    <div v-for="d in list" :key="d" class="cc-row">
      <span class="cc-denom">{{ formatNumber(d) }}</span>
      <button
        type="button"
        class="cc-step"
        :disabled="!countOf(d)"
        :aria-label="`${formatNumber(d)} −1`"
        @click="set(d, countOf(d) - 1)"
      >−</button>
      <input
        class="cc-input"
        type="number"
        min="0"
        step="1"
        inputmode="numeric"
        placeholder="0"
        :value="countOf(d) || ''"
        :aria-label="$t('chipSet.countOf', { value: formatNumber(d) })"
        @input="set(d, $event.target.value)"
        @blur="$event.target.value = countOf(d) || ''"
      />
      <button type="button" class="cc-step" :aria-label="`${formatNumber(d)} +1`" @click="set(d, countOf(d) + 1)">+</button>
      <span class="cc-sub">{{ countOf(d) ? formatNumber(d * countOf(d)) : '' }}</span>
    </div>
    <div class="cc-total">
      <span>{{ $t('chipSet.total') }}</span>
      <span class="cc-total-n">{{ formatNumber(total) }}</span>
    </div>
  </div>
</template>

<script setup>
// How many of each chip → the stack (utils/chipDenominations.js). Shown under
// the final-stack field of a table whose template lists its denominations.
// v-model is the counts ({ '5000': 8 }, zeros left out); the parent turns
// them into the stack.
import { computed } from 'vue';
import { formatNumber } from '../../utils/formatters.js';
import { normalizeDenominations, normalizeChipCounts, chipCountTotal } from '../../utils/chipDenominations.js';

const props = defineProps({
  denominations: { type: Array, required: true },
  modelValue: { type: Object, default: () => ({}) },
});
const emit = defineEmits(['update:modelValue']);

const list = computed(() => normalizeDenominations(props.denominations));
const counts = computed(() => normalizeChipCounts(props.modelValue, list.value));
const countOf = (d) => counts.value[d] || 0;
const hasCounts = computed(() => Object.keys(counts.value).length > 0);
const total = computed(() => chipCountTotal(counts.value));

function set(d, value) {
  emit('update:modelValue', normalizeChipCounts({ ...counts.value, [d]: value }, list.value));
}
function clear() {
  emit('update:modelValue', {});
}
</script>

<style scoped>
.cc {
  padding: 0.6rem 0.7rem;
  border-radius: 0.7rem;
  background: rgb(var(--tw-slate-900) / 0.6);
  border: 1px solid rgb(var(--tw-slate-700));
}
.cc-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem; }
.cc-title { font-size: 0.75rem; color: rgb(var(--tw-slate-400)); }
.cc-clear { font-size: 0.75rem; color: rgb(var(--tw-rose-300)); }
.cc-row { display: flex; align-items: center; gap: 0.4rem; padding: 0.2rem 0; }
.cc-denom {
  width: 4.2rem;
  flex-shrink: 0;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  font-size: 0.9rem;
  color: rgb(var(--tw-amber-300));
}
.cc-step {
  width: 2.2rem;
  height: 2.2rem;
  flex-shrink: 0;
  border-radius: 0.5rem;
  font-size: 1.1rem;
  font-weight: 700;
  color: rgb(var(--tw-white));
  background: rgb(var(--tw-slate-700));
}
.cc-step:disabled { opacity: 0.35; }
.cc-input {
  width: 3.6rem;
  flex-shrink: 0;
  padding: 0.35rem 0.3rem;
  border-radius: 0.5rem;
  text-align: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 1rem;
  color: rgb(var(--tw-white));
  background: rgb(var(--tw-slate-900));
  border: 1px solid rgb(var(--tw-slate-600));
}
.cc-input:focus { outline: none; border-color: rgb(var(--tw-amber-500)); }
.cc-sub {
  flex: 1;
  min-width: 0;
  text-align: right;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  color: rgb(var(--tw-slate-400));
}
.cc-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 0.4rem;
  padding-top: 0.45rem;
  border-top: 1px solid rgb(var(--tw-slate-700));
  font-size: 0.8rem;
  color: rgb(var(--tw-slate-300));
}
.cc-total-n { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 1rem; color: rgb(var(--tw-white)); }
</style>
