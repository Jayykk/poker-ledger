<template>
  <div class="md-page">
    <!-- Header -->
    <div class="md-head">
      <button type="button" class="md-icon" :aria-label="$t('common.back')" @click="goBack">
        <i class="fas fa-arrow-left"></i>
      </button>
      <div class="min-w-0">
        <div class="md-title">🎁 {{ $t('mystery.title') }}</div>
        <div class="md-sub truncate">{{ game?.name }}</div>
      </div>
      <div class="ml-auto text-right">
        <div class="md-sub">{{ $t('mystery.pool') }}</div>
        <div class="md-pool">${{ formatNumber(pool) }}</div>
        <div v-if="!reentryClosed" class="md-sub text-amber-300">{{ $t('mystery.estimate') }}</div>
      </div>
    </div>

    <div v-if="!game" class="md-empty">{{ $t('game.noActiveGame') }}</div>

    <!-- Desktops: who's drawing (left) · envelopes and results (right) -->
    <div v-else class="md-cols">
      <div class="md-col">
      <!-- TV: open the stage (players then draw from their phones), and
           whether draws here are shown on the TV -->
      <div v-if="hasClock" class="md-card md-tv">
        <div class="flex items-center gap-2">
          <span class="text-lg">📺</span>
          <div class="min-w-0 flex-1">
            <div class="font-bold">{{ stageOpen ? $t('mystery.stageIsOpen') : tvOn ? $t('mystery.tvOn') : $t('mystery.tvOff') }}</div>
            <div class="md-sub">{{ stageOpen ? $t('mystery.stageOpenHint') : tvOn ? $t('mystery.tvOnHint') : $t('mystery.stageClosedHint') }}</div>
          </div>
          <button v-if="isHost" type="button" class="md-tier-btn" :disabled="busy" @click="toggleStage">
            {{ stageOpen ? $t('mystery.closeStage') : $t('mystery.openStage') }}
          </button>
        </div>
        <label class="flex items-center gap-2 pt-2 md-sub">
          <input v-model="onTv" type="checkbox" class="accent-amber-500" />
          {{ $t('mystery.playOnTv') }}
        </label>
      </div>
      <div v-if="myBlockedHint" class="md-card md-status">
        <div class="font-bold">🎁 {{ $t('mystery.yourDrawWaiting') }}</div>
        <div class="md-sub">{{ myBlockedHint }}</div>
      </div>
      <div v-if="isHost && pending.length && !hostMayDraw" class="md-card md-status">
        <div class="font-bold">⏸ {{ $t('mystery.pauseFirst') }}</div>
        <div class="md-sub">{{ $t('mystery.pauseFirstHint') }}</div>
      </div>

      <!-- Status -->
      <div v-if="!phaseStarted && !tickets.length" class="md-card md-status">
        <div class="font-bold">⏳ {{ $t('mystery.notStarted') }}</div>
        <div class="md-sub">{{ $t('mystery.notStartedHint') }}</div>
      </div>

      <!-- Waiting to draw -->
      <section class="md-card">
        <div class="md-section">{{ $t('mystery.waiting') }} {{ pending.length }}</div>
        <div v-if="!pending.length" class="md-sub py-2">{{ $t('mystery.none') }}</div>
        <div v-for="tk in pending" :key="tk.id" class="md-ticket">
          <div class="min-w-0">
            <div class="font-bold truncate">{{ namesOf(tk.by) }}</div>
            <div class="md-sub">{{ tk.final ? $t('mystery.ticketFinal') : $t('mystery.ticketKo', { victim: nameOf(tk.holderId) }) }}<template v-if="tk.by.length > 1"> · {{ $t('mystery.split', { names: '' }).trim() }}</template></div>
          </div>
          <template v-if="mayDraw(tk)">
            <button v-if="drawMode === 'system'" type="button" class="md-draw" :disabled="busy || !remaining.length" @click="drawRandom(tk)">
              🎁 {{ $t('mystery.draw') }}
            </button>
            <div v-else class="flex flex-wrap gap-1 justify-end">
              <span class="md-sub w-full text-right">{{ $t('mystery.pick') }}</span>
              <button
                v-for="tier in tiersLeft"
                :key="tier.tier"
                type="button"
                class="md-tier-btn"
                :disabled="busy"
                @click="drawTier(tk, tier.tier)"
              >
                ${{ formatNumber(tier.amount) }}
              </button>
            </div>
          </template>
        </div>

        <!-- End of the tournament: the champion draws the last envelope. Before
             a deal everyone left draws one (asks first — it's easy to hit by
             mistake while the game is still going). -->
        <div v-if="isHost && phaseStarted && canFinalDraw" class="pt-2">
          <button v-if="aliveCount === 1" type="button" class="md-final w-full" :disabled="busy" @click="finalDraws">
            🏆 {{ $t('mystery.finalDraws') }}
          </button>
          <button v-else type="button" class="md-link" :disabled="busy" @click="dealDraws">
            🤝 {{ $t('mystery.finalDrawsDealHint') }}
          </button>
        </div>
      </section>
      </div>

      <div class="md-col">
      <!-- Envelopes left -->
      <section class="md-card">
        <div class="md-section">{{ $t('mystery.left') }} {{ remaining.length }} / {{ slots.length }}</div>
        <div class="md-envelopes">
          <div v-for="tier in tiers" :key="tier.tier" class="md-env" :class="{ gone: !tier.left }">
            <div class="md-env-amount">${{ formatNumber(tier.amount) }}</div>
            <div class="md-sub">× {{ tier.left }} / {{ tier.total }}</div>
          </div>
        </div>
        <template v-if="isHost && !anyDrawn">
          <button type="button" class="md-link" @click="editing = !editing">
            <i class="fas fa-sliders-h mr-1"></i>{{ $t('mystery.editEnvelopes') }}
          </button>
          <div v-if="editing" class="pt-2 space-y-2">
            <EnvelopeEditor v-model:envelopes="draftEnvelopes" :pool="pool" />
            <button type="button" class="md-final" :disabled="busy || !draftBalanced" @click="saveEnvelopes">
              {{ $t('mystery.save') }}
            </button>
          </div>
        </template>
        <div v-else-if="isHost && anyDrawn" class="md-sub pt-1">🔒 {{ $t('mystery.locked') }}</div>
      </section>

      <!-- Drawn -->
      <section v-if="drawn.length" class="md-card">
        <div class="md-section">{{ $t('mystery.history') }}</div>
        <div v-for="tk in drawn" :key="tk.id" class="md-ticket">
          <div class="min-w-0">
            <div class="font-bold truncate">{{ namesOf(tk.by) }}</div>
            <div class="md-sub">{{ tk.final ? $t('mystery.ticketFinal') : $t('mystery.ticketKo', { victim: nameOf(tk.holderId) }) }}</div>
          </div>
          <div class="md-won">${{ formatNumber(amounts[tk.envelope] || 0) }}</div>
          <button v-if="isHost" type="button" class="md-icon" :aria-label="$t('mystery.undo')" :disabled="busy" @click="undoDraw(tk)">
            <i class="fas fa-undo"></i>
          </button>
        </div>
      </section>
      </div>
    </div>

    <!-- Result: "watch the TV" first when it's shown there -->
    <MysteryPhoneReveal :result="reveal" :projected="hasClock && onTv" @close="reveal = null" />
  </div>
