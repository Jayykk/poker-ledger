/**
 * Send uncaught errors to the backend (reportClientError), which files them as
 * GitHub issues in a private repo — see functions/src/handlers/clientErrors.js.
 *
 * Never throws and never blocks: the call is fire-and-forget. Per page load the
 * same error is sent once and at most MAX_PER_SESSION errors in all, and
 * browser noise that isn't a bug of ours is skipped.
 */
import { httpsCallable } from 'firebase/functions';
import { functions, auth } from '../firebase-init.js';

const MAX_PER_SESSION = 10;
const sent = new Set();

// Not bugs of ours: browser / extension noise, a share sheet the user closed,
// a request cut off by leaving the page
const NOISE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /AbortError/i,
  /The user aborted a request/i,
  /Share canceled|NotAllowedError/i,
  /chrome-extension:|moz-extension:|safari-extension:/i,
];

// The built entry bundle (index-<hash>.js) and the commit it came from
const BUILD = `${typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'dev'}`;

/** Message + stack of anything thrown. */
function describe(err) {
  if (err instanceof Error) return { message: `${err.name}: ${err.message}`, stack: err.stack || '' };
  if (err && typeof err === 'object' && 'message' in err) {
    return { message: String(err.message), stack: String(err.stack || '') };
  }
  return { message: String(err), stack: '' };
}

/**
 * Report one error.
 * @param {*} err Anything thrown
 * @param {string} context Where it was caught (vue:render, window:error, …)
 */
export function reportError(err, context = '') {
  try {
    const { message, stack } = describe(err);
    if (!message || NOISE.some((re) => re.test(message) || re.test(stack))) return;
    const key = `${message}|${context}`;
    if (sent.has(key) || sent.size >= MAX_PER_SESSION) return;
    sent.add(key);

    const route = window.location.hash.replace(/^#/, '').split('?')[0] || window.location.pathname;
    const payload = {
      message,
      stack,
      context,
      route,
      build: BUILD,
      userAgent: navigator.userAgent,
      standalone: window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true,
      inLine: /Line\//i.test(navigator.userAgent),
      online: navigator.onLine !== false,
      signedIn: !!auth.currentUser,
    };
    httpsCallable(functions, 'reportClientError')(payload).catch(() => {});
  } catch {
    // reporting must never cause an error of its own
  }
}

// Manual check after setting it up: run __reportTestError() in the console
if (typeof window !== 'undefined') {
  window.__reportTestError = () => reportError(new Error(`Test report ${new Date().toISOString()}`), 'manual-test');
}
