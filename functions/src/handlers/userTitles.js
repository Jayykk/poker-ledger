import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { buildUserTitles, resolveDisplay, validateTitlePrefs } from '../utils/titleRules.js';

// userTitles/{uid}: server-written only (firestore.rules: read signed-in,
// write false). Not on users/{uid}, which its owner can write.
export const TITLES_COLLECTION = 'userTitles';

/**
 * Re-evaluate a user's titles from their all-time stats and write the doc
 * when something changed (a new / higher tier, or a different display).
 * Called by recomputeLeaderboardStatsForUser right after the stats rewrite,
 * so the backfill script covers titles too.
 *
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @param {string} uid User.
 * @param {?object} allTimeStats leaderboardStats `all` payload (null: no games).
 * @param {number} [now=Date.now()] Unix millis for new unlocks.
 * @return {Promise<{written: boolean, unlocked: number, upgraded: number}>}
 */
export async function recomputeUserTitles(db, uid, allTimeStats, now = Date.now()) {
  const ref = db.collection(TITLES_COLLECTION).doc(uid);
  // Transaction: a setTitlePrefs landing in between must not be overwritten
  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const result = buildUserTitles(snap.exists ? snap.data() : null, allTimeStats, now);
    if (result.changed) {
      tx.set(ref, {
        uid,
        unlocked: result.unlocked,
        prefs: result.prefs,
        display: result.display,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return result;
  });
  return {
    written: next.changed,
    unlocked: Object.keys(next.unlocked).length,
    upgraded: next.upgraded.length,
  };
}

/**
 * setTitlePrefs callable: `{ mode, titleId, showRoomTitles }` (each optional).
 * A picked title must be unlocked. Writes the prefs and the display they give.
 *
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @param {string} uid Caller.
 * @param {object} data Callable payload.
 * @return {Promise<{prefs: object, display: ?object}>}
 */
export async function setTitlePrefs(db, uid, data) {
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication required');
  const ref = db.collection(TITLES_COLLECTION).doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = snap.exists ? snap.data() : {};
    const unlocked = stored.unlocked || {};
    const result = validateTitlePrefs(data, stored.prefs, unlocked);
    if (result.error) {
      throw new HttpsError(
        result.error === 'not-unlocked' ? 'failed-precondition' : 'invalid-argument',
        `TITLE_PREFS_${result.error.toUpperCase().replace(/-/g, '_')}`,
      );
    }
    const display = resolveDisplay(unlocked, result.prefs);
    tx.set(ref, {
      uid,
      unlocked,
      prefs: result.prefs,
      display,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { prefs: result.prefs, display };
  });
}
