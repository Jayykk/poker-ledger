// 本月王座 (monthly crowns): who holds which crown, and how the stored crowns
// move from month to month.
//
// NO firebase imports here on purpose: shared by
//   - functions/src/handlers/monthlyCrowns.js  (after each completed game)
//   - functions/scripts/backfill_leaderboard_stats.js (through the handler)
//   - src/utils/titles.js (re-exported: 王座 section, display expiry)
//   - tests/crownRules.test.js
//
// A crown is judged on the month's leaderboardStats doc ({ total, cash,
// tournament }, leaderboardStatsMath.js) inside the user's 牌友圈 (palsMath.js):
// U holds crown C for month M when U's month-M metric meets C's minimum and
// no pal has a strictly greater one. Ties share the crown (all tied leaders
// hold it). Each user is judged in their own circle, so two circles can each
// have their own holder.
//
// Stored on userTitles/{uid} (server-written):
//   crowns        { [crownId]: monthKey }   held; active only while monthKey
//                                           is the current month (Asia/Taipei)
//   crownHistory  { [crownId]: [monthKey] } months the crown was still held
//                                           when the month ended (ascending)
// No scheduler: a crown dated an older month is that month's final holder, and
// the next evaluation moves it into crownHistory (applyCrownMonth).

import { groupsStdDev, periodKeysForMillis } from './leaderboardStatsMath.js';

const num = (value) => Number(value) || 0;
const round4 = (n) => Math.round(n * 10000) / 10000;

// 本月老闆 needs this many games with a 組 size in the month
export const CROWN_MIN_GROUP_GAMES = 4;

// Fixed order: also the order auto display picks from when several are held
export const CROWN_DEFS = Object.freeze([
  // Most knockouts this month, at least 2
  Object.freeze({
    id: 'crownHunter',
    unit: 'knockouts',
    min: 2,
    metric: (s) => num(s?.tournament?.knockouts),
    qualifies: (v) => v >= 2,
  }),
  // Highest σ of the per-game 組 result, from 4 games with a 組 size
  Object.freeze({
    id: 'crownBoss',
    unit: 'sigma',
    min: CROWN_MIN_GROUP_GAMES,
    metric: (s) => (num(s?.total?.groupGames) >= CROWN_MIN_GROUP_GAMES
      ? round4(groupsStdDev(s.total))
      : null),
    qualifies: (v) => v > 0,
  }),
  // Highest net profit, above 0
  Object.freeze({
    id: 'crownProfit',
    unit: 'money',
    min: 0,
    metric: (s) => num(s?.total?.profit),
    qualifies: (v) => v > 0,
  }),
  // Biggest net loss (as a positive amount), a real loss
  Object.freeze({
    id: 'crownLoss',
    unit: 'money',
    min: 0,
    metric: (s) => -num(s?.total?.profit),
    qualifies: (v) => v > 0,
  }),
  // Most games, at least 3
  Object.freeze({
    id: 'crownRegular',
    unit: 'games',
    min: 3,
    metric: (s) => num(s?.total?.games),
    qualifies: (v) => v >= 3,
  }),
]);

export const CROWN_IDS = Object.freeze(CROWN_DEFS.map((c) => c.id));
const CROWN_BY_ID = new Map(CROWN_DEFS.map((c) => [c.id, c]));

/**
 * @param {string} id Crown id.
 * @return {?object} Crown definition.
 */
export function getCrown(id) {
  return CROWN_BY_ID.get(id) || null;
}

/**
 * @param {?string} id Family / crown id.
 * @return {boolean}
 */
export function isCrownId(id) {
  return CROWN_BY_ID.has(id);
}

/**
 * Month key ('2026-10') a timestamp belongs to, Asia/Taipei: the same key as
 * the leaderboardStats month docs.
 *
 * @param {number} ms Unix millis.
 * @return {string}
 */
export function crownMonthOf(ms) {
  return periodKeysForMillis(ms).month;
}

/**
 * A user's value for a crown from their month stats; null when it can't be
 * judged (no stats, a hidden account, 老闆 below its game count).
 *
 * @param {string} id Crown id.
 * @param {?object} monthStats leaderboardStats month doc.
 * @return {?number}
 */
export function crownValue(id, monthStats) {
  const crown = getCrown(id);
  if (!crown || !monthStats || monthStats.hidden) return null;
  return crown.metric(monthStats);
}

/**
 * Does a value meet the crown's minimum?
 *
 * @param {string} id Crown id.
 * @param {?number} value crownValue().
 * @return {boolean}
 */
export function crownQualifies(id, value) {
  const crown = getCrown(id);
  return !!crown && value != null && crown.qualifies(value);
}

/**
 * Crowns a user holds for a month: meets the minimum and no pal is strictly
 * greater (ties share).
 *
 * @param {?object} ownStats The user's month stats.
 * @param {Array<?object>} palStats Month stats of each pal (null: no games).
 * @return {Array<string>} Crown ids held, in CROWN_IDS order.
 */
export function heldCrowns(ownStats, palStats) {
  const held = [];
  for (const id of CROWN_IDS) {
    const mine = crownValue(id, ownStats);
    if (!crownQualifies(id, mine)) continue;
    const beaten = (palStats || []).some((stats) => {
      const theirs = crownValue(id, stats);
      return theirs != null && theirs > mine;
    });
    if (!beaten) held.push(id);
  }
  return held;
}

