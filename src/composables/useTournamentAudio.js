/**
 * Shared tournament clock audio composable.
 * Manages volume presets and sound playback for both
 * TournamentClockView and DealerClockView.
 *
 * Uses Web Audio API oscillators exclusively.
 * On iOS/iPadOS, Web Audio operates under the "ambient" audio session,
 * which mixes with other apps (Spotify) without interrupting them.
 * Since we cannot trigger system-level ducking from a web app,
 * alerts are designed to be maximally piercing and noticeable:
 * - Square/sawtooth waveforms (richer harmonics, cuts through music)
 * - Higher frequencies (2–4kHz range stands out over typical music)
 * - Repeated beep patterns (catches attention better than a single tone)
 * - Longer total duration
 */

import { ref } from 'vue';

const STORAGE_KEY = 'tournament_audio_preset';

export const VOLUME_PRESETS = {
  low:    { warning: 0.45, levelUp: 0.3  },
  medium: { warning: 0.9,  levelUp: 0.68 },
  high:   { warning: 1.0,  levelUp: 1.0  },
};

// Singleton reactive state shared across all useTournamentAudio() calls
const _stored = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) || 'high';
const selectedPreset = ref(VOLUME_PRESETS[_stored] ? _stored : 'high');

// Singleton AudioContext — reused across all playSound calls to avoid
// re-creation in suspended state on each invocation.
let _audioCtx = null;
function _getCtx() {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

let _isUnlocked = false;

/**
 * Call this once on the first user gesture (click/touchstart) to unlock
 * the AudioContext. Plays a silent buffer — the most reliable technique
 * for iOS Safari / LINE WebView which requires the audio graph to actually
 * be driven synchronously during the gesture.
 */
export function unlockAudio() {
  if (_isUnlocked) return;
  try {
    const ctx = _getCtx();
    ctx.resume().catch(() => {});
    // Play a 1-sample silent buffer — iOS golden-standard unlock trick.
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    _isUnlocked = true;
  } catch {
    // AudioContext not available
  }
}

// ── Audio keep-alive heartbeat ────────────────────────────────────────────────
// iOS/LINE WebView auto-suspends AudioContext after a few seconds with no
// user interaction. A viewer just watches without touching the screen,
// so we must schedule silent no-op audio pulses to keep the context alive.
let _heartbeatInterval = null;

function _playHeartbeat() {
  if (!_audioCtx || _audioCtx.state === 'closed') return;
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }
  try {
    const buf = _audioCtx.createBuffer(1, 1, _audioCtx.sampleRate);
    const src = _audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(_audioCtx.destination);
    src.start(0);
  } catch {}
}

export function startAudioHeartbeat() {
  if (_heartbeatInterval) return;
  _heartbeatInterval = setInterval(_playHeartbeat, 3000);
}

export function stopAudioHeartbeat() {
  if (_heartbeatInterval) {
    clearInterval(_heartbeatInterval);
    _heartbeatInterval = null;
  }
}

// ── Hybrid alert sound generation ─────────────────────────────────────────────
// Uses a layered approach: a warm triangle-wave body for tone quality,
// plus a brief high-frequency square-wave transient for attack/punch.
// This combination sounds refined yet cuts through background music.

/**
 * Warning alert: 3 beeps with bell-like triangle body + high-freq transient.
 * Pattern: beep(150ms) gap(50ms) beep(150ms) gap(50ms) beep(300ms)
 * Total ≈ 700ms.
 */
