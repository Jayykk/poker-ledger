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
 * Round a list of exact (fractional) amounts to whole numbers so they sum to
 * exactly `targetTotal`, using the largest-remainder method. Ties go to the
 * earlier index.
 *
 * @param {Array<number>} exactValues
 * @param {number} targetTotal
 * @returns {Array<number>} whole-number amounts, same order, summing to targetTotal
 */
function roundWithLargestRemainder(exactValues, targetTotal) {
  const floored = exactValues.map((exact, index) => ({
    index,
    base: Math.floor(exact),
    remainder: exact - Math.floor(exact),
  }));
  let leftover = Math.round(targetTotal) - floored.reduce((sum, e) => sum + e.base, 0);

  const byRemainder = [...floored].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index
  );
  for (const entry of byRemainder) {
    if (leftover <= 0) break;
    entry.base += 1;
    leftover -= 1;
  }

  return floored.map((e) => e.base);
}

/**
 * ICM (Malmuth-Harville) deal payouts.
 *
 * Each player's equity = Σ over finishing places of P(player finishes there)
 * × that place's prize, where P(finish 1st) = stack share, and lower places
 * recurse over the remaining field. Results are rounded to whole units with
 * the largest-remainder method so they sum exactly to the prize total.
 *
 * Intended for the remaining (in-the-money) players only — pass the prizes
 * for places 1..stacks.length. Field size is a full table at most, so the
 * O(n!) recursion is fine.
 *
 * @param {Array<number>} stacks - Current chip counts (all > 0), player order preserved
 * @param {Array<number>} prizes - Prize for place 1..n (n === stacks.length)
 * @returns {Array<number>} whole-number payouts aligned with stacks
 */
export function computeIcmPayouts(stacks = [], prizes = []) {
  const n = stacks.length;
  if (n === 0) return [];
  const equities = new Array(n).fill(0);

  const recurse = (remaining, place, probSoFar) => {
    if (place > prizes.length || remaining.length === 0) return;
    const sum = remaining.reduce((acc, i) => acc + stacks[i], 0);
    if (sum <= 0) return;
    for (const i of remaining) {
      const p = probSoFar * (stacks[i] / sum);
      equities[i] += p * (Number(prizes[place - 1]) || 0);
      recurse(remaining.filter((j) => j !== i), place + 1, p);
    }
  };

  recurse(stacks.map((_, i) => i), 1, 1);

  const total = prizes.reduce((sum, p) => sum + (Number(p) || 0), 0);
  return roundWithLargestRemainder(equities, total);
}

/**
 * Chip-chop deal payouts: the pool split proportionally to current stacks,
 * rounded with the largest-remainder method to sum exactly to the pool.
 *
 * @param {Array<number>} stacks - Current chip counts, player order preserved
 * @param {number} pool - Amount to distribute
 * @returns {Array<number>} whole-number payouts aligned with stacks
 */
export function computeChipChopPayouts(stacks = [], pool = 0) {
  const totalChips = stacks.reduce((sum, s) => sum + (Number(s) || 0), 0);
  if (!stacks.length || totalChips <= 0) return stacks.map(() => 0);
  const exact = stacks.map((s) => ((Number(s) || 0) / totalChips) * pool);
  return roundWithLargestRemainder(exact, pool);
}

/**
 * Build tournament settlement records for a DEAL (協議結算): the remaining
 * players receive their negotiated allocations; already-eliminated players
 * keep their normal placement prizes.
 *
 * @param {Array} players - Game players ({id, uid, name, placement, buyIn});
 *   remaining players' `placement` should already reflect the deal ranking
 * @param {Array<{place: number, percentage: number}>} payoutRatios
 * @param {Array<{playerId: string, prize: number, placement: number}>} allocations
 * @returns {Array} settlement records ({playerId, odId, name, placement, buyIn, prize, profit})
 */
export function buildDealSettlement(players = [], payoutRatios = [], allocations = []) {
  const totalBuyIns = players.reduce((sum, p) => sum + (p.buyIn || 0), 0);
  const prizeMap = buildTournamentPrizeMap(totalBuyIns, payoutRatios);
  const allocMap = new Map(allocations.map((a) => [a.playerId, a]));

  return players
    .map((p) => {
      const alloc = allocMap.get(p.id);
      const placement = alloc ? alloc.placement : (p.placement || null);
      const prize = alloc ? (Number(alloc.prize) || 0) : (prizeMap[p.placement] || 0);
      return {
        playerId: p.id || null,
        odId: p.uid || null,
        name: p.name,
        placement,
        buyIn: p.buyIn || 0,
        prize,
        profit: prize - (p.buyIn || 0),
      };
    })
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
