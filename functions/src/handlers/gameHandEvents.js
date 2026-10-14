import { gameHandEvents } from '../utils/handEvents.js';
import { HAND_EVENT_KEYS, emptyHandEvents } from '../utils/leaderboardStatsMath.js';
import { recomputeLeaderboardStatsForUser } from './leaderboardStats.js';

// history_sub.handEvents (手牌 / 復仇者 titles): read a game's hand records
// and knockout log once and work out every player's counts
// (utils/handEvents.js). Used by the history projection when a game completes,
// by the hands trigger when a finished game's hands change (補記手牌,
// refreshGameHandEvents) and by backfill_leaderboard_stats.js --hand-events.

/**
 * Hand events of one game per uid, from games/{gameId}/hands and (in a
 * tournament) its 'eliminate' transactions.
 *
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @param {string} gameId Game id.
 * @param {object} game games/{gameId} data (the roster).
 * @return {Promise<Object<string, Object<string, number>>>} uid → counts.
 */
export async function loadGameHandEvents(db, gameId, game) {
  const handsQuery = db.collection('games').doc(gameId).collection('hands').get();
  // Only tournaments record knockouts; one equality filter, no index needed
  const txQuery = game?.type === 'tournament'
    ? db.collection('transactions').where('gameId', '==', gameId).get()
    : Promise.resolve({ docs: [] });
  const [handsSnap, txSnap] = await Promise.all([handsQuery, txQuery]);
  return gameHandEvents({
    players: game?.players,
    hands: handsSnap.docs.map((docSnap) => docSnap.data()),
    transactions: txSnap.docs
      .map((docSnap) => docSnap.data())
      .filter((tx) => tx?.type === 'eliminate'),
  });
}

/**
 * Same counts? (missing keys are 0)
 *
 * @param {?object} a Stored handEvents.
 * @param {?object} b Fresh handEvents.
 * @return {boolean}
 */
export function sameHandEvents(a, b) {
  if (!a || !b) return false;
  return HAND_EVENT_KEYS.every((key) => (Number(a[key]) || 0) === (Number(b[key]) || 0))
    && Object.keys(a).every((key) => HAND_EVENT_KEYS.includes(key));
}

/**
 * A finished game's hands changed (補記手牌, or the host editing them):
 * recount the game's hand events, patch each participant's
 * users/{uid}/history_sub/{gameId}.handEvents where it changed, then rebuild
 * those users' stats and titles (recomputeLeaderboardStatsForUser, the same
 * path a game's completion takes: titles stay opt-in).
 *
 * Active games are left alone: the projection counts their hands when they
 * complete. A history doc that isn't there yet (projection still to come) is
 * not created. Idempotent: an unchanged count writes nothing. Failures are
 * logged, never thrown (a trigger must not retry into a loop).
 *
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @param {string} gameId Game id.
 * @return {Promise<{status: string, written: Array<string>, recomputed: Array<string>}>}
 *   status: 'not-found' | 'not-completed' | 'failed' | 'done'.
 */
export async function refreshGameHandEvents(db, gameId) {
  const summary = { status: 'done', written: [], recomputed: [] };
  let perUid;
  let uids;
  try {
    const gameSnap = await db.collection('games').doc(gameId).get();
    if (!gameSnap.exists) return { ...summary, status: 'not-found' };
    const game = gameSnap.data();
    if (game?.status !== 'completed') return { ...summary, status: 'not-completed' };
    perUid = await loadGameHandEvents(db, gameId, game);
    // Everyone the projection wrote a history for, and anyone on the roster
    const asList = (value) => (Array.isArray(value) ? value : []);
    uids = [...new Set([
      ...asList(game.historyProjection?.syncedUserIds),
      ...asList(game.settlementSnapshot).map((row) => row?.odId || row?.uid),
      ...Object.keys(perUid),
    ].filter((uid) => typeof uid === 'string' && uid))];
  } catch (error) {
    console.error(`hand events refresh failed for game ${gameId}:`, error);
    return { ...summary, status: 'failed' };
  }

  for (const uid of uids) {
    try {
      const historyRef = db.collection('users').doc(uid).collection('history_sub').doc(gameId);
      const historySnap = await historyRef.get();
      if (!historySnap.exists) continue;
      const next = perUid[uid] || emptyHandEvents();
      if (sameHandEvents(historySnap.data()?.handEvents, next)) continue;
      // mergeFields: the map is replaced whole, the rest of the doc kept
      await historyRef.set({ handEvents: next }, { mergeFields: ['handEvents'] });
      summary.written.push(uid);
    } catch (error) {
      console.error(`hand events write failed for user ${uid}, game ${gameId}:`, error);
    }
  }

  for (const uid of summary.written) {
    try {
      await recomputeLeaderboardStatsForUser(db, uid);
      summary.recomputed.push(uid);
    } catch (error) {
      console.error(`leaderboardStats recompute failed for user ${uid}:`, error);
    }
  }
  return summary;
}

/**
 * Backfill: recompute handEvents on each of a user's history_sub docs whose
 * game still exists, writing only the ones that differ (idempotent). `cache`
 * holds each game's counts across users (a game sits in every player's
 * history), as a promise so concurrent lookups share one read.
 *
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @param {string} uid User.
 * @param {Map<string, Promise<?object>>} cache gameId → per-uid counts (null:
 *   game gone or unreadable).
 * @return {Promise<{checked: number, written: number, skipped: number}>}
 */
export async function fillHandEventsForUser(db, uid, cache) {
  const historySnap = await db.collection('users').doc(uid).collection('history_sub').get();
  const summary = { checked: 0, written: 0, skipped: 0 };
  for (const historyDoc of historySnap.docs) {
    const history = historyDoc.data();
    const gameId = history.gameId || historyDoc.id;
    if (!cache.has(gameId)) {
      cache.set(gameId, (async () => {
        try {
          const gameSnap = await db.collection('games').doc(gameId).get();
          if (!gameSnap.exists) return null;
          return await loadGameHandEvents(db, gameId, gameSnap.data());
        } catch (error) {
          console.error(`  hand events failed for game ${gameId}:`, error.message || error);
          return null;
        }
      })());
    }
    const perUid = await cache.get(gameId);
    if (!perUid) {
      summary.skipped += 1;
      continue;
    }
    summary.checked += 1;
    const next = perUid[uid] || emptyHandEvents();
    if (sameHandEvents(history.handEvents, next)) continue;
    // mergeFields: the map is replaced whole, the rest of the doc kept
    await historyDoc.ref.set({ handEvents: next }, { mergeFields: ['handEvents'] });
    summary.written += 1;
  }
  return summary;
}
