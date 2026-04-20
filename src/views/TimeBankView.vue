<template>
  <div class="time-bank-view" :class="urgencyClass">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-screen bg-slate-900">
      <LoadingSpinner />
    </div>

    <!-- Setup mode (new session) -->
    <div v-else-if="isSetupMode" class="flex flex-col items-center justify-center min-h-screen bg-slate-900 px-4">
      <div class="setup-card">
        <h1 class="text-2xl font-bold text-white mb-6 text-center">
          <i class="fas fa-hourglass-half text-amber-400 mr-2"></i>{{ $t('timeBank.title') }}
        </h1>

        <div class="space-y-4">
          <div>
            <label class="field-label">{{ $t('timeBank.label') }}</label>
            <input v-model="setupLabel" type="text" class="field-input" :placeholder="$t('timeBank.labelPlaceholder')" />
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="field-label">{{ $t('timeBank.minSeconds') }}</label>
              <input
                v-model.number="setupMinSeconds"
                type="number"
                min="5"
                max="300"
                class="field-input text-center"
              />
            </div>
            <div>
              <label class="field-label">{{ $t('timeBank.intervalSeconds') }}</label>
              <input
                v-model.number="setupInterval"
                type="number"
                min="1"
                max="60"
                class="field-input text-center"
              />
            </div>
            <div>
              <label class="field-label">{{ $t('timeBank.buttonCount') }}</label>
              <input
                v-model.number="setupButtonCount"
                type="number"
                min="1"
                max="6"
                class="field-input text-center"
              />
            </div>
          </div>
          <!-- Preview buttons -->
          <div class="flex gap-2 justify-center flex-wrap">
            <span
              v-for="sec in setupPreviewPresets"
              :key="sec"
              class="preset-btn active"
            >
              {{ sec }}s
            </span>
          </div>
          <button @click="handleCreate" class="w-full py-3 bg-amber-600 hover:bg-amber-500 rounded-lg font-bold text-white transition text-lg">
            {{ $t('timeBank.create') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Active Timer Display -->
    <div v-else-if="session" class="timer-container">
      <!-- Back button -->
      <button @click="handleBack" class="absolute top-4 left-4 z-10 hud-btn">
        <i class="fas fa-arrow-left"></i>
      </button>

      <!-- Settings button (host) -->
      <button v-if="isHost" @click="showSettings = !showSettings" class="absolute top-4 right-4 z-10 hud-btn">
        <i class="fas fa-cog"></i>
      </button>

      <!-- Timer label -->
      <div class="timer-label">{{ label }}</div>

      <!-- Big countdown -->
      <div class="countdown" :class="urgency">
        {{ formattedTime }}
      </div>

      <!-- Progress bar -->
      <div class="progress-bar-container">
        <div class="progress-bar" :style="{ width: percentage + '%' }" :class="urgency"></div>
      </div>

      <!-- Status text -->
      <div v-if="status === 'idle'" class="status-text text-gray-400">
        {{ $t('timeBank.ready') }}
      </div>
      <div v-else-if="status === 'paused'" class="status-text text-amber-400 animate-pulse">
        {{ $t('timeBank.paused') }}
      </div>
      <div v-else-if="status === 'expired'" class="status-text text-red-400 expired-flash">
        {{ $t('timeBank.expired') }}
      </div>

      <!-- Host controls -->
      <div v-if="isHost" class="controls">
        <button
          v-if="status === 'idle' || status === 'paused'"
          @click="startTimer"
          class="ctrl-btn start"
        >
          <i class="fas fa-play mr-2"></i>{{ $t('timeBank.start') }}
        </button>
        <button
          v-else-if="status === 'running'"
          @click="pauseTimer"
          class="ctrl-btn pause"
        >
          <i class="fas fa-pause mr-2"></i>{{ $t('timeBank.pause') }}
        </button>
        <button @click="resetAndStart()" class="ctrl-btn reset">
          <i class="fas fa-redo mr-2"></i>{{ $t('timeBank.reset') }}
        </button>
      </div>

      <!-- Quick preset buttons (host) -->
      <div v-if="isHost" class="quick-presets">
        <button
          v-for="sec in quickPresets"
          :key="sec"
          @click="resetAndStart(sec)"
          class="quick-preset-btn"
          :class="{ active: totalSeconds === sec }"
        >
          {{ sec }}s
        </button>
      </div>

      <!-- Settings panel (host) -->
      <div v-if="isHost && showSettings" class="settings-panel">
        <h3 class="text-sm font-bold text-gray-400 uppercase mb-3">{{ $t('timeBank.settings') }}</h3>
        <div class="space-y-3">
          <div>
            <label class="text-xs text-gray-400">{{ $t('timeBank.label') }}</label>
            <input v-model="editLabel" type="text" class="field-input" />
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div>
              <label class="text-xs text-gray-400">{{ $t('timeBank.minSeconds') }}</label>
              <input v-model.number="editMinSeconds" type="number" min="5" max="300" class="field-input text-center" />
            </div>
            <div>
              <label class="text-xs text-gray-400">{{ $t('timeBank.intervalSeconds') }}</label>
              <input v-model.number="editInterval" type="number" min="1" max="60" class="field-input text-center" />
            </div>
            <div>
              <label class="text-xs text-gray-400">{{ $t('timeBank.buttonCount') }}</label>
              <input v-model.number="editButtonCount" type="number" min="1" max="6" class="field-input text-center" />
            </div>
          </div>
          <button @click="applySettings" class="w-full py-2 bg-amber-600 rounded-lg text-white font-semibold text-sm">
            {{ $t('common.save') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Audio for alerts -->
    <audio ref="audioRef" preload="auto"></audio>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useTimeBank } from '../composables/useTimeBank.js';
import { useNotification } from '../composables/useNotification.js';
import { DEFAULT_TIME_BANK_SECONDS, DEFAULT_TIME_BANK_INTERVAL, DEFAULT_TIME_BANK_BUTTON_COUNT } from '../utils/constants.js';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { error: showError } = useNotification();

const {
  session, loading, localTimeLeft,
  isHost, label, status, totalSeconds, minSeconds, intervalSeconds, buttonCount, quickPresets,
  percentage, urgency, formattedTime,
  createSession, joinSession, startTimer, pauseTimer, resetTimer, resetAndStart, updateConfig, cleanup,
} = useTimeBank();

const showSettings = ref(false);
const editLabel = ref('');
const editMinSeconds = ref(DEFAULT_TIME_BANK_SECONDS);
const editInterval = ref(DEFAULT_TIME_BANK_INTERVAL);
const editButtonCount = ref(DEFAULT_TIME_BANK_BUTTON_COUNT);
const setupLabel = ref('');
const setupMinSeconds = ref(DEFAULT_TIME_BANK_SECONDS);
const setupInterval = ref(DEFAULT_TIME_BANK_INTERVAL);
const setupButtonCount = ref(DEFAULT_TIME_BANK_BUTTON_COUNT);
let warningAudioPlayed = false;

const setupPreviewPresets = computed(() => {
  const min = setupMinSeconds.value || DEFAULT_TIME_BANK_SECONDS;
  const interval = setupInterval.value || DEFAULT_TIME_BANK_INTERVAL;
  const count = setupButtonCount.value || DEFAULT_TIME_BANK_BUTTON_COUNT;
  return Array.from({ length: count }, (_, i) => min + i * interval);
});

const isSetupMode = computed(() => {
  return route.params.sessionId === 'new' && !session.value;
});

const urgencyClass = computed(() => {
  if (status.value === 'expired') return 'expired-state';
  return '';
});

// Sound alerts
watch(localTimeLeft, (val) => {
  if (status.value !== 'running') return;
  if (val <= 10 && val > 0 && !warningAudioPlayed) {
    playSound('tick');
    warningAudioPlayed = true;
  }
  if (val <= 0) {
    playSound('expire');
  }
  if (val > 10) {
    warningAudioPlayed = false;
  }
});

// Reset warning flag on status change
watch(status, () => {
  warningAudioPlayed = false;
});

function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'tick') {
      osc.frequency.value = 1000;
      gain.gain.value = 0.2;
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'expire') {
      osc.frequency.value = 440;
      gain.gain.value = 0.4;
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    }
  } catch {
    // audio not available
  }
}

