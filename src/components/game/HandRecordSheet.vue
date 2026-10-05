<template>
  <BaseModal
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="$t('hand.recordHandResult')"
    :close-on-click-outside="false"
  >
    <div class="hr-steps" aria-hidden="true">
      <span v-for="n in 3" :key="n" :class="{ on: step >= n }"></span>
    </div>

    <div class="max-h-[64vh] overflow-y-auto space-y-3 pr-0.5">
      <!-- ① Who's in this hand — seat order, tap to pick -->
      <template v-if="step === 1">
        <div>
          <div class="hr-title">{{ $t('hand.flow.whoIn') }}</div>
          <div class="hr-sub">{{ $t('hand.flow.whoInHint') }}</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in roster"
            :key="p.playerId"
            type="button"
            class="hr-chip"
            :class="{ on: p.participating }"
            @click="toggleIn(p)"
          >
            <span class="hr-no">{{ p.seatMark || '·' }}</span>{{ p.playerName }}
          </button>
        </div>
      </template>

      <!-- ② The cards: the board and everyone's two, one shared pad -->
      <template v-else-if="step === 2">
        <!-- Photo → cards, folded away until wanted -->
        <button v-if="!showPhoto" type="button" class="hr-row w-full text-left" @click="showPhoto = true">
          <span>📷</span><span class="flex-1 text-white font-semibold">{{ $t('hand.flow.photo') }}</span><span class="hr-sub">AI</span>
        </button>
        <CardRecognitionPanel
          v-show="showPhoto"
          ref="recognitionPanel"
          :community-cards="handRecord.communityCards"
          :players="handRecord.players"
          @apply="handleRecognitionApply"
        />

        <div>
          <div class="hr-sub mb-1">{{ $t('hand.communityCards') }}</div>
          <div class="flex gap-1.5">
            <button
              v-for="i in 5"
              :key="`b${i}`"
              type="button"
              class="hr-slot"
              :class="slotClass('board', null, i - 1)"
              @click="focusSlot({ kind: 'board', index: i - 1 })"
            >
              {{ handRecord.communityCards[i - 1] || (cursor?.kind === 'board' && cursor.index === i - 1 ? '…' : '') }}
            </button>
          </div>
        </div>

        <div class="space-y-1.5">
          <div v-for="p in participants" :key="p.playerId" class="hr-row">
            <span class="hr-no">{{ p.seatMark || '·' }}</span>
            <span class="flex-1 min-w-0 truncate font-semibold text-white">{{ p.playerName }}</span>
            <template v-if="p.mucked">
              <button type="button" class="hr-muck" @click="unmuck(p)">{{ $t('hand.flow.mucked') }}</button>
            </template>
            <template v-else>
              <button
                v-for="i in 2"
                :key="`${p.playerId}${i}`"
                type="button"
                class="hr-slot sm"
                :class="slotClass('player', p.playerId, i - 1)"
                @click="focusSlot({ kind: 'player', id: p.playerId, index: i - 1 })"
              >
                {{ p.cards[i - 1] || '' }}
              </button>
            </template>
            <span class="hr-type">{{ handTypeLabel(p) }}</span>
          </div>
        </div>

        <!-- The pad: suit, then rank; fills the highlighted slot and moves on -->
        <div v-if="cursor" class="hr-pad">
          <div class="grid grid-cols-4 gap-1.5">
            <button
              v-for="(symbol, key) in SUITS"
              :key="key"
              type="button"
              class="hr-key suit"
              :class="{ on: suit === symbol, red: symbol === '♥' || symbol === '♦' }"
              @click="suit = symbol"
            >{{ symbol }}</button>
          </div>
          <div class="grid grid-cols-7 gap-1.5 mt-1.5">
            <button
              v-for="r in RANK_ORDER"
              :key="r"
              type="button"
              class="hr-key"
              :disabled="!suit || used.has(r + suit)"
              @click="placeCard(r + suit)"
            >{{ r === '10' ? 'T' : r }}</button>
            <button type="button" class="hr-key skip" @click="skipSlot">{{ $t('hand.flow.skip') }}</button>
          </div>
        </div>
      </template>

      <!-- ③ Who won, and what everyone else put in (the winner's share is worked out) -->
      <template v-else>
        <div>
          <div class="hr-title">{{ $t('hand.flow.whoWon') }}</div>
          <div class="hr-sub">{{ $t('hand.flow.whoWonHint') }}</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in participants"
            :key="p.playerId"
            type="button"
            class="hr-chip"
            :class="{ on: p.winner }"
            @click="p.winner = !p.winner"
          >
            <span v-if="p.winner">🏆</span>{{ p.playerName }}
          </button>
        </div>

        <template v-if="winners.length">
          <div class="hr-sub">{{ $t('hand.flow.putIn') }}</div>
          <div v-for="p in losers" :key="p.playerId" class="hr-row wrap">
            <span class="flex-1 min-w-0 truncate font-semibold text-white">{{ p.playerName }}</span>
            <input
              v-model.number="p.putIn"
              type="number"
              min="0"
              inputmode="numeric"
              class="hr-input"
              :aria-label="$t('hand.flow.putIn')"
            />
            <div class="w-full flex flex-wrap gap-1.5">
              <button v-for="q in quickAmounts" :key="q.label" type="button" class="hr-quick" @click="p.putIn = (Number(p.putIn) || 0) + q.amount">
                +{{ q.label }}
              </button>
              <button type="button" class="hr-quick clear" @click="p.putIn = 0">{{ $t('hand.flow.clear') }}</button>
            </div>
          </div>
          <div v-for="p in winners" :key="`w${p.playerId}`" class="hr-row win">
            <span class="flex-1 min-w-0 truncate font-semibold">🏆 {{ p.playerName }}</span>
            <span class="font-mono font-bold">+{{ formatNumber(shareOf(p)) }}</span>
          </div>
          <div class="hr-sub text-center">{{ $t('hand.flow.potBalanced', { pot: formatNumber(pot) }) }}</div>
        </template>
      </template>
    </div>

    <template #footer>
      <div class="flex gap-2">
        <BaseButton v-if="step > 1" variant="ghost" @click="step -= 1">{{ $t('hand.flow.back') }}</BaseButton>
        <BaseButton v-if="step < 3" variant="primary" full-width :disabled="!canNext" @click="next">
          {{ step === 1 ? $t('hand.flow.toCards') : $t('hand.flow.toResult') }}
        </BaseButton>
        <BaseButton v-else variant="primary" full-width :disabled="!canSave || saving" @click="handleSave">
          {{ $t('common.save') }}
        </BaseButton>
      </div>
      <div v-if="hint" class="hr-sub text-center mt-2">{{ hint }}</div>
    </template>
  </BaseModal>
</template>

<script setup>
// 紀錄手牌 in three steps: ① who's in (seat order) → ② the cards (one pad
// that fills the next empty slot; the hand type is worked out) → ③ who won
// and what everyone else put in — the winners' share is computed, so the
// hand always balances. Saves the same shape as before (players[].cards /
// handType / chips, + winner) so the hand history reads old and new alike.
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useHand } from '../../composables/useHand.js';
import { useNotification } from '../../composables/useNotification.js';
import { SUITS, DEFAULT_BUY_IN } from '../../utils/constants.js';
import { evaluateHand } from '../../utils/pokerHandEvaluator.js';
import { applyAssignments } from '../../utils/cardRecognition.js';
import { formatNumber } from '../../utils/formatters.js';
import { splitPot, quickPutIns } from '../../utils/handRecordFlow.js';
import BaseModal from '../common/BaseModal.vue';
import BaseButton from '../common/BaseButton.vue';
import CardRecognitionPanel from './CardRecognitionPanel.vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  gameId: { type: String, required: true },
  players: { type: Array, required: true },
  baseBuyIn: { type: Number, default: DEFAULT_BUY_IN },
  // The clock's big blind (tournaments / timed games) for the quick amounts
  bigBlind: { type: Number, default: 0 },
});
const emit = defineEmits(['update:modelValue', 'saved']);

