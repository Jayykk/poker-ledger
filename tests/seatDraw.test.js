import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  autoTableCount, tableCountOptions, drawSeats, seatForNewPlayer, seatingChart, seatLabel, isSeated, currentDealers,
} from '../src/utils/seatDraw.js';

const roster = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, buyIn: 200 }));
// deterministic "random" for repeatable draws
const seq = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

describe('抽座位', () => {
  it('tables by headcount: 10 a table (9 seats + the dealer); options: enough seats, two a table', () => {
    expect([1, 10, 11, 20, 21].map(autoTableCount)).toEqual([1, 1, 2, 2, 3]);
    expect(tableCountOptions(10)).toEqual([1, 2, 3, 4, 5]);
    expect(tableCountOptions(11)).toEqual([2, 3, 4, 5]);
    expect(tableCountOptions(3)).toEqual([1]);
  });

  it('the dealer sits at the dealer position (seat 0), everyone else 1..9; the button can be the dealer', () => {
    const dealerButtons = new Set();
    for (let seed = 1; seed <= 40; seed++) {
      const out = drawSeats(roster(10), 1, seq(seed), ['p4']);
      const dealer = out.find((p) => p.id === 'p4');
      expect(dealer.seat).toMatchObject({ table: 1, seat: 0, dealer: true });
      const others = out.filter((p) => p.id !== 'p4').map((p) => p.seat.seat).sort((a, b) => a - b);
      expect(others).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(out.filter((p) => p.seat.button)).toHaveLength(1);
      dealerButtons.add(!!dealer.seat.button);
    }
    expect(dealerButtons).toEqual(new Set([true, false])); // the dealer's position is in the button draw
  });

  it('two tables, a dealer each: tables balanced with the dealers counted; a redraw keeps the dealers', () => {
    const out = drawSeats(roster(15), 2, seq(5), ['p0', 'p1']);
    const chart = seatingChart(out);
    expect(chart.map((t) => t.length).sort()).toEqual([7, 8]);
    expect(chart.map((t) => t[0].id)).toEqual(['p0', 'p1']); // dealer listed first
    expect(currentDealers(out)).toEqual(['p0', 'p1']);
    expect(seatLabel(out[0].seat, true)).toBe('1-荷');
  });

  it('no dealer picked: seats run 1..10', () => {
    const out = drawSeats(roster(10), 1, seq(2), [null]);
    expect(out.map((p) => p.seat.seat).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('a full table takes nobody more', () => {
    expect(seatForNewPlayer(drawSeats(roster(10), 1, seq(3), ['p0']))).toBe(null);
  });

  it('everyone gets a seat; seats are 1..n per table with no gaps; one button a table', () => {
    for (const [n, tables] of [[10, 1], [10, 2], [11, 2], [7, 3]]) {
      const out = drawSeats(roster(n), tables, seq(n));
      expect(out.every((p) => p.seat)).toBe(true);
      const chart = seatingChart(out);
      expect(chart).toHaveLength(tables);
      const sizes = chart.map((t) => t.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1); // even
      for (const table of chart) {
        expect(table.map((p) => p.seat.seat)).toEqual(table.map((_, i) => i + 1));
        expect(table.filter((p) => p.seat.button)).toHaveLength(1);
      }
    }
  });

  it('keeps the rest of each player as is, and a redraw changes seats', () => {
    const a = drawSeats(roster(8), 1, seq(1));
    expect(a[0]).toMatchObject({ id: 'p0', name: 'P0', buyIn: 200 });
    const b = drawSeats(a, 1, seq(99));
    expect(b.map((p) => p.seat.seat)).not.toEqual(a.map((p) => p.seat.seat));
  });

  it('a player added after the draw takes the next seat at the emptiest table', () => {
    expect(seatForNewPlayer(roster(3))).toBe(null); // not drawn yet
    const seated = drawSeats(roster(5), 2, seq(3)); // tables of 3 and 2
    const small = seatingChart(seated).findIndex((t) => t.length === 2) + 1;
    expect(seatForNewPlayer(seated)).toEqual({ table: small, seat: 3 });
  });

  it('labels: "3" on one table, "2-3" with several', () => {
    expect(seatLabel({ table: 2, seat: 3 }, false)).toBe('3');
    expect(seatLabel({ table: 2, seat: 3 }, true)).toBe('2-3');
    expect(seatLabel(null, true)).toBe('');
    expect(isSeated(roster(2))).toBe(false);
  });
});

describe('wiring', () => {
  const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf-8');
  it('the host draws through the roster; later joiners are seated', () => {
    const store = read('src/store/modules/game.js');
    expect(store).toContain('commitRoster(gameId.value, (players) => ({ players: drawSeats(players, tables, undefined, dealerIds) }))');
    expect(store.match(/seatForNewPlayer\(/g)).toHaveLength(2);
  });
  it('the room: draw / view seats, seat order, seat chips, my seat; redraw only before the clock starts', () => {
    const room = read('src/views/TournamentGameView.vue');
    expect(room).toContain('<SeatDrawModal');
    expect(room).toMatch(/canDrawSeats = computed\(\(\) => !game\.value\?\.tournamentSessionId \|\| !clockStatus\.value \|\| clockStatus\.value === 'waiting'\)/);
    expect(room).toContain(':seat-label="seatOf(player)"');
    expect(room).toContain('class="my-seat"');
  });
});
