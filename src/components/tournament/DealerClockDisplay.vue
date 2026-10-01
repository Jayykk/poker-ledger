<template>
  <!-- Style 2: felt board -->
  <div v-if="clockStyle === 'felt'" class="dealer-clock-display style-felt">
    <FeltClockBoard
      :name="title"
      :custom-subtitle="subtitleText"
      :is-timed="isTimed"
      :status="status"
      :buy-in-closed="isRegistrationClosed"
      :cutoff-level="cutoffLevel"
      :levels="levels"
      :current-level-index="currentLevelIndex"
      :current-level="currentLevel"
      :current-blinds="currentBlinds"
      :is-break="isBreak"
      :next-play-level-entry="nextPlayLevelEntry"
      :formatted-time="formattedTime"
      :local-time-left="localTimeLeft"
      :level-progress="levelProgress"
      :time-to-break="timeToBreak"
      :time-to-end="timeToEnd"
      :ends-at="endsAt"
      :players-registered="playersRegistered"
      :players-remaining="playersRemaining"
      :entries="entries"
      :chips-in-play="chipsInPlay"
      :average-stack="averageStack"
      :averageStackBB="averageStackBB"
      :prize-pool="prizePool"
      :bounty-per-head="bountyPerHead"
      :bounty-label="bountyLabel"
      :payouts="payouts"
    >
      <template #actions-left>
        <button v-if="showSettingsButton" class="dc-btn felt" :title="$t('tournament.controls')" @click="$emit('toggle-settings')">
          <i class="fas fa-cog"></i>
        </button>
      </template>
      <template #actions-right>
        <button v-if="showTimeBankButton" class="dc-btn felt" :title="$t('timeBank.title')" @click="$emit('open-time-bank')">
          <i class="fas fa-hourglass-half"></i>
        </button>
        <button v-if="showFullscreenButton" class="dc-btn felt" @click="$emit('request-fullscreen')">
          <i class="fas fa-expand"></i>
        </button>
      </template>
    </FeltClockBoard>
  </div>

  <!-- Style 1: scoreboard -->
  <div v-else class="dealer-clock-display">
    <ScoreboardClockBoard
      :name="title"
      :custom-subtitle="subtitleText"
      :is-timed="isTimed"
      :status="status"
      :buy-in-closed="isRegistrationClosed"
      :cutoff-level="cutoffLevel"
      :current-level-index="currentLevelIndex"
      :current-level="currentLevel"
      :current-blinds="currentBlinds"
      :is-break="isBreak"
      :next-play-level-entry="nextPlayLevelEntry"
      :formatted-time="formattedTime"
      :local-time-left="localTimeLeft"
      :level-progress="levelProgress"
      :time-to-break="timeToBreak"
      :time-to-end="timeToEnd"
      :ends-at="endsAt"
      :players-registered="playersRegistered"
      :players-remaining="playersRemaining"
      :entries="entries"
      :average-stack="averageStack"
      :averageStackBB="averageStackBB"
      :prize-pool="prizePool"
      :bounty-per-head="bountyPerHead"
      :bounty-label="bountyLabel"
      :payouts="payouts"
    >
      <template #actions-left>
        <button v-if="showSettingsButton" class="dc-btn" :title="$t('tournament.controls')" @click="$emit('toggle-settings')">
          <i class="fas fa-cog"></i>
        </button>
      </template>
      <template #pills-extra>
        <span v-if="showDealerBadge" class="dc-dealer-pill">
          <i class="fas fa-user-shield"></i>{{ $t('tournament.dealerMode') }}
        </span>
      </template>
      <template #actions-right>
        <button v-if="showTimeBankButton" class="dc-btn" :title="$t('timeBank.title')" @click="$emit('open-time-bank')">
          <i class="fas fa-hourglass-half"></i>
        </button>
        <button v-if="showFullscreenButton" class="dc-btn" @click="$emit('request-fullscreen')">
          <i class="fas fa-expand"></i>
        </button>
      </template>
    </ScoreboardClockBoard>
  </div>
</template>

<script setup>
// Dealer-mode clock (also the TV view): picks the face the host chose.
import FeltClockBoard from './FeltClockBoard.vue';
import ScoreboardClockBoard from './ScoreboardClockBoard.vue';

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
  isTimed: { type: Boolean, default: false },
  timeToEnd: { type: String, default: '' },
  formattedTime: { type: String, default: '00:00' },
  status: { type: String, default: 'waiting' },
  nextPlayLevelEntry: { type: Object, default: null },
  prizePool: { type: Number, default: 0 },
  payouts: { type: Array, default: () => [] },
  showDealerBadge: { type: Boolean, default: true },
  showSettingsButton: { type: Boolean, default: true },
  showTimeBankButton: { type: Boolean, default: true },
  showFullscreenButton: { type: Boolean, default: true },
  // Face style ('classic' → scoreboard | 'felt') + what the faces need
  clockStyle: { type: String, default: 'classic' },
  levels: { type: Array, default: () => [] },
  currentLevelIndex: { type: Number, default: 0 },
  localTimeLeft: { type: Number, default: 0 },
  levelProgress: { type: Number, default: 0 },
  endsAt: { type: String, default: '' },
  cutoffLevel: { type: Number, default: 0 },
  bountyPerHead: { type: Number, default: 0 },
  bountyLabel: { type: String, default: '🎯 KO' },
});
</script>

<style scoped>
.dealer-clock-display {
  position: fixed;
  inset: 0;
  z-index: 50;
  overflow: hidden;
  color: #f8fafc;
  background: #0a1425;
}
.dealer-clock-display.style-felt { background: #0a2119; }

.dc-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
}
.dc-btn:hover { background: rgba(255, 255, 255, 0.2); }
.dc-btn.felt {
  background: rgba(10, 33, 25, 0.6);
  border-color: rgba(207, 174, 106, 0.45);
  color: #f3ecdd;
}
.dc-btn.felt:hover { background: rgba(207, 174, 106, 0.2); }

.dc-dealer-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: 700 12px/1 'Noto Sans TC', system-ui, sans-serif;
  letter-spacing: 0.06em;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.16);
  color: #fbbf24;
  white-space: nowrap;
}
</style>
