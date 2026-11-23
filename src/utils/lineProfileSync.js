// LINE photo / name kept current. The backend copies them from LINE only when
// lineLogin runs, and a saved Firebase session skips it, so a new LINE photo
// never showed. Opened in LINE while signed in, the app compares LINE's
// profile with the account and refreshes it when they differ.

/**
 * The photo URL lineLogin stores for a LINE pictureUrl (the small CDN size).
 *
 * @param {?string} pictureUrl From liff.getProfile().
 * @return {string}
 */
export function storedPhotoOf(pictureUrl) {
  return pictureUrl ? `${pictureUrl}/small` : '';
}

/**
 * Whether the signed-in account's photo or name is behind its LINE profile.
 * Only for the LINE account of this LINE user: an email account opened in
 * LINE is left alone (lineLogin would sign in as someone else).
 *
 * @param {?object} user Firebase user ({ uid, isAnonymous, photoURL, displayName }).
 * @param {?object} profile liff.getProfile() ({ userId, pictureUrl, displayName }).
 * @return {boolean}
 */
export function lineProfileStale(user, profile) {
  if (!user || user.isAnonymous || !profile?.userId) return false;
  if (user.uid !== `line_${profile.userId}`) return false;
  const photo = storedPhotoOf(profile.pictureUrl);
  if (photo && photo !== (user.photoURL || '')) return true;
  return !!profile.displayName && profile.displayName !== (user.displayName || '');
}

/**
 * One key per LINE photo + name: a refresh is tried once per change, so a
 * refresh that doesn't take (the account keeps differing) isn't retried on
 * every launch.
 *
 * @param {object} profile liff.getProfile() result.
 * @return {string}
 */
export function lineProfileKey(profile) {
  return `${profile.userId}|${profile.pictureUrl || ''}|${profile.displayName || ''}`;
}
