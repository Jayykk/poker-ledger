// 稱號 ladders against real stats: how many players reach each tier of each
// family, and how many titles (titleCount) they would hold. Pure, so
// functions/scripts/simulate_title_tiers.js (read-only, production) and the
// tests share it. Used to pick FRAME_TIERS after a ladder change.

import { FRAME_TIERS, TITLE_FAMILIES, TITLE_TIER_COUNT, evaluateTitles, titleCount } from './titleRules.js';

const num = (value) => Number(value) || 0;

/**
 * Value at a percentile of an ascending list (nearest rank).
 *
 * @param {Array<number>} sorted Ascending values.
 * @param {number} p Percentile 0..100.
 * @return {number}
 */
export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

/**
 * Tier reach per family and the titleCount spread over a set of all-time
 * stats docs (leaderboardStats `{uid}_all`).
 *
 * @param {Array<object>} statsDocs All-time stats docs ({ uid, total, cash, tournament }).
 * @return {object} `{ players, families: [{ id, hidden, top, reached }],
 *   counts, histogram, percentiles, frames: [{ id, min, players }] }`:
 *   `reached[t - 1]` = players at tier t or higher, `top` = the highest metric
 *   value, `counts` = each player's titleCount, ascending.
 */
export function summarizeTitleTiers(statsDocs) {
  const docs = (statsDocs || []).filter(Boolean);
  const families = TITLE_FAMILIES.map((fam) => ({
    id: fam.id,
    hidden: fam.hidden,
    top: 0,
    reached: Array(TITLE_TIER_COUNT).fill(0),
  }));
  const byId = new Map(families.map((f) => [f.id, f]));
  const counts = [];
  for (const stats of docs) {
    const tiers = evaluateTitles(stats);
    for (const fam of TITLE_FAMILIES) {
      const row = byId.get(fam.id);
      row.top = Math.max(row.top, num(fam.metric(stats)));
      const tier = tiers[fam.id] || 0;
      for (let t = 1; t <= tier; t++) row.reached[t - 1] += 1;
    }
    const unlocked = {};
    for (const [id, tier] of Object.entries(tiers)) unlocked[id] = { tier, at: 0 };
    counts.push(titleCount(unlocked));
  }
  counts.sort((a, b) => a - b);
  const histogram = {};
  for (const n of counts) histogram[n] = (histogram[n] || 0) + 1;
  const percentiles = Object.fromEntries([50, 75, 90, 95, 99, 100]
    .map((p) => [`p${p}`, percentile(counts, p)]));
  const frames = FRAME_TIERS.map((frame) => ({
    id: frame.id,
    min: frame.min,
    players: counts.filter((n) => n >= frame.min).length,
  }));
  return { players: docs.length, families, counts, histogram, percentiles, frames };
}

/**
 * The summary as plain text lines (the script prints these).
 *
 * @param {object} summary summarizeTitleTiers() result.
 * @return {Array<string>}
 */
export function formatTitleTierSummary(summary) {
  const pad = (value, width) => String(value).padStart(width);
  const lines = [];
  lines.push(`Players: ${summary.players}`);
  lines.push('');
  lines.push('Players at tier ≥ n, per family (top = highest metric value):');
  const head = Array.from({ length: TITLE_TIER_COUNT }, (_, i) => pad(`t${i + 1}`, 5)).join('');
  lines.push(`${'family'.padEnd(15)}${head}   top`);
  for (const row of summary.families) {
    const name = `${row.id}${row.hidden ? '*' : ''}`.padEnd(15);
    const cells = row.reached.map((n) => pad(n, 5)).join('');
    lines.push(`${name}${cells}   ${Math.round(row.top * 100) / 100}`);
  }
  lines.push('(* hidden family)');
  lines.push('');
  lines.push('titleCount (steps held across all families):');
  lines.push(`  ${Object.entries(summary.percentiles).map(([k, v]) => `${k}=${v}`).join('  ')}`);
  lines.push(`  histogram: ${Object.entries(summary.histogram).map(([n, c]) => `${n}:${c}`).join('  ')}`);
  lines.push('');
  lines.push('Players per frame with the current FRAME_TIERS:');
  for (const frame of summary.frames) {
    lines.push(`  ${frame.id.padEnd(9)} min ${pad(frame.min, 3)}  →  ${frame.players}`);
  }
  return lines;
}