async function handleCreate() {
  try {
    const id = await createSession({
      minSeconds: setupMinSeconds.value || DEFAULT_TIME_BANK_SECONDS,
      intervalSeconds: setupInterval.value || DEFAULT_TIME_BANK_INTERVAL,
      buttonCount: setupButtonCount.value || DEFAULT_TIME_BANK_BUTTON_COUNT,
      label: setupLabel.value || '',
    });
    // Replace URL so "new" becomes actual ID
    router.replace(`/time-bank/${id}`);
    joinSession(id);
  } catch (e) {
    showError(e.message);
  }
}

function handleBack() {
  router.push('/lobby');
}

async function applySettings() {
  await updateConfig({
    minSeconds: editMinSeconds.value,
    intervalSeconds: editInterval.value,
    buttonCount: editButtonCount.value,
    label: editLabel.value,
  });
  showSettings.value = false;
}

onMounted(() => {
  const id = route.params.sessionId;
  if (id && id !== 'new') {
    joinSession(id);
  }
});

onUnmounted(() => {
  cleanup();
});

// Sync edit fields with current config
watch(label, (v) => { editLabel.value = v; });
watch(minSeconds, (v) => { editMinSeconds.value = v; });
watch(intervalSeconds, (v) => { editInterval.value = v; });
watch(buttonCount, (v) => { editButtonCount.value = v; });
</script>

