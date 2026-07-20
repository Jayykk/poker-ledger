import { FieldValue } from 'firebase-admin/firestore';
import { buildLeaderboardStatsDocs } from '../utils/leaderboardStatsMath.js';

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
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @param {string} uid User to recompute.
 * @return {Promise<{periods: number, deleted: number}>} Write summary.
 */
export async function recomputeLeaderboardStatsForUser(db, uid) {
  const userRef = db.collection('users').doc(uid);
  const [userSnap, historySnap, existingSnap] = await Promise.all([
    userRef.get(),
    userRef.collection('history_sub').get(),
    db.collection(STATS_COLLECTION).where('uid', '==', uid).select().get(),
  ]);

  const userData = userSnap.exists ? userSnap.data() : {};
  const name = userData.name || userData.displayName || '';
  // Same visibility rule the leaderboard used client-side: anonymous or
  // nameless accounts never rank.
  const hidden = !!userData.isAnonymous || !name;

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

  return { periods: statDocs.length, deleted: staleIds.length };
}
