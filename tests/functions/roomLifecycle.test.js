/**
 * Unit tests for the pure room-close decision logic.
 * Tests the real module — no mocks, no Firestore.
 */
import { describe, it, expect } from 'vitest';
import {
  countSeatedPlayers,
  evaluateRoomClose,
  buildSettlement,
  buildCashOutRecord,
  purgeAfkOutSeats,
} from '../../functions/src/handlers/roomLifecycle.js';

const NOW = 1_000_000_000_000; // fixed "now" in ms
const HOUR_S = 60 * 60;

/** Build a game with lastActivityAt set `agoSeconds` before NOW. */
function gameIdleFor(agoSeconds, overrides = {}) {
  return {
    status: 'waiting',
    meta: {
      minBuyIn: 1000,
      lastActivityAt: { toMillis: () => NOW - agoSeconds * 1000 },
    },
    seats: { 0: { odId: 'a', chips: 1000 }, 1: { odId: 'b', chips: 1000 } },
    table: {},
    ...overrides,
  };
}

describe('countSeatedPlayers', () => {
  it('counts only non-null seats', () => {
    expect(countSeatedPlayers({ seats: { 0: { odId: 'a' }, 1: null, 2: { odId: 'b' } } })).toBe(2);
  });
  it('handles missing seats', () => {
    expect(countSeatedPlayers({})).toBe(0);
  });
});

describe('evaluateRoomClose', () => {
  it('does not close a room that was recently active', () => {
    const v = evaluateRoomClose(gameIdleFor(60), NOW, { idleTimeoutSeconds: HOUR_S });
    expect(v.close).toBe(false);
  });

  it('closes an idle multi-player room as idle_timeout', () => {
    const v = evaluateRoomClose(gameIdleFor(HOUR_S + 1), NOW, { idleTimeoutSeconds: HOUR_S });
    expect(v.close).toBe(true);
    expect(v.reason).toBe('idle_timeout');
  });

  it('closes an idle single-occupant room as abandoned', () => {
    const game = gameIdleFor(HOUR_S + 1, { seats: { 0: { odId: 'a', chips: 1000 }, 1: null } });
    const v = evaluateRoomClose(game, NOW, { idleTimeoutSeconds: HOUR_S });
    expect(v.close).toBe(true);
    expect(v.reason).toBe('abandoned');
  });

  it('closes an empty room as abandoned', () => {
    const game = gameIdleFor(HOUR_S + 1, { seats: { 0: null, 1: null } });
    const v = evaluateRoomClose(game, NOW, { idleTimeoutSeconds: HOUR_S });
    expect(v.close).toBe(true);
    expect(v.reason).toBe('abandoned');
  });

  it('treats a missing lastActivityAt as fully idle (reclaims legacy rooms)', () => {
    const game = { status: 'waiting', meta: {}, seats: { 0: { odId: 'a' }, 1: { odId: 'b' } } };
    const v = evaluateRoomClose(game, NOW, { idleTimeoutSeconds: HOUR_S });
    expect(v.close).toBe(true);
  });

  it('never re-closes a closed or completed room', () => {
    expect(evaluateRoomClose(gameIdleFor(HOUR_S * 5, { status: 'closed' }), NOW).close).toBe(false);
    expect(evaluateRoomClose(gameIdleFor(HOUR_S * 5, { status: 'completed' }), NOW).close).toBe(false);
  });

  it('handles null game defensively', () => {
    expect(evaluateRoomClose(null, NOW).close).toBe(false);
  });
});

describe('buildSettlement', () => {
  it('computes profit = stack - initial buy-in per seated player', () => {
    const game = {
      meta: { minBuyIn: 1000 },
      seats: {
        0: { odId: 'a', odName: 'A', initialBuyIn: 1000, chips: 1500 },
        1: null,
        2: { odId: 'b', odName: 'B', initialBuyIn: 1000, chips: 200 },
      },
    };
    const rows = buildSettlement(game);
    expect(rows).toEqual([
      { odId: 'a', name: 'A', buyIn: 1000, stack: 1500, profit: 500 },
      { odId: 'b', name: 'B', buyIn: 1000, stack: 200, profit: -800 },
    ]);
  });

  it('falls back to room minBuyIn when seat has no initialBuyIn', () => {
    const game = { meta: { minBuyIn: 1000 }, seats: { 0: { odId: 'a', odName: 'A', chips: 1000 } } };
    expect(buildSettlement(game)[0].buyIn).toBe(1000);
  });
});

describe('buildCashOutRecord', () => {
  it('computes profit and a single-row settlement', () => {
    const rec = buildCashOutRecord(
      { odId: 'a', odName: 'A', chips: 1500, initialBuyIn: 1000 }, 'gameXYZ123', 'manual',
    );
    expect(rec.profit).toBe(500);
    expect(rec.leftReason).toBe('manual');
    expect(rec.gameType).toBe('online_poker');
    expect(rec.autoClosed).toBe(false);
    expect(rec.settlement).toEqual([
      { odId: 'a', name: 'A', buyIn: 1000, stack: 1500, profit: 500 },
    ]);
  });

  it('flags non-manual (AFK) leaves as autoClosed and handles a busted stack', () => {
    const rec = buildCashOutRecord({ odId: 'b', chips: 0, initialBuyIn: 1000 }, 'g', 'afk');
    expect(rec.autoClosed).toBe(true);
    expect(rec.profit).toBe(-1000);
  });
});

describe('purgeAfkOutSeats', () => {
  function makeTxn() {
    const updates = [];
    const sets = [];
    return {
      updates,
      sets,
      update: (ref, data) => updates.push({ ref, data }),
      set: (ref, data, opts) => sets.push({ ref, data, opts }),
    };
  }
  const db = { collection: () => ({ doc: (id) => ({ id }) }) };
  const gameRef = { id: 'g1' };

  it('cashes out + frees afkOut seats and leaves the rest untouched', () => {
    const txn = makeTxn();
    const game = {
      seats: {
        0: { odId: 'a', odName: 'A', chips: 1000, initialBuyIn: 1000, status: 'active' },
        1: { odId: 'b', odName: 'B', chips: 200, initialBuyIn: 1000, status: 'folded', afkOut: true },
      },
    };
    const removed = purgeAfkOutSeats(txn, db, gameRef, game, 'g1');

    expect(removed).toEqual(['b']);
    expect(game.seats[1]).toBe(null);          // freed
    expect(game.seats[0]).not.toBe(null);      // untouched
    expect(txn.updates).toContainEqual({ ref: gameRef, data: { 'seats.1': null } });
    expect(txn.sets).toHaveLength(1);          // one cash-out write
    expect(txn.sets[0].opts).toEqual({ merge: true });
  });

  it('is a no-op when no seat is flagged', () => {
    const txn = makeTxn();
    const game = { seats: { 0: { odId: 'a', afkOut: false }, 1: null } };
    expect(purgeAfkOutSeats(txn, db, gameRef, game, 'g1')).toEqual([]);
    expect(txn.updates).toHaveLength(0);
    expect(txn.sets).toHaveLength(0);
  });
});
