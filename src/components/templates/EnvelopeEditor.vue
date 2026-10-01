<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2">
      <label class="env-label flex-shrink-0">{{ $t('mystery.envelopeCount') }}</label>
      <input v-model.number="count" type="number" min="1" max="60" class="env-input w-20" />
      <button type="button" class="env-btn" @click="generate">
        <i class="fas fa-magic mr-1"></i>{{ $t('mystery.autoFill') }}
      </button>
    </div>

    <div class="env-grid env-head">
      <span>{{ $t('mystery.perEnvelope') }}</span>
      <span>{{ $t('mystery.howMany') }}</span>
      <span v-if="pool > 0" class="text-right">{{ $t('mystery.amountEach') }}</span>
      <span></span>
    </div>
    <div v-for="(row, i) in envelopes" :key="i" class="env-grid">
      <div class="flex items-center gap-1">
        <input v-model.number="row.share" type="number" min="0" step="0.5" class="env-input" />
        <span class="text-xs text-gray-400">%</span>
      </div>
      <input v-model.number="row.count" type="number" min="1" class="env-input" />
      <span v-if="pool > 0" class="text-right font-mono text-sm text-amber-300">${{ formatNumber(Math.round(pool * (Number(row.share) || 0) / 100)) }}</span>
      <button type="button" class="text-rose-400" :aria-label="$t('common.delete')" @click="remove(i)">
        <i class="fas fa-trash-alt text-sm"></i>
      </button>
    </div>
    <div class="flex items-center justify-between">
      <button type="button" class="text-sm text-emerald-400" @click="add">
        <i class="fas fa-plus mr-1"></i>{{ $t('mystery.addTier') }}
      </button>
      <span class="text-sm" :class="balanced ? 'text-emerald-400' : 'text-rose-400'">
        {{ $t('mystery.totalShare', { n: totalCount, share: total }) }}
      </span>
    </div>
  </div>
</template>

<script setup>
// Mystery bounty envelopes: tiers of { share (% of the pool per envelope),
// count }. "自動產生" fills a suggested split for the envelope count.
import { ref, computed, watch } from 'vue';
import { formatNumber } from '../../utils/formatters.js';
import { suggestEnvelopes, envelopeTotalShare } from '../../utils/bounty.js';

const envelopes = defineModel('envelopes', { type: Array, required: true });
const props = defineProps({
  // Known pool (draw screen) to show amounts; 0 = unknown (template)
  pool: { type: Number, default: 0 },
});

const totalCount = computed(() => envelopes.value.reduce((n, e) => n + (Math.floor(Number(e.count)) || 0), 0));
const total = computed(() => Math.round(envelopeTotalShare(envelopes.value) * 100) / 100);
const balanced = computed(() => Math.abs(total.value - 100) < 0.05);

const count = ref(totalCount.value || 9);
watch(totalCount, (n) => { if (n) count.value = n; });

function generate() {
  envelopes.value.splice(0, envelopes.value.length, ...suggestEnvelopes(count.value));
}
function add() {
  envelopes.value.push({ share: 0, count: 1 });
}
function remove(i) {
  envelopes.value.splice(i, 1);
}
defineExpose({ generate, props });
</script>

<style scoped>
.env-label { font-size: 0.8rem; color: rgb(var(--tw-slate-400)); }
.env-input {
  width: 100%;
  background: rgb(var(--tw-slate-900));
  border: 1px solid rgb(var(--tw-slate-600));
  border-radius: 0.5rem;
  padding: 0.4rem 0.6rem;
  color: rgb(var(--tw-white));
  font-size: 0.9rem;
}
.env-input.w-20 { width: 5rem; }
.env-btn {
  font-size: 0.8rem;
  padding: 0.4rem 0.7rem;
  border-radius: 0.5rem;
  color: rgb(var(--tw-amber-300));
  border: 1px solid rgb(var(--tw-amber-500) / 0.45);
}
.env-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 4.5rem 5rem 1.5rem;
  gap: 0.5rem;
  align-items: center;
}
.env-head { font-size: 0.7rem; color: rgb(var(--tw-slate-400)); }
</style>
