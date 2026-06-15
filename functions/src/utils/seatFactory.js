/**
 * Seat Factory
 * Pure helpers for building a seated-player object and resolving a buy-in.
 * Shared by room creation (auto-seating the host) and join-seat so the seat
 * shape stays identical. Kept free of firebase-admin / Node deps so it can be
 * unit-tested directly (and stays trivially portable).
 */

/**
 * Build a seated-player object.
 * @param {string} userId - Player user ID
 * @param {Object} userInfo - { name, avatar }
 * @param {number} buyIn - Chips the player sits down with
 * @return {Object} Seat data ready to write into game.seats[n]
 */
export function buildSeatData(userId, userInfo, buyIn) {
  return {
    odId: userId,
    odName: userInfo?.name || 'Player',
    odAvatar: userInfo?.avatar || '',
    chips: buyIn,
    initialBuyIn: buyIn, // Track initial buy-in for settlement
    status: 'active',
    currentBet: 0,
    isDealer: false,
    isSmallBlind: false,
    isBigBlind: false,
  };
}

/**
 * Resolve a requested buy-in into the room's [minBuyIn, maxBuyIn] band.
 * @param {*} requested - Requested buy-in (may be undefined / a string)
 * @param {number} minBuyIn - Room minimum buy-in
 * @param {number} maxBuyIn - Room maximum buy-in
 * @return {?number} Clamped buy-in, or null when no usable amount was provided
 */
export function resolveBuyIn(requested, minBuyIn, maxBuyIn) {
  const n = Number(requested);
  if (!Number.isFinite(n) || n <= 0) return null;
  const lo = Number.isFinite(minBuyIn) ? minBuyIn : n;
  const hi = Number.isFinite(maxBuyIn) && maxBuyIn >= lo ? maxBuyIn : n;
  return Math.min(Math.max(n, lo), hi);
}
