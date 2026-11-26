<template>
  <BaseModal
    v-model="isOpen"
    :title="modalTitle"
    closable
  >
    <div v-if="loading" class="flex justify-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
    </div>

    <div v-else-if="hands.length === 0" class="text-center text-gray-400 py-8">
      {{ $t('hand.noHandRecords') }}
    </div>

    <div v-else>
      <!-- How many of each, this period -->
      <div class="flex flex-wrap gap-1.5 mb-3" data-testid="hand-tally">
        <span
          v-for="item in tally"
          :key="item.type"
          class="hand-pill"
          :class="TYPE_STYLE[item.type]"
        >
          {{ $t(`hand.handTypes.${item.type}`) }} × {{ item.count }}
        </span>
      </div>

      <div class="space-y-2.5">
        <article
          v-for="(hand, index) in hands"
          :key="index"
          class="rounded-xl bg-slate-900/70 ring-1 ring-white/5 p-3"
          data-testid="hand-item"
        >
          <header class="flex items-center justify-between gap-2">
            <span class="hand-pill" :class="TYPE_STYLE[hand.handType]" data-testid="hand-type">
              {{ $t(`hand.handTypes.${hand.handType}`) }}
            </span>
            <time class="text-xs text-slate-400 tabular-nums">{{ dayLabel(hand.createdAt) }}</time>
          </header>

          <!-- Hole cards | board; the cards that make the hand lit, the rest dimmed -->
          <div
            v-if="hand.playerCards.length || hand.communityCards.length"
            class="flex items-end gap-2 mt-3"
          >
            <div v-if="hand.playerCards.length">
              <div class="flex gap-1">
                <PlayingCard
                  v-for="card in hand.playerCards"
                  :key="card"
                  :card="card"
                  :lit="hand.lit.has(card)"
                  :dim="!hand.lit.has(card)"
                />
              </div>
              <div class="card-caption">{{ $t('hand.holeCards') }}</div>
            </div>
            <div
              v-if="hand.playerCards.length && hand.communityCards.length"
              class="w-px self-stretch mb-4 bg-white/10"
            ></div>
            <div v-if="hand.communityCards.length">
              <div class="flex gap-1">
                <PlayingCard
                  v-for="card in hand.communityCards"
                  :key="card"
                  :card="card"
                  :lit="hand.lit.has(card)"
                  :dim="!hand.lit.has(card)"
                />
              </div>
              <div class="card-caption">{{ $t('hand.communityCards') }}</div>
            </div>
          </div>

          <p
            v-if="hand.note"
            class="mt-2.5 text-sm text-slate-300 border-l-2 border-slate-600 pl-2 break-words"
            data-testid="hand-note"
          >{{ hand.note }}</p>
        </article>
      </div>
    </div>
  </BaseModal>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../../firebase-init.js';
import BaseModal from '../common/BaseModal.vue';
import PlayingCard from '../common/PlayingCard.vue';
import { getHandCards } from '../../utils/pokerHandEvaluator.js';
import { specialHandOf } from '../../utils/specialHandOf.js';
import { periodKeysForMillis, recordMillis } from '../../../functions/src/utils/leaderboardStatsMath.js';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  userId: {
    type: String,
    default: ''
  },
  userName: {
    type: String,
    default: ''
  },
  handType: {
    type: String,
    default: 'total' // 'total', 'royalFlush', 'straightFlush', 'fourOfAKind'
  },
  // The leaderboard's period (leaderboardStats key): only hands recorded in it
  periodKey: {
    type: String,
    default: 'all'
  }
});

// The leaderboard's filter → the hand types it lists
const HAND_TYPES_OF = {
  royalFlush: ['royal_flush'],
  straightFlush: ['straight_flush'],
  fourOfAKind: ['four_of_a_kind'],
  total: ['royal_flush', 'straight_flush', 'four_of_a_kind'],
};
// Hand type → its count on a history record (handEvents)
const EVENT_KEY = { royal_flush: 'royalFlush', straight_flush: 'straightFlush', four_of_a_kind: 'quads' };
// Rarest first; each type keeps its own colour in the tally and on its hands
const TYPE_ORDER = ['royal_flush', 'straight_flush', 'four_of_a_kind'];
const TYPE_STYLE = {
  royal_flush: 'pill-royal',
  straight_flush: 'pill-straight-flush',
  four_of_a_kind: 'pill-quads',
};

const emit = defineEmits(['update:modelValue']);

const { t, locale } = useI18n();
const hands = ref([]);
const loading = ref(false);

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const modalTitle = computed(() => {
  if (props.userName) {
    return `${props.userName} - ${t('hand.handRecords')}`;
  }
  return t('hand.handRecords');
});

const tally = computed(() => TYPE_ORDER
  .map((type) => ({ type, count: hands.value.filter((h) => h.handType === type).length }))
  .filter((item) => item.count > 0));

