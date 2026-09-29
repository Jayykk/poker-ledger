// Buy-in amount ↔ settlement rate.
//
// A game's `rate` is chips per one currency unit: cash = chips / rate
// (rate 10 → 10 chips = $1). Hosts think in "one buy-in of N chips costs $M",
// so presets / game creation / the settlement dialog take the buy-in amount
// and derive the rate from it. `rate` stays the stored source of truth for
// settlement and reports; `buyInAmount` is kept alongside for display.

/** Rate (chips per currency unit) for `chips` bought for `amount`; null if invalid. */
export function rateFromBuyIn(chips, amount) {
  const c = Number(chips);
  const a = Number(amount);
  if (!Number.isFinite(c) || !Number.isFinite(a) || c <= 0 || a <= 0) return null;
  return c / a;
}

/**
 * Buy-in amount implied by a rate (for presets / games saved before
 * buyInAmount existed), rounded to cents. null if invalid.
 */
export function buyInAmountFromRate(chips, rate) {
  const c = Number(chips);
  const r = Number(rate);
  if (!Number.isFinite(c) || !Number.isFinite(r) || c <= 0 || r <= 0) return null;
  return Math.round((c / r) * 100) / 100;
}

/** A stored buyInAmount, else the one implied by the rate. */
export function resolveBuyInAmount({ buyInAmount, buyIn, rate } = {}) {
  const stored = Number(buyInAmount);
  if (Number.isFinite(stored) && stored > 0) return stored;
  return buyInAmountFromRate(buyIn, rate);
}

/** Rate for display: up to 4 decimals, trailing zeros dropped (10, 3.3333). */
export function formatRate(rate) {
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return '-';
  return String(Number(r.toFixed(4)));
}
