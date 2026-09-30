/* eslint-disable valid-jsdoc */
// Knockout bounty math, shared by the settlement Cloud Functions and the app
// (src/utils/bounty.js re-exports it).
//
// KO model: every entry (first buy-in or re-entry) puts `perEntry` of its
// buy-in on the player's head; the rest goes to the prize pool.
//   - A knockout pays that head to the eliminator(s) — split equally, whole
//     units, leftover units to the earlier-listed eliminators.
//   - A knockout with no eliminator sends the head to the prize pool.
//   - Heads still alive at the end (the champion, or everyone in a deal) go
//     back to their owners.
// So Σ prizes + Σ bounties = Σ buy-ins.
//
// Per-player state (on the game's `players` array, which every seated
// player may write):
//   bountyWon     heads collected so far (currency)
//   knockouts     knockouts credited (a shared knockout counts for each)
//   bountyToPool  this player's heads that went to the prize pool

export const BOUNTY_NONE = 'none';
export const BOUNTY_KO = 'ko';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Is this a bounty setting the tables play (currently KO only)? */
export function isKnockoutBounty(bounty) {
  return bounty?.type === BOUNTY_KO;
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

/** Head value of a KO game (0 when the game has no bounty). */
export function gameBountyPerEntry(game = {}) {
  return isKnockoutBounty(game.bounty) ? bountyPerEntry(game.bounty, game.baseBuyIn) : 0;
}

/** Entries a player made (buy-in + re-entries), from their total buy-in. */
export function playerEntries(player = {}, baseBuyIn = 0) {
  const base = num(baseBuyIn);
  if (base <= 0) return 0;
  return Math.max(0, Math.round(num(player.buyIn) / base));
}

/**
 * Split one head between eliminators: equal whole-unit shares, leftover
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
 * What a knockout does to the bounty state: the awards to write and, when
 * nobody is credited, the head that goes to the prize pool.
 * Eliminators must be other players still alive.
 * @return {{ awards: Array, toPool: number }}
 */
export function planKnockout(players, eliminatedId, eliminatorIds, perEntry) {
  const alive = new Set(players.filter((p) => !p.eliminated && p.id !== eliminatedId)
    .map((p) => p.id));
  const valid = (eliminatorIds || []).filter((id) => alive.has(id));
  if ((eliminatorIds || []).length !== valid.length) {
    throw new Error('Eliminator must be another player still in the tournament');
  }
  const head = Math.max(0, Math.round(num(perEntry)));
  const awards = splitBounty(head, valid);
  return { awards, toPool: awards.length ? 0 : head };
}

/**
 * Apply (sign = 1) or revert (sign = -1) a knockout's bounty changes.
 * Pure: returns a new players array.
 */
export function applyKnockout(players, eliminatedId, { awards = [], toPool = 0 } = {}, sign = 1) {
  const byId = new Map(awards.map((a) => [a.playerId, num(a.amount)]));
  return players.map((p) => {
    let next = p;
    if (byId.has(p.id)) {
      next = {
        ...next,
        bountyWon: Math.max(0, num(p.bountyWon) + sign * byId.get(p.id)),
        knockouts: Math.max(0, num(p.knockouts) + sign),
      };
    }
    if (p.id === eliminatedId && toPool) {
      next = { ...next, bountyToPool: Math.max(0, num(p.bountyToPool) + sign * num(toPool)) };
    }
    return next;
  });
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

/** Prize pool of a game (plain buy-in total when it has no bounty). */
export function gamePrizePool(game = {}) {
  return knockoutPrizePool(game.players || [], game.baseBuyIn, gameBountyPerEntry(game));
}

/**
 * Bounty a player ends with: heads collected, plus their own head if they
 * are still alive at the end.
 */
export function finalBounty(player = {}, perEntry = 0) {
  if (!perEntry) return 0;
  return num(player.bountyWon) + (player.eliminated ? 0 : num(perEntry));
}
