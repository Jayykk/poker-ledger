import { describe, it, expect } from 'vitest';
import {
  buildTournamentPrizeMap,
  buildTournamentSettlement,
  buildCashSettlement,
  computeIcmPayouts,
  computeChipChopPayouts,
  buildDealSettlement,
} from '../src/utils/settlementMath.js';

describe('buildTournamentPrizeMap', () => {
  it('distributes simple percentages exactly', () => {
    const map = buildTournamentPrizeMap(1000, [
      { place: 1, percentage: 50 },
      { place: 2, percentage: 30 },
      { place: 3, percentage: 20 },
    ]);
    expect(map).toEqual({ 1: 500, 2: 300, 3: 200 });
  });

  it('reconciles rounding drift so the paid total matches the pool share (33/33/33)', () => {
    // Naive per-place Math.round pays 330×3 = 990 and silently drops 10 chips.
    const map = buildTournamentPrizeMap(1000, [
      { place: 1, percentage: 33.34 },
      { place: 2, percentage: 33.33 },
      { place: 3, percentage: 33.33 },
    ]);
    const paid = Object.values(map).reduce((s, v) => s + v, 0);
    expect(paid).toBe(1000);
    // Better placement wins the leftover chip on remainder ties.
    expect(map[1]).toBeGreaterThanOrEqual(map[2]);
    expect(map[2]).toBeGreaterThanOrEqual(map[3]);
  });

  it('never over-distributes across awkward pools', () => {
    for (const pool of [997, 1001, 12345, 100]) {
      const map = buildTournamentPrizeMap(pool, [
        { place: 1, percentage: 33.33 },
        { place: 2, percentage: 33.33 },
        { place: 3, percentage: 33.34 },
      ]);
      const paid = Object.values(map).reduce((s, v) => s + v, 0);
      expect(paid).toBe(pool);
    }
  });

  it('respects partial payout structures (sum < 100%)', () => {
    const map = buildTournamentPrizeMap(900, [
      { place: 1, percentage: 60 },
      { place: 2, percentage: 30 },
    ]);
    expect(map[1] + map[2]).toBe(810); // 90% of the pool, no phantom chips
  });

  it('ignores empty/invalid ratios', () => {
    expect(buildTournamentPrizeMap(1000, [])).toEqual({});
    expect(buildTournamentPrizeMap(1000, [{ place: 1, percentage: 0 }])).toEqual({});
    expect(buildTournamentPrizeMap(0, [{ place: 1, percentage: 100 }])).toEqual({ 1: 0 });
  });
});

describe('buildTournamentSettlement', () => {
  const players = [
    { id: 'a', uid: 'u-a', name: 'A', placement: 2, buyIn: 300 },
    { id: 'b', uid: 'u-b', name: 'B', placement: 1, buyIn: 300 },
    { id: 'c', uid: null, name: 'C', placement: null, buyIn: 300 },
  ];

  it('includes every player, sorted by placement with unplaced last', () => {
    const settlement = buildTournamentSettlement(players, [
      { place: 1, percentage: 70 },
      { place: 2, percentage: 30 },
    ]);
    expect(settlement.map((s) => s.name)).toEqual(['B', 'A', 'C']);
    expect(settlement[0]).toMatchObject({ prize: 630, profit: 330 });
    expect(settlement[1]).toMatchObject({ prize: 270, profit: -30 });
    expect(settlement[2]).toMatchObject({ prize: 0, profit: -300 });
  });

  it('total profit sums to zero when 100% of the pool is paid out', () => {
    const settlement = buildTournamentSettlement(players, [
      { place: 1, percentage: 66.67 },
      { place: 2, percentage: 33.33 },
    ]);
    const totalProfit = settlement.reduce((s, p) => s + p.profit, 0);
    expect(totalProfit).toBe(0);
  });
});

