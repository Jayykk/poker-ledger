import { describe, it, expect, vi } from 'vitest';
import {
  normalizeCashDecimals,
  roundCashZeroSum,
  withCashAmounts,
  rowCash,
  recordCash,
  formatCashAmount,
  totalCashDecimals,
  roundCashTotal,
  formatCashTotal,
} from '../src/utils/cashRounding.js';
import { aggregateSessionSummary } from '../src/utils/sessionFlow.js';
import * as server from '../functions/src/utils/cashRounding.js';
import { settleCashGame, resolveCashDecimals } from '../functions/src/handlers/cashSettlement.js';
import { buildUserProjectionDocs } from '../functions/src/handlers/gameHistoryProjection.js';
import { generateTextReport } from '../src/utils/exportReport.js';

// Summing decimals in floats leaves ~1e-13 noise; compare at cent precision.
const sum = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100 || 0;

describe('normalizeCashDecimals', () => {
  it('accepts 0 / 1 / 2 and maps everything else to null', () => {
    expect(normalizeCashDecimals(0)).toBe(0);
    expect(normalizeCashDecimals('2')).toBe(2);
    for (const v of [null, undefined, '', 3, -1, 1.5, 'x']) {
      expect(normalizeCashDecimals(v)).toBeNull();
    }
  });
});

describe('roundCashZeroSum', () => {
  it('keeps the books balanced where naive rounding leaks a dollar', () => {
    // rate 10: +15 / −5 / −10 chips = +1.5 / −0.5 / −1
    // naive Math.round → +2 / −0 / −1 (sum +1)
    expect(roundCashZeroSum([1.5, -0.5, -1], 0)).toEqual([1, 0, -1]);
  });

  it('on a tie the winner collects less instead of a loser paying more', () => {
    // Options that balance: [1, 0, -1] (winner −0.5) or [2, -1, -1] (loser +0.5)
    expect(roundCashZeroSum([1.5, -0.5, -1], 0)).not.toEqual([2, -1, -1]);
    expect(roundCashZeroSum([-0.5, 1.5, -1], 0)).toEqual([0, 1, -1]); // order-independent
  });

  it('splits an even-sided remainder by largest fraction first', () => {
    // 100 split three ways between losers
    expect(roundCashZeroSum([100, -33.3333, -33.3333, -33.3334], 0)).toEqual([100, -33, -33, -34]);
  });

  it('supports decimal places', () => {
    const out = roundCashZeroSum([10.005, -3.335, -6.67], 2);
    expect(sum(out)).toBe(0);
    out.forEach((v, i) => expect(Math.abs(v - [10.005, -3.335, -6.67][i])).toBeLessThan(0.01));
  });

  it('returns exact amounts untouched when they already fit', () => {
    expect(roundCashZeroSum([120, -20, -100], 0)).toEqual([120, -20, -100]);
    expect(roundCashZeroSum([1.2, -1.2], 1)).toEqual([1.2, -1.2]);
  });

  it('never produces -0', () => {
    const out = roundCashZeroSum([0.4, -0.4], 0);
    expect(out.every((v) => !Object.is(v, -0))).toBe(true);
  });

  it('keeps a real chip gap (settled with a mismatch) as its rounded total', () => {
    expect(sum(roundCashZeroSum([1.4, 1.4, -1], 0))).toBe(2); // exact total 1.8 → 2
  });

  it('property: balanced, each within one unit, for random games', () => {
    let seed = 42;
    const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let n = 0; n < 500; n += 1) {
      const players = 2 + Math.floor(rand() * 8);
      const rate = [1, 3, 7, 10, 30, 100][Math.floor(rand() * 6)];
      const decimals = Math.floor(rand() * 3);
      // balanced chip profits
      const chips = Array.from({ length: players - 1 }, () => Math.round((rand() - 0.5) * 20000));
      chips.push(-chips.reduce((a, b) => a + b, 0));
      const exact = chips.map((c) => c / rate);
      const out = roundCashZeroSum(exact, decimals);
      expect(sum(out)).toBe(0);
      const unit = 10 ** -decimals;
      out.forEach((v, i) => expect(Math.abs(v - exact[i])).toBeLessThan(unit + 1e-9));
      // server copy agrees
      expect(server.roundCashZeroSum(exact, decimals)).toEqual(out);
    }
  });
});

