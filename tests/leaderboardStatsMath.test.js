import { describe, it, expect } from 'vitest';
import {
  periodKeysForMillis,
  recordMillis,
  aggregateHistoryRecords,
  buildLeaderboardStatsDocs,
  statsDocId,
  HAND_EVENT_KEYS,
} from '../functions/src/utils/leaderboardStatsMath.js';

const twMillis = (iso) => Date.parse(`${iso}+08:00`);

describe('periodKeysForMillis (Asia/Taipei calendar)', () => {
  it('buckets a plain mid-month date', () => {
    expect(periodKeysForMillis(twMillis('2026-07-22T14:00:00'))).toEqual({
      all: 'all',
      year: '2026',
      quarter: '2026-Q3',
      month: '2026-07',
      week: 'week-2026-07-20', // 2026-07-20 is a Monday
    });
  });

  it('uses Taipei time, not UTC, at month boundaries', () => {
    // 2026-07-31 17:30 UTC = 2026-08-01 01:30 in Taipei → August
    const keys = periodKeysForMillis(Date.parse('2026-07-31T17:30:00Z'));
    expect(keys.month).toBe('2026-08');
    expect(keys.quarter).toBe('2026-Q3');

    // 2026-07-31 15:59 UTC = 2026-07-31 23:59 in Taipei → still July
    expect(periodKeysForMillis(Date.parse('2026-07-31T15:59:00Z')).month).toBe('2026-07');
  });

  it('year boundary in Taipei time', () => {
    // 2025-12-31 16:30 UTC = 2026-01-01 00:30 Taipei
    const keys = periodKeysForMillis(Date.parse('2025-12-31T16:30:00Z'));
    expect(keys.year).toBe('2026');
    expect(keys.quarter).toBe('2026-Q1');
    expect(keys.month).toBe('2026-01');
  });

  it('weeks start on Monday and can cross months', () => {
    // Sunday 2026-07-26 belongs to the week of Monday 2026-07-20
    expect(periodKeysForMillis(twMillis('2026-07-26T23:00:00')).week).toBe('week-2026-07-20');
    // Monday 00:30 starts its own week
    expect(periodKeysForMillis(twMillis('2026-07-20T00:30:00')).week).toBe('week-2026-07-20');
    // Saturday 2026-08-01 → Monday 2026-07-27 (week key crosses the month)
    expect(periodKeysForMillis(twMillis('2026-08-01T12:00:00')).week).toBe('week-2026-07-27');
  });
});

describe('recordMillis', () => {
  it('falls back createdAt → completedAt → date', () => {
    expect(recordMillis({ createdAt: 123 })).toBe(123);
    expect(recordMillis({ completedAt: 456 })).toBe(456);
    expect(recordMillis({ date: '2026-07-01T00:00:00Z' })).toBe(Date.parse('2026-07-01T00:00:00Z'));
    expect(recordMillis({ createdAt: { seconds: 2 } })).toBe(2000);
    expect(recordMillis({})).toBe(0);
  });
});

