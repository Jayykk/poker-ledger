import { FieldValue } from 'firebase-admin/firestore';
import { crownMonthOf } from '../utils/crownRules.js';
import {
  TITLE_STATS_COLLECTION, TITLE_STATS_DOC, sameTitleStats, titleStatsFrom,
} from '../utils/titleStatsMath.js';
import { TITLES_COLLECTION } from './userTitles.js';

// 稱號圖鑑「幾人拿到」: recount titleStats/global from every userTitles doc
// (utils/titleStatsMath.js). Runs after each game's titles and crowns are
// written, and at the end of the backfill. Written only when a count moved.
//
// Two games finishing together recount concurrently, and the one that read
// the collection first can finish last. Each write carries the read time of
// its scan (`countedAt`, server time) and a transaction keeps the newest:
// an older scan never replaces a newer one.

/**
 * Recount and store the title / frame / crown counts.
 *
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @param {object} [options] `{ now }` Unix millis.
 * @return {Promise<{players: number, docs: number, written: boolean}>}
 */
export async function recountTitleStats(db, { now = Date.now() } = {}) {
  const snap = await db.collection(TITLES_COLLECTION).select('unlocked', 'crowns', 'crownHistory').get();
  const countedAt = snap.readTime?.toMillis?.() ?? now;
  const stats = titleStatsFrom(snap.docs.map((docSnap) => docSnap.data()), crownMonthOf(now));
  const ref = db.collection(TITLE_STATS_COLLECTION).doc(TITLE_STATS_DOC);
  const written = await db.runTransaction(async (tx) => {
    const stored = await tx.get(ref);
    const data = stored.exists ? stored.data() : null;
    // A newer scan already landed: ours is stale
    if (data && Number(data.countedAt) > countedAt) return false;
    if (data && sameTitleStats(data, stats)) return false;
    tx.set(ref, { ...stats, countedAt, updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
  return { players: stats.players, docs: snap.size, written };
}
