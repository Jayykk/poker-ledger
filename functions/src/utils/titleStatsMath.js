// 稱號圖鑑「幾人拿到」: how many players hold each title step, frame and crown,
// counted over every userTitles doc.
//
// NO firebase imports here on purpose: shared by
//   - functions/src/handlers/titleStats.js (recount after each game, backfill)
//   - tests/titleStats.test.js
//
// Stored as titleStats/global (server-written, read by signed-in users):
//   players  docs with at least one title step
//   titles   { [familyId]: [n1, …, n10] }  players at or above each step
//   frames   { [frameId]: n }              players who earned it (tier and
//                                          themed frames: earned now; crown
//                                          frames: won its crown at least once)
//   crowns   { [crownId]: n }              players who won it at least once
//   month    the month the counts were taken in
//   crownsPending { [crownId]: n }         players leading that month's race
//                                          who never won it before: winners
//                                          once the month is over
//   countedAt read time of the scan (handlers/titleStats.js keeps the newest)
// A recount instead of counters: each game reads every userTitles doc once
// (cheap at this app's size, and it can never drift). No game is needed at
// the month change either: siteCrownCount adds crownsPending once `month`
// has passed.

import { CROWN_IDS, wonCrownMonths } from './crownRules.js';
import {
  CROWN_FRAMES, TITLE_FAMILIES, TITLE_TIER_COUNT, lastingFrames, titleCount,
} from './titleRules.js';

export const TITLE_STATS_COLLECTION = 'titleStats';
export const TITLE_STATS_DOC = 'global';

/**
 * Counts from userTitles docs.
 *
 * @param {Iterable<?object>} docs userTitles data ({ unlocked, crowns,
 *   crownHistory }).
 * @param {string} month Current month key (a crown led in it isn't won yet).
 * @return {{players: number, titles: object, frames: object, crowns: object,
 *   month: string, crownsPending: object}}
 */
export function titleStatsFrom(docs, month) {
  const titles = Object.fromEntries(
    TITLE_FAMILIES.map((f) => [f.id, Array(TITLE_TIER_COUNT).fill(0)]),
  );
  const frames = {};
  const crowns = Object.fromEntries(CROWN_IDS.map((id) => [id, 0]));
  const crownsPending = Object.fromEntries(CROWN_IDS.map((id) => [id, 0]));
  let players = 0;
  for (const doc of docs || []) {
    const unlocked = doc?.unlocked || {};
    if (titleCount(unlocked) > 0) players += 1;
    for (const fam of TITLE_FAMILIES) {
      const tier = Number(unlocked[fam.id]?.tier) || 0;
      const reached = Math.min(tier, TITLE_TIER_COUNT);
      for (let step = 1; step <= reached; step += 1) titles[fam.id][step - 1] += 1;
    }
    for (const id of lastingFrames(unlocked)) frames[id] = (frames[id] || 0) + 1;
    for (const id of CROWN_IDS) {
      if (wonCrownMonths(doc, id, month).length) crowns[id] += 1;
      else if (doc?.crowns?.[id] === month) crownsPending[id] += 1;
    }
  }
  for (const f of CROWN_FRAMES) frames[f.id] = crowns[f.crown] || 0;
  return { players, titles, frames, crowns, month, crownsPending };
}

/**
 * Players who won a crown (or earned a crown frame), read from stored counts
 * at `month`: the race leaders of a month that has since ended count as
 * winners even before the next recount.
 *
 * @param {?object} stats titleStats/global.
 * @param {string} crownId Crown.
 * @param {string} month Current month key.
 * @return {number}
 */
export function siteCrownCount(stats, crownId, month) {
  const won = Number(stats?.crowns?.[crownId]) || 0;
  const over = typeof stats?.month === 'string' && stats.month < month;
  return won + (over ? Number(stats?.crownsPending?.[crownId]) || 0 : 0);
}

/**
 * Same counts? (key order doesn't matter)
 *
 * @param {?object} a titleStatsFrom() result or a stored doc.
 * @param {?object} b The other.
 * @return {boolean}
 */
export function sameTitleStats(a, b) {
  const pick = (s) => ({
    players: s?.players || 0,
    titles: s?.titles || {},
    frames: s?.frames || {},
    crowns: s?.crowns || {},
    month: s?.month || '',
    crownsPending: s?.crownsPending || {},
  });
  return stableJson(pick(a)) === stableJson(pick(b));
}

/**
 * JSON with sorted keys.
 *
 * @param {*} value Anything JSON-able.
 * @return {string}
 */
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
