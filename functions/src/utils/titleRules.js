// 稱號 (titles): the catalog and the pure rules around it.
//
// NO firebase imports here on purpose: this module is shared by
//   - functions/src/handlers/userTitles.js   (recompute after each game, setTitlePrefs)
//   - functions/scripts/backfill_leaderboard_stats.js (through the handler)
//   - src/utils/titles.js                     (badge names, 稱號圖鑑 progress)
//   - tests/titleRules.test.js
//
// A title family is one achievement with ten steps, tier 1 → 10, each its own
// name. The rarity comes from the tier in bands of two (src/utils/titles.js
// titleRarity): 1–2 common, 3–4 rare, 5–6 epic, 7–8 legendary (crown icon),
// 9–10 mythic.
//
// Families read the user's all-time leaderboardStats doc ({ total, cash,
// tournament } buckets, see leaderboardStatsMath.js). The thresholds are
// TITLE_LADDERS below, one line per family; tune them there.
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
//   ladder    TITLE_LADDER_VERSION: the tiers are on the ten-step ladders.
//             Docs without it use the old 1..4 numbering; upgradeTitlesDoc
//             reads them on the new ladders until the backfill rewrites them.
//
// 頭像框 (avatar frames): every step of a family is its own named title, so
// the titles held = the steps reached across all families (titleCount);
// FRAME_TIERS says how many earn each frame. `unlocked` only grows, so a frame
// never drops. prefs.frame 'auto' shows the highest earned; a lower earned one
// can be picked.
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
// 手牌 (and 復仇者 under 獵頭) are plain stats families too: the projection
// stores each game's hand events on history_sub (utils/handEvents.js) and the
// stats sum them into the total bucket. Sources 'hand' / 'event' stay unused.
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

export const TITLE_GROUPS = Object.freeze(['wallet', 'hunter', 'tournament', 'hands', 'attendance']);

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

// 頭像框: titles held (see titleCount) needed for each frame. Still the
// numbers from the 1..4 ladders: pick new ones from
// functions/scripts/simulate_title_tiers.js (a family at tier n holds n now).
export const FRAME_MIN_BRONZE = 4;
export const FRAME_MIN_SILVER = 8;
export const FRAME_MIN_GOLD = 16;
export const FRAME_MIN_PLATINUM = 22;
export const FRAME_MIN_DIAMOND = 30;

// 頭像框, lowest first: `min` titles held earn the frame
export const FRAME_TIERS = Object.freeze([
  Object.freeze({ id: 'bronze', min: FRAME_MIN_BRONZE }),
  Object.freeze({ id: 'silver', min: FRAME_MIN_SILVER }),
  Object.freeze({ id: 'gold', min: FRAME_MIN_GOLD }),
  Object.freeze({ id: 'platinum', min: FRAME_MIN_PLATINUM }),
  Object.freeze({ id: 'diamond', min: FRAME_MIN_DIAMOND }),
]);
export const FRAME_IDS = Object.freeze(FRAME_TIERS.map((f) => f.id));
// prefs.frame: the highest earned frame
export const FRAME_AUTO = 'auto';
// prefs.frame: no frame shown
export const FRAME_NONE = 'none';
const FRAME_PREFS = Object.freeze([FRAME_AUTO, FRAME_NONE, ...FRAME_IDS]);

// σ (volatility / steadiness) needs this many games with a known 組 size
export const TITLE_MIN_GROUP_GAMES = 10;
// 穩健: σ of the per-game result (組) below this (where 老闆's ladder starts)
export const STEADY_MAX_STDDEV = 1.5;

// Steps per family
export const TITLE_TIER_COUNT = 10;
// userTitles.ladder of docs on the ten-step ladders (old docs have none)
export const TITLE_LADDER_VERSION = 2;

