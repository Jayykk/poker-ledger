// Pure settlement math — extracted from store/modules/game.js so the money
// logic is unit-testable without Firebase.

/**
 * Build the per-placement prize map for a tournament.
 *
 * Each prize is rounded to a whole chip, then the rounding drift is reconciled
 * with the largest-remainder method so the distributed total always equals the
 * prize pool share implied by the ratios (sum of percentages, capped at 100%).
 * Without this, e.g. a 3-way 33/33/33 split of 1000 pays 330×3 and silently
 * loses 10 chips (or overpays with other pool sizes).
 *
 * @param {number} totalBuyIns - Prize pool (sum of all buy-ins)
 * @param {Array<{place: number, percentage: number}>} payoutRatios
 * @returns {Object<number, number>} placement → prize (whole chips)
 */
export function buildTournamentPrizeMap(totalBuyIns, payoutRatios = []) {
  const pool = Number(totalBuyIns) || 0;
  const entries = payoutRatios
    .filter((r) => r && Number.isFinite(Number(r.percentage)) && Number(r.percentage) > 0)
    .map((r) => ({ place: r.place, exact: (pool * Number(r.percentage)) / 100 }));
  if (!entries.length) return {};

  const totalExact = Math.round(entries.reduce((sum, e) => sum + e.exact, 0));
  let distributed = 0;
  const floored = entries.map((e) => {
    const base = Math.floor(e.exact);
    distributed += base;
    return { ...e, base, remainder: e.exact - base };
  });

  // Hand the leftover chips to the largest remainders (ties: better placement first).
  let leftover = totalExact - distributed;
  const byRemainder = [...floored].sort(
    (a, b) => b.remainder - a.remainder || a.place - b.place
  );
  for (const entry of byRemainder) {
    if (leftover <= 0) break;
    entry.base += 1;
    leftover -= 1;
  }

  const prizeMap = {};
  for (const e of floored) prizeMap[e.place] = e.base;
  return prizeMap;
}

/**
 * Build tournament settlement records for all players (eliminated players get
 * a record too, with no prize). Sorted by placement, unplaced last.
 *
 * @param {Array} players - Game players ({id, uid, name, placement, buyIn})
 * @param {Array<{place: number, percentage: number}>} payoutRatios
 * @returns {Array} settlement records ({playerId, odId, name, placement, buyIn, prize, profit})
 */
export function buildTournamentSettlement(players = [], payoutRatios = []) {
  const totalBuyIns = players.reduce((sum, p) => sum + (p.buyIn || 0), 0);
  const prizeMap = buildTournamentPrizeMap(totalBuyIns, payoutRatios);

  return players
    .map((p) => ({
      playerId: p.id || null,
      odId: p.uid || null,
      name: p.name,
      placement: p.placement || null,
      buyIn: p.buyIn || 0,
      prize: prizeMap[p.placement] || 0,
      profit: (prizeMap[p.placement] || 0) - (p.buyIn || 0),
    }))
    .sort((a, b) => (a.placement || 999) - (b.placement || 999));
}

/**
 * Build cash-game settlement snapshot records (profit = stack − buyIn).
 *
 * @param {Array} players - Game players ({uid, name, buyIn, stack})
 * @returns {Array} snapshot records ({odId, name, buyIn, stack, profit})
 */
export function buildCashSettlement(players = []) {
  return players.map((player) => ({
    odId: player.uid || null,
    name: player.name,
    buyIn: Math.round(player.buyIn || 0),
    stack: Math.round(player.stack || 0),
    profit: Math.round((player.stack || 0) - (player.buyIn || 0)),
  }));
}