describe('buildCashSettlement', () => {
  it('profit = stack − buyIn, rounded, with null-safe fields', () => {
    const snapshot = buildCashSettlement([
      { uid: 'u1', name: 'A', buyIn: 1000, stack: 1500.4 },
      { name: 'B', buyIn: undefined, stack: undefined },
    ]);
    expect(snapshot[0]).toEqual({ odId: 'u1', name: 'A', buyIn: 1000, stack: 1500, profit: 500 });
    expect(snapshot[1]).toEqual({ odId: null, name: 'B', buyIn: 0, stack: 0, profit: 0 });
  });
});

describe('computeIcmPayouts', () => {
  it('two players: equity is the exact stack-weighted blend of 1st/2nd prizes', () => {
    // EV_i = share_i × prize1 + (1 − share_i) × prize2 (exact for heads-up)
    // shares .75/.25 → 75+12.5=87.5 and 25+37.5=62.5 → rounds to 88/62 (150 total)
    expect(computeIcmPayouts([7500, 2500], [100, 50])).toEqual([88, 62]);
  });

  it('equal stacks split the pool equally', () => {
    expect(computeIcmPayouts([5000, 5000, 5000], [50, 30, 20])).toEqual([34, 33, 33]);
  });

  it('three players: matches hand-computed Malmuth-Harville values', () => {
    // stacks 50/30/20, prizes 70/30/0:
    // EV_A=45.1786, EV_B=32.25, EV_C=22.5714 → largest remainder → 45/32/23
    expect(computeIcmPayouts([50, 30, 20], [70, 30, 0])).toEqual([45, 32, 23]);
  });

  it('always sums exactly to the prize total and preserves stack ordering', () => {
    const payouts = computeIcmPayouts([9100, 5300, 3100, 1500], [500, 300, 200, 100]);
    expect(payouts.reduce((a, b) => a + b, 0)).toBe(1100);
    expect([...payouts].sort((a, b) => b - a)).toEqual(payouts);
  });

  it('handles empty input', () => {
    expect(computeIcmPayouts([], [])).toEqual([]);
  });
});

describe('computeChipChopPayouts', () => {
  it('splits proportionally to stacks', () => {
    expect(computeChipChopPayouts([50, 30, 20], 100)).toEqual([50, 30, 20]);
  });

  it('reconciles rounding so the total always equals the pool', () => {
    const payouts = computeChipChopPayouts([1, 1, 1], 100);
    expect(payouts).toEqual([34, 33, 33]);
    expect(payouts.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('returns zeros when stacks are empty or all zero', () => {
    expect(computeChipChopPayouts([0, 0], 100)).toEqual([0, 0]);
    expect(computeChipChopPayouts([], 100)).toEqual([]);
  });
});

describe('buildDealSettlement', () => {
  const payoutRatios = [
    { place: 1, percentage: 50 },
    { place: 2, percentage: 30 },
    { place: 3, percentage: 20 },
  ];
  // 4 players × 250 buy-in = 1000 pool → prizes 500/300/200
  const players = [
    { id: 'a', uid: 'ua', name: 'A', buyIn: 250, placement: null },
    { id: 'b', uid: 'ub', name: 'B', buyIn: 250, placement: null },
    { id: 'c', uid: 'uc', name: 'C', buyIn: 250, placement: 3 },  // eliminated in the money
    { id: 'd', uid: null, name: 'D', buyIn: 250, placement: 4 },  // eliminated out of the money
  ];

  it('remaining players get deal allocations; eliminated keep placement prizes', () => {
    // A and B chop places 1–2 (pool 800) as 450/350
    const settlement = buildDealSettlement(players, payoutRatios, [
      { playerId: 'a', prize: 450, placement: 1 },
      { playerId: 'b', prize: 350, placement: 2 },
    ]);

    expect(settlement.map((r) => [r.playerId, r.placement, r.prize, r.profit])).toEqual([
      ['a', 1, 450, 200],
      ['b', 2, 350, 100],
      ['c', 3, 200, -50],
      ['d', 4, 0, -250],
    ]);
    // Ledger balances: total prizes == total buy-ins share (100%)
    expect(settlement.reduce((sum, r) => sum + r.prize, 0)).toBe(1000);
  });
});
