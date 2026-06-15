/**
 * Poker Entry helpers
 * Pure decision logic for the online-poker entry flow (P4-2): auto-starting the
 * first hand, auto-seating a player who arrives via a share link, and building
 * the room config for the one-click "online poker" create flow.
 *
 * Kept free of Vue/Firebase so the rules can be unit-tested directly; the
 * components just act on what these return.
 */

/** Count seated players who still have chips. */
function countFundedSeats(game) {
  return Object.values(game.seats || {}).filter((s) => s && s.chips > 0).length;
}

/**
 * Decide whether the FIRST hand of a room should auto-start.
 * Between-hands continuation is already driven by the backend `isAutoNext`
 * flag, so this only covers a brand-new room (handNumber 0, still waiting).
 * Only the host should trigger it, to avoid every client racing to deal.
 *
 * @param {Object} game - Current game state (pokerGames doc)
 * @param {string} userId - The local user's uid
 * @return {boolean} True when the host's client should begin the auto-deal.
 */
export function shouldAutoStartFirstHand(game, userId) {
  if (!game || !userId) return false;
  if (game.status !== 'waiting') return false;
  if ((game.handNumber ?? 0) !== 0) return false; // a hand has already been played
  if (game.meta?.createdBy !== userId) return false; // only the host triggers
  return countFundedSeats(game) >= 2;
}

/**
 * Decide whether to auto-seat an arriving user ("open link → sit down").
 * Returns the buy-in to sit with, or null to leave them on the manual path
 * (already seated, table full, or the game is not joinable).
 *
 * @param {Object} game - Current game state (pokerGames doc)
 * @param {string} userId - The local user's uid
 * @return {?number} Buy-in amount to seat with, or null to do nothing.
 */
export function resolveAutoSeat(game, userId) {
  if (!game || !userId) return null;

  const joinable = game.status === 'waiting' || game.status === 'playing';
  if (!joinable) return null;

  const seats = game.seats || {};
  const alreadySeated = Object.values(seats).some((s) => s && s.odId === userId);
  if (alreadySeated) return null; // includes the auto-seated host

  const hasEmptySeat = Object.values(seats).some((s) => s === null);
  if (!hasEmptySeat) return null; // full → fall back to manual / spectate

  const buyIn = Number(game.meta?.maxBuyIn) || Number(game.meta?.minBuyIn) || 0;
  return buyIn > 0 ? buyIn : null;
}

/**
 * Build a pokerGames room config for the one-click "online poker" create flow
 * in the unified lobby. The chosen buy-in becomes both the host's stack and the
 * room's fixed buy-in band, so every player (host + link joiners) sits with the
 * same stack.
 *
 * @param {Object} opts
 * @param {number} opts.buyIn - Chosen buy-in / starting stack
 * @param {number} [opts.smallBlind]
 * @param {number} [opts.bigBlind]
 * @return {Object} Config accepted by the createPokerRoom callable.
 */
export function buildOnlineRoomConfig({ buyIn, smallBlind = 10, bigBlind = 20 } = {}) {
  const stack = Number(buyIn) > 0 ? Number(buyIn) : 1000;
  return {
    mode: 'cash',
    smallBlind,
    bigBlind,
    minBuyIn: stack,
    maxBuyIn: stack,
    buyIn: stack, // host's own buy-in → auto-seated on create
    turnTimeout: 30,
  };
}