function _playWarning(ctx, volume) {
  const t = ctx.currentTime;
  const beeps = [
    { start: 0, dur: 0.15, freq: 1500 },
    { start: 0.20, dur: 0.15, freq: 1500 },
    { start: 0.40, dur: 0.30, freq: 1500 },
  ];

  for (const b of beeps) {
    // Body: bell-like triangle wave at 1500Hz
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.value = b.freq;
    bodyGain.gain.setValueAtTime(0, t + b.start);
    bodyGain.gain.linearRampToValueAtTime(volume * 0.8, t + b.start + 0.01);
    bodyGain.gain.exponentialRampToValueAtTime(0.01, t + b.start + b.dur);
    bodyOsc.connect(bodyGain).connect(ctx.destination);
    bodyOsc.start(t + b.start);
    bodyOsc.stop(t + b.start + b.dur + 0.05);

    // Attack transient: ultra-short 3500Hz square wave spike
    const attackOsc = ctx.createOscillator();
    const attackGain = ctx.createGain();
    attackOsc.type = 'square';
    attackOsc.frequency.value = 3500;
    attackGain.gain.setValueAtTime(0, t + b.start);
    attackGain.gain.linearRampToValueAtTime(volume * 0.2, t + b.start + 0.005);
    attackGain.gain.exponentialRampToValueAtTime(0.01, t + b.start + 0.03);
    attackOsc.connect(attackGain).connect(ctx.destination);
    attackOsc.start(t + b.start);
    attackOsc.stop(t + b.start + 0.04);
  }
}

/**
 * Level-up alert: ascending C6→E6→G6 fanfare with vibraphone body
 * + harmonic transient (3× frequency square spike for sparkle).
 * Total ≈ 900ms.
 */
function _playLevelUp(ctx, volume) {
  const t = ctx.currentTime;
  const notes = [
    { start: 0, dur: 0.20, freq: 1046 },      // C6
    { start: 0.20, dur: 0.20, freq: 1318 },   // E6
    { start: 0.40, dur: 0.50, freq: 1568 },   // G6
  ];

  for (const n of notes) {
    // Body: vibraphone-like triangle wave
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.value = n.freq;
    bodyGain.gain.setValueAtTime(0, t + n.start);
    bodyGain.gain.linearRampToValueAtTime(volume * 0.7, t + n.start + 0.01);
    bodyGain.gain.exponentialRampToValueAtTime(0.01, t + n.start + n.dur);
    bodyOsc.connect(bodyGain).connect(ctx.destination);
    bodyOsc.start(t + n.start);
    bodyOsc.stop(t + n.start + n.dur + 0.05);

    // Attack transient: 3× harmonic square spike (perfect 5th overtone)
    const attackOsc = ctx.createOscillator();
    const attackGain = ctx.createGain();
    attackOsc.type = 'square';
    attackOsc.frequency.value = n.freq * 3;
    attackGain.gain.setValueAtTime(0, t + n.start);
    attackGain.gain.linearRampToValueAtTime(volume * 0.15, t + n.start + 0.005);
    attackGain.gain.exponentialRampToValueAtTime(0.01, t + n.start + 0.04);
    attackOsc.connect(attackGain).connect(ctx.destination);
    attackOsc.start(t + n.start);
    attackOsc.stop(t + n.start + 0.05);
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
   * Play an alert sound via Web Audio API.
   * Uses square/sawtooth oscillators at high frequencies with repeated
   * beep patterns to cut through background music (Spotify etc.).
   * @param {'warning'|'levelUp'} type
   * @param {string} [presetKey]  Override preset; defaults to selectedPreset
   */
  function playSound(type, presetKey) {
    const key = presetKey || selectedPreset.value;
    const preset = VOLUME_PRESETS[key] || VOLUME_PRESETS.medium;
    const volume = type === 'warning' ? preset.warning : preset.levelUp;
    try {
      const ctx = _getCtx();
      if (ctx.state !== 'running') {
        ctx.resume().catch(() => {});
      }
      if (type === 'warning') {
        _playWarning(ctx, volume);
      } else if (type === 'levelUp') {
        _playLevelUp(ctx, volume);
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
    // 連續播 levelUp 讓這兩個聲音都能讓使用者清楚聽到測試
    setTimeout(() => {
      playSound('levelUp', presetKey);
    }, 800);
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
