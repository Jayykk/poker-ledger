<template>
  <div class="community-cards">
    <div class="round-label">{{ roundLabel }}</div>
    <TransitionGroup name="card-reveal" tag="div" class="community-cards-container">
      <div
        v-for="(card, index) in visibleCards"
        :key="`${String(card)}-${index}`"
        class="community-card-wrapper"
        :class="{ 'winner-highlight': isWinningCard(card) }"
      >
        <PlayingCard
          :card="card"
          :hidden="!shouldShowCard(index)"
          :revealing="isCardRevealing(index)"
          size="normal"
        />
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { computed, watch, ref, onBeforeUnmount } from 'vue';
import PlayingCard from './PlayingCard.vue';
import { useGameAnimation } from '../../composables/useGameAnimation.js';

const emit = defineEmits(['animation-start', 'animation-end']);

const props = defineProps({
  cards: {
    type: Array,
    default: () => [],
  },
  round: {
    type: String,
    default: 'waiting',
  },
  handResult: {
    type: Object,
    default: null,
  },
});

const winningCardsSet = computed(() => {
  const cards = props.handResult?.winningCards;
  if (!Array.isArray(cards)) return new Set();
  return new Set(cards.map((c) => String(c)));
});

function cardToKey(card) {
  if (!card) return '';
  if (typeof card === 'string') return card;
  // Fallback if card is ever passed as {rank, suit}
  if (typeof card === 'object' && card.rank && card.suit) {
    return `${String(card.rank)}${String(card.suit)}`;
  }
  return String(card);
}

function isWinningCard(card) {
  const key = cardToKey(card);
  if (!key) return false;
  return winningCardsSet.value.has(key);
}

const { animatingRound, flopCardIndex, animateFlop, animateTurn, animateRiver } = useGameAnimation();

function getSqueezeDelayMs(cardIndex) {
  // Dramatic Squeeze timing based on the *global* runout index.
  // 0-2: Flop (fast), 3: Turn (medium), 4: River (slow/suspenseful)
  if (cardIndex <= 2) return 600;
  if (cardIndex === 3) return 1200;
  if (cardIndex === 4) return 2500;
  return 600;
}

const visibleCards = ref([]);

const runoutAnimating = ref(false);

let revealTimeoutId = null;
let revealToken = 0;

function clearPendingReveal() {
  revealToken += 1;
  if (revealTimeoutId) {
    clearTimeout(revealTimeoutId);
    revealTimeoutId = null;
  }

  if (runoutAnimating.value) {
    runoutAnimating.value = false;
    emit('animation-end');
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

    runoutAnimating.value = true;
    emit('animation-start');

    const tokenAtStart = revealToken;
    const startIndex = prev.length;
    const revealNext = (index) => {
      if (tokenAtStart !== revealToken) return;
      if (index >= next.length) {
        if (runoutAnimating.value) {
          runoutAnimating.value = false;
          emit('animation-end');
        }
        return;
      }

      const delayMs = index === startIndex ? 0 : getSqueezeDelayMs(index);
      revealTimeoutId = setTimeout(() => {
        if (tokenAtStart !== revealToken) return;
        visibleCards.value.push(next[index]);
        revealNext(index + 1);
      }, delayMs);
    };

    revealNext(startIndex);
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

/* Container layout */
.community-cards-container {
  display: flex;
  gap: 0.5rem;
  height: 6rem; /* Adjust based on card size */
  align-items: center;
  justify-content: center;
}

.community-card-wrapper {
  position: relative;
  display: inline-flex;
}

.winner-highlight {
  box-shadow: 0 0 15px 4px #ffd700; /* Gold Glow */
  transform: scale(1.05);
  z-index: 10;
  transition: all 0.3s ease;
  border: 2px solid #ffd700;
  border-radius: 10px;
}

/* The Transition Classes (Crucial for animation) */
.card-reveal-enter-active {
  transition: all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275); /* Bouncy effect */
}

.card-reveal-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.8); /* Start from above and smaller */
}

.card-reveal-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.round-label {
  font-size: 16px;
  font-weight: bold;
  color: #ffd700;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  text-transform: uppercase;
  letter-spacing: 2px;
}

/* Responsive */
@media (max-width: 768px) {
  .round-label {
    font-size: 14px;
  }
}
</style>
