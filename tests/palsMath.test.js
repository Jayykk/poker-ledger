import { describe, it, expect } from 'vitest';
import {
  PALS_MIN_GAMES, PALS_WINDOW_MONTHS, filterPals, isHiddenAccount, palCandidates, palsWindowStart, samePals,
} from '../functions/src/utils/palsMath.js';

const NOW = Date.parse('2026-10-06T12:00:00+08:00');
const DAY = 24 * 60 * 60 * 1000;
// A history_sub record of a game with these accounts (null = guest)
const game = (id, daysAgo, odIds, { at = 'completedAt' } = {}) => ({
  gameId: id,
  [at]: NOW - daysAgo * DAY,
  settlement: odIds.map((odId) => ({ odId, name: odId || 'guest' })),
});

describe('牌友圈 (pals)', () => {
  it('constants: 6 months, 2 games', () => {
    expect(PALS_WINDOW_MONTHS).toBe(6);
    expect(PALS_MIN_GAMES).toBe(2);
    expect(new Date(palsWindowStart(NOW)).toISOString()).toBe('2026-04-06T04:00:00.000Z');
  });

  it('at least 2 shared games; self and guests never count', () => {
    const records = [
      game('g1', 1, ['me', 'amy', 'bob', null]),
      game('g2', 5, ['me', 'amy', 'cat', null]),
      game('g3', 9, ['me', 'bob']),
      game('g4', 9, ['me', 'dan']),
    ];
    expect(palCandidates('me', records, NOW)).toEqual(['amy', 'bob']);
  });

  it('only games finished in the last 6 months (completedAt, else createdAt)', () => {
    const records = [
      game('g1', 10, ['me', 'amy']),
      game('g2', 200, ['me', 'amy']), // too old
      game('g3', 20, ['me', 'bob'], { at: 'createdAt' }),
      game('g4', 30, ['me', 'bob'], { at: 'createdAt' }),
      { ...game('g5', 300, ['me', 'cat']), completedAt: NOW - 3 * DAY }, // completedAt wins
      game('g6', 3, ['me', 'cat']),
      game('g7', -2, ['me', 'dan']), // in the future: not counted
      game('g8', 1, ['me', 'dan']),
    ];
    expect(palCandidates('me', records, NOW)).toEqual(['bob', 'cat']);
  });

  it('a player listed twice in one game counts that game once', () => {
    expect(palCandidates('me', [game('g1', 1, ['me', 'amy', 'amy'])], NOW)).toEqual([]);
  });

  it('hidden accounts (anonymous / nameless / gone) are left out', () => {
    expect(isHiddenAccount({ name: 'A' })).toBe(false);
    expect(isHiddenAccount({ displayName: 'A' })).toBe(false);
    expect(isHiddenAccount({ name: 'A', isAnonymous: true })).toBe(true);
    expect(isHiddenAccount({ name: '' })).toBe(true);
    expect(isHiddenAccount(null)).toBe(true);
    const hidden = { amy: false, bob: true };
    expect(filterPals(['amy', 'bob'], (uid) => hidden[uid])).toEqual(['amy']);
  });

  it('unknown accounts stay only if they already were pals (not re-read)', () => {
    expect(filterPals(['amy', 'bob', 'cat'], (uid) => (uid === 'cat' ? false : undefined), ['amy']))
      .toEqual(['amy', 'cat']);
  });

  it('symmetric on a shared history', () => {
    const shared = [
      game('g1', 1, ['amy', 'bob', 'cat']),
      game('g2', 2, ['amy', 'bob']),
      game('g3', 3, ['amy', 'cat', 'dan']),
      game('g4', 4, ['bob', 'cat', 'dan']),
    ];
    const historyOf = (uid) => shared.filter((g) => g.settlement.some((row) => row.odId === uid));
    const pals = Object.fromEntries(['amy', 'bob', 'cat', 'dan'].map((uid) => [uid, palCandidates(uid, historyOf(uid), NOW)]));
    expect(pals).toEqual({
      amy: ['bob', 'cat'],
      bob: ['amy', 'cat'],
      cat: ['amy', 'bob', 'dan'],
      dan: ['cat'],
    });
    for (const [uid, list] of Object.entries(pals)) {
      for (const other of list) expect(pals[other]).toContain(uid);
    }
  });

  it('samePals compares sorted lists', () => {
    expect(samePals(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(samePals(['a'], ['a', 'b'])).toBe(false);
    expect(samePals(undefined, [])).toBe(false);
  });
});
