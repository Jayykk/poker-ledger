/**
 * Reading a table when its link opens: the network can drop for a moment
 * (LINE's in-app browser often reports "the client is offline" right after it
 * comes back to the front), so such a read is retried rather than sending the
 * player to the lobby at once.
 */

// One read attempt waits this long before it counts as dropped
export const LINK_READ_TIMEOUT_MS = 8000;
// Attempts before giving up (with 1.5 s, 3 s between them)
export const LINK_READ_TRIES = 3;

const TRANSIENT_CODES = new Set(['unavailable', 'deadline-exceeded']);

/**
 * Whether a failed read is the network's doing (worth retrying) rather than
 * the table's (missing, refused).
 * @param {*} err
 * @return {boolean}
 */
export function isTransientReadError(err) {
  if (!err) return false;
  if (TRANSIENT_CODES.has(err.code)) return true;
  return /client is offline|network|timed? ?out/i.test(String(err.message || ''));
}

/**
 * The promise, or a rejection with `code` once `ms` pass first.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} code Error code of the timeout rejection.
 * @return {Promise<T>}
 */
export function withTimeoutMs(promise, ms, code = 'deadline-exceeded') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Read timed out after ${ms} ms`);
      err.code = code;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * A table link that can't open goes to the lobby — often on purpose: an old
 * link in the chat is the quickest way into the app. Not reported from the
 * page: an ended table or a dropped network isn't a bug, and a read the
 * server refused is already reported by checkGameStatus ("Check game error").
 * @param {{ reason?: string }} result checkGameStatus's error result.
 * @return {string} i18n key of the toast to show.
 */
export function linkBounceMessageKey(result) {
  return result?.reason === 'ended' || result?.reason === 'missing'
    ? 'game.linkEnded'
    : 'game.linkUnreachable';
}
