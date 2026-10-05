<template>
  <BaseModal :model-value="modelValue" :title="`🎴 ${$t('seats.title')}`" @update:model-value="$emit('update:modelValue', $event)">
    <!-- Host, before the clock starts: tables, each table's dealer, then draw (again) -->
    <div v-if="isHost && canDraw" class="space-y-3 mb-4">
      <div class="flex items-center gap-2 text-sm text-gray-300">
        <span>{{ $t('seats.tables') }}</span>
        <select v-model.number="tables" class="sd-select">
          <option v-for="n in options" :key="n" :value="n">{{ n }}</option>
        </select>
        <span class="text-xs text-gray-400">{{ sizesText }}</span>
      </div>
      <div v-for="(_, ti) in dealerPicks" :key="ti" class="flex items-center gap-2 text-sm text-gray-300">
        <span class="whitespace-nowrap">🃏 {{ tables > 1 ? $t('seats.dealerOf', { n: ti + 1 }) : $t('seats.dealer') }}</span>
        <select v-model="dealerPicks[ti]" class="sd-select flex-1 min-w-0">
          <option value="" disabled>{{ $t('seats.pickDealer') }}</option>
          <option :value="NONE">{{ $t('seats.noDealer') }}</option>
          <option v-for="p in dealerChoices(ti)" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>
      <BaseButton variant="primary" full-width :disabled="busy || players.length < 2 || !picksDone" @click="draw">
        🎴 {{ seated ? $t('seats.redraw') : $t('seats.draw') }}
      </BaseButton>
    </div>
    <div v-else-if="isHost && seated" class="text-xs text-gray-400 mb-3">{{ $t('seats.lockedHint') }}</div>

    <div v-if="!seated" class="text-center text-gray-400 py-6">{{ $t('seats.notYet') }}</div>
    <template v-else>
      <div class="grid gap-3" :class="chart.length > 1 ? 'md:grid-cols-2' : ''">
        <div v-for="(table, ti) in chart" :key="ti" class="sd-table">
          <div v-if="chart.length > 1" class="sd-head">{{ $t('seats.tableN', { n: ti + 1 }) }}</div>
          <div v-for="p in table" :key="p.id" class="sd-row" :class="{ me: p.uid && p.uid === myUid, out: p.eliminated, dealer: p.seat.dealer }">
            <span class="sd-no">{{ p.seat.dealer ? '🃏' : p.seat.seat }}</span>
            <span class="sd-name">{{ p.name }}<small v-if="p.seat.dealer">{{ $t('seats.dealer') }}</small></span>
            <span v-if="p.seat.button" class="sd-btn" :title="$t('seats.button')">D</span>
          </div>
        </div>
      </div>
      <!-- Joined after the draw with every table full -->
      <div v-if="unseated.length" class="text-xs text-amber-300 mt-3">
        {{ $t('seats.unseated') }}：{{ unseated.map((p) => p.name).join('、') }}
      </div>
    </template>
  </BaseModal>
</template>

<script setup>
// 抽座位: the host picks each table's dealer (荷官 — they play too, from the
// dealer position), then draws everyone else's seats and each table's
// starting button, until the clock starts; everyone sees the result here.
// See utils/seatDraw.js.
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseModal from '../common/BaseModal.vue';
import BaseButton from '../common/BaseButton.vue';
import { autoTableCount, tableCountOptions, isSeated, seatingChart, currentDealers } from '../../utils/seatDraw.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  players: { type: Array, default: () => [] },
  isHost: { type: Boolean, default: false },
  // Draws (and redraws) only until the clock starts
  canDraw: { type: Boolean, default: true },
  myUid: { type: String, default: '' },
  // (tables, dealerIds) => Promise — the host's draw
  onDraw: { type: Function, default: null },
});
defineEmits(['update:modelValue']);
const { t } = useI18n();
const NONE = '__none';

const seated = computed(() => isSeated(props.players));
const chart = computed(() => seatingChart(props.players));
const unseated = computed(() => (seated.value ? props.players.filter((p) => !p.seat) : []));
const options = computed(() => tableCountOptions(props.players.length));
const tables = ref(autoTableCount(props.players.length));
watch(() => props.players.length, (n) => {
  if (!options.value.includes(tables.value)) tables.value = autoTableCount(n);
});

// Each table's dealer: chosen every time (a redraw in this room keeps them)
const dealerPicks = ref([]);
const syncPicks = () => {
  const prev = currentDealers(props.players);
  dealerPicks.value = Array.from({ length: tables.value }, (_, i) => dealerPicks.value[i]
    ?? (seated.value ? (prev[i] || NONE) : ''));
};
watch([tables, () => props.modelValue], syncPicks, { immediate: true });
const dealerChoices = (ti) => props.players.filter((p) => !dealerPicks.value.some((id, j) => j !== ti && id === p.id));
const picksDone = computed(() => dealerPicks.value.length === tables.value && dealerPicks.value.every(Boolean));

// e.g. "5 / 5" for ten players on two tables
const sizesText = computed(() => {
  const n = props.players.length;
  const k = tables.value || 1;
  const sizes = Array.from({ length: k }, (_, i) => Math.floor(n / k) + (i < n % k ? 1 : 0));
  return k > 1 ? t('seats.sizes', { sizes: sizes.join(' / ') }) : t('seats.oneTable', { n });
});

const busy = ref(false);
async function draw() {
  if (!props.onDraw || !picksDone.value) return;
  busy.value = true;
  try {
    await props.onDraw(tables.value, dealerPicks.value.map((id) => (id === NONE ? null : id)));
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.sd-select { background: rgb(var(--tw-slate-700)); color: rgb(var(--tw-white)); border-radius: 0.4rem; padding: 0.25rem 0.5rem; border: 1px solid rgb(var(--tw-slate-600)); }
.sd-table { border-radius: 0.8rem; border: 1px solid rgb(var(--tw-slate-600) / 0.5); background: rgb(var(--tw-slate-800) / 0.6); overflow: hidden; }
.sd-head { padding: 0.45rem 0.8rem; font-size: 0.8rem; font-weight: 700; color: rgb(var(--tw-slate-200)); background: rgb(var(--tw-slate-700) / 0.45); }
.sd-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.8rem; border-top: 1px solid rgb(var(--tw-slate-700) / 0.6); }
.sd-row:first-of-type, .sd-head + .sd-row { border-top: none; }
.sd-row.dealer { background: rgb(var(--tw-emerald-500) / 0.1); }
.sd-row.me { background: rgb(var(--tw-amber-500) / 0.15); }
.sd-row.out .sd-name { color: rgb(var(--tw-slate-400)); }
.sd-no { width: 1.8rem; height: 1.8rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: rgb(var(--tw-white)); background: rgb(var(--tw-slate-700)); flex-shrink: 0; }
.sd-name { flex: 1; min-width: 0; color: rgb(var(--tw-white)); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sd-name small { margin-left: 0.4rem; font-size: 0.7rem; font-weight: 700; color: rgb(var(--tw-emerald-400)); }
.sd-btn { width: 1.6rem; height: 1.6rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 900; color: #1f2937; background: #f8fafc; border: 2px solid #cbd5e1; flex-shrink: 0; }
</style>
