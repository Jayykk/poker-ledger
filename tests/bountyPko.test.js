import { describe, it, expect } from 'vitest';
import {
  bountyCashShare,
  headValue,
  planKnockout,
  applyKnockout,
  resetHeadForReentry,
  restoreHeadAfterReentryUndo,
  knockoutPrizePool,
  finalBounty,
  isKnockoutBounty,
} from '../src/utils/bounty.js';
import { buildTournamentSettlement, buildDealSettlement } from '../src/utils/settlementMath.js';
import { applyElimination, applyReentry } from '../src/utils/tournamentElimination.js';
import { validateDealAllocations } from '../functions/src/handlers/tournamentSettlement.js';

const PKO = { type: 'pko', share: { mode: 'amount', value: 400 }, cashShare: 0.5 };
const PER = 400;
const sum = (rows, key) => rows.reduce((acc, r) => acc + (r[key] || 0), 0);
const byId = (players, id) => players.find((p) => p.id === id);

describe('PKO basics', () => {
  it('is a bounty game; cash share defaults to half, KO pays all in cash', () => {
    expect(isKnockoutBounty(PKO)).toBe(true);
    expect(bountyCashShare(PKO)).toBe(0.5);
    expect(bountyCashShare({ type: 'pko' })).toBe(0.5);
    expect(bountyCashShare({ type: 'ko' })).toBe(1);
  });

  it('a head starts at the entry bounty and is 0 once knocked out', () => {
    expect(headValue({}, PER)).toBe(400);
    expect(headValue({ bountyHead: 650 }, PER)).toBe(650);
    expect(headValue({ bountyHead: 0 }, PER)).toBe(0);
  });

  it('a knockout pays half in cash and grows the eliminator\'s head', () => {
    const players = [{ id: 'a' }, { id: 'b' }];
    const plan = planKnockout(players, 'b', ['a'], PER, PKO);
    expect(plan).toMatchObject({ head: 400, toPool: 0, progressive: true });
    expect(plan.awards).toEqual([{ playerId: 'a', amount: 200, headGain: 200 }]);
    const after = applyKnockout(players, 'b', plan, 1);
    expect(byId(after, 'a')).toMatchObject({ bountyWon: 200, knockouts: 1, bountyHead: 600 });
    expect(byId(after, 'b').bountyHead).toBe(0);
    // undo restores both heads exactly
    const back = applyKnockout(after, 'b', plan, -1);
    expect(byId(back, 'a')).toMatchObject({ bountyWon: 0, knockouts: 0, bountyHead: 400 });
    expect(byId(back, 'b').bountyHead).toBe(400);
  });

  it('a shared knockout splits both the cash and the head growth', () => {
    const players = [{ id: 'a', bountyHead: 601 }, { id: 'b' }, { id: 'c' }];
    const plan = planKnockout(players, 'a', ['b', 'c'], PER, PKO);
    expect(plan.head).toBe(601);
    // cash round(300.5) = 301 → 151 / 150; growth 300 → 150 / 150
    expect(plan.awards).toEqual([
      { playerId: 'b', amount: 151, headGain: 150 },
      { playerId: 'c', amount: 150, headGain: 150 },
    ]);
  });

  it('no eliminator: the whole (grown) head goes to the pool', () => {
    const players = [{ id: 'a', bountyHead: 700 }, { id: 'b' }];
    const plan = planKnockout(players, 'a', [], PER, PKO);
    expect(plan).toMatchObject({ head: 700, toPool: 700, awards: [] });
    expect(byId(applyKnockout(players, 'a', plan, 1), 'a')).toMatchObject({ bountyToPool: 700, bountyHead: 0 });
  });

  it('a re-entry buys a fresh head; undoing it puts the old one back', () => {
    const players = [{ id: 'a', bountyHead: 0, eliminated: true }];
    const { players: re, previousHead } = resetHeadForReentry(players, 'a', PER, PKO);
    expect(re[0].bountyHead).toBe(400);
    expect(previousHead).toBe(0);
    expect(restoreHeadAfterReentryUndo(re, 'a', previousHead)[0].bountyHead).toBe(0);
    // KO heads never change
    expect(resetHeadForReentry(players, 'a', PER, { type: 'ko' })).toEqual({ players, previousHead: null });
  });
});

