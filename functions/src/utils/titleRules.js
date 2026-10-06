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
//   prefs     { mode: 'off'|'auto'|'pick', titleId, showRoomTitles,
//               frame: 'auto'|frameId }
//   display   { familyId, tier, frame } | null   what other players see.
//             familyId / tier are null when the title is off (or none is
//             unlocked) but a frame is still shown; the whole display is
//             null only when there is neither a title nor a frame.
//
// 頭像框 (avatar frames): every step of a family is its own named title, so
// the titles held = the steps reached across all families (titleCount). 3 / 6
// / 9 / 15 / 25 of them earn bronze / silver / gold / platinum / diamond.
// `unlocked` only grows, so a frame never drops. prefs.frame 'auto' shows the
// highest earned; a lower earned one can be picked.
//
// 本月王座 (source 'crown', CROWN_FAMILIES): monthly #1 inside the user's
// 牌友圈, judged in crownRules.js and stored apart from `unlocked`:
//   crowns        { [crownId]: monthKey }   active while monthKey is the
//                                           current month (Asia/Taipei)
//   crownHistory  { [crownId]: [monthKey] }
//   display.month the crown's month when the display is a crown, so a reader
//                 can tell it went stale at the month change (effectiveDisplay)
// Crowns never count toward frames (nor does anything with an expiresAt), so
// a frame can't drop when a crown goes. In auto an active crown beats any
// other title (CROWN_IDS order when several); pick may choose a held crown and
// falls back to auto once it is gone.
// Hooks for later phases (not implemented yet):
//   - source 'hand'   hand-history titles; 'event' one-off titles such as
//                     復仇者 / 悲劇英雄
// Live in-room titles (獵人 / 本場金主 …) are computed on the client from the
// room itself and never stored: src/utils/roomTitles.js. Each player's
// prefs.showRoomTitles decides whether they can be given one. In a room the
// live title wins over a crown, a crown over a normal title.
// evaluateTitles() only evaluates source 'stats'; resolveDisplay() accepts any
// unlocked family so later sources can plug into the same doc.

import { groupsStdDev } from './leaderboardStatsMath.js';
import {
  CROWN_DEFS, activeCrowns, applyCrownMonth, crownMonthOf, crownStateFromScratch, isCrownId,
  sameCrownHistory, sameCrowns,
} from './crownRules.js';

export const TITLE_GROUPS = Object.freeze(['wallet', 'hunter', 'tournament', 'attendance']);

export const TITLE_SOURCES = Object.freeze({
  STATS: 'stats',
  CROWN: 'crown',
  ROOM: 'room',
  HAND: 'hand',
  EVENT: 'event',
});

export const TITLE_MODES = Object.freeze(['off', 'auto', 'pick']);

// Opt-in: nothing shows (title, frame, room titles) until the player turns
// it on in 我的
export const DEFAULT_TITLE_PREFS = Object.freeze({
  mode: 'off',
  titleId: null,
  showRoomTitles: false,
  frame: 'none',
});

/**
 * Stored prefs that are just the defaults from before opt-in (auto title,
 * auto frame, room titles on, nothing picked) — written by the backfill, not
 * chosen by the player. migrate_title_prefs_opt_in.js resets these.
 *
 * @param {?object} prefs Stored (raw) prefs.
 * @return {boolean}
 */
export function isLegacyDefaultPrefs(prefs) {
  const p = prefs || {};
  return (p.mode === undefined || p.mode === 'auto')
    && !p.titleId
    && (p.showRoomTitles === undefined || p.showRoomTitles === true)
    && (p.frame === undefined || p.frame === 'auto');
}

// 頭像框, lowest first: `min` titles held (see titleCount) earn the frame
export const FRAME_TIERS = Object.freeze([
  Object.freeze({ id: 'bronze', min: 4 }),
  Object.freeze({ id: 'silver', min: 8 }),
  Object.freeze({ id: 'gold', min: 16 }),
  Object.freeze({ id: 'platinum', min: 22 }),
  Object.freeze({ id: 'diamond', min: 30 }),
]);
export const FRAME_IDS = Object.freeze(FRAME_TIERS.map((f) => f.id));
// prefs.frame: the highest earned frame
export const FRAME_AUTO = 'auto';
// prefs.frame: no frame shown
export const FRAME_NONE = 'none';
const FRAME_PREFS = Object.freeze([FRAME_AUTO, FRAME_NONE, ...FRAME_IDS]);

