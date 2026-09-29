// Timed games (限時賽) that borrow a tournament blind structure.
//
// A timed game is a cash-ledger game (type 'live', settled stack − buy-in)
// linked to a tournamentSessions clock whose config.mode is 'timed'. The clock
// shows blinds / ante exactly like a tournament, with two differences:
//   - when the last level runs out the game is over (a tournament instead
//     repeats its last level until there is a champion);
//   - the structure's re-entry cutoff (reentryUntilLevel, 截買) closes buy-ins.
//
// Pure functions only — shared by the clock composable, the game store's
// buy-in guard (inside a Firestore transaction) and the tests.

import { DEFAULT_TOURNAMENT_LEVEL_DURATION } from './constants.js';

export const CLOCK_MODE_TIMED = 'timed';

/** Error message the game store throws when a timed game refuses a buy-in. */
export const BUY_IN_CLOSED = 'BUY_IN_CLOSED';

/** Is this tournamentSessions config a timed-game clock? */
export function isTimedClock(config) {
  return config?.mode === CLOCK_MODE_TIMED;
}

/** Level length in whole seconds (missing/invalid duration → default). */
export function levelDurationSeconds(levels = [], index = 0) {
  const minutes = levels[index]?.duration || DEFAULT_TOURNAMENT_LEVEL_DURATION;
  return Math.max(1, Math.floor(Number(minutes) * 60));
}

function clampIndex(levels, index) {
  const maxIdx = Math.max(0, levels.length - 1);
  const parsed = Number.isFinite(Number(index)) ? Math.floor(Number(index)) : 0;
  return Math.min(Math.max(0, parsed), maxIdx);
}

function toMillis(value, fallback) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number') return value;
  return fallback;
}

/**
 * Where the clock is right now, derived from the last persisted state.
 *
 * Only the host advances the stored level, so a viewer (or the host coming
 * back from the background) has to project forward from lastTickAt.
 *
 * @param {Array} levels - config.levels
 * @param {object} state - session state (status, currentLevelIndex, timeLeftSeconds, lastTickAt)
 * @param {number} nowMs
 * @param {{timed?: boolean}} [opts] - timed: stop at the end of the last level
 *   instead of repeating it
 * @returns {{levelIndex: number, timeLeftSeconds: number, ended: boolean}}
 */
export function resolveClockPosition(levels = [], state = {}, nowMs = Date.now(), { timed = false } = {}) {
  const storedIndex = clampIndex(levels, state.currentLevelIndex ?? 0);
  const storedLeft = Math.max(0, Math.floor(Number(state.timeLeftSeconds ?? 0)));

  if (state.status !== 'running' || !state.lastTickAt) {
    return { levelIndex: storedIndex, timeLeftSeconds: storedLeft, ended: state.status === 'ended' };
  }

  const totalLevels = levels.length;
  const seedTimeLeft = storedLeft > 0 ? storedLeft : levelDurationSeconds(levels, storedIndex);
  const lastTickMs = toMillis(state.lastTickAt, nowMs);
  const elapsed = Math.max(0, Math.floor((nowMs - lastTickMs) / 1000));

  if (elapsed < seedTimeLeft) {
    return { levelIndex: storedIndex, timeLeftSeconds: seedTimeLeft - elapsed, ended: false };
  }

  let overshoot = elapsed - seedTimeLeft;

  // No level definition: keep cycling with the default duration.
  if (totalLevels === 0) {
    const cycle = levelDurationSeconds(levels, 0);
    return { levelIndex: 0, timeLeftSeconds: cycle - (overshoot % cycle), ended: false };
  }

  for (let idx = storedIndex + 1; idx < totalLevels; idx += 1) {
    const duration = levelDurationSeconds(levels, idx);
    if (overshoot < duration) {
      return { levelIndex: idx, timeLeftSeconds: duration - overshoot, ended: false };
    }
    overshoot -= duration;
  }

  const lastIdx = totalLevels - 1;
  if (timed) {
    // Timed game: the structure's total length is the game's length.
    return { levelIndex: lastIdx, timeLeftSeconds: 0, ended: true };
  }

  // Tournament: repeat the last level until there is a champion.
  const lastDuration = levelDurationSeconds(levels, lastIdx);
  return { levelIndex: lastIdx, timeLeftSeconds: lastDuration - (overshoot % lastDuration), ended: false };
}

