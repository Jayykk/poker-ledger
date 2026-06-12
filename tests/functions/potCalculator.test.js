/**
 * Unit tests for functions/src/engines/potCalculator.js
 * Tests the real module — no mocks. Showdown results for distributePots are
 * produced by the real hand evaluator (pokersolver) so pot distribution is
 * verified end to end.
 *
 * Player shape for calculateSidePots: { odId, totalBet, status }
 * Game shape: { seats: { [seatNum]: { odId, odName, chips, status, totalBet } | null },
 *               table: { pot, dealerSeat } }
 */
import { describe, it, expect } from 'vitest';
import {
  calculateSidePots,
  distributePots,
  calculateSidePotsFromGame,
  distributePot,
} from '../../functions/src/engines/potCalculator.js';
import { determineWinners } from '../../functions/src/utils/handEvaluator.js';

function player(odId, totalBet, status = 'active') {
  return { odId, odName: odId, totalBet, status };
}

describe('calculateSidePots — single main pot', () => {
  it('builds one main pot when all players match the same bet', () => {
    const pots = calculateSidePots([
      player('a', 100),
      player('b', 100),
      player('c', 100),
    ]);

    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(300);
    expect(pots[0].isMainPot).toBe(true);
    expect(pots[0].level).toBe(1);
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['a', 'b', 'c']);
  });

  it('treats an all-in for the same amount as everyone else as a single pot', () => {
    const pots = calculateSidePots([
      player('a', 100, 'all_in'),
      player('b', 100),
    ]);
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(200);
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['a', 'b']);
  });

  it('returns an empty array when nobody contributed', () => {
    expect(calculateSidePots([])).toEqual([]);
    expect(calculateSidePots([player('a', 0)])).toEqual([]);
  });
});

describe('calculateSidePots — one all-in side pot', () => {
  it('caps the short all-in player at the main pot and gives the rest a side pot', () => {
    const pots = calculateSidePots([
      player('shorty', 50, 'all_in'),
      player('b', 100),
      player('c', 100),
    ]);

    expect(pots).toHaveLength(2);

    // Main pot: 50 from each of the 3 players.
    expect(pots[0]).toMatchObject({ amount: 150, isMainPot: true, level: 1 });
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['b', 'c', 'shorty']);

    // Side pot: the remaining 50 from each of the two bigger stacks.
    expect(pots[1]).toMatchObject({ amount: 100, isMainPot: false, level: 2 });
    expect(pots[1].eligiblePlayerIds.sort()).toEqual(['b', 'c']);
    expect(pots[1].eligiblePlayerIds).not.toContain('shorty');
  });
});

describe('calculateSidePots — multiple all-ins with different stacks', () => {
  it('creates one pot layer per distinct all-in amount', () => {
    const pots = calculateSidePots([
      player('a', 25, 'all_in'),
      player('b', 60, 'all_in'),
      player('c', 100),
      player('d', 100),
    ]);

    expect(pots).toHaveLength(3);

    expect(pots[0].amount).toBe(100); // 25 x 4
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['a', 'b', 'c', 'd']);

    expect(pots[1].amount).toBe(105); // 35 x 3
    expect(pots[1].eligiblePlayerIds.sort()).toEqual(['b', 'c', 'd']);

    expect(pots[2].amount).toBe(80); // 40 x 2
    expect(pots[2].eligiblePlayerIds.sort()).toEqual(['c', 'd']);

    expect(pots.map((p) => p.level)).toEqual([1, 2, 3]);
    expect(pots.map((p) => p.isMainPot)).toEqual([true, false, false]);

    // Conservation: pot layers account for every chip contributed.
    const total = pots.reduce((sum, p) => sum + p.amount, 0);
    expect(total).toBe(25 + 60 + 100 + 100);
  });
});

describe('calculateSidePots — folded players (dead money)', () => {
  it('adds a folded player\'s chips to the main pot without eligibility', () => {
    const pots = calculateSidePots([
      player('folder', 30, 'folded'),
      player('a', 100),
      player('b', 100),
    ]);

    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(230); // 200 live + 30 dead
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['a', 'b']);
    expect(pots[0].eligiblePlayerIds).not.toContain('folder');
  });

  it('puts dead money only into the main pot, never into side pots', () => {
    const pots = calculateSidePots([
      player('folder', 80, 'folded'),
      player('shorty', 50, 'all_in'),
      player('b', 100),
      player('c', 100),
    ]);

    expect(pots).toHaveLength(2);
    expect(pots[0].amount).toBe(150 + 80); // main pot collects the dead 80
    expect(pots[1].amount).toBe(100); // side pot is unchanged
    const total = pots.reduce((sum, p) => sum + p.amount, 0);
    expect(total).toBe(80 + 50 + 100 + 100);
  });
});

describe('calculateSidePotsFromGame', () => {
  it('extracts contributors from seats, skipping empty and zero-bet seats', () => {
    const game = {
      seats: {
        1: { odId: 'a', odName: 'A', chips: 0, status: 'all_in', totalBet: 50 },
        2: { odId: 'b', odName: 'B', chips: 900, status: 'active', totalBet: 100 },
        3: null,
        4: { odId: 'd', odName: 'D', chips: 1000, status: 'active', totalBet: 0 },
        5: { odId: 'e', odName: 'E', chips: 960, status: 'folded', totalBet: 40 },
      },
    };

    const pots = calculateSidePotsFromGame(game);
    expect(pots).toHaveLength(2);
    expect(pots[0].amount).toBe(100 + 40); // 50x2 live + 40 dead money
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['a', 'b']);
    expect(pots[1].amount).toBe(50);
    expect(pots[1].eligiblePlayerIds).toEqual(['b']);
  });
});

