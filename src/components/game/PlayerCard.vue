<template>
  <div class="c-row">
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="c-name truncate">{{ player.name }}</span>
        <span v-if="player.uid" class="text-blue-400 text-[10px]">●</span>
        <!-- Seat without an account: claim it (bind) or send it to someone (invite) -->
        <button v-if="!player.uid && canBind" type="button" class="c-chip accent" @click="$emit('bind', player)">
          {{ $t('game.bind') }}
        </button>
        <button v-else-if="!player.uid" type="button" class="c-chip" @click="$emit('invite', player)">
          <i class="fas fa-share-alt mr-1"></i>{{ $t('game.invite') }}
        </button>
      </div>
      <div class="c-sub">
        <span class="whitespace-nowrap">{{ $t('room.buyIn') }} {{ formatNumber(player.buyIn) }}<template v-if="groups > 1"> ×{{ groups }}</template></span>
        · <span class="whitespace-nowrap">{{ $t('room.stack') }} {{ formatNumber(player.stack || 0) }}</span>
      </div>
      <div v-if="player.notes" class="c-note">📝 {{ player.notes }}</div>
    </div>

    <div class="c-net" :class="netProfit >= 0 ? 'up' : 'down'">
      {{ netProfit > 0 ? '+' : '' }}{{ formatNumber(netProfit) }}
    </div>

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
</template>

<script setup>
// One cash-table seat as a compact row: buy-in / stack, net result, 加買
// and ⋯ (the edit sheet: buy-in groups, final stack, remove).
import { computed } from 'vue';
import { formatNumber, calculateNet } from '../../utils/formatters.js';

const props = defineProps({
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
  gap: 0.6rem;
  padding: 0.7rem 0.9rem;
  border-bottom: 1px solid rgb(var(--tw-slate-700) / 0.7);
}
.c-row:last-child { border-bottom: none; }
.c-name { color: rgb(var(--tw-white)); font-weight: 700; }
.c-sub { font-size: 0.72rem; color: rgb(var(--tw-slate-400)); margin-top: 0.1rem; }
.c-note { font-size: 0.72rem; color: rgb(var(--tw-slate-300)); margin-top: 0.2rem; }
.c-net {
  flex-shrink: 0;
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
.c-icon { flex-shrink: 0; width: 2rem; height: 2rem; border-radius: 0.5rem; color: rgb(var(--tw-slate-400)); }
.c-chip {
  font-size: 0.68rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  color: rgb(var(--tw-slate-300));
  border: 1px solid rgb(var(--tw-slate-600));
}
.c-chip.accent { color: rgb(var(--tw-emerald-300)); border-color: rgb(var(--tw-emerald-500) / 0.5); }
</style>
