import { describe, it, expect } from 'vitest';
import {
  periodKeysForMillis,
  recordMillis,
  aggregateHistoryRecords,
  buildLeaderboardStatsDocs,
  statsDocId,
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

    expect(monthly.total).toEqual({ games: 3, wins: 2, profit: 330 });
    expect(monthly.cash).toEqual({ games: 2, wins: 1, profit: 30 });
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
});