</template>

<script setup>
// 神秘賞金抽獎: the waiting draws, the envelopes left and what's been drawn.
// Opens from the room or the clock any time (e.g. during a break). The host
// draws (random, or records a physical envelope), can undo a draw, starts the
// champion's / a deal's final draws, and can adjust the envelopes until the
// first one is drawn. See functions/src/utils/mysteryBounty.js.
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../store/modules/game.js';
import { useTournamentClock } from '../composables/useTournamentClock.js';
import { useNotification } from '../composables/useNotification.js';
import { useConfirm } from '../composables/useConfirm.js';
import EnvelopeEditor from '../components/templates/EnvelopeEditor.vue';
import MysteryPhoneReveal from '../components/tournament/MysteryPhoneReveal.vue';
import { useAuthStore } from '../store/modules/auth.js';
import { formatNumber } from '../utils/formatters.js';
import {
  envelopeSlots, envelopeAmounts, envelopeTotalShare, remainingSlots, allTickets, freeSlotCount,
  gameBountyPerEntry, bountyPool, mysteryPhaseActive, slotOfTier, canDrawTicket, isTvOn,
} from '../utils/bounty.js';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { error: showError } = useNotification();
const { confirm } = useConfirm();
const gameStore = useGameStore();
const { game, isHost, error: gameError } = storeToRefs(gameStore);
const { joinGameListener, mysteryDraw, mysteryUndoDraw, mysteryFinalDraws, updateMysteryEnvelopes } = gameStore;
const clock = useTournamentClock();

