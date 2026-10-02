/* eslint-disable valid-jsdoc */
// Bounty math (KO and progressive KO), shared by the settlement Cloud
// Functions and the app (src/utils/bounty.js re-exports it).
//
// Every entry (first buy-in or re-entry) puts `perEntry` of its buy-in on the
// player's head; the rest goes to the prize pool.
//   KO   A knockout pays the head to the eliminator(s).
//   PKO  A knockout pays `cashShare` of the head to the eliminator(s) as cash
//        and adds the rest to the eliminator's own head, so heads grow.
// Shared knockouts split equally in whole units, leftover to the
// earlier-listed eliminators. A knockout with no eliminator sends the whole
// head to the prize pool. Heads still alive at the end (the champion, or
// everyone in a deal) go back to their owners.
// So Σ prizes + Σ bounties = Σ buy-ins.
//
// Per-player state (on the game's `players` array, which every seated
// player may write):
//   bountyWon     bounty cash collected so far
//   knockouts     knockouts credited (a shared knockout counts for each)
//   bountyToPool  this player's heads that went to the prize pool
//   bountyHead    PKO: current head value (missing = perEntry; 0 once
//                 knocked out until a re-entry buys a new head)

import { isMysteryBounty, mysteryResults, allTickets } from './mysteryBounty.js';

export const BOUNTY_NONE = 'none';
export const BOUNTY_KO = 'ko';
export const BOUNTY_PKO = 'pko';
export const DEFAULT_PKO_CASH_SHARE = 0.5;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** A bounty format the tables play (KO or PKO)? */
export function isKnockoutBounty(bounty) {
  return bounty?.type === BOUNTY_KO || bounty?.type === BOUNTY_PKO;
}

export const isProgressiveBounty = (bounty) => bounty?.type === BOUNTY_PKO;

/** Fraction of a head paid as cash on a knockout (KO: all of it). */
export function bountyCashShare(bounty) {
  if (!isProgressiveBounty(bounty)) return 1;
  const share = Number(bounty.cashShare);
  return Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : DEFAULT_PKO_CASH_SHARE;
}

/**
 * Bounty part of one entry's buy-in (whole currency units, ≤ the buy-in).
 * share: { mode: 'amount' | 'percent', value }.
 */
export function bountyPerEntry(bounty, buyInAmount) {
  if (!bounty || bounty.type === BOUNTY_NONE || !bounty.share) return 0;
  const amount = Math.max(0, num(buyInAmount));
  const value = Math.max(0, num(bounty.share.value));
  const perEntry = bounty.share.mode === 'percent' ?
    Math.round((amount * Math.min(100, value)) / 100) :
    Math.round(value);
  return Math.min(amount, perEntry);
}

/** Does every entry put money aside for bounties (KO, PKO or mystery)? */
export const hasBountyPool = (bounty) => isKnockoutBounty(bounty) || isMysteryBounty(bounty);

/**
 * Bounty part of one entry in a game — a KO / PKO starting head, or a
 * mystery game's contribution to the envelopes (0 when there's no bounty).
 */
export function gameBountyPerEntry(game = {}) {
  return hasBountyPool(game.bounty) ? bountyPerEntry(game.bounty, game.baseBuyIn) : 0;
}

/** A player's current head (PKO heads grow; KO heads stay perEntry). */
export function headValue(player = {}, perEntry = 0) {
  if (player.bountyHead === undefined || player.bountyHead === null) return num(perEntry);
  return Math.max(0, num(player.bountyHead));
}

/** Entries a player made (buy-in + re-entries), from their total buy-in. */
export function playerEntries(player = {}, baseBuyIn = 0) {
  const base = num(baseBuyIn);
  if (base <= 0) return 0;
  return Math.max(0, Math.round(num(player.buyIn) / base));
}

/**
 * Split an amount between eliminators: equal whole-unit shares, leftover
 * units to the earlier-listed ones.
 * @return {Array<{playerId: string, amount: number}>}
 */
export function splitBounty(amount, eliminatorIds = []) {
  const ids = [...new Set(eliminatorIds.filter(Boolean))];
  const total = Math.max(0, Math.round(num(amount)));
  if (!ids.length) return [];
  const base = Math.floor(total / ids.length);
  let leftover = total - base * ids.length;
  return ids.map((playerId) => {
    const extra = leftover > 0 ? 1 : 0;
    leftover -= extra;
    return { playerId, amount: base + extra };
  });
}

/**
 * What a knockout does to the bounty state. Eliminators must be other
 * players still alive.
 *   head      the knocked-out player's head
 *   awards    [{ playerId, amount (cash), headGain (PKO: added to own head) }]
 *   toPool    head sent to the prize pool (no eliminator)
 *   perEntry  starting head value (so apply can grow a head never set yet)
 *   progressive  PKO (the knocked-out head drops to 0)
 */
export function planKnockout(
  players, eliminatedId, eliminatorIds, perEntry, bounty = { type: BOUNTY_KO },
) {
  const alive = new Set(players.filter((p) => !p.eliminated && p.id !== eliminatedId)
    .map((p) => p.id));
  const valid = (eliminatorIds || []).filter((id) => alive.has(id));
  if ((eliminatorIds || []).length !== valid.length) {
    throw new Error('Eliminator must be another player still in the tournament');
  }
  const target = players.find((p) => p.id === eliminatedId) || {};
  const progressive = isProgressiveBounty(bounty);
  const head = progressive ? headValue(target, perEntry) : Math.max(0, Math.round(num(perEntry)));
  const cash = Math.round(head * bountyCashShare(bounty));
  const cashSplit = splitBounty(cash, valid);
  const gainSplit = splitBounty(head - cash, valid);
  const awards = cashSplit.map((a, i) => ({
    playerId: a.playerId,
    amount: a.amount,
    headGain: progressive ? gainSplit[i].amount : 0,
  }));
  return { head, awards, toPool: awards.length ? 0 : head, perEntry: num(perEntry), progressive };
}

