import { describe, it, expect } from 'vitest';
import {
  suggestEnvelopes,
  envelopeTotalShare,
  envelopeSlots,
  envelopeAmounts,
  mysteryPhaseActive,
  addTicket,
  removeTicket,
  setTicketEnvelope,
  remainingSlots,
  pendingTickets,
  freeSlotCount,
  pickRandomSlot,
  slotOfTier,
  mysteryResults,
  isMysteryBounty,
  gameBountyPerEntry,
  gamePrizePool,
  tournamentBountyView,
  canDrawTicket,
} from '../src/utils/bounty.js';
import { buildTournamentSettlement, buildDealSettlement } from '../src/utils/settlementMath.js';
import { applyElimination, applyReentry } from '../src/utils/tournamentElimination.js';
import { assertMysteryDrawsDone, validateDealAllocations } from '../functions/src/handlers/tournamentSettlement.js';

const MYSTERY = {
  type: 'mystery',
  share: { mode: 'amount', value: 500 },
  envelopes: [{ share: 40, count: 1 }, { share: 20, count: 2 }, { share: 10, count: 2 }],
  start: { mode: 'players', value: 5 },
  drawMode: 'system',
};
const PER = 500;
const sum = (rows, key) => rows.reduce((acc, r) => acc + (r[key] || 0), 0);
const byId = (players, id) => players.find((p) => p.id === id);

describe('envelopes', () => {
  it('suggestions always total 100% and use the requested count', () => {
    for (let n = 1; n <= 30; n++) {
      const tiers = suggestEnvelopes(n);
      expect(Math.round(envelopeTotalShare(tiers) * 100) / 100).toBe(100);
      expect(tiers.reduce((c, t) => c + t.count, 0)).toBe(n);
    }
    expect(suggestEnvelopes(9)[0]).toEqual({ share: 30, count: 1 });
    expect(suggestEnvelopes(4)[0]).toEqual({ share: 40, count: 1 });
  });

  it('slots expand the tiers; amounts split the pool exactly', () => {
    expect(envelopeSlots(MYSTERY).map((s) => s.tier)).toEqual([0, 1, 1, 2, 2]);
    const amounts = envelopeAmounts(MYSTERY, 2501);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(2501);
    expect(amounts[0]).toBe(1001); // 40% of 2501 = 1000.4 → +1 from the remainder
    expect(envelopeAmounts(MYSTERY, 0)).toEqual([0, 0, 0, 0, 0]);
  });

  it('per entry still counts as a bounty game (for the pool)', () => {
    expect(isMysteryBounty(MYSTERY)).toBe(true);
    expect(gameBountyPerEntry({ bounty: MYSTERY, baseBuyIn: 1000 })).toBe(500);
  });
});

describe('when draws start', () => {
  it('never before the cutoff', () => {
    expect(mysteryPhaseActive(MYSTERY, { aliveBefore: 2, reentryClosed: false })).toBe(false);
  });

  it('at N players left / from a level / right after the cutoff', () => {
    expect(mysteryPhaseActive(MYSTERY, { aliveBefore: 6, reentryClosed: true })).toBe(false);
    expect(mysteryPhaseActive(MYSTERY, { aliveBefore: 5, reentryClosed: true })).toBe(true);
    const byLevel = { ...MYSTERY, start: { mode: 'level', value: 6 } };
    expect(mysteryPhaseActive(byLevel, { reentryClosed: true, level: 5 })).toBe(false);
    expect(mysteryPhaseActive(byLevel, { reentryClosed: true, level: 6 })).toBe(true);
    expect(mysteryPhaseActive({ ...MYSTERY, start: { mode: 'cutoff' } }, { reentryClosed: true, aliveBefore: 9 })).toBe(true);
  });
});

