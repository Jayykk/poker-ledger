/**
 * Validators for Texas Hold'em game actions
 * Ensures game integrity and fair play
 */

/**
 * Validate player action
 * @param {Object} game - Current game state
 * @param {string} playerId - Player making the action
 * @param {string} action - Action type (fold, check, call, raise, all_in)
 * @param {number} amount - Bet amount (for raise)
 * @return {{ valid: boolean, error: string }}
 */
export function validatePlayerAction(game, playerId, action, amount = 0) {
  // Check if it's the player's turn
  if (game.table.currentTurn !== playerId) {
    return { valid: false, error: 'Not your turn' };
  }

  // Get player's seat
  const playerSeat = Object.values(game.seats)
    .find((seat) => seat && seat.odId === playerId);

  if (!playerSeat) {
    return { valid: false, error: 'Player not in game' };
  }

  // Check player status
  if (playerSeat.status === 'folded' || playerSeat.status === 'all_in') {
    return { valid: false, error: 'Invalid player status' };
  }

  const currentBet = game.table.currentBet || 0;
  const playerChips = playerSeat.chips;
  const playerCurrentBet = playerSeat.currentBet || 0;
  const callAmount = currentBet - playerCurrentBet;

  switch (action) {
  case 'fold':
    // Always valid (except when can check)
    return { valid: true, error: null };

  case 'check':
    // Can only check if no bet to call
    if (callAmount > 0) {
      return { valid: false, error: 'Cannot check, must call or fold' };
    }
    
    // Cannot check if someone went all-in with higher bet
    const hasHigherAllIn = Object.values(game.seats).some(
      seat => seat && 
      seat.odId !== playerId && 
      seat.status === 'all_in' && 
      seat.currentBet > playerCurrentBet
    );
    
    if (hasHigherAllIn) {
      return { valid: false, error: 'Cannot check after all-in, must call or fold' };
    }
    
    return { valid: true, error: null };

  case 'call':
    // Must have bet to call
    if (callAmount === 0) {
      return { valid: false, error: 'Nothing to call' };
    }
    // Player must have enough chips (or go all-in)
    if (callAmount > playerChips) {
      return { valid: false, error: 'Not enough chips to call' };
    }
    return { valid: true, error: null };

  case 'raise': {
    // Must specify valid raise amount
    if (!amount || amount <= 0) {
      return { valid: false, error: 'Invalid raise amount' };
    }
    // Total bet must be at least minimum raise
    const totalBet = playerCurrentBet + amount;
    const minRaise = currentBet + (game.table.minRaise || game.meta.blinds.big);
    if (totalBet < minRaise) {
      return {
        valid: false,
        error: `Minimum raise is ${minRaise - playerCurrentBet}`,
      };
    }
    // Player must have enough chips
    if (amount > playerChips) {
      return { valid: false, error: 'Not enough chips to raise' };
    }
    return { valid: true, error: null };
  }
  case 'all_in':
    // Always valid if player has chips
    if (playerChips <= 0) {
      return { valid: false, error: 'No chips to go all-in' };
    }
    return { valid: true, error: null };

  default:
    return { valid: false, error: 'Invalid action' };
  }
}

/**
 * Validate game can start
 * @param {Object} game - Game state
 * @return {{ valid: boolean, error: string }}
 */
export function validateGameStart(game) {
  // Count active players
  const activePlayers = Object.values(game.seats)
    .filter((seat) => seat && seat.chips > 0);

  if (activePlayers.length < 2) {
    return { valid: false, error: 'Need at least 2 players to start' };
  }

  if (game.status !== 'waiting') {
    return { valid: false, error: 'Game already in progress' };
  }

  return { valid: true, error: null };
}

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
