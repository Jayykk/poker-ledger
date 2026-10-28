import { describe, it, expect } from 'vitest';
import { buildSessionSummaryBubble } from '../src/utils/sessionSummaryCard.js';

const summary = {
  tableCount: 2,
  totalBuyIn: 4800,
  cashDecimals: 0,
  ranking: [
    { odId: 'joy', name: 'JOY', profitCash: 4905 },
    { odId: 'jay', name: 'Jay', profitCash: -127 },
    { odId: 'chiho', name: 'Chiho', profitCash: -828 },
    { odId: 'he', name: '賀賀', profitCash: -1041 },
    { odId: 'dan', name: 'Daniel', profitCash: -1309 },
    { odId: 'ann', name: 'Annie', profitCash: -1600 },
  ],
};

// Every text in the body, in order; rows joined as "label | amount"
const lines = (bubble) => bubble.body.contents.flatMap((c) => {
  if (c.type === 'text') return [c.text];
  if (c.type === 'box') return [c.contents.map((x) => x.text).join(' | ')];
  return [];
});

describe('buildSessionSummaryBubble', () => {
  it('lists every player, not just the top five', () => {
    const out = lines(buildSessionSummaryBubble({ name: '宜蘭分部' }, summary));
    expect(out).toEqual([
      '宜蘭分部',
      '桌數 2 | 總買入 4800',
      '🥇 JOY | +4,905',
      '🥈 Jay | -127',
      '🥉 Chiho | -828',
      '4. 賀賀 | -1,041',
      '5. Daniel | -1,309',
      '6. Annie | -1,600',
    ]);
  });

  it('with expenses: 總和, 牌局 and 代墊 sections split by dividers, no per-expense detail', () => {
    const dinner = {
      title: 'Uber Eats · 八方雲集', payerUid: 'jay', payerName: 'Jay',
      names: { jay: 'Jay', joy: 'JOY', ann: 'Annie' },
      lines: [
        { id: 'a', kind: 'item', amount: 200, charged: true, assignees: ['joy'] },
        { id: 'b', kind: 'item', amount: 100, charged: true, assignees: ['ann'] },
        { id: 'c', kind: 'item', amount: 90, charged: true, assignees: ['jay'] },
      ],
    };
    const bubble = buildSessionSummaryBubble({ name: 'x' }, summary, [dinner]);
    const out = lines(bubble);
    expect(out.slice(2)).toEqual([
      '💰 總和（牌局＋代墊）',
      '🥇 JOY | +4,705',
      '🥈 Jay | +173',
      '🥉 Chiho | -828',
      '4. 賀賀 | -1,041',
      '5. Daniel | -1,309',
      '6. Annie | -1,700',
      '🃏 牌局',
      '🥇 JOY | +4,905',
      '🥈 Jay | -127',
      '🥉 Chiho | -828',
      '4. 賀賀 | -1,041',
      '5. Daniel | -1,309',
      '6. Annie | -1,600',
      '💸 代墊',
      'Jay | +300',
      'Annie | -100',
      'JOY | -200',
    ]);
    // Header line, then one divider before 牌局 and one before 代墊
    const kinds = bubble.body.contents.map((c) => (c.type === 'separator' ? '—' : c.text || 'row'));
    expect(kinds.filter((k) => k === '—')).toHaveLength(3);
    expect(kinds[kinds.indexOf('🃏 牌局') - 1]).toBe('—');
    expect(kinds[kinds.indexOf('💸 代墊') - 1]).toBe('—');
  });

  it('links header and body to the event page', () => {
    const b = buildSessionSummaryBubble({ name: 'x' }, summary, [], 'https://liff.line.me/x');
    expect(b.header.action.uri).toBe('https://liff.line.me/x');
    expect(b.body.action.uri).toBe('https://liff.line.me/x');
    expect(buildSessionSummaryBubble({ name: 'x' }, summary).body.action).toBeUndefined();
  });

  it('stays well under LINE\'s bubble size limit for a full night', () => {
    const many = { ...summary, ranking: Array.from({ length: 20 }, (_, i) => ({ odId: `p${i}`, name: `Player ${i}`, profitCash: 100 - i * 10 })) };
    const exp = Array.from({ length: 5 }, (_, k) => ({
      title: `單 ${k}`, payerUid: 'p0', names: Object.fromEntries(many.ranking.map((p) => [p.odId, p.name])),
      lines: many.ranking.map((p, i) => ({ id: `${k}-${i}`, kind: 'item', amount: 50, charged: true, assignees: [p.odId] })),
    }));
    const size = JSON.stringify(buildSessionSummaryBubble({ name: 'x' }, many, exp)).length;
    expect(size).toBeLessThan(30 * 1024);
  });
});
