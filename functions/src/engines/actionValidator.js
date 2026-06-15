/**
 * Action Validator
 * Validates player actions in poker game
 */

import { GameErrorCodes, createGameError } from '../errors/gameErrors.js';

/**
 * Pure, non-throwing player-action check shared by the backend and the
 * frontend. The backend wraps this to throw structured errors; the frontend
 * calls it directly to block illegal moves instantly (no callable round-trip,
 * no error toast). Keep this function free of firebase-admin / Node deps so it
 * stays importable from the Vue client bundle.
 *
 * @param {Object} game - Current game state
 * @param {string} playerId - Player making the action
 * @param {string} action - Action type (fold, check, call, raise, all_in)
 * @param {number} amount - Bet amount (for raise)
 * @return {Object} Verdict: `{ valid: true }`, or `{ valid: false, code,
 *   details }` carrying the failing error code and details for messaging.
 */
export function checkPlayerAction(game, playerId, action, amount = 0) {
  // Check if it's the player's turn
  if (game.table.currentTurn !== playerId) {
    return { valid: false, code: GameErrorCodes.NOT_YOUR_TURN };
  }

  // Get player's seat
  const playerSeat = Object.values(game.seats)
    .find((seat) => seat && seat.odId === playerId);

  if (!playerSeat) {
    return { valid: false, code: GameErrorCodes.PLAYER_NOT_FOUND };
  }

  // Check player status
  if (playerSeat.status === 'folded') {
    return { valid: false, code: GameErrorCodes.ALREADY_FOLDED };
  }

  if (playerSeat.status === 'all_in') {
    return {
      valid: false,
      code: GameErrorCodes.INVALID_PLAYER_STATUS,
      details: { status: 'all_in', message: '你已經全下了' },
    };
  }

  const currentBet = game.table.currentBet || 0;
  const playerChips = playerSeat.chips;
  const playerRoundBet = playerSeat.roundBet || 0;
  const callAmount = currentBet - playerRoundBet;

  switch (action) {
  case 'fold':
    // Always valid
    return { valid: true };

  case 'check':
    // Can only check if no bet to call
    if (callAmount > 0) {
      return { valid: false, code: GameErrorCodes.CANNOT_CHECK, details: { callAmount } };
    }
    return { valid: true };

  case 'call':
    // Must have bet to call
    if (callAmount === 0) {
      return { valid: false, code: GameErrorCodes.NOTHING_TO_CALL };
    }
    // Allow calling all-in for less than the required call amount.
    // (The engine will cap the contributed chips via Math.min and mark all-in.)
    if (playerChips <= 0) {
      return {
        valid: false,
        code: GameErrorCodes.NOT_ENOUGH_CHIPS,
        details: { required: callAmount, available: playerChips },
      };
    }
    return { valid: true };

  case 'raise': {
    // Must specify valid raise amount
    if (!amount || amount <= 0) {
      return {
        valid: false,
        code: GameErrorCodes.INVALID_RAISE_AMOUNT,
        details: { amount, message: '加注金額必須大於0' },
      };
    }

    // Total bet must be at least minimum raise
    const totalBet = playerRoundBet + amount;
    const minRaise = currentBet + (game.table.minRaise || game.meta.blinds.big);

    if (totalBet < minRaise) {
      return {
        valid: false,
        code: GameErrorCodes.INVALID_RAISE_AMOUNT,
        details: { minRaise: minRaise - playerRoundBet, provided: amount },
      };
    }

    // Player must have enough chips
    if (amount > playerChips) {
      return {
        valid: false,
        code: GameErrorCodes.INSUFFICIENT_CHIPS,
        details: { required: amount, available: playerChips },
      };
    }
    return { valid: true };
  }

  case 'all_in':
    // Always valid if player has chips
    if (playerChips <= 0) {
      return { valid: false, code: GameErrorCodes.NO_CHIPS_FOR_ALL_IN };
    }
    return { valid: true };

  default:
    return { valid: false, code: GameErrorCodes.INVALID_ACTION, details: { action } };
  }
}

/**
 * Validate player action (throwing wrapper around {@link checkPlayerAction}).
 * @param {Object} game - Current game state
 * @param {string} playerId - Player making the action
 * @param {string} action - Action type (fold, check, call, raise, all_in)
 * @param {number} amount - Bet amount (for raise)
 * @return {boolean} True if valid, throws error otherwise
 * @throws {Error} Throws structured error if validation fails
 */
export function validatePlayerAction(game, playerId, action, amount = 0) {
  const result = checkPlayerAction(game, playerId, action, amount);
  if (!result.valid) {
    throw createGameError(result.code, result.details || {});
  }
  return true;
}

/**
 * Validate game can start
 * @param {Object} game - Game state
 * @return {boolean} True if valid, throws error otherwise
 * @throws {Error} Throws structured error if validation fails
 */
export function validateGameStart(game) {
  // Count active players
  const activePlayers = Object.values(game.seats)
    .filter((seat) => seat && seat.chips > 0);

  if (activePlayers.length < 2) {
    throw createGameError(GameErrorCodes.NOT_ENOUGH_PLAYERS, {
      count: activePlayers.length,
    });
  }

  if (game.status !== 'waiting') {
    throw createGameError(GameErrorCodes.GAME_ALREADY_IN_PROGRESS, {
      status: game.status,
    });
  }

  return true;
}
