/**
 * LINE Login hand-off for the home-screen (standalone) web app.
 *
 * On iOS a home-screen web app and Safari have separate storage, and when LINE
 * Login bounces through the LINE app the OAuth redirect always lands in
 * Safari — so the app that started the login never sees the result. Instead of
 * relying on the redirect, the app starts a PKCE authorization-code flow and
 * collects the result through the backend:
 *
 *   1. The app keeps a random `state` + PKCE `code_verifier` in its own
 *      storage and opens LINE Login with redirect_uri = lineLoginCallback.
 *   2. lineLoginCallback (GET) — wherever it opens — parks the authorization
 *      code under `state` and asks the user to confirm. The confirm step
 *      (POST) stops a phished authorization link from silently handing the
 *      victim's login to whoever started it.
 *   3. When the user switches back, the app calls claimLineLoginHandoff with
 *      `state` + `code_verifier`; the backend exchanges the code (LINE checks
 *      the verifier against the challenge) and returns a Firebase custom token.
 *
 * Hand-off docs live in `lineLoginHandoffs/{state}`, are single-use, expire
 * after HANDOFF_TTL_MS (a Firestore TTL policy on `expireAt` cleans up leftovers)
 * and are unreachable from clients (denied in firestore.rules).
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { lineLogin } from './lineAuth.js';
import { FUNCTIONS_REGION } from '../utils/config.js';

export const HANDOFF_COLLECTION = 'lineLoginHandoffs';

// LINE authorization codes are valid for 10 minutes.
export const HANDOFF_TTL_MS = 10 * 60 * 1000;

const LINE_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token';

// Firestore gRPC status for create() on an existing document.
const ALREADY_EXISTS = 6;

/**
 * `state` doubles as the document id, so only accept long random url-safe ids.
 * @param {*} state Candidate state
 * @return {boolean} Whether it is well-formed
 */
export function isValidState(state) {
  return typeof state === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(state);
}

/**
 * RFC 7636 code_verifier: 43–128 unreserved characters.
 * @param {*} verifier Candidate verifier
 * @return {boolean} Whether it is well-formed
 */
export function isValidCodeVerifier(verifier) {
  return typeof verifier === 'string' && /^[A-Za-z0-9._~-]{43,128}$/.test(verifier);
}

/**
 * The redirect_uri registered in the LINE Login channel. Must match the one
 * the frontend sends to the authorize endpoint character-for-character.
 * @param {object} env Environment variables (process.env)
 * @return {string} Callback URL
 */
export function resolveCallbackUrl(env = process.env) {
  if (env.LINE_LOGIN_CALLBACK_URL) return env.LINE_LOGIN_CALLBACK_URL;
  const project = env.GCLOUD_PROJECT || env.GCP_PROJECT;
  return `https://${FUNCTIONS_REGION}-${project}.cloudfunctions.net/lineLoginCallback`;
}

/**
 * Decide what a claim should do with a hand-off document.
 * @param {object|undefined} data Hand-off document data (undefined = missing)
 * @param {number} nowMs Current time in ms
 * @return {object} Decision: { status, code?, error? }
 */
export function evaluateHandoff(data, nowMs) {
  if (!data) return { status: 'pending' };
  const expireAtMs = data.expireAt?.toMillis ? data.expireAt.toMillis() : 0;
  if (expireAtMs && nowMs > expireAtMs) return { status: 'expired' };
  if (data.error) return { status: 'cancelled', error: data.error };
  if (!data.code) return { status: 'pending' };
  if (!data.confirmed) return { status: 'pending' };
  return { status: 'ready', code: data.code };
}

/**
 * Escape text for HTML output.
 * @param {*} value Raw value
 * @return {string} Escaped text
 */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;',
  })[c]);
}

const PAGES = {
  confirm: {
    icon: '🃏',
    title: '確認登入 Poker Sync Pro',
    body: '你剛剛是在主畫面上的 Poker Sync Pro App 按了 LINE 登入嗎？按下確認後，切回那個 App 就會自動完成登入。',
    note: '如果不是你本人剛剛操作的，請直接關閉這個頁面，不要按確認。',
    en: 'Confirm to finish signing in, then switch back to the home-screen app.',
  },
  done: {
    icon: '✅',
    title: '已確認，請切回 App',
    body: '請切回主畫面上的 Poker Sync Pro App，會自動完成登入。這個頁面可以關閉了。',
    en: 'Done — switch back to the home-screen app to finish signing in.',
  },
  cancelled: {
    icon: '↩️',
    title: '已取消 LINE 登入',
    body: '請回到 App 重新按 LINE 登入。',
    en: 'LINE login was cancelled. Go back to the app and try again.',
  },
  invalid: {
    icon: '⚠️',
    title: '連結無效或已過期',
    body: '請回到 App 重新按 LINE 登入。',
    en: 'This link is invalid or has expired. Go back to the app and try again.',
  },
};

/**
 * Render one of the callback pages.
 * @param {string} kind Key of PAGES
 * @param {object} [opts] Options
 * @param {string} [opts.state] State to post back from the confirm form
 * @return {string} HTML document
 */
