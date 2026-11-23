import { FieldValue } from 'firebase-admin/firestore';
import { crownMonthOf } from '../utils/crownRules.js';
import {
  TITLE_STATS_COLLECTION, TITLE_STATS_DOC, sameTitleStats, titleStatsFrom,
} from '../utils/titleStatsMath.js';
import { TITLES_COLLECTION } from './userTitles.js';

// 稱號圖鑑「幾人拿到」: recount titleStats/global from every userTitles doc
// (utils/titleStatsMath.js). Runs after each game's titles and crowns are
// written, and at the end of the backfill. Written only when a count moved.

/**
 * Recount and store the title / frame / crown counts.
 *
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @param {object} [options] `{ now }` Unix millis.
 * @return {Promise<{players: number, docs: number, written: boolean}>}
 */
export async function recountTitleStats(db, { now = Date.now() } = {}) {
  const snap = await db.collection(TITLES_COLLECTION).select('unlocked', 'crowns', 'crownHistory').get();
  const stats = titleStatsFrom(snap.docs.map((docSnap) => docSnap.data()), crownMonthOf(now));
  const ref = db.collection(TITLE_STATS_COLLECTION).doc(TITLE_STATS_DOC);
  const stored = await ref.get();
  if (stored.exists && sameTitleStats(stored.data(), stats)) {
    return { players: stats.players, docs: snap.size, written: false };
  }
  await ref.set({ ...stats, updatedAt: FieldValue.serverTimestamp() });
  return { players: stats.players, docs: snap.size, written: true };
}
