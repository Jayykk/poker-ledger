/**
 * Unit tests for functions/src/utils/seatFactory.js
 * Pure helpers shared by room creation (auto-seat host) and join-seat.
 */
import { describe, it, expect } from 'vitest';
import { buildSeatData, resolveBuyIn } from '../../functions/src/utils/seatFactory.js';

describe('buildSeatData', () => {
  it('builds an active seat carrying chips and the initial buy-in', () => {
    const seat = buildSeatData('u1', { name: 'Alice', avatar: 'a.png' }, 1500);
    expect(seat).toEqual({
      odId: 'u1',
      odName: 'Alice',
      odAvatar: 'a.png',
      chips: 1500,
      initialBuyIn: 1500,
      status: 'active',
      currentBet: 0,
      isDealer: false,
      isSmallBlind: false,
      isBigBlind: false,
    });
  });

  it('falls back to defaults when userInfo is missing', () => {
    const seat = buildSeatData('u1', undefined, 1000);
    expect(seat.odName).toBe('Player');
    expect(seat.odAvatar).toBe('');
  });
});

describe('resolveBuyIn', () => {
  it('returns null when no usable buy-in is provided', () => {
    expect(resolveBuyIn(undefined, 1000, 5000)).toBeNull();
    expect(resolveBuyIn(0, 1000, 5000)).toBeNull();
    expect(resolveBuyIn(-100, 1000, 5000)).toBeNull();
    expect(resolveBuyIn('abc', 1000, 5000)).toBeNull();
  });

  it('passes through a value within the band', () => {
    expect(resolveBuyIn(2500, 1000, 5000)).toBe(2500);
  });

  it('clamps below the minimum and above the maximum', () => {
    expect(resolveBuyIn(500, 1000, 5000)).toBe(1000);
    expect(resolveBuyIn(9999, 1000, 5000)).toBe(5000);
  });

  it('coerces numeric strings', () => {
    expect(resolveBuyIn('3000', 1000, 5000)).toBe(3000);
  });

  it('ignores a nonsensical band (max < min) instead of inverting it', () => {
    // Defensive: a misconfigured room should not force the buy-in to a smaller
    // ceiling than the floor. Fall back to honoring the requested amount.
    expect(resolveBuyIn(3000, 1000, 500)).toBe(3000);
  });
});