const { t } = useI18n();
const { createHandRecord } = useHand();
const { success, error } = useNotification();
const RANK_ORDER = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

const step = ref(1);
const handRecord = ref({ communityCards: [], players: [] });
const recognitionPanel = ref(null);
const showPhoto = ref(false);

// Everyone still in, in seat order (dealer first) once seats are drawn
const seatKey = (p) => (p.seat ? p.seat.seat : 99);
watch(() => props.players, (list) => {
  const prev = new Map(handRecord.value.players.map((p) => [p.playerId, p]));
  handRecord.value.players = [...(list || [])]
    .filter((p) => !p.eliminated)
    .sort((a, b) => seatKey(a) - seatKey(b))
    .map((p) => prev.get(p.id) || {
      playerId: p.id,
      playerName: p.name,
      playerUid: p.uid || null,
      seatMark: p.seat ? (p.seat.dealer ? '🃏' : String(p.seat.seat)) : '',
      cards: [],
      mucked: false,
      participating: false,
      winner: false,
      putIn: 0,
    });
}, { immediate: true });

const roster = computed(() => handRecord.value.players);
const participants = computed(() => handRecord.value.players.filter((p) => p.participating));
const winners = computed(() => participants.value.filter((p) => p.winner));
const losers = computed(() => participants.value.filter((p) => !p.winner));

