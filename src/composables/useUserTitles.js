// 稱號: read userTitles/{uid} docs (server-written, see
// functions/src/handlers/userTitles.js) and save your own display prefs.
//
// One module-wide cache shared by every badge: each uid is fetched once with
// getDoc (refetched after CACHE_TTL_MS), so a leaderboard or a room with ten
// players costs ten reads, not ten per render. Your own doc is live
// (onSnapshot) while a page watches it, so a new title or a prefs change shows
// up at once.
import { reactive } from 'vue';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase-init.js';
import { normalizeTitlePrefs } from '../utils/titles.js';

const COLLECTION = 'userTitles';
const CACHE_TTL_MS = 5 * 60 * 1000;

// uid → { unlocked, prefs, display } (an empty entry when the user has no doc)
const cache = reactive({});
const fetchedAt = new Map();
const inFlight = new Map();
let mine = { uid: null, unsubscribe: null, watchers: 0 };

const toEntry = (data) => ({
  unlocked: data?.unlocked || {},
  prefs: normalizeTitlePrefs(data?.prefs),
  display: data?.display || null,
});

async function fetchOne(uid) {
  if (inFlight.has(uid)) return inFlight.get(uid);
  const task = getDoc(doc(db, COLLECTION, uid))
    .then((snap) => {
      cache[uid] = toEntry(snap.exists() ? snap.data() : null);
      fetchedAt.set(uid, Date.now());
    })
    .catch((error) => {
      // A badge that can't load just doesn't show; try again next time
      console.warn('[titles] load failed', uid, error?.code || error);
    })
    .finally(() => inFlight.delete(uid));
  inFlight.set(uid, task);
  return task;
}

/**
 * Make sure these users' titles are loaded (cached; no-op for fresh ones).
 * @param {Array<string>|string} uids
 * @return {Promise<void>}
 */
export function ensureUserTitles(uids) {
  const list = [...new Set([].concat(uids || []).filter((uid) => typeof uid === 'string' && uid))];
  const now = Date.now();
  const stale = list.filter((uid) => {
    if (uid === mine.uid && mine.unsubscribe) return false; // live already
    return !fetchedAt.has(uid) || now - fetchedAt.get(uid) > CACHE_TTL_MS;
  });
  return Promise.all(stale.map(fetchOne)).then(() => {});
}

/** The title a user shows to others ({ familyId, tier }) or null. */
export function titleDisplayOf(uid) {
  return (uid && cache[uid]?.display) || null;
}

/**
 * Follow your own userTitles doc live. Returns a stop function; the listener
 * closes when the last watcher stops.
 * @param {string} uid
 * @return {function(): void}
 */
export function watchMyTitles(uid) {
  if (!uid) return () => {};
  if (mine.uid !== uid) {
    mine.unsubscribe?.();
    mine = { uid, unsubscribe: null, watchers: 0 };
  }
  mine.watchers += 1;
  if (!mine.unsubscribe) {
    mine.unsubscribe = onSnapshot(
      doc(db, COLLECTION, uid),
      (snap) => {
        cache[uid] = toEntry(snap.exists() ? snap.data() : null);
        fetchedAt.set(uid, Date.now());
      },
      (error) => console.warn('[titles] watch failed', error?.code || error),
    );
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    mine.watchers -= 1;
    if (mine.watchers <= 0 && mine.uid === uid) {
      mine.unsubscribe?.();
      mine = { uid: null, unsubscribe: null, watchers: 0 };
    }
  };
}

/**
 * Save your display prefs through the setTitlePrefs callable (userTitles is
 * not client-writable). Any of { mode, titleId, showRoomTitles }.
 * @param {string} uid Your uid (to update the cache right away).
 * @param {object} prefs
 * @return {Promise<{prefs: object, display: ?object}>}
 */
export async function saveTitlePrefs(uid, prefs) {
  const call = httpsCallable(functions, 'setTitlePrefs');
  const result = await call(prefs);
  const data = result.data || {};
  if (uid) {
    const current = cache[uid] || toEntry(null);
    cache[uid] = { ...current, prefs: normalizeTitlePrefs(data.prefs), display: data.display || null };
  }
  return data;
}

export function useUserTitles() {
  return {
    titles: cache,
    ensureUserTitles,
    titleDisplayOf,
    watchMyTitles,
    saveTitlePrefs,
  };
}
