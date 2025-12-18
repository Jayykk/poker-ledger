/**
 * Action Validator
 * Validates player actions in poker game
 */

import { GameErrorCodes, createGameError } from '../errors/gameErrors.js';

/**
 * Validate player action
 * @param {Object} game - Current game state
 * @param {string} playerId - Player making the action
 * @param {string} action - Action type (fold, check, call, raise, all_in)
 * @param {number} amount - Bet amount (for raise)
 * @return {boolean} True if valid, throws error otherwise
 * @throws {Error} Throws structured error if validation fails
 */
export function validatePlayerAction(game, playerId, action, amount = 0) {
  // Check if it's the player's turn
  if (game.table.currentTurn !== playerId) {
    throw createGameError(GameErrorCodes.NOT_YOUR_TURN);
  }

  // Get player's seat
  const playerSeat = Object.values(game.seats)
    .find((seat) => seat && seat.odId === playerId);

  if (!playerSeat) {
    throw createGameError(GameErrorCodes.PLAYER_NOT_FOUND);
  }

  // Check player status
  if (playerSeat.status === 'folded') {
    throw createGameError(GameErrorCodes.ALREADY_FOLDED);
  }

  if (playerSeat.status === 'all_in') {
    throw createGameError(GameErrorCodes.INVALID_PLAYER_STATUS, {
      status: 'all_in',
      message: '你已經全下了',
    });
  }

  const currentBet = game.table.currentBet || 0;
  const playerChips = playerSeat.chips;
  const playerRoundBet = playerSeat.roundBet || 0;
  const callAmount = currentBet - playerRoundBet;

  switch (action) {
  case 'fold':
    // Always valid
    return true;

  case 'check':
    // Can only check if no bet to call
    if (callAmount > 0) {
      throw createGameError(GameErrorCodes.CANNOT_CHECK, {
        callAmount,
      });
    }
    return true;

  case 'call':
    // Must have bet to call
    if (callAmount === 0) {
      throw createGameError(GameErrorCodes.NOTHING_TO_CALL);
    }
    // Player must have enough chips (or go all-in)
    if (callAmount > playerChips) {
      throw createGameError(GameErrorCodes.NOT_ENOUGH_CHIPS, {
        required: callAmount,
        available: playerChips,
      });
    }
    return true;

  case 'raise': {
    // Must specify valid raise amount
    if (!amount || amount <= 0) {
      throw createGameError(GameErrorCodes.INVALID_RAISE_AMOUNT, {
        amount,
        message: '加注金額必須大於0',
      });
    }

    // Total bet must be at least minimum raise
    const totalBet = playerRoundBet + amount;
    const minRaise = currentBet + (game.table.minRaise || game.meta.blinds.big);

    if (totalBet < minRaise) {
      throw createGameError(GameErrorCodes.INVALID_RAISE_AMOUNT, {
        minRaise: minRaise - playerRoundBet,
        provided: amount,
      });
    }

    // Player must have enough chips
    if (amount > playerChips) {
      throw createGameError(GameErrorCodes.INSUFFICIENT_CHIPS, {
        required: amount,
        available: playerChips,
      });
    }
    return true;
  }

  case 'all_in':
    // Always valid if player has chips
    if (playerChips <= 0) {
      throw createGameError(GameErrorCodes.NO_CHIPS_FOR_ALL_IN);
    }
    return true;

  default:
    throw createGameError(GameErrorCodes.INVALID_ACTION, { action });
  }
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
