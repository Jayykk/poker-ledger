/**
 * Export Report Test Suite
 * Covers the pure exports of src/utils/exportReport.js:
 *   - generateTextReport (settlement text, sorting, transfer suggestions,
 *     gap warning, exchange rates, options)
 *   - generateCSV (history export)
 *
 * downloadCSV / exportHistoryToCSV are DOM side-effect helpers
 * (Blob + URL.createObjectURL + anchor click) and are intentionally
 * not unit tested here.
 */
import { describe, it, expect } from 'vitest';
import { generateTextReport, generateCSV } from '../src/utils/exportReport.js';

const makeGame = (players, name = 'Friday Night') => ({ name, players });

// ── generateTextReport ────────────────────────────────

describe('generateTextReport', () => {
  it('returns empty string for null/undefined game', () => {
    expect(generateTextReport(null)).toBe('');
    expect(generateTextReport(undefined)).toBe('');
  });

  it('includes the game name, a date line and the exchange rate header', () => {
    const game = makeGame([{ name: 'Alice', stack: 1000, buyIn: 1000 }]);
    const text = generateTextReport(game, 10);
    expect(text).toContain('🎲 局: Friday Night');
    expect(text).toContain('📅 ');
    expect(text).toContain('💰 匯率: 1:10');
    expect(text).toContain('---');
  });

  it('defaults the exchange rate to 10', () => {
    const game = makeGame([{ name: 'Alice', stack: 1000, buyIn: 1000 }]);
    expect(generateTextReport(game)).toContain('💰 匯率: 1:10');
  });

  it('converts player nets to cash using the rate', () => {
    const game = makeGame([
      { name: 'Alice', stack: 1500, buyIn: 1000 }, // +500 chips → +50 cash
      { name: 'Bob', stack: 500, buyIn: 1000 },    // -500 chips → -50 cash
    ]);
    const text = generateTextReport(game, 10);
    expect(text).toContain('Alice: +50\n');
    expect(text).toContain('Bob: -50\n');
  });

  it('sorts players by net descending', () => {
    const game = makeGame([
      { name: 'Loser', stack: 0, buyIn: 1000 },
      { name: 'Winner', stack: 2000, buyIn: 1000 },
      { name: 'Even', stack: 1000, buyIn: 1000 },
    ]);
    const text = generateTextReport(game, 1);
    const winnerIdx = text.indexOf('Winner:');
    const evenIdx = text.indexOf('Even:');
    const loserIdx = text.indexOf('Loser:');
    expect(winnerIdx).toBeLessThan(evenIdx);
    expect(evenIdx).toBeLessThan(loserIdx);
  });

  it('prefixes winners with + but not break-even players', () => {
    const game = makeGame([
      { name: 'Winner', stack: 1100, buyIn: 1000 },
      { name: 'Even', stack: 1000, buyIn: 1000 },
    ]);
    const text = generateTextReport(game, 1);
    expect(text).toContain('Winner: +100\n');
    expect(text).toContain('Even: 0\n');
  });

  it('shows fractional cash with one decimal place', () => {
    const game = makeGame([
      { name: 'Alice', stack: 1255, buyIn: 1000 }, // +255 / 10 = 25.5
      { name: 'Bob', stack: 745, buyIn: 1000 },    // -255 / 10 = -25.5
    ]);
    const text = generateTextReport(game, 10);
    expect(text).toContain('Alice: +25.5\n');
    expect(text).toContain('Bob: -25.5\n');
  });

  it('omits the gap warning when stacks balance the buy-ins', () => {
    const game = makeGame([
      { name: 'Alice', stack: 1500, buyIn: 1000 },
      { name: 'Bob', stack: 500, buyIn: 1000 },
    ]);
    expect(generateTextReport(game, 10)).not.toContain('誤差');
  });

  it('shows a formatted gap warning when chips do not balance', () => {
    const game = makeGame([
      { name: 'Alice', stack: 2500, buyIn: 1000 }, // 1500 extra chips on table
    ]);
    const text = generateTextReport(game, 10);
    expect(text).toContain('⚠️ 誤差: 1,500');
  });

  it('shows a negative gap when chips are missing', () => {
    const game = makeGame([
      { name: 'Alice', stack: 400, buyIn: 1000 },
      { name: 'Bob', stack: 500, buyIn: 0 },
    ]);
    const text = generateTextReport(game, 10);
    expect(text).toContain('⚠️ 誤差: -100');
  });

  it('suggests minimum transfers from losers to winners (in cash)', () => {
    const game = makeGame([
      { name: 'Alice', stack: 1500, buyIn: 1000 }, // +500
      { name: 'Bob', stack: 700, buyIn: 1000 },    // -300
      { name: 'Carol', stack: 800, buyIn: 1000 },  // -200
    ]);
    const text = generateTextReport(game, 10);
    expect(text).toContain('=== 轉帳建議 ===');
    expect(text).toContain('Bob → Alice: 30\n');
    expect(text).toContain('Carol → Alice: 20\n');
  });

  it('splits a debt across creditors greedily (largest first)', () => {
    const game = makeGame([
      { name: 'A', stack: 1500, buyIn: 1000 }, // +500
      { name: 'B', stack: 1300, buyIn: 1000 }, // +300
      { name: 'C', stack: 600, buyIn: 1000 },  // -400
      { name: 'D', stack: 600, buyIn: 1000 },  // -400
    ]);
    const text = generateTextReport(game, 1);
    expect(text).toContain('C → A: 400\n');
    expect(text).toContain('D → B: 300\n');
    expect(text).toContain('D → A: 100\n');
  });

  it('excludes break-even players from transfers', () => {
    const game = makeGame([
      { name: 'Alice', stack: 1200, buyIn: 1000 },
      { name: 'Even', stack: 1000, buyIn: 1000 },
      { name: 'Bob', stack: 800, buyIn: 1000 },
    ]);
    const text = generateTextReport(game, 1);
    expect(text).toContain('Bob → Alice: 200\n');
    expect(text).not.toContain('Even →');
    expect(text).not.toContain('→ Even');
  });

  it('omits the transfer section when includeTransfers is false', () => {
    const game = makeGame([
      { name: 'Alice', stack: 1500, buyIn: 1000 },
      { name: 'Bob', stack: 500, buyIn: 1000 },
    ]);
    const text = generateTextReport(game, 10, { includeTransfers: false });
    expect(text).not.toContain('轉帳建議');
    expect(text).not.toContain('→');
  });

  it('omits the transfer section when everyone is break-even', () => {
    const game = makeGame([
      { name: 'Alice', stack: 1000, buyIn: 1000 },
      { name: 'Bob', stack: 1000, buyIn: 1000 },
    ]);
    expect(generateTextReport(game, 10)).not.toContain('轉帳建議');
  });

  it('omits the transfer section when there are winners but no losers', () => {
    // One creditor and zero debtors → greedy loop never runs.
    const game = makeGame([{ name: 'Alice', stack: 2000, buyIn: 1000 }]);
    const text = generateTextReport(game, 10);
    expect(text).not.toContain('轉帳建議');
  });

  it('handles an empty player list', () => {
    const text = generateTextReport(makeGame([], 'Empty Table'), 10);
    expect(text).toContain('🎲 局: Empty Table');
    expect(text).not.toContain('誤差');
    expect(text).not.toContain('轉帳建議');
  });

  it('treats a missing buyIn as 0 in the gap calculation (regression)', () => {
    // The gap reduce used (p.stack || 0) for stacks but raw p.buyIn, so an
    // undefined buyIn poisoned the sum and the report printed "誤差: NaN".
    const game = makeGame([
      { name: 'Alice', stack: 1000, buyIn: 1000 },
      { name: 'NoBuyIn', stack: 0 }, // buyIn missing
    ]);
    const text = generateTextReport(game, 10);
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('誤差'); // stacks (1000) === buy-ins (1000) → no gap line
  });
});

