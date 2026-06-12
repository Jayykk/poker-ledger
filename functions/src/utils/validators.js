/**
 * Validators for Texas Hold'em game actions
 * Ensures game integrity and fair play
 */

/**
 * Validate player can join seat
 * @param {Object} game - Game state
 * @param {number} seatNumber - Seat to join
 * @param {number} buyIn - Buy-in amount
 * @param {string} userId - User ID trying to join
 * @return {{ valid: boolean, error: string }}
 */
export function validateJoinSeat(game, seatNumber, buyIn, userId) {
  // Check if player is already seated
  const alreadySeated = Object.values(game.seats || {})
    .some((seat) => seat && seat.odId === userId);

  if (alreadySeated) {
    return { valid: false, error: 'Already seated at this table' };
  }

  // Check seat number is valid
  if (seatNumber < 0 || seatNumber >= game.meta.maxPlayers) {
    return { valid: false, error: 'Invalid seat number' };
  }

  // Check seat is empty
  if (game.seats[seatNumber]) {
    return { valid: false, error: 'Seat already occupied' };
  }

  // Check buy-in amount
  if (buyIn < game.meta.minBuyIn) {
    return { valid: false, error: `Minimum buy-in is ${game.meta.minBuyIn}` };
  }

  if (buyIn > game.meta.maxBuyIn) {
    return { valid: false, error: `Maximum buy-in is ${game.meta.maxBuyIn}` };
  }

  return { valid: true, error: null };
}
