<template>
  <div class="community-cards">
    <div class="round-label">{{ roundLabel }}</div>
    <div class="cards-display">
      <PlayingCard
        v-for="(card, index) in displayCards"
        :key="index"
        :card="card"
        :hidden="!card || !shouldShowCard(index)"
        :revealing="isCardRevealing(index)"
        size="normal"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue';
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

const displayCards = computed(() => {
  // Show placeholder cards based on round
  const maxCards = {
    waiting: 0,
    preflop: 0,
    flop: 3,
    turn: 4,
    river: 5,
    showdown: 5,
  };

  const count = maxCards[props.round] || 0;
  const cards = [...props.cards];

  // Pad with null for unrevealed cards
  while (cards.length < count) {
    cards.push(null);
  }

  return cards.slice(0, count);
});

// Determine if a card should be shown (not hidden)
const shouldShowCard = (index) => {
  // During animation, show cards progressively
  if (animatingRound.value === 'flop') {
    return index <= flopCardIndex.value;
  }
  
  // After animation or if card exists, show it
  return !!props.cards[index];
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
    animateTurn();
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
