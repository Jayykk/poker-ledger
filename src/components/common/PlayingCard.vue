<template>
  <span
    class="playing-card"
    :class="{ 'is-red': red, 'is-lit': lit, 'is-dim': dim }"
    :aria-label="card"
    data-testid="playing-card"
  >
    <span class="pc-rank">{{ rank }}</span>
    <!-- U+FE0E: text glyph, so ♥/♦ don't turn into emoji on iOS -->
    <span class="pc-suit">{{ suit }}&#xFE0E;</span>
  </span>
</template>

<script setup>
import { computed } from 'vue';
import { SUITS } from '../../utils/constants.js';

/**
 * A small face-up playing card for a card string such as "A♠" or "10♥":
 * white face, rank over suit, red for hearts / diamonds.
 * lit: the card is part of the hand (raised, gold edge); dim: it isn't.
 */
const props = defineProps({
  card: { type: String, required: true },
  lit: { type: Boolean, default: false },
  dim: { type: Boolean, default: false },
});

const suit = computed(() => props.card.slice(-1));
const rank = computed(() => props.card.slice(0, -1));
const red = computed(() => suit.value === SUITS.HEARTS || suit.value === SUITS.DIAMONDS);
</script>

<style scoped>
.playing-card {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2rem;
  height: 2.75rem;
  border-radius: 0.375rem;
  background: linear-gradient(180deg, #ffffff 0%, #eef2f7 100%);
  color: #0f172a;
  box-shadow: inset 0 0 0 1px rgb(15 23 42 / 0.1), 0 1px 2px rgb(0 0 0 / 0.35);
  font-weight: 800;
  line-height: 1;
  user-select: none;
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.pc-rank {
  font-size: 0.95rem;
  letter-spacing: -0.05em;
}
.pc-suit {
  margin-top: 0.125rem;
  font-size: 0.95rem;
}
.is-red {
  color: #dc2626;
}
.is-lit {
  transform: translateY(-3px);
  box-shadow: 0 0 0 2px #fbbf24, 0 6px 12px -4px rgb(251 191 36 / 0.55);
}
.is-dim {
  opacity: 0.4;
}
</style>
