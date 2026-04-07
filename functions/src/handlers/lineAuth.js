/**
 * LINE Auth handler for Cloud Functions
 * Verifies LINE access token and issues Firebase Custom Token
 */
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const LINE_PROFILE_URL = 'https://api.line.me/v2/profile';
const LINE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';

/**
 * Verify a LINE access token by calling the LINE Profile API,
 * then create or update the Firebase user and return a custom token.
 *
 * @param {string} accessToken - LINE access token from LIFF
 * @return {{ customToken: string, profile: object }}
 */
export async function lineLogin(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') {
    throw new Error('Missing or invalid LINE access token');
  }

  // 1a. Verify the token belongs to our channel (if LINE_CHANNEL_ID is set)
  const channelId = process.env.LINE_CHANNEL_ID;
  if (channelId) {
    const verifyRes = await fetch(`${LINE_VERIFY_URL}?access_token=${encodeURIComponent(accessToken)}`);
    if (!verifyRes.ok) {
      throw new Error(`LINE token verify failed (${verifyRes.status})`);
    }
    const verifyData = await verifyRes.json();
    if (String(verifyData.client_id) !== String(channelId)) {
      throw new Error('LINE token was not issued for this channel');
    }
  }

  // 1b. Fetch LINE profile
  const res = await fetch(LINE_PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE token verification failed (${res.status}): ${body}`);
  }

  const profile = await res.json();
  const { userId, displayName, pictureUrl } = profile;

  if (!userId) {
    throw new Error('LINE profile missing userId');
  }

  // Use the small-size CDN image for avatar to reduce bandwidth
  const smallPictureUrl = pictureUrl ? `${pictureUrl}/small` : '';

  // 2. Derive a stable Firebase UID from the LINE userId
  const firebaseUid = `line_${userId}`;

  // 3. Create / update the Firebase Auth user
  const auth = getAuth();
  try {
    await auth.updateUser(firebaseUid, {
      displayName,
      photoURL: smallPictureUrl || undefined,
    });
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      await auth.createUser({
        uid: firebaseUid,
        displayName,
        photoURL: smallPictureUrl || undefined,
      });
    } else {
      throw err;
    }
  }

  // 4. Upsert Firestore user document
  const db = getFirestore();
  const userRef = db.collection('users').doc(firebaseUid);
  await userRef.set(
    {
      name: displayName,
      avatarUrl: smallPictureUrl,
      lineUserId: userId,
      authProvider: 'line',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // Ensure createdAt and lineNotifyEnabled only on first write
  const snap = await userRef.get();
  if (!snap.data()?.createdAt) {
    await userRef.update({
      createdAt: FieldValue.serverTimestamp(),
      lineNotifyEnabled: true,
    });
  }

  // 5. Mint a Firebase custom token
  const customToken = await auth.createCustomToken(firebaseUid);

  return { customToken, profile: { userId, displayName, pictureUrl: smallPictureUrl } };
}