// Taipei day, e.g. 11/21（五）; the year too when it isn't this year. No time:
// a hand logged afterwards only knows its night.
const TAIPEI = 'Asia/Taipei';
const yearOf = (date) => date.toLocaleDateString('en', { timeZone: TAIPEI, year: 'numeric' });
const dayLabel = (millis) => {
  const date = new Date(Number(millis));
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = yearOf(date) === yearOf(new Date());
  return date.toLocaleDateString(locale.value, {
    timeZone: TAIPEI,
    ...(sameYear ? {} : { year: 'numeric' }),
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
};

// The cards that make the hand (all of them when fewer than five are known)
const handCardsOf = (playerCards, communityCards) => {
  try {
    return new Set(getHandCards(playerCards, communityCards));
  } catch {
    return new Set([...playerCards, ...communityCards]);
  }
};

// The hands behind the row's count, found the way the count is made
// (leaderboardStatsMath.js / handEvents.js): the player's history records in
// the period (dated by the record, not by when a hand was logged — 補記 can
// come days later) that count this kind of hand, then those games' hands
// that give it to the player (a board-only four of a kind gives it to nobody).
let loadSeq = 0;
const loadHandDetails = async () => {
  if (!props.userId) return;
  const uid = props.userId;
  const seq = ++loadSeq;

  loading.value = true;
  hands.value = [];

  try {
    const wanted = HAND_TYPES_OF[props.handType] || HAND_TYPES_OF.total;
    const historySnap = await getDocs(collection(db, 'users', uid, 'history_sub'));
    const gameIds = historySnap.docs
      .filter((d) => {
        const record = d.data();
        const ms = recordMillis(record);
        if (!ms) return false;
        if (props.periodKey !== 'all' && !Object.values(periodKeysForMillis(ms)).includes(props.periodKey)) return false;
        return wanted.some((type) => Number(record.handEvents?.[EVENT_KEY[type]]) > 0);
      })
      .map((d) => d.id);

    const perGame = await Promise.all(gameIds.map(async (gameId) => {
      const [gameSnap, handsSnap] = await Promise.all([
        getDoc(doc(db, 'games', gameId)),
        getDocs(collection(db, 'games', gameId, 'hands')),
      ]);
      // Seat id → account; a seat taken off the roster since: the hand's own playerUid
      const roster = gameSnap.exists() && Array.isArray(gameSnap.data().players) ? gameSnap.data().players : [];
      const uidById = new Map(roster.filter((p) => p && p.id).map((p) => [p.id, p.uid || null]));
      const found = [];
      for (const handDoc of handsSnap.docs) {
        const handData = handDoc.data();
        // Test hands don't count anywhere (mark_test_hands.js)
        if (handData.excludeFromTitles === true || !Array.isArray(handData.players)) continue;
        for (const player of handData.players) {
          if (!player?.playerId) continue;
          const owner = uidById.has(player.playerId) ? uidById.get(player.playerId) : player.playerUid;
          if (owner !== uid) continue;
          const handType = specialHandOf(handData, player.playerId);
          if (!handType || !wanted.includes(handType)) continue;
          const playerCards = Array.isArray(player.cards) ? player.cards : [];
          const communityCards = Array.isArray(handData.communityCards) ? handData.communityCards : [];
          found.push({
            handType,
            playerCards,
            communityCards,
            lit: handCardsOf(playerCards, communityCards),
            note: typeof handData.note === 'string' ? handData.note : '',
            createdAt: handData.createdAt,
          });
        }
      }
      return found;
    }));

    if (seq !== loadSeq) return;
    hands.value = perGame.flat().sort((x, y) => (Number(y.createdAt) || 0) - (Number(x.createdAt) || 0));
  } catch (err) {
    console.error('Load hand details error:', err);
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
};

// Open, or what to show changed while open: load once (a row click sets the
// player and opens together)
watch(
  () => [props.modelValue, props.userId, props.handType, props.periodKey],
  ([open]) => { if (open) loadHandDetails(); },
);
</script>

<style scoped>
.hand-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  padding: 0.125rem 0.625rem;
  font-size: 0.8125rem;
  font-weight: 700;
  color: rgb(var(--pill));
  background: rgb(var(--pill) / 0.14);
  box-shadow: inset 0 0 0 1px rgb(var(--pill) / 0.3);
}
/* "r g b": amber follows the theme; violet / sky are fixed, so darker on a light theme */
.pill-royal { --pill: var(--tw-amber-300); }
.pill-straight-flush { --pill: 196 181 253; }
.pill-quads { --pill: 125 211 252; }
[data-mode="light"] .pill-straight-flush { --pill: 109 40 217; }
[data-mode="light"] .pill-quads { --pill: 3 105 161; }
.card-caption {
  margin-top: 0.375rem;
  font-size: 0.6875rem;
  text-align: center;
  color: rgb(100 116 139);
}
</style>
