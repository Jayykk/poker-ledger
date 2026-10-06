<template>
  <BaseModal :model-value="modelValue" :title="`🎴 ${$t('seats.title')}`" @update:model-value="$emit('update:modelValue', $event)">
    <!-- Host, while seats can change: who deals, then draw (again) -->
    <div v-if="isHost && canDraw" class="space-y-3 mb-4">
      <div class="flex items-center gap-2 text-sm text-gray-300">
        <span class="whitespace-nowrap">🃏 {{ $t('seats.dealer') }}</span>
        <select v-model="dealerPick" class="sd-select flex-1 min-w-0">
          <option value="" disabled>{{ $t('seats.pickDealer') }}</option>
          <option :value="NONE">{{ $t('seats.noDealer') }}</option>
          <option v-for="p in players" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>
      <div class="text-xs" :class="tooMany ? 'text-rose-300' : 'text-gray-400'">
        {{ tooMany ? $t('seats.tooMany', { n: capacity }) : $t('seats.capacity', { n: players.length, cap: capacity }) }}
      </div>
      <BaseButton variant="primary" full-width :disabled="busy || players.length < 2 || !dealerPick || tooMany" @click="draw">
        🎴 {{ seated ? $t('seats.redraw') : $t('seats.draw') }}
      </BaseButton>
    </div>
    <div v-else-if="isHost && seated" class="text-xs text-gray-400 mb-3">{{ $t('seats.lockedHint') }}</div>

    <div v-if="!seated" class="text-center text-gray-400 py-6">{{ $t('seats.notYet') }}</div>
    <template v-else>
      <div class="sd-table">
        <div class="sd-row dealer" :class="{ me: chart.dealer && isMe(chart.dealer), empty: !chart.dealer }">
          <span class="sd-no">🃏</span>
          <span class="sd-name">{{ chart.dealer ? chart.dealer.name : $t('seats.noDealerSeat') }}<small>{{ $t('seats.dealer') }}</small></span>
          <LiveTitleBadge v-if="chart.dealer && roomTitles[chart.dealer.id]" :title-id="roomTitles[chart.dealer.id]" />
          <TitleBadge v-else-if="chart.dealer?.uid" :uid="chart.dealer.uid" />
          <span v-if="chart.dealer?.seat.button" class="sd-btn" :title="$t('seats.button')">D</span>
        </div>
        <div v-for="s in chart.seats" :key="s.no" class="sd-row" :class="{ me: s.player && isMe(s.player), empty: !s.player }">
          <span class="sd-no">{{ s.no }}</span>
          <span class="sd-name">{{ s.player ? s.player.name : $t('seats.empty') }}</span>
          <LiveTitleBadge v-if="s.player && roomTitles[s.player.id]" :title-id="roomTitles[s.player.id]" />
          <TitleBadge v-else-if="s.player?.uid" :uid="s.player.uid" />
          <span v-if="s.player?.seat.button" class="sd-btn" :title="$t('seats.button')">D</span>
        </div>
      </div>
      <!-- Joined with the table full -->
      <div v-if="unseated.length" class="text-xs text-amber-300 mt-3">
        {{ $t('seats.unseated') }}：{{ unseated.map((p) => p.name).join('、') }}
      </div>
    </template>
  </BaseModal>
</template>

<script setup>
// 抽座位: the host picks the dealer (荷官 — ours plays too, from the dealer
// position), then draws everyone else's seats and the starting button. The
// room is one physical table: the dealer position and seats 1..9, empty seats
// shown. See utils/seatDraw.js.
import { ref, computed, watch } from 'vue';
import BaseModal from '../common/BaseModal.vue';
import BaseButton from '../common/BaseButton.vue';
import TitleBadge from '../common/TitleBadge.vue';
import LiveTitleBadge from '../common/LiveTitleBadge.vue';
import { isSeated, seatingChart, currentDealer, tableCapacity } from '../../utils/seatDraw.js';

const props = defineProps({
  // 房內即時稱號: playerId → title id (utils/roomTitles.js)
  roomTitles: { type: Object, default: () => ({}) },
  modelValue: { type: Boolean, default: false },
  players: { type: Array, default: () => [] },
  isHost: { type: Boolean, default: false },
  // Draws (and redraws) only while seats can still change (before the clock starts)
  canDraw: { type: Boolean, default: true },
  myUid: { type: String, default: '' },
  // (dealerId | null) => Promise — the host's draw
  onDraw: { type: Function, default: null },
});
defineEmits(['update:modelValue']);
const NONE = '__none';

const seated = computed(() => isSeated(props.players));
const chart = computed(() => seatingChart(props.players));
const unseated = computed(() => (seated.value ? props.players.filter((p) => !p.seat && !p.eliminated) : []));
const isMe = (p) => !!p.uid && p.uid === props.myUid;

// Chosen each time; a redraw in this room starts from the current dealer
const dealerPick = ref('');
watch(() => props.modelValue, (open) => {
  if (open && !dealerPick.value && seated.value) dealerPick.value = currentDealer(props.players) || NONE;
}, { immediate: true });
// Nine seats, plus the dealer when there is one
const capacity = computed(() => tableCapacity(!!dealerPick.value && dealerPick.value !== NONE));
const tooMany = computed(() => props.players.length > capacity.value);

const busy = ref(false);
async function draw() {
  if (!props.onDraw || !dealerPick.value || tooMany.value) return;
  busy.value = true;
  try {
    await props.onDraw(dealerPick.value === NONE ? null : dealerPick.value);
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.sd-select { background: rgb(var(--tw-slate-700)); color: rgb(var(--tw-white)); border-radius: 0.4rem; padding: 0.25rem 0.5rem; border: 1px solid rgb(var(--tw-slate-600)); }
.sd-table { border-radius: 0.8rem; border: 1px solid rgb(var(--tw-slate-600) / 0.5); background: rgb(var(--tw-slate-800) / 0.6); overflow: hidden; }
.sd-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0.8rem; border-top: 1px solid rgb(var(--tw-slate-700) / 0.6); }
.sd-row:first-child { border-top: none; }
.sd-row.dealer { background: rgb(var(--tw-emerald-500) / 0.1); }
.sd-row.me { background: rgb(var(--tw-amber-500) / 0.15); }
.sd-row.empty .sd-name { color: rgb(var(--tw-slate-500)); font-weight: 500; font-style: italic; }
.sd-no { width: 1.8rem; height: 1.8rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: rgb(var(--tw-white)); background: rgb(var(--tw-slate-700)); flex-shrink: 0; }
.sd-name { flex: 1; min-width: 0; color: rgb(var(--tw-white)); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sd-name small { margin-left: 0.4rem; font-size: 0.7rem; font-weight: 700; color: rgb(var(--tw-emerald-400)); }
.sd-btn { width: 1.6rem; height: 1.6rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 900; color: #1f2937; background: #f8fafc; border: 2px solid #cbd5e1; flex-shrink: 0; }
</style>