/** A small PKO tournament through the real elimination / re-entry helpers. */
function playPko() {
  let players = ['A', 'B', 'C', 'D'].map((id) => ({ id, name: id, buyIn: 1000 }));
  const knockOut = (victim, eliminators) => {
    const plan = planKnockout(players, victim, eliminators, PER, PKO);
    players = applyKnockout(applyElimination(players, victim).players, victim, plan, 1);
  };
  knockOut('D', ['A']); // A cash 200, head 600
  players = resetHeadForReentry(applyReentry(players, 'D', 1000).players, 'D', PER, PKO).players; // D head 400
  knockOut('A', ['B', 'C']); // A's 600: B / C cash 150, heads 550
  knockOut('D', ['B']); // B cash +200 (350), head 750
  knockOut('C', []); // C's 550 → pool
  return players.map((p) => (p.eliminated ? p : { ...p, placement: 1 }));
}

describe('PKO settlement', () => {
  const payout = [{ place: 1, percentage: 60 }, { place: 2, percentage: 40 }];

  it('is zero-sum and the champion takes their grown head', () => {
    const players = playPko();
    expect(byId(players, 'B')).toMatchObject({ bountyWon: 350, bountyHead: 750, knockouts: 2 });

    // 5 entries → 2,000 on heads; C's 550 went back to the pool
    expect(knockoutPrizePool(players, 1000, PER)).toBe(5000 - 2000 + 550);
    const rows = buildTournamentSettlement(players, payout, 1000, PER);
    const r = Object.fromEntries(rows.map((x) => [x.name, x]));
    expect(r.B).toMatchObject({ placement: 1, bounty: 1100, knockouts: 2 });
    expect(r.A.bounty).toBe(200);
    expect(r.C.bounty).toBe(150);
    expect(r.D.bounty).toBe(0);
    expect(sum(rows, 'prize') + sum(rows, 'bounty')).toBe(sum(rows, 'buyIn'));
    expect(sum(rows, 'profit')).toBe(0);
  });

  it('a deal: every survivor keeps their current head', () => {
    let players = ['A', 'B', 'C'].map((id) => ({ id, name: id, buyIn: 1000 }));
    const plan = planKnockout(players, 'C', ['A'], PER, PKO);
    players = applyKnockout(applyElimination(players, 'C').players, 'C', plan, 1);
    // A: cash 200, head 600; B: head 400. Pool 3000 − 1200 = 1800
    const payout3 = [{ place: 1, percentage: 50 }, { place: 2, percentage: 30 }, { place: 3, percentage: 20 }];
    const allocations = [
      { playerId: 'A', placement: 1, prize: 800 },
      { playerId: 'B', placement: 2, prize: 640 },
    ];
    expect(() => validateDealAllocations(players, payout3, allocations, 1000, PER)).not.toThrow();
    const rows = buildDealSettlement(players, payout3, allocations, 1000, PER);
    const r = Object.fromEntries(rows.map((x) => [x.name, x]));
    expect(r.A.bounty).toBe(800);
    expect(r.B.bounty).toBe(400);
    expect(r.C).toMatchObject({ bounty: 0, prize: 360 });
    expect(sum(rows, 'profit')).toBe(0);
  });

  it('final bounty of a live PKO player uses their grown head', () => {
    expect(finalBounty({ bountyWon: 350, bountyHead: 750 }, PER)).toBe(1100);
    expect(finalBounty({ bountyWon: 350, bountyHead: 750, eliminated: true }, PER)).toBe(350);
  });
});
