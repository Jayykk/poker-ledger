import { describe, it, expect } from 'vitest';
import {
  LINE_KIND,
  normalizeReceipt,
  receiptTitle,
  normalizeName,
  matchPersonName,
  linesFromReceipt,
  blankLine,
  expenseProblems,
  expenseShares,
  expenseDebts,
  aggregateExpenses,
  combineEventTotals,
  chargedTotal,
  linesTotal,
  eventPeople,
  serializeExpense
} from '../src/utils/eventExpenses.js';

const PEOPLE = [
  { uid: 'jay', name: 'Jay Kang' },
  { uid: 'amy', name: 'Amy' },
  { uid: 'bob', name: '小鮑' },
  { uid: 'ann', name: 'Annie' }
];

const line = (over) => ({ ...blankLine(over.kind), ...over });

describe('normalizeReceipt', () => {
  it('keeps valid items and fees, drops junk', () => {
    const r = normalizeReceipt({
      merchant: ' 八方雲集 ',
      items: [
        { name: '鍋貼', quantity: 2, amount: '$130', person: 'Amy' },
        { name: '', amount: 50 },
        { name: '酸辣湯', amount: 0 },
        { name: '豆漿', amount: 'abc' },
        null
      ],
      fees: [
        { name: '外送費', amount: 39 },
        { name: '優惠', amount: -50 },
        { name: '空', amount: 0 }
      ],
      total: 119
    });
    expect(r.merchant).toBe('八方雲集');
    expect(r.items).toEqual([{ name: '鍋貼', quantity: 2, amount: 130, person: 'Amy' }]);
    expect(r.fees).toEqual([{ name: '外送費', amount: 39 }, { name: '優惠', amount: -50 }]);
    expect(r.total).toBe(119);
  });

  it('tolerates a non-object answer', () => {
    expect(normalizeReceipt(null)).toEqual({ merchant: '', platform: '', items: [], fees: [], total: null });
    expect(normalizeReceipt([1, 2]).items).toEqual([]);
  });

  it('defaults a missing or bad quantity to 1', () => {
    const r = normalizeReceipt({ items: [{ name: 'a', amount: 1 }, { name: 'b', amount: 1, quantity: -3 }] });
    expect(r.items.map((i) => i.quantity)).toEqual([1, 1]);
  });
});

describe('receiptTitle', () => {
  it('names the expense after the app and the store', () => {
    expect(receiptTitle({ merchant: '八方雲集', platform: 'Uber Eats' })).toBe('Uber Eats · 八方雲集');
    expect(receiptTitle({ merchant: '', platform: 'foodpanda' })).toBe('foodpanda');
    expect(receiptTitle({ merchant: '八方雲集', platform: '' })).toBe('八方雲集');
    // Store name already says it
    expect(receiptTitle({ merchant: 'Uber Eats 優惠店', platform: 'Uber Eats' })).toBe('Uber Eats 優惠店');
    expect(receiptTitle(null)).toBe('');
  });
});

describe('matchPersonName', () => {
  it('matches exactly after normalising case, width and spaces', () => {
    expect(normalizeName(' Ａｍｙ！ ')).toBe('amy');
    expect(matchPersonName('amy', PEOPLE)).toBe('amy');
    expect(matchPersonName('JAYKANG', PEOPLE)).toBe('jay');
  });

  it('strips "’s items" and "的餐點" owner suffixes', () => {
    expect(matchPersonName("Amy's items", PEOPLE)).toBe('amy');
    expect(matchPersonName('小鮑 的餐點', PEOPLE)).toBe('bob');
  });

  it('matches a unique partial name of 2+ characters', () => {
    expect(matchPersonName('Jay K.', PEOPLE)).toBe('jay');
    expect(matchPersonName('Jay', PEOPLE)).toBe('jay');
  });

  it('gives up when the name is ambiguous or too short', () => {
    // "An" is inside both "Annie" and "Jay Kang"
    expect(matchPersonName('An', PEOPLE)).toBeNull();
    expect(matchPersonName('J', PEOPLE)).toBeNull();
    expect(matchPersonName('Zed', PEOPLE)).toBeNull();
    expect(matchPersonName('', PEOPLE)).toBeNull();
  });
});

