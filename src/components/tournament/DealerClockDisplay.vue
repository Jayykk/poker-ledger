<template>
  <div class="dealer-clock-display" :class="{ 'is-break': isBreak, 'time-critical': timerColorClass === 'timer-critical' && status === 'running', 'countdown-final': countdownFinal }">
    <div class="clock-container">
      <div class="clock-shell">
        <DealerClockHeader
          :title="title"
          :subtitle-text="subtitleText"
          :is-registration-closed="isRegistrationClosed"
          :show-dealer-badge="showDealerBadge"
          :show-settings-button="showSettingsButton"
          :show-time-bank-button="showTimeBankButton"
          :show-fullscreen-button="showFullscreenButton"
          @toggle-settings="$emit('toggle-settings')"
          @open-time-bank="$emit('open-time-bank')"
          @request-fullscreen="$emit('request-fullscreen')"
        />

        <section class="clock-stage">
          <DealerClockStatsPanel
            :entries="entries"
            :players-remaining="playersRemaining"
            :players-registered="playersRegistered"
            :chips-in-play="chipsInPlay"
            :average-stack="averageStack"
            :averageStackBB="averageStackBB"
          />

          <DealerClockCenterPanel
            :is-break="isBreak"
            :current-level="currentLevel"
            :current-blinds="currentBlinds"
            :time-to-break="timeToBreak"
            :formatted-time="formattedTime"
            :timer-color-class="timerColorClass"
            :status="status"
            :next-play-level-entry="nextPlayLevelEntry"
          />

          <DealerClockPayoutsPanel
            :prize-pool="prizePool"
            :payouts="payouts"
          />
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import DealerClockHeader from './DealerClockHeader.vue';
import DealerClockStatsPanel from './DealerClockStatsPanel.vue';
import DealerClockCenterPanel from './DealerClockCenterPanel.vue';
import DealerClockPayoutsPanel from './DealerClockPayoutsPanel.vue';

defineEmits(['toggle-settings', 'open-time-bank', 'request-fullscreen']);

defineProps({
  title: { type: String, default: 'Tournament' },
  subtitleText: { type: String, default: '' },
  isRegistrationClosed: { type: Boolean, default: false },
  entries: { type: Number, default: 0 },
  playersRemaining: { type: Number, default: 0 },
  playersRegistered: { type: Number, default: 0 },
  chipsInPlay: { type: Number, default: 0 },
  averageStack: { type: Number, default: 0 },
  averageStackBB: { type: Number, default: 0 },
  isBreak: { type: Boolean, default: false },
  currentLevel: { type: Number, default: 0 },
  currentBlinds: {
    type: Object,
    default: () => ({ small: 0, big: 0, ante: 0 }),
  },
  timeToBreak: { type: String, default: '' },
  formattedTime: { type: String, default: '00:00' },
  timerColorClass: { type: String, default: '' },
  countdownFinal: { type: Boolean, default: false },
  status: { type: String, default: 'waiting' },
  nextPlayLevelEntry: { type: Object, default: null },
  prizePool: { type: Number, default: 0 },
  payouts: { type: Array, default: () => [] },
  showDealerBadge: { type: Boolean, default: true },
  showSettingsButton: { type: Boolean, default: true },
  showTimeBankButton: { type: Boolean, default: true },
  showFullscreenButton: { type: Boolean, default: true },
});
</script>

<style scoped>
.dealer-clock-display {
  position: fixed;
  inset: 0;
  z-index: 50;
  overflow: hidden;
  isolation: isolate;
  color: #f8fafc;
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  background: #07111f;
}

