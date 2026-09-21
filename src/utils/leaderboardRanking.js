const percentage = (numerator, denominator) => (
  denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null
);

export function buildTournamentLeaderboardEntry(row) {
  const bucket = row.tournament || {};
  const roi = percentage(
    (Number(bucket.totalPrize) || 0) - (Number(bucket.totalBuyIn) || 0),
    Number(bucket.totalBuyIn) || 0
  );
  return {
    uid: row.uid,
    name: row.name,
    games: bucket.games || 0,
    profit: Math.round(bucket.profit || 0),
    winRate: percentage(bucket.wins || 0, bucket.games || 0) || 0,
    champion: bucket.champion || 0,
    runnerUp: bucket.runnerUp || 0,
    itmCount: bucket.itm || 0,
    itmRate: percentage(bucket.itm || 0, bucket.games || 0) || 0,
    roi,
    roiAvailable: roi != null,
    rebuyCount: bucket.rebuyCount || 0,
    rebuyKnownGames: bucket.rebuyKnownGames || 0,
    rebuyComplete: (bucket.rebuyKnownGames || 0) >= (bucket.games || 0),
  };
}

export function rankLeaderboardEntries(entries, sort, minGames = 1) {
  if (sort === 'itm') {
    return entries
      .filter((entry) => entry.games >= minGames)
      .sort((a, b) => b.itmRate - a.itmRate || b.itmCount - a.itmCount || b.games - a.games || b.profit - a.profit);
  }
  if (sort === 'roi') {
    return entries
      .filter((entry) => entry.games >= minGames && entry.roiAvailable)
      .sort((a, b) => b.roi - a.roi || b.profit - a.profit || b.games - a.games);
  }
  return entries;
}