const authStore = useAuthStore();
const busy = ref(false);
// Draws here are also revealed on the TV stage (the clock screen) — on by default
const onTv = ref(true);
const reveal = ref(null);
const editing = ref(false);
const draftEnvelopes = ref([]);

onMounted(async () => {
  const id = route.params.gameId;
  if (id && game.value?.id !== id) await joinGameListener(id);
});
watch(() => game.value?.tournamentSessionId, (sid) => {
  if (sid && !clock.session.value) clock.joinSession(sid);
}, { immediate: true });

const bounty = computed(() => game.value?.bounty || null);
const players = computed(() => game.value?.players || []);
const drawMode = computed(() => bounty.value?.drawMode || 'system');
const perEntry = computed(() => (game.value ? gameBountyPerEntry(game.value) : 0));
const pool = computed(() => bountyPool(players.value, game.value?.baseBuyIn, perEntry.value));
const slots = computed(() => envelopeSlots(bounty.value));
const amounts = computed(() => envelopeAmounts(bounty.value, pool.value));
const remaining = computed(() => remainingSlots(bounty.value, players.value));
const tickets = computed(() => allTickets(players.value));
const pending = computed(() => tickets.value.filter((tk) => tk.envelope === null || tk.envelope === undefined));
const drawn = computed(() => tickets.value
  .filter((tk) => tk.envelope !== null && tk.envelope !== undefined)
  .sort((a, b) => (b.at || 0) - (a.at || 0)));
const anyDrawn = computed(() => drawn.value.length > 0);
const aliveCount = computed(() => players.value.filter((p) => !p.eliminated).length);

// ── who may draw now (canDrawTicket) ──
const hasClock = computed(() => !!game.value?.tournamentSessionId);
const stageOpen = computed(() => clock.session.value?.state?.mysteryStage?.open === true);
// The clock is on the TV (its screen reports in every 30 s)
const now = ref(Date.now());
const nowTimer = setInterval(() => { now.value = Date.now(); }, 10 * 1000);
onUnmounted(() => clearInterval(nowTimer));
const tvOn = computed(() => isTvOn(clock.session.value?.state?.tvPresence, now.value));
const mySeatId = computed(() => players.value.find((p) => p.uid && p.uid === authStore.user?.uid)?.id || null);
const drawCtx = computed(() => ({
  isHost: isHost.value,
  mySeatId: mySeatId.value,
  clockPaused: ['paused', 'waiting', 'ended'].includes(clock.status.value),
  onBreak: clock.isBreak.value,
  stageOpen: stageOpen.value,
  tvOn: tvOn.value,
  drawMode: drawMode.value,
}));
// A player with a draw waiting who can't draw right now: say what it takes
const myWaiting = computed(() => !isHost.value && pending.value.some((tk) => (tk.by || []).includes(mySeatId.value)));
const myBlockedHint = computed(() => {
  if (!myWaiting.value || pending.value.some((tk) => mayDraw(tk))) return '';
  if (drawMode.value === 'manual') return t('mystery.manualByHost');
  return tvOn.value ? t('mystery.waitForPause') : t('mystery.waitForTv');
});
const mayDraw = (tk) => canDrawTicket(tk, drawCtx.value);
// Host: a running clock blocks draws from the phone (pause / break / stage)
const hostMayDraw = computed(() => !hasClock.value || drawCtx.value.clockPaused || drawCtx.value.onBreak || stageOpen.value);
async function toggleStage() {
  busy.value = true;
  try { await clock.setMysteryStage(!stageOpen.value); } finally { busy.value = false; }
}

