import { describe, it, expect } from 'vitest';
import { rateFromBuyIn, buyInAmountFromRate, resolveBuyInAmount, formatRate } from '../src/utils/buyInRate.js';
import { formatCash } from '../src/utils/formatters.js';

describe('buy-in amount ↔ rate', () => {
  it('derives chips per currency unit (cash = chips / rate)', () => {
    expect(rateFromBuyIn(1000, 100)).toBe(10);
    // 1000 chips for $100 → a +500 chip win is $50
    expect(formatCash(500, rateFromBuyIn(1000, 100))).toBe('50');
    expect(rateFromBuyIn(1000, 300)).toBeCloseTo(3.3333, 4);
  });

  it('rejects empty / non-positive input', () => {
    expect(rateFromBuyIn(1000, 0)).toBeNull();
    expect(rateFromBuyIn(1000, '')).toBeNull();
    expect(rateFromBuyIn(0, 100)).toBeNull();
  });

  it('recovers the amount for presets saved with only a rate', () => {
    expect(buyInAmountFromRate(1000, 10)).toBe(100);
    expect(buyInAmountFromRate(1000, 3)).toBe(333.33);
    expect(resolveBuyInAmount({ buyIn: 1000, rate: 10 })).toBe(100);
    expect(resolveBuyInAmount({ buyInAmount: 120, buyIn: 1000, rate: 10 })).toBe(120);
  });

  it('formats the rate compactly', () => {
    expect(formatRate(10)).toBe('10');
    expect(formatRate(1000 / 300)).toBe('3.3333');
    expect(formatRate(0)).toBe('-');
  });
});
