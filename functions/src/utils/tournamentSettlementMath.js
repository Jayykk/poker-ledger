/* eslint-disable valid-jsdoc */
import { finalBounty, knockoutPrizePool } from './bountyMath.js';

/** Derive entry and rebuy counts when buy-in totals divide exactly. */
export function deriveTournamentEntryMetrics(totalBuyIn, baseBuyIn) {
  const total = Number(totalBuyIn);
  const base = Number(baseBuyIn);
  if (!Number.isFinite(total) || !Number.isFinite(base) || total < 0 || base <= 0) return null;

  const entryCount = total / base;
  if (!Number.isInteger(entryCount) || entryCount < 1) return null;
  return { entryCount, rebuyCount: Math.max(0, entryCount - 1) };
}

/** Allocate the tournament pool across configured payout percentages. */
export function buildTournamentPrizeMap(totalBuyIns, payoutRatios = []) {
  const pool = Number(totalBuyIns) || 0;
  const entries = payoutRatios
    .filter((row) => row && Number.isFinite(Number(row.percentage)) && Number(row.percentage) > 0)
    .map((row) => ({ place: row.place, exact: (pool * Number(row.percentage)) / 100 }));
  if (!entries.length) return {};

  const totalExact = Math.round(entries.reduce((sum, entry) => sum + entry.exact, 0));
  let distributed = 0;
  const floored = entries.map((entry) => {
    const base = Math.floor(entry.exact);
    distributed += base;
    return { ...entry, base, remainder: entry.exact - base };
  });

  let leftover = totalExact - distributed;
  const byRemainder = [...floored].sort(
    (a, b) => b.remainder - a.remainder || a.place - b.place,
  );
  for (const entry of byRemainder) {
    if (leftover <= 0) break;
    entry.base += 1;
    leftover -= 1;
  }

  return Object.fromEntries(floored.map((entry) => [entry.place, entry.base]));
}

/** Attach derived entry metrics to one settlement row when possible. */
function withEntryMetrics(row, totalBuyIn, baseBuyIn) {
  const metrics = deriveTournamentEntryMetrics(totalBuyIn, baseBuyIn);
  return metrics ? { ...row, ...metrics } : row;
}

/**
 * One settlement row. KO games (perEntry > 0) add the bounty the player ends
 * with and their knockouts, and the bounty counts toward profit.
 */
function settlementRow(player, placement, prize, baseBuyIn, perEntry) {
  const buyIn = player.buyIn || 0;
  const bounty = finalBounty(player, perEntry);
  return withEntryMetrics({
    playerId: player.id || null,
    odId: player.uid || null,
    name: player.name,
    placement,
    buyIn,
    prize,
    ...(perEntry > 0 ? { bounty, knockouts: Number(player.knockouts) || 0 } : {}),
    profit: prize + bounty - buyIn,
  }, buyIn, baseBuyIn);
}

/**
 * Prize pool to pay out by placement: every buy-in, minus the part that went
 * on heads in a KO game (see bountyMath.js).
 */
export function tournamentPrizePool(players = [], baseBuyIn = 0, perEntry = 0) {
  return knockoutPrizePool(players, baseBuyIn, perEntry);
}

/** Build settlement rows for a normally completed tournament. */
export function buildTournamentSettlement(
  players = [], payoutRatios = [], baseBuyIn = 0, perEntry = 0,
) {
  const pool = tournamentPrizePool(players, baseBuyIn, perEntry);
  const prizeMap = buildTournamentPrizeMap(pool, payoutRatios);

  return players
    .map((player) => settlementRow(
      player, player.placement || null, prizeMap[player.placement] || 0, baseBuyIn, perEntry,
    ))
    .sort((a, b) => (a.placement || 999) - (b.placement || 999));
}

/** Build settlement rows for a negotiated tournament finish. */
export function buildDealSettlement(
  players = [], payoutRatios = [], allocations = [], baseBuyIn = 0, perEntry = 0,
) {
  const pool = tournamentPrizePool(players, baseBuyIn, perEntry);
  const prizeMap = buildTournamentPrizeMap(pool, payoutRatios);
  const allocationMap = new Map(
    allocations.map((allocation) => [allocation.playerId, allocation]),
  );

  return players
    .map((player) => {
      const allocation = allocationMap.get(player.id);
      const placement = allocation ? allocation.placement : (player.placement || null);
      const prize = allocation ?
        (Number(allocation.prize) || 0) :
        (prizeMap[player.placement] || 0);
      return settlementRow(player, placement, prize, baseBuyIn, perEntry);
    })
    .sort((a, b) => (a.placement || 999) - (b.placement || 999));
}