function toggleIn(p) {
  p.participating = !p.participating;
  if (!p.participating) Object.assign(p, { cards: [], mucked: false, winner: false, putIn: 0 });
}

// ── ② cards ──
const suit = ref('');
const cursor = ref(null); // { kind: 'board' | 'player', id?, index }
const used = computed(() => new Set([
  ...handRecord.value.communityCards,
  ...participants.value.flatMap((p) => p.cards),
]));

// Slots in fill order: the board, then each player's two
const slots = computed(() => [
  ...Array.from({ length: 5 }, (_, index) => ({ kind: 'board', index })),
  ...participants.value.filter((p) => !p.mucked).flatMap((p) => [0, 1].map((index) => ({ kind: 'player', id: p.playerId, index }))),
]);
const valueAt = (s) => (s.kind === 'board'
  ? handRecord.value.communityCards[s.index]
  : participants.value.find((p) => p.playerId === s.id)?.cards[s.index]);
const sameSlot = (a, b) => !!a && !!b && a.kind === b.kind && a.index === b.index && (a.kind === 'board' || a.id === b.id);
const firstEmpty = (from = 0) => slots.value.slice(from).find((s) => !valueAt(s))
  || slots.value.find((s) => !valueAt(s)) || null;
const slotClass = (kind, id, index) => {
  const s = { kind, id, index };
  return { cur: sameSlot(cursor.value, s), filled: !!valueAt(s), red: /[♥♦]/.test(valueAt(s) || '') };
};

function focusSlot(s) {
  // tapping a card takes it back out
  if (valueAt(s)) setAt(s, null);
  cursor.value = s;
}
function setAt(s, card) {
  if (s.kind === 'board') {
    const board = [...handRecord.value.communityCards];
    if (card) board[s.index] = card; else board.splice(s.index, 1);
    handRecord.value.communityCards = board.filter(Boolean).slice(0, 5);
  } else {
    const p = participants.value.find((x) => x.playerId === s.id);
    const cards = [...p.cards];
    if (card) cards[s.index] = card; else cards.splice(s.index, 1);
    p.cards = cards.filter(Boolean).slice(0, 2);
  }
}
function placeCard(card) {
  if (!cursor.value || used.value.has(card)) return;
  // board cards fill left to right; a player's two in order
  const s = cursor.value.kind === 'board'
    ? { kind: 'board', index: Math.min(cursor.value.index, handRecord.value.communityCards.length) }
    : { ...cursor.value, index: Math.min(cursor.value.index, participants.value.find((p) => p.playerId === cursor.value.id).cards.length) };
  setAt(s, card);
  const at = slots.value.findIndex((x) => sameSlot(x, s));
  cursor.value = firstEmpty(at + 1);
}
function skipSlot() {
  const c = cursor.value;
  if (!c) return;
  if (c.kind === 'board') {
    // the hand ended before the river: on to the first player
    const firstPlayer = slots.value.findIndex((s) => s.kind === 'player');
    cursor.value = firstPlayer >= 0 ? firstEmpty(firstPlayer) : null;
  } else {
    // didn't show: mucked
    const p = participants.value.find((x) => x.playerId === c.id);
    Object.assign(p, { cards: [], mucked: true });
    cursor.value = firstEmpty(0);
  }
}
function unmuck(p) {
  p.mucked = false;
  cursor.value = { kind: 'player', id: p.playerId, index: 0 };
}

