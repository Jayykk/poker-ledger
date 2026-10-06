// 稱號 (titles): the catalog and the pure rules around it.
//
// NO firebase imports here on purpose: this module is shared by
//   - functions/src/handlers/userTitles.js   (recompute after each game, setTitlePrefs)
//   - functions/scripts/backfill_leaderboard_stats.js (through the handler)
//   - src/utils/titles.js                     (badge names, 稱號圖鑑 progress)
//   - tests/titleRules.test.js
//
// A title family is one achievement with up to four steps. Its tier is the
// rarity of the highest step reached: 1 common (gray), 2 rare (blue),
// 3 epic (purple), 4 legendary (gold). Families with fewer steps start higher
// (e.g. 神秘賞金頭獎 goes 2 → 3 → 4) so the hardest step is always the rarest.
//
// Families read the user's all-time leaderboardStats doc ({ total, cash,
// tournament } buckets, see leaderboardStatsMath.js). Thresholds are plain
// numbers in the catalog below; tune them there.
//
// Stored per user in userTitles/{uid} (server-written only):
//   unlocked  { [familyId]: { tier, at } }  only ever goes up; `at` = when the
//             current tier was first reached (millis)
//   prefs     { mode: 'off'|'auto'|'pick', titleId, showRoomTitles }
//   display   { familyId, tier } | null    what other players see
//
// Hooks for later phases (not implemented yet):
//   - source 'crown'  monthly #1 among 牌友圈 (time-limited, written by a
//                     scheduled job into `unlocked` with an expiry)
//   - source 'room'   live in-room titles (prefs.showRoomTitles already stored)
//   - source 'hand'   hand-history titles; 'event' one-off titles such as
//                     復仇者 / 悲劇英雄
//   - avatar frames   a `frame` next to `display`, unlocked by legendary tiers
// evaluateTitles() only evaluates source 'stats'; resolveDisplay() accepts any
// unlocked family so later sources can plug into the same doc.

import { groupsStdDev } from './leaderboardStatsMath.js';

export const TITLE_GROUPS = Object.freeze(['wallet', 'hunter', 'tournament', 'attendance']);

export const TITLE_SOURCES = Object.freeze({
  STATS: 'stats',
  CROWN: 'crown',
  ROOM: 'room',
  HAND: 'hand',
  EVENT: 'event',
});

export const TITLE_MODES = Object.freeze(['off', 'auto', 'pick']);

export const DEFAULT_TITLE_PREFS = Object.freeze({
  mode: 'auto',
  titleId: null,
  showRoomTitles: true,
});

// σ (volatility / steadiness) needs this many games with a known 組 size
export const TITLE_MIN_GROUP_GAMES = 10;
// 穩健: σ of the per-game result (組) at most this
export const STEADY_MAX_STDDEV = 1;

const num = (value) => Number(value) || 0;
const total = (stats) => stats?.total || {};
const tour = (stats) => stats?.tournament || {};
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * σ of the per-game result in 組, or null below TITLE_MIN_GROUP_GAMES.
 *
 * @param {?object} stats All-time stats.
 * @return {?number}
 */
function stdDevOf(stats) {
  const bucket = total(stats);
  if (num(bucket.groupGames) < TITLE_MIN_GROUP_GAMES) return null;
  return groupsStdDev(bucket);
}

/**
 * Build a family. `thresholds[i]` unlocks tier `tiers[i]`.
 *
 * @param {string} id Family id (stable: stored in userTitles docs).
 * @param {string} group One of TITLE_GROUPS.
 * @param {function(object): number} metric all-time stats → value.
 * @param {Array<number>} thresholds Ascending thresholds.
 * @param {object} [options] { tiers: rarity per threshold, hidden }.
 * @return {object} Family definition.
 */
function family(id, group, metric, thresholds, { tiers, hidden = false } = {}) {
  const rarities = tiers || [1, 2, 3, 4].slice(4 - thresholds.length);
  return Object.freeze({
    id,
    group,
    hidden,
    source: TITLE_SOURCES.STATS,
    metric,
    descKey: `titles.families.${id}.desc`,
    hintKey: hidden ? `titles.families.${id}.hint` : null,
    tiers: Object.freeze(thresholds.map((threshold, i) => Object.freeze({
      tier: rarities[i],
      threshold,
      nameKey: `titles.families.${id}.t${rarities[i]}`,
    }))),
  });
}

