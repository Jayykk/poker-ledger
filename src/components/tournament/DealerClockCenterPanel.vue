<template>
  <main class="clock-center panel-surface">
    <div class="center-top">
      <div v-if="timeToBreak" class="break-in-info">
        <span class="break-in-label">{{ $t('tournament.breakIn') }}</span>
        <span class="break-in-value">{{ timeToBreak }}</span>
      </div>

      <div class="level-indicator">
        <template v-if="isBreak">
          <span class="level-text break-text">☕ {{ $t('tournament.breakTime') }}</span>
        </template>
        <template v-else>
          <span class="level-text">{{ $t('tournament.level') }} {{ currentLevel }}</span>
        </template>
      </div>

      <div v-if="!isBreak" class="blinds-display">
        <span class="blinds-value">
          {{ formatNumber(currentBlinds.small) }} / {{ formatNumber(currentBlinds.big) }}
          <span v-if="currentBlinds.ante" class="ante-value">({{ formatNumber(currentBlinds.ante) }})</span>
        </span>
      </div>
    </div>

    <div class="timer-display" :class="timerColorClass">
      {{ formattedTime }}
    </div>

    <div class="center-bottom">
      <div v-if="status === 'waiting'" class="status-badge waiting">
        {{ $t('tournament.waitingToStart') }}
      </div>
      <div v-else-if="status === 'paused'" class="status-badge paused">
        <i class="fas fa-pause mr-2"></i>{{ $t('tournament.paused') }}
      </div>
      <div v-else-if="status === 'ended'" class="status-badge ended">
        {{ $t('tournament.ended') }}
      </div>

      <div v-if="nextPlayLevelEntry && !isBreak && status !== 'ended'" class="next-blinds">
        {{ $t('tournament.nextBlinds') }}: {{ formatNumber(nextPlayLevelEntry.small) }} / {{ formatNumber(nextPlayLevelEntry.big) }}
        <span v-if="nextPlayLevelEntry.ante">({{ $t('tournament.ante') }} {{ formatNumber(nextPlayLevelEntry.ante) }})</span>
      </div>
      <div v-else-if="nextPlayLevelEntry && isBreak && status !== 'ended'" class="next-blinds">
        {{ $t('tournament.nextLevel') }}: {{ formatNumber(nextPlayLevelEntry.small) }} / {{ formatNumber(nextPlayLevelEntry.big) }}
      </div>
    </div>
  </main>
</template>

<script setup>
import { formatNumber } from './dealerClockFormat.js';

defineProps({
  isBreak: { type: Boolean, default: false },
  currentLevel: { type: Number, default: 0 },
  currentBlinds: {
    type: Object,
    default: () => ({ small: 0, big: 0, ante: 0 }),
  },
  timeToBreak: { type: String, default: '' },
  formattedTime: { type: String, default: '00:00' },
  timerColorClass: { type: String, default: '' },
  status: { type: String, default: 'waiting' },
  nextPlayLevelEntry: { type: Object, default: null },
});
</script>

<style scoped>
.clock-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(1.7rem, 2.8vw, 2.8rem);
  padding: clamp(1.5rem, 2vw, 2rem);
  border-radius: 2rem;
  text-align: center;
}

.center-top,
.center-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(0.95rem, 1.2vw, 1.1rem);
}

.break-in-info {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.45rem 0.9rem;
  border-radius: 9999px;
  background: rgba(15, 23, 42, 0.36);
  border: 1px solid rgba(226, 232, 240, 0.1);
  font-size: clamp(0.95rem, 1.2vw, 1.05rem);
}

.break-in-label {
  color: rgba(226, 232, 240, 0.64);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
}

.break-in-value {
  color: #6ee7b7;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.level-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  background: rgba(15, 23, 42, 0.34);
  border: 1px solid rgba(226, 232, 240, 0.1);
}