// Re-entry closed and the start condition met (mirrors the store's check)
const reentryClosed = computed(() => {
  const cfg = clock.config.value || {};
  const until = Number(cfg.reentryUntilLevel) || 0;
  return until <= 0 || (clock.currentLevel.value || 0) >= until || clock.status.value === 'ended';
});
const phaseStarted = computed(() => tickets.value.length > 0 || mysteryPhaseActive(bounty.value, {
  aliveBefore: aliveCount.value,
  reentryClosed: reentryClosed.value,
  level: clock.currentLevel.value || 0,
}));
const canFinalDraw = computed(() => freeSlotCount(bounty.value, players.value) > 0
  && players.value.some((p) => !p.eliminated && !(p.mysteryTickets || []).some((tk) => tk.final))
  && reentryClosed.value);

// Tiers with amounts and how many are left
const tiers = computed(() => (bounty.value?.envelopes || []).map((e, tier) => {
  const tierSlots = slots.value.filter((s) => s.tier === tier);
  return {
    tier,
    amount: amounts.value[tierSlots[0]?.slot] || 0,
    total: tierSlots.length,
    left: remaining.value.filter((s) => s.tier === tier).length,
  };
}));
const tiersLeft = computed(() => tiers.value.filter((x) => x.left > 0));

const nameOf = (id) => players.value.find((p) => p.id === id)?.name || '?';
const namesOf = (ids = []) => ids.map(nameOf).join('、');

function randomIndex(n) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
}

async function doDraw(tk, slot) {
  if (slot === null || slot === undefined) return;
  busy.value = true;
  try {
    const ok = await mysteryDraw(tk.id, slot);
    if (!ok) { showError(gameError.value || t('common.unexpectedError')); return; }
    const amount = amounts.value[slot] || 0;
    reveal.value = {
      names: namesOf(tk.by),
      amount,
      split: tk.by.length > 1 ? t('mystery.split', { names: namesOf(tk.by) }) : '',
    };
  } finally {
    busy.value = false;
  }
}

const drawRandom = (tk) => {
  const free = remaining.value;
  if (!free.length) return;
  return doDraw(tk, free[randomIndex(free.length)].slot);
};
const drawTier = (tk, tier) => doDraw(tk, slotOfTier(bounty.value, players.value, tier));

async function undoDraw(tk) {
  busy.value = true;
  try {
    if (!(await mysteryUndoDraw(tk.id))) showError(gameError.value || t('common.unexpectedError'));
  } finally {
    busy.value = false;
  }
}

async function dealDraws() {
  const ok = await confirm({ message: t('mystery.finalDrawsDealConfirm', { n: aliveCount.value }), type: 'warning' });
  if (ok) await finalDraws();
}

async function finalDraws() {
  busy.value = true;
  try {
    if (!(await mysteryFinalDraws())) showError(gameError.value || t('common.unexpectedError'));
  } finally {
    busy.value = false;
  }
}

watch(editing, (on) => {
  if (on) draftEnvelopes.value = (bounty.value?.envelopes || []).map((e) => ({ ...e }));
});
const draftBalanced = computed(() => draftEnvelopes.value.length > 0
  && Math.abs(envelopeTotalShare(draftEnvelopes.value) - 100) < 0.05);

async function saveEnvelopes() {
  busy.value = true;
  try {
    const clean = draftEnvelopes.value
      .map((e) => ({ share: Number(e.share) || 0, count: Math.max(1, Math.floor(Number(e.count)) || 1) }))
      .filter((e) => e.share > 0);
    if (await updateMysteryEnvelopes(clean)) editing.value = false;
    else showError(gameError.value || t('common.unexpectedError'));
  } finally {
    busy.value = false;
  }
}

function goBack() {
  if (window.history.length > 1) router.back();
  else router.push(game.value ? '/tournament-game' : '/lobby');
}
</script>