export const TITLE_FAMILIES = Object.freeze([
  // ── 錢包 ────────────────────────────────────────────────────────
  // Money in the leaderboard's unit (cash: profitCash, or chips / rate).
  // Set for a one-group buy-in of 600 after a year where the top winner sat
  // at +12K and the top loser at -20K: tier 3 is where the leaders are now,
  // tier 4 another year or so of that at 600.
  family('netWin', 'wallet', (s) => Math.max(0, num(total(s).profit)), [2000, 5000, 10000, 30000]),
  family('netLoss', 'wallet', (s) => Math.max(0, -num(total(s).profit)), [2000, 5000, 15000, 40000]),
  family('bigWin', 'wallet', (s) => num(total(s).maxWinGroups), [3, 5, 8, 12]),
  family('bigLoss', 'wallet', (s) => num(total(s).maxLossGroups), [3, 5, 8, 12]),
  family('volatile', 'wallet', (s) => {
    const sd = stdDevOf(s);
    return sd == null ? 0 : round2(sd);
  }, [1.5, 2.5, 4, 6]),
  family('steady', 'wallet', (s) => {
    const sd = stdDevOf(s);
    const ok = sd != null && sd <= STEADY_MAX_STDDEV && num(total(s).profit) > 0;
    return ok ? num(total(s).games) : 0;
  }, [10, 20, 40, 80]),

  // ── 獵頭 ────────────────────────────────────────────────────────
  family('hunter', 'hunter', (s) => num(tour(s).knockouts), [5, 20, 50, 120]),
  family('hunted', 'hunter', (s) => num(tour(s).knockedOut), [5, 20, 50, 120]),
  family('mysteryTop', 'hunter', (s) => num(tour(s).topDraws), [1, 3, 10]),

  // ── 錦標賽 ──────────────────────────────────────────────────────
  family('champion', 'tournament', (s) => num(tour(s).champion), [1, 3, 6, 12]),
  family('itm', 'tournament', (s) => num(tour(s).itm), [3, 10, 25, 50]),
  family('phoenix', 'tournament', (s) => num(tour(s).maxRebuyItm), [2, 4, 6]),
  family('rebuyer', 'tournament', (s) => num(tour(s).rebuyCount), [10, 30, 100], { tiers: [1, 2, 3] }),
  family('runnerUp', 'tournament', (s) => num(tour(s).runnerUp), [5], { tiers: [3], hidden: true }),
  family('bubble', 'tournament', (s) => num(tour(s).bubble), [3], { tiers: [3], hidden: true }),
  family('firstOut', 'tournament', (s) => num(tour(s).firstOut), [5], { tiers: [3], hidden: true }),

  // ── 出席 ────────────────────────────────────────────────────────
  family('regular', 'attendance', (s) => num(total(s).games), [10, 30, 60, 120]),
  family('host', 'attendance', (s) => num(total(s).hostedGames), [5, 15, 30, 60]),
  family('hotStreak', 'attendance', (s) => num(total(s).winStreakBest), [3, 5, 8]),
  family('coldStreak', 'attendance', (s) => num(total(s).lossStreakBest), [3, 5, 8]),
  family('nightOwl', 'attendance', (s) => num(total(s).nightGames), [10], { tiers: [3], hidden: true }),
]);

const FAMILY_BY_ID = new Map(TITLE_FAMILIES.map((f) => [f.id, f]));

/**
 * @param {string} id Family id.
 * @return {?object} Family definition.
 */
export function getTitleFamily(id) {
  return FAMILY_BY_ID.get(id) || null;
}

/**
 * Tier step of a family by tier number.
 *
 * @param {object|string} familyOrId Family or its id.
 * @param {number} tier Tier.
 * @return {?object} `{ tier, threshold, nameKey }`.
 */
