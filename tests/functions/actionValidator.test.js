/**
 * Unit tests for functions/src/engines/actionValidator.js
 * Tests the real module — no mocks. Errors are structured per
 * functions/src/errors/gameErrors.js (error.code + error.details).
 */
import { describe, it, expect } from 'vitest';
import {
  validatePlayerAction,
  validateGameStart,
} from '../../functions/src/engines/actionValidator.js';
import { GameErrorCodes } from '../../functions/src/errors/gameErrors.js';

/** Build a minimal game state matching what the validator reads. */
function makeGame({ table = {}, seats = {}, status = 'playing', blinds } = {}) {
  return {
    status,
    meta: { blinds: blinds || { small: 10, big: 20 } },
    table: {
      currentTurn: 'p1',
      currentBet: 0,
      minRaise: 20,
      ...table,
    },
    seats: {
      1: { odId: 'p1', odName: 'Alice', chips: 1000, status: 'active', roundBet: 0 },
      2: { odId: 'p2', odName: 'Bob', chips: 1000, status: 'active', roundBet: 0 },
      3: null,
      ...seats,
    },
  };
}

/** Capture the thrown structured error for assertions. */
function getError(fn) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
}

describe('validatePlayerAction — turn and player checks', () => {
  it('rejects an action when it is not the player\'s turn', () => {
    const game = makeGame(); // currentTurn is p1
    const err = getError(() => validatePlayerAction(game, 'p2', 'fold'));
    expect(err).not.toBeNull();
    expect(err.code).toBe(GameErrorCodes.NOT_YOUR_TURN);
    expect(err.message).toBe('還沒輪到你');
  });

  it('rejects when the acting player has no seat', () => {
    const game = makeGame({ table: { currentTurn: 'ghost' } });
    const err = getError(() => validatePlayerAction(game, 'ghost', 'fold'));
    expect(err.code).toBe(GameErrorCodes.PLAYER_NOT_FOUND);
  });

  it('rejects any action from a player who already folded', () => {
    const game = makeGame({
      seats: { 1: { odId: 'p1', chips: 500, status: 'folded', roundBet: 0 } },
    });
    const err = getError(() => validatePlayerAction(game, 'p1', 'check'));
    expect(err.code).toBe(GameErrorCodes.ALREADY_FOLDED);
  });

  it('rejects any action from a player who is already all-in', () => {
    const game = makeGame({
      seats: { 1: { odId: 'p1', chips: 0, status: 'all_in', roundBet: 300 } },
    });
    const err = getError(() => validatePlayerAction(game, 'p1', 'call'));
    expect(err.code).toBe(GameErrorCodes.INVALID_PLAYER_STATUS);
    expect(err.details.status).toBe('all_in');
  });

  it('rejects an unknown action type', () => {
    const game = makeGame();
    const err = getError(() => validatePlayerAction(game, 'p1', 'bet', 50));
    expect(err.code).toBe(GameErrorCodes.INVALID_ACTION);
    expect(err.details.action).toBe('bet');
  });
});

describe('validatePlayerAction — fold', () => {
  it('is valid with no bet outstanding', () => {
    expect(validatePlayerAction(makeGame(), 'p1', 'fold')).toBe(true);
  });

  it('is valid even when facing a bet', () => {
    const game = makeGame({ table: { currentBet: 500 } });
    expect(validatePlayerAction(game, 'p1', 'fold')).toBe(true);
  });
});

describe('validatePlayerAction — check', () => {
  it('is valid when there is nothing to call', () => {
    expect(validatePlayerAction(makeGame(), 'p1', 'check')).toBe(true);
  });

  it('is valid when the player has already matched the current bet', () => {
    const game = makeGame({
      table: { currentBet: 20 },
      seats: { 1: { odId: 'p1', chips: 980, status: 'active', roundBet: 20 } },
    });
    expect(validatePlayerAction(game, 'p1', 'check')).toBe(true);
  });

  it('is blocked when facing an unmatched bet', () => {
    const game = makeGame({ table: { currentBet: 50 } });
    const err = getError(() => validatePlayerAction(game, 'p1', 'check'));
    expect(err.code).toBe(GameErrorCodes.CANNOT_CHECK);
    expect(err.details.callAmount).toBe(50);
  });
});

describe('validatePlayerAction — call', () => {
  it('rejects a call when there is nothing to call', () => {
    const err = getError(() => validatePlayerAction(makeGame(), 'p1', 'call'));
    expect(err.code).toBe(GameErrorCodes.NOTHING_TO_CALL);
  });

  it('is valid when facing a bet with sufficient chips', () => {
    const game = makeGame({ table: { currentBet: 100 } });
    expect(validatePlayerAction(game, 'p1', 'call')).toBe(true);
  });

  it('allows a short-stack call for less than the full call amount', () => {
    // p1 has only 60 chips against a 500 bet — engine caps the call at the
    // stack and marks all-in, so validation must allow it.
    const game = makeGame({
      table: { currentBet: 500 },
      seats: { 1: { odId: 'p1', chips: 60, status: 'active', roundBet: 0 } },
    });
    expect(validatePlayerAction(game, 'p1', 'call')).toBe(true);
  });

  it('rejects a call from a player with zero chips', () => {
    const game = makeGame({
      table: { currentBet: 100 },
      seats: { 1: { odId: 'p1', chips: 0, status: 'active', roundBet: 0 } },
    });
    const err = getError(() => validatePlayerAction(game, 'p1', 'call'));
    expect(err.code).toBe(GameErrorCodes.NOT_ENOUGH_CHIPS);
    expect(err.details.required).toBe(100);
    expect(err.details.available).toBe(0);
  });
});