describe('aggregateHistoryRecords', () => {
  const uid = 'user1';
  const at = twMillis('2026-07-22T20:00:00');

  it('splits cash vs tournament and applies rate to profit', () => {
    const records = [
      { type: 'live', profit: 500, rate: 10, createdAt: at },       // cash, +50
      { type: 'live', profit: -200, rate: 10, createdAt: at },      // cash, -20
      { type: 'tournament', profit: 300, rate: 1, createdAt: at, placement: 1 },
    ];
    const periods = aggregateHistoryRecords(uid, records);
    const monthly = periods.get('2026-07');

    expect(monthly.total).toMatchObject({ games: 3, wins: 2, profit: 330 });
    expect(monthly.cash).toMatchObject({ games: 2, wins: 1, profit: 30 });
    expect(monthly.tournament.games).toBe(1);
    expect(monthly.tournament.profit).toBe(300);
    expect(monthly.tournament.champion).toBe(1);
    // Same numbers must appear in every period the record belongs to
    for (const key of ['all', '2026', '2026-Q3', 'week-2026-07-20']) {
      expect(periods.get(key).total.games).toBe(3);
    }
  });

  it('counts champion / runnerUp / ITM from placement and own settlement row', () => {
    const records = [
      {
        type: 'tournament', profit: 700, createdAt: at, placement: 1,
        settlement: [{ odId: uid, prize: 1000 }, { odId: 'other', prize: 500 }],
      },
      {
        type: 'tournament', profit: 100, createdAt: at, placement: 2,
        settlement: [{ odId: uid, prize: 500 }],
      },
      {
        type: 'tournament', profit: -400, createdAt: at, placement: 5,
        settlement: [{ odId: uid, prize: 0 }],
      },
      // No settlement array → cannot prove ITM, but placement still counts
      { type: 'tournament', profit: -100, createdAt: at, placement: 2 },
    ];
    const t = aggregateHistoryRecords(uid, records).get('all').tournament;

    expect(t.games).toBe(4);
    expect(t.champion).toBe(1);
    expect(t.runnerUp).toBe(2);
    expect(t.itm).toBe(2);
  });

  it('aggregates tournament ROI inputs and known rebuy snapshots', () => {
    const records = [{
      type: 'tournament', profit: 1000, baseBuyIn: 1000, createdAt: at,
      settlement: [{
        odId: uid, buyIn: 3000, prize: 4000, profit: 1000,
        entryCount: 3, rebuyCount: 2,
      }],
    }];

    expect(aggregateHistoryRecords(uid, records).get('all').tournament).toMatchObject({
      games: 1,
      totalBuyIn: 3000,
      totalPrize: 4000,
      rebuyCount: 2,
      rebuyKnownGames: 1,
    });
  });

  it('keeps ROI inputs without guessing legacy rebuy counts', () => {
    const records = [{
      type: 'tournament', profit: 500, createdAt: at,
      settlement: [{ odId: uid, buyIn: 1000, prize: 1500, profit: 500 }],
    }];

    expect(aggregateHistoryRecords(uid, records).get('all').tournament).toMatchObject({
      totalBuyIn: 1000,
      totalPrize: 1500,
      rebuyCount: 0,
      rebuyKnownGames: 0,
    });
  });

  it('counts unknown-type records in totals only', () => {
    const records = [{ profit: 100, createdAt: at }];
    const monthly = aggregateHistoryRecords(uid, records).get('2026-07');

    expect(monthly.total.games).toBe(1);
    expect(monthly.cash.games).toBe(0);
    expect(monthly.tournament.games).toBe(0);
  });

  it('skips undatable records (matches current leaderboard behavior)', () => {
    const periods = aggregateHistoryRecords(uid, [{ profit: 100 }]);
    expect(periods.size).toBe(0);
  });

  it('records in different months land in different month keys but share year/all', () => {
    const records = [
      { type: 'live', profit: 10, rate: 1, createdAt: twMillis('2026-06-15T12:00:00') },
      { type: 'live', profit: 20, rate: 1, createdAt: twMillis('2026-07-15T12:00:00') },
    ];
    const periods = aggregateHistoryRecords(uid, records);

    expect(periods.get('2026-06').total.games).toBe(1);
    expect(periods.get('2026-07').total.games).toBe(1);
    expect(periods.get('2026').total.games).toBe(2);
    expect(periods.get('all').total.profit).toBe(30);
  });
});

describe('buildLeaderboardStatsDocs', () => {
  it('produces one doc per period with stable ids and identity fields', () => {
    const at = twMillis('2026-07-22T20:00:00');
    const docs = buildLeaderboardStatsDocs({
      uid: 'u1',
      name: 'Alice',
      hidden: false,
      records: [{ type: 'tournament', profit: 100, createdAt: at, placement: 1 }],
    });

    // all + year + quarter + month + week
    expect(docs).toHaveLength(5);
    const ids = docs.map((d) => d.id).sort();
    expect(ids).toEqual([
      statsDocId('u1', '2026'),
      statsDocId('u1', '2026-07'),
      statsDocId('u1', '2026-Q3'),
      statsDocId('u1', 'all'),
      statsDocId('u1', 'week-2026-07-20'),
    ].sort());

    const allDoc = docs.find((d) => d.data.period === 'all');
    expect(allDoc.data).toMatchObject({
      uid: 'u1',
      name: 'Alice',
      hidden: false,
      periodType: 'all',
    });
    expect(allDoc.data.tournament.champion).toBe(1);
  });

  it('returns no docs for a user with no datable history', () => {
    expect(buildLeaderboardStatsDocs({ uid: 'u1', name: 'A', hidden: false, records: [] }))
      .toEqual([]);
  });

  it('stamps sourceVersion 5 (hand events)', () => {
    const docs = buildLeaderboardStatsDocs({
      uid: 'u1', name: 'A', hidden: false,
      records: [{ type: 'live', profit: 1, createdAt: twMillis('2026-07-22T20:00:00') }],
    });
    expect(docs[0].data.sourceVersion).toBe(5);
  });
});

describe('hand events', () => {
  const rec = (createdAt, handEvents, type = 'live') => ({ type, profit: 0, createdAt, handEvents });

  it('sums history_sub.handEvents into the total bucket of every period', () => {
    const periods = aggregateHistoryRecords('me', [
      rec(twMillis('2026-07-22T20:00:00'), { quads: 1, badBeatWins: 2, coolers: 1 }),
      rec(twMillis('2026-08-05T20:00:00'), { quads: 1, royalFlush: 1, revenge: 1 }, 'tournament'),
      rec(twMillis('2026-08-06T20:00:00'), undefined),
    ]);
    expect(periods.get('all').total).toMatchObject({
      quads: 2, straightFlush: 0, royalFlush: 1, tragicHero: 0, badBeatWins: 2, coolers: 1, revenge: 1,
    });
    expect(periods.get('2026-07').total).toMatchObject({ quads: 1, badBeatWins: 2, royalFlush: 0 });
    expect(periods.get('2026-08').total).toMatchObject({ quads: 1, royalFlush: 1, revenge: 1 });
    // Only the total bucket carries them
    expect(periods.get('all').cash.quads).toBeUndefined();
    expect(periods.get('all').tournament.revenge).toBeUndefined();
  });

  it('ignores junk counts and starts every total at 0', () => {
    const all = aggregateHistoryRecords('me', [
      rec(twMillis('2026-07-22T20:00:00'), { quads: 'x', coolers: -1, tragicHero: null }),
    ]).get('all').total;
    for (const key of HAND_EVENT_KEYS) expect(all[key]).toBe(0);
  });
});

