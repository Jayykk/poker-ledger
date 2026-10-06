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

import { deriveTournamentEntryMetrics } from './tournamentSettlementMath.js';

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

// Fields every bucket (total / cash / tournament) carries. Besides the
// leaderboard's games / wins / profit, the rest feed the 稱號 (titles) system
// (functions/src/utils/titleRules.js):
//   maxWinGroups / maxLossGroups  biggest single-game win / loss in 組 (one
//                                 baseBuyIn); the loss is stored as a positive
//                                 number
//   groupGames / sumGroups / sumSqGroups  games with a known baseBuyIn and the
//                                 Σx, Σx² of their result in 組 (→ std-dev)
//   winStreakBest / lossStreakBest  longest run of games with profit > 0 / < 0
//                                 in completedAt order (a 0 result breaks both)
//   hostedGames                   games the user hosted (history_sub.hostUid)
//   nightGames                    games finished 03:00–06:00 Asia/Taipei
const emptyBucket = () => ({
  games: 0,
  wins: 0,
  profit: 0,
  maxWinGroups: 0,
  maxLossGroups: 0,
  groupGames: 0,
  sumGroups: 0,
  sumSqGroups: 0,
  winStreakBest: 0,
  lossStreakBest: 0,
  hostedGames: 0,
  nightGames: 0,
});
const emptyTournamentBucket = () => ({
  ...emptyBucket(),
  // Most rebuys in one game that still finished in the money
  maxRebuyItm: 0,
  // Heads lost in bounty games (approximation, see aggregateHistoryRecords)
  knockedOut: 0,
  // Finished last (≥ 3 players) / one place outside the paid places
  firstOut: 0,
  bubble: 0,
  itm: 0,
  champion: 0,
  runnerUp: 0,
  totalBuyIn: 0,
  totalPrize: 0,
  rebuyCount: 0,
  rebuyKnownGames: 0,
  // Bounty games (KO / PKO / mystery): knockouts and bounty won
  bountyGames: 0,
  knockouts: 0,
  bountyWon: 0,
  // Mystery games: envelopes drawn, big prizes, their total, the best one
  mysteryGames: 0,
  draws: 0,
  topDraws: 0,
  mysteryWon: 0,
  bestDraw: 0,
});

const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;

// Taipei hours [NIGHT_FROM_HOUR, NIGHT_TO_HOUR) count as a night game (夜貓子)
const NIGHT_FROM_HOUR = 3;
const NIGHT_TO_HOUR = 6;

/**
 * When a game finished (completedAt, falling back to recordMillis). Used for
 * the streak order and the night-game check.
 *
 * @param {object} record history_sub record.
 * @return {number} Unix millis, or 0.
 */
function completedMillis(record) {
  return recordMillis({ createdAt: record.completedAt }) || recordMillis(record);
}

/**
 * True when a game finished between 03:00 and 06:00 Asia/Taipei.
 *
 * @param {number} ms Unix millis.
 * @return {boolean}
 */
export function isNightGame(ms) {
  if (!ms) return false;
  const hour = new Date(ms + TAIPEI_OFFSET_MS).getUTCHours();
  return hour >= NIGHT_FROM_HOUR && hour < NIGHT_TO_HOUR;
}

/**
 * Population standard deviation of the per-game result in 組, from a bucket's
 * groupGames / sumGroups / sumSqGroups. 0 when there are no such games.
 *
 * @param {object} bucket Bucket with groupGames / sumGroups / sumSqGroups.
 * @return {number}
 */
export function groupsStdDev(bucket) {
  const n = Number(bucket?.groupGames) || 0;
  if (n <= 0) return 0;
  const mean = (Number(bucket.sumGroups) || 0) / n;
  const variance = (Number(bucket.sumSqGroups) || 0) / n - mean * mean;
  return variance > 0 ? Math.sqrt(variance) : 0;
}

