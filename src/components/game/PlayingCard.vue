<template>
  <div
    class="playing-card"
    :class="[
      cardClass,
      { 'card-hidden': hidden, 'card-small': size === 'small', 'card-mini': size === 'mini' }
    ]"
  >
    <template v-if="!hidden && parsedCard">
      <div class="card-rank">{{ parsedCard.rank }}</div>
      <div class="card-suit" :class="suitColorClass">{{ parsedCard.suitSymbol }}</div>
    </template>
    <template v-else>
      <div class="card-back">?</div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  card: {
    type: String,
    default: null,
  },
  hidden: {
    type: Boolean,
    default: false,
  },
  size: {
    type: String,
    default: 'normal', // 'normal', 'small', 'mini'
    validator: (value) => ['normal', 'small', 'mini'].includes(value),
  },
});

// Suit mappings
const SUIT_CODES_TO_SYMBOLS = {
  's': '♠',
  'h': '♥',
  'd': '♦',
  'c': '♣',
};

// Parse card notation (e.g., "As" or "A♠" -> { rank: "A", suit: "s", suitSymbol: "♠" })
const parsedCard = computed(() => {
  if (!props.card || typeof props.card !== 'string') return null;

  const rank = props.card.slice(0, -1);
  const lastChar = props.card.slice(-1);

  // Check if last char is a suit code (s, h, d, c)
  if (SUIT_CODES_TO_SYMBOLS[lastChar]) {
    return {
      rank,
      suit: lastChar,
      suitSymbol: SUIT_CODES_TO_SYMBOLS[lastChar],
    };
  }

  // Check if last char is already a suit symbol
  const suitCode = Object.keys(SUIT_CODES_TO_SYMBOLS).find(
    (code) => SUIT_CODES_TO_SYMBOLS[code] === lastChar
  );
  if (suitCode) {
    return {
      rank,
      suit: suitCode,
      suitSymbol: lastChar,
    };
  }

  return null;
});

// Determine suit color class
const suitColorClass = computed(() => {
  if (!parsedCard.value) return '';
  const redSuits = ['♥', '♦'];
  return redSuits.includes(parsedCard.value.suitSymbol) ? 'suit-red' : 'suit-black';
});

// Card background class
const cardClass = computed(() => {
  if (props.hidden || !parsedCard.value) return 'card-back-style';
  return 'card-face';
});
</script>

<style scoped>
.playing-card {
  position: relative;
  background: white;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);
  transition: transform 0.3s ease;
  width: 60px;
  height: 84px;
  font-weight: bold;
  user-select: none;
}

.playing-card.card-small {
  width: 48px;
  height: 67px;
}

.playing-card.card-mini {
  width: 36px;
  height: 50px;
}

.playing-card:hover:not(.card-hidden) {
  transform: translateY(-4px);
}

.playing-card.card-hidden {
  background: linear-gradient(135deg, #2c5f3f 0%, #1a3d28 100%);
  cursor: default;
}

.card-face {
  background: white;
  color: #000;
}

.card-back-style {
  background: linear-gradient(135deg, #2c5f3f 0%, #1a3d28 100%);
}

.card-back {
  font-size: 32px;
  color: #1a3d28;
}

.playing-card.card-mini .card-back {
  font-size: 20px;
}

.card-rank {
  font-size: 24px;
  line-height: 1;
  margin-bottom: 2px;
}

.playing-card.card-mini .card-rank {
  font-size: 14px;
}

.playing-card.card-small .card-rank {
  font-size: 18px;
}

.card-suit {
  font-size: 28px;
  line-height: 1;
}

.playing-card.card-mini .card-suit {
  font-size: 16px;
}

.playing-card.card-small .card-suit {
  font-size: 22px;
}

.suit-red {
  color: #dc2626; /* Red-600 */
}

.suit-black {
  color: #1f2937; /* Gray-800 */
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .playing-card {
    width: 48px;
    height: 67px;
  }

  .card-rank {
    font-size: 18px;
  }

  .card-suit {
    font-size: 22px;
  }

  .card-back {
    font-size: 24px;
  }
}
</style>