describe('linesFromReceipt', () => {
  it('ticks and pre-assigns items, leaves fees unticked', () => {
    const lines = linesFromReceipt({
      items: [
        { name: '鍋貼', quantity: 1, amount: 65, person: 'Amy' },
        { name: '酸辣湯', quantity: 1, amount: 40, person: 'Someone' },
        { name: '豆漿', quantity: 1, amount: 25, person: '' }
      ],
      fees: [{ name: '外送費', amount: 39 }]
    }, PEOPLE);
    expect(lines.map((l) => [l.kind, l.charged, l.assignees])).toEqual([
      [LINE_KIND.ITEM, true, ['amy']],
      [LINE_KIND.ITEM, true, []],
      [LINE_KIND.ITEM, true, []],
      [LINE_KIND.FEE, false, []]
    ]);
    expect(lines[1].person).toBe('Someone');
    expect(new Set(lines.map((l) => l.id)).size).toBe(4);
  });
});

describe('expenseProblems', () => {
  it('flags charged lines without assignees or amount, ignores unticked ones', () => {
    const p = expenseProblems({
      lines: [
        line({ id: 'a', amount: 100, charged: true, assignees: ['amy'] }),
        line({ id: 'b', amount: 100, charged: true, assignees: [] }),
        line({ id: 'c', name: '湯', amount: null, charged: true, assignees: ['amy'] }),
        line({ id: 'd', amount: null, charged: false, assignees: [] }),
        line({ id: 'e', kind: LINE_KIND.FEE, amount: -50, charged: true, assignees: ['amy'] }),
        line({ id: 'f', kind: LINE_KIND.ITEM, amount: -50, charged: true, assignees: ['amy'] })
      ]
    });
    expect(p.unassigned).toEqual(['b']);
    expect(p.badAmount).toEqual(['c', 'f']);
    expect(p.ok).toBe(false);
  });

  it('ignores blank lines, but an expense needs at least one line', () => {
    const blank = line({ id: 'z', name: '', amount: null, charged: true, assignees: [] });
    expect(expenseProblems({ lines: [blank] })).toMatchObject({ unassigned: [], badAmount: [], empty: true, ok: false });
    const p = expenseProblems({ lines: [blank, line({ id: 'a', name: 'x', amount: 10, charged: true, assignees: ['amy'] })] });
    expect(p).toMatchObject({ empty: false, ok: true });
  });
});

describe('expense maths', () => {
  const order = {
    payerUid: 'jay',
    payerName: 'Jay Kang',
    names: { jay: 'Jay Kang', amy: 'Amy', bob: '小鮑' },
    lines: [
      line({ amount: 120, charged: true, assignees: ['amy'] }),
      line({ amount: 100, charged: true, assignees: ['bob', 'amy', 'jay'] }), // 33.33 each
      line({ amount: 150, charged: true, assignees: ['jay'] }), // payer's own, still ticked
      line({ amount: 200, charged: false, assignees: ['bob'] }), // a treat
      line({ kind: LINE_KIND.FEE, amount: 39, charged: false }), // payer absorbs
      line({ kind: LINE_KIND.FEE, amount: 30, charged: true, assignees: ['amy', 'bob'] })
    ]
  };

  it('splits charged lines evenly and rounds each person to whole dollars', () => {
    // amy 120 + 33.33 + 15 = 168.33, bob 33.33 + 15 = 48.33, jay 33.33 + 150 = 183.33
    expect(expenseShares(order)).toEqual({ amy: 168, bob: 48, jay: 183 });
    // 3 × 66.67: everyone rounds up, the payer just gets the extra dollar back
    expect(expenseShares({ lines: [line({ amount: 200, charged: true, assignees: ['a', 'b', 'c'] })] }))
      .toEqual({ a: 67, b: 67, c: 67 });
  });

  it('lists only what the others owe the payer', () => {
    expect(expenseDebts(order)).toEqual([{ uid: 'amy', amount: 168 }, { uid: 'bob', amount: 48 }]);
  });

  it('totals the receipt and the charged part', () => {
    expect(linesTotal(order.lines)).toBe(639);
    expect(chargedTotal(order.lines)).toBe(400);
  });

  it('nets everything across expenses', () => {
    const drinks = {
      payerUid: 'amy',
      names: { amy: 'Amy', jay: 'Jay Kang' },
      lines: [line({ amount: 60, charged: true, assignees: ['jay'] })]
    };
    expect(aggregateExpenses([order, drinks])).toEqual([
      { uid: 'jay', name: 'Jay Kang', net: 156, receive: 216, pay: 60 },
      { uid: 'bob', name: '小鮑', net: -48, receive: 0, pay: 48 },
      { uid: 'amy', name: 'Amy', net: -108, receive: 60, pay: 168 }
    ]);
  });

  it('a shared discount lowers what someone owes', () => {
    const e = {
      payerUid: 'jay',
      lines: [
        line({ amount: 100, charged: true, assignees: ['amy'] }),
        line({ kind: LINE_KIND.FEE, amount: -30, charged: true, assignees: ['amy'] })
      ]
    };
    expect(expenseDebts(e)).toEqual([{ uid: 'amy', amount: 70 }]);
  });
});

