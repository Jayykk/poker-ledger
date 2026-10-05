<template>
  <BaseModal :model-value="modelValue" :title="`🎴 ${$t('seats.title')}`" @update:model-value="$emit('update:modelValue', $event)">
    <!-- Host, before the clock starts: how many tables, then draw (again) -->
    <div v-if="isHost && canDraw" class="space-y-3 mb-4">
      <div class="flex items-center gap-2 text-sm text-gray-300">
        <span>{{ $t('seats.tables') }}</span>
        <select v-model.number="tables" class="bg-slate-700 text-white rounded px-2 py-1 border border-slate-600">
          <option v-for="n in options" :key="n" :value="n">{{ n }}</option>
        </select>
        <span class="text-xs text-gray-400">{{ sizesText }}</span>
      </div>
      <BaseButton variant="primary" full-width :disabled="busy || players.length < 2" @click="draw">
        🎴 {{ seated ? $t('seats.redraw') : $t('seats.draw') }}
      </BaseButton>
    </div>
    <div v-else-if="isHost && seated" class="text-xs text-gray-400 mb-3">{{ $t('seats.lockedHint') }}</div>

    <div v-if="!seated" class="text-center text-gray-400 py-6">{{ $t('seats.notYet') }}</div>
    <div v-else class="grid gap-3" :class="chart.length > 1 ? 'md:grid-cols-2' : ''">
      <div v-for="(table, ti) in chart" :key="ti" class="sd-table">
        <div v-if="chart.length > 1" class="sd-head">{{ $t('seats.tableN', { n: ti + 1 }) }}</div>
        <div v-for="p in table" :key="p.id" class="sd-row" :class="{ me: p.uid && p.uid === myUid, out: p.eliminated }">
          <span class="sd-no">{{ p.seat.seat }}</span>
          <span class="sd-name">{{ p.name }}</span>
          <span v-if="p.seat.button" class="sd-btn" :title="$t('seats.button')">D</span>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup>
// 抽座位: the host draws random seats (and each table's starting dealer
// button) before the clock starts; everyone sees the result here. See
// utils/seatDraw.js.
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from '../common/BaseModal.vue';
import BaseButton from '../common/BaseButton.vue';
import { autoTableCount, tableCountOptions, isSeated, seatingChart } from '../../utils/seatDraw.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  players: { type: Array, default: () => [] },
  isHost: { type: Boolean, default: false },
  // Draws (and redraws) only until the clock starts
  canDraw: { type: Boolean, default: true },
  myUid: { type: String, default: '' },
  // (tables) => Promise — the host's draw
  onDraw: { type: Function, default: null },
});
defineEmits(['update:modelValue']);
const { t } = useI18n();

const seated = computed(() => isSeated(props.players));
const chart = computed(() => seatingChart(props.players));
const options = computed(() => tableCountOptions(props.players.length));
const tables = ref(autoTableCount(props.players.length));
watch(() => props.players.length, (n) => {
  if (!options.value.includes(tables.value)) tables.value = autoTableCount(n);
});
// e.g. "5 / 5" for ten players on two tables
const sizesText = computed(() => {
  const n = props.players.length;
  const k = tables.value || 1;
  const sizes = Array.from({ length: k }, (_, i) => Math.floor(n / k) + (i < n % k ? 1 : 0));
  return k > 1 ? t('seats.sizes', { sizes: sizes.join(' / ') }) : t('seats.oneTable', { n });
});

const busy = ref(false);
async function draw() {
  if (!props.onDraw) return;
  busy.value = true;
  try { await props.onDraw(tables.value); } finally { busy.value = false; }
}
</script>

<style scoped>
.sd-table { border-radius: 0.8rem; border: 1px solid rgb(var(--tw-slate-600) / 0.5); background: rgb(var(--tw-slate-800) / 0.6); overflow: hidden; }
.sd-head { padding: 0.45rem 0.8rem; font-size: 0.8rem; font-weight: 700; color: rgb(var(--tw-slate-200)); background: rgb(var(--tw-slate-700) / 0.45); }
.sd-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.8rem; border-top: 1px solid rgb(var(--tw-slate-700) / 0.6); }
.sd-row:first-of-type { border-top: none; }
.sd-head + .sd-row { border-top: none; }
.sd-row.me { background: rgb(var(--tw-amber-500) / 0.15); }
.sd-row.out .sd-name { color: rgb(var(--tw-slate-400)); }
.sd-no { width: 1.8rem; height: 1.8rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: rgb(var(--tw-white)); background: rgb(var(--tw-slate-700)); flex-shrink: 0; }
.sd-name { flex: 1; min-width: 0; color: rgb(var(--tw-white)); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sd-btn { width: 1.6rem; height: 1.6rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 900; color: #1f2937; background: #f8fafc; border: 2px solid #cbd5e1; flex-shrink: 0; }
</style>
