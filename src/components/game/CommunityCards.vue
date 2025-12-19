<template>
  <div class="community-cards">
    <div class="round-label">{{ roundLabel }}</div>
    <TransitionGroup tag="div" class="cards-display" name="community-cards">
      <PlayingCard
        v-for="(card, index) in visibleCards"
        :key="`${String(card)}-${index}`"
        :card="card"
        :hidden="!shouldShowCard(index)"
        :revealing="isCardRevealing(index)"
        size="normal"
      />
    </TransitionGroup>
  </div>
</template>

<script setup>
import { computed, watch, ref, onBeforeUnmount } from 'vue';
import PlayingCard from './PlayingCard.vue';
import { useGameAnimation } from '../../composables/useGameAnimation.js';

const props = defineProps({
  cards: {
    type: Array,
    default: () => [],
  },
  round: {
    type: String,
    default: 'waiting',
  },
});

const { animatingRound, flopCardIndex, animateFlop, animateTurn, animateRiver } = useGameAnimation();

const RUNOUT_REVEAL_DELAY_MS = 800;

const visibleCards = ref([]);

let revealTimeoutId = null;
let revealToken = 0;

function clearPendingReveal() {
  revealToken += 1;
  if (revealTimeoutId) {
    clearTimeout(revealTimeoutId);
    revealTimeoutId = null;
  }
}

function commonPrefixLength(a, b) {
  const len = Math.min(a.length, b.length);
  let i = 0;
  while (i < len && a[i] === b[i]) i += 1;
  return i;
}

watch(
  () => props.cards,
  (newCards, oldCards) => {
    const next = Array.isArray(newCards) ? newCards.filter(Boolean) : [];

    // Initial mount or non-array old value: sync immediately.
    if (!Array.isArray(oldCards)) {
      clearPendingReveal();
      visibleCards.value = [...next];
      return;
    }

    const prev = Array.isArray(oldCards) ? oldCards.filter(Boolean) : [];

    // Reset or non-append changes: sync immediately.
    const prefixLen = commonPrefixLength(prev, next);
    const isAppendOnly = prefixLen === prev.length;
    const addedCount = isAppendOnly ? (next.length - prev.length) : 0;

    if (!isAppendOnly || next.length < prev.length) {
      clearPendingReveal();
      visibleCards.value = [...next];
      return;
    }

    // Normal update: 0 or 1 card added.
    if (addedCount <= 1) {
      clearPendingReveal();
      visibleCards.value = [...next];
      return;
    }

    // Runout: multiple cards added at once → reveal them one by one.
    clearPendingReveal();
    visibleCards.value = [...prev];

    const tokenAtStart = revealToken;
    const revealNext = (index) => {
      if (tokenAtStart !== revealToken) return;
      if (index >= next.length) return;

      visibleCards.value.push(next[index]);
      revealTimeoutId = setTimeout(() => revealNext(index + 1), RUNOUT_REVEAL_DELAY_MS);
    };

    revealNext(prev.length);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  clearPendingReveal();
});

const roundLabel = computed(() => {
  const labels = {
    waiting: 'Waiting',
    preflop: 'Pre-Flop',
    flop: 'Flop',
    turn: 'Turn',
    river: 'River',
    showdown: 'Showdown',
  };
  return labels[props.round] || '';
});

// Determine if a card should be shown (not hidden)
const shouldShowCard = (index) => {
  // During animation, show cards progressively
  if (animatingRound.value === 'flop') {
    return index <= flopCardIndex.value;
  }

  // visibleCards only contains dealt cards; show them by default
  return true;
};

// Determine if a card is currently revealing (for flip animation)
const isCardRevealing = (index) => {
  if (animatingRound.value === 'flop') {
    return index === flopCardIndex.value;
  }
  
  if (animatingRound.value === 'turn' && index === 3) {
    return true;
  }
  
  if (animatingRound.value === 'river' && index === 4) {
    return true;
  }
  
  return false;
};

// Watch for round changes and trigger animations
let previousRound = props.round;
watch(() => props.round, (newRound, oldRound) => {
  if (oldRound === 'preflop' && newRound === 'flop') {
    animateFlop();
  } else if (oldRound === 'flop' && newRound === 'turn') {
    animateTurn();
  } else if (oldRound === 'turn' && newRound === 'river') {
    animateRiver();
  }
  previousRound = newRound;
}, { immediate: false });
</script>

<style scoped>
.community-cards {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.round-label {
  font-size: 16px;
  font-weight: bold;
  color: #ffd700;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  text-transform: uppercase;
  letter-spacing: 2px;
}

.cards-display {
  display: flex;
  gap: 8px;
}

/* Responsive */
@media (max-width: 768px) {
  .round-label {
    font-size: 14px;
  }
}
</style>