export function renderPage(kind, { state } = {}) {
  const page = PAGES[kind] || PAGES.invalid;
  const form = kind === 'confirm'
    ? `<form method="post">
        <input type="hidden" name="state" value="${escapeHtml(state)}">
        <button type="submit">確認登入</button>
      </form>`
    : '';
  const note = page.note ? `<p class="note">${escapeHtml(page.note)}</p>` : '';
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)}</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0f172a; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", sans-serif; }
  main { max-width: 360px; padding: 32px 24px; text-align: center; }
  .icon { font-size: 56px; }
  h1 { font-size: 22px; margin: 16px 0 12px; color: #fff; }
  p { line-height: 1.6; margin: 0 0 12px; }
  .note { font-size: 13px; color: #fbbf24; }
  .en { font-size: 12px; color: #64748b; }
  button { width: 100%; margin: 12px 0; padding: 14px; font-size: 17px; font-weight: 700; color: #fff;
    background: #06C755; border: 0; border-radius: 14px; }
</style>
</head>
<body>
<main>
  <div class="icon">${page.icon}</div>
  <h1>${escapeHtml(page.title)}</h1>
  <p>${escapeHtml(page.body)}</p>
  ${form}
  ${note}
  <p class="en">${escapeHtml(page.en)}</p>
</main>
</body>
</html>`;
}

/**
 * Send an HTML page with headers that keep it out of frames and caches and
 * keep the authorization code out of Referer headers.
 * @param {object} res Express response
 * @param {number} status HTTP status
 * @param {string} kind Key of PAGES
 * @param {object} [opts] renderPage options
 */
function sendPage(res, status, kind, opts) {
  res.set({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy':
      'default-src \'none\'; style-src \'unsafe-inline\'; form-action \'self\'; frame-ancestors \'none\'',
  });
  res.status(status).send(renderPage(kind, opts));
}

/**
 * HTTP handler for LINE Login's redirect (GET) and the confirm form (POST).
 * @param {object} req Express request
 * @param {object} res Express response
 * @param {object} deps Dependencies
 * @param {object} deps.db Firestore instance
 * @param {number} [deps.nowMs] Current time in ms
 */
export async function handleLineLoginCallback(req, res, { db, nowMs = Date.now() }) {
  if (req.method === 'POST') {
    const state = req.body?.state;
    if (!isValidState(state)) return sendPage(res, 400, 'invalid');
    const ref = db.collection(HANDOFF_COLLECTION).doc(state);
    const confirmed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const decision = evaluateHandoff(snap.exists ? snap.data() : undefined, nowMs);
      if (!snap.exists || !snap.data().code || decision.status === 'expired') return false;
      tx.update(ref, { confirmed: true, confirmedAt: FieldValue.serverTimestamp() });
      return true;
    });
    return sendPage(res, confirmed ? 200 : 400, confirmed ? 'done' : 'invalid');
  }

  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

  const { state, code, error } = req.query || {};
  if (!isValidState(state) || (!code && !error)) return sendPage(res, 400, 'invalid');

  const ref = db.collection(HANDOFF_COLLECTION).doc(state);
  const doc = {
    createdAt: FieldValue.serverTimestamp(),
    expireAt: Timestamp.fromMillis(nowMs + HANDOFF_TTL_MS),
    confirmed: false,
    ...(error ? { error: String(error).slice(0, 100) } : { code: String(code).slice(0, 512) }),
  };

  try {
    await ref.create(doc);
  } catch (err) {
    if (err.code !== ALREADY_EXISTS) throw err;
    // Reloaded page: never overwrite the parked result, just re-render it.
    const snap = await ref.get();
    const existing = snap.data() || {};
    const decision = evaluateHandoff(existing, nowMs);
    if (decision.status === 'expired') return sendPage(res, 400, 'invalid');
    if (existing.error) return sendPage(res, 200, 'cancelled');
    return sendPage(res, 200, existing.confirmed ? 'done' : 'confirm', { state });
  }

  if (error) return sendPage(res, 200, 'cancelled');
  return sendPage(res, 200, 'confirm', { state });
}

/**
 * Exchange an authorization code (+ PKCE verifier) for a LINE access token.
 * @param {object} params Parameters
 * @param {string} params.code Authorization code
 * @param {string} params.codeVerifier PKCE code_verifier
 * @param {object} [params.env] Environment variables
 * @param {Function} [params.fetchImpl] fetch implementation
 * @return {Promise<string>} LINE access token
 */
export async function exchangeLineCode({
  code, codeVerifier, env = process.env, fetchImpl = fetch,
}) {
  const clientId = env.LINE_CHANNEL_ID;
  const clientSecret = env.LINE_CHANNEL_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('LINE_CHANNEL_ID / LINE_CHANNEL_SECRET are not configured');
  }
  const res = await fetchImpl(LINE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: resolveCallbackUrl(env),
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: codeVerifier,
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE token exchange failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('LINE token response missing access_token');
  return data.access_token;
}

/**
 * Claim a hand-off: consume the parked code and sign the user in.
 * @param {object} params Parameters
 * @param {string} params.state Hand-off state
 * @param {string} params.codeVerifier PKCE code_verifier
 * @param {object} deps Dependencies
 * @param {object} deps.db Firestore instance
 * @param {number} [deps.nowMs] Current time in ms
 * @param {Function} [deps.exchange] Code → access token exchanger
 * @param {Function} [deps.login] Access token → { customToken, profile }
 * @return {Promise<object>} { status } plus customToken/profile when 'ok'
 */
export async function claimLineLoginHandoff(
  { state, codeVerifier },
  { db, nowMs = Date.now(), exchange = exchangeLineCode, login = lineLogin },
) {
  if (!isValidState(state) || !isValidCodeVerifier(codeVerifier)) {
    throw new Error('Invalid hand-off parameters');
  }
  const ref = db.collection(HANDOFF_COLLECTION).doc(state);
  const decision = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const result = evaluateHandoff(snap.exists ? snap.data() : undefined, nowMs);
    // Everything but "still waiting" is final — consume the doc (single use).
    if (snap.exists && result.status !== 'pending') tx.delete(ref);
    return result;
  });

  if (decision.status !== 'ready') return { status: decision.status };

  const accessToken = await exchange({ code: decision.code, codeVerifier });
  const { customToken, profile } = await login(accessToken);
  return { status: 'ok', customToken, profile };
}