const handTypeOf = (p) => (p.cards.length === 2 && handRecord.value.communityCards.length >= 3
  ? evaluateHand(p.cards, handRecord.value.communityCards) : '');
const handTypeLabel = (p) => {
  if (p.mucked) return '';
  const type = handTypeOf(p);
  return type ? t(`hand.handTypes.${type}`) : '';
};

// Photo → cards (assigned by the user in the panel)
function handleRecognitionApply(assignments) {
  const { communityCards, players, appliedCount } = applyAssignments(handRecord.value, assignments);
  handRecord.value.communityCards = communityCards;
  players.forEach((p, i) => { handRecord.value.players[i].cards = p.cards; });
  cursor.value = firstEmpty(0);
  success(t('hand.recognition.applied', { count: appliedCount }));
}

// ── ③ result ──
const quickAmounts = computed(() => quickPutIns({ bigBlind: props.bigBlind, baseBuyIn: props.baseBuyIn }));
const pot = computed(() => losers.value.reduce((s, p) => s + Math.max(0, Number(p.putIn) || 0), 0));
const shares = computed(() => splitPot(pot.value, winners.value.map((p) => p.playerId)));
const shareOf = (p) => shares.value[p.playerId] || 0;

// ── steps ──
const canNext = computed(() => (step.value === 1 ? participants.value.length >= 2 : true));
const canSave = computed(() => winners.value.length > 0 && losers.value.length > 0 && pot.value > 0);
const hint = computed(() => {
  if (step.value === 1 && !canNext.value) return t('hand.flow.needTwo');
  if (step.value === 3 && !winners.value.length) return t('hand.flow.needWinner');
  if (step.value === 3 && !canSave.value) return t('hand.flow.needPutIn');
  return '';
});
function next() {
  step.value += 1;
  if (step.value === 2) {
    suit.value = '';
    cursor.value = firstEmpty(0);
  }
}

const saving = ref(false);
async function handleSave() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    const data = {
      communityCards: handRecord.value.communityCards,
      players: participants.value.map((p) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        playerUid: p.playerUid || null,
        cards: p.mucked ? [] : p.cards,
        handType: p.mucked ? '' : handTypeOf(p),
        chips: p.winner ? shareOf(p) : -Math.max(0, Number(p.putIn) || 0),
        ...(p.winner ? { winner: true } : {}),
      })),
    };
    const handId = await createHandRecord(props.gameId, data);
    if (!handId) {
      error(t('common.error'));
      return;
    }
    success(t('common.save'));
    emit('update:modelValue', false);
    emit('saved');
    reset();
  } finally {
    saving.value = false;
  }
}

function reset() {
  recognitionPanel.value?.reset?.();
  showPhoto.value = false;
  step.value = 1;
  suit.value = '';
  cursor.value = null;
  handRecord.value.communityCards = [];
  handRecord.value.players.forEach((p) => Object.assign(p, { cards: [], mucked: false, participating: false, winner: false, putIn: 0 }));
}
</script>

