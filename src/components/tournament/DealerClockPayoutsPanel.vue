<template>
  <aside class="info-panel panel-surface right-panel">
    <div class="info-item info-item-prize">
      <div class="info-label">{{ $t('tournament.prizePool') }}</div>
      <div class="info-value prize">${{ formatNumber(prizePool) }}</div>
    </div>

    <div class="info-item payouts-item">
      <div class="info-label">{{ $t('tournament.payouts') }}</div>
      <div class="payout-list">
        <div v-for="payout in payouts" :key="payout.place" class="payout-row">
          <span class="payout-place">{{ payout.place }}.</span>
          <span class="payout-currency">$</span>
          <span class="payout-amount">{{ formatNumber(payout.amount) }}</span>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { formatNumber } from './dealerClockFormat.js';

defineProps({
  prizePool: { type: Number, default: 0 },
  payouts: { type: Array, default: () => [] },
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

.info-item-prize {
  padding-bottom: clamp(1.1rem, 1.6vw, 1.4rem);
  border-bottom: 1px solid rgba(226, 232, 240, 0.1);
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

.info-value.prize {
  font-size: clamp(2.5rem, 3.2vw, 3.9rem);
  color: #fcd34d;
  text-shadow: 0 8px 20px rgba(133, 77, 14, 0.28);
  font-variant-numeric: tabular-nums;
}

.payouts-item {
  gap: 0.85rem;
  padding: clamp(1rem, 1.5vw, 1.2rem);
  border-radius: 1.2rem;
  background: rgba(8, 15, 30, 0.28);
  border: 1px solid rgba(226, 232, 240, 0.08);
}

.payout-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  width: fit-content;
  margin: 0 auto;
}

.payout-row {
  display: grid;
  grid-template-columns: minmax(1.75em, auto) auto minmax(4ch, auto);
  align-items: baseline;
  column-gap: 0.35rem;
  justify-content: center;
  font-size: clamp(1.15rem, 1.5vw, 1.55rem);
  font-weight: 700;
  padding: 0.15rem 0;
}

.payout-place {
  min-width: 1.75em;
  color: rgba(226, 232, 240, 0.56);
  text-align: right;
}

.payout-currency {
  color: #f8fafc;
}

.payout-amount {
  color: #f8fafc;
  min-width: 4ch;
  text-align: left;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1220px) {
  .info-value {
    font-size: clamp(1.75rem, 2.2vw, 2.55rem);
  }
}

@media (max-width: 980px) {
  .right-panel .info-item {
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0.9rem 0.95rem;
    border-top: none;
    border: 1px solid rgba(226, 232, 240, 0.08);
    border-radius: 1rem;
    background: rgba(8, 15, 30, 0.22);
  }

  .info-item + .info-item {
    border-top: none;
    padding-top: 0;
  }

  .info-item-prize {
    padding-bottom: 0;
    border-bottom: none;
  }

  .payout-row {
    justify-content: center;
  }
}

@media (max-width: 768px) {
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

  .info-value.prize {
    font-size: 1.7rem;
  }

  .payouts-item {
    padding: 0.8rem;
    gap: 0.55rem;
  }

  .payout-row {
    justify-content: flex-start;
    font-size: 0.96rem;
  }
}
</style>
