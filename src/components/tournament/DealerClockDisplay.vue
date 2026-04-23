<template>
  <div class="dealer-clock-display" :class="{ 'is-break': isBreak, 'time-critical': timerColorClass === 'timer-critical' && status === 'running' }">
    <div class="clock-container">
      <div class="clock-shell">
        <header class="clock-header panel-surface">
          <div class="header-actions header-actions-left">
            <button
              v-if="showSettingsButton"
              class="hud-control-btn"
              :title="t('tournament.controls')"
              @click="$emit('toggle-settings')"
            >
              <i class="fas fa-cog"></i>
            </button>
          </div>

          <div class="header-main">
            <div class="header-title-row">
              <h1 class="tournament-name">{{ title }}</h1>

              <div v-if="isRegistrationClosed" class="meta-chip meta-chip-status meta-chip-status-compact">
                <i class="fas fa-lock"></i>
                <span class="meta-chip-text-full">{{ t('tournament.registrationClosed') }}</span>
                <span class="meta-chip-text-short">{{ t('tournament.registrationClosedShort') }}</span>
              </div>
            </div>

            <div class="header-meta" :class="{ 'header-meta-closed': isRegistrationClosed }">
              <div v-if="subtitleText" class="meta-chip meta-chip-info">
                <i class="fas" :class="isRegistrationClosed ? 'fa-coins' : 'fa-circle-info'"></i>
                <span class="meta-chip-info-text">{{ subtitleText }}</span>
              </div>

              <div v-if="showDealerBadge" class="meta-chip meta-chip-dealer">
                <i class="fas fa-user-shield"></i>
                <span class="meta-chip-text">{{ t('tournament.dealerMode') }}</span>
              </div>
            </div>
          </div>

          <div class="header-actions header-actions-right">
            <button
              v-if="showTimeBankButton"
              class="hud-control-btn"
              :title="t('timeBank.title')"
              @click="$emit('open-time-bank')"
            >
              <i class="fas fa-hourglass-half"></i>
            </button>
            <button
              v-if="showFullscreenButton"
              class="hud-control-btn hud-control-btn-fullscreen"
              :title="t('tournament.fullscreen')"
              @click="$emit('request-fullscreen')"
            >
              <i class="fas fa-expand"></i>
            </button>
          </div>
        </header>

        <section class="clock-stage">
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
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';

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
  status: { type: String, default: 'waiting' },
  nextPlayLevelEntry: { type: Object, default: null },
  prizePool: { type: Number, default: 0 },
  payouts: { type: Array, default: () => [] },
  showDealerBadge: { type: Boolean, default: true },
  showSettingsButton: { type: Boolean, default: true },
  showTimeBankButton: { type: Boolean, default: true },
  showFullscreenButton: { type: Boolean, default: true },
});

const { t } = useI18n();

function formatNumber(value) {
  if (value == null) return '0';
  return Number(value).toLocaleString();
}
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

.clock-header {
  display: grid;
  grid-template-columns: minmax(88px, 112px) minmax(0, 1fr) minmax(120px, 152px);
  align-items: start;
  gap: clamp(0.8rem, 1.5vw, 1.25rem);
  padding: clamp(1rem, 1.8vw, 1.4rem) clamp(1rem, 1.8vw, 1.65rem);
  border-radius: 1.6rem;
}

.header-actions {
  display: flex;
  gap: 0.65rem;
}

.header-actions-left {
  justify-content: flex-start;
}

.header-actions-right {
  justify-content: flex-end;
}

.header-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(0.9rem, 1.5vw, 1.15rem);
  min-width: 0;
}

.header-title-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(1rem, 1.6vw, 1.35rem);
  width: 100%;
}

.tournament-name {
  font-size: clamp(2rem, 4.1vw, 4rem);
  line-height: 0.95;
  font-weight: 800;
  letter-spacing: 0.01em;
  text-align: center;
  text-shadow: 0 10px 22px rgba(15, 23, 42, 0.4);
}

.header-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: clamp(0.7rem, 1vw, 0.9rem);
  max-width: min(100%, 1100px);
}

.meta-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  min-height: 42px;
  padding: 0.55rem 1rem;
  border-radius: 9999px;
  border: 1px solid rgba(226, 232, 240, 0.12);
  background: rgba(8, 15, 30, 0.45);
  color: rgba(226, 232, 240, 0.88);
  font-size: clamp(0.88rem, 1.2vw, 1rem);
  font-weight: 600;
  line-height: 1.15;
  text-align: center;
}

.meta-chip-status {
  background: linear-gradient(180deg, rgba(225, 29, 72, 0.88), rgba(159, 18, 57, 0.82));
  border-color: rgba(253, 164, 175, 0.5);
  color: #fff1f2;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.meta-chip-text-short {
  display: none;
}

.meta-chip-info {
  max-width: min(100%, 620px);
}

.meta-chip-info-text {
  min-width: 0;
}