describe('combineEventTotals', () => {
  it('adds expense nets to poker results by uid, keeps guests by name', () => {
    const rows = combineEventTotals(
      [
        { odId: 'jay', name: 'Jay Kang', profitCash: -500 },
        { odId: 'amy', name: 'Amy', profitCash: 300 },
        { odId: null, name: 'Guest', profitCash: 200 }
      ],
      [
        { uid: 'jay', name: 'Jay Kang', net: 156 },
        { uid: 'amy', name: 'Amy', net: -108 },
        { uid: 'bob', name: '小鮑', net: -48 }
      ]
    );
    expect(rows).toEqual([
      { key: 'name:Guest', name: 'Guest', poker: 200, expense: 0, total: 200 },
      { key: 'amy', name: 'Amy', poker: 300, expense: -108, total: 192 },
      { key: 'bob', name: '小鮑', poker: 0, expense: -48, total: -48 },
      { key: 'jay', name: 'Jay Kang', poker: -500, expense: 156, total: -344 }
    ]);
  });
});

describe('eventPeople', () => {
  it('unions period rosters and adds the host', () => {
    const people = eventPeople({
      hostUid: 'host',
      hostName: 'Host',
      periods: [
        { roster: [{ uid: 'amy', name: 'Amy' }, { uid: 'bob', name: 'Bob' }] },
        { roster: [{ uid: 'amy', name: 'Amy 2' }, { uid: 'ann', name: 'Annie' }] }
      ]
    });
    expect(people).toEqual([
      { uid: 'amy', name: 'Amy' },
      { uid: 'bob', name: 'Bob' },
      { uid: 'ann', name: 'Annie' },
      { uid: 'host', name: 'Host' }
    ]);
  });
});

describe('serializeExpense', () => {
  it('drops empty lines, coerces numbers and snapshots names', () => {
    const out = serializeExpense({
      title: ' UE 晚餐 ',
      payerUid: 'jay',
      receiptTotal: '639',
      lines: [
        { id: 'a', kind: 'item', name: '鍋貼', amount: '120', quantity: '2', charged: true, assignees: ['amy', 'amy'] },
        { id: 'b', kind: 'item', name: '', amount: '', charged: true, assignees: [] },
        { id: 'c', kind: 'fee', name: '外送費', amount: 39, charged: false, assignees: [] }
      ]
    }, PEOPLE);
    expect(out).toEqual({
      title: 'UE 晚餐',
      payerUid: 'jay',
      payerName: 'Jay Kang',
      receiptTotal: 639,
      names: { jay: 'Jay Kang', amy: 'Amy' },
      lines: [
        { id: 'a', kind: 'item', name: '鍋貼', quantity: 2, amount: 120, charged: true, assignees: ['amy'], person: '' },
        { id: 'c', kind: 'fee', name: '外送費', quantity: 1, amount: 39, charged: false, assignees: [], person: '' }
      ]
    });
  });
});