.level-text {
  font-size: clamp(1rem, 1.4vw, 1.3rem);
  font-weight: 700;
  color: rgba(226, 232, 240, 0.82);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.break-text {
  color: #6ee7b7;
}

.blinds-display {
  display: flex;
  align-items: center;
  justify-content: center;
}

.blinds-value {
  font-size: clamp(3rem, 5vw, 5.6rem);
  font-weight: 800;
  line-height: 1.02;
  color: #f8fafc;
  text-shadow: 0 10px 28px rgba(15, 23, 42, 0.38);
}

.ante-value {
  margin-left: 0.2rem;
  font-size: clamp(1.7rem, 2.8vw, 3rem);
  color: rgba(226, 232, 240, 0.86);
}

.timer-display {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 6.4ch;
  padding: clamp(1.15rem, 2.1vw, 1.55rem) clamp(1.8rem, 3.4vw, 3rem);
  border-radius: 1.8rem;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(17, 24, 39, 0.76));
  border: 1px solid rgba(148, 163, 184, 0.18);
  color: #f8fafc;
  font-family: 'JetBrains Mono', monospace;
  font-size: clamp(6.1rem, 10.2vw, 10.8rem);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.04em;
  text-shadow: 0 0 24px rgba(255, 255, 255, 0.16);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.timer-warning { color: #fbbf24; }

.timer-danger { color: #f87171; }

.timer-critical {
  color: #ef4444;
  animation: timerPulse 0.5s ease-in-out infinite;
}

@keyframes timerPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.72; transform: scale(1.02); }
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0.55rem 1.3rem;
  border-radius: 9999px;
  font-size: clamp(0.9rem, 1.2vw, 1rem);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.status-badge.waiting {
  background: rgba(251, 191, 36, 0.16);
  border: 1px solid rgba(251, 191, 36, 0.32);
  color: #fbbf24;
}

.status-badge.paused {
  background: rgba(251, 191, 36, 0.16);
  border: 1px solid rgba(251, 191, 36, 0.32);
  color: #fbbf24;
  animation: pauseBlink 2s ease-in-out infinite;
}

.status-badge.ended {
  min-height: 54px;
  padding: 0.8rem 1.85rem;
  font-size: clamp(1rem, 1.45vw, 1.28rem);
  background: linear-gradient(180deg, rgba(236, 72, 153, 0.28), rgba(219, 39, 119, 0.2));
  border: 2px solid rgba(251, 113, 133, 0.42);
  color: #fecdd3;
  box-shadow: 0 12px 24px rgba(136, 19, 55, 0.2);
}

@keyframes pauseBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

.next-blinds {
  max-width: 34rem;
  font-size: clamp(1rem, 1.4vw, 1.2rem);
  line-height: 1.45;
  color: rgba(226, 232, 240, 0.76);
  font-weight: 600;
}

@media (min-width: 1440px) and (min-aspect-ratio: 16/9) {
  .clock-center {
    gap: 2.45rem;
    padding: 2.2rem;
  }

  .center-top,
  .center-bottom {
    gap: 1.1rem;
  }

  .status-badge.ended {
    margin-top: 0.2rem;
  }
}

@media (max-width: 1220px) {
  .timer-display {
    font-size: clamp(4.8rem, 8.2vw, 7.9rem);
  }

  .blinds-value {
    font-size: clamp(2.65rem, 4.6vw, 4.4rem);
  }
}

@media (max-width: 980px) {
  .clock-center {
    border-radius: 1.45rem;
  }
}

@media (max-width: 768px) {
  .clock-center {
    padding: 0.95rem;
    border-radius: 1.2rem;
  }

  .clock-center {
    gap: 0.95rem;
  }

  .center-top,
  .center-bottom {
    gap: 0.65rem;
    width: 100%;
  }

  .break-in-info {
    font-size: 0.82rem;
    padding: 0.36rem 0.72rem;
  }

  .level-indicator {
    min-height: 38px;
    padding: 0.4rem 0.85rem;
  }

  .level-text {
    font-size: 0.95rem;
  }

  .blinds-value {
    font-size: clamp(2rem, 8.6vw, 2.85rem);
  }

  .ante-value {
    font-size: clamp(1.05rem, 4.4vw, 1.55rem);
  }

  .timer-display {
    min-width: auto;
    width: 100%;
    font-size: clamp(3.45rem, 13.2vw, 4.75rem);
    padding: 0.82rem 0.95rem;
    border-radius: 1.2rem;
  }

  .status-badge {
    min-height: 42px;
    padding: 0.55rem 1.15rem;
    font-size: 0.92rem;
  }

  .status-badge.ended {
    min-height: 44px;
    padding: 0.58rem 1.2rem;
    font-size: 0.95rem;
  }

  .next-blinds {
    max-width: 100%;
    font-size: 0.92rem;
    line-height: 1.35;
  }
}
</style>
