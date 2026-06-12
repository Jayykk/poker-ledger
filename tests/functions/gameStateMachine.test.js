/**
 * Unit tests for functions/src/engines/gameStateMachine.js
 * Tests the real module — no mocks.
 */
import { describe, it, expect } from 'vitest';
import {
  GameStates,
  isLastManStanding,
  getActivePlayers,
  getPlayersInHand,
  isRoundComplete,
  getNextState,
  findNextPlayer,
  getFirstToAct,
  validateStateTransition,
} from '../../functions/src/engines/gameStateMachine.js';
import { GameErrorCodes } from '../../functions/src/errors/gameErrors.js';

/** Shorthand seat factory. */
function seat(odId, { status = 'active', chips = 1000, roundBet = 0, turnActed = false } = {}) {
  return { odId, odName: odId, status, chips, roundBet, turnActed };
}

function makeGame({ seats, table = {} } = {}) {
  return {
    seats: seats || {
      1: seat('p1'),
      2: seat('p2'),
      3: seat('p3'),
    },
    table: {
      currentRound: 'preflop',
      currentBet: 0,
      currentTurn: 'p1',
      dealerSeat: 1,
      ...table,
    },
  };
}

describe('getActivePlayers / getPlayersInHand', () => {
  it('separates active, all-in, folded and empty seats', () => {
    const game = makeGame({
      seats: {
        1: seat('p1', { status: 'active' }),
        2: seat('p2', { status: 'all_in', chips: 0 }),
        3: seat('p3', { status: 'folded' }),
        4: null,
      },
    });
    expect(getActivePlayers(game).map((s) => s.odId)).toEqual(['p1']);
    expect(getPlayersInHand(game).map((s) => s.odId)).toEqual(['p1', 'p2']);
  });
});

describe('isLastManStanding', () => {
  it('detects last man standing when everyone else folded', () => {
    const game = makeGame({
      seats: {
        1: seat('p1', { status: 'active' }),
        2: seat('p2', { status: 'folded' }),
        3: seat('p3', { status: 'folded' }),
      },
    });
    expect(isLastManStanding(game)).toBe(true);
  });

  it('is false while an all-in player is still in the hand', () => {
    const game = makeGame({
      seats: {
        1: seat('p1', { status: 'active' }),
        2: seat('p2', { status: 'all_in', chips: 0 }),
        3: seat('p3', { status: 'folded' }),
      },
    });
    expect(isLastManStanding(game)).toBe(false);
  });

  it('is false with two or more active players', () => {
    expect(isLastManStanding(makeGame())).toBe(false);
  });
});

describe('isRoundComplete', () => {
  it('is complete when all active players have acted and matched the bet', () => {
    const game = makeGame({
      seats: {
        1: seat('p1', { roundBet: 50, turnActed: true }),
        2: seat('p2', { roundBet: 50, turnActed: true }),
      },
      table: { currentBet: 50 },
    });
    expect(isRoundComplete(game)).toBe(true);
  });

  it('is incomplete while a player has not yet acted', () => {
    const game = makeGame({
      seats: {
        1: seat('p1', { roundBet: 50, turnActed: true }),
        2: seat('p2', { roundBet: 50, turnActed: false }),
      },
      table: { currentBet: 50 },
    });
    expect(isRoundComplete(game)).toBe(false);
  });

  it('is incomplete while a player has acted but not matched the current bet', () => {
    // p2 acted earlier (called 20), then p1 raised to 80 — p2 must act again.
    const game = makeGame({
      seats: {
        1: seat('p1', { roundBet: 80, turnActed: true }),
        2: seat('p2', { roundBet: 20, turnActed: true }),
      },
      table: { currentBet: 80 },
    });
    expect(isRoundComplete(game)).toBe(false);
  });

  it('treats a checked-around round (zero bet) as complete', () => {
    const game = makeGame({
      seats: {
        1: seat('p1', { roundBet: 0, turnActed: true }),
        2: seat('p2', { roundBet: 0, turnActed: true }),
      },
      table: { currentBet: 0 },
    });
    expect(isRoundComplete(game)).toBe(true);
  });

  it('is complete when only one player remains in the hand', () => {
    const game = makeGame({
      seats: {
        1: seat('p1', { turnActed: false }),
        2: seat('p2', { status: 'folded' }),
      },
      table: { currentBet: 100 },
    });
    expect(isRoundComplete(game)).toBe(true);
  });

  it('is complete when every remaining player is all-in', () => {
    const game = makeGame({
      seats: {
        1: seat('p1', { status: 'all_in', chips: 0, roundBet: 200 }),
        2: seat('p2', { status: 'all_in', chips: 0, roundBet: 500 }),
      },
      table: { currentBet: 500 },
    });
    expect(isRoundComplete(game)).toBe(true);
  });
});

