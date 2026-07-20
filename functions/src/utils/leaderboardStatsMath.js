// Pure aggregation math for the leaderboardStats collection.
//
// NO firebase imports here on purpose: this module is shared by
//   - functions/src/handlers/leaderboardStats.js  (Cloud Function recompute)
//   - functions/scripts/backfill_leaderboard_stats.js
//   - src/components/social/Leaderboard.vue        (current-period keys; Vite
//     bundles across the functions/ folder, the reverse direction would not
//     survive `firebase deploy` which uploads functions/ only)
//   - tests/leaderboardStatsMath.test.js
//
// One doc per user per period:  leaderboardStats/{uid}_{periodKey}
// periodKey: 'all' | '2026' | '2026-Q3' | '2026-07' | 'week-2026-07-20' (Monday date)

// All period boundaries use Asia/Taipei. Taiwan has no DST, so a fixed +8h shift
// followed by UTC getters is exact. Keep this the ONLY place that decides which
// calendar day a game belongs to — CF, backfill and frontend must agree.
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * All period keys a timestamp belongs to (Asia/Taipei calendar).
 *
 * @param {number} ms Unix millis
 * @return {{all: string, year: string, quarter: string, month: string, week: string}}
 */
export function periodKeysForMillis(ms) {
  const d = new Date(ms + TAIPEI_OFFSET_MS);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(Date.UTC(year, d.getUTCMonth(), d.getUTCDate() - dow));

  return {
    all: 'all',
    year: `${year}`,
    quarter: `${year}-Q${Math.floor((month - 1) / 3) + 1}`,
    month: `${year}-${pad2(month)}`,
    week: `week-${monday.getUTCFullYear()}-${pad2(monday.getUTCMonth() + 1)}-${pad2(monday.getUTCDate())}`,
  };
}

/**
 * Deterministic leaderboardStats document id.
 *
 * @param {string} uid Owner uid.
 * @param {string} periodKey Period key (see periodKeysForMillis).
 * @return {string} `${uid}_${periodKey}`
 */
export function statsDocId(uid, periodKey) {
  return `${uid}_${periodKey}`;
}

/**
 * Timestamp of a history record, mirroring the frontend fallback chain
 * (user.js normalizeHistoryRecord). Undatable records are excluded from
 * aggregation, matching the current leaderboard behavior.
 *
 * @param {object} record history_sub record.
 * @return {number} Unix millis, or 0 when undatable.
 */
export function recordMillis(record) {
  const fromValue = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    return 0;
  };
  return fromValue(record.createdAt) || fromValue(record.completedAt) || fromValue(record.date);
}

const emptyBucket = () => ({ games: 0, wins: 0, profit: 0 });
const emptyTournamentBucket = () => ({ ...emptyBucket(), itm: 0, champion: 0, runnerUp: 0 });

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Ledger cash games historically use type 'live'; be liberal about 'cash' too.
 *
 * @param {object} record history_sub record.
 * @return {?string} 'tournament' | 'cash' | null (unknown → totals only).
 */
function bucketTypeOf(record) {
  if (record.type === 'tournament') return 'tournament';
  if (record.type === 'live' || record.type === 'cash') return 'cash';
  return null;
}

/**
 * Aggregate one user's history records into per-period stat payloads.
 *
 * @param {string} uid Owner uid (used to find their own settlement row for ITM)
 * @param {Array<object>} records history_sub records
 * @return {Map<string, object>} periodKey → {periodType, total, cash, tournament}
 */
export function aggregateHistoryRecords(uid, records) {
  const periods = new Map();

  const bucketFor = (periodKey, periodType) => {
    let entry = periods.get(periodKey);
    if (!entry) {
      entry = {
        periodType,
        total: emptyBucket(),
        cash: emptyBucket(),
        tournament: emptyTournamentBucket(),
      };
      periods.set(periodKey, entry);
    }
    return entry;
  };

  for (const record of records || []) {
    const ms = recordMillis(record);
    if (!ms) continue;

    const profit = (Number(record.profit) || 0) / (Number(record.rate) || 1);
    const isWin = (Number(record.profit) || 0) > 0;
    const bucketType = bucketTypeOf(record);

    const isChampion = record.placement === 1;
    const isRunnerUp = record.placement === 2;
    const ownRow = Array.isArray(record.settlement)
      ? record.settlement.find((row) => row && row.odId === uid)
      : null;
    const isItm = !!ownRow && (Number(ownRow.prize) || 0) > 0;

    const keys = periodKeysForMillis(ms);
    for (const [periodType, periodKey] of Object.entries(keys)) {
      const entry = bucketFor(periodKey, periodType);

      entry.total.games += 1;
      entry.total.profit += profit;
      if (isWin) entry.total.wins += 1;

      if (bucketType) {
        const bucket = entry[bucketType];
        bucket.games += 1;
        bucket.profit += profit;
        if (isWin) bucket.wins += 1;

        if (bucketType === 'tournament') {
          if (isItm) bucket.itm += 1;
          if (isChampion) bucket.champion += 1;
          if (isRunnerUp) bucket.runnerUp += 1;
        }
      }
    }
  }

  for (const entry of periods.values()) {
    entry.total.profit = round2(entry.total.profit);
    entry.cash.profit = round2(entry.cash.profit);
    entry.tournament.profit = round2(entry.tournament.profit);
  }

  return periods;
}

export const LEADERBOARD_STATS_VERSION = 1;

/**
 * Build the full leaderboardStats doc set for a user (Firestore payloads).
 * The IO layer adds server timestamps and diffs against existing docs.
 *
 * @param {{uid: string, name: string, hidden: boolean, records: Array<object>}} input
 * @return {Array<{id: string, data: object}>}
 */
export function buildLeaderboardStatsDocs({ uid, name, hidden, records }) {
  const periods = aggregateHistoryRecords(uid, records);

  return [...periods.entries()].map(([periodKey, entry]) => ({
    id: statsDocId(uid, periodKey),
    data: {
      uid,
      name: name || '',
      hidden: !!hidden,
      period: periodKey,
      periodType: entry.periodType,
      total: entry.total,
      cash: entry.cash,
      tournament: entry.tournament,
      sourceVersion: LEADERBOARD_STATS_VERSION,
    },
  }));
}
