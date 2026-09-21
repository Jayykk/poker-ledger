import { describe, expect, it } from 'vitest';
import {
  canRunNegotiatedSettlement,
  canRunNormalTournamentSettlement,
  settleTournamentDeal,
  validateDealAllocations,
  validateNormalTournamentState,
} from '../../functions/src/handlers/tournamentSettlement.js';

const game = {
  type: 'tournament',
  status: 'active',
  hostUid: 'host',
  players: [
    { uid: 'host', eliminated: true, placement: 2 },
    { uid: 'member', eliminated: false, placement: null },
  ],
};

describe('tournament settlement authorization', () => {
  it('allows listed participants or admins to run normal settlement', () => {
    expect(canRunNormalTournamentSettlement(game, 'member', false)).toBe(true);
    expect(canRunNormalTournamentSettlement(game, 'outsider', true)).toBe(true);
  });

  it('rejects outsiders from normal settlement', () => {
    expect(canRunNormalTournamentSettlement(game, 'outsider', false)).toBe(false);
  });

  it('allows only host or admin to run negotiated settlement', () => {
    expect(canRunNegotiatedSettlement(game, 'host', false)).toBe(true);
    expect(canRunNegotiatedSettlement(game, 'member', false)).toBe(false);
    expect(canRunNegotiatedSettlement(game, 'admin', true)).toBe(true);
  });
});

describe('normal tournament settlement state', () => {
  it('accepts exactly one surviving player', () => {
    expect(() => validateNormalTournamentState(game)).not.toThrow();
  });

  it('rejects multiple surviving players', () => {
    expect(() => validateNormalTournamentState({
      ...game,
      players: game.players.map((player) => ({ ...player, eliminated: false })),
    })).toThrow('INVALID_TOURNAMENT_STATE');
  });
});

describe('negotiated tournament settlement validation', () => {
  it('rejects negative prizes even when the allocation total matches', () => {
    const players = [
      { id: 'p1', buyIn: 1000, eliminated: false },
      { id: 'p2', buyIn: 1000, eliminated: false },
    ];
    const payouts = [
      { place: 1, percentage: 100 },
      { place: 2, percentage: 0 },
    ];

    expect(() => validateDealAllocations(players, payouts, [
      { playerId: 'p1', placement: 1, prize: 2100 },
      { playerId: 'p2', placement: 2, prize: -100 },
    ])).toThrow('DEAL_PRIZE_INVALID');
  });

  it('replays a completed deal when the callable is retried', async () => {
    const completedGame = {
      ...game,
      status: 'completed',
      dealt: true,
      settlementSnapshot: [{ odId: 'host', prize: 2000 }],
      historyProjection: { requestToken: 'sync-1' },
    };
    const transaction = {
      get: async (ref) => ref.path.startsWith('games/')
        ? { exists: true, data: () => completedGame }
        : { exists: false },
    };
    const db = {
      collection: (name) => ({
        doc: (id) => ({ path: `${name}/${id}` }),
      }),
      runTransaction: (callback) => callback(transaction),
    };

    await expect(settleTournamentDeal({
      gameId: 'game-1', callerUid: 'host', deal: {}, db,
    })).resolves.toMatchObject({
      alreadySettled: true,
      settlement: completedGame.settlementSnapshot,
      syncToken: 'sync-1',
    });
  });
});