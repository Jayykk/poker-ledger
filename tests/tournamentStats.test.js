/**
 * Tournament Stats Test Suite
 * Complements tests/tournamentClockLogic.test.js, which already covers:
 *   - computeChipsInPlay happy path / zero players / zero chips
 *   - computeAverageStack happy path / non-positive players / rounding
 *   - computeAverageStackBB happy path / non-positive inputs / rounding drift
 *   - buildTournamentStats after a re-entry cycle (entries, chipsInPlay, averageStack)
 *
 * This file only adds the exports/branches NOT covered there:
 *   - computeEntries tested directly (defaults, clamping, coercion)
 *   - input normalization (negative, NaN, string-numeric, missing args)
 *   - buildTournamentStats defaults, full shape incl. averageStackBB
 */
import { describe, it, expect } from 'vitest';
import {
  computeEntries,
  computeChipsInPlay,
  computeAverageStack,
  computeAverageStackBB,
  buildTournamentStats,
} from '../src/utils/tournamentStats.js';

// ── computeEntries (not directly covered elsewhere) ───

describe('computeEntries', () => {
  it('sums registered players and re-entries', () => {
    expect(computeEntries(10, 2)).toBe(12);
    expect(computeEntries(10, 0)).toBe(10);
  });

  it('defaults both arguments to 0', () => {
    expect(computeEntries()).toBe(0);
    expect(computeEntries(5)).toBe(5);
  });

  it('clamps negative inputs to 0 independently', () => {
    expect(computeEntries(-5, 3)).toBe(3);
    expect(computeEntries(5, -3)).toBe(5);
    expect(computeEntries(-5, -3)).toBe(0);
  });

  it('coerces numeric strings', () => {
    expect(computeEntries('10', '2')).toBe(12);
  });

  it('treats non-numeric and nullish inputs as 0', () => {
    expect(computeEntries('abc', 2)).toBe(2);
    expect(computeEntries(NaN, NaN)).toBe(0);
    expect(computeEntries(null, undefined)).toBe(0);
  });

  it('does not floor fractional inputs (documented behavior)', () => {
    expect(computeEntries(2.5, 1)).toBe(3.5);
  });
});

// ── computeChipsInPlay normalization branches ─────────

describe('computeChipsInPlay input normalization', () => {
  it('clamps negative entries to 0', () => {
    expect(computeChipsInPlay(-3, 1000)).toBe(0);
  });

  it('clamps negative starting chips to 0', () => {
    expect(computeChipsInPlay(10, -1000)).toBe(0);
  });

  it('coerces numeric strings', () => {
    expect(computeChipsInPlay('12', '25000')).toBe(300000);
  });

  it('treats non-numeric chips as 0', () => {
    expect(computeChipsInPlay(10, 'abc')).toBe(0);
    expect(computeChipsInPlay(10, NaN)).toBe(0);
  });

  it('defaults to 0 with no arguments', () => {
    expect(computeChipsInPlay()).toBe(0);
  });
});

// ── computeAverageStack normalization branches ────────

describe('computeAverageStack input normalization', () => {
  it('coerces numeric strings', () => {
    expect(computeAverageStack('300000', '10')).toBe(30000);
  });

  it('treats non-numeric chipsInPlay as 0', () => {
    expect(computeAverageStack(NaN, 10)).toBe(0);
    expect(computeAverageStack('abc', 10)).toBe(0);
  });

  it('returns 0 when playersRemaining is NaN or non-numeric', () => {
    expect(computeAverageStack(300000, NaN)).toBe(0);
    expect(computeAverageStack(300000, 'abc')).toBe(0);
  });

  it('defaults to 0 with no arguments', () => {
    expect(computeAverageStack()).toBe(0);
  });
});

// ── computeAverageStackBB normalization branches ──────

describe('computeAverageStackBB input normalization', () => {
  it('returns 0 for negative big blind', () => {
    expect(computeAverageStackBB(100000, 5, -100)).toBe(0);
  });

  it('coerces numeric strings', () => {
    expect(computeAverageStackBB('220000', '3', '2000')).toBe(37);
  });

  it('treats non-numeric chipsInPlay as 0', () => {
    expect(computeAverageStackBB(NaN, 5, 100)).toBe(0);
  });

  it('rounds to the nearest BB', () => {
    // 25000 / 3 / 50 = 166.66... → 167
    expect(computeAverageStackBB(25000, 3, 50)).toBe(167);
  });

  it('defaults to 0 with no arguments', () => {
    expect(computeAverageStackBB()).toBe(0);
  });
});

// ── buildTournamentStats shape and defaults ───────────

describe('buildTournamentStats', () => {
  it('returns an all-zero stats object with no arguments', () => {
    expect(buildTournamentStats()).toEqual({
      entries: 0,
      chipsInPlay: 0,
      averageStack: 0,
      averageStackBB: 0,
    });
  });

  it('returns an all-zero stats object for an empty config', () => {
    expect(buildTournamentStats({})).toEqual({
      entries: 0,
      chipsInPlay: 0,
      averageStack: 0,
      averageStackBB: 0,
    });
  });

  it('computes the full shape including averageStackBB', () => {
    const stats = buildTournamentStats({
      playersRegistered: 10,
      reentries: 2,
      playersRemaining: 8,
      startingChips: 25000,
      bigBlind: 2000,
    });
    expect(stats).toEqual({
      entries: 12,
      chipsInPlay: 300000,
      averageStack: 37500,
      averageStackBB: 19, // 300000 / 8 / 2000 = 18.75 → 19
    });
  });

  it('still reports entries and chipsInPlay when everyone has busted', () => {
    const stats = buildTournamentStats({
      playersRegistered: 6,
      reentries: 1,
      playersRemaining: 0,
      startingChips: 10000,
      bigBlind: 400,
    });
    expect(stats.entries).toBe(7);
    expect(stats.chipsInPlay).toBe(70000);
    expect(stats.averageStack).toBe(0);
    expect(stats.averageStackBB).toBe(0);
  });

  it('reports averageStack but zero BB when bigBlind is missing', () => {
    const stats = buildTournamentStats({
      playersRegistered: 4,
      playersRemaining: 4,
      startingChips: 5000,
    });
    expect(stats.averageStack).toBe(5000);
    expect(stats.averageStackBB).toBe(0);
  });

  it('clamps negative inputs instead of producing negative stats', () => {
    const stats = buildTournamentStats({
      playersRegistered: -10,
      reentries: -2,
      playersRemaining: -5,
      startingChips: -25000,
      bigBlind: -2000,
    });
    expect(stats).toEqual({
      entries: 0,
      chipsInPlay: 0,
      averageStack: 0,
      averageStackBB: 0,
    });
  });

  it('coerces string-numeric Firestore-style values', () => {
    const stats = buildTournamentStats({
      playersRegistered: '10',
      reentries: '2',
      playersRemaining: '6',
      startingChips: '10000',
      bigBlind: '500',
    });
    expect(stats.entries).toBe(12);
    expect(stats.chipsInPlay).toBe(120000);
    expect(stats.averageStack).toBe(20000);
    expect(stats.averageStackBB).toBe(40);
  });
});