// σ (volatility / steadiness) needs this many games with a known 組 size
export const TITLE_MIN_GROUP_GAMES = 10;
// 穩健: σ of the per-game result (組) below this (老闆 starts at 2)
export const STEADY_MAX_STDDEV = 1.5;

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
  family('bigWin', 'wallet', (s) => num(total(s).maxWinGroups), [4, 7, 10, 15]),
  family('bigLoss', 'wallet', (s) => num(total(s).maxLossGroups), [3, 5, 8, 12]),
  family('volatile', 'wallet', (s) => {
    const sd = stdDevOf(s);
    return sd == null ? 0 : round2(sd);
  }, [2, 3, 3.5, 5]),
  family('steady', 'wallet', (s) => {
    const sd = stdDevOf(s);
    const ok = sd != null && sd < STEADY_MAX_STDDEV && num(total(s).profit) > 0;
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
  family('bubble', 'tournament', (s) => num(tour(s).bubble), [5], { tiers: [3], hidden: true }),
  family('firstOut', 'tournament', (s) => num(tour(s).firstOut), [5], { tiers: [3], hidden: true }),

  // ── 出席 ────────────────────────────────────────────────────────
  family('regular', 'attendance', (s) => num(total(s).games), [10, 40, 100, 200]),
  family('host', 'attendance', (s) => num(total(s).hostedGames), [5, 15, 40, 100]),
  family('hotStreak', 'attendance', (s) => num(total(s).winStreakBest), [4, 7, 10]),
  family('coldStreak', 'attendance', (s) => num(total(s).lossStreakBest), [4, 7, 10]),
  family('nightOwl', 'attendance', (s) => num(total(s).nightGames), [10], { tiers: [3], hidden: true }),
]);

// 本月王座: one legendary step each (crown icon), judged monthly in the 牌友圈
// (crownRules.js), never in `unlocked` and never toward frames. Kept out of
// TITLE_FAMILIES so the 圖鑑 counts and evaluateTitles only see stats titles;
// getTitleFamily / titleTierOf know them.
export const CROWN_FAMILIES = Object.freeze(CROWN_DEFS.map((crown) => Object.freeze({
  id: crown.id,
  group: 'crown',
  hidden: false,
  source: TITLE_SOURCES.CROWN,
  metric: crown.metric,
  descKey: `titles.families.${crown.id}.desc`,
  hintKey: null,
  tiers: Object.freeze([Object.freeze({
    tier: 4,
    threshold: crown.min,
    nameKey: `titles.families.${crown.id}.t4`,
  })]),
})));

const FAMILY_BY_ID = new Map([...TITLE_FAMILIES, ...CROWN_FAMILIES].map((f) => [f.id, f]));

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
 * Rebuild the unlocked map from fresh tiers only, for a backfill after the
 * thresholds moved (mergeUnlocked never lowers a tier, so a raised threshold
 * would otherwise keep what the old one gave). A family at or below the tier
 * it had keeps its `at`; one that is now higher gets `now`. Entries this
 * can't judge (crowns, anything expiring, families this build doesn't know)
 * stay as they are.
 *
 * @param {?Object<string, {tier: number, at: number}>} previous Stored map.
 * @param {Object<string, number>} evaluated evaluateTitles() result.
 * @param {number} now Unix millis for new unlocks.
 * @return {{unlocked: object, upgraded: Array<{familyId: string, tier: number}>}}
 */
export function rebuildUnlocked(previous, evaluated, now) {
  const unlocked = {};
  for (const [id, entry] of Object.entries(previous || {})) {
    const fam = getTitleFamily(id);
    const unjudged = !fam || entry?.expiresAt != null || fam.source === TITLE_SOURCES.CROWN;
    if (unjudged) unlocked[id] = entry;
  }
  const upgraded = [];
  for (const [id, tier] of Object.entries(evaluated || {})) {
    const prev = previous?.[id];
    if (prev && Number.isInteger(prev.tier) && prev.tier >= tier) {
      unlocked[id] = { tier, at: num(prev.at) };
    } else {
      unlocked[id] = { tier, at: now };
      upgraded.push({ familyId: id, tier });
    }
  }
  return { unlocked, upgraded };
}

/**
 * Same families at the same tiers?
 *
 * @param {?object} a Unlocked map.
 * @param {?object} b Unlocked map.
 * @return {boolean}
 */
function sameUnlocked(a, b) {
  const ka = Object.keys(a || {});
  const kb = Object.keys(b || {});
  return ka.length === kb.length && ka.every((id) => (a[id]?.tier || 0) === (b?.[id]?.tier || 0));
}