<style scoped>
.md-page { width: 100%; min-height: 100vh; padding: 1rem 1rem calc(4rem + env(safe-area-inset-bottom, 0px) + 2rem); max-width: 40rem; margin: 0 auto; }
@media (min-width: 768px) { .md-page { max-width: 48rem; } }
@media (min-width: 1024px) {
  .md-page { max-width: 64rem; }
  .md-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1rem; align-items: start; }
}
.md-head { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
.md-title { font-size: 1.15rem; font-weight: 800; color: rgb(var(--tw-white)); }
.md-sub { font-size: 0.75rem; color: rgb(var(--tw-slate-400)); }
.md-pool { font-family: 'JetBrains Mono', monospace; font-size: 1.4rem; font-weight: 800; color: rgb(var(--tw-amber-400)); }
.md-icon { width: 2.25rem; height: 2.25rem; border-radius: 0.6rem; flex-shrink: 0; color: rgb(var(--tw-slate-300)); background: rgb(var(--tw-slate-700) / 0.6); }
.md-empty { text-align: center; padding: 4rem 0; color: rgb(var(--tw-slate-400)); }
.md-card {
  border-radius: 0.9rem;
  background: rgb(var(--tw-slate-800) / 0.6);
  border: 1px solid rgb(var(--tw-slate-600) / 0.5);
  padding: 0.75rem 0.9rem;
  margin-bottom: 0.75rem;
}
.md-status { border-color: rgb(var(--tw-amber-500) / 0.4); color: rgb(var(--tw-white)); }
.md-section { font-size: 0.8rem; font-weight: 700; color: rgb(var(--tw-slate-200)); margin-bottom: 0.4rem; }
.md-ticket {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0;
  border-top: 1px solid rgb(var(--tw-slate-700) / 0.7);
  color: rgb(var(--tw-white));
}
.md-ticket > .min-w-0 { flex: 1; }
.md-draw {
  flex-shrink: 0;
  padding: 0.6rem 1.1rem;
  border-radius: 0.75rem;
  font-weight: 800;
  background: rgb(var(--tw-amber-500));
  color: var(--on-accent);
}
.md-draw:disabled, .md-tier-btn:disabled, .md-final:disabled { opacity: 0.4; }
.md-tier-btn {
  padding: 0.35rem 0.6rem;
  border-radius: 0.5rem;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  color: rgb(var(--tw-amber-300));
  border: 1px solid rgb(var(--tw-amber-500) / 0.5);
}
.md-final {
  flex: 1;
  padding: 0.6rem;
  border-radius: 0.75rem;
  font-weight: 700;
  color: rgb(var(--tw-amber-300));
  border: 1px solid rgb(var(--tw-amber-500) / 0.5);
  background: rgb(var(--tw-amber-500) / 0.1);
}
.md-envelopes { display: grid; grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr)); gap: 0.5rem; }
.md-env {
  border-radius: 0.75rem;
  padding: 0.6rem;
  text-align: center;
  background: rgb(var(--tw-amber-500) / 0.1);
  border: 1px solid rgb(var(--tw-amber-500) / 0.35);
}
.md-env.gone { opacity: 0.35; }
.md-env-amount { font-family: 'JetBrains Mono', monospace; font-weight: 800; color: rgb(var(--tw-amber-300)); }
.md-won { flex-shrink: 0; font-family: 'JetBrains Mono', monospace; font-weight: 800; color: rgb(var(--tw-emerald-400)); }
.md-link { font-size: 0.8rem; color: rgb(var(--tw-amber-300)); padding-top: 0.6rem; }
.md-reveal {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 0.7);
}
.md-reveal-card {
  text-align: center;
  padding: 2rem 2.5rem;
  border-radius: 1.25rem;
  background: rgb(var(--tw-slate-800));
  border: 2px solid rgb(var(--tw-amber-500));
  animation: md-pop 0.6s cubic-bezier(0.2, 1.4, 0.4, 1);
}
.md-reveal-emoji { font-size: 3rem; }
.md-reveal-name { margin-top: 0.5rem; color: rgb(var(--tw-white)); font-weight: 700; }
.md-reveal-amount { font-family: 'JetBrains Mono', monospace; font-size: 3rem; font-weight: 900; color: rgb(var(--tw-amber-400)); }
@keyframes md-pop {
  0% { transform: rotateY(90deg) scale(0.6); opacity: 0; }
  100% { transform: rotateY(0) scale(1); opacity: 1; }
}
.reveal-enter-active, .reveal-leave-active { transition: opacity 0.25s; }
.reveal-enter-from, .reveal-leave-to { opacity: 0; }
</style>