export function titleTierOf(familyOrId, tier) {
  const fam = typeof familyOrId === 'string' ? getTitleFamily(familyOrId) : familyOrId;
  return fam?.tiers.find((step) => step.tier === tier) || null;
}

/**
 * Highest tier a value reaches in a family (0 = none).
 *
 * @param {object} fam Family.
 * @param {number} value Metric value.
 * @return {number}
 */
function tierForValue(fam, value) {
  let reached = 0;
  for (const step of fam.tiers) {
    if (value >= step.threshold) reached = step.tier;
  }
  return reached;
}

/**
 * Every stats-based title the all-time stats reach right now.
 *
 * @param {?object} allTimeStats leaderboardStats `all` doc ({ total, cash, tournament }).
 * @return {Object<string, number>} familyId → tier (families with no tier left out).
 */
export function evaluateTitles(allTimeStats) {
  const result = {};
  if (!allTimeStats) return result;
  for (const fam of TITLE_FAMILIES) {
    if (fam.source !== TITLE_SOURCES.STATS) continue;
    const tier = tierForValue(fam, num(fam.metric(allTimeStats)));
    if (tier > 0) result[fam.id] = tier;
  }
  return result;
}

/**
 * Progress towards a family's next tier.
 *
 * @param {object|string} familyOrId Family or its id.
 * @param {?object} allTimeStats leaderboardStats `all` doc.
 * @param {number} [unlockedTier=0] Tier already unlocked (titles never go
 *   down, so the next goal starts above it even if the value dropped).
 * @return {?{familyId: string, value: number, tier: number,
 *   next: ?{tier: number, threshold: number, nameKey: string},
 *   from: number, ratio: number, maxed: boolean}}
 */
export function nextTierProgress(familyOrId, allTimeStats, unlockedTier = 0) {
  const fam = typeof familyOrId === 'string' ? getTitleFamily(familyOrId) : familyOrId;
  if (!fam) return null;
  const value = allTimeStats ? num(fam.metric(allTimeStats)) : 0;
  const tier = Math.max(num(unlockedTier), tierForValue(fam, value));
  const next = fam.tiers.find((step) => step.tier > tier) || null;
  if (!next) {
    return { familyId: fam.id, value, tier, next: null, from: 0, ratio: 1, maxed: true };
  }
  const prev = fam.tiers.filter((step) => step.tier <= tier).pop();
  const from = prev ? prev.threshold : 0;
  const span = next.threshold - from;
  const ratio = span > 0 ? Math.min(1, Math.max(0, (value - from) / span)) : 0;
  return { familyId: fam.id, value, tier, next, from, ratio, maxed: false };
}

/**
 * Merge freshly evaluated tiers into the stored unlocked map. Tiers only go
 * up; `at` changes only when a family reaches a higher tier.
 *
 * @param {?Object<string, {tier: number, at: number}>} previous Stored map.
 * @param {Object<string, number>} evaluated evaluateTitles() result.
 * @param {number} now Unix millis for new unlocks.
 * @return {{unlocked: object, upgraded: Array<{familyId: string, tier: number}>}}
 */
export function mergeUnlocked(previous, evaluated, now) {
  const unlocked = {};
  for (const [id, entry] of Object.entries(previous || {})) {
    if (entry && Number.isInteger(entry.tier) && entry.tier > 0) {
      unlocked[id] = { tier: entry.tier, at: num(entry.at) };
    }
  }
  const upgraded = [];
  for (const [id, tier] of Object.entries(evaluated || {})) {
    if (!unlocked[id] || tier > unlocked[id].tier) {
      unlocked[id] = { tier, at: now };
      upgraded.push({ familyId: id, tier });
    }
  }
  return { unlocked, upgraded };
}

/**
 * Normalize stored prefs (missing / bad fields → defaults).
 *
 * @param {?object} prefs Stored prefs.
 * @return {{mode: string, titleId: ?string, showRoomTitles: boolean}}
 */