describe('tickets', () => {
  it('add, draw, undo draw and remove', () => {
    let players = [{ id: 'a' }, { id: 'b' }];
    const { players: p1, ticket } = addTicket(players, 'b', ['a']);
    players = p1;
    expect(pendingTickets(players)).toHaveLength(1);
    expect(freeSlotCount(MYSTERY, players)).toBe(4);

    players = setTicketEnvelope(players, ticket.id, 0);
    expect(pendingTickets(players)).toHaveLength(0);
    expect(remainingSlots(MYSTERY, players).map((s) => s.slot)).toEqual([1, 2, 3, 4]);

    players = setTicketEnvelope(players, ticket.id, null);
    expect(remainingSlots(MYSTERY, players)).toHaveLength(5);
    players = removeTicket(players, ticket.id);
    expect(byId(players, 'b').mysteryTickets).toEqual([]);
  });

  it('picks only free envelopes', () => {
    let players = [{ id: 'a' }];
    const added = addTicket(players, 'a', ['a']);
    players = setTicketEnvelope(added.players, added.ticket.id, 0);
    expect(pickRandomSlot(MYSTERY, players, () => 0)).toBe(1);
    expect(pickRandomSlot(MYSTERY, players, () => 0.999)).toBe(4);
    expect(slotOfTier(MYSTERY, players, 0)).toBeNull(); // the 40% one is gone
    expect(slotOfTier(MYSTERY, players, 2)).toBe(3);
  });
});

/**
 * Six players, draws from 5 left (after the cutoff). The order:
 *   F out (6 left, before the draws)  → nothing
 *   E out by A                        → A draws the 40%
 *   D out by A and B together         → they split a 20%
 *   C out, no eliminator              → no draw
 *   B out by A                        → A draws a 10%
 *   A is champion                     → draws one more (the other 20%)
 *   one 10% envelope is never drawn   → prize pool
 */
function playMystery() {
  let players = ['A', 'B', 'C', 'D', 'E', 'F'].map((id) => ({ id, name: id, buyIn: 1000 }));
  players = applyReentry(applyElimination(players, 'F').players, 'F', 1000).players; // F re-enters: 7 entries
  const out = (victim, by, slot) => {
    const alive = players.filter((p) => !p.eliminated).length;
    players = applyElimination(players, victim).players;
    if (by.length && mysteryPhaseActive(MYSTERY, { aliveBefore: alive, reentryClosed: true })) {
      const added = addTicket(players, victim, by);
      players = slot === undefined ? added.players : setTicketEnvelope(added.players, added.ticket.id, slot);
    }
  };
  out('F', ['A'], 0); // 6 alive before → no draw
  out('E', ['A'], 0);
  out('D', ['A', 'B'], 1);
  out('C', []);
  out('B', ['A'], 3);
  const final = addTicket(players, 'A', ['A'], { final: true });
  players = setTicketEnvelope(final.players, final.ticket.id, 2);
  return players.map((p) => (p.eliminated ? p : { ...p, placement: 1 }));
}

