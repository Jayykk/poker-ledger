import { describe, it, expect } from 'vitest';
import { orderedKnockouts, revengeCounts, millisOf } from '../functions/src/utils/knockoutLog.js';

const roster = (ids, extra = {}) => ids.map((id) => ({ id, uid: `u_${id}`, ...(extra[id] || {}) }));
// KO / PKO: the head goes to `by`
const ko = (targetId, by, { seq, at, status = 'active' } = {}) => ({
  type: 'eliminate',
  status,
  targetId,
  timestamp: at,
  restore: { ...(seq ? { seq } : {}), bounty: { awards: by.map((playerId) => ({ playerId, amount: 100 })) } },
});

describe('orderedKnockouts', () => {
  it('status order (seq), then time; undone records and other types left out', () => {
    const players = roster(['a', 'b', 'c']);
    const list = orderedKnockouts(players, [
      ko('c', ['b'], { seq: 3 }),
      ko('a', ['b'], { seq: 1 }),
      ko('b', ['c'], { seq: 2, status: 'undone' }),
      { type: 'buy_in', status: 'active', targetId: 'a' },
      ko('b', ['a'], { seq: 2 }),
    ]);
    expect(list).toEqual([
      { targetId: 'a', by: ['b'] },
      { targetId: 'b', by: ['a'] },
      { targetId: 'c', by: ['b'] },
    ]);
  });

  it('without seq: by timestamp (numbers or Firestore Timestamps)', () => {
    const ts = (ms) => ({ toMillis: () => ms });
    const list = orderedKnockouts(roster(['a', 'b']), [
      ko('a', ['b'], { at: ts(2000) }),
      ko('b', ['a'], { at: { seconds: 1 } }),
    ]);
    expect(list.map((k) => k.targetId)).toEqual(['b', 'a']);
    expect(millisOf('2026-01-01T00:00:00Z')).toBe(Date.parse('2026-01-01T00:00:00Z'));
    expect(millisOf(null)).toBe(0);
  });

  it('eliminators must be on the roster and are never the one knocked out', () => {
    const list = orderedKnockouts(roster(['a', 'b']), [ko('a', ['a', 'ghost', 'b', 'b'], { seq: 1 })]);
    expect(list).toEqual([{ targetId: 'a', by: ['b'] }]);
  });
});

describe('revengeCounts', () => {
  it('A knocks out B, later B knocks out A: one for B', () => {
    const players = roster(['a', 'b', 'c']);
    expect(revengeCounts(players, [
      ko('b', ['a'], { seq: 1 }),
      ko('c', ['a'], { seq: 2 }),
      ko('a', ['b'], { seq: 3 }),
    ])).toEqual({ b: 1 });
  });

  it('order matters: paying back first is not revenge', () => {
    const players = roster(['a', 'b']);
    // Listed out of order: by seq, B knocked A out first
    expect(revengeCounts(players, [ko('b', ['a'], { seq: 2 }), ko('a', ['b'], { seq: 1 })])).toEqual({ a: 1 });
  });

  it('an undone knockout is not something to pay back', () => {
    const players = roster(['a', 'b']);
    expect(revengeCounts(players, [
      ko('b', ['a'], { seq: 1, status: 'undone' }),
      ko('a', ['b'], { seq: 2 }),
    ])).toEqual({});
  });

  it('once per player paid back; back and forth counts for both', () => {
    const players = roster(['a', 'b']);
    expect(revengeCounts(players, [
      ko('b', ['a'], { seq: 1 }),
      ko('a', ['b'], { seq: 2 }),
      ko('b', ['a'], { seq: 3 }),
      ko('a', ['b'], { seq: 4 }),
    ])).toEqual({ a: 1, b: 1 });
  });

  it('a shared knockout pays back every eliminator who was owed', () => {
    const players = roster(['a', 'b', 'c']);
    expect(revengeCounts(players, [
      ko('b', ['a'], { seq: 1 }),
      ko('c', ['a'], { seq: 2 }),
      ko('a', ['b', 'c'], { seq: 3 }),
    ])).toEqual({ b: 1, c: 1 });
  });

  it('mystery: the eliminators are the ticket\'s `by`', () => {
    const players = roster(['a', 'b'], {
      b: { mysteryTickets: [{ id: 't1', by: ['a'] }] },
      a: { mysteryTickets: [{ id: 't2', by: ['b'] }] },
    });
    const tx = (targetId, ticket, seq) => ({
      type: 'eliminate', status: 'active', targetId, restore: { seq, mysteryTicket: ticket },
    });
    expect(revengeCounts(players, [tx('b', 't1', 1), tx('a', 't2', 2)])).toEqual({ b: 1 });
    // A knockout before the draw phase has no ticket, so nothing to pay back
    expect(revengeCounts(players, [{ ...tx('b', null, 1) }, tx('a', 't2', 2)])).toEqual({});
  });
});