describe('titles stats fields', () => {
  const uid = 'me';
  // One game per hour on 2026-07-22, Taipei
  const hour = (h) => twMillis(`2026-07-22T${String(h).padStart(2, '0')}:00:00`);
  const cash = (profit, h, extra = {}) => ({
    type: 'live', profit, rate: 1, baseBuyIn: 1000, createdAt: hour(h), completedAt: hour(h), ...extra,
  });

  it('per-game result in 組: biggest win / loss and Σx, Σx²', () => {
    const t = aggregateHistoryRecords(uid, [
      cash(3000, 10), cash(-5000, 11), cash(500, 12),
      // No baseBuyIn: counts as a game, not as a 組 result
      { type: 'live', profit: 99999, rate: 1, createdAt: hour(13) },
    ]).get('all').total;

    expect(t).toMatchObject({
      games: 4, groupGames: 3, maxWinGroups: 3, maxLossGroups: 5, sumGroups: -1.5, sumSqGroups: 34.25,
    });
  });

  it('streaks follow completedAt order, not input order; a 0 result breaks both', () => {
    const records = [
      cash(100, 15), cash(100, 10), cash(100, 11), cash(0, 12),
      cash(-100, 13), cash(-100, 14), cash(-100, 16), cash(-100, 17),
    ];
    // order: + + 0 - - + - -  → best win 2 (10,11), best loss 2
    const t = aggregateHistoryRecords(uid, records).get('all').total;
    expect(t.winStreakBest).toBe(2);
    expect(t.lossStreakBest).toBe(2);

    const runs = aggregateHistoryRecords(uid, [cash(1, 10), cash(1, 11), cash(1, 12), cash(-1, 13)]).get('all');
    expect(runs.total.winStreakBest).toBe(3);
    expect(runs.cash.winStreakBest).toBe(3);
    expect(runs.tournament.winStreakBest).toBe(0);
  });

  it('counts hosted games and games finished 03:00-06:00 Taipei', () => {
    const t = aggregateHistoryRecords(uid, [
      cash(1, 3, { hostUid: uid }),
      cash(1, 5),
      cash(1, 6, { hostUid: 'someone' }),
      cash(1, 2),
    ]).get('all').total;
    expect(t.hostedGames).toBe(1);
    expect(t.nightGames).toBe(2);
  });

  it('tournament: max rebuys that still cashed, last place, bubble, heads lost', () => {
    const at = hour(20);
    const rows = (own) => [
      { odId: 'a', placement: 1, prize: 5000 },
      { odId: 'b', placement: 2, prize: 3000 },
      { odId: 'c', placement: 3, prize: 0 },
      { odId: 'd', placement: 4, prize: 0 },
    ].map((row) => (row.placement === own.placement ? { ...row, odId: uid, ...own } : row));
    const records = [
      // ITM after 3 rebuys, champion of a bounty game: 4 entries, 3 heads lost
      {
        type: 'tournament', profit: 1, placement: 1, baseBuyIn: 1000, createdAt: at,
        settlement: rows({ placement: 1, buyIn: 4000, rebuyCount: 3, entryCount: 4, bounty: 0, knockouts: 2 }),
      },
      // Bubble (3rd, two places paid), bounty game, 2 entries → 2 heads lost
      {
        type: 'tournament', profit: -2000, placement: 3, baseBuyIn: 1000, createdAt: at,
        settlement: rows({ placement: 3, buyIn: 2000, rebuyCount: 1, bounty: 0 }),
      },
      // Last of four, no bounty
      {
        type: 'tournament', profit: -1000, placement: 4, baseBuyIn: 1000, createdAt: at,
        settlement: rows({ placement: 4, buyIn: 1000, rebuyCount: 0 }),
      },
    ];
    const t = aggregateHistoryRecords(uid, records).get('all').tournament;
    expect(t).toMatchObject({
      maxRebuyItm: 3, knockedOut: 5, bubble: 1, firstOut: 1, knockouts: 2, champion: 1,
    });
  });

  it('heads-up last place is not "first out"', () => {
    const t = aggregateHistoryRecords(uid, [{
      type: 'tournament', profit: -1, placement: 2, createdAt: hour(20),
      settlement: [{ odId: 'x', placement: 1, prize: 2 }, { odId: uid, placement: 2, prize: 0 }],
    }]).get('all').tournament;
    expect(t.firstOut).toBe(0);
    // Paid places = 1, 2nd is one outside → bubble
    expect(t.bubble).toBe(1);
  });
});