describe('mystery settlement', () => {
  const payout = [{ place: 1, percentage: 70 }, { place: 2, percentage: 30 }];

  it('pays drawn envelopes, puts undrawn ones in the prize pool, zero-sum', () => {
    const players = playMystery();
    const pool = 7 * PER; // 3,500
    const r = mysteryResults(players, MYSTERY, pool);
    // 40% = 1,400; 20% = 700 × 2; 10% = 350 × 2
    expect(r.amounts).toEqual([1400, 700, 700, 350, 350]);
    expect(r.bountyByPlayer).toEqual({ A: 1400 + 350 + 350 + 700, B: 350 });
    expect(r.undrawn).toBe(350);

    const game = { players, baseBuyIn: 1000, bounty: MYSTERY };
    expect(gamePrizePool(game)).toBe(7000 - 3500 + 350);

    const rows = buildTournamentSettlement(players, payout, 1000, PER, MYSTERY);
    const row = Object.fromEntries(rows.map((x) => [x.name, x]));
    expect(row.A).toMatchObject({ placement: 1, bounty: 2800, knockouts: 3 });
    expect(row.B).toMatchObject({ bounty: 350, knockouts: 1 });
    expect(row.F.bounty).toBe(0);
    expect(sum(rows, 'prize') + sum(rows, 'bounty')).toBe(sum(rows, 'buyIn'));
    expect(sum(rows, 'profit')).toBe(0);
  });

  it('a waiting draw blocks settlement', () => {
    const players = [{ id: 'a' }, { id: 'b', mysteryTickets: [{ id: 't', by: ['a'], envelope: null }] }];
    expect(() => assertMysteryDrawsDone(players)).toThrow('MYSTERY_DRAWS_PENDING');
    expect(() => assertMysteryDrawsDone([{ id: 'a' }])).not.toThrow();
  });

  it('a deal: everyone left draws one, the rest goes to the prize pool', () => {
    let players = ['A', 'B', 'C'].map((id) => ({ id, name: id, buyIn: 1000 }));
    const bounty = { ...MYSTERY, start: { mode: 'cutoff' } };
    // C out by A → A draws the 40%; A and B each draw one before the deal
    players = applyElimination(players, 'C').players;
    let added = addTicket(players, 'C', ['A']);
    players = setTicketEnvelope(added.players, added.ticket.id, 0);
    added = addTicket(players, 'A', ['A'], { final: true });
    players = setTicketEnvelope(added.players, added.ticket.id, 1);
    added = addTicket(players, 'B', ['B'], { final: true });
    players = setTicketEnvelope(added.players, added.ticket.id, 3);
    // pool 1,500 → 600 / 300 / 300 / 150 / 150; drawn 600 + 300 + 150, undrawn 450
    const view = tournamentBountyView(players, 1000, PER, bounty);
    expect(view.prizePool).toBe(3000 - 1500 + 450);
    const payout3 = [{ place: 1, percentage: 50 }, { place: 2, percentage: 30 }, { place: 3, percentage: 20 }];
    // places from 1,950: 975 / 585 / 390 — A and B chop 1st + 2nd = 1,560
    const allocations = [{ playerId: 'A', placement: 1, prize: 800 }, { playerId: 'B', placement: 2, prize: 760 }];
    expect(() => validateDealAllocations(players, payout3, allocations, 1000, PER, bounty)).not.toThrow();
    const rows = buildDealSettlement(players, payout3, allocations, 1000, PER, bounty);
    const row = Object.fromEntries(rows.map((x) => [x.name, x]));
    expect(row.A.bounty).toBe(900);
    expect(row.B.bounty).toBe(150);
    expect(row.C).toMatchObject({ bounty: 0, prize: 390 });
    expect(sum(rows, 'profit')).toBe(0);
  });
});

describe('who may draw, and when', () => {
  const tk = { id: 't', by: ['a', 'b'], envelope: null };
  it('the host: only while paused / on a break / with the TV stage open', () => {
    expect(canDrawTicket(tk, { isHost: true })).toBe(false);
    expect(canDrawTicket(tk, { isHost: true, clockPaused: true })).toBe(true);
    expect(canDrawTicket(tk, { isHost: true, onBreak: true })).toBe(true);
    expect(canDrawTicket(tk, { isHost: true, stageOpen: true })).toBe(true);
  });

  it('a player: their own draw, only with the stage open, never with physical envelopes', () => {
    expect(canDrawTicket(tk, { mySeatId: 'a', stageOpen: false })).toBe(false);
    expect(canDrawTicket(tk, { mySeatId: 'a', stageOpen: true })).toBe(true);
    expect(canDrawTicket(tk, { mySeatId: 'b', stageOpen: true })).toBe(true); // a shared knockout: either one
    expect(canDrawTicket(tk, { mySeatId: 'c', stageOpen: true })).toBe(false);
    expect(canDrawTicket(tk, { mySeatId: 'a', stageOpen: true, drawMode: 'manual' })).toBe(false);
  });

  it('a drawn ticket can\'t be drawn again', () => {
    expect(canDrawTicket({ ...tk, envelope: 2 }, { isHost: true, stageOpen: true })).toBe(false);
  });

  it('drawing stamps drawnAt; undoing clears it', () => {
    const players = [{ id: 'a', mysteryTickets: [{ id: 't', by: ['a'], envelope: null }] }];
    const drawn = setTicketEnvelope(players, 't', 1, 12345);
    expect(drawn[0].mysteryTickets[0]).toMatchObject({ envelope: 1, drawnAt: 12345 });
    expect(setTicketEnvelope(drawn, 't', null)[0].mysteryTickets[0]).toMatchObject({ envelope: null, drawnAt: null });
  });
});
