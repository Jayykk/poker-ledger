<template>
  <aside class="info-panel panel-surface left-panel">
    <div class="info-item">
      <div class="info-label">{{ $t('tournament.entries') }}</div>
      <div class="info-value">{{ formatNumber(entries) }}</div>
    </div>
    <div class="info-item">
      <div class="info-label">{{ $t('tournament.playersLeft') }}</div>
      <div class="info-value">{{ formatNumber(playersRemaining) }}</div>
    </div>
    <div class="info-item">
      <div class="info-label">{{ $t('tournament.totalPlayers') }}</div>
      <div class="info-value">{{ formatNumber(playersRegistered) }}</div>
    </div>
    <div class="info-item">
      <div class="info-label">{{ $t('tournament.chipsInPlay') }}</div>
      <div class="info-value">{{ formatNumber(chipsInPlay) }}</div>
    </div>
    <div class="info-item">
      <div class="info-label">{{ $t('tournament.averageStack') }}</div>
      <div class="info-value info-value-stack">
        <span class="info-value-primary">{{ formatNumber(averageStack) }}</span>
        <span v-if="averageStackBB" class="avg-bb">{{ averageStackBB }} BB</span>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { formatNumber } from './dealerClockFormat.js';

defineProps({
  entries: { type: Number, default: 0 },
  playersRemaining: { type: Number, default: 0 },
  playersRegistered: { type: Number, default: 0 },
  chipsInPlay: { type: Number, default: 0 },
  averageStack: { type: Number, default: 0 },
  averageStackBB: { type: Number, default: 0 },
});
</script>

<style scoped>
.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.32rem;
  text-align: center;
}

.info-item + .info-item {
  padding-top: clamp(0.95rem, 1.3vw, 1.15rem);
  border-top: 1px solid rgba(226, 232, 240, 0.08);
}

.left-panel .info-item {
  align-items: center;
}

.info-label {
  font-size: clamp(1rem, 1.35vw, 1.45rem);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(226, 232, 240, 0.72);
}

.info-value {
  display: flex;
  align-items: baseline;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  font-size: clamp(2rem, 2.5vw, 3rem);
  line-height: 1;
  font-weight: 700;
  color: #f8fafc;
}

.info-value-primary {
  font-variant-numeric: tabular-nums;
}

.info-value-stack {
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
}

.avg-bb {
  font-size: clamp(0.92rem, 1vw, 1.08rem);
  color: rgba(226, 232, 240, 0.56);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1.1;
}

@media (max-width: 1220px) {
  .info-value {
    font-size: clamp(1.75rem, 2.2vw, 2.55rem);
  }
}

@media (max-width: 980px) {
  .left-panel .info-item {
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0.9rem 0.95rem;
    border-top: none;
    border: 1px solid rgba(226, 232, 240, 0.08);
    border-radius: 1rem;
    background: rgba(8, 15, 30, 0.22);
  }

  .left-panel .info-item {
    min-height: 7.25rem;
  }

  .left-panel .info-label {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 2.5em;
  }

  .left-panel .info-item:last-child {
    grid-column: 1 / -1;
  }

  .info-item + .info-item {
    border-top: none;
    padding-top: 0;
  }
}

@media (max-width: 768px) {
  .left-panel .info-item {
    min-height: 6.4rem;
  }

  .left-panel .info-label {
    min-height: 2.35em;
  }

  .info-item {
    gap: 0.16rem;
    align-items: center;
    text-align: center;
  }

  .info-label {
    font-size: 0.76rem;
    letter-spacing: 0.05em;
  }

  .info-value {
    font-size: 1.35rem;
    gap: 0.25rem;
  }

  .info-value-stack {
    gap: 0.28rem;
  }

  .avg-bb {
    font-size: 0.72rem;
  }
}
</style>