<style scoped>
.hr-steps { display: flex; gap: 0.3rem; margin-bottom: 0.75rem; }
.hr-steps span { flex: 1; height: 0.25rem; border-radius: 999px; background: rgb(var(--tw-slate-700)); }
.hr-steps span.on { background: rgb(var(--tw-amber-500)); }
.hr-title { font-weight: 700; color: rgb(var(--tw-white)); }
.hr-sub { font-size: 0.75rem; color: rgb(var(--tw-slate-400)); }
.hr-chip { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0.7rem; border-radius: 999px; font-size: 0.85rem; font-weight: 600; color: rgb(var(--tw-slate-200)); background: rgb(var(--tw-slate-800)); border: 1px solid rgb(var(--tw-slate-600)); }
.hr-chip.on { color: rgb(var(--tw-amber-200)); background: rgb(var(--tw-amber-500) / 0.18); border-color: rgb(var(--tw-amber-500)); }
.hr-no { min-width: 1.3rem; height: 1.3rem; padding: 0 0.25rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 800; color: rgb(var(--tw-white)); background: rgb(var(--tw-slate-600)); flex-shrink: 0; }
.hr-row { display: flex; align-items: center; gap: 0.45rem; padding: 0.45rem 0.6rem; border-radius: 0.6rem; background: rgb(var(--tw-slate-800) / 0.7); }
.hr-row.wrap { flex-wrap: wrap; }
.hr-row.win { color: rgb(var(--tw-emerald-300)); background: rgb(var(--tw-emerald-500) / 0.12); }
.hr-slot { width: 2.4rem; height: 3.3rem; border-radius: 0.35rem; border: 1.5px dashed rgb(var(--tw-slate-500)); font-weight: 800; font-size: 0.85rem; color: rgb(var(--tw-slate-400)); flex-shrink: 0; }
.hr-slot.sm { width: 2.1rem; height: 2.9rem; }
.hr-slot.filled { border: none; background: #f8fafc; color: #111827; }
.hr-slot.filled.red { color: #dc2626; }
.hr-slot.cur { border-style: solid; border-color: rgb(var(--tw-amber-400)); box-shadow: 0 0 0 2px rgb(var(--tw-amber-500) / 0.35); }
.hr-muck { padding: 0.35rem 0.6rem; border-radius: 0.4rem; font-size: 0.75rem; color: rgb(var(--tw-slate-300)); background: rgb(var(--tw-slate-700)); }
.hr-type { width: 3.4rem; text-align: right; font-size: 0.72rem; color: rgb(var(--tw-amber-300)); flex-shrink: 0; }
.hr-pad { position: sticky; bottom: 0; padding: 0.5rem; border-radius: 0.7rem; background: rgb(var(--tw-slate-900)); border: 1px solid rgb(var(--tw-slate-700)); }
.hr-key { padding: 0.5rem 0; border-radius: 0.4rem; font-weight: 800; color: rgb(var(--tw-white)); background: rgb(var(--tw-slate-700)); }
.hr-key:disabled { opacity: 0.3; }
.hr-key.suit { font-size: 1.2rem; }
.hr-key.suit.red { color: #f87171; }
.hr-key.suit.on { background: rgb(var(--tw-amber-500)); color: var(--on-accent); }
.hr-key.skip { font-size: 0.75rem; font-weight: 600; color: rgb(var(--tw-slate-300)); }
.hr-input { width: 6.5rem; padding: 0.35rem 0.5rem; border-radius: 0.4rem; text-align: right; font-family: 'JetBrains Mono', monospace; color: rgb(var(--tw-white)); background: rgb(var(--tw-slate-900)); border: 1px solid rgb(var(--tw-slate-600)); }
.hr-quick { padding: 0.25rem 0.55rem; border-radius: 0.4rem; font-size: 0.75rem; font-weight: 700; color: rgb(var(--tw-slate-100)); background: rgb(var(--tw-slate-700)); }
.hr-quick.clear { color: rgb(var(--tw-rose-300)); }
</style>
