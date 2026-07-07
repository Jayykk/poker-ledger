import { describe, it, expect } from 'vitest';
import {
  buildTournamentPrizeMap,
  buildTournamentSettlement,
  buildCashSettlement,
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
