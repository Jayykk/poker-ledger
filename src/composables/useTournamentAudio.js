/**
 * Shared tournament clock audio composable.
 * Manages volume presets and sound playback for both
 * TournamentClockView and DealerClockView.
 */

import { ref } from 'vue';

const STORAGE_KEY = 'tournament_audio_preset';

export const VOLUME_PRESETS = {
  low:    { warning: 0.45, levelUp: 0.3  },
  medium: { warning: 0.9,  levelUp: 0.68 },
  high:   { warning: 1.0,  levelUp: 1.0  },
};

// Singleton reactive state shared across all useTournamentAudio() calls
const _stored = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) || 'medium';
const selectedPreset = ref(VOLUME_PRESETS[_stored] ? _stored : 'medium');

export function useTournamentAudio() {
  function setPreset(key) {
    if (!VOLUME_PRESETS[key]) return;
    selectedPreset.value = key;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, key);
    }
  }

  /**
   * Play an alert sound.
   * @param {'warning'|'levelUp'} type
   * @param {string} [presetKey]  Override preset; defaults to selectedPreset
   */
  function playSound(type, presetKey) {
    const preset = VOLUME_PRESETS[presetKey || selectedPreset.value] || VOLUME_PRESETS.medium;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Resume in case the context was auto-suspended by the browser's autoplay policy
      ctx.resume().then(() => {
        try {
          if (type === 'warning') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            gain.gain.value = preset.warning;
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
          } else if (type === 'levelUp') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 1200;
            gain.gain.value = preset.levelUp;
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
            setTimeout(() => {
              try {
                const osc2 = ctx.createOscillator();
                const gain2 = ctx.createGain();
                osc2.connect(gain2);
                gain2.connect(ctx.destination);
                osc2.frequency.value = 1600;
                gain2.gain.value = preset.levelUp;
                osc2.start();
                osc2.stop(ctx.currentTime + 0.2);
              } catch {
                // Audio not available
              }
            }, 150);
          }
        } catch {
          // Audio not available
        }
      }).catch(() => {
        // AudioContext resume blocked
      });
    } catch {
      // Audio not available
    }
  }

  /**
   * Play a sample warning sound using a specific preset (for test buttons).
   * @param {string} presetKey
   */
  function testPreset(presetKey) {
    playSound('warning', presetKey);
  }

  return {
    selectedPreset,
    VOLUME_PRESETS,
    presetKeys: Object.keys(VOLUME_PRESETS),
    setPreset,
    playSound,
    testPreset,
  };
}