// The thresholds of tier 1 → 10, one line per family. Set after about a year
// of play (the production high in each comment): tier 1 is a first taste,
// today's leaders sit around tier 5–7, tier 9–10 take years. Money is in the
// leaderboard's unit (cash), 組 / σ as the stats store them.
export const TITLE_LADDERS = Object.freeze({
  // ── 錢包
  netWin: [500, 1000, 2000, 4000, 7000, 10000, 15000, 25000, 40000, 60000], // top +12.5K → 6
  netLoss: [500, 1000, 2000, 4000, 7000, 12000, 25000, 40000, 60000, 90000], // top 20.6K → 6
  bigWin: [2, 3, 4, 6, 8, 10, 14, 18, 22, 30], // 組, top 12.95 → 6
  bigLoss: [2, 3, 4, 5, 6, 8, 10, 13, 16, 20], // 組, top 9.1 → 6
  volatile: [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7], // σ (組), top 3.76 → 5
  steady: [10, 15, 20, 30, 40, 55, 70, 90, 120, 160], // games (most played 105)
  // ── 獵頭
  hunter: [1, 2, 3, 4, 5, 7, 10, 15, 25, 40], // top 5 → 5
  hunted: [1, 2, 3, 5, 7, 10, 15, 20, 30, 50], // top 3 → 3
  mysteryTop: [1, 2, 3, 4, 5, 6, 8, 10, 15, 20], // top 1 → 1
  avenger: [1, 2, 3, 4, 5, 7, 10, 15, 20, 30],
  // ── 錦標賽
  champion: [1, 2, 3, 5, 7, 10, 15, 20, 30, 50], // top 7 → 5
  itm: [1, 3, 5, 7, 10, 14, 20, 30, 45, 70], // top 12 → 5
  phoenix: [1, 2, 3, 4, 5, 6, 7, 8, 9, 12], // rebuys in a game that still cashed
  rebuyer: [1, 3, 5, 8, 12, 16, 22, 30, 50, 80], // top 14 → 5
  runnerUp: [1, 2, 3, 4, 6, 8, 10, 15, 20, 30], // top 6 → 5
  bubble: [1, 2, 3, 4, 5, 7, 10, 13, 17, 25], // top 5 → 5
  firstOut: [1, 2, 3, 4, 5, 7, 10, 13, 17, 25], // top 5 → 5
  // ── 手牌 (single digits so far)
  badBeat: [1, 2, 3, 4, 5, 6, 8, 10, 15, 20],
  cooler: [1, 2, 3, 4, 5, 7, 10, 13, 17, 25],
  tragicHero: [1, 2, 3, 4, 5, 6, 8, 10, 15, 20],
  quads: [1, 2, 3, 4, 5, 7, 10, 13, 17, 25],
  straightFlush: [1, 2, 3, 4, 5, 6, 7, 8, 10, 12],
  royalFlush: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  // ── 出席
  regular: [5, 10, 20, 30, 50, 80, 120, 160, 220, 300], // top 105 → 6
  host: [3, 5, 10, 20, 35, 50, 75, 100, 150, 250], // top 72 → 6
  hotStreak: [2, 3, 4, 5, 6, 8, 10, 12, 15, 20], // top 8 → 6
  coldStreak: [2, 3, 4, 6, 8, 10, 13, 16, 20, 25], // top 12 → 6
  nightOwl: [1, 3, 5, 10, 15, 20, 30, 40, 60, 100], // top 1 → 1
});

