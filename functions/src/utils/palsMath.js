// 牌友圈 (pals): who a user plays with regularly.
//
// NO firebase imports here on purpose: shared by
//   - functions/src/handlers/leaderboardStats.js (from the history it reads)
//   - functions/src/handlers/userTitles.js       (hidden-account filter)
//   - tests/palsMath.test.js
//
// A pal is another account in at least PALS_MIN_GAMES of the user's games that
// finished in the last PALS_WINDOW_MONTHS months (completedAt, falling back to
// createdAt). Guests (no odId), the user themself and hidden accounts
// (anonymous / nameless, the leaderboard's rule) are left out. Symmetric by
// construction: a shared game sits in both players' history.

import { recordMillis } from './leaderboardStatsMath.js';

export const PALS_WINDOW_MONTHS = 6;
export const PALS_MIN_GAMES = 2;

/**
 * Anonymous or nameless accounts never rank on the leaderboard and are never
 * anyone's pal.
 *
 * @param {?object} userData users/{uid} data (null: no such user).
 * @return {boolean}
 */
export function isHiddenAccount(userData) {
  if (!userData) return true;
  const name = userData.name || userData.displayName || '';
  return !!userData.isAnonymous || !name;
}

/**
 * Start of the window: the same moment PALS_WINDOW_MONTHS calendar months ago.
 *
 * @param {number} now Unix millis.
 * @return {number}
 */
export function palsWindowStart(now) {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - PALS_WINDOW_MONTHS);
  return d.getTime();
}

/**
 * When a game finished: completedAt, else createdAt.
 *
 * @param {object} record history_sub record.
 * @return {number} Unix millis, 0 when undatable.
 */
function finishedMillis(record) {
  return recordMillis({ createdAt: record?.completedAt })
    || recordMillis({ createdAt: record?.createdAt });
}

/**
 * Accounts that shared at least PALS_MIN_GAMES games with the user in the
 * window, before the hidden-account check (that needs their users docs).
 *
 * @param {string} uid The user.
 * @param {Array<object>} records The user's history_sub records.
 * @param {number} now Unix millis.
 * @return {Array<string>} Sorted uids.
 */
export function palCandidates(uid, records, now) {
  const since = palsWindowStart(now);
  const counts = new Map();
  for (const record of records || []) {
    const ms = finishedMillis(record);
    if (!ms || ms < since || ms > now) continue;
    const rows = Array.isArray(record.settlement) ? record.settlement : [];
    const others = new Set(rows.map((row) => row?.odId).filter((id) => typeof id === 'string' && id && id !== uid));
    for (const other of others) counts.set(other, (counts.get(other) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, games]) => games >= PALS_MIN_GAMES)
    .map(([other]) => other)
    .sort();
}

/**
 * Pals from candidates: hidden accounts out. `hiddenOf(uid)` returns true /
 * false, or undefined when unknown (then the account stays a pal only if it
 * already was one: someone does not turn anonymous or nameless).
 *
 * @param {Array<string>} candidates palCandidates().
 * @param {function(string): (boolean|undefined)} hiddenOf Hidden check.
 * @param {?Array<string>} [previous] Stored pals.
 * @return {Array<string>} Sorted uids.
 */
export function filterPals(candidates, hiddenOf, previous = null) {
  const known = new Set(previous || []);
  return (candidates || [])
    .filter((other) => {
      const hidden = hiddenOf(other);
      return hidden === undefined ? known.has(other) : !hidden;
    })
    .sort();
}

/**
 * @param {?Array<string>} a Pals list.
 * @param {?Array<string>} b Pals list.
 * @return {boolean}
 */
export function samePals(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
