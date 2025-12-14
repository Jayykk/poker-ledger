<template>
  <BaseCard title="Blind Timer" padding="md">
    <div class="space-y-4">
      <!-- Blind Level Display -->
      <div class="text-center">
        <div class="text-gray-400 text-sm mb-2">{{ $t('blindTimer.level') }} {{ currentLevel }}</div>
        <div class="text-4xl font-mono font-bold text-amber-400">
          {{ currentBlinds.small }} / {{ currentBlinds.big }}
        </div>
      </div>

      <!-- Timer Display -->
      <div class="text-center">
        <div class="text-6xl font-mono font-bold" :class="timeClass">
          {{ formattedTime }}
        </div>
        <div class="text-gray-400 text-sm mt-2">
          {{ isBreak ? $t('blindTimer.breakTime') : $t('blindTimer.timeRemaining') }}
        </div>
      </div>

      <!-- Controls -->
      <div class="flex gap-3">
        <BaseButton
          v-if="!isRunning"
          @click="start"
          variant="secondary"
          fullWidth
        >
          <i class="fas fa-play mr-2"></i>{{ $t('blindTimer.start') }}
        </BaseButton>
        <BaseButton
          v-else
          @click="pause"
          variant="ghost"
          fullWidth
        >
          <i class="fas fa-pause mr-2"></i>{{ $t('blindTimer.pause') }}
        </BaseButton>
        <BaseButton
          @click="reset"
          variant="danger"
        >
          <i class="fas fa-redo"></i>
        </BaseButton>
      </div>

      <!-- Blind Level Settings -->
      <div class="space-y-2">
        <div class="text-gray-400 text-sm">Duration (minutes):</div>
        <div class="flex gap-2">
          <button
            v-for="preset in BLIND_TIMER_PRESETS"
            :key="preset"
            @click="setDuration(preset)"
            class="px-3 py-1 rounded-lg text-sm"
            :class="duration === preset ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300'"
          >
            {{ preset }}
          </button>
        </div>
      </div>

      <!-- Sound Toggle -->
      <div class="flex items-center justify-between">
        <span class="text-gray-400 text-sm">{{ $t('profile.sound') }}</span>
        <button
          @click="toggleSound"
          class="w-12 h-6 rounded-full transition"
          :class="soundEnabled ? 'bg-emerald-600' : 'bg-slate-700'"
        >
          <div
            class="w-5 h-5 bg-white rounded-full transition-transform"
            :class="soundEnabled ? 'translate-x-6' : 'translate-x-0.5'"
          ></div>
        </button>
      </div>
    </div>
  </BaseCard>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseCard from '../common/BaseCard.vue';
import BaseButton from '../common/BaseButton.vue';
import { BLIND_TIMER_PRESETS, DEFAULT_BLIND_DURATION, DEFAULT_BREAK_DURATION, STORAGE_KEYS } from '../../utils/constants.js';

const { t } = useI18n();

const currentLevel = ref(1);
const timeLeft = ref(DEFAULT_BLIND_DURATION * 60); // in seconds
const duration = ref(DEFAULT_BLIND_DURATION);
const isRunning = ref(false);
const isBreak = ref(false);
const soundEnabled = ref(localStorage.getItem(STORAGE_KEYS.SOUND_ENABLED) !== 'false');

let intervalId = null;

// Blind structure (can be customized)
const blindStructure = [
  { small: 25, big: 50 },
  { small: 50, big: 100 },
  { small: 75, big: 150 },
  { small: 100, big: 200 },
  { small: 150, big: 300 },
  { small: 200, big: 400 },
  { small: 300, big: 600 },
  { small: 400, big: 800 },
  { small: 500, big: 1000 },
  { small: 750, big: 1500 },
  { small: 1000, big: 2000 }
];

const currentBlinds = computed(() => {
  return blindStructure[currentLevel.value - 1] || blindStructure[0];
});

const formattedTime = computed(() => {
  const minutes = Math.floor(timeLeft.value / 60);
  const seconds = timeLeft.value % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
});

const timeClass = computed(() => {
  if (timeLeft.value <= 60) return 'text-rose-400';
  if (timeLeft.value <= 180) return 'text-amber-400';
  return 'text-white';
});

const start = () => {
  if (isRunning.value) return;
  
  isRunning.value = true;
  intervalId = setInterval(() => {
    if (timeLeft.value > 0) {
      timeLeft.value--;
      
      // Warning sound at 1 minute
      if (timeLeft.value === 60 && soundEnabled.value) {
        playSound('warning');
      }
    } else {
      // Time's up!
      if (soundEnabled.value) {
        playSound('complete');
      }
      
      if (isBreak.value) {
        // End break, move to next level
        isBreak.value = false;
        currentLevel.value++;
        timeLeft.value = duration.value * 60;
      } else {
        // Start break
        isBreak.value = true;
        timeLeft.value = DEFAULT_BREAK_DURATION * 60;
      }
    }
  }, 1000);
};

const pause = () => {
  isRunning.value = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
};

const reset = () => {
  pause();
  currentLevel.value = 1;
  timeLeft.value = duration.value * 60;
  isBreak.value = false;
};

const setDuration = (minutes) => {
  duration.value = minutes;
  if (!isRunning.value) {
    timeLeft.value = minutes * 60;
  }
};

const toggleSound = () => {
  soundEnabled.value = !soundEnabled.value;
  localStorage.setItem(STORAGE_KEYS.SOUND_ENABLED, soundEnabled.value);
};

const playSound = (type) => {
  // Create simple beep sound using Web Audio API
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = type === 'warning' ? 800 : 1000;
  oscillator.type = 'sine';
  
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
};

onUnmounted(() => {
  pause();
});
</script>