describe('withCashAmounts / rowCash / recordCash', () => {
  const rows = [{ profit: 15 }, { profit: -5 }, { profit: -10 }];

  it('adds balanced cash to rows when rounding is set', () => {
    expect(withCashAmounts(rows, 10, 0).map((r) => r.cash)).toEqual([1, 0, -1]);
    expect(server.withCashAmounts(rows, 10, 0)).toEqual(withCashAmounts(rows, 10, 0));
  });

  it('leaves rows alone without rounding (legacy readers use profit / rate)', () => {
    expect(withCashAmounts(rows, 10, null)).toBe(rows);
  });

  it('prefers the stored rounded value, falls back to profit / rate', () => {
    expect(rowCash({ profit: 15, cash: 1 }, 10)).toBe(1);
    expect(rowCash({ profit: 15 }, 10)).toBe(1.5);
    expect(recordCash({ profit: 15, rate: 10, profitCash: 1 })).toBe(1);
    expect(recordCash({ profit: 15, rate: 10 })).toBe(1.5);
    expect(recordCash({ profit: 15 })).toBe(15);
  });
});

describe('formatCashAmount', () => {
  it('uses the chosen places, or the legacy look when unset', () => {
    expect(formatCashAmount(1, 0)).toBe('1');
    expect(formatCashAmount(1.5, 2)).toBe('1.50');
    expect(formatCashAmount(1.5, null)).toBe('1.5');
    expect(formatCashAmount(2, null)).toBe('2');
  });
});

describe('settleCashGame with rounding', () => {
  const game = (extra = {}) => ({
    type: 'live',
    status: 'active',
    name: 'Rounded',
    players: [
      { uid: 'a', name: 'A', buyIn: 100, stack: 115 },
      { uid: 'b', name: 'B', buyIn: 100, stack: 95 },
      { uid: 'c', name: 'C', buyIn: 100, stack: 90 },
    ],
    ...extra,
  });
  const createDb = (g) => {
    const update = vi.fn();
    const transaction = {
      get: vi.fn(async (ref) => (ref.path.startsWith('games/') ? { exists: true, data: () => g } : { exists: false })),
      update,
    };
    return {
      update,
      db: {
        collection: (name) => ({ doc: (id) => ({ path: `${name}/${id}` }) }),
        runTransaction: (cb) => cb(transaction),
      },
    };
  };

  it('stores balanced cash per row and the decimals used', async () => {
    const { db, update } = createDb(game());
    const res = await settleCashGame({ gameId: 'g', callerUid: 'a', exchangeRate: 10, cashDecimals: 0, db });
    expect(res.settlement.map((r) => r.cash)).toEqual([1, 0, -1]);
    expect(res.cashDecimals).toBe(0);
    expect(update.mock.calls[0][1]).toMatchObject({ cashDecimals: 0 });
  });

  it("falls back to the game's own setting when the client doesn't send one", async () => {
    const { db } = createDb(game({ cashDecimals: 0 }));
    const res = await settleCashGame({ gameId: 'g', callerUid: 'a', exchangeRate: 10, db });
    expect(res.settlement.map((r) => r.cash)).toEqual([1, 0, -1]);
  });

  it('an explicit null turns rounding off (no cash field)', async () => {
    const { db } = createDb(game({ cashDecimals: 0 }));
    const res = await settleCashGame({ gameId: 'g', callerUid: 'a', exchangeRate: 10, cashDecimals: null, db });
    expect(res.settlement.every((r) => r.cash === undefined)).toBe(true);
    expect(res.cashDecimals).toBeNull();
  });

  it('rejects invalid decimals', () => {
    expect(() => resolveCashDecimals(5, null)).toThrow('INVALID_CASH_DECIMALS');
  });
});

