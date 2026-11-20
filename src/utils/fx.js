// 簡化特效: the viewer's own switch for the moving parts of 頭像框 (rays,
// particles, orbiting lights, every animation). Stored on this device and put
// on the document root as data-fx="lite", which PlayerAvatar.vue's styles read
// (prefers-reduced-motion gets the same treatment there). Only what this
// viewer sees changes; other players still see the frames move.

const read = (storageKey) => {
  try { return localStorage.getItem(storageKey) === 'true'; } catch { return false; /* private mode */ }
};

/**
 * Is 簡化特效 on for this device?
 *
 * @param {string} storageKey STORAGE_KEYS.FX_LITE.
 * @return {boolean}
 */
export function isFxLite(storageKey) {
  return read(storageKey);
}

/**
 * Put the choice on the document root, and store it when a key is given.
 *
 * @param {boolean} lite Effects simplified?
 * @param {{storageKey?: string}} [options] Where to store it (none: don't).
 * @return {boolean} The applied value.
 */
export function applyFxLite(lite, { storageKey } = {}) {
  const on = !!lite;
  if (typeof document !== 'undefined') {
    if (on) document.documentElement.setAttribute('data-fx', 'lite');
    else document.documentElement.removeAttribute('data-fx');
  }
  if (storageKey) {
    try { localStorage.setItem(storageKey, String(on)); } catch { /* private mode */ }
  }
  return on;
}