/**
 * Does this unlocked entry count toward frames? Crowns (time-limited, phase 3)
 * and anything carrying an expiry don't, so frames never drop.
 *
 * @param {string} id Family id.
 * @param {?object} entry Unlocked entry.
 * @return {boolean}
 */
function countsTowardFrames(id, entry) {
  if (!entry || !Number.isInteger(entry.tier) || entry.tier <= 0) return false;
  if (entry.expiresAt != null) return false;
  return getTitleFamily(id)?.source !== TITLE_SOURCES.CROWN;
}

/**
 * Titles held: every step of a family is its own named title, so a family at
 * tier 3 of 1-2-3-4 holds three. Families with fewer steps start at a higher
 * tier (神秘賞金頭獎 2-3-4, the hidden ones a single 3), so this counts the
 * steps reached, not the tier number: a hidden title is one title. A family
 * this build doesn't know (newer catalog) counts its tier.
 *
 * @param {?Object<string, {tier: number}>} unlocked Stored unlocked map.
 * @return {number}
 */
export function titleCount(unlocked) {
  let count = 0;
  for (const [id, entry] of Object.entries(unlocked || {})) {
    if (!countsTowardFrames(id, entry)) continue;
    const fam = getTitleFamily(id);
    count += fam ? fam.tiers.filter((step) => step.tier <= entry.tier).length : entry.tier;
  }
  return count;
}

/**
 * Rank of a frame id in FRAME_TIERS (-1 = not a frame).
 *
 * @param {?string} frameId Frame id.
 * @return {number}
 */
export function frameRank(frameId) {
  return FRAME_IDS.indexOf(frameId);
}

/**
 * Highest frame the unlocked titles earn.
 *
 * @param {?object} unlocked Stored unlocked map.
 * @return {?string} Frame id, null below the first one.
 */
export function earnedFrame(unlocked) {
  const count = titleCount(unlocked);
  let earned = null;
  for (const frame of FRAME_TIERS) {
    if (count >= frame.min) earned = frame.id;
  }
  return earned;
}

/**
 * Frames up to the earned one (lowest first).
 *
 * @param {?object} unlocked Stored unlocked map.
 * @return {Array<string>}
 */
export function earnedFrames(unlocked) {
  return FRAME_IDS.slice(0, frameRank(earnedFrame(unlocked)) + 1);
}

/**
 * The frame shown: the picked one while earned, else the highest earned.
 *
 * @param {?object} unlocked Stored unlocked map.
 * @param {?object} prefs Stored prefs.
 * @return {?string} Frame id or null.
 */
export function resolveFrame(unlocked, prefs) {
  const picked = normalizeTitlePrefs(prefs).frame;
  if (picked === FRAME_NONE) return null;
  const earned = earnedFrame(unlocked);
  if (!earned) return null;
  if (picked !== FRAME_AUTO && frameRank(picked) <= frameRank(earned)) return picked;
  return earned;
}

/**
 * Normalize stored prefs (missing / bad fields → defaults).
 *
 * @param {?object} prefs Stored prefs.
 * @return {{mode: string, titleId: ?string, showRoomTitles: boolean, frame: string}}
 */
export function normalizeTitlePrefs(prefs) {
  const p = prefs || {};
  return {
    mode: TITLE_MODES.includes(p.mode) ? p.mode : DEFAULT_TITLE_PREFS.mode,
    titleId: typeof p.titleId === 'string' && p.titleId ? p.titleId : null,
    showRoomTitles: typeof p.showRoomTitles === 'boolean'
      ? p.showRoomTitles
      : DEFAULT_TITLE_PREFS.showRoomTitles,
    frame: FRAME_PREFS.includes(p.frame) ? p.frame : DEFAULT_TITLE_PREFS.frame,
  };
}

/**
 * Validate a setTitlePrefs request against the unlocked titles. Fields left
 * out keep their current value.
 *
 * A crown can be picked while it is held this month (`crownCtx`); once it is
 * gone the stored pick shows as auto, and other prefs stay changeable.
 *
 * @param {?object} input `{ mode?, titleId?, showRoomTitles?, frame? }`.
 * @param {?object} current Stored prefs.
 * @param {?object} unlocked Stored unlocked map.
 * @param {?{crowns: ?object, month: ?string}} [crownCtx] Stored crowns and the
 *   current month key.
 * @return {object} { prefs } or { error }, error: 'bad-mode' | 'bad-title' |
 *   'not-unlocked' | 'bad-toggle' | 'bad-frame' | 'frame-locked'
 */
