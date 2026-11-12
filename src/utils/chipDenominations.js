// Chip denominations (籌碼面額) — an optional module of a cash table template.
//
// A template may list the chips the table plays with (10000 / 5000 / 1000 …).
// A table made from it carries the list (games/{id}.denominations), and the
// final-stack form then also takes a count per chip and works the stack out.
// The counts are kept on the seat (players[].stackCounts, { '5000': 8 }) so
// the form reopens with them — but only while they still add up to the stack:
// the stack is what settles, the counts are just how it was reached.
// Pure functions only (unit-tested).

/** A table rarely has more than a handful of colours. */
export const MAX_DENOMINATIONS = 10;

/** Offered as one-tap additions in the template editor. */
export const COMMON_DENOMINATIONS = Object.freeze([10000, 5000, 1000, 500, 100, 25]);

const wholePositive = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The list as stored: whole positive values, no repeats, biggest first.
 * Anything that isn't a list is no denominations.
 *
 * @param {*} raw
 * @returns {number[]}
 */
export function normalizeDenominations(raw) {
  if (!Array.isArray(raw)) return [];
  const values = [...new Set(raw.map(wholePositive).filter((n) => n !== null))];
  return values.sort((a, b) => b - a).slice(0, MAX_DENOMINATIONS);
}

/**
 * Counts as stored: only the table's denominations, whole and above zero.
 * Keys are strings (Firestore map keys).
 *
 * @param {*} counts { [denomination]: count }
 * @param {number[]} denominations
 * @returns {Object<string, number>}
 */
export function normalizeChipCounts(counts, denominations) {
  const out = {};
  if (!counts || typeof counts !== 'object') return out;
  for (const d of normalizeDenominations(denominations)) {
    const n = wholePositive(counts[d]);
    if (n !== null) out[String(d)] = n;
  }
  return out;
}

/** What the counts add up to. */
export function chipCountTotal(counts) {
  if (!counts || typeof counts !== 'object') return 0;
  return Object.entries(counts).reduce((sum, [d, n]) => {
    const value = wholePositive(d);
    const count = wholePositive(n);
    return value !== null && count !== null ? sum + value * count : sum;
  }, 0);
}

/**
 * The seat's saved counts, when they can still be shown: the table has
 * denominations and the counts add up to the seat's stack. Otherwise {} —
 * the stack was typed (or changed) without them.
 *
 * @param {{stack?: number, stackCounts?: object}} player
 * @param {number[]} denominations
 * @returns {Object<string, number>}
 */
export function countsForStack(player, denominations) {
  const counts = normalizeChipCounts(player?.stackCounts, denominations);
  if (!Object.keys(counts).length) return {};
  return chipCountTotal(counts) === (Number(player?.stack) || 0) ? counts : {};
}