<style scoped>
.time-bank-view {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: #0f172a;
  color: white;
  overflow: hidden;
}

.time-bank-view.expired-state {
  animation: expiredFlash 0.5s ease-in-out 3;
}

@keyframes expiredFlash {
  0%, 100% { background: #0f172a; }
  50% { background: #450a0a; }
}

.setup-card {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  padding: 2rem;
  max-width: 400px;
  width: 100%;
}

.timer-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  height: 100dvh;
  position: relative;
  padding: 2rem;
}

.hud-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 1.1rem;
  cursor: pointer;
}

.timer-label {
  font-size: clamp(1rem, 3vw, 1.8rem);
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.countdown {
  font-size: clamp(6rem, 20vw, 16rem);
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  transition: color 0.3s;
}

.countdown.normal {
  color: white;
}

.countdown.warning {
  color: #fbbf24;
}

.countdown.critical {
  color: #ef4444;
  animation: countdownPulse 0.5s ease-in-out infinite;
}

@keyframes countdownPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.03); }
}

.progress-bar-container {
  width: 80%;
  max-width: 600px;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  margin-top: 2rem;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s linear;
}

.progress-bar.normal {
  background: #10b981;
}

.progress-bar.warning {
  background: #f59e0b;
}

.progress-bar.critical {
  background: #ef4444;
}

.status-text {
  margin-top: 1rem;
  font-size: 1.2rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.expired-flash {
  animation: expiredText 0.3s ease-in-out infinite;
}

@keyframes expiredText {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.controls {
  display: flex;
  gap: 1rem;
  margin-top: 2rem;
}

.ctrl-btn {
  padding: 0.75rem 2rem;
  border-radius: 0.75rem;
  font-size: 1.1rem;
  font-weight: 700;
  color: white;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.ctrl-btn.start {
  background: #059669;
}

.ctrl-btn.start:hover {
  background: #047857;
}

.ctrl-btn.pause {
  background: #d97706;
}

.ctrl-btn.pause:hover {
  background: #b45309;
}

.ctrl-btn.reset {
  background: #475569;
}

.ctrl-btn.reset:hover {
  background: #64748b;
}

.settings-panel {
  position: absolute;
  bottom: 2rem;
  right: 2rem;
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.75rem;
  padding: 1rem;
  width: 250px;
}

.field-label {
  display: block;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 0.25rem;
}

.field-input {
  width: 100%;
  background: #0f172a;
  border: 1px solid #475569;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  color: white;
  font-size: 0.9rem;
}

.field-input:focus {
  outline: none;
  border-color: #f59e0b;
}

.preset-btn {
  padding: 0.4rem 0.8rem;
  border-radius: 0.5rem;
  background: #334155;
  color: #94a3b8;
  border: 1px solid transparent;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.preset-btn.active {
  background: #f59e0b;
  color: white;
  border-color: #f59e0b;
}

.preset-btn:hover:not(.active) {
  background: #475569;
}

.quick-presets {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

.quick-preset-btn {
  padding: 0.875rem 1.5rem;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-size: 1.25rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  min-width: 72px;
  min-height: 52px;
}

.quick-preset-btn.active {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border-color: #f59e0b;
}

.quick-preset-btn:hover:not(.active) {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}
</style>
