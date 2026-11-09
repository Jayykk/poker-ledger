export function computeEntries(playersRegistered = 0, reentries = 0) {
  return Math.max(0, Number(playersRegistered) || 0) + Math.max(0, Number(reentries) || 0);
}

export function computeChipsInPlay(entries = 0, startingChips = 0) {
  return computeEntries(entries, 0) * Math.max(0, Number(startingChips) || 0);
}

export function computeAverageStack(chipsInPlay = 0, playersRemaining = 0) {
  const normalizedPlayersRemaining = Math.max(0, Number(playersRemaining) || 0);
  if (normalizedPlayersRemaining <= 0) return 0;
  return Math.round((Number(chipsInPlay) || 0) / normalizedPlayersRemaining);
}

export function computeAverageStackBB(chipsInPlay = 0, playersRemaining = 0, bigBlind = 0) {
  const normalizedBigBlind = Math.max(0, Number(bigBlind) || 0);
  const normalizedPlayersRemaining = Math.max(0, Number(playersRemaining) || 0);
  if (normalizedBigBlind <= 0 || normalizedPlayersRemaining <= 0) return 0;
  return Math.round((Number(chipsInPlay) || 0) / normalizedPlayersRemaining / normalizedBigBlind);
}

export function buildTournamentStats({
  playersRegistered = 0,
  reentries = 0,
  playersRemaining = 0,
  startingChips = 0,
  bigBlind = 0,
} = {}) {
  const entries = computeEntries(playersRegistered, reentries);
  const chipsInPlay = computeChipsInPlay(entries, startingChips);

  return {
    entries,
    chipsInPlay,
    averageStack: computeAverageStack(chipsInPlay, playersRemaining),
    averageStackBB: computeAverageStackBB(chipsInPlay, playersRemaining, bigBlind),
  };
}
/**
 * Clock stats straight from the linked game's roster (games/{id}.players).
 * Every clock screen derives these itself so it never shows numbers that are
 * waiting for the host's device to mirror them onto the session doc.
 *
 * - registered / remaining: unique seats (by uid, else id), and how many
 *   aren't eliminated
 * - reentries (tournaments): extra base buy-ins beyond each seat's first
 * - buyIns / chipsInPlay (timed games): base buy-ins and chips on the table
 * - bountyToPool (KO): heads that went to the pool with no eliminator
 *
 * @param {Array} players - game roster
 * @param {number} baseBuyIn - game's base buy-in (0 = unknown)
 */
export function rosterClockStats(players = [], baseBuyIn = 0) {
  const seen = new Set();
  const unique = (players || []).filter((p) => {
    const key = p?.uid || p?.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const base = Number(baseBuyIn) || 0;
  const totalBuyIn = unique.reduce((sum, p) => sum + (Number(p.buyIn) || 0), 0);
  const registered = unique.length;
  const remaining = unique.filter((p) => !p.eliminated).length;
  return {
    players: unique,
    registered,
    remaining,
    reentries: base > 0
      ? unique.reduce((sum, p) => sum + Math.max(0, Math.round((Number(p.buyIn) || 0) / base) - 1), 0)
      : null,
    buyIns: base > 0 ? Math.round(totalBuyIn / base) : 0,
    chipsInPlay: totalBuyIn,
    bountyToPool: unique.reduce((sum, p) => sum + (Number(p.bountyToPool) || 0), 0),
  };
}
