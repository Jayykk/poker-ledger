/**
 * Button-fairness rule in initializeHand: a freshly-seated player
 * (status 'waiting_for_hand') is dealt in, but must NOT receive the dealer
 * button on their first hand (no positional advantage on entry).
 */
import { describe, it, expect } from 'vitest';
import { initializeHand } from '../../functions/src/engines/texasHoldem.js';

function baseGame(seats, dealerSeat) {
  return {
    handNumber: 1,
    meta: { maxPlayers: 3, blinds: { small: 10, big: 20 } },
    seats,
    table: { dealerSeat, pot: 0 },
  };
}

describe('initializeHand — dealer button fairness', () => {
  it('does not put the button on a brand-new (waiting_for_hand) player', () => {
    // Returning players in seats 0 and 1; seat 2 just joined.
    // Naive rotation from dealer=1 would land the button on seat 2.
    const seats = {
      0: { odId: 'a', odName: 'A', chips: 1000, status: 'active' },
      1: { odId: 'b', odName: 'B', chips: 1000, status: 'active' },
      2: { odId: 'c', odName: 'C', chips: 1000, status: 'waiting_for_hand' },
    };
    const game = initializeHand(baseGame(seats, 1));

    // Button must skip the new player and land on an eligible (returning) seat.
    expect(game.table.dealerSeat).not.toBe(2);
    expect([0, 1]).toContain(game.table.dealerSeat);

    // The new player is still dealt in (active this hand) — just not on the button.
    expect(game.seats[2].status).toBe('active');
  });

  it('falls back to all active players when fewer than 2 are returning', () => {
    // A brand-new table: both players are waiting_for_hand. The button has to
    // go somewhere, so we fall back to the active set rather than throwing.
    const seats = {
      0: { odId: 'a', odName: 'A', chips: 1000, status: 'waiting_for_hand' },
      1: { odId: 'b', odName: 'B', chips: 1000, status: 'waiting_for_hand' },
    };
    const game = initializeHand({
      ...baseGame(seats, 0),
      meta: { maxPlayers: 2, blinds: { small: 10, big: 20 } },
    });
    expect([0, 1]).toContain(game.table.dealerSeat);
  });
});
