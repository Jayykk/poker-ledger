import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { crownMonthOf } from '../utils/crownRules.js';
import {
  TITLE_STATS_COLLECTION, TITLE_STATS_DOC, readAtOrAfter, readTimeMillis, sameTitleStats,
  titleStatsFrom,
} from '../utils/titleStatsMath.js';
import { TITLES_COLLECTION } from './userTitles.js';

// 稱號圖鑑「幾人拿到」: recount titleStats/global from every userTitles doc
// (utils/titleStatsMath.js). Runs after each game's titles and crowns are
// written, and at the end of the backfill. Written only when a count moved.
//
// Two games finishing together recount concurrently, and the one that read
// the collection first can finish last. Each write carries the read time of
// its scan (`countedAt`: the server's Timestamp, kept to the nanosecond, since
// two scans can fall in the same millisecond) and a transaction keeps the
// newest: a scan never replaces one read at or after it (the same read time
// saw the same data).

/**
 * Recount and store the title / frame / crown counts.
 *
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @param {object} [options] `{ now }` Unix millis.
 * @return {Promise<{players: number, docs: number, written: boolean,
 *   changed: boolean}>} written: this scan is now the stored one (the
 *   newest); changed: and a count moved.
 */
export async function recountTitleStats(db, { now = Date.now() } = {}) {
  const snap = await db.collection(TITLES_COLLECTION)
    .select('unlocked', 'crowns', 'crownHistory')
    .get();
  const countedAt = snap.readTime || Timestamp.fromMillis(now);
  // The month of the data read, not of when the call began: a scan that
  // lands after the month change is judged in the new month
  const stats = titleStatsFrom(
    snap.docs.map((docSnap) => docSnap.data()),
    crownMonthOf(readTimeMillis(countedAt) ?? now),
  );
  const ref = db.collection(TITLE_STATS_COLLECTION).doc(TITLE_STATS_DOC);
  return db.runTransaction(async (tx) => {
    const stored = await tx.get(ref);
    const data = stored.exists ? stored.data() : null;
    const result = { players: stats.players, docs: snap.size, written: false, changed: false };
    // A scan read at or after ours already landed: ours adds nothing
    if (data && readAtOrAfter(data.countedAt, countedAt)) return result;
    // Written even when no count moved: the newer countedAt is what keeps a
    // scan older than this one (still running) from landing after it
    tx.set(ref, { ...stats, countedAt, updatedAt: FieldValue.serverTimestamp() });
    return { ...result, written: true, changed: !data || !sameTitleStats(data, stats) };
  });
}