export function normalizeTitlePrefs(prefs) {
  const p = prefs || {};
  return {
    mode: TITLE_MODES.includes(p.mode) ? p.mode : DEFAULT_TITLE_PREFS.mode,
    titleId: typeof p.titleId === 'string' && p.titleId ? p.titleId : null,
    showRoomTitles: typeof p.showRoomTitles === 'boolean'
      ? p.showRoomTitles
      : DEFAULT_TITLE_PREFS.showRoomTitles,
  };
}

/**
 * Validate a setTitlePrefs request against the unlocked titles. Fields left
 * out keep their current value.
 *
 * @param {?object} input `{ mode?, titleId?, showRoomTitles? }`.
 * @param {?object} current Stored prefs.
 * @param {?object} unlocked Stored unlocked map.
 * @return {object} { prefs } or { error }, error: 'bad-mode' | 'bad-title' |
 *   'not-unlocked' | 'bad-toggle'
 */
export function validateTitlePrefs(input, current, unlocked) {
  const base = normalizeTitlePrefs(current);
  const data = input || {};
  const next = { ...base };

  if (data.mode !== undefined) {
    if (!TITLE_MODES.includes(data.mode)) return { error: 'bad-mode' };
    next.mode = data.mode;
  }
  if (data.titleId !== undefined) {
    if (data.titleId !== null && (typeof data.titleId !== 'string' || !data.titleId)) {
      return { error: 'bad-title' };
    }
    if (data.titleId !== null && !unlocked?.[data.titleId]) return { error: 'not-unlocked' };
    next.titleId = data.titleId;
  }
  if (data.showRoomTitles !== undefined) {
    if (typeof data.showRoomTitles !== 'boolean') return { error: 'bad-toggle' };
    next.showRoomTitles = data.showRoomTitles;
  }
  if (next.mode === 'pick' && (!next.titleId || !unlocked?.[next.titleId])) {
    return { error: 'not-unlocked' };
  }
  return { prefs: next };
}

/**
 * What other players see. off → null; pick → the chosen title (falls back to
 * auto if it is no longer unlocked); auto → highest tier, ties to the most
 * recently reached, then catalog order.
 *
 * @param {?object} unlocked Stored unlocked map.
 * @param {?object} prefs Stored prefs.
 * @return {?{familyId: string, tier: number}}
 */
export function resolveDisplay(unlocked, prefs) {
  const p = normalizeTitlePrefs(prefs);
  if (p.mode === 'off') return null;
  const map = unlocked || {};
  if (p.mode === 'pick' && p.titleId && map[p.titleId]?.tier > 0) {
    return { familyId: p.titleId, tier: map[p.titleId].tier };
  }
  const order = (id) => {
    const i = TITLE_FAMILIES.findIndex((f) => f.id === id);
    return i === -1 ? TITLE_FAMILIES.length : i;
  };
  const best = Object.entries(map)
    .filter(([, entry]) => entry && entry.tier > 0)
    .sort(([idA, a], [idB, b]) =>
      (b.tier - a.tier) || (num(b.at) - num(a.at)) || (order(idA) - order(idB)))[0];
  return best ? { familyId: best[0], tier: best[1].tier } : null;
}

/**
 * Next userTitles payload from the stored doc and fresh all-time stats.
 *
 * @param {?object} previous Stored userTitles doc (or null).
 * @param {?object} allTimeStats leaderboardStats `all` doc.
 * @param {number} now Unix millis.
 * @return {object} { unlocked, prefs, display, upgraded, changed }.
 */
export function buildUserTitles(previous, allTimeStats, now) {
  const { unlocked, upgraded } = mergeUnlocked(
    previous?.unlocked, evaluateTitles(allTimeStats), now,
  );
  const prefs = normalizeTitlePrefs(previous?.prefs);
  const display = resolveDisplay(unlocked, prefs);
  const prevDisplay = previous?.display || null;
  const sameDisplay = (prevDisplay?.familyId || null) === (display?.familyId || null)
    && (prevDisplay?.tier || 0) === (display?.tier || 0);
  // No doc yet and nothing unlocked: nothing worth writing
  const changed = previous
    ? upgraded.length > 0 || !sameDisplay
    : Object.keys(unlocked).length > 0;
  return { unlocked, prefs, display, upgraded, changed };
}
