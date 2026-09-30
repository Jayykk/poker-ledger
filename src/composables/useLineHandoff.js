import { ref, onMounted, onBeforeUnmount } from 'vue';
import { FUNCTIONS_REGION, FIREBASE_PROJECT_ID } from '../firebase-init.js';
import {
  HANDOFF_TTL_MS,
  isStandaloneDisplay,
  channelIdFromLiffId,
  defaultCallbackUrl,
  createHandoff,
  savePendingHandoff,
  loadPendingHandoff,
  clearPendingHandoff,
} from '../utils/lineHandoff.js';

const CHANNEL_ID = import.meta.env.VITE_LINE_CHANNEL_ID
  || channelIdFromLiffId(import.meta.env.VITE_LIFF_ID);
const CALLBACK_URL = import.meta.env.VITE_LINE_LOGIN_CALLBACK_URL
  || defaultCallbackUrl(FUNCTIONS_REGION, FIREBASE_PROJECT_ID);
const POLL_INTERVAL_MS = 3000;

/**
 * LINE login for the home-screen app (see utils/lineHandoff.js). Opens LINE
 * Login, then claims the result whenever the app is visible — on return from
 * Safari/LINE, on a timer, and after a relaunch (the pending hand-off is kept
 * in localStorage).
 *
 * @param {object} opts
 * @param {Function} opts.claim  ({ state, codeVerifier }) → status string
 * @param {Function} opts.onSuccess  called once signed in
 */
export function useLineHandoff({ claim, onSuccess }) {
  const enabled = isStandaloneDisplay() && !!CHANNEL_ID;
  const waiting = ref(false);
  // '' | 'cancelled' | 'expired' | 'failed' — why the last attempt ended.
  const outcome = ref('');

  // Built ahead of the tap: window.open must run synchronously inside the
  // click handler or it is treated as a popup, and hashing the verifier is async.
  let prepared = null;
  let active = null;
  let timer = null;
  let inFlight = false;

  const prepare = async () => {
    prepared = await createHandoff({ channelId: CHANNEL_ID, callbackUrl: CALLBACK_URL });
  };

  const finish = (result) => {
    active = null;
    waiting.value = false;
    outcome.value = result;
    clearInterval(timer);
    timer = null;
    clearPendingHandoff();
  };

  const poll = async () => {
    if (!active || inFlight || document.visibilityState !== 'visible') return;
    if (Date.now() - active.createdAt > HANDOFF_TTL_MS) {
      finish('expired');
      return;
    }
    inFlight = true;
    try {
      const status = await claim({ state: active.state, codeVerifier: active.codeVerifier });
      if (status === 'pending' || !active) return;
      finish(status === 'ok' ? '' : status);
      if (status === 'ok') onSuccess();
    } finally {
      inFlight = false;
    }
  };

  const beginWaiting = (handoff) => {
    active = handoff;
    waiting.value = true;
    outcome.value = '';
    clearInterval(timer);
    timer = setInterval(poll, POLL_INTERVAL_MS);
  };

  const launch = (handoff, url) => {
    savePendingHandoff(handoff);
    beginWaiting(handoff);
    if (url) window.location.href = url;
  };

  /** Start LINE Login. Call directly from the click handler. */
  const start = () => {
    const handoff = prepared;
    prepared = null;
    if (!handoff) {
      // Not prepared yet (very fast tap) — a same-window redirect is never
      // blocked; a relaunch resumes the wait from localStorage.
      createHandoff({ channelId: CHANNEL_ID, callbackUrl: CALLBACK_URL })
        .then((h) => launch(h, h.authorizeUrl));
      return;
    }
    launch(handoff);
    // Keeps this page alive underneath (in-app browser sheet / new tab) so
    // the wait continues when the user switches back.
    const win = window.open(handoff.authorizeUrl, '_blank');
    if (!win) window.location.href = handoff.authorizeUrl;
    prepare();
  };

  const cancel = () => finish('');

  const onVisible = () => { poll(); };

  onMounted(() => {
    if (!enabled) return;
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onVisible);
    const saved = loadPendingHandoff();
    if (saved) {
      beginWaiting(saved);
      poll();
    }
    prepare();
  });

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    window.removeEventListener('pageshow', onVisible);
    clearInterval(timer);
  });

  return { enabled, waiting, outcome, start, cancel };
}
