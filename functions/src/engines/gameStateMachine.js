/**
 * Game State Machine
 * Manages poker game state transitions
 *
 * States:
 * WAITING -> DEALING -> PREFLOP -> FLOP -> TURN -> RIVER -> SHOWDOWN -> SETTLING -> WAITING
 *                                    |                                      ^
 *                                    +-------- LAST_MAN ------------------+
 */

import { GameErrorCodes, createGameError } from '../errors/gameErrors.js';

/**
 * Game states
 */
export const GameStates = {
  WAITING: 'waiting',
  DEALING: 'dealing',
  PREFLOP: 'preflop',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
  LAST_MAN: 'last_man_standing',
  SHOWDOWN: 'showdown',
  SETTLING: 'settling',
};

/**
 * Check if only one active player remains (last man standing)
 * @param {Object} game - Current game state
 * @return {boolean} True if only one active player
 */
export function isLastManStanding(game) {
  const activePlayers = Object.values(game.seats)
    .filter((seat) => seat && seat.status === 'active');

  return activePlayers.length === 1;
}

/**
 * Get all active (non-folded, non-sitting-out) players
 * @param {Object} game - Current game state
 * @return {Array<Object>} Array of active players
 */
export function getActivePlayers(game) {
  return Object.values(game.seats)
    .filter((seat) => seat && seat.status === 'active');
}

/**
 * Get all players still in the hand (active or all-in)
 * @param {Object} game - Current game state
 * @return {Array<Object>} Array of players in hand
 */
export function getPlayersInHand(game) {
  return Object.values(game.seats)
    .filter((seat) => seat && (seat.status === 'active' || seat.status === 'all_in'));
}

/**
 * Check if current betting round is complete
 * @param {Object} game - Current game state
 * @return {boolean} True if round is complete
 */
export function isRoundComplete(game) {
  const activePlayers = getActivePlayers(game);

  // If only one or zero active players, round is complete
  if (activePlayers.length <= 1) {
    return true;
  }

  // Check if all active players have matched the current bet
  const allMatched = activePlayers.every(
    (seat) => seat.currentBet === game.table.currentBet,
  );

  return allMatched;
}

/**
 * Determine next game state based on current state
 * @param {Object} game - Current game state
 * @return {string} Next state
 */
export function getNextState(game) {
  const currentRound = game.table.currentRound;

  // Check for last man standing
  if (isLastManStanding(game)) {
    return GameStates.LAST_MAN;
  }

  // Check if all players are all-in (go straight to showdown)
  const playersInHand = getPlayersInHand(game);
  const allAllIn = playersInHand.every((seat) => seat.status === 'all_in');

  if (allAllIn && playersInHand.length > 1) {
    return GameStates.SHOWDOWN;
  }

  // Normal progression
  switch (currentRound) {
  case 'preflop':
    return GameStates.FLOP;
  case 'flop':
    return GameStates.TURN;
  case 'turn':
    return GameStates.RIVER;
  case 'river':
    return GameStates.SHOWDOWN;
  default:
    return GameStates.WAITING;
  }
}

/**
 * Find next player to act
 * @param {Object} game - Current game state
 * @return {string|null} Next player ID or null
 */
export function findNextPlayer(game) {
  const activePlayers = Object.entries(game.seats)
    .filter(([, seat]) => seat && seat.status === 'active' && seat.chips > 0)
    .map(([num, seat]) => ({ seatNum: parseInt(num), odId: seat.odId }));

  if (activePlayers.length === 0) return null;

  const currentSeatNum = Object.entries(game.seats)
    .find(([, seat]) => seat?.odId === game.table.currentTurn)?.[0];

  const currentIndex = activePlayers
    .findIndex((p) => p.seatNum === parseInt(currentSeatNum));
  const nextIndex = (currentIndex + 1) % activePlayers.length;

  return activePlayers[nextIndex].odId;
}

/**
 * Get first player to act in a new round
 * In post-flop rounds, first to act is first active player after dealer
 * @param {Object} game - Current game state
 * @return {string|null} Player ID or null
 */
export function getFirstToAct(game) {
  const activePlayers = Object.entries(game.seats)
    .filter(([, seat]) => seat && seat.status === 'active' && seat.chips > 0)
    .map(([num, seat]) => ({ seatNum: parseInt(num), odId: seat.odId }))
    .sort((a, b) => a.seatNum - b.seatNum);

  if (activePlayers.length === 0) return null;

  const dealerSeat = game.table.dealerSeat;

  // Find first player after dealer
  let firstPlayer = activePlayers.find((p) => p.seatNum > dealerSeat);

  // If no player after dealer, wrap around
  if (!firstPlayer) {
    firstPlayer = activePlayers[0];
  }

  return firstPlayer.odId;
}

/**
 * Validate state transition
 * @param {string} currentState - Current game state
 * @param {string} nextState - Proposed next state
 * @return {boolean} True if valid, throws error otherwise
 * @throws {Error} If transition is invalid
 */
export function validateStateTransition(currentState, nextState) {
  const validTransitions = {
    [GameStates.WAITING]: [GameStates.DEALING],
    [GameStates.DEALING]: [GameStates.PREFLOP],
    [GameStates.PREFLOP]: [GameStates.FLOP, GameStates.LAST_MAN, GameStates.SHOWDOWN],
    [GameStates.FLOP]: [GameStates.TURN, GameStates.LAST_MAN, GameStates.SHOWDOWN],
    [GameStates.TURN]: [GameStates.RIVER, GameStates.LAST_MAN, GameStates.SHOWDOWN],
    [GameStates.RIVER]: [GameStates.SHOWDOWN, GameStates.LAST_MAN],
    [GameStates.LAST_MAN]: [GameStates.SETTLING],
    [GameStates.SHOWDOWN]: [GameStates.SETTLING],
    [GameStates.SETTLING]: [GameStates.WAITING],
  };

  const allowed = validTransitions[currentState] || [];

  if (!allowed.includes(nextState)) {
    throw createGameError(GameErrorCodes.INVALID_ACTION, {
      message: `Invalid state transition from ${currentState} to ${nextState}`,
    });
  }

  return true;
}
