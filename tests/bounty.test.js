import { describe, it, expect } from 'vitest';
import {
  bountyPerEntry,
  gameBountyPerEntry,
  playerEntries,
  splitBounty,
  planKnockout,
  applyKnockout,
  bountyPool,
  knockoutPrizePool,
  gamePrizePool,
  finalBounty,
} from '../src/utils/bounty.js';
import { buildTournamentSettlement, buildDealSettlement } from '../src/utils/settlementMath.js';
import { applyElimination, applyReentry } from '../src/utils/tournamentElimination.js';
import { validateDealAllocations } from '../functions/src/handlers/tournamentSettlement.js';

const KO = { type: 'ko', share: { mode: 'amount', value: 300 } };
const sum = (rows, key) => rows.reduce((acc, r) => acc + (r[key] || 0), 0);

describe('bounty per entry', () => {
  it('amount or percent of the buy-in, capped at the buy-in', () => {
    expect(bountyPerEntry(KO, 1000)).toBe(300);
    expect(bountyPerEntry({ type: 'ko', share: { mode: 'percent', value: 25 } }, 1000)).toBe(250);
    expect(bountyPerEntry({ type: 'ko', share: { mode: 'amount', value: 5000 } }, 1000)).toBe(1000);
    expect(bountyPerEntry({ type: 'none' }, 1000)).toBe(0);
    expect(bountyPerEntry(null, 1000)).toBe(0);
  });

  it('a game has a head value only when it is KO', () => {
    expect(gameBountyPerEntry({ bounty: KO, baseBuyIn: 1000 })).toBe(300);
    expect(gameBountyPerEntry({ baseBuyIn: 1000 })).toBe(0);
    expect(gameBountyPerEntry({ bounty: { type: 'pko', share: { value: 300 } }, baseBuyIn: 1000 })).toBe(300);
    expect(gameBountyPerEntry({ bounty: { type: 'mystery', share: { value: 300 } }, baseBuyIn: 1000 })).toBe(0);
  });

  it('counts entries from the total buy-in', () => {
    expect(playerEntries({ buyIn: 3000 }, 1000)).toBe(3);
    expect(playerEntries({ buyIn: 3000 }, 0)).toBe(0);
  });
});

describe('splitting a head', () => {
  it('splits equally, leftover to the earlier eliminators', () => {
    expect(splitBounty(300, ['a'])).toEqual([{ playerId: 'a', amount: 300 }]);
    expect(splitBounty(301, ['a', 'b'])).toEqual([{ playerId: 'a', amount: 151 }, { playerId: 'b', amount: 150 }]);
    expect(splitBounty(100, ['a', 'b', 'c']).map((x) => x.amount)).toEqual([34, 33, 33]);
    expect(splitBounty(100, ['a', 'a'])).toEqual([{ playerId: 'a', amount: 100 }]);
    expect(splitBounty(100, [])).toEqual([]);
  });

  it('eliminators must be other players still in', () => {
    const players = [{ id: 'a' }, { id: 'b' }, { id: 'c', eliminated: true }];
    expect(planKnockout(players, 'a', ['b'], 300)).toMatchObject({
      head: 300, awards: [{ playerId: 'b', amount: 300, headGain: 0 }], toPool: 0, progressive: false,
    });
    expect(planKnockout(players, 'a', [], 300)).toMatchObject({ awards: [], toPool: 300 });
    expect(() => planKnockout(players, 'a', ['a'], 300)).toThrow();
    expect(() => planKnockout(players, 'a', ['c'], 300)).toThrow();
  });

  it('apply then revert is a no-op', () => {
    const players = [{ id: 'a' }, { id: 'b', bountyWon: 100, knockouts: 1 }, { id: 'c' }];
    const ko = planKnockout(players, 'a', ['b', 'c'], 301);
    const after = applyKnockout(players, 'a', ko, 1);
    expect(after.find((p) => p.id === 'b')).toMatchObject({ bountyWon: 251, knockouts: 2 });
    expect(after.find((p) => p.id === 'c')).toMatchObject({ bountyWon: 150, knockouts: 1 });
    const back = applyKnockout(after, 'a', ko, -1);
    expect(back.find((p) => p.id === 'b')).toMatchObject({ bountyWon: 100, knockouts: 1 });
    expect(back.find((p) => p.id === 'c')).toMatchObject({ bountyWon: 0, knockouts: 0 });

    const toPool = planKnockout(players, 'a', [], 300);
    const pooled = applyKnockout(players, 'a', toPool, 1);
    expect(pooled.find((p) => p.id === 'a').bountyToPool).toBe(300);
    expect(applyKnockout(pooled, 'a', toPool, -1).find((p) => p.id === 'a').bountyToPool).toBe(0);
  });
});

