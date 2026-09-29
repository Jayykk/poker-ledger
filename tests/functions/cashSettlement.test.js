import { describe, expect, it, vi } from 'vitest';
import {
  canRunCashSettlement,
  settleCashGame,
  validateCashSettlementState,
} from '../../functions/src/handlers/cashSettlement.js';

const activeGame = {
  type: 'live',
  status: 'active',
  name: 'Friday Cash',
  hostUid: 'host',
  players: [
    { uid: 'host', name: 'Host', buyIn: 1000, stack: 500 },
    { uid: 'member', name: 'Member', buyIn: 1000, stack: 1500 },
  ],
};

function createDb(game, isAdmin = false) {
  const update = vi.fn();
  const transaction = {
    get: vi.fn(async (ref) => ref.path.startsWith('games/')
      ? { exists: true, data: () => game }
      : { exists: isAdmin }),
    update,
  };
  return {
    update,
    db: {
      collection: (name) => ({ doc: (id) => ({ path: `${name}/${id}` }) }),
      runTransaction: (callback) => callback(transaction),
    },
  };
}

describe('cash settlement authorization', () => {
  it('allows listed participants and admins', () => {
    expect(canRunCashSettlement(activeGame, 'member', false)).toBe(true);
    expect(canRunCashSettlement(activeGame, 'admin', true)).toBe(true);
  });

  it('rejects users who are not seated in the room', () => {
    expect(canRunCashSettlement(activeGame, 'outsider', false)).toBe(false);
  });
});

describe('cash settlement validation', () => {
  it('accepts active cash games with a positive finite rate', () => {
    expect(() => validateCashSettlementState(activeGame, 100)).not.toThrow();
  });

  it.each([0, -1, Infinity, '100'])('rejects invalid rate %s', (rate) => {
    expect(() => validateCashSettlementState(activeGame, rate))
      .toThrow('INVALID_CASH_SETTLEMENT_RATE');
  });

  it('rejects tournament games', () => {
    expect(() => validateCashSettlementState({ ...activeGame, type: 'tournament' }, 100))
      .toThrow('INVALID_CASH_GAME_STATE');
  });
});

describe('settleCashGame', () => {
  it('calculates settlement from server-loaded players for a participant', async () => {
    const { db, update } = createDb(activeGame);

    await expect(settleCashGame({
      gameId: 'game-1', callerUid: 'member', exchangeRate: 100, db,
    })).resolves.toMatchObject({
      success: true,
      gameId: 'game-1',
      gameName: 'Friday Cash',
      rate: 100,
      settlement: [
        { odId: 'host', profit: -500 },
        { odId: 'member', profit: 500 },
      ],
      alreadySettled: false,
    });
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0][1]).toMatchObject({
      status: 'completed',
      rate: 100,
      settlementSnapshot: [
        { odId: 'host', profit: -500 },
        { odId: 'member', profit: 500 },
      ],
    });
  });

  it('replays the stored result after a completed request', async () => {
    const completed = {
      ...activeGame,
      status: 'completed',
      rate: 100,
      settlementSnapshot: [{ odId: 'member', profit: 500 }],
      historyProjection: { requestToken: 'sync-1' },
    };
    const { db, update } = createDb(completed);

    await expect(settleCashGame({
      gameId: 'game-1', callerUid: 'member', exchangeRate: 100, db,
    })).resolves.toMatchObject({
      success: true,
      settlement: completed.settlementSnapshot,
      syncToken: 'sync-1',
      alreadySettled: true,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('does not replay completed tournament settlements', async () => {
    const completedTournament = {
      ...activeGame,
      type: 'tournament',
      status: 'completed',
      settlementSnapshot: [{ odId: 'member', prize: 1500 }],
    };
    const { db, update } = createDb(completedTournament);

    await expect(settleCashGame({
      gameId: 'game-1', callerUid: 'member', exchangeRate: 100, db,
    })).rejects.toMatchObject({
      code: 'failed-precondition',
      message: 'INVALID_CASH_GAME_STATE',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects an outsider without writing', async () => {
    const { db, update } = createDb(activeGame);

    await expect(settleCashGame({
      gameId: 'game-1', callerUid: 'outsider', exchangeRate: 100, db,
    })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(update).not.toHaveBeenCalled();
  });
});