// The 1..4 ladders before ten steps: { oldTier: threshold } per family, only
// to read docs written before TITLE_LADDER_VERSION (upgradeTitlesDoc)
const LEGACY_LADDERS = Object.freeze({
  netWin: { 1: 2000, 2: 5000, 3: 10000, 4: 30000 },
  netLoss: { 1: 2000, 2: 5000, 3: 15000, 4: 40000 },
  bigWin: { 1: 4, 2: 7, 3: 10, 4: 15 },
  bigLoss: { 1: 3, 2: 5, 3: 8, 4: 12 },
  volatile: { 1: 2, 2: 3, 3: 3.5, 4: 5 },
  steady: { 1: 10, 2: 20, 3: 40, 4: 80 },
  hunter: { 1: 5, 2: 20, 3: 50, 4: 120 },
  hunted: { 1: 5, 2: 20, 3: 50, 4: 120 },
  mysteryTop: { 2: 1, 3: 3, 4: 10 },
  avenger: { 3: 1 },
  champion: { 1: 1, 2: 3, 3: 6, 4: 12 },
  itm: { 1: 3, 2: 10, 3: 25, 4: 50 },
  phoenix: { 2: 2, 3: 4, 4: 6 },
  rebuyer: { 1: 10, 2: 30, 3: 100 },
  runnerUp: { 3: 5 },
  bubble: { 3: 5 },
  firstOut: { 3: 5 },
  badBeat: { 2: 1, 3: 3, 4: 10 },
  cooler: { 2: 1, 3: 3, 4: 5 },
  tragicHero: { 3: 1 },
  quads: { 2: 1, 3: 5 },
  straightFlush: { 3: 1 },
  royalFlush: { 4: 1 },
  regular: { 1: 10, 2: 40, 3: 100, 4: 200 },
  host: { 1: 5, 2: 15, 3: 40, 4: 100 },
  hotStreak: { 2: 4, 3: 7, 4: 10 },
  coldStreak: { 2: 4, 3: 7, 4: 10 },
  nightOwl: { 3: 10 },
});

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
 * Build a family on its TITLE_LADDERS line: threshold i unlocks tier i + 1.
 *
 * @param {string} id Family id (stable: stored in userTitles docs).
 * @param {string} group One of TITLE_GROUPS.
 * @param {function(object): number} metric all-time stats → value.
 * @param {object} [options] `{ hidden }`: ??? + a riddle until tier 1.
 * @return {object} Family definition.
 */
function family(id, group, metric, { hidden = false } = {}) {
  const thresholds = TITLE_LADDERS[id];
  const ascending = thresholds?.every((t, i) => i === 0 || t > thresholds[i - 1]);
  if (thresholds?.length !== TITLE_TIER_COUNT || !ascending) {
    throw new Error(`titleRules: ${id} needs ${TITLE_TIER_COUNT} ascending thresholds`);
  }
  return Object.freeze({
    id,
    group,
    hidden,
    source: TITLE_SOURCES.STATS,
    metric,
    descKey: `titles.families.${id}.desc`,
    hintKey: hidden ? `titles.families.${id}.hint` : null,
    tiers: Object.freeze(thresholds.map((threshold, i) => Object.freeze({
      tier: i + 1,
      threshold,
      nameKey: `titles.families.${id}.t${i + 1}`,
    }))),
  });
}

