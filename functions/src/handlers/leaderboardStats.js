import { FieldValue } from 'firebase-admin/firestore';
import { buildLeaderboardStatsDocs, statsDocId } from '../utils/leaderboardStatsMath.js';
import { isHiddenAccount, palCandidates } from '../utils/palsMath.js';
import { publicProfileOf, recomputeUserTitles } from './userTitles.js';

const STATS_COLLECTION = 'leaderboardStats';
const MAX_BATCH_SIZE = 400;

/**
 * Rebuild every leaderboardStats/{uid}_{period} doc for one user from their
 * FULL history_sub subcollection.
 *
 * Recompute-from-source (not increment) on purpose: the history projection can
 * legally re-run for the same game (manual resync, settlement corrections), so
 * delta-based aggregation would double-count. A full rewrite is idempotent and
 * also serves as the backfill path (functions/scripts/backfill_leaderboard_stats.js).
 *
 * Stat docs whose period no longer has any games (e.g. a correction moved a
 * game across a month boundary) are deleted.
 *
 * Then the user's 稱號 are re-evaluated from the fresh all-time stats
 * (handlers/userTitles.js), together with the 牌友圈 (pals) from the same
 * history (palsMath.js: no extra history reads). A titles failure is logged,
 * never thrown: the stats are already written and the next recompute retries.
 *
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @param {string} uid User to recompute.
 * @param {object} [options] `{ rebuildTitles }`: rebuild the 稱號 from scratch
 *   (tiers can go down) instead of only adding — the backfill's --rebuild-titles;
 *   `now` (Unix millis) for the pals window and new unlocks.
 * @return {Promise<{periods: number, deleted: number, titles: ?object}>} Write
 *   summary (titles.pals: the pals after this recompute).
 */
export async function recomputeLeaderboardStatsForUser(db, uid, options = {}) {
  const { rebuildTitles = false, now = Date.now() } = options;
  const userRef = db.collection('users').doc(uid);
  const [userSnap, historySnap, existingSnap] = await Promise.all([
    userRef.get(),
    userRef.collection('history_sub').get(),
    db.collection(STATS_COLLECTION).where('uid', '==', uid).select().get(),
  ]);

  const userData = userSnap.exists ? userSnap.data() : {};
  const name = userData.name || userData.displayName || '';
  // Same visibility rule the leaderboard used client-side: anonymous or
  // nameless accounts never rank (and are nobody's pal).
  const hidden = isHiddenAccount(userData);

  const records = historySnap.docs.map((docSnap) => ({
    gameId: docSnap.id,
    ...docSnap.data(),
  }));

  const statDocs = buildLeaderboardStatsDocs({ uid, name, hidden, records });
  const nextIds = new Set(statDocs.map((item) => item.id));
  const staleIds = existingSnap.docs
    .map((docSnap) => docSnap.id)
    .filter((id) => !nextIds.has(id));

  const operations = [
    ...statDocs.map((item) => ({ kind: 'set', id: item.id, data: item.data })),
    ...staleIds.map((id) => ({ kind: 'delete', id })),
  ];

  for (let i = 0; i < operations.length; i += MAX_BATCH_SIZE) {
    const batch = db.batch();
    for (const op of operations.slice(i, i + MAX_BATCH_SIZE)) {
      const ref = db.collection(STATS_COLLECTION).doc(op.id);
      if (op.kind === 'set') {
        batch.set(ref, { ...op.data, updatedAt: FieldValue.serverTimestamp() });
      } else {
        batch.delete(ref);
      }
    }
    await batch.commit();
  }

  const allTime = statDocs.find((item) => item.id === statsDocId(uid, 'all'))?.data || null;
  let titles = null;
  try {
    titles = await recomputeUserTitles(db, uid, allTime, now, {
      rebuild: rebuildTitles,
      profile: publicProfileOf(userData),
      palCandidates: palCandidates(uid, records, now),
    });
  } catch (titlesError) {
    console.error(`userTitles recompute failed for user ${uid}:`, titlesError);
  }

  return { periods: statDocs.length, deleted: staleIds.length, titles };
}