export function validateTitlePrefs(input, current, unlocked, crownCtx = null) {
  const base = normalizeTitlePrefs(current);
  const data = input || {};
  const next = { ...base };
  const held = new Set(activeCrowns(crownCtx?.crowns, crownCtx?.month));
  const pickable = (id) => (isCrownId(id) ? held.has(id) : !!unlocked?.[id]);

  if (data.mode !== undefined) {
    if (!TITLE_MODES.includes(data.mode)) return { error: 'bad-mode' };
    next.mode = data.mode;
  }
  if (data.titleId !== undefined) {
    if (data.titleId !== null && (typeof data.titleId !== 'string' || !data.titleId)) {
      return { error: 'bad-title' };
    }
    if (data.titleId !== null && !pickable(data.titleId)) return { error: 'not-unlocked' };
    next.titleId = data.titleId;
  }
  if (data.showRoomTitles !== undefined) {
    if (typeof data.showRoomTitles !== 'boolean') return { error: 'bad-toggle' };
    next.showRoomTitles = data.showRoomTitles;
  }
  if (data.frame !== undefined) {
    if (!FRAME_PREFS.includes(data.frame)) return { error: 'bad-frame' };
    const locked = frameRank(data.frame) > frameRank(earnedFrame(unlocked));
    if (FRAME_IDS.includes(data.frame) && locked) {
      return { error: 'frame-locked' };
    }
    next.frame = data.frame;
  }
  // Only a request that sets the pick checks it: a picked crown that has since
  // gone must not block changing the frame or the room-title toggle
  const picking = data.mode !== undefined || data.titleId !== undefined;
  if (picking && next.mode === 'pick' && (!next.titleId || !pickable(next.titleId))) {
    return { error: 'not-unlocked' };
  }
  return { prefs: next };
}

/**
 * The title shown. off → null; pick → the chosen title (falls back to auto if
 * it is no longer unlocked, or a crown no longer held); auto → an active crown
 * (CROWN_IDS order), else the highest tier, ties to the most recently
 * reached, then catalog order.
 *
 * @param {?object} unlocked Stored unlocked map.
 * @param {?object} prefs Stored prefs.
 * @param {?{crowns: ?object, month: ?string}} [crownCtx] Stored crowns and the
 *   current month key (none: no crowns).
 * @return {?{familyId: string, tier: number, month: (string|undefined)}}
 */
export function resolveTitle(unlocked, prefs, crownCtx = null) {
  const p = normalizeTitlePrefs(prefs);
  if (p.mode === 'off') return null;
  const map = unlocked || {};
  const crowns = activeCrowns(crownCtx?.crowns, crownCtx?.month);
  const crownTitle = (id) => ({ familyId: id, tier: 4, month: crownCtx.month });
  if (p.mode === 'pick' && p.titleId) {
    if (crowns.includes(p.titleId)) return crownTitle(p.titleId);
    if (!isCrownId(p.titleId) && map[p.titleId]?.tier > 0) {
      return { familyId: p.titleId, tier: map[p.titleId].tier };
    }
  }
  if (crowns.length) return crownTitle(crowns[0]);
  const order = (id) => {
    const i = TITLE_FAMILIES.findIndex((f) => f.id === id);
    return i === -1 ? TITLE_FAMILIES.length : i;
  };
  const best = Object.entries(map)
    .filter(([id, entry]) => entry && entry.tier > 0 && !isCrownId(id))
    .sort(([idA, a], [idB, b]) =>
      (b.tier - a.tier) || (num(b.at) - num(a.at)) || (order(idA) - order(idB)))[0];
  return best ? { familyId: best[0], tier: best[1].tier } : null;
}

/**
 * What other players see: the title (resolveTitle) and the frame
 * (resolveFrame). The title fields are null when the title is off or none is
 * unlocked; null overall when there is neither a title nor a frame. A crown
 * display also carries its `month`, so readers can spot it going stale.
 *
 * @param {?object} unlocked Stored unlocked map.
 * @param {?object} prefs Stored prefs.
 * @param {?{crowns: ?object, month: ?string}} [crownCtx] See resolveTitle.
 * @return {?{familyId: ?string, tier: ?number, frame: ?string,
 *   month: (string|undefined)}}
 */
export function resolveDisplay(unlocked, prefs, crownCtx = null) {
  const title = resolveTitle(unlocked, prefs, crownCtx);
  const frame = resolveFrame(unlocked, prefs);
  if (!title && !frame) return null;
  const display = { familyId: title?.familyId || null, tier: title?.tier || null, frame };
  if (title?.month) display.month = title.month;
  return display;
}

