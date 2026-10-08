import { gameHandEvents } from '../utils/handEvents.js';
import { HAND_EVENT_KEYS, emptyHandEvents } from '../utils/leaderboardStatsMath.js';

// history_sub.handEvents (手牌 / 復仇者 titles): read a game's hand records
// and knockout log once and work out every player's counts
// (utils/handEvents.js). Used by the history projection when a game completes
// and by backfill_leaderboard_stats.js --hand-events.

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
