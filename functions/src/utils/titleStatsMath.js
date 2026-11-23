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
// A recount instead of counters: each game reads every userTitles doc once
// (cheap at this app's size, and it can never drift).

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
 * @return {{players: number, titles: object, frames: object, crowns: object}}
 */
export function titleStatsFrom(docs, month) {
  const titles = Object.fromEntries(
    TITLE_FAMILIES.map((f) => [f.id, Array(TITLE_TIER_COUNT).fill(0)]),
  );
  const frames = {};
  const crowns = Object.fromEntries(CROWN_IDS.map((id) => [id, 0]));
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
    }
  }
  for (const f of CROWN_FRAMES) frames[f.id] = crowns[f.crown] || 0;
  return { players, titles, frames, crowns };
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