/**
 * The display to show now. The stored one is written by Cloud Functions after
 * games and prefs changes, so a crown in it goes stale when the month changes
 * (and docs from before frames lack `frame`): those are resolved again here
 * with the same rules. Used by the client for every badge.
 *
 * @param {?object} doc userTitles doc ({ unlocked, prefs, display, crowns }).
 * @param {string} month Current month key (crownMonthOf(Date.now())).
 * @return {?object} Display.
 */
export function effectiveDisplay(doc, month) {
  const stored = doc?.display || null;
  const stale = !stored || stored.frame === undefined
    || (isCrownId(stored.familyId) && stored.month !== month);
  if (!stale) return stored;
  return resolveDisplay(doc?.unlocked, doc?.prefs, { crowns: doc?.crowns, month });
}

/**
 * Same display? (null-safe; a stored display without `frame` predates frames)
 *
 * @param {?object} a Display.
 * @param {?object} b Display.
 * @return {boolean}
 */
export function sameDisplay(a, b) {
  return (a?.familyId || null) === (b?.familyId || null)
    && (a?.tier || 0) === (b?.tier || 0)
    && (a?.frame || null) === (b?.frame || null)
    && (a?.month || null) === (b?.month || null);
}

/**
 * Next userTitles payload from the stored doc and fresh all-time stats.
 *
 * @param {?object} previous Stored userTitles doc (or null).
 * @param {?object} allTimeStats leaderboardStats `all` doc.
 * @param {number} now Unix millis.
 * @param {object} [options] `{ rebuild }`: rebuildUnlocked instead of merging,
 *   so tiers can also go down (backfill after a threshold change).
 * @return {object} { unlocked, prefs, display (title + frame), upgraded, changed }.
 */
export function buildUserTitles(previous, allTimeStats, now, { rebuild = false } = {}) {
  const { unlocked, upgraded } = (rebuild ? rebuildUnlocked : mergeUnlocked)(
    previous?.unlocked, evaluateTitles(allTimeStats), now,
  );
  const prefs = normalizeTitlePrefs(previous?.prefs);
  // Display = title + frame (+ an active crown), so a new frame, a crown that
  // went stale at the month change, or a doc written before frames existed is
  // a change too
  const crownCtx = { crowns: previous?.crowns, month: crownMonthOf(now) };
  const display = resolveDisplay(unlocked, prefs, crownCtx);
  // No doc yet and nothing unlocked: nothing worth writing
  const changed = previous
    ? upgraded.length > 0 || !sameDisplay(previous.display, display)
      || (rebuild && !sameUnlocked(previous.unlocked, unlocked))
    : Object.keys(unlocked).length > 0;
  return { unlocked, prefs, display, upgraded, changed };
}

/**
 * Next crowns / crownHistory / display of a userTitles doc from crown
 * verdicts (handlers/monthlyCrowns.js).
 *
 * @param {?object} stored Stored userTitles doc.
 * @param {Array<[string, Array<string>]>} verdicts [monthKey, heldCrowns()]
 *   pairs; applied oldest first (applyCrownMonth).
 * @param {string} currentMonth Current month key.
 * @param {object} [options] `{ fromScratch }`: rebuild crowns and history from
 *   the verdicts alone (backfill --crown-history) instead of moving the stored
 *   ones along.
 * @return {{crowns: object, crownHistory: object, display: ?object,
 *   changed: boolean, gained: Array<string>, lost: Array<string>}}
 */
export function buildCrownUpdate(stored, verdicts, currentMonth, { fromScratch = false } = {}) {
  const ordered = [...(verdicts || [])].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  let state = { crowns: stored?.crowns || {}, crownHistory: stored?.crownHistory || {} };
  const gained = [];
  const lost = [];
  if (fromScratch) {
    state = crownStateFromScratch(Object.fromEntries(ordered), currentMonth);
  } else {
    for (const [month, held] of ordered) {
      const step = applyCrownMonth(state, month, currentMonth, held);
      state = { crowns: step.crowns, crownHistory: step.crownHistory };
      gained.push(...step.gained);
      lost.push(...step.lost);
    }
  }
  const crownCtx = { crowns: state.crowns, month: currentMonth };
  const display = resolveDisplay(stored?.unlocked, stored?.prefs, crownCtx);
  const changed = !sameCrowns(stored?.crowns, state.crowns)
    || !sameCrownHistory(stored?.crownHistory, state.crownHistory)
    || !sameDisplay(stored?.display, display);
  return { ...state, display, changed, gained, lost };
}
