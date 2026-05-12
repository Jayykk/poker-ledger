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

// Singleton AudioContext — reused across all playSound calls to avoid
// re-creation in suspended state on each invocation.
let _audioCtx = null;
function _getCtx() {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

/**
 * Call this once on the first user gesture (click/touchstart) to unlock
 * the AudioContext. Plays a silent buffer — the most reliable technique
 * for iOS Safari / LINE WebView which requires the audio graph to actually
 * be driven synchronously during the gesture.
 */
export function unlockAudio() {
  try {
    const ctx = _getCtx();
    // Fire resume synchronously inside the user gesture
    ctx.resume().catch(() => {});
    // Play a 1-sample silent buffer — this is the iOS golden-standard unlock trick.
    // Without actually scheduling audio nodes synchronously, iOS WKWebView
    // keeps the context silenced even after resume() resolves.
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    // AudioContext not available
  }
}

/**
 * Internal: create and start oscillator nodes synchronously.
 * Nodes are created BEFORE resume() resolves so that on iOS/LINE WebView
 * they are queued during the gesture — they will output audio as soon as
 * the context transitions to 'running'.
 */
function _playSync(ctx, type, preset) {
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
        const ctx2 = _getCtx();
        const osc2 = ctx2.createOscillator();
        const gain2 = ctx2.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx2.destination);
        osc2.frequency.value = 1600;
        gain2.gain.value = preset.levelUp;
        osc2.start();
        osc2.stop(ctx2.currentTime + 0.2);
      } catch {
        // Audio not available
      }
    }, 150);
  }
}

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
      const ctx = _getCtx();
      if (ctx.state === 'running') {
        // Context already unlocked — play synchronously right now.
        _playSync(ctx, type, preset);
      } else {
        // Context is suspended (no prior user gesture yet).
        // Call resume() and ALSO schedule nodes synchronously so they
        // are queued during the current user gesture on iOS/LINE WebView.
        // Nodes started on a suspended context begin output the moment
        // the context transitions to 'running'.
        ctx.resume().catch(() => {});
        _playSync(ctx, type, preset);
      }
    } catch {
      // Audio not available
    }
  }

  /**
   * Play a sample warning sound using a specific preset (for test buttons).
   * Also unlocks the AudioContext so subsequent watch-triggered sounds work.
   * @param {string} presetKey
   */
  function testPreset(presetKey) {
    unlockAudio();
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