/**
 * The last played (non-break) level at or before `index` — during a break the
 * level just finished still counts. 0 when nothing has been played yet.
 */
export function effectiveLevelAt(levels = [], index = 0) {
  if (!levels.length) return 0;
  for (let i = clampIndex(levels, index); i >= 0; i -= 1) {
    if (!levels[i]?.isBreak) return levels[i]?.level ?? 0;
  }
  return 0;
}

/**
 * Seconds until a timed game ends: what's left of the current level plus
 * every level after it (breaks included — they're part of the schedule).
 */
export function secondsToEnd(levels = [], levelIndex = 0, timeLeftSeconds = 0) {
  let total = Math.max(0, Math.floor(Number(timeLeftSeconds) || 0));
  for (let i = clampIndex(levels, levelIndex) + 1; i < levels.length; i += 1) {
    total += levelDurationSeconds(levels, i);
  }
  return total;
}

/** Total scheduled length of a structure, breaks included. */
export function totalStructureSeconds(levels = []) {
  return levels.length ? secondsToEnd(levels, 0, levelDurationSeconds(levels, 0)) : 0;
}

/**
 * Are buy-ins closed for a timed game?
 * Closed once the game is over, or once the effective level reaches the
 * structure's cutoff (reentryUntilLevel; ≤ 0 means no cutoff) — the same
 * `>=` comparison tournaments use for re-entry.
 *
 * @param {object} sessionData - tournamentSessions doc ({config, state})
 * @param {number} [nowMs]
 */
export function isTimedBuyInClosed(sessionData = {}, nowMs = Date.now()) {
  const config = sessionData.config || {};
  const state = sessionData.state || {};
  const levels = config.levels || [];
  const pos = resolveClockPosition(levels, state, nowMs, { timed: true });
  if (pos.ended) return true;

  const cutoff = Number(config.reentryUntilLevel) || 0;
  if (cutoff <= 0) return false;
  return effectiveLevelAt(levels, pos.levelIndex) >= cutoff;
}

/** h:mm:ss when an hour or more is left, otherwise mm:ss. */
export function formatDuration(totalSeconds = 0) {
  const t = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}

/**
 * Snapshot a tournament preset / built-in template as the structure a timed
 * preset carries. Only what the clock needs; payouts / re-entry counts /
 * starting stack are tournament-only. A snapshot (not a reference) so later
 * edits to the structure don't change presets or games already using it.
 *
 * @param {object} source - tournament preset or template
 * @param {string} name - display name (built-ins resolve their nameKey first)
 */
export function snapshotStructure(source, name) {
  if (!source) return null;
  return {
    sourceId: source.id || null,
    name: name || source.name || '',
    levels: (source.levels || []).map((l) => ({ ...l })),
    reentryUntilLevel: Number(source.reentryUntilLevel) || 0,
  };
}

/**
 * Apply the timed preset's own cutoff choice to a structure snapshot.
 *
 * The structure's reentryUntilLevel can't express "no cutoff" for timed games
 * — for tournaments 0 means "no re-entry at all", and templates always carry
 * one — so the preset decides: noCutoff drops it (0 = only time-up closes
 * buy-ins); otherwise the structure's own level applies. sourceCutoff keeps
 * the structure's level so the choice can be flipped back later.
 *
 * @param {object|null} snapshot - from snapshotStructure (or a stored one)
 * @param {boolean} noCutoff
 */
export function withTimedCutoff(snapshot, noCutoff) {
  if (!snapshot) return null;
  const sourceCutoff = Number(snapshot.sourceCutoff ?? snapshot.reentryUntilLevel) || 0;
  return {
    ...snapshot,
    sourceCutoff,
    noCutoff: Boolean(noCutoff),
    reentryUntilLevel: noCutoff ? 0 : sourceCutoff,
  };
}

/**
 * useTournamentClock().createSession() config for a timed game.
 * @param {{name: string, buyIn: number, structure: object}} params
 */
export function buildTimedClockConfig({ name, buyIn, structure }) {
  return {
    mode: CLOCK_MODE_TIMED,
    name: name || structure?.name || '',
    subtitle: '',
    buyIn: Number(buyIn) || 0,
    reentryUntilLevel: Number(structure?.reentryUntilLevel) || 0,
    maxReentries: 0,
    levels: structure?.levels || [],
    payoutRatios: [],
  };
}