describe('getNextState — round progression', () => {
  it.each([
    ['preflop', GameStates.FLOP],
    ['flop', GameStates.TURN],
    ['turn', GameStates.RIVER],
    ['river', GameStates.SHOWDOWN],
  ])('advances %s to %s', (currentRound, expected) => {
    const game = makeGame({ table: { currentRound } });
    expect(getNextState(game)).toBe(expected);
  });

  it('falls back to waiting for an unknown round', () => {
    const game = makeGame({ table: { currentRound: 'mystery' } });
    expect(getNextState(game)).toBe(GameStates.WAITING);
  });

  it('returns last_man_standing as soon as only one player remains, regardless of round', () => {
    const seats = {
      1: seat('p1', { status: 'active' }),
      2: seat('p2', { status: 'folded' }),
      3: seat('p3', { status: 'folded' }),
    };
    for (const currentRound of ['preflop', 'flop', 'turn', 'river']) {
      const game = makeGame({ seats, table: { currentRound } });
      expect(getNextState(game)).toBe(GameStates.LAST_MAN);
    }
  });

  it('jumps straight to showdown when everyone left is all-in', () => {
    const game = makeGame({
      seats: {
        1: seat('p1', { status: 'all_in', chips: 0 }),
        2: seat('p2', { status: 'all_in', chips: 0 }),
        3: seat('p3', { status: 'folded' }),
      },
      table: { currentRound: 'preflop' },
    });
    expect(getNextState(game)).toBe(GameStates.SHOWDOWN);
  });

  it('does not jump to showdown while one all-in player still faces an active player', () => {
    const game = makeGame({
      seats: {
        1: seat('p1', { status: 'active' }),
        2: seat('p2', { status: 'all_in', chips: 0 }),
      },
      table: { currentRound: 'flop' },
    });
    expect(getNextState(game)).toBe(GameStates.TURN);
  });
});

describe('findNextPlayer', () => {
  it('moves to the next active seat clockwise', () => {
    const game = makeGame({ table: { currentTurn: 'p1' } });
    expect(findNextPlayer(game)).toBe('p2');
  });

  it('wraps around from the last seat to the first', () => {
    const game = makeGame({ table: { currentTurn: 'p3' } });
    expect(findNextPlayer(game)).toBe('p1');
  });

  it('skips folded players and players without chips', () => {
    const game = makeGame({
      seats: {
        1: seat('p1'),
        2: seat('p2', { status: 'folded' }),
        3: seat('p3', { chips: 0 }),
        4: seat('p4'),
      },
      table: { currentTurn: 'p1' },
    });
    expect(findNextPlayer(game)).toBe('p4');
  });

  it('returns null when nobody can act', () => {
    const game = makeGame({
      seats: {
        1: seat('p1', { status: 'all_in', chips: 0 }),
        2: seat('p2', { status: 'folded' }),
      },
    });
    expect(findNextPlayer(game)).toBeNull();
  });
});

describe('getFirstToAct', () => {
  it('picks the first active player after the dealer', () => {
    const game = makeGame({ table: { dealerSeat: 1 } });
    expect(getFirstToAct(game)).toBe('p2');
  });

  it('wraps around when the dealer holds the highest seat', () => {
    const game = makeGame({ table: { dealerSeat: 3 } });
    expect(getFirstToAct(game)).toBe('p1');
  });

  it('skips non-active seats after the dealer', () => {
    const game = makeGame({
      seats: {
        1: seat('p1'),
        2: seat('p2', { status: 'all_in', chips: 0 }),
        3: seat('p3'),
      },
      table: { dealerSeat: 1 },
    });
    expect(getFirstToAct(game)).toBe('p3');
  });
});

describe('validateStateTransition', () => {
  it('allows the full normal hand lifecycle', () => {
    expect(validateStateTransition(GameStates.WAITING, GameStates.DEALING)).toBe(true);
    expect(validateStateTransition(GameStates.DEALING, GameStates.PREFLOP)).toBe(true);
    expect(validateStateTransition(GameStates.PREFLOP, GameStates.FLOP)).toBe(true);
    expect(validateStateTransition(GameStates.FLOP, GameStates.TURN)).toBe(true);
    expect(validateStateTransition(GameStates.TURN, GameStates.RIVER)).toBe(true);
    expect(validateStateTransition(GameStates.RIVER, GameStates.SHOWDOWN)).toBe(true);
    expect(validateStateTransition(GameStates.SHOWDOWN, GameStates.SETTLING)).toBe(true);
    expect(validateStateTransition(GameStates.SETTLING, GameStates.WAITING)).toBe(true);
  });

  it('allows early exits to last_man_standing and all-in showdowns', () => {
    expect(validateStateTransition(GameStates.PREFLOP, GameStates.LAST_MAN)).toBe(true);
    expect(validateStateTransition(GameStates.PREFLOP, GameStates.SHOWDOWN)).toBe(true);
    expect(validateStateTransition(GameStates.LAST_MAN, GameStates.SETTLING)).toBe(true);
  });

  it('rejects skipping a street', () => {
    let err = null;
    try {
      validateStateTransition(GameStates.FLOP, GameStates.RIVER);
    } catch (e) {
      err = e;
    }
    expect(err).not.toBeNull();
    expect(err.code).toBe(GameErrorCodes.INVALID_ACTION);
  });

  it('rejects transitions from an unknown state', () => {
    expect(() => validateStateTransition('limbo', GameStates.FLOP)).toThrow();
  });
});
