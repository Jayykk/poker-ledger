import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { buildUserTitles, resolveDisplay, validateTitlePrefs } from '../utils/titleRules.js';

// userTitles/{uid}: server-written only (firestore.rules: read signed-in,
// write false). Not on users/{uid}, which its owner can write.
export const TITLES_COLLECTION = 'userTitles';

/**
 * The public bits of users/{uid} that every name in the app shows: the LINE
 * photo and the name. Copied here so a viewer gets avatar + title + frame in
 * the one read they already make (users/{uid} also holds email / LINE ids).
 *
 * @param {?object} userData users/{uid} data.
 * @return {{avatar: ?string, name: ?string}}
 */
export function publicProfileOf(userData) {
  return {
    avatar: userData?.avatarUrl || null,
    name: userData?.name || userData?.displayName || null,
  };
}

/**
 * @param {?object} stored userTitles doc.
 * @param {{avatar: ?string, name: ?string}} profile publicProfileOf() result.
 * @return {boolean}
 */
function sameProfile(stored, profile) {
  return (stored?.avatar || null) === profile.avatar && (stored?.name || null) === profile.name;
}

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
 * @param {object} [options] `{ rebuild }` (see buildUserTitles) and
 *   `profile` (publicProfileOf the users doc: kept in sync here too, so the
 *   backfill fills every avatar; someone with a photo and no titles yet still
 *   gets a doc).
 * @return {Promise<{written: boolean, unlocked: number, upgraded: number}>}
 */
export async function recomputeUserTitles(db, uid, allTimeStats, now = Date.now(), options = {}) {
  const { profile = null, ...buildOptions } = options;
  const ref = db.collection(TITLES_COLLECTION).doc(uid);
  // Transaction: a setTitlePrefs landing in between must not be overwritten
  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = snap.exists ? snap.data() : null;
    const result = buildUserTitles(stored, allTimeStats, now, buildOptions);
    // A photo alone is worth a doc; a name alone isn't
    const profileChanged = !!profile && !sameProfile(stored, profile)
      && (!!stored || !!profile.avatar);
    const written = result.changed || profileChanged;
    if (written) {
      const data = {
        uid,
        unlocked: result.unlocked,
        prefs: result.prefs,
        display: result.display,
        ...(profile || {}),
        updatedAt: FieldValue.serverTimestamp(),
      };
      // mergeFields: each listed field is replaced whole (a rebuild can drop
      // unlocked entries), anything else on the doc (the profile when none is
      // given) stays
      tx.set(ref, data, { mergeFields: Object.keys(data) });
    }
    return { ...result, written };
  });
  return {
    written: next.written,
    unlocked: Object.keys(next.unlocked).length,
    upgraded: next.upgraded.length,
  };
}

/**
 * users/{uid} written: copy a changed photo / name into userTitles so it shows
 * everywhere at once instead of after the user's next game.
 *
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @param {string} uid User.
 * @param {?object} before users doc before the write.
 * @param {?object} after users doc after the write (null: deleted).
 * @return {Promise<boolean>} Whether userTitles was written.
 */
export async function syncPublicProfile(db, uid, before, after) {
  if (!after) return false;
  const profile = publicProfileOf(after);
  if (before && sameProfile(publicProfileOf(before), profile)) return false;
  const ref = db.collection(TITLES_COLLECTION).doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = snap.exists ? snap.data() : null;
    // Nothing to show yet: no doc needed
    if (sameProfile(stored, profile) || (!stored && !profile.avatar)) return false;
    tx.set(ref, { uid, ...profile, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
}

/**
 * setTitlePrefs callable: `{ mode, titleId, showRoomTitles, frame }` (each
 * optional). A picked title must be unlocked and a picked frame earned
 * (failed-precondition otherwise). Writes the prefs and the display they give
 * (title + frame).
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
        ['not-unlocked', 'frame-locked'].includes(result.error) ? 'failed-precondition' : 'invalid-argument',
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
