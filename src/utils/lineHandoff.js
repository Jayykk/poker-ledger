/**
 * LINE Login hand-off for the home-screen (standalone) web app — client side.
 *
 * iOS keeps a home-screen web app's storage separate from Safari, and LINE
 * Login's redirect lands in Safari once it has bounced through the LINE app, so
 * the usual liff.login() redirect never reaches the app. Instead the app runs a
 * PKCE flow whose callback is a Cloud Function; the app keeps state + verifier
 * here and claims the result from the backend when the user switches back.
 * See functions/src/handlers/lineLoginHandoff.js for the server half.
 */

const STORAGE_KEY = 'line_login_handoff';
const LINE_AUTHORIZE_URL = 'https://access.line.me/oauth2/v2.1/authorize';

// Matches the backend's hand-off lifetime (LINE codes live 10 minutes).
export const HANDOFF_TTL_MS = 10 * 60 * 1000;

/** True when running as an installed home-screen app (iOS or Android). */
export function isStandaloneDisplay(win = globalThis.window) {
  if (!win) return false;
  return win.navigator?.standalone === true ||
    !!win.matchMedia?.('(display-mode: standalone)').matches;
}

/** A LIFF ID is "<channelId>-<suffix>"; the LINE Login channel id is the prefix. */
export function channelIdFromLiffId(liffId) {
  const match = /^(\d+)-/.exec(liffId || '');
  return match ? match[1] : '';
}

/** Default redirect_uri — must equal the backend's resolveCallbackUrl(). */
export function defaultCallbackUrl(region, projectId) {
  return `https://${region}-${projectId}.cloudfunctions.net/lineLoginCallback`;
}

const base64Url = (bytes) => btoa(String.fromCharCode(...bytes))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const randomToken = (byteLength) => base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));

/** PKCE S256 challenge for a verifier. */
export async function codeChallengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/**
 * Create a fresh hand-off: random state + verifier (32 bytes → 43 chars each)
 * and the LINE authorize URL that carries the matching challenge.
 */
export async function createHandoff({ channelId, callbackUrl, nowMs = Date.now() }) {
  const state = randomToken(32);
  const codeVerifier = randomToken(32);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: channelId,
    redirect_uri: callbackUrl,
    state,
    scope: 'profile',
    code_challenge: await codeChallengeFor(codeVerifier),
    code_challenge_method: 'S256',
  });
  return {
    state,
    codeVerifier,
    createdAt: nowMs,
    authorizeUrl: `${LINE_AUTHORIZE_URL}?${params}`,
  };
}

/** Persist the hand-off we are waiting on (state + verifier only). */
export function savePendingHandoff({ state, codeVerifier, createdAt }, storage = localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ state, codeVerifier, createdAt }));
  } catch { /* storage unavailable — the in-memory copy still works this session */ }
}

/** The hand-off still worth claiming, or null (expired ones are discarded). */
export function loadPendingHandoff(storage = localStorage, nowMs = Date.now()) {
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    if (saved?.state && saved?.codeVerifier && nowMs - saved.createdAt < HANDOFF_TTL_MS) return saved;
    if (saved) storage.removeItem(STORAGE_KEY);
  } catch { /* corrupt or unavailable storage */ }
  return null;
}

export function clearPendingHandoff(storage = localStorage) {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}