describe('validatePlayerAction — raise', () => {
  it('rejects a raise with no amount', () => {
    const err = getError(() => validatePlayerAction(makeGame(), 'p1', 'raise'));
    expect(err.code).toBe(GameErrorCodes.INVALID_RAISE_AMOUNT);
  });

  it('rejects a raise with a non-positive amount', () => {
    const err = getError(() => validatePlayerAction(makeGame(), 'p1', 'raise', -10));
    expect(err.code).toBe(GameErrorCodes.INVALID_RAISE_AMOUNT);
  });

  it('rejects a raise below the minimum raise', () => {
    // currentBet 100 + minRaise 100 => total must reach 200; 150 is too small.
    const game = makeGame({ table: { currentBet: 100, minRaise: 100 } });
    const err = getError(() => validatePlayerAction(game, 'p1', 'raise', 150));
    expect(err.code).toBe(GameErrorCodes.INVALID_RAISE_AMOUNT);
    expect(err.details.minRaise).toBe(200);
    expect(err.details.provided).toBe(150);
  });

  it('accepts a raise meeting the minimum exactly', () => {
    const game = makeGame({ table: { currentBet: 100, minRaise: 100 } });
    expect(validatePlayerAction(game, 'p1', 'raise', 200)).toBe(true);
  });

  it('counts chips already in the round toward the minimum total', () => {
    // p1 already has 100 in; raising 100 more reaches the 200 total required.
    const game = makeGame({
      table: { currentBet: 100, minRaise: 100 },
      seats: { 1: { odId: 'p1', chips: 900, status: 'active', roundBet: 100 } },
    });
    expect(validatePlayerAction(game, 'p1', 'raise', 100)).toBe(true);
  });

  it('falls back to the big blind when table.minRaise is missing', () => {
    const game = makeGame({ table: { currentBet: 20, minRaise: undefined } });
    // min total = 20 + big blind (20) = 40
    const err = getError(() => validatePlayerAction(game, 'p1', 'raise', 30));
    expect(err.code).toBe(GameErrorCodes.INVALID_RAISE_AMOUNT);
    expect(validatePlayerAction(game, 'p1', 'raise', 40)).toBe(true);
  });

  it('rejects a raise larger than the player\'s stack', () => {
    const game = makeGame({
      table: { currentBet: 100, minRaise: 100 },
      seats: { 1: { odId: 'p1', chips: 150, status: 'active', roundBet: 0 } },
    });
    const err = getError(() => validatePlayerAction(game, 'p1', 'raise', 200));
    expect(err.code).toBe(GameErrorCodes.INSUFFICIENT_CHIPS);
    expect(err.details.required).toBe(200);
    expect(err.details.available).toBe(150);
  });
});

describe('validatePlayerAction — all_in', () => {
  it('is valid whenever the player has chips', () => {
    const game = makeGame({ table: { currentBet: 5000 } });
    expect(validatePlayerAction(game, 'p1', 'all_in')).toBe(true);
  });

  it('rejects an all-in with zero chips', () => {
    const game = makeGame({
      seats: { 1: { odId: 'p1', chips: 0, status: 'active', roundBet: 0 } },
    });
    const err = getError(() => validatePlayerAction(game, 'p1', 'all_in'));
    expect(err.code).toBe(GameErrorCodes.NO_CHIPS_FOR_ALL_IN);
  });
});

describe('validateGameStart', () => {
  it('accepts a waiting game with two funded players', () => {
    const game = makeGame({ status: 'waiting' });
    expect(validateGameStart(game)).toBe(true);
  });

  it('rejects a game with fewer than 2 players', () => {
    const game = makeGame({ status: 'waiting', seats: { 2: null } });
    const err = getError(() => validateGameStart(game));
    expect(err.code).toBe(GameErrorCodes.NOT_ENOUGH_PLAYERS);
    expect(err.details.count).toBe(1);
  });

  it('does not count seated players with zero chips', () => {
    const game = makeGame({
      status: 'waiting',
      seats: { 2: { odId: 'p2', chips: 0, status: 'active', roundBet: 0 } },
    });
    const err = getError(() => validateGameStart(game));
    expect(err.code).toBe(GameErrorCodes.NOT_ENOUGH_PLAYERS);
    expect(err.details.count).toBe(1);
  });

  it('rejects starting a game that is not in waiting status', () => {
    const game = makeGame({ status: 'playing' });
    const err = getError(() => validateGameStart(game));
    expect(err.code).toBe(GameErrorCodes.GAME_ALREADY_IN_PROGRESS);
    expect(err.details.status).toBe('playing');
  });

  it('reports the player-count problem before the status problem', () => {
    const game = makeGame({ status: 'playing', seats: { 2: null } });
    const err = getError(() => validateGameStart(game));
    expect(err.code).toBe(GameErrorCodes.NOT_ENOUGH_PLAYERS);
  });
});
