import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  drawSeats, seatForNewPlayer, reseatOnReentry, seatingChart, liveSeatingChart, seatNeighbours, seatLabel, isSeated, currentDealer,
  freeSeats, tableCapacity, SEAT_COUNT, TABLE_FULL,
} from '../src/utils/seatDraw.js';

const roster = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, buyIn: 200 }));
// deterministic, well-mixed "random" for repeatable draws (mulberry32)
const seq = (seed = 7) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('抽座位: one table — the dealer position plus seats 1..9', () => {
  it('ten at most with a dealer, nine without; never a seat 10', () => {
    expect(SEAT_COUNT).toBe(9);
    expect(tableCapacity(true)).toBe(10);
    expect(tableCapacity(false)).toBe(9);
    expect(() => drawSeats(roster(10), { dealerId: null })).toThrow(TABLE_FULL);
    expect(() => drawSeats(roster(11), { dealerId: 'p0' })).toThrow(TABLE_FULL);
    const full = drawSeats(roster(10), { dealerId: 'p0', random: seq(3) });
    expect(full.filter((p) => !p.seat.dealer).map((p) => p.seat.seat).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('the dealer sits at the dealer position; the button can land there', () => {
    const onDealer = new Set();
    for (let s = 1; s <= 40; s++) {
      const out = drawSeats(roster(10), { dealerId: 'p4', random: seq(s) });
      expect(out.find((p) => p.id === 'p4').seat).toMatchObject({ seat: 0, dealer: true });
      expect(out.filter((p) => p.seat.button)).toHaveLength(1);
      onDealer.add(!!out.find((p) => p.id === 'p4').seat.button);
    }
    expect(onDealer).toEqual(new Set([true, false]));
  });

  it('fewer players than seats: random seats with gaps', () => {
    const gaps = new Set();
    for (let s = 1; s <= 20; s++) {
      const seats = drawSeats(roster(6), { dealerId: 'p0', random: seq(s) }).filter((p) => !p.seat.dealer).map((p) => p.seat.seat);
      expect(new Set(seats).size).toBe(5);
      expect(seats.every((n) => n >= 1 && n <= 9)).toBe(true);
      gaps.add(Math.max(...seats) > 5);
    }
    expect(gaps.has(true)).toBe(true); // not always packed into 1..5
  });

  it('a late joiner takes a random free seat; a full table takes nobody', () => {
    expect(seatForNewPlayer(roster(3))).toBe(null); // not drawn yet
    const out = drawSeats(roster(5), { dealerId: 'p0', random: seq(2) });
    const free = freeSeats(out);
    expect(free).toHaveLength(5);
    const picks = new Set(Array.from({ length: 30 }, (_, i) => seatForNewPlayer(out, seq(i + 1)).seat));
    expect([...picks].every((n) => free.includes(n))).toBe(true);
    expect(picks.size).toBeGreaterThan(1); // random, not "the next number"
    expect(seatForNewPlayer(drawSeats(roster(10), { dealerId: 'p0', random: seq(1) }))).toBe(null);
  });

  it('re-entry keeps the seat unless it was taken meanwhile', () => {
    const out = drawSeats(roster(4), { dealerId: null, random: seq(5) });
    const me = out[1];
    const eliminated = out.map((p) => (p.id === me.id ? { ...p, eliminated: true } : p));
    // nobody took it: same seat
    expect(reseatOnReentry(eliminated.map((p) => ({ ...p, eliminated: false })), me.id).find((p) => p.id === me.id).seat.seat).toBe(me.seat.seat);
    // someone joined into it: a different free seat
    const taken = [...eliminated, { id: 'new', name: 'N', seat: { seat: me.seat.seat } }];
    const back = reseatOnReentry(taken.map((p) => (p.id === me.id ? { ...p, eliminated: false } : p)), me.id, seq(9));
    const mine = back.find((p) => p.id === me.id).seat.seat;
    expect(mine).not.toBe(me.seat.seat);
    expect(freeSeats(taken.filter((p) => p.id !== me.id)).includes(mine)).toBe(true);
  });

  it('the chart: dealer, then seats 1..9 with empties; eliminated seats show empty', () => {
    const out = drawSeats(roster(4), { dealerId: 'p0', random: seq(4) });
    const chart = seatingChart(out.map((p) => (p.id === 'p1' ? { ...p, eliminated: true } : p)));
    expect(chart.dealer.id).toBe('p0');
    expect(chart.seats.map((s) => s.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(chart.seats.filter((s) => s.player)).toHaveLength(2);
    expect(currentDealer(out)).toBe('p0');
    expect(seatLabel({ seat: 0, dealer: true })).toBe('荷');
    expect(seatLabel({ seat: 7 })).toBe('7');
    expect(isSeated(roster(2))).toBe(false);
  });
});

describe('wiring', () => {
  const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf-8');
  it('the store draws through the roster; joiners and re-entries get seats', () => {
    const store = read('src/store/modules/game.js');
    expect(store).toContain('commitRoster(gameId.value, (players) => ({ players: drawSeats(players, { dealerId }) }))');
    expect(store.match(/seatForNewPlayer\(/g)).toHaveLength(2);
    expect(store).toContain('reseatOnReentry(head.players, playerId)');
  });
  it('both rooms draw and show seats', () => {
    for (const f of ['src/views/TournamentGameView.vue', 'src/views/GameView.vue']) {
      const v = read(f);
      expect(v).toContain('<SeatDrawModal');
      expect(v).toContain('<RoomSeatBar');
      expect(v).toMatch(/:seat-label="seat(Of\(player\)|Label\(player\.seat)/);
    }
  });
});

describe('liveSeatingChart (the table during play)', () => {
  const roster = [
    { id: 'd', seat: { seat: 0, dealer: true } },
    { id: 'a', seat: { seat: 1 } },
    { id: 'b', seat: { seat: 2 }, eliminated: true, placement: 6 },
    { id: 'c', seat: { seat: 2 }, eliminated: true, placement: 4 },
    { id: 'e', seat: { seat: 3 }, eliminated: true, placement: 5 },
    { id: 'f', seat: { seat: 3 } },
  ];

  it('keeps a knocked-out player at the seat they left', () => {
    const chart = liveSeatingChart(roster);
    expect(chart.seats[0].player.id).toBe('a');
    expect(chart.seats[0].out).toBeNull();
    expect(chart.seats[1].player).toBeNull();
    // two people went out from seat 2: the one who left last (finished best)
    expect(chart.seats[1].out.id).toBe('c');
  });

  it('shows nobody out at a seat someone else took since', () => {
    const chart = liveSeatingChart(roster);
    expect(chart.seats[2].player.id).toBe('f');
    expect(chart.seats[2].out).toBeNull();
  });

  it('leaves untouched seats empty', () => {
    const chart = liveSeatingChart(roster);
    expect(chart.seats[8]).toEqual({ no: 9, player: null, out: null });
  });

  it('moves a knocked-out dealer to dealerOut', () => {
    expect(liveSeatingChart(roster).dealer.id).toBe('d');
    const out = liveSeatingChart([{ id: 'd', seat: { seat: 0, dealer: true }, eliminated: true, placement: 3 }]);
    expect(out.dealer).toBeNull();
    expect(out.dealerOut.id).toBe('d');
  });
});

describe('seatNeighbours (who sits next to me)', () => {
  const p = (id, seat, extra = {}) => ({ id, name: id, seat: seat === 0 ? { seat: 0, dealer: true } : { seat }, ...extra });

  it('the next seat up is on my left, the one below on my right', () => {
    const roster = [p('a', 4), p('me', 5), p('b', 6)];
    const { left, right } = seatNeighbours(roster, roster[1]);
    expect(left.id).toBe('b');
    expect(right.id).toBe('a');
  });

  it('skips empty seats and knocked-out players', () => {
    const roster = [p('a', 2), p('gone', 4, { eliminated: true }), p('me', 5), p('b', 8)];
    const { left, right } = seatNeighbours(roster, roster[2]);
    expect(left.id).toBe('b');
    expect(right.id).toBe('a');
  });

  it('wraps past the dealer between seats 9 and 1', () => {
    const roster = [p('d', 0), p('me', 9), p('a', 1), p('b', 7)];
    expect(seatNeighbours(roster, roster[1]).left.id).toBe('d');
    expect(seatNeighbours(roster, roster[2]).right.id).toBe('d');
    const fromDealer = seatNeighbours(roster, roster[0]);
    expect(fromDealer.left.id).toBe('a');
    expect(fromDealer.right.id).toBe('me');
  });

  it('heads-up: the same player on both sides', () => {
    const roster = [p('me', 3), p('a', 7)];
    const { left, right } = seatNeighbours(roster, roster[0]);
    expect(left.id).toBe('a');
    expect(right.id).toBe('a');
  });

  it('nobody else seated, or no seat of my own: no neighbours', () => {
    expect(seatNeighbours([p('me', 3)], p('me', 3))).toEqual({ left: null, right: null });
    expect(seatNeighbours([p('a', 3)], { id: 'me' })).toEqual({ left: null, right: null });
  });
});
