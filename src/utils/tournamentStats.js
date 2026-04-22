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