/**
 * Apply (sign = 1) or revert (sign = -1) a knockout's bounty changes.
 * Pure: returns a new players array.
 */
export function applyKnockout(players, eliminatedId, plan = {}, sign = 1) {
  const { awards = [], toPool = 0, head = 0, perEntry = 0, progressive = false } = plan;
  const byId = new Map(awards.map((a) => [a.playerId, a]));
  return players.map((p) => {
    let next = p;
    const award = byId.get(p.id);
    if (award) {
      next = {
        ...next,
        bountyWon: Math.max(0, num(p.bountyWon) + sign * num(award.amount)),
        knockouts: Math.max(0, num(p.knockouts) + sign),
      };
      if (progressive && num(award.headGain)) {
        next.bountyHead = Math.max(0, headValue(p, perEntry) + sign * num(award.headGain));
      }
    }
    if (p.id === eliminatedId) {
      if (toPool) {
        next = { ...next, bountyToPool: Math.max(0, num(p.bountyToPool) + sign * num(toPool)) };
      }
      // PKO: the head leaves with the knockout, and comes back on undo
      if (progressive) next = { ...next, bountyHead: sign > 0 ? 0 : num(head) };
    }
    return next;
  });
}

/**
 * PKO re-entry buys a fresh head. Returns the players and the head value it
 * replaced (for undo). KO heads never change, so it's a no-op there.
 */
export function resetHeadForReentry(players, playerId, perEntry, bounty) {
  if (!isProgressiveBounty(bounty)) return { players, previousHead: null };
  const target = players.find((p) => p.id === playerId);
  const previousHead = target ? headValue(target, perEntry) : null;
  return {
    players: players.map((p) => (p.id === playerId ? { ...p, bountyHead: num(perEntry) } : p)),
    previousHead,
  };
}

/** Undo of resetHeadForReentry. */
export function restoreHeadAfterReentryUndo(players, playerId, previousHead) {
  if (previousHead === null || previousHead === undefined) return players;
  return players.map((p) => (p.id === playerId ? { ...p, bountyHead: num(previousHead) } : p));
}

/** Total put on heads so far. */
export function bountyPool(players = [], baseBuyIn = 0, perEntry = 0) {
  return players.reduce((sum, p) => sum + playerEntries(p, baseBuyIn) * num(perEntry), 0);
}

/** Prize pool = buy-ins − heads + heads that went to the pool. */
export function knockoutPrizePool(players = [], baseBuyIn = 0, perEntry = 0) {
  const buyIns = players.reduce((sum, p) => sum + num(p.buyIn), 0);
  if (!perEntry) return buyIns;
  const toPool = players.reduce((sum, p) => sum + num(p.bountyToPool), 0);
  return buyIns - bountyPool(players, baseBuyIn, perEntry) + toPool;
}

/**
 * How a tournament's money splits between placements and bounties:
 *   prizePool       paid by placement
 *   bountyOf(p)     what player p gets from bounties
 *   knockoutsOf(p)  knockouts credited to p
 * KO / PKO: heads (see above). Mystery: drawn envelopes; envelopes nobody
 * drew go into the prize pool (mysteryBounty.js).
 */
export function tournamentBountyView(players = [], baseBuyIn = 0, perEntry = 0, bounty = null) {
  if (perEntry > 0 && isMysteryBounty(bounty)) {
    const heads = bountyPool(players, baseBuyIn, perEntry);
    const result = mysteryResults(players, bounty, heads);
    const buyIns = players.reduce((sum, p) => sum + num(p.buyIn), 0);
    const knockouts = {};
    for (const t of allTickets(players)) {
      if (t.final) continue;
      for (const id of t.by || []) knockouts[id] = (knockouts[id] || 0) + 1;
    }
    return {
      prizePool: buyIns - heads + result.undrawn,
      bountyOf: (p) => result.bountyByPlayer[p.id] || 0,
      knockoutsOf: (p) => knockouts[p.id] || 0,
      drawsOf: (p) => result.drawsByPlayer[p.id] || { draws: 0, topDraws: 0, bestDraw: 0 },
      mystery: result,
    };
  }
  return {
    prizePool: knockoutPrizePool(players, baseBuyIn, perEntry),
    bountyOf: (p) => finalBounty(p, perEntry),
    knockoutsOf: (p) => num(p.knockouts),
  };
}

/** Prize pool of a game (plain buy-in total when it has no bounty). */
export function gamePrizePool(game = {}) {
  const view = tournamentBountyView(
    game.players || [], game.baseBuyIn, gameBountyPerEntry(game), game.bounty,
  );
  return view.prizePool;
}

/**
 * Bounty a player ends with: cash collected, plus their own (possibly grown)
 * head if they are still alive at the end.
 */
export function finalBounty(player = {}, perEntry = 0) {
  if (!perEntry) return 0;
  return num(player.bountyWon) + (player.eliminated ? 0 : headValue(player, perEntry));
}