// ── generateCSV ───────────────────────────────────────

describe('generateCSV', () => {
  it('returns empty string for null or empty history', () => {
    expect(generateCSV(null)).toBe('');
    expect(generateCSV(undefined)).toBe('');
    expect(generateCSV([])).toBe('');
  });

  it('starts with the Chinese header row', () => {
    const csv = generateCSV([{ date: Date.now(), gameName: 'G', profit: 100, rate: 10 }]);
    expect(csv.startsWith('日期,牌局名稱,損益(籌碼),匯率,損益\n')).toBe(true);
  });

  it('writes one row per record with chips, rate and converted cash', () => {
    const ts = new Date(2024, 0, 15, 13, 5, 9).getTime();
    const csv = generateCSV([
      { date: ts, gameName: 'Game A', profit: 5000, rate: 10 },
      { date: ts, gameName: 'Game B', profit: -2500, rate: 10 },
    ]);
    const lines = csv.trimEnd().split('\n');
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toContain(',Game A,5000,10,500');
    expect(lines[2]).toContain(',Game B,-2500,10,-250');
    // Date column is rendered with formatDate (zh-TW)
    expect(lines[1]).toMatch(/^2024\/01\/15/);
  });

  it('strips commas from game names to keep the CSV well-formed', () => {
    const csv = generateCSV([
      { date: Date.now(), gameName: 'Home, Game, Night', profit: 0, rate: 1 },
    ]);
    expect(csv).toContain(',Home Game Night,');
    const row = csv.trimEnd().split('\n')[1];
    expect(row.split(',')).toHaveLength(5);
  });

  it('applies defaults: 未命名 name, 0 profit, rate 1', () => {
    const csv = generateCSV([{ date: Date.now() }]);
    const row = csv.trimEnd().split('\n')[1];
    expect(row).toContain(',未命名,0,1,0');
  });

  it('shows fractional cash with one decimal place', () => {
    const csv = generateCSV([
      { date: Date.now(), gameName: 'G', profit: 255, rate: 10 },
    ]);
    expect(csv).toContain(',G,255,10,25.5');
  });

  it('ends with a trailing newline', () => {
    const csv = generateCSV([{ date: Date.now(), gameName: 'G', profit: 1, rate: 1 }]);
    expect(csv.endsWith('\n')).toBe(true);
  });
});
