<template>
  <div class="community-cards">
    <div class="round-label">{{ roundLabel }}</div>
    <div class="cards-display">
      <div
        v-for="(card, index) in displayCards"
        :key="index"
        class="card"
        :class="[{ 'card-hidden': !card }, card ? getCardColor(card) : '']"
      >
        {{ card || '?' }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

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

const getCardColor = (card) => {
  if (card.includes('♥') || card.includes('♦')) {
    return 'text-red-500';
  }
  return 'text-gray-900';
};
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

.card {
  width: 60px;
  height: 84px;
  background: white;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: bold;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);
  transition: transform 0.3s ease;
}

.card:hover {
  transform: translateY(-4px);
}

.card-hidden {
  background: linear-gradient(135deg, #2c5f3f 0%, #1a3d28 100%);
  color: #1a3d28;
}

/* Responsive */
@media (max-width: 768px) {
  .card {
    width: 48px;
    height: 67px;
    font-size: 22px;
  }

  .round-label {
    font-size: 14px;
  }
}
</style>
