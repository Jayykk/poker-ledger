<template>
  <div
    class="playing-card"
    :class="[
      cardClass,
      {
        'card-hidden': hidden,
        'card-small': size === 'small',
        'card-mini': size === 'mini',
        'card-revealing': revealing,
        'card-winning': winning,
        'card-losing': losing,
      }
    ]"
  >
    <div class="card-inner">
      <!-- Card Front (Face) -->
      <div class="card-front" v-if="parsedCard">
        <div class="card-rank">{{ parsedCard.rank }}</div>
        <div class="card-suit" :class="suitColorClass">{{ parsedCard.suitSymbol }}</div>
      </div>

      <!-- Card Back -->
      <div class="card-back">
        <div class="card-back-pattern">?</div>
      </div>
    </div>
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
  revealing: {
    type: Boolean,
    default: false,
  },
  winning: {
    type: Boolean,
    default: false,
  },
  losing: {
    type: Boolean,
    default: false,
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
  width: 60px;
  height: 84px;
  perspective: 1000px;
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

/* Card Inner Container for 3D Flip */
.card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.6s ease;
}

/* Flip animation when revealing */
.card-hidden .card-inner {
  transform: rotateY(180deg);
}

.card-revealing .card-inner {
  animation: flipCard 0.6s ease forwards;
}

@keyframes flipCard {
  0% { transform: rotateY(180deg); }
  100% { transform: rotateY(0deg); }
}

/* Card Front and Back Faces */
.card-front,
.card-back {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);
  font-weight: bold;
}

.card-front {
  background: white;
  color: #000;
  transform: rotateY(0deg);
}

.card-back {
  background: linear-gradient(135deg, #2c5f3f 0%, #1a3d28 100%);
  transform: rotateY(180deg);
}

.card-back-pattern {
  font-size: 32px;
  color: #1a3d28;
}

.playing-card.card-mini .card-back-pattern {
  font-size: 20px;
}

/* Winning card highlight */
.card-winning {
  animation: winGlow 1s ease-in-out infinite alternate;
}

.card-winning .card-front {
  box-shadow: 0 0 20px 5px rgba(255, 215, 0, 0.8);
  border: 2px solid #ffd700;
}

@keyframes winGlow {
  from { filter: brightness(1); }
  to { filter: brightness(1.2); }
}

/* Losing card (dimmed) */
.card-losing .card-front {
  opacity: 0.4;
  filter: grayscale(50%);
}

/* Hover effect (only for non-hidden cards) */
.playing-card:not(.card-hidden):hover .card-inner {
  transform: translateY(-4px);
}

/* Card content */
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

  .card-back-pattern {
    font-size: 24px;
  }
}
</style>