export const TITLE_FAMILIES = Object.freeze([
  // ── 錢包 ────────────────────────────────────────────────────────
  // Money in the leaderboard's unit (cash: profitCash, or chips / rate)
  family('netWin', 'wallet', (s) => Math.max(0, num(total(s).profit))),
  family('netLoss', 'wallet', (s) => Math.max(0, -num(total(s).profit))),
  family('bigWin', 'wallet', (s) => num(total(s).maxWinGroups)),
  family('bigLoss', 'wallet', (s) => num(total(s).maxLossGroups)),
  family('volatile', 'wallet', (s) => {
    const sd = stdDevOf(s);
    return sd == null ? 0 : round2(sd);
  }),
  family('steady', 'wallet', (s) => {
    const sd = stdDevOf(s);
    const ok = sd != null && sd < STEADY_MAX_STDDEV && num(total(s).profit) > 0;
    return ok ? num(total(s).games) : 0;
  }),

  // ── 獵頭 ────────────────────────────────────────────────────────
  family('hunter', 'hunter', (s) => num(tour(s).knockouts)),
  family('hunted', 'hunter', (s) => num(tour(s).knockedOut)),
  family('mysteryTop', 'hunter', (s) => num(tour(s).topDraws)),
  // Paid back in the same game (knockoutLog.js revengeCounts)
  family('avenger', 'hunter', (s) => num(total(s).revenge), { hidden: true }),

  // ── 錦標賽 ──────────────────────────────────────────────────────
  family('champion', 'tournament', (s) => num(tour(s).champion)),
  family('itm', 'tournament', (s) => num(tour(s).itm)),
  family('phoenix', 'tournament', (s) => num(tour(s).maxRebuyItm)),
  family('rebuyer', 'tournament', (s) => num(tour(s).rebuyCount)),
  family('runnerUp', 'tournament', (s) => num(tour(s).runnerUp), { hidden: true }),
  family('bubble', 'tournament', (s) => num(tour(s).bubble), { hidden: true }),
  family('firstOut', 'tournament', (s) => num(tour(s).firstOut), { hidden: true }),

  // ── 手牌 ────────────────────────────────────────────────────────
  // From the recorded hands (games/{id}/hands, utils/handEvents.js), summed
  // into the total bucket. Only hands someone recorded count.
  family('badBeat', 'hands', (s) => num(total(s).badBeatWins), { hidden: true }),
  family('cooler', 'hands', (s) => num(total(s).coolers)),
  family('tragicHero', 'hands', (s) => num(total(s).tragicHero), { hidden: true }),
  family('quads', 'hands', (s) => num(total(s).quads)),
  family('straightFlush', 'hands', (s) => num(total(s).straightFlush), { hidden: true }),
  family('royalFlush', 'hands', (s) => num(total(s).royalFlush), { hidden: true }),

  // ── 出席 ────────────────────────────────────────────────────────
  family('regular', 'attendance', (s) => num(total(s).games)),
  family('host', 'attendance', (s) => num(total(s).hostedGames)),
  family('hotStreak', 'attendance', (s) => num(total(s).winStreakBest)),
  family('coldStreak', 'attendance', (s) => num(total(s).lossStreakBest)),
  family('nightOwl', 'attendance', (s) => num(total(s).nightGames), { hidden: true }),
]);

// A crown's one step. Stored in displays as is, so it stays 4 from the old
// ladders; the badge styles crowns by family (red-gold + crown icon), not by
// this number.
export const CROWN_TIER = 4;

// 本月王座: one step each (crown icon), judged monthly in the 牌友圈
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
    tier: CROWN_TIER,
    threshold: crown.min,
    nameKey: `titles.families.${crown.id}.t${CROWN_TIER}`,
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
 * A tier stored with the old 1..4 numbering, on the ten-step ladder: the tier
 * the old step's threshold reaches now (at least 1: it was unlocked). This is
 * a floor (the value was at least that), so the backfill can only move it up.
 *
 * @param {string} id Family id.
 * @param {number} oldTier Stored tier.
 * @return {number}
 */
export function legacyTier(id, oldTier) {
  const fam = getTitleFamily(id);
  const threshold = LEGACY_LADDERS[id]?.[oldTier];
  if (!fam || threshold == null) return Math.min(TITLE_TIER_COUNT, oldTier);
  return Math.max(1, tierForValue(fam, threshold));
}

/**
 * A userTitles doc with its tiers on the ten-step ladders. Docs written
 * before them (no `ladder`) get each stats family's tier mapped (legacyTier)
 * and their stored display dropped, so it is resolved again from the mapped
 * tiers (effectiveDisplay) instead of showing an old tier number under the
 * new rarity. Crowns, families this build doesn't know and everything else
 * on the doc stay as they are. Docs already on the ladders come back as is.
 *
 * @param {?object} doc userTitles doc.
 * @return {?object}
 */
