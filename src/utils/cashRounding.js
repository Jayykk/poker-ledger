// Cash-settlement rounding (結算金額四捨五入).
//
// A cash game's result per player is profit (chips) ÷ rate. Rounding each
// player on their own breaks the books: rate 10, +15 / −5 / −10 chips is
// +1.5 / −0.5 / −1 → naive rounding gives +2 / 0 / −1, one dollar that
// nobody pays. roundCashZeroSum keeps the rounded total equal to the exact
// total (0 when chips balance), each player within one unit of their exact
// amount, and — when two players' fractions tie — the winner collects less
// rather than a loser paying more.
//
// ⚠️ Keep in sync with functions/src/utils/cashRounding.js (the settlement
// Cloud Function's copy); tests/cashRounding.test.js checks both agree.

/** Allowed decimal places; null = legacy behaviour (no rounding). */
export const CASH_DECIMAL_OPTIONS = [null, 0, 1, 2];

/** 0 / 1 / 2, or null for anything else (unset → no rounding). */
export function normalizeCashDecimals(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 2 ? n : null;
}

// Float noise guard: 1.005 * 100 = 100.49999999999999. Values are snapped to
// 1e-6 of a unit before splitting into whole units + fraction.
const SNAP = 1e6;
const snap = (x) => Math.round(x * SNAP) / SNAP;
const EPS = 1e-9;

/**
 * Round exact cash amounts to `decimals` places so they still add up.
 *
 * Largest-remainder method on signed values: floor every amount, then hand
 * the missing units (rounded exact total − floored total) to the largest
 * fractions. Ties go to the lower amount first (losers before winners), so
 * the leftover unit lowers what a loser pays instead of raising what a
 * winner collects.
 *
 * @param {Array<number>} values - exact amounts (e.g. profit / rate)
 * @param {number} decimals - 0, 1 or 2
 * @returns {Array<number>} rounded amounts, same order
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
    if (Math.abs(b.frac - a.frac) > EPS) return b.frac - a.frac; // bigger fraction first
    if (a.x !== b.x) return a.x - b.x;                            // tie: lower amount (loser) first
    return a.index - b.index;
  });
  for (const it of order) {
    if (leftover <= 0) break;
    it.base += 1;
    leftover -= 1;
  }

  // Normalise -0 and float tails (e.g. 0.30000000000000004).
  return items.map((it) => Number((it.base / unit).toFixed(d)) || 0);
}

/**
 * Add each row's cash result (`cash`, in currency) to settlement rows.
 * With no rounding configured the rows come back untouched — readers then
 * fall back to profit / rate like before.
 *
 * @param {Array<{profit: number}>} rows - settlement rows (chip profit)
 * @param {number} rate - chips per currency unit
 * @param {number|null} decimals - normalizeCashDecimals() value
 */
export function withCashAmounts(rows = [], rate = 1, decimals = null) {
  const d = normalizeCashDecimals(decimals);
  if (d === null) return rows;
  const safeRate = Number(rate) > 0 ? Number(rate) : 1;
  const cash = roundCashZeroSum(rows.map((r) => (Number(r.profit) || 0) / safeRate), d);
  return rows.map((r, i) => ({ ...r, cash: cash[i] }));
}

/** A settlement row's cash result: stored (rounded) value, else profit / rate. */
export function rowCash(row, rate = 1) {
  if (Number.isFinite(row?.cash)) return row.cash;
  const safeRate = Number(rate) > 0 ? Number(rate) : 1;
  return (Number(row?.profit) || 0) / safeRate;
}

/** A history record's cash result: stored profitCash, else profit / rate. */
export function recordCash(record) {
  if (Number.isFinite(record?.profitCash)) return record.profitCash;
  const rate = Number(record?.rate) > 0 ? Number(record.rate) : 1;
  return (Number(record?.profit) || 0) / rate;
}

/**
 * Display a cash amount. With decimals set, exactly that many places;
 * unset keeps the legacy look (integer, else one decimal).
 */
export function formatCashAmount(value, decimals = null) {
  const v = Number(value) || 0;
  const d = normalizeCashDecimals(decimals);
  if (d === null) return Number.isInteger(v) ? v.toString() : v.toFixed(1);
  return v.toFixed(d);
}
