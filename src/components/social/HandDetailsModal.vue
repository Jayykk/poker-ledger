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
import { query, where, getDocs, limit, orderBy, collectionGroup } from 'firebase/firestore';
import { db } from '../../firebase-init.js';
import BaseModal from '../common/BaseModal.vue';
import PlayingCard from '../common/PlayingCard.vue';
import { getHandCards } from '../../utils/pokerHandEvaluator.js';
import { periodRangeMillis } from '../../../functions/src/utils/leaderboardStatsMath.js';

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

// The leaderboard's filter → the recorded hand types it lists
const HAND_TYPES_OF = {
  royalFlush: ['royal_flush'],
  straightFlush: ['straight_flush'],
  fourOfAKind: ['four_of_a_kind'],
  total: ['royal_flush', 'straight_flush', 'four_of_a_kind'],
};
// At most this many hands of the period are read (newest first)
const READ_LIMIT = 1000;
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

const loadHandDetails = async () => {
  if (!props.userId) return;
  
  loading.value = true;
  hands.value = [];
  
  try {
    // The period's hands, newest first (createdAt: millis). Bounded: a
    // collection-group scan grows with every game ever played.
    const range = periodRangeMillis(props.periodKey);
    const handsQuery = query(
      collectionGroup(db, 'hands'),
      ...(range ? [where('createdAt', '>=', range.start), where('createdAt', '<', range.end)] : []),
      orderBy('createdAt', 'desc'),
      limit(READ_LIMIT)
    );
    const handsSnapshot = await getDocs(handsQuery);
    const wanted = HAND_TYPES_OF[props.handType] || HAND_TYPES_OF.total;
    const userHands = [];

    handsSnapshot.forEach((doc) => {
      const handData = doc.data();
      // Test hands don't count anywhere (mark_test_hands.js)
      if (handData.excludeFromTitles === true || !Array.isArray(handData.players)) return;
      for (const player of handData.players) {
        // playerUid on new records, playerId on older ones
        const playerId = player.playerUid || player.playerId;
        if (playerId !== props.userId || !wanted.includes(player.handType)) continue;
        const playerCards = Array.isArray(player.cards) ? player.cards : [];
        const communityCards = Array.isArray(handData.communityCards) ? handData.communityCards : [];
        userHands.push({
          handType: player.handType,
          playerCards,
          communityCards,
          lit: handCardsOf(playerCards, communityCards),
          note: typeof handData.note === 'string' ? handData.note : '',
          createdAt: handData.createdAt
        });
      }
    });

    hands.value = userHands;
  } catch (err) {
    console.error('Load hand details error:', err);
  } finally {
    loading.value = false;
  }
};

// Watch for modal open and userId changes
watch(() => props.modelValue, (newValue) => {
  if (newValue) {
    loadHandDetails();
  }
});

watch(() => props.userId, () => {
  if (props.modelValue) {
    loadHandDetails();
  }
});

watch(() => [props.handType, props.periodKey], () => {
  if (props.modelValue) {
    loadHandDetails();
  }
});
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
