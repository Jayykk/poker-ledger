<template>
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
</template>

<script setup>
import { useI18n } from 'vue-i18n';

defineEmits(['toggle-settings', 'open-time-bank', 'request-fullscreen']);

defineProps({
  title: { type: String, default: 'Tournament' },
  subtitleText: { type: String, default: '' },
  isRegistrationClosed: { type: Boolean, default: false },
  showDealerBadge: { type: Boolean, default: true },
  showSettingsButton: { type: Boolean, default: true },
  showTimeBankButton: { type: Boolean, default: true },
  showFullscreenButton: { type: Boolean, default: true },
});

const { t } = useI18n();
</script>

<style scoped>
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

@media (min-width: 1440px) and (min-aspect-ratio: 16/9) {
  .header-main {
    gap: 1.2rem;
  }

  .header-title-row {
    gap: 1.45rem;
  }

  .header-meta {
    gap: 0.9rem;
  }
}

@media (max-width: 980px) {
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
}

@media (max-width: 768px) {
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
}
</style>
