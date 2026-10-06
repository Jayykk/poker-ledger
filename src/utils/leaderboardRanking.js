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
    // Hunter / 歐皇
    bountyGames: bucket.bountyGames || 0,
    knockouts: bucket.knockouts || 0,
    bountyWon: Math.round(bucket.bountyWon || 0),
    draws: bucket.draws || 0,
    topDraws: bucket.topDraws || 0,
    topRate: percentage(bucket.topDraws || 0, bucket.draws || 0) || 0,
    mysteryWon: Math.round(bucket.mysteryWon || 0),
  };
}

export function rankLeaderboardEntries(entries, sort, minGames = 1) {
  // Hunter: most knockouts, then bounty won
  if (sort === 'hunter') {
    return entries
      .filter((entry) => entry.knockouts > 0)
      .sort((a, b) => b.knockouts - a.knockouts || b.bountyWon - a.bountyWon || a.games - b.games);
  }
  // 歐皇: most won from mystery envelopes, then big prizes
  if (sort === 'lucky') {
    return entries
      .filter((entry) => entry.draws > 0)
      .sort((a, b) => b.mysteryWon - a.mysteryWon || b.topDraws - a.topDraws || a.draws - b.draws);
  }
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

/**
 * 只看牌友: keep the rows of me and my 牌友圈 (userTitles pals). Without a
 * signed-in user nothing is filtered.
 *
 * @param {Array<{uid: string}>} rows Leaderboard rows.
 * @param {?string} myUid Signed-in user.
 * @param {?Array<string>} pals My pals.
 * @return {Array<object>}
 */
export function filterToCircle(rows, myUid, pals) {
  if (!myUid) return rows || [];
  const circle = new Set([myUid, ...(pals || [])]);
  return (rows || []).filter((row) => circle.has(row?.uid));
}