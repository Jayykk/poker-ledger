/**
 * Send app errors to the backend (reportClientError), which files them as
 * GitHub issues in a private repo — see functions/src/handlers/clientErrors.js.
 *
 * Two kinds are sent:
 *   - uncaught: Vue render errors, unhandled rejections, window errors (main.js)
 *   - handled: anything the app catches and logs with console.error(label, err)
 *     — a failed load, a write the server refused, the client being offline.
 *     installHandledErrorReporting() hooks console.error so every existing
 *     catch block reports without being touched.
 *
 * Never throws and never blocks: the call is fire-and-forget. Per page load the
 * same error is sent once and at most MAX_PER_SESSION errors in all, and
 * browser noise or an expected refusal (wrong password, seat already taken)
 * is skipped. A report that can't be sent — the usual case when the error IS
 * the connection dropping — is kept in localStorage and sent once the device
 * is back online and signed in (only signed-in reports become issues).
 */
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChanged } from 'firebase/auth';
import { functions, auth } from '../firebase-init.js';

const MAX_PER_SESSION = 10;
const MAX_QUEUED = 10;
const QUEUE_KEY = 'poker_pending_error_reports';
const sent = new Set();
// Error objects already reported, so a logged-and-rethrown error (or the
// global handler logging what it reports) goes out once
const seen = new WeakSet();

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

// Caught and shown to the user as they should be: a wrong password, a seat
// someone else took first, a buy-in after the window closed. Not bugs.
const EXPECTED = [
  /auth\/(invalid-credential|wrong-password|user-not-found|invalid-email|email-already-in-use|weak-password|missing-password|too-many-requests|popup-closed-by-user|cancelled-popup-request|credential-already-in-use)/i,
  /Seat already taken|Already in game|Already drawn|envelope is already taken|already undone/i,
  /BUY_IN_CLOSED|REENTRY_LIMIT|已滿座/,
  /Envelopes are locked|Only the host can|Eliminator must be another player|Player is not eliminated/i,
  /Failed to copy/i,
];

// The built entry bundle (index-<hash>.js) and the commit it came from
const BUILD = `${typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'dev'}`;

/** Message + stack of anything thrown. */
function describe(err) {
  if (err instanceof Error) {
    const code = err.code && !String(err.message).includes(err.code) ? ` (${err.code})` : '';
    return { message: `${err.name}: ${err.message}${code}`, stack: err.stack || '' };
  }
  if (err && typeof err === 'object' && 'message' in err) {
    return { message: String(err.message), stack: String(err.stack || '') };
  }
  return { message: String(err), stack: '' };
}

/**
 * Whether a message / stack is noise or an expected refusal (not reported).
 * @param {string} message
 * @param {string} stack
 * @return {boolean}
 */
export function isIgnoredError(message, stack = '') {
  if (!message) return true;
  return NOISE.some((re) => re.test(message) || re.test(stack))
    || EXPECTED.some((re) => re.test(message));
}

/**
 * From console.error's arguments: the error object and the label the catch
 * block wrote before it ('Check game error:' → 'Check game error').
 * Returns null when no argument is an error (a plain string log).
 * @param {Array<*>} args
 * @return {?{ err: *, label: string }}
 */
export function caughtFromConsoleArgs(args) {
  const err = args.find((a) => a instanceof Error
    || (a && typeof a === 'object' && typeof a.message === 'string' && (a.stack || a.code)));
  if (!err) return null;
  const text = args.find((a) => typeof a === 'string');
  // Firebase's own internal log lines ("@firebase/firestore: …") — the app's
  // catch around the failing call reports the real failure
  if (text && /^@firebase\//.test(text)) return null;
  const label = (text || '').replace(/[\s:：]+$/, '').trim().slice(0, 60);
  return { err, label };
}

function readQueue() {
  try {
    const list = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeQueue(list) {
  try {
    if (list.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-MAX_QUEUED)));
    else localStorage.removeItem(QUEUE_KEY);
  } catch {
    // private mode / storage full — the report is just lost
  }
}

function enqueue(payload) {
  writeQueue([...readQueue(), { ...payload, queuedAt: Date.now() }]);
}

function deliver(payload) {
  return httpsCallable(functions, 'reportClientError')(payload);
}

/**
 * Send reports kept while offline or signed out. Safe to call any time.
 */
let flushing = false;
export async function flushQueuedErrors() {
  if (flushing || navigator.onLine === false || !auth.currentUser) return;
  const list = readQueue();
  if (!list.length) return;
  flushing = true;
  writeQueue([]);
  const failed = [];
  try {
    for (const payload of list) {
      try {
        await deliver({ ...payload, signedIn: true });
      } catch {
        failed.push(payload);
      }
    }
  } finally {
    if (failed.length) writeQueue([...failed, ...readQueue()]);
    flushing = false;
  }
}

/**
 * Report one error.
 * @param {*} err Anything thrown
 * @param {string} context Where it was caught (vue:render, window:error, caught:<label>, …)
 */
export function reportError(err, context = '') {
  try {
    if (err && typeof err === 'object') {
      if (seen.has(err)) return;
      seen.add(err);
    }
    const { message, stack } = describe(err);
    if (isIgnoredError(message, stack)) return;
    const key = `${message}|${context}`;
    if (sent.has(key) || sent.size >= MAX_PER_SESSION) return;
    sent.add(key);

    const route = window.location.hash.replace(/^#/, '').split('?')[0] || window.location.pathname;
    const online = navigator.onLine !== false;
    const signedIn = !!auth.currentUser;
    const payload = {
      message,
      stack,
      context,
      route,
      build: BUILD,
      userAgent: navigator.userAgent,
      standalone: window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true,
      inLine: /Line\//i.test(navigator.userAgent),
      online,
      signedIn,
    };
    // Offline, or not signed in yet (the server only files signed-in reports):
    // keep it for later
    if (!online || !signedIn) {
      enqueue(payload);
      return;
    }
    deliver(payload).catch(() => enqueue(payload));
  } catch {
    // reporting must never cause an error of its own
  }
}

/**
 * Report errors the app catches and logs (console.error(label, err)), and send
 * the queued ones when the device comes back online or signs in.
 */
let installed = false;
export function installHandledErrorReporting() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const original = console.error.bind(console);
  console.error = (...args) => {
    original(...args);
    try {
      const caught = caughtFromConsoleArgs(args);
      if (caught) reportError(caught.err, caught.label ? `caught:${caught.label}` : 'caught');
    } catch {
      // never break logging
    }
  };

  window.addEventListener('online', () => { flushQueuedErrors(); });
  onAuthStateChanged(auth, (user) => { if (user) flushQueuedErrors(); });
}

// Manual check after setting it up: run __reportTestError() in the console
if (typeof window !== 'undefined') {
  window.__reportTestError = () => reportError(new Error(`Test report ${new Date().toISOString()}`), 'manual-test');
}
