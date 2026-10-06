import { describe, it, expect } from 'vitest';
import { computeRoomTitles, ROOM_TITLE_IDS, buyInGroups } from '../src/utils/roomTitles.js';

const BASE = 600;
// entries / groups → buyIn
const p = (id, { groups = 1, ...rest } = {}) => ({ id, name: id, buyIn: groups * BASE, ...rest });
const tour = (players, extra = {}) => ({ type: 'tournament', baseBuyIn: BASE, players, ...extra });
const cash = (players, extra = {}) => ({ type: 'live', baseBuyIn: BASE, players, ...extra });
const elim = (targetId, seq, awards = [], extra = {}) => ({
  type: 'eliminate', status: 'active', targetId, timestamp: seq * 1000,
  restore: { seq, ...(awards.length ? { bounty: { awards: awards.map((playerId) => ({ playerId, amount: 100 })) } } : {}), ...extra },
});

describe('computeRoomTitles', () => {
  it('priority order', () => {
    expect(ROOM_TITLE_IDS).toEqual(['hunter', 'chipLeader', 'phoenix', 'patron', 'prey', 'firstBlood']);
  });

  it('nothing for an empty or missing game', () => {
    expect(computeRoomTitles(null)).toEqual({});
    expect(computeRoomTitles({ players: [] })).toEqual({});
  });

  it('buy-in groups round buyIn / baseBuyIn, at least 1', () => {
    expect(buyInGroups({ buyIn: 1800 }, 600)).toBe(3);
    expect(buyInGroups({ buyIn: 0 }, 600)).toBe(1);
    expect(buyInGroups({ buyIn: 1800 }, 0)).toBe(1);
  });

  describe('獵人 hunter', () => {
    it('most knockouts, at least 2', () => {
      const game = tour([p('a', { knockouts: 3 }), p('b', { knockouts: 1 }), p('c')]);
      expect(computeRoomTitles(game)).toEqual({ a: 'hunter' });
      expect(computeRoomTitles(tour([p('a', { knockouts: 1 }), p('b')]))).toEqual({});
    });

    it('a tie goes to every leader', () => {
      const game = tour([p('a', { knockouts: 2 }), p('b', { knockouts: 2 }), p('c', { knockouts: 1 })]);
      expect(computeRoomTitles(game)).toEqual({ a: 'hunter', b: 'hunter' });
    });

    it('mystery games count knockouts from the tickets (final draws do not count)', () => {
      const game = tour([
        p('a'),
        p('b', { eliminated: true, mysteryTickets: [{ id: 't1', by: ['a'] }] }),
        p('c', { eliminated: true, mysteryTickets: [{ id: 't2', by: ['a', 'd'] }] }),
        p('d', { mysteryTickets: [{ id: 't3', by: ['d'], final: true }] }),
      ], { bounty: { type: 'mystery' } });
      expect(computeRoomTitles(game).a).toBe('hunter');
      expect(computeRoomTitles(game).d).toBeUndefined();
    });

    it('cash games have no hunter', () => {
      expect(computeRoomTitles(cash([p('a', { knockouts: 5 }), p('b')]))).toEqual({});
    });
  });

  describe('獵物 prey', () => {
    it('most times knocked out: entries − 1 while still in, all of them once out', () => {
      const game = tour([
        p('a', { groups: 2, eliminated: true }), // out twice
        p('b', { groups: 2 }), // out once, back in
        p('c'),
      ]);
      expect(computeRoomTitles(game)).toEqual({ a: 'prey' });
    });

    it('at least 2, ties to every leader', () => {
      expect(computeRoomTitles(tour([p('a', { eliminated: true }), p('b')]))).toEqual({});
      const game = tour([p('a', { groups: 2, eliminated: true }), p('b', { groups: 3 }), p('c')]);
      // b: 3 entries → patron outranks prey; a still gets prey on the tie
      expect(computeRoomTitles(game)).toEqual({ a: 'prey', b: 'patron' });
    });
  });

  describe('本場金主 patron', () => {
    it('most buy-in groups, at least 3', () => {
      expect(computeRoomTitles(cash([p('a', { groups: 3 }), p('b', { groups: 2 })]))).toEqual({ a: 'patron' });
      expect(computeRoomTitles(cash([p('a', { groups: 2 }), p('b')]))).toEqual({});
    });

    it('ties to every leader', () => {
      expect(computeRoomTitles(cash([p('a', { groups: 3 }), p('b', { groups: 3 }), p('c')])))
        .toEqual({ a: 'patron', b: 'patron' });
    });

    it('cash games without a baseBuyIn use the default buy-in', () => {
      const game = { type: 'live', players: [{ id: 'a', buyIn: 6000 }, { id: 'b', buyIn: 2000 }] };
      expect(computeRoomTitles(game)).toEqual({ a: 'patron' });
    });
  });

  describe('不死鳥 phoenix', () => {
    it('3+ rebuys (4+ groups) and still in', () => {
      const game = tour([p('a', { groups: 4 }), p('b', { groups: 5, eliminated: true }), p('c')]);
      // b leads the groups (patron) but is out, so no phoenix; a is the phoenix
      expect(computeRoomTitles(game)).toEqual({ a: 'phoenix', b: 'patron' });
    });

    it('outranks patron for the same player; cash has no elimination', () => {
      expect(computeRoomTitles(cash([p('a', { groups: 4 }), p('b')]))).toEqual({ a: 'phoenix' });
      expect(computeRoomTitles(cash([p('a', { groups: 3 }), p('b')]))).toEqual({ a: 'patron' });
    });
  });

  describe('籌碼王 chipLeader', () => {
    const three = (stacks, extra = []) => tour([
      p('a', { stack: stacks[0] }), p('b', { stack: stacks[1] }), p('c', { stack: stacks[2] }), ...extra,
    ]);

    it('the biggest stack among 3+ players still in', () => {
      expect(computeRoomTitles(three([50000, 20000, 10000]))).toEqual({ a: 'chipLeader' });
    });

    it('only when stacks are tracked (not all zero, not all equal)', () => {
      expect(computeRoomTitles(three([0, 0, 0]))).toEqual({});
      expect(computeRoomTitles(three([25000, 25000, 25000]))).toEqual({});
    });

    it('a tie for the lead → nobody', () => {
      expect(computeRoomTitles(three([40000, 40000, 10000]))).toEqual({});
    });

    it('needs 3 still in; eliminated stacks do not count', () => {
      const game = tour([p('a', { stack: 50000 }), p('b', { stack: 20000 }), p('c', { stack: 90000, eliminated: true })]);
      expect(computeRoomTitles(game)).toEqual({});
      expect(computeRoomTitles(three([50000, 20000, 10000], [p('d', { stack: 90000, eliminated: true })])))
        .toEqual({ a: 'chipLeader' });
    });

    it('cash games have none', () => {
      expect(computeRoomTitles(cash([p('a', { stack: 9000 }), p('b', { stack: 100 }), p('c', { stack: 50 })]))).toEqual({});
    });
  });

  describe('首殺 firstBlood', () => {
    const players = () => [p('a'), p('b'), p('c', { eliminated: true }), p('d', { eliminated: true })];

    it('the first knockout with an eliminator, in status order', () => {
      const transactions = [elim('d', 2, ['b']), elim('c', 1, ['a'])];
      expect(computeRoomTitles(tour(players()), { transactions })).toEqual({ a: 'firstBlood' });
    });

    it('skips knockouts with no eliminator and undone ones', () => {
      const transactions = [
        elim('c', 1),
        { ...elim('d', 2, ['a']), status: 'undone' },
        elim('d', 3, ['b']),
      ];
      expect(computeRoomTitles(tour(players()), { transactions })).toEqual({ b: 'firstBlood' });
    });

    it('a shared knockout → every eliminator', () => {
      const transactions = [elim('c', 1, ['a', 'b'])];
      expect(computeRoomTitles(tour(players()), { transactions })).toEqual({ a: 'firstBlood', b: 'firstBlood' });
    });

    it('mystery: the eliminators on the knockout ticket', () => {
      const roster = [p('a'), p('b'), p('c', { eliminated: true, mysteryTickets: [{ id: 'tk1', by: ['b'] }] })];
      const transactions = [elim('c', 1, [], { mysteryTicket: 'tk1' })];
      expect(computeRoomTitles(tour(roster, { bounty: { type: 'mystery' } }), { transactions })).toEqual({ b: 'firstBlood' });
    });

    it('needs the log, and only in tournaments', () => {
      const transactions = [elim('c', 1, ['a'])];
      expect(computeRoomTitles(tour(players()))).toEqual({});
      expect(computeRoomTitles(cash(players()), { transactions })).toEqual({});
    });
  });

  it('one title per player, by priority', () => {
    const game = tour([
      p('a', { groups: 4, knockouts: 3, stack: 90000 }), // hunter, chipLeader, phoenix, patron
      p('b', { stack: 10000 }),
      p('c', { stack: 20000 }),
    ]);
    expect(computeRoomTitles(game, { transactions: [elim('x', 1, ['a'])] })).toEqual({ a: 'hunter' });
    const noKo = tour([p('a', { groups: 4, stack: 90000 }), p('b', { stack: 10000 }), p('c', { stack: 20000 })]);
    expect(computeRoomTitles(noKo)).toEqual({ a: 'chipLeader' });
  });

  describe('opt-out (the subject decides)', () => {
    const game = tour([
      p('a', { uid: 'ua', knockouts: 3 }),
      p('b', { uid: 'ub', knockouts: 2 }),
      p('g', { groups: 3 }), // guest seat, no uid
    ]);

    it('a player with showRoomTitles false never gets one, and it does not pass to the runner-up', () => {
      const prefsOf = (uid) => (uid === 'ua' ? { showRoomTitles: false } : { showRoomTitles: true });
      expect(computeRoomTitles(game, { prefsOf })).toEqual({ g: 'patron' });
    });

    it('guests without a uid are always shown; missing prefs mean shown', () => {
      const prefsOf = () => ({ showRoomTitles: false });
      expect(computeRoomTitles(game, { prefsOf })).toEqual({ g: 'patron' });
      expect(computeRoomTitles(game, { prefsOf: () => null })).toEqual({ a: 'hunter', g: 'patron' });
    });
  });
});
