/**
 * Formatters Test Suite
 * Covers every exported function in src/utils/formatters.js with
 * normal cases plus edge cases (0, negative, null/undefined,
 * large numbers, non-finite values).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatNumber,
  formatCash,
  formatCurrency,
  formatDate,
  formatShortDate,
  formatTime,
  calculateNet,
  getProfitColorClass,
  sanitizeInput,
  isValidEmail,
  generateShortId,
  copyToClipboard,
} from '../src/utils/formatters.js';

// ── formatNumber ──────────────────────────────────────

describe('formatNumber', () => {
  it('adds thousand separators to integers', () => {
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(25000)).toBe('25,000');
  });

  it('leaves numbers below 1000 untouched', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1)).toBe('1');
    expect(formatNumber(999)).toBe('999');
  });

  it('returns "0" for null and undefined', () => {
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber(undefined)).toBe('0');
  });

  it('formats negative numbers (no comma after the minus sign)', () => {
    expect(formatNumber(-999)).toBe('-999');
    expect(formatNumber(-1000)).toBe('-1,000');
    expect(formatNumber(-1234567)).toBe('-1,234,567');
  });

  it('formats very large integers', () => {
    expect(formatNumber(1e15)).toBe('1,000,000,000,000,000');
  });

  it('does not group numbers rendered in exponential notation', () => {
    // Documented limitation: numbers >= 1e21 stringify as exponential
    // and the grouping regex leaves them untouched.
    expect(formatNumber(1e21)).toBe('1e+21');
  });

  it('groups only the integer part for short decimals', () => {
    expect(formatNumber(1234.56)).toBe('1,234.56');
  });

  it('groups only the integer part, never the decimals (regression)', () => {
    // The grouping regex used to run over the whole string, producing
    // "1,234.5,678" for 4+ digit fractions.
    expect(formatNumber(1234.5678)).toBe('1,234.5678');
    expect(formatNumber(0.123456)).toBe('0.123456');
  });

  it('passes non-finite values through as strings', () => {
    expect(formatNumber(NaN)).toBe('NaN');
    expect(formatNumber(Infinity)).toBe('Infinity');
    expect(formatNumber(-Infinity)).toBe('-Infinity');
  });

  it('accepts numeric strings', () => {
    expect(formatNumber('12345')).toBe('12,345');
  });
});

// ── formatCash ────────────────────────────────────────

describe('formatCash', () => {
  it('returns an integer string when the division is exact', () => {
    expect(formatCash(100, 10)).toBe('10');
    expect(formatCash(0, 10)).toBe('0');
    expect(formatCash(-150, 10)).toBe('-15');
  });

  it('returns one decimal place when the division is not exact', () => {
    expect(formatCash(105, 10)).toBe('10.5');
    expect(formatCash(-15, 10)).toBe('-1.5');
    expect(formatCash(100, 3)).toBe('33.3');
  });

  it('defaults the rate to 1', () => {
    expect(formatCash(42)).toBe('42');
    expect(formatCash(-7)).toBe('-7');
  });

  it('treats null chips as 0', () => {
    expect(formatCash(null, 10)).toBe('0');
  });

  it('falls back to rate 1 when the rate is 0 or invalid (regression)', () => {
    // chips / 0 used to yield "Infinity" (or "NaN" for 0/0).
    expect(formatCash(100, 0)).toBe('100');
    expect(formatCash(0, 0)).toBe('0');
    expect(formatCash(100, -5)).toBe('100');
  });

  it('returns "NaN" for undefined chips', () => {
    expect(formatCash(undefined, 10)).toBe('NaN');
  });
});

// ── formatCurrency ────────────────────────────────────

describe('formatCurrency', () => {
  it('defaults to TWD', () => {
    expect(formatCurrency(1234)).toBe('NT$1,234');
  });

  it('supports the known currency codes', () => {
    expect(formatCurrency(1234, 'TWD')).toBe('NT$1,234');
    expect(formatCurrency(1234, 'USD')).toBe('$1,234');
    expect(formatCurrency(1234, 'CNY')).toBe('¥1,234');
    expect(formatCurrency(1234, 'JPY')).toBe('¥1,234');
  });

  it('uses no symbol for unknown currency codes', () => {
    expect(formatCurrency(1234, 'EUR')).toBe('1,234');
  });

  it('formats zero and null amounts as 0', () => {
    expect(formatCurrency(0)).toBe('NT$0');
    expect(formatCurrency(null)).toBe('NT$0');
  });

  it('places the symbol before the minus sign for negative amounts', () => {
    // Quirk: produces "NT$-1,234" rather than "-NT$1,234".
    expect(formatCurrency(-1234)).toBe('NT$-1,234');
  });

  it('groups large amounts', () => {
    expect(formatCurrency(9876543, 'USD')).toBe('$9,876,543');
  });
});

// ── formatDate / formatShortDate / formatTime ─────────
// A Date built with the local-time constructor is rendered in the
// local timezone, so these assertions are timezone independent.

describe('formatDate', () => {
  const d = new Date(2024, 0, 15, 13, 5, 9); // 2024-01-15 13:05:09 local

  it('formats a Date with zh-TW defaults (24h, 2-digit fields)', () => {
    const result = formatDate(d);
    expect(result).toMatch(/2024\/01\/15/);
    expect(result).toMatch(/13:05:09/);
  });

  it('accepts timestamps and date strings and produces identical output', () => {
    expect(formatDate(d.getTime())).toBe(formatDate(d));
    expect(formatDate('2024-01-15T13:05:09')).toBe(formatDate(d));
  });

  it('respects an explicit locale', () => {
    const result = formatDate(d, 'en-US');
    expect(result).toContain('2024');
    expect(result).toMatch(/13:05:09/);
  });

  it('returns "Invalid Date" for unparseable input', () => {
    expect(formatDate('not a date')).toBe('Invalid Date');
  });
});

describe('formatShortDate', () => {
  const d = new Date(2024, 0, 15, 13, 5, 9);

  it('formats only the date part', () => {
    const result = formatShortDate(d);
    expect(result).toMatch(/2024\/01\/15/);
    expect(result).not.toMatch(/13/);
  });

  it('accepts timestamps and produces identical output', () => {
    expect(formatShortDate(d.getTime())).toBe(formatShortDate(d));
  });

  it('returns "Invalid Date" for unparseable input', () => {
    expect(formatShortDate('garbage')).toBe('Invalid Date');
  });
});

describe('formatTime', () => {
  it('formats hours and minutes in 24h, zero padded', () => {
    expect(formatTime(new Date(2024, 0, 15, 9, 7, 0))).toMatch(/09:07/);
    expect(formatTime(new Date(2024, 0, 15, 23, 59, 0))).toMatch(/23:59/);
  });

  it('does not include seconds', () => {
    const result = formatTime(new Date(2024, 0, 15, 9, 7, 33));
    expect(result).not.toContain('33');
  });

  it('accepts timestamps', () => {
    const d = new Date(2024, 0, 15, 18, 30, 0);
    expect(formatTime(d.getTime())).toBe(formatTime(d));
  });
});

// ── calculateNet ──────────────────────────────────────

describe('calculateNet', () => {
  it('computes stack minus buyIn', () => {
    expect(calculateNet({ stack: 1500, buyIn: 1000 })).toBe(500);
  });

  it('returns a negative net for a losing player', () => {
    expect(calculateNet({ stack: 200, buyIn: 1000 })).toBe(-800);
  });

  it('returns 0 for break-even', () => {
    expect(calculateNet({ stack: 1000, buyIn: 1000 })).toBe(0);
  });

  it('returns 0 for null/undefined player', () => {
    expect(calculateNet(null)).toBe(0);
    expect(calculateNet(undefined)).toBe(0);
  });

  it('treats missing fields as 0', () => {
    expect(calculateNet({})).toBe(0);
    expect(calculateNet({ stack: 500 })).toBe(500);
    expect(calculateNet({ buyIn: 500 })).toBe(-500);
  });
});

// ── getProfitColorClass ───────────────────────────────

describe('getProfitColorClass', () => {
  it('returns emerald for profit', () => {
    expect(getProfitColorClass(1)).toBe('text-emerald-400');
    expect(getProfitColorClass(99999)).toBe('text-emerald-400');
  });

  it('returns rose for loss', () => {
    expect(getProfitColorClass(-1)).toBe('text-rose-400');
    expect(getProfitColorClass(-99999)).toBe('text-rose-400');
  });

  it('returns gray for zero', () => {
    expect(getProfitColorClass(0)).toBe('text-gray-400');
  });

  it('returns gray for NaN (all comparisons are false)', () => {
    expect(getProfitColorClass(NaN)).toBe('text-gray-400');
  });
});

// ── sanitizeInput ─────────────────────────────────────

describe('sanitizeInput', () => {
  it('removes angle brackets', () => {
    expect(sanitizeInput('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
    expect(sanitizeInput('a<b>c')).toBe('abc');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });

  it('strips brackets before trimming', () => {
    expect(sanitizeInput('  <hi>  ')).toBe('hi');
  });

  it('returns empty string for falsy input', () => {
    expect(sanitizeInput('')).toBe('');
    expect(sanitizeInput(null)).toBe('');
    expect(sanitizeInput(undefined)).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(sanitizeInput('   ')).toBe('');
  });

  it('leaves normal text untouched', () => {
    expect(sanitizeInput('Alice & Bob')).toBe('Alice & Bob');
  });
});

// ── isValidEmail ──────────────────────────────────────

describe('isValidEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('jaykang@liontravel.com')).toBe(true);
    expect(isValidEmail('user.name+tag@sub.example.org')).toBe(true);
  });

  it('rejects addresses missing parts', () => {
    expect(isValidEmail('plainaddress')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('user@domain')).toBe(false); // no TLD
    expect(isValidEmail('user@domain.')).toBe(false); // empty TLD
  });

  it('rejects whitespace and double @', () => {
    expect(isValidEmail('us er@example.com')).toBe(false);
    expect(isValidEmail('user@@example.com')).toBe(false);
  });

  it('rejects empty / non-string-like input', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(null)).toBe(false); // coerced to "null"
    expect(isValidEmail(undefined)).toBe(false);
  });
});

// ── generateShortId ───────────────────────────────────

describe('generateShortId', () => {
  it('returns a non-empty lowercase base36 string', () => {
    const id = generateShortId();
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[a-z0-9]+$/);
    expect(id.length).toBeGreaterThan(8);
  });

  it('generates unique ids across many calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateShortId()));
    expect(ids.size).toBe(50);
  });
});

// ── copyToClipboard ───────────────────────────────────
// We stub the browser clipboard API (an environment dependency),
// not the module under test.

describe('copyToClipboard', () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      delete navigator.clipboard;
    }
    vi.restoreAllMocks();
  });

  it('returns true and writes the text on success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    await expect(copyToClipboard('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('returns false when the clipboard write rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });

    await expect(copyToClipboard('hello')).resolves.toBe(false);
  });

  it('returns false when the clipboard API is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });

    await expect(copyToClipboard('hello')).resolves.toBe(false);
  });
});
