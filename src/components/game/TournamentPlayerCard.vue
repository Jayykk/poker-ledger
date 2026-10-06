<template>
  <div class="t-wrap">
  <div class="t-row" :class="{ out: player.eliminated && !champion }">
    <span v-if="player.eliminated && player.placement && !champion" class="t-place">#{{ player.placement }}</span>

    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-1.5">
        <span v-if="seatLabel" class="t-seat">{{ seatLabel }}</span>
        <span class="t-name truncate shrink-[10]">{{ player.name }}</span>
        <span v-if="isButton" class="t-button">D</span>
        <span v-if="player.uid" class="text-blue-400 text-[10px] flex-shrink-0">●</span>
        <TitleBadge v-if="player.uid" :uid="player.uid" />
        <span v-if="champion" class="text-amber-400 text-xs font-bold flex-shrink-0">🏆 {{ $t('tournament.champion') }}</span>
      </div>
      <div class="t-sub">
        <template v-if="player.eliminated && knockedOutBy">{{ $t('room.knockedOutBy', { name: knockedOutBy }) }} · </template>
        <span v-if="entryCount > 1 || player.eliminated">{{ $t('room.buyInTimes', { n: entryCount }) }}</span>
        <span v-if="headValue > 0 && !player.eliminated" class="text-amber-300">
          <template v-if="entryCount > 1 || player.eliminated"> · </template>{{ $t('bounty.headNow', { amount: formatNumber(headValue) }) }}
        </span>
        <span v-if="bountyPerHead > 0 && (player.knockouts || player.bountyWon)" class="text-rose-300">
          <template v-if="entryCount > 1 || player.eliminated || (headValue > 0 && !player.eliminated)"> · </template>🎯 {{ player.knockouts || 0 }} · ${{ formatNumber(player.bountyWon || 0) }}
        </span>
      </div>
    </div>

    <!-- Still in: eliminate (+ name edit) -->
    <template v-if="!player.eliminated && !champion">
      <button type="button" class="t-btn elim" @click="$emit('eliminate', player)">
        <i class="fas fa-user-times"></i>{{ $t('tournament.eliminate') }}
      </button>
      <button type="button" class="t-icon" :aria-label="$t('room.more')" @click="menuOpen = !menuOpen">
        <i class="fas fa-ellipsis-h"></i>
      </button>
    </template>

    <!-- Out: re-entry straight from the row, or why not -->
    <template v-else-if="player.eliminated && !champion">
      <button v-if="canReentry" type="button" class="t-btn re" @click="$emit('reentry', player)">
        <i class="fas fa-redo"></i>{{ $t('room.reentry') }}
      </button>
      <span v-else-if="reentryBlocked === 'limit'" class="t-note">{{ $t('room.limitReached') }}</span>
    </template>
  </div>
  <!-- ⋯ : rename / remove (e.g. someone who joined the wrong room) -->
  <div v-if="menuOpen" class="t-menu">
    <button v-if="canRename" type="button" @click="pick('edit')"><i class="fas fa-pen"></i>{{ $t('room.rename') }}</button>
    <button type="button" class="danger" @click="pick('remove')"><i class="fas fa-user-minus"></i>{{ $t('room.removePlayer') }}</button>
  </div>
  </div>
</template>

<script setup>
// One tournament player as a compact row: players still in get 淘汰, players
// out get 重新買入 while re-entry is open (or the reason it isn't).
import { computed, ref } from 'vue';
import { canRenamePlayer } from '../../utils/ledgerOps.js';
import { formatNumber } from '../../utils/formatters.js';
import TitleBadge from '../common/TitleBadge.vue';

const props = defineProps({
  player: { type: Object, required: true },
  canReentry: { type: Boolean, default: false },
  // Why an eliminated player can't re-enter while others still can ('limit')
  reentryBlocked: { type: String, default: '' },
  baseBuyIn: { type: Number, default: 0 },
  isChampion: { type: Boolean, default: false },
  // KO games: head value (0 = no bounty) and who took this player's last head
  bountyPerHead: { type: Number, default: 0 },
  knockedOutBy: { type: String, default: '' },
  // PKO: this player's current head (0 = don't show)
  headValue: { type: Number, default: 0 },
  // 抽座位: "3" (or "2-3" with several tables), and the starting dealer button
  seatLabel: { type: String, default: '' },
  isButton: { type: Boolean, default: false },
});

const emit = defineEmits(['eliminate', 'reentry', 'edit', 'remove']);

const menuOpen = ref(false);
const pick = (action) => {
  menuOpen.value = false;
  emit(action, props.player);
};

const champion = computed(() => props.isChampion || props.player.placement === 1);
// Account names come from the profile; only hand-added and guest seats rename
const canRename = computed(() => canRenamePlayer(props.player));

const entryCount = computed(() => {
  if (!props.baseBuyIn || props.baseBuyIn <= 0) return 1;
  return Math.max(1, Math.round((props.player.buyIn || 0) / props.baseBuyIn));
});
</script>

<style scoped>
.t-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.65rem 0.9rem;
  border-bottom: 1px solid rgb(var(--tw-slate-700) / 0.7);
}
.t-wrap:last-child .t-row { border-bottom: none; }
.t-menu {
  display: flex;
  gap: 0.5rem;
  padding: 0 0.9rem 0.65rem;
  border-bottom: 1px solid rgb(var(--tw-slate-700) / 0.7);
}
.t-menu button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.45rem;
  border-radius: 0.55rem;
  font-size: 0.8rem;
  color: rgb(var(--tw-slate-200));
  background: rgb(var(--tw-slate-700) / 0.7);
}
.t-menu button.danger { color: rgb(var(--tw-rose-300)); }
.t-name { color: rgb(var(--tw-white)); font-weight: 700; }
.t-seat { flex-shrink: 0; min-width: 1.5rem; height: 1.5rem; padding: 0 0.3rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: rgb(var(--tw-white)); background: rgb(var(--tw-slate-600)); }
.t-button { flex-shrink: 0; width: 1.3rem; height: 1.3rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 900; color: #1f2937; background: #f8fafc; border: 2px solid #cbd5e1; }
.t-row.out .t-name { color: rgb(var(--tw-slate-400)); font-weight: 500; }
.t-place { width: 1.8rem; flex-shrink: 0; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: rgb(var(--tw-slate-400)); }
.t-sub { font-size: 0.72rem; color: rgb(var(--tw-slate-400)); margin-top: 0.1rem; }
.t-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.7rem;
  border-radius: 0.55rem;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}
.t-btn.elim { color: rgb(var(--tw-rose-300)); border: 1px solid rgb(var(--tw-rose-500) / 0.45); background: rgb(var(--tw-rose-500) / 0.08); }
.t-btn.re { color: rgb(var(--tw-emerald-300)); border: 1px solid rgb(var(--tw-emerald-500) / 0.5); background: rgb(var(--tw-emerald-500) / 0.1); }
.t-icon { flex-shrink: 0; width: 2rem; height: 2rem; border-radius: 0.5rem; color: rgb(var(--tw-slate-400)); }
.t-note { flex-shrink: 0; font-size: 0.72rem; color: rgb(var(--tw-slate-500)); }
</style>
