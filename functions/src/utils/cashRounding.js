/* eslint-disable valid-jsdoc */
// Cash-settlement rounding for the settleCashGame callable and the history
// projection. Server copy of src/utils/cashRounding.js — keep the two in
// sync (tests/cashRounding.test.js checks they agree).

// Float noise guard: 1.005 * 100 = 100.49999999999999.
const SNAP = 1e6;
const EPS = 1e-9;

/** Snap a scaled amount to 1e-6 of a unit before splitting it. */
function snap(x) {
  return Math.round(x * SNAP) / SNAP;
}

/** 0 / 1 / 2, or null for anything else (unset → no rounding). */
export function normalizeCashDecimals(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 2 ? n : null;
}

/**
 * Round exact cash amounts to `decimals` places so they still add up:
 * largest-remainder on signed values, ties to the lower amount first (the
 * leftover unit lowers what a loser pays rather than raising what a winner
 * collects).
 */
export function roundCashZeroSum(values = [], decimals = 0) {
  const d = normalizeCashDecimals(decimals) ?? 0;
  const unit = 10 ** d;
  const scaled = values.map((v) => snap((Number(v) || 0) * unit));

  const items = scaled.map((x, index) => {
    const base = Math.floor(x + EPS);
    return { index, x, base, frac: x - base };
  });

  const target = Math.round(snap(scaled.reduce((sum, x) => sum + x, 0)));
  let leftover = target - items.reduce((sum, it) => sum + it.base, 0);

  const order = [...items].sort((a, b) => {
    if (Math.abs(b.frac - a.frac) > EPS) return b.frac - a.frac;
    if (a.x !== b.x) return a.x - b.x;
    return a.index - b.index;
  });
  for (const it of order) {
    if (leftover <= 0) break;
    it.base += 1;
    leftover -= 1;
  }

  return items.map((it) => Number((it.base / unit).toFixed(d)) || 0);
}

/**
 * Add each row's cash result (`cash`, currency) to settlement rows; rows
 * come back untouched when no rounding is configured.
 */
export function withCashAmounts(rows = [], rate = 1, decimals = null) {
  const d = normalizeCashDecimals(decimals);
  if (d === null) return rows;
  const safeRate = Number(rate) > 0 ? Number(rate) : 1;
  const cash = roundCashZeroSum(rows.map((r) => (Number(r.profit) || 0) / safeRate), d);
  return rows.map((r, i) => ({ ...r, cash: cash[i] }));
}