describe('distributePots', () => {
  // Community/hole cards use single-character ranks only ('T' for ten is the
  // notation pokersolver understands; tens are avoided here entirely).
  it('awards the whole pot to the sole best hand', () => {
    const community = ['2h', '7h', '9h', '8c', '4d'];
    const players = [
      { odId: 'straight', odName: 'Sam', holeCards: ['5s', '6s'] }, // 5-9 straight
      { odId: 'flush', odName: 'Fiona', holeCards: ['Ah', 'Kh'] }, // heart flush
    ];
    const showdown = determineWinners(players, community);
    const pots = calculateSidePots([player('straight', 150), player('flush', 150)]);

    const winnings = distributePots(pots, showdown, players);
    expect(winnings).toEqual({ flush: 300 });
  });

  it('gives the main pot to the all-in winner and the side pot to the next-best hand', () => {
    const community = ['Qs', '7d', '5c', '8h', '2d'];
    const players = [
      { odId: 'shorty', odName: 'Shorty', holeCards: ['Qh', 'Qc'] }, // trips queens (best)
      { odId: 'mid', odName: 'Mid', holeCards: ['8s', '8d'] }, // trips eights
      { odId: 'fish', odName: 'Fish', holeCards: ['Ac', 'Kd'] }, // ace high
    ];
    const showdown = determineWinners(players, community);
    expect(showdown.winners.map((w) => w.odId)).toEqual(['shorty']);

    const pots = calculateSidePots([
      player('shorty', 50, 'all_in'),
      player('mid', 200),
      player('fish', 200),
    ]);

    const winnings = distributePots(pots, showdown, players);
    expect(winnings.shorty).toBe(150); // main pot only (50 x 3)
    expect(winnings.mid).toBe(300); // side pot (150 x 2)
    expect(winnings.fish).toBeUndefined();
  });

  it('splits a tied pot and gives the odd chip to the first winner', () => {
    const community = ['Ac', '7s', '5h', '3d', '2c'];
    const players = [
      { odId: 'tieA', odName: 'TieA', holeCards: ['As', 'Kd'] },
      { odId: 'tieB', odName: 'TieB', holeCards: ['Ad', 'Kh'] },
    ];
    const showdown = determineWinners(players, community);
    expect(showdown.winners).toHaveLength(2);

    const pots = [
      { amount: 101, eligiblePlayerIds: ['tieA', 'tieB'], level: 1, isMainPot: true },
    ];

    const winnings = distributePots(pots, showdown, players);
    expect(winnings.tieA).toBe(51); // floor(101/2) + odd chip
    expect(winnings.tieB).toBe(50);
    expect(winnings.tieA + winnings.tieB).toBe(101);
  });
});

describe('distributePot (legacy game-state API)', () => {
  it('splits the table pot equally with the odd chip to the winner closest to the dealer', () => {
    // Seats carry no totalBet info, so the function falls back to splitting
    // game.table.pot among all listed winners.
    const game = {
      table: { pot: 101, dealerSeat: 1 },
      seats: {
        1: { odId: 'p1', odName: 'P1', chips: 0, status: 'folded' },
        2: { odId: 'p2', odName: 'P2', chips: 0, status: 'active' },
        3: { odId: 'p3', odName: 'P3', chips: 0, status: 'active' },
      },
    };
    const seats = distributePot(game, [{ playerId: 'p2' }, { playerId: 'p3' }], {});

    // Seat 2 sits immediately after the dealer (seat 1), so it takes the odd chip.
    expect(seats['2'].chips).toBe(51);
    expect(seats['3'].chips).toBe(50);
    expect(seats['1'].chips).toBe(0);
  });

  it('pays a winner who is eligible for every pot the full amount', () => {
    const game = {
      table: { pot: 250, dealerSeat: 1 },
      seats: {
        1: { odId: 'shorty', odName: 'S', chips: 0, status: 'all_in', totalBet: 50 },
        2: { odId: 'big', odName: 'B', chips: 900, status: 'active', totalBet: 100 },
        3: { odId: 'caller', odName: 'C', chips: 900, status: 'active', totalBet: 100 },
      },
    };
    const seats = distributePot(game, [{ playerId: 'big' }], {});
    expect(seats['2'].chips).toBe(900 + 150 + 100); // main pot + side pot
    expect(seats['1'].chips).toBe(0);
    expect(seats['3'].chips).toBe(900);
  });

  it('KNOWN LIMITATION: leaves a side pot undistributed when the only listed winner is not eligible for it', () => {
    // The legacy API receives a single flat winners list. When the all-in
    // player wins overall, nobody in that list is eligible for the side pot,
    // so its 100 chips are simply not paid out by this function. The current
    // production path (handlers/game.js) uses distributePots, which evaluates
    // winners per pot and does not have this problem.
    const game = {
      table: { pot: 250, dealerSeat: 1 },
      seats: {
        1: { odId: 'shorty', odName: 'S', chips: 0, status: 'all_in', totalBet: 50 },
        2: { odId: 'big', odName: 'B', chips: 900, status: 'active', totalBet: 100 },
        3: { odId: 'caller', odName: 'C', chips: 900, status: 'active', totalBet: 100 },
      },
    };
    const seats = distributePot(game, [{ playerId: 'shorty' }], {});
    expect(seats['1'].chips).toBe(150); // main pot only
    expect(seats['2'].chips).toBe(900); // side pot never reaches anyone
    expect(seats['3'].chips).toBe(900);
  });
});
