import { describe, it, expect } from 'vitest';
import { mysteryResults } from '../functions/src/utils/mysteryBounty.js';
import { buildTournamentSettlement } from '../functions/src/utils/tournamentSettlementMath.js';
import { aggregateHistoryRecords, LEADERBOARD_STATS_VERSION } from '../functions/src/utils/leaderboardStatsMath.js';
import { buildTournamentLeaderboardEntry, rankLeaderboardEntries } from '../src/utils/leaderboardRanking.js';

// 1 big (50%) + 2 small (25%) envelopes; pool 1,000 → 500 / 250 / 250
const bounty = { type: 'mystery', share: { mode: 'amount', value: 250 }, envelopes: [{ share: 50, count: 1 }, { share: 25, count: 2 }] };
const ticket = (id, by, envelope) => ({ id, by, envelope, at: 1 });

describe('mystery draw stats per player', () => {
  it('counts draws, big prizes and the best envelope; a shared draw counts for each at their part', () => {
    const players = [
      { id: 'a', mysteryTickets: [ticket('t1', ['a'], 0)] }, // a: big 500
      { id: 'b', mysteryTickets: [ticket('t2', ['a', 'b'], 1)] }, // shared small: 125 each
      { id: 'c', mysteryTickets: [ticket('t3', ['c'], null)] }, // not drawn
    ];
    const r = mysteryResults(players, bounty, 1000);
    expect(r.drawsByPlayer.a).toEqual({ draws: 2, topDraws: 1, bestDraw: 500 });
    expect(r.drawsByPlayer.b).toEqual({ draws: 1, topDraws: 0, bestDraw: 125 });
    expect(r.drawsByPlayer.c).toBeUndefined();
  });

  it('all-equal envelopes have no big prize', () => {
    const flat = { ...bounty, envelopes: [{ share: 50, count: 2 }] };
    const r = mysteryResults([{ id: 'a', mysteryTickets: [ticket('t1', ['a'], 0)] }], flat, 1000);
    expect(r.drawsByPlayer.a.topDraws).toBe(0);
  });

  it('settlement rows of a mystery game carry the draw stats', () => {
    const players = [
      { id: 'a', uid: 'ua', name: 'A', buyIn: 1000, placement: 1, mysteryTickets: [ticket('t1', ['a'], 0)] },
      { id: 'b', uid: 'ub', name: 'B', buyIn: 1000, placement: 2, eliminated: true },
      { id: 'c', uid: 'uc', name: 'C', buyIn: 1000, placement: 3, eliminated: true },
      { id: 'd', uid: 'ud', name: 'D', buyIn: 1000, placement: 4, eliminated: true },
    ];
    const rows = buildTournamentSettlement(players, [100], 1000, 250, bounty);
    const a = rows.find((r) => r.odId === 'ua');
    expect(a).toMatchObject({ bounty: 500, draws: 1, topDraws: 1, bestDraw: 500 });
    expect(rows.find((r) => r.odId === 'ub')).toMatchObject({ draws: 0, topDraws: 0 });
  });
});

describe('leaderboard aggregates: Hunter and 歐皇', () => {
  const rec = (gameId, own) => ({ gameId, type: 'tournament', createdAt: Date.parse('2026-10-01T12:00:00+08:00'), profit: 0, settlement: [{ odId: 'me', buyIn: 1000, prize: 0, ...own }] });

  it('sums knockouts / bounty for every bounty game and draws for mystery games', () => {
    const t = aggregateHistoryRecords('me', [
      rec('g1', { bounty: 600, knockouts: 3 }), // KO
      rec('g2', { bounty: 750, knockouts: 2, draws: 3, topDraws: 1, bestDraw: 500 }), // mystery
      rec('g3', {}), // no bounty
    ]).get('all').tournament;
    expect(t).toMatchObject({
      bountyGames: 2, knockouts: 5, bountyWon: 1350,
      mysteryGames: 1, draws: 3, topDraws: 1, mysteryWon: 750, bestDraw: 500,
    });
    expect(LEADERBOARD_STATS_VERSION).toBe(3);
  });

  it('Hunter ranks by knockouts then bounty; 歐皇 by mystery winnings then big prizes', () => {
    const row = (uid, tournament) => buildTournamentLeaderboardEntry({ uid, name: uid, tournament: { games: 2, ...tournament } });
    const entries = [
      row('x', { knockouts: 5, bountyWon: 900, draws: 4, topDraws: 0, mysteryWon: 400 }),
      row('y', { knockouts: 5, bountyWon: 1200, draws: 3, topDraws: 2, mysteryWon: 1500 }),
      row('z', { knockouts: 0, bountyWon: 0, draws: 0, topDraws: 0, mysteryWon: 0 }),
    ];
    expect(rankLeaderboardEntries(entries, 'hunter').map((e) => e.uid)).toEqual(['y', 'x']);
    const lucky = rankLeaderboardEntries(entries, 'lucky');
    expect(lucky.map((e) => e.uid)).toEqual(['y', 'x']);
    expect(lucky[0].topRate).toBe(66.7);
  });
});