describe('history projection', () => {
  it('projects the rounded cash result as profitCash', () => {
    const docs = buildUserProjectionDocs('g', {
      name: 'Rounded',
      type: 'live',
      status: 'completed',
      rate: 10,
      cashDecimals: 0,
      completedAt: 1000,
      settlementSnapshot: [
        { odId: 'a', name: 'A', buyIn: 100, stack: 115, profit: 15, cash: 1 },
        { odId: 'b', name: 'B', buyIn: 100, stack: 95, profit: -5, cash: 0 },
      ],
    });
    expect(docs[0].data).toMatchObject({ profit: 15, rate: 10, profitCash: 1, cashDecimals: 0 });
    expect(docs[1].data.profitCash).toBe(0);
    expect(docs[0].data.settlement[0].cash).toBe(1);
  });

  it('leaves profitCash off for unrounded games', () => {
    const docs = buildUserProjectionDocs('g', {
      name: 'Legacy',
      type: 'live',
      status: 'completed',
      rate: 10,
      completedAt: 1000,
      settlementSnapshot: [{ odId: 'a', name: 'A', buyIn: 100, stack: 115, profit: 15 }],
    });
    expect(docs[0].data.profitCash).toBeUndefined();
    expect(docs[0].data.cashDecimals).toBeNull();
  });
});

describe('text report', () => {
  const game = {
    name: 'Rounded',
    players: [
      { name: 'A', buyIn: 100, stack: 115 },
      { name: 'B', buyIn: 100, stack: 95 },
      { name: 'C', buyIn: 100, stack: 90 },
    ],
  };

  it('prints balanced amounts and transfers when rounding is set', () => {
    const text = generateTextReport(game, 10, { cashDecimals: 0 });
    expect(text).toContain('A: +1\n');
    expect(text).toContain('B: 0\n');
    expect(text).toContain('C: -1\n');
    expect(text).toContain('C → A: 1\n');
    expect(text).not.toContain('B →');
  });

  it('keeps the legacy output without rounding', () => {
    const text = generateTextReport(game, 10);
    expect(text).toContain('A: +1.5\n');
    expect(text).toContain('B: -0.5\n');
  });
});

describe('totals over several games', () => {
  it('uses the most decimals any game settled with (legacy counts as 0)', () => {
    expect(totalCashDecimals([{}, { cashDecimals: null }])).toBe(0);
    expect(totalCashDecimals([{ cashDecimals: 0 }, { cashDecimals: 2 }, {}])).toBe(2);
    expect(totalCashDecimals(undefined)).toBe(0);
  });

  it('keeps a +1.5 result instead of rounding it to +2', () => {
    expect(roundCashTotal(1.5, 1)).toBe(1.5);
    expect(formatCashTotal(1.5, 1)).toBe('1.5');
    expect(formatCashTotal(1234.5, 2)).toBe('1,234.50');
    expect(formatCashTotal(-1234.4, 0)).toBe('-1,234');
    expect(roundCashTotal(-0.4, 0)).toBe(0);
  });

  it('session summaries carry the display precision of their tables', () => {
    const summary = aggregateSessionSummary([
      { name: 'T1', rate: 10, cashDecimals: 1, settlementSnapshot: [
        { odId: 'a', name: 'A', buyIn: 100, profit: 15, cash: 1.5 },
        { odId: 'b', name: 'B', buyIn: 100, profit: -15, cash: -1.5 },
      ] },
      { name: 'T2', rate: 10, settlementSnapshot: [
        { odId: 'a', name: 'A', buyIn: 100, profit: 10 },
        { odId: 'b', name: 'B', buyIn: 100, profit: -10 },
      ] },
    ]);
    expect(summary.cashDecimals).toBe(1);
    expect(summary.ranking[0]).toMatchObject({ odId: 'a', profitCash: 2.5 });
  });
});

describe('session summary loader', () => {
  it('passes each table\'s cashDecimals into the summary (Codex #200)', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const src = readFileSync(resolve(__dirname, '../src/composables/useSessions.js'), 'utf-8');
    const loader = src.slice(src.indexOf('async function loadSessionSummary'), src.indexOf('aggregateSessionSummary(games'));
    expect(loader).toContain('cashDecimals: g.cashDecimals');
  });
});