export function upgradeTitlesDoc(doc) {
  if (!doc || doc.ladder === TITLE_LADDER_VERSION) return doc;
  const unlocked = {};
  for (const [id, entry] of Object.entries(doc.unlocked || {})) {
    const stats = getTitleFamily(id)?.source === TITLE_SOURCES.STATS;
    const valid = entry && Number.isInteger(entry.tier) && entry.tier > 0;
    unlocked[id] = stats && valid ? { ...entry, tier: legacyTier(id, entry.tier) } : entry;
  }
  return { ...doc, unlocked, display: null, ladder: TITLE_LADDER_VERSION };
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
 * stay as they are. `previous` must already be on the ten-step ladders
 * (upgradeTitlesDoc; buildUserTitles does that).
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
 * tier 3 holds three (the steps reached; with ten steps 1..10 that is the
 * tier). A family this build doesn't know (newer catalog) counts its tier.
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
  const crownTitle = (id) => ({ familyId: id, tier: CROWN_TIER, month: crownCtx.month });
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
 * (and docs from before frames lack `frame`, docs from before the ten-step
 * ladders hold old tier numbers): those are resolved again here with the same
 * rules. Used by the client for every badge.
 *
 * @param {?object} doc userTitles doc ({ unlocked, prefs, display, crowns }).
 * @param {string} month Current month key (crownMonthOf(Date.now())).
 * @return {?object} Display.
 */
export function effectiveDisplay(doc, month) {
  const current = upgradeTitlesDoc(doc);
  const stored = current?.display || null;
  const stale = !stored || stored.frame === undefined
    || (isCrownId(stored.familyId) && stored.month !== month);
  if (!stale) return stored;
  return resolveDisplay(current?.unlocked, current?.prefs, { crowns: current?.crowns, month });
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
 * A stored doc from before the ten-step ladders is read through
 * upgradeTitlesDoc first (always a change, so it gets written with `ladder`).
 *
 * @param {?object} previous Stored userTitles doc (or null).
 * @param {?object} allTimeStats leaderboardStats `all` doc.
 * @param {number} now Unix millis.
 * @param {object} [options] `{ rebuild }`: rebuildUnlocked instead of merging,
 *   so tiers can also go down (backfill after a threshold change).
 * @return {object} { unlocked, prefs, display (title + frame), ladder,
 *   upgraded, changed }.
 */
export function buildUserTitles(previous, allTimeStats, now, { rebuild = false } = {}) {
  const legacy = !!previous && previous.ladder !== TITLE_LADDER_VERSION;
  const current = upgradeTitlesDoc(previous);
  const { unlocked, upgraded } = (rebuild ? rebuildUnlocked : mergeUnlocked)(
    current?.unlocked, evaluateTitles(allTimeStats), now,
  );
  const prefs = normalizeTitlePrefs(current?.prefs);
  // Display = title + frame (+ an active crown), so a new frame, a crown that
  // went stale at the month change, or a doc written before frames existed is
  // a change too
  const crownCtx = { crowns: current?.crowns, month: crownMonthOf(now) };
  const display = resolveDisplay(unlocked, prefs, crownCtx);
  // No doc yet and nothing unlocked: nothing worth writing
  const changed = current
    ? legacy || upgraded.length > 0 || !sameDisplay(current.display, display)
      || (rebuild && !sameUnlocked(current.unlocked, unlocked))
    : Object.keys(unlocked).length > 0;
  return { unlocked, prefs, display, ladder: TITLE_LADDER_VERSION, upgraded, changed };
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
  // Tiers of an old doc read on the ten-step ladders (only `display` is
  // written here; readers resolve an old doc's display again anyway)
  const current = upgradeTitlesDoc(stored);
  const display = resolveDisplay(current?.unlocked, current?.prefs, crownCtx);
  const changed = !sameCrowns(stored?.crowns, state.crowns)
    || !sameCrownHistory(stored?.crownHistory, state.crownHistory)
    || !sameDisplay(stored?.display, display);
  return { ...state, display, changed, gained, lost };
}
