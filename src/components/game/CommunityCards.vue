<template>
  <div class="community-cards">
    <div class="round-label">{{ roundLabel }}</div>
    <div class="cards-display">
      <PlayingCard
        v-for="(card, index) in displayCards"
        :key="index"
        :card="card"
        :hidden="!card"
        size="normal"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import PlayingCard from './PlayingCard.vue';

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