/**
 * Settlement-derived placement facts for the user's own tournament row.
 *
 * firstOut: finished last among ≥ 3 placed players (heads-up "last" is just
 *   the runner-up).
 * bubble: finished exactly one place below the last paid place. Paid places
 *   are the settlement rows with prize > 0 (prize is the placement payout only;
 *   bounties live in `bounty`), so a deal that pays extra places moves the
 *   bubble with it.
 *
 * @param {Array<object>} rows Settlement rows.
 * @param {?object} ownRow The user's row.
 * @return {{firstOut: boolean, bubble: boolean}}
 */
function placementFacts(rows, ownRow) {
  const placement = Number(ownRow?.placement);
  if (!Array.isArray(rows) || !Number.isInteger(placement) || placement < 1) {
    return { firstOut: false, bubble: false };
  }
  const placements = rows
    .map((row) => Number(row?.placement))
    .filter((p) => Number.isInteger(p) && p > 0);
  const lastPlace = placements.length ? Math.max(...placements) : 0;
  const paidPlaces = rows.filter((row) => (Number(row?.prize) || 0) > 0).length;
  const ownPrize = Number(ownRow.prize) || 0;
  return {
    firstOut: placements.length >= 3 && placement === lastPlace,
    bubble: paidPlaces > 0 && ownPrize <= 0 && placement === paidPlaces + 1,
  };
}

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
 * Add one game's result to a bucket (fields shared by every bucket).
 *
 * @param {object} bucket total / cash / tournament bucket.
 * @param {object} streaks Running streak state for that bucket.
 * @param {object} game Per-game facts computed once per record.
 */
function addGame(bucket, streaks, game) {
  bucket.games += 1;
  bucket.profit += game.profit;
  if (game.isWin) bucket.wins += 1;
  if (game.groups != null) {
    bucket.groupGames += 1;
    bucket.sumGroups += game.groups;
    bucket.sumSqGroups += game.groups * game.groups;
    if (game.groups > bucket.maxWinGroups) bucket.maxWinGroups = game.groups;
    if (-game.groups > bucket.maxLossGroups) bucket.maxLossGroups = -game.groups;
  }
  streaks.win = game.chipProfit > 0 ? streaks.win + 1 : 0;
  streaks.loss = game.chipProfit < 0 ? streaks.loss + 1 : 0;
  bucket.winStreakBest = Math.max(bucket.winStreakBest, streaks.win);
  bucket.lossStreakBest = Math.max(bucket.lossStreakBest, streaks.loss);
  if (game.hosted) bucket.hostedGames += 1;
  if (game.night) bucket.nightGames += 1;
}

/**
 * Aggregate one user's history records into per-period stat payloads.
 *
 * Records are processed in completedAt order so the streak fields are right
 * whatever order Firestore returns them in.
 *
 * @param {string} uid Owner uid (used to find their own settlement row for ITM)
 * @param {Array<object>} records history_sub records
 * @return {Map<string, object>} periodKey → {periodType, total, cash, tournament}
 */
