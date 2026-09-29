import { describe, expect, it } from 'vitest';
import {
  buildTournamentLeaderboardEntry,
  rankLeaderboardEntries,
} from '../src/utils/leaderboardRanking.js';

describe('tournament leaderboard ranking', () => {
  it('calculates ITM and ROI from aggregate inputs', () => {
    expect(buildTournamentLeaderboardEntry({
      uid: 'alice',
      name: 'Alice',
      tournament: {
        games: 12,
        itm: 4,
        profit: 6300,
        totalBuyIn: 18000,
        totalPrize: 24300,
        rebuyCount: 6,
        rebuyKnownGames: 12,
      },
    })).toMatchObject({
      itmCount: 4,
      itmRate: 33.3,
      roi: 35,
      roiAvailable: true,
      rebuyCount: 6,
      rebuyComplete: true,
    });
  });

  it('marks rebuy totals incomplete when legacy games are unknown', () => {
    expect(buildTournamentLeaderboardEntry({
      tournament: { games: 3, rebuyCount: 0, rebuyKnownGames: 1 },
    })).toMatchObject({ rebuyCount: 0, rebuyComplete: false });
  });

  it('sorts ITM ties by count then games then profit', () => {
    const entries = [
      { uid: 'a', games: 6, itmRate: 50, itmCount: 3, profit: 100 },
      { uid: 'b', games: 10, itmRate: 50, itmCount: 5, profit: 50 },
    ];

    expect(rankLeaderboardEntries(entries, 'itm', 3).map((entry) => entry.uid))
      .toEqual(['b', 'a']);
  });

  it('filters ROI by minimum games and unavailable ROI', () => {
    const entries = [
      { uid: 'a', games: 2, roi: 100, roiAvailable: true, profit: 100 },
      { uid: 'b', games: 5, roi: 25, roiAvailable: true, profit: 50 },
      { uid: 'c', games: 5, roi: null, roiAvailable: false, profit: 0 },
    ];

    expect(rankLeaderboardEntries(entries, 'roi', 3).map((entry) => entry.uid))
      .toEqual(['b']);
  });
});