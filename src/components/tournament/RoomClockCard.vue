<template>
  <div
    role="button"
    tabindex="0"
    class="room-clock"
    @click="$emit('open')"
    @keydown.enter="$emit('open')"
  >
    <div class="min-w-0">
      <div class="rc-sub">
        <template v-if="isBreak">☕ {{ $t('tournament.breakTime') }}</template>
        <template v-else>{{ $t('tournament.level') }} {{ level }}</template>
        <template v-if="closed"> · <span class="text-rose-400">{{ closedLabel }}</span></template>
        <template v-else-if="cutoffLevel > 0"> · {{ $t('room.cutoffShort', { level: cutoffLevel }) }}</template>
      </div>
      <div class="rc-blinds">
        <template v-if="isBreak">—</template>
        <template v-else>
          {{ formatNumber(blinds.small) }} / {{ formatNumber(blinds.big) }}
          <span v-if="blinds.ante" class="rc-ante">({{ formatNumber(blinds.ante) }})</span>
        </template>
      </div>
      <div v-if="nextBlinds" class="rc-sub">
        {{ $t('room.next') }} {{ formatNumber(nextBlinds.small) }} / {{ formatNumber(nextBlinds.big) }}
      </div>
    </div>

    <div class="rc-right">
      <div class="rc-time" :class="{ ended: status === 'ended' }">
        <template v-if="status === 'ended'">{{ endedLabel || $t('timed.timeUp') }}</template>
        <template v-else>{{ formattedTime }}</template>
      </div>
      <div class="rc-sub">
        <template v-if="status === 'waiting'">{{ $t('tournament.waitingToStart') }}</template>
        <template v-else>{{ detail }}</template>
      </div>
    </div>

    <button
      v-if="canControl && status !== 'ended'"
      type="button"
      class="rc-toggle"
      :aria-label="status === 'running' ? $t('tournament.pause') : $t('tournament.start')"
      @click.stop="$emit('toggle')"
    >
      <i class="fas" :class="status === 'running' ? 'fa-pause' : 'fa-play'"></i>
    </button>
    <i v-else class="fas fa-expand text-gray-500 text-sm self-start"></i>
  </div>
</template>

<script setup>
// Compact clock card at the top of a room (tournament and timed cash):
// level, blinds, next blinds, level countdown and one detail line. Tapping
// it opens the full clock; the host gets a start / pause button.
import { formatNumber } from '../../utils/formatters.js';

defineProps({
  status: { type: String, default: 'waiting' },
  isBreak: { type: Boolean, default: false },
  level: { type: Number, default: 0 },
  blinds: { type: Object, default: () => ({ small: 0, big: 0, ante: 0 }) },
  nextBlinds: { type: Object, default: null },
  formattedTime: { type: String, default: '00:00' },
  // Level from which entries close (0 = none) and whether that's happened
  cutoffLevel: { type: Number, default: 0 },
  closed: { type: Boolean, default: false },
  closedLabel: { type: String, default: '' },
  // Line under the timer ("在場 6 / 8", "距離結束 1:23:00")
  detail: { type: String, default: '' },
  endedLabel: { type: String, default: '' },
  canControl: { type: Boolean, default: false },
});

defineEmits(['open', 'toggle']);
</script>

<style scoped>
.room-clock {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.9rem;
  margin-bottom: 0.75rem;
  border-radius: 0.9rem;
  background: rgb(var(--tw-slate-800) / 0.85);
  border: 1px solid rgb(var(--tw-amber-500) / 0.25);
  cursor: pointer;
}
.rc-sub { font-size: 0.72rem; color: rgb(var(--tw-white) / 0.55); }
.rc-blinds { font-size: 1.15rem; font-weight: 700; color: rgb(var(--tw-white)); font-variant-numeric: tabular-nums; }
.rc-ante { font-size: 0.8rem; color: rgb(var(--tw-white) / 0.6); font-weight: 500; }
.rc-right { margin-left: auto; text-align: right; flex-shrink: 0; }
.rc-time {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.1;
  color: rgb(var(--tw-amber-400));
  font-variant-numeric: tabular-nums;
}
.rc-time.ended { font-size: 1rem; color: rgb(var(--tw-rose-400)); }
.rc-toggle {
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: rgb(var(--tw-amber-500) / 0.2);
  color: rgb(var(--tw-amber-400));
  border: 1px solid rgb(var(--tw-amber-500) / 0.4);
}
</style>