/**
 * The crown's leaders inside a circle (the 王座 section): every member at the
 * top value, when it meets the minimum.
 *
 * @param {string} id Crown id.
 * @param {Array<{uid: string, stats: ?object}>} members Circle members.
 * @return {{holders: Array<string>, value: ?number}}
 */
export function crownLeaders(id, members) {
  let best = null;
  let holders = [];
  for (const { uid, stats } of members || []) {
    const value = crownValue(id, stats);
    if (!crownQualifies(id, value)) continue;
    if (best == null || value > best) {
      best = value;
      holders = [uid];
    } else if (value === best) {
      holders.push(uid);
    }
  }
  return { holders, value: best };
}

/**
 * Active crowns: the ones dated the given month, in CROWN_IDS order.
 *
 * @param {?Object<string, string>} crowns Stored crowns map.
 * @param {string} month Current month key.
 * @return {Array<string>}
 */
export function activeCrowns(crowns, month) {
  if (!crowns || !month) return [];
  return CROWN_IDS.filter((id) => crowns[id] === month);
}

/**
 * @param {?Array<string>} list Month keys.
 * @param {string} month Month key.
 * @return {Array<string>} Sorted, without duplicates.
 */
function withMonth(list, month) {
  return [...new Set([...(list || []), month])].sort();
}

/**
 * Apply one month's verdict to the stored crowns (lazy finalisation).
 *
 * Current month M (month >= currentMonth):
 *   held      crowns[C] = M; an older stored month is final → history first
 *   not held  crowns[C] === M → removed (lost during the month); an older
 *             stored month → moved to history, removed
 * Past month (a correction to an older game): the month is over, so its
 * verdict goes straight to history (added or removed), and a stored crown
 * dated that month is moved out of `crowns`.
 *
 * @param {?{crowns: ?object, crownHistory: ?object}} stored userTitles doc.
 * @param {string} month Month judged.
 * @param {string} currentMonth Current month key.
 * @param {Array<string>} held heldCrowns() for that month.
 * @return {{crowns: object, crownHistory: object, changed: boolean,
 *   gained: Array<string>, lost: Array<string>}}
 */
export function applyCrownMonth(stored, month, currentMonth, held) {
  const crowns = { ...(stored?.crowns || {}) };
  const crownHistory = {};
  for (const [id, months] of Object.entries(stored?.crownHistory || {})) {
    if (Array.isArray(months)) crownHistory[id] = [...months];
  }
  const holds = new Set(held || []);
  const gained = [];
  const lost = [];
  const past = month < currentMonth;

  for (const id of CROWN_IDS) {
    const prev = typeof crowns[id] === 'string' ? crowns[id] : null;
    if (past) {
      if (holds.has(id)) {
        crownHistory[id] = withMonth(crownHistory[id], month);
      } else if (crownHistory[id]?.includes(month)) {
        crownHistory[id] = crownHistory[id].filter((m) => m !== month);
      }
      if (prev === month) delete crowns[id];
      continue;
    }
    // A stored month newer than the one judged: leave it alone
    if (prev && prev > month) continue;
    if (prev && prev < month) {
      crownHistory[id] = withMonth(crownHistory[id], prev);
      delete crowns[id];
    }
    if (holds.has(id)) {
      if (prev !== month) gained.push(id);
      crowns[id] = month;
    } else if (prev === month) {
      delete crowns[id];
      lost.push(id);
    }
  }
  for (const id of Object.keys(crownHistory)) {
    if (!crownHistory[id].length) delete crownHistory[id];
  }

  const changed = !sameCrowns(stored?.crowns, crowns)
    || !sameCrownHistory(stored?.crownHistory, crownHistory);
  return { crowns, crownHistory, changed, gained, lost };
}

/**
 * @param {?object} a Crowns map.
 * @param {?object} b Crowns map.
 * @return {boolean}
 */
export function sameCrowns(a, b) {
  const ka = Object.keys(a || {});
  const kb = Object.keys(b || {});
  return ka.length === kb.length && ka.every((id) => a[id] === b?.[id]);
}

/**
 * @param {?object} a crownHistory map.
 * @param {?object} b crownHistory map.
 * @return {boolean}
 */
export function sameCrownHistory(a, b) {
  const clean = (map) => Object.entries(map || {})
    .filter(([, months]) => Array.isArray(months) && months.length);
  const ea = clean(a);
  const eb = new Map(clean(b));
  return ea.length === eb.size
    && ea.every(([id, months]) => (eb.get(id) || []).join(',') === months.join(','));
}

/**
 * Crowns + history rebuilt from scratch (backfill --crown-history): every
 * past month a crown was held goes to history, the current month's holds are
 * the crowns.
 *
 * @param {Object<string, Array<string>>} heldByMonth monthKey → crown ids held.
 * @param {string} currentMonth Current month key.
 * @return {{crowns: object, crownHistory: object}}
 */
export function crownStateFromScratch(heldByMonth, currentMonth) {
  const crowns = {};
  const crownHistory = {};
  for (const month of Object.keys(heldByMonth || {}).sort()) {
    if (month > currentMonth) continue;
    for (const id of heldByMonth[month] || []) {
      if (!isCrownId(id)) continue;
      if (month === currentMonth) crowns[id] = month;
      else crownHistory[id] = withMonth(crownHistory[id], month);
    }
  }
  return { crowns, crownHistory };
}