.dealer-clock-display::before,
.dealer-clock-display::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.dealer-clock-display::before {
  z-index: -2;
  background:
    radial-gradient(circle at top, rgba(96, 165, 250, 0.28), transparent 30%),
    radial-gradient(circle at bottom right, rgba(59, 130, 246, 0.22), transparent 28%),
    linear-gradient(135deg, #081325 0%, #12376a 52%, #07111f 100%);
}

.dealer-clock-display::after {
  z-index: -1;
  opacity: 0;
  background:
    radial-gradient(circle at top, rgba(110, 231, 183, 0.2), transparent 30%),
    linear-gradient(135deg, #053b31 0%, #075b48 52%, #062a25 100%);
  transition: opacity 0.22s ease;
}

.dealer-clock-display.is-break::after {
  opacity: 1;
}

.dealer-clock-display.time-critical {
  animation: borderPulse 1s ease-in-out infinite;
}

.dealer-clock-display.countdown-final::before {
  content: '';
  position: fixed;
  inset: 0;
  background: rgba(245, 158, 11, 0.18);
  animation: countdownFlash 1s ease-in-out infinite;
  pointer-events: none;
  z-index: 1;
}

@keyframes countdownFlash {
  0%, 100% { opacity: 0; }
  50% { opacity: 1; }
}

@keyframes borderPulse {
  0%, 100% { box-shadow: inset 0 0 40px rgba(239, 68, 68, 0); }
  50% { box-shadow: inset 0 0 42px rgba(239, 68, 68, 0.24); }
}

.clock-container {
  display: flex;
  min-height: 100vh;
  min-height: 100dvh;
  padding:
    calc(env(safe-area-inset-top, 0px) + clamp(1rem, 1.5vw, 1.6rem))
    clamp(1rem, 1.8vw, 1.9rem)
    calc(env(safe-area-inset-bottom, 0px) + clamp(1rem, 1.8vw, 1.9rem));
}

.clock-shell {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: clamp(1rem, 2vw, 1.75rem);
  width: min(100%, 1820px);
  min-height: 100%;
  margin: 0 auto;
}

.panel-surface {
  background: linear-gradient(180deg, rgba(10, 23, 45, 0.56), rgba(8, 18, 34, 0.4));
  border: 1px solid rgba(226, 232, 240, 0.12);
  box-shadow: 0 18px 48px rgba(2, 6, 23, 0.28);
  backdrop-filter: blur(14px);
}

.clock-stage {
  display: grid;
  grid-template-columns: minmax(240px, 0.92fr) minmax(540px, 1.65fr) minmax(260px, 0.98fr);
  gap: clamp(1rem, 2vw, 2rem);
  flex: 1;
  min-height: 0;
}

.info-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: clamp(0.95rem, 1.6vw, 1.4rem);
  padding: clamp(1.35rem, 2vw, 1.8rem);
  border-radius: 1.75rem;
}

.left-panel {
  justify-content: space-between;
}

.right-panel {
  justify-content: flex-start;
  gap: clamp(1.4rem, 2vw, 1.9rem);
}

@media (min-width: 1440px) and (min-aspect-ratio: 16/9) {
  .clock-shell {
    gap: 2.15rem;
  }

  .clock-stage {
    grid-template-columns: minmax(270px, 0.9fr) minmax(720px, 1.75fr) minmax(300px, 0.98fr);
    gap: 2.2rem;
    min-height: min(68vh, 760px);
  }
}

@media (max-width: 1220px) {
  .clock-stage {
    grid-template-columns: minmax(220px, 0.95fr) minmax(420px, 1.45fr) minmax(230px, 0.95fr);
  }
}

@media (max-width: 980px) {
  .dealer-clock-display {
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }

  .clock-container {
    min-height: max(100%, 100dvh);
  }

  .clock-stage {
    grid-template-columns: 1fr;
  }

  .info-panel {
    border-radius: 1.45rem;
  }

  .left-panel,
  .right-panel {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    align-items: start;
  }

  .left-panel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.8rem;
  }
}

@media (max-width: 768px) {
  .clock-container {
    padding: calc(env(safe-area-inset-top, 0px) + 0.75rem) 0.75rem calc(env(safe-area-inset-bottom, 0px) + 0.75rem);
  }

  .clock-shell {
    gap: 0.75rem;
  }

  .clock-stage {
    gap: 0.7rem;
  }

  .info-panel {
    padding: 0.95rem;
    border-radius: 1.2rem;
  }

  .left-panel,
  .right-panel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.7rem 0.9rem;
  }
}
</style>
