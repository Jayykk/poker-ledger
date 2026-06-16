/**
 * Poker Sound composable
 * Subtle Web Audio cues for the live poker table: chip clicks, card flips,
 * fold/check, all-in sweep, your-turn alert, showdown/win chimes — plus a short
 * haptic buzz when it becomes your turn.
 *
 * Replaces the previous no-op `playSound` (sounds never actually played). Uses
 * the SAME shared AudioContext as the tournament clock (one iOS unlock for the
 * whole app) via getAudioContext()/unlockAudio() from useTournamentAudio.
 *
 * Everything is wrapped so a missing AudioContext (jsdom / unsupported browser)
 * degrades to a silent no-op rather than throwing.
 */

import { ref } from 'vue';
import { getAudioContext, unlockAudio } from './useTournamentAudio.js';

const MUTE_KEY = 'poker_sound_muted';

// Singleton mute state shared across all usePokerSound() callers.
const _storedMuted = (typeof localStorage !== 'undefined' &&
  localStorage.getItem(MUTE_KEY) === '1');
const muted = ref(!!_storedMuted);

/**
 * Schedule one tone on the audio graph.
 * @param {AudioContext} ctx
 * @param {Object} tone - { freq, type, start, dur, gain, sweepTo }
 */
function scheduleTone(ctx, tone) {
  const t0 = ctx.currentTime + (tone.start || 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = tone.type || 'sine';
  osc.frequency.setValueAtTime(tone.freq, t0);
  if (tone.sweepTo) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, tone.sweepTo), t0 + tone.dur);
  }
  const peak = tone.gain ?? 0.06;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + tone.dur + 0.02);
}

// Each sound is a small list of tones (kept subtle — gains well below the
// piercing tournament alerts so it doesn't fatigue during a long session).
const SOUND_TONES = {
  // Chip-ish click for call/raise/bet
  call: [{ freq: 900, type: 'square', dur: 0.05, gain: 0.05 }, { freq: 1300, type: 'square', start: 0.04, dur: 0.05, gain: 0.04 }],
  raise: [{ freq: 700, type: 'square', dur: 0.05, gain: 0.05 }, { freq: 1100, type: 'square', start: 0.05, dur: 0.06, gain: 0.05 }],
  bet: [{ freq: 900, type: 'square', dur: 0.05, gain: 0.05 }, { freq: 1300, type: 'square', start: 0.04, dur: 0.05, gain: 0.04 }],
  // Soft low knock for check
  check: [{ freq: 220, type: 'triangle', dur: 0.09, gain: 0.06 }],
  // Gentle descending blip for fold
  fold: [{ freq: 320, type: 'triangle', dur: 0.14, gain: 0.05, sweepTo: 150 }],
  // Crisp tick for a single board card
  card: [{ freq: 1000, type: 'square', dur: 0.035, gain: 0.04 }],
  // Quick riffle for the deal
  deal: [
    { freq: 800, type: 'square', dur: 0.03, gain: 0.035 },
    { freq: 950, type: 'square', start: 0.05, dur: 0.03, gain: 0.035 },
    { freq: 1100, type: 'square', start: 0.10, dur: 0.03, gain: 0.035 },
  ],
  // Three quick ticks for the flop
  flop: [
    { freq: 1000, type: 'square', dur: 0.03, gain: 0.04 },
    { freq: 1000, type: 'square', start: 0.07, dur: 0.03, gain: 0.04 },
    { freq: 1000, type: 'square', start: 0.14, dur: 0.03, gain: 0.04 },
  ],
  // Rising sweep for all-in
  allin: [{ freq: 400, type: 'sawtooth', dur: 0.32, gain: 0.06, sweepTo: 1200 }],
  // Pleasant double-beep when it's YOUR turn
  turn: [
    { freq: 880, type: 'sine', dur: 0.12, gain: 0.07 },
    { freq: 1175, type: 'sine', start: 0.16, dur: 0.16, gain: 0.07 },
  ],
  // Soft chime at showdown
  showdown: [
    { freq: 660, type: 'sine', dur: 0.18, gain: 0.06 },
    { freq: 990, type: 'sine', start: 0.16, dur: 0.24, gain: 0.06 },
  ],
  // Little ascending fanfare for a win
  win: [
    { freq: 1046, type: 'triangle', dur: 0.14, gain: 0.07 },
    { freq: 1318, type: 'triangle', start: 0.13, dur: 0.14, gain: 0.07 },
    { freq: 1568, type: 'triangle', start: 0.26, dur: 0.28, gain: 0.08 },
  ],
};

export function usePokerSound() {
  const setMuted = (value) => {
    muted.value = !!value;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MUTE_KEY, muted.value ? '1' : '0');
    }
  };

  const toggleMuted = () => setMuted(!muted.value);

  /**
   * Play a named poker sound. No-ops when muted or when Web Audio is
   * unavailable. Safe to call from anywhere (never throws).
   * @param {string} name - key of SOUND_TONES
   */
  const playPokerSound = (name) => {
    if (muted.value) return;
    const tones = SOUND_TONES[name];
    if (!tones) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      for (const tone of tones) scheduleTone(ctx, tone);
    } catch {
      // Audio unavailable — stay silent.
    }
  };

  /**
   * Short haptic buzz (Android/Chrome; iOS Safari silently ignores).
   * @param {number|number[]} [pattern]
   */
  const vibrate = (pattern = 30) => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // ignore
    }
  };

  /** "It's your turn" cue: sound + a double haptic buzz. */
  const notifyMyTurn = () => {
    playPokerSound('turn');
    vibrate([40, 60, 40]);
  };

  return {
    muted,
    setMuted,
    toggleMuted,
    unlock: unlockAudio, // call on a user gesture to satisfy iOS autoplay rules
    playPokerSound,
    vibrate,
    notifyMyTurn,
  };
}