export function aggregateHistoryRecords(uid, records) {
  const periods = new Map();
  // periodKey → { total, cash, tournament } running streaks (not persisted)
  const streakState = new Map();

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
      streakState.set(periodKey, {
        total: { win: 0, loss: 0 },
        cash: { win: 0, loss: 0 },
        tournament: { win: 0, loss: 0 },
      });
    }
    return entry;
  };

  const ordered = (records || [])
    .map((record, index) => ({
      record, index, ms: recordMillis(record), done: completedMillis(record),
    }))
    .filter((item) => item.ms)
    .sort((a, b) => a.done - b.done || a.index - b.index);

  for (const { record, ms, done } of ordered) {
    // Rounded settlements store the cash result; older ones are chips / rate.
    const profit = Number.isFinite(record.profitCash) ?
      record.profitCash :
      (Number(record.profit) || 0) / (Number(record.rate) || 1);
    const chipProfit = Number(record.profit) || 0;
    const baseBuyIn = Number(record.baseBuyIn) || 0;
    const game = {
      profit,
      chipProfit,
      isWin: chipProfit > 0,
      // Result in 組 (one baseBuyIn), chips / chips so the rate cancels out
      groups: baseBuyIn > 0 ? round4(chipProfit / baseBuyIn) : null,
      hosted: !!uid && record.hostUid === uid,
      night: isNightGame(done),
    };
    const bucketType = bucketTypeOf(record);

    const isChampion = record.placement === 1;
    const isRunnerUp = record.placement === 2;
    const settlementRows = Array.isArray(record.settlement) ? record.settlement : null;
    const ownRow = settlementRows
      ? settlementRows.find((row) => row && row.odId === uid)
      : null;
    const isItm = !!ownRow && (Number(ownRow.prize) || 0) > 0;
    const facts = placementFacts(settlementRows, ownRow);

    const keys = periodKeysForMillis(ms);
    for (const [periodType, periodKey] of Object.entries(keys)) {
      const entry = bucketFor(periodKey, periodType);
      const streaks = streakState.get(periodKey);

      addGame(entry.total, streaks.total, game);

      if (bucketType) {
        const bucket = entry[bucketType];
        addGame(bucket, streaks[bucketType], game);

        if (bucketType === 'tournament') {
          const buyIn = Number(ownRow?.buyIn) || 0;
          const prize = Number(ownRow?.prize) || 0;
          const explicitRebuy = Number.isInteger(ownRow?.rebuyCount) && ownRow.rebuyCount >= 0
            ? ownRow.rebuyCount
            : null;
          const derived = explicitRebuy == null
            ? deriveTournamentEntryMetrics(buyIn, record.baseBuyIn)
            : null;
          const rebuyCount = explicitRebuy ?? derived?.rebuyCount ?? null;

          bucket.totalBuyIn += buyIn;
          bucket.totalPrize += prize;
          if (rebuyCount != null) {
            bucket.rebuyCount += rebuyCount;
            bucket.rebuyKnownGames += 1;
            if (isItm) bucket.maxRebuyItm = Math.max(bucket.maxRebuyItm, rebuyCount);
          }
          if (isItm) bucket.itm += 1;
          if (isChampion) bucket.champion += 1;
          if (isRunnerUp) bucket.runnerUp += 1;
          if (facts.firstOut) bucket.firstOut += 1;
          if (facts.bubble) bucket.bubble += 1;
          if (Number.isFinite(ownRow?.bounty)) {
            const won = Number(ownRow.bounty) || 0;
            bucket.bountyGames += 1;
            bucket.knockouts += Number(ownRow.knockouts) || 0;
            bucket.bountyWon += won;
            // Heads lost (被收頭). Who knocked whom out is not in history_sub,
            // so approximate: every entry ends in a knockout except the one
            // still standing for the champion. Deal finishes (several players
            // standing) and heads sent to the pool still count — close enough
            // for a title threshold.
            const entries = Number.isInteger(ownRow.entryCount) && ownRow.entryCount > 0
              ? ownRow.entryCount
              : (rebuyCount ?? 0) + 1;
            bucket.knockedOut += Math.max(0, entries - (isChampion ? 1 : 0));
            if (Number.isInteger(ownRow.draws)) {
              bucket.mysteryGames += 1;
              bucket.draws += ownRow.draws;
              bucket.topDraws += Number(ownRow.topDraws) || 0;
              bucket.mysteryWon += won;
              bucket.bestDraw = Math.max(bucket.bestDraw, Number(ownRow.bestDraw) || 0);
            }
          }
        }
      }
    }
  }

  for (const entry of periods.values()) {
    for (const bucket of [entry.total, entry.cash, entry.tournament]) {
      bucket.profit = round2(bucket.profit);
      bucket.maxWinGroups = round2(bucket.maxWinGroups);
      bucket.maxLossGroups = round2(bucket.maxLossGroups);
      bucket.sumGroups = round4(bucket.sumGroups);
      bucket.sumSqGroups = round4(bucket.sumSqGroups);
    }
    entry.tournament.totalBuyIn = round2(entry.tournament.totalBuyIn);
    entry.tournament.totalPrize = round2(entry.tournament.totalPrize);
    entry.tournament.bountyWon = round2(entry.tournament.bountyWon);
    entry.tournament.mysteryWon = round2(entry.tournament.mysteryWon);
  }

  return periods;
}

// 4: titles fields (groups / streaks / hosted / night / knockedOut / bubble …)
export const LEADERBOARD_STATS_VERSION = 4;

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
