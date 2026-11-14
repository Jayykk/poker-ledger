<template>
  <div class="seat-bar">
    <button type="button" class="sb-line" :aria-expanded="open" @click="open = !open">
      <span class="sb-text">🎴 {{ text }}</span>
      <i class="fas" :class="open ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
    </button>
    <SeatTable
      v-if="open"
      class="sb-table"
      :chart="chart"
      :my-uid="me.uid || ''"
      :avatar-of="avatarOf"
      :badge-of="badgeOf"
      :room-titles="roomTitles"
    />
  </div>
</template>

<script setup>
// The room's own seat line: "你坐 5 號位 · 左 東尼 · 右 松哥" — one line, so
// it costs no more room than the old seat button — that opens the table
// (SeatTable) in place. Drawing seats stays in the 座位 window.
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import SeatTable from './SeatTable.vue';
import { liveSeatingChart, seatNeighbours } from '../../utils/seatDraw.js';

const props = defineProps({
  players: { type: Array, default: () => [] },
  // My own seat in the roster (has `.seat`)
  me: { type: Object, required: true },
  avatarOf: { type: Function, default: () => '' },
  badgeOf: { type: Function, default: () => '' },
  roomTitles: { type: Object, default: () => ({}) },
});
const { t } = useI18n();

const open = ref(false);
const chart = computed(() => liveSeatingChart(props.players));

const text = computed(() => {
  const seat = props.me.seat;
  const mine = seat.dealer ? t('seats.mineDealer') : t('seats.mine', { seat: seat.seat });
  // Out of the game: the seat is history, the neighbours no longer mine
  if (props.me.eliminated) return mine;
  const { left, right } = seatNeighbours(props.players, props.me);
  if (!left || !right) return mine;
  const next = left.id === right.id
    ? t('seats.neighbourOne', { name: left.name })
    : t('seats.neighbours', { left: left.name, right: right.name });
  return `${mine} · ${next}`;
});
</script>

<style scoped>
.seat-bar { margin-top: 0.5rem; }
.sb-line {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.5rem 0.9rem;
  border-radius: 0.8rem;
  text-align: left;
  font-weight: 700;
  color: rgb(var(--tw-white));
  background: rgb(var(--tw-slate-800) / 0.6);
  border: 1px solid rgb(var(--tw-amber-500) / 0.4);
}
.sb-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-line i { font-size: 0.75rem; color: rgb(var(--tw-white) / 0.5); flex-shrink: 0; }
.sb-table { margin-top: 0.5rem; }
</style>