describe('prize pool', () => {
  it('buy-ins minus heads, plus heads that went to the pool', () => {
    const players = [{ buyIn: 2000 }, { buyIn: 1000, bountyToPool: 300 }, { buyIn: 1000 }];
    expect(bountyPool(players, 1000, 300)).toBe(1200);
    expect(knockoutPrizePool(players, 1000, 300)).toBe(4000 - 1200 + 300);
    expect(knockoutPrizePool(players, 1000, 0)).toBe(4000);
    expect(gamePrizePool({ players, baseBuyIn: 1000 })).toBe(4000);
    expect(gamePrizePool({ players, baseBuyIn: 1000, bounty: KO })).toBe(3100);
  });

  it('alive players keep their own head at the end', () => {
    expect(finalBounty({ bountyWon: 600 }, 300)).toBe(900);
    expect(finalBounty({ bountyWon: 600, eliminated: true }, 300)).toBe(600);
    expect(finalBounty({ bountyWon: 600 }, 0)).toBe(0);
  });
});

/** Play a small KO tournament through the real elimination helpers. */
function playKo() {
  const per = 300;
  let players = ['A', 'B', 'C', 'D'].map((id) => ({ id, name: id, buyIn: 1000 }));
  const knockOut = (victim, eliminators) => {
    const ko = planKnockout(players, victim, eliminators, per);
    players = applyKnockout(applyElimination(players, victim).players, victim, ko, 1);
  };
  knockOut('D', ['A']); // A +300
  players = applyReentry(players, 'D', 1000).players; // D's second head
  knockOut('D', ['B', 'C']); // B +150, C +150
  knockOut('C', []); // C's head → pool
  knockOut('B', ['A']); // A +300
  players = players.map((p) => (p.eliminated ? p : { ...p, placement: 1 }));
  return { players, per };
}

describe('KO settlement', () => {
  const payout = [{ place: 1, percentage: 60 }, { place: 2, percentage: 40 }];

  it('is zero-sum and the champion keeps their head', () => {
    const { players, per } = playKo();
    const rows = buildTournamentSettlement(players, payout, 1000, per);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));

    // 5 entries × 1000; heads 5 × 300 = 1500, one went back to the pool
    expect(knockoutPrizePool(players, 1000, per)).toBe(5000 - 1500 + 300);
    expect(sum(rows, 'prize') + sum(rows, 'bounty')).toBe(sum(rows, 'buyIn'));
    expect(sum(rows, 'profit')).toBe(0);

    expect(byName.A).toMatchObject({ placement: 1, bounty: 900, knockouts: 2, prize: 2280 });
    expect(byName.A.profit).toBe(2280 + 900 - 1000);
    expect(byName.B).toMatchObject({ placement: 2, bounty: 150, knockouts: 1, prize: 1520 });
    expect(byName.C).toMatchObject({ bounty: 150, prize: 0 });
    expect(byName.D).toMatchObject({ bounty: 0, buyIn: 2000, profit: -2000 });
  });

  it('non-KO settlements are unchanged (no bounty fields)', () => {
    const players = [
      { id: 'a', name: 'a', buyIn: 1000, placement: 1 },
      { id: 'b', name: 'b', buyIn: 1000, placement: 2, eliminated: true },
    ];
    const rows = buildTournamentSettlement(players, payout, 1000);
    expect(rows[0]).not.toHaveProperty('bounty');
    expect(rows.map((r) => r.prize)).toEqual([1200, 800]);
  });

  it('a deal pays the pool net of bounties and every survivor keeps their head', () => {
    const per = 300;
    let players = ['A', 'B', 'C'].map((id) => ({ id, name: id, buyIn: 1000 }));
    const ko = planKnockout(players, 'C', ['A'], per);
    players = applyKnockout(applyElimination(players, 'C').players, 'C', ko, 1);
    const payout3 = [{ place: 1, percentage: 50 }, { place: 2, percentage: 30 }, { place: 3, percentage: 20 }];
    // pool 3000 − 900 = 2100 → 1050 / 630 / 420; A and B chop 1st + 2nd = 1680
    const allocations = [
      { playerId: 'A', placement: 1, prize: 900 },
      { playerId: 'B', placement: 2, prize: 780 },
    ];
    expect(() => validateDealAllocations(players, payout3, allocations, 1000, per)).not.toThrow();
    expect(() => validateDealAllocations(players, payout3, allocations)).toThrow('DEAL_TOTAL_MISMATCH');

    const rows = buildDealSettlement(players, payout3, allocations, 1000, per);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(byName.A.bounty).toBe(600);
    expect(byName.B.bounty).toBe(300);
    expect(byName.C).toMatchObject({ bounty: 0, prize: 420 });
    expect(sum(rows, 'profit')).toBe(0);
  });
});