.meta-chip-dealer {
  background: rgba(120, 53, 15, 0.5);
  border-color: rgba(251, 191, 36, 0.32);
  color: #fde68a;
}

.hud-control-btn {
  width: 48px;
  height: 48px;
  border-radius: 9999px;
  border: 1px solid rgba(226, 232, 240, 0.16);
  background: rgba(15, 23, 42, 0.48);
  color: #e2e8f0;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease;
}

.hud-control-btn:hover {
  transform: translateY(-1px);
  background: rgba(30, 41, 59, 0.76);
  border-color: rgba(148, 163, 184, 0.4);
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

.left-panel {
  justify-content: space-between;
}

.left-panel .info-item {
  align-items: center;
}

.right-panel {
  justify-content: flex-start;
  gap: clamp(1.4rem, 2vw, 1.9rem);
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

.info-value-primary {
  font-variant-numeric: tabular-nums;
}

.info-value-stack {
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
}

.info-value.prize {
  font-size: clamp(2.5rem, 3.2vw, 3.9rem);
  color: #fcd34d;
  text-shadow: 0 8px 20px rgba(133, 77, 14, 0.28);
  font-variant-numeric: tabular-nums;
}

.avg-bb {
  font-size: clamp(0.92rem, 1vw, 1.08rem);
  color: rgba(226, 232, 240, 0.56);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1.1;
}

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

@media (min-width: 1440px) and (min-aspect-ratio: 16/9) {
  .clock-shell {
    gap: 2.15rem;
  }

  .clock-stage {
    grid-template-columns: minmax(270px, 0.9fr) minmax(720px, 1.75fr) minmax(300px, 0.98fr);
    gap: 2.2rem;
    min-height: min(68vh, 760px);
  }

  .header-main {
    gap: 1.2rem;
  }

  .header-title-row {
    gap: 1.45rem;
  }

  .header-meta {
    gap: 0.9rem;
  }

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
  .clock-stage {
    grid-template-columns: minmax(220px, 0.95fr) minmax(420px, 1.45fr) minmax(230px, 0.95fr);
  }

  .timer-display {
    font-size: clamp(4.8rem, 8.2vw, 7.9rem);
  }

  .blinds-value {
    font-size: clamp(2.65rem, 4.6vw, 4.4rem);
  }

  .info-value {
    font-size: clamp(1.75rem, 2.2vw, 2.55rem);
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

  .clock-header {
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
  }

  .header-actions {
    min-width: 0;
  }

  .header-main {
    align-items: stretch;
    gap: 0.65rem;
  }

  .header-title-row {
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.7rem;
  }

  .tournament-name {
    text-align: left;
  }

  .header-meta {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
  }

  .meta-chip-status-compact {
    flex-shrink: 0;
    min-height: 36px;
    padding: 0.45rem 0.75rem;
  }

  .meta-chip-status-compact .meta-chip-text-full {
    display: none;
  }

  .meta-chip-status-compact .meta-chip-text-short {
    display: inline;
  }

  .meta-chip-info {
    width: 100%;
    max-width: none;
    justify-content: flex-start;
  }

  .meta-chip-dealer {
    min-width: 42px;
    padding: 0.45rem 0.7rem;
  }

  .meta-chip-dealer .meta-chip-text {
    display: none;
  }

  .hud-control-btn-fullscreen {
    display: none;
  }

  .clock-stage {
    grid-template-columns: 1fr;
  }

  .info-panel,
  .clock-center {
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

  .left-panel .info-item,
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

  .info-item-prize {
    padding-bottom: 0;
    border-bottom: none;
  }

  .payout-row {
    justify-content: center;
  }
}

@media (max-width: 768px) {
  .clock-container {
    padding: calc(env(safe-area-inset-top, 0px) + 0.75rem) 0.75rem calc(env(safe-area-inset-bottom, 0px) + 0.75rem);
  }

  .clock-shell {
    gap: 0.75rem;
  }

  .clock-header {
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.7rem;
    padding: 0.8rem 0.8rem 0.95rem;
    border-radius: 1.1rem;
  }

  .tournament-name {
    font-size: clamp(1.45rem, 6.4vw, 2rem);
  }

  .header-title-row {
    gap: 0.55rem;
  }

  .meta-chip {
    min-height: 34px;
    padding: 0.38rem 0.72rem;
    font-size: 0.75rem;
    line-height: 1.1;
  }

  .meta-chip-info {
    min-height: 36px;
  }

  .meta-chip-status-compact {
    padding: 0.38rem 0.65rem;
  }

  .meta-chip-dealer {
    min-width: 36px;
    padding: 0.38rem 0.55rem;
  }

  .hud-control-btn {
    width: 40px;
    height: 40px;
    font-size: 0.95rem;
  }

  .clock-stage {
    gap: 0.7rem;
  }

  .info-panel,
  .clock-center {
    padding: 0.95rem;
    border-radius: 1.2rem;
  }

  .left-panel,
  .right-panel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.7rem 0.9rem;
  }

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

  .info-value.prize {
    font-size: 1.7rem;
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