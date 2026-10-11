<template>
  <div class="c-row">
    <PlayerAvatar size="sm" :src="avatar" :name="player.name" :uid="player.uid || ''" :linked="!!player.uid" />
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-1.5">
        <span v-if="seatLabel" class="c-seat">{{ seatLabel }}</span>
        <span class="c-name">{{ player.name }}</span>
        <span v-if="isButton" class="c-button">D</span>
      </div>
      <!-- Its own line under the name, so neither squeezes the other to "…" -->
      <div v-if="liveTitle || player.uid" class="c-titles">
        <!-- 房內即時稱號 replaces the regular one while it lasts -->
        <LiveTitleBadge v-if="liveTitle" :title-id="liveTitle" />
        <TitleBadge v-else :uid="player.uid" />
      </div>
      <!-- Seat without an account: claim it (bind) or send it to someone (invite) -->
      <div v-else class="c-titles">
        <button v-if="canBind" type="button" class="c-chip accent" @click="$emit('bind', player)">
          {{ $t('game.bind') }}
        </button>
        <button v-else type="button" class="c-chip whitespace-nowrap" @click="$emit('invite', player)">
          <i class="fas fa-share-alt mr-1"></i>{{ $t('game.invite') }}
        </button>
      </div>
      <div class="c-sub">
        <span class="whitespace-nowrap">{{ $t('room.buyIn') }} {{ formatNumber(player.buyIn) }}<template v-if="groups > 1"> ×{{ groups }}</template></span>
        · <span class="whitespace-nowrap">{{ $t('room.stack') }} {{ formatNumber(player.stack || 0) }}</span>
      </div>
      <div v-if="player.notes" class="c-note">📝 {{ player.notes }}</div>
    </div>

    <!-- Net result over the buttons (not beside them): the name keeps the width -->
    <div class="c-side">
      <div class="c-net" :class="netProfit >= 0 ? 'up' : 'down'">
        {{ netProfit > 0 ? '+' : '' }}{{ formatNumber(netProfit) }}
      </div>
      <div class="c-actions">
        <button
          type="button"
          class="c-btn"
          :disabled="buyInDisabled"
          @click="$emit('add-buy', player)"
        >
          <i class="fas fa-plus"></i>{{ $t('room.addBuy') }}
        </button>
        <button type="button" class="c-icon" :aria-label="$t('game.modify')" @click="$emit('edit', player)">
          <i class="fas fa-ellipsis-h"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
// One cash-table seat as a compact row: buy-in / stack, net result, 加買
// and ⋯ (the edit sheet: buy-in groups, final stack, remove).
import { computed } from 'vue';
import { formatNumber, calculateNet } from '../../utils/formatters.js';
import TitleBadge from '../common/TitleBadge.vue';
import LiveTitleBadge from '../common/LiveTitleBadge.vue';
import PlayerAvatar from '../common/PlayerAvatar.vue';

const props = defineProps({
  // Avatar image (utils/avatar.js); empty → the name's initial
  avatar: { type: String, default: '' },
  // 房內即時稱號 id (utils/roomTitles.js), '' = none
  liveTitle: { type: String, default: '' },
  // 抽座位: seat number (or the dealer mark) and the starting dealer button
  seatLabel: { type: String, default: '' },
  isButton: { type: Boolean, default: false },
  player: { type: Object, required: true },
  canBind: { type: Boolean, default: false },
  isMyCard: { type: Boolean, default: false },
  // Timed game past its buy-in cutoff
  buyInDisabled: { type: Boolean, default: false },
  // One buy-in (to show how many were bought)
  baseBuyIn: { type: Number, default: 0 },
});

defineEmits(['bind', 'invite', 'add-buy', 'edit']);

const netProfit = computed(() => calculateNet(props.player));
const groups = computed(() => (props.baseBuyIn > 0
  ? Math.max(1, Math.round((props.player.buyIn || 0) / props.baseBuyIn))
  : 1));
</script>

<style scoped>
.c-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 0.75rem;
  border-bottom: 1px solid rgb(var(--tw-slate-700) / 0.7);
}
.c-row:last-child { border-bottom: none; }
.c-name {
  color: rgb(var(--tw-white));
  font-weight: 700;
  min-width: 1.5em;
  /* A long name wraps to a second line instead of turning into "…"
     (only past two lines is it cut) */
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.25;
}
.c-seat { flex-shrink: 0; min-width: 1.5rem; height: 1.5rem; padding: 0 0.3rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: rgb(var(--tw-white)); background: rgb(var(--tw-slate-600)); }
.c-button { flex-shrink: 0; width: 1.3rem; height: 1.3rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 900; color: #1f2937; background: #f8fafc; border: 2px solid #cbd5e1; }
/* One line on a phone: what doesn't fit ends in … instead of wrapping */
/* The title line: the badge gets the whole column (no 8.5rem cap); a player
   whose badge renders nothing leaves no gap (:empty ignores Vue's comment) */
.c-titles { display: flex; align-items: center; gap: 0.35rem; min-width: 0; margin-top: 0.2rem; }
.c-titles:empty { display: none; }
.c-titles > .title-badge, .c-titles > .live-badge { max-width: 100%; }
.c-sub { font-size: 0.72rem; color: rgb(var(--tw-slate-400)); margin-top: 0.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-note { font-size: 0.72rem; color: rgb(var(--tw-slate-300)); margin-top: 0.2rem; }
.c-side { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; }
.c-actions { display: flex; align-items: center; gap: 0.15rem; }
.c-net {
  flex-shrink: 0;
  line-height: 1.1;
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.1rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.c-net.up { color: rgb(var(--tw-emerald-400)); }
.c-net.down { color: rgb(var(--tw-rose-400)); }
.c-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.45rem 0.65rem;
  border-radius: 0.55rem;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
  color: rgb(var(--tw-amber-300));
  border: 1px solid rgb(var(--tw-amber-500) / 0.45);
  background: rgb(var(--tw-amber-500) / 0.08);
}
.c-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.c-icon { flex-shrink: 0; width: 1.75rem; height: 2rem; border-radius: 0.5rem; color: rgb(var(--tw-slate-400)); }
.c-chip {
  font-size: 0.68rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  color: rgb(var(--tw-slate-300));
  border: 1px solid rgb(var(--tw-slate-600));
}
.c-chip.accent { color: rgb(var(--tw-emerald-300)); border-color: rgb(var(--tw-emerald-500) / 0.5); }
</style>
