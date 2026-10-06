import { FieldValue } from 'firebase-admin/firestore';
import { crownMonthOf, heldCrowns } from '../utils/crownRules.js';
import { statsDocId } from '../utils/leaderboardStatsMath.js';
import { buildCrownUpdate } from '../utils/titleRules.js';
import { TITLES_COLLECTION } from './userTitles.js';

// 本月王座: re-judge the monthly crowns after a game (utils/crownRules.js for
// the rules, utils/titleRules.js buildCrownUpdate for the doc).
//
// Who can move: the game's players (their month stats changed) and everyone in
// their 牌友圈 (a pal's crown can be taken or tied). Judging any of those needs
// their own pals' month stats too, so the reads are:
//   userTitles of the players, then of their pals not read yet (pals lists)
//   leaderboardStats/{uid}_{month} of everyone judged and their pals, once
// all in db.getAll batches. Only docs whose crowns / history / display change
// are written, each in a small transaction so a setTitlePrefs in between is
// not overwritten.
//
// Notifications when a crown is lost: none. The app has no server-side push
// (no FCM tokens or messaging helper; its notifications are in-app only), so
// losses are only counted in the summary.

const STATS_COLLECTION = 'leaderboardStats';
// db.getAll takes any number of refs; keep each call a sane size
const GET_ALL_CHUNK = 300;

/**
 * Read docs in getAll batches.
 *
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @param {Array<FirebaseFirestore.DocumentReference>} refs Docs.
 * @return {Promise<Array<?object>>} Data per ref (null when missing).
 */
async function readAll(db, refs) {
  const out = [];
  for (let i = 0; i < refs.length; i += GET_ALL_CHUNK) {
    const snaps = await db.getAll(...refs.slice(i, i + GET_ALL_CHUNK));
    for (const snap of snaps) out.push(snap.exists ? snap.data() : null);
  }
  return out;
}

/**
 * userTitles docs into the map (uids already there are skipped).
 *
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @param {Array<string>} uids Users.
 * @param {Map<string, ?object>} into uid → doc data.
 * @return {Promise<void>}
 */
async function readTitleDocs(db, uids, into) {
  const missing = [...new Set(uids)].filter((uid) => !into.has(uid));
  const data = await readAll(db, missing.map((uid) => db.collection(TITLES_COLLECTION).doc(uid)));
  missing.forEach((uid, i) => into.set(uid, data[i]));
}

/**
 * Write one user's crown update, re-reading the doc in a transaction.
 *
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @param {string} uid User.
 * @param {Array<[string, Array<string>]>} verdicts [month, held] pairs.
 * @param {string} currentMonth Current month key.
 * @param {object} options buildCrownUpdate options.
 * @return {Promise<?object>} The update written, null when nothing changed.
 */
async function writeCrownUpdate(db, uid, verdicts, currentMonth, options) {
  const ref = db.collection(TITLES_COLLECTION).doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = snap.exists ? snap.data() : null;
    const update = buildCrownUpdate(stored, verdicts, currentMonth, options);
    if (!update.changed) return null;
    const data = {
      uid,
      crowns: update.crowns,
      crownHistory: update.crownHistory,
      display: update.display,
      updatedAt: FieldValue.serverTimestamp(),
    };
    // Each listed map replaced whole (a crown lost must go); the rest stays
    tx.set(ref, data, { mergeFields: Object.keys(data) });
    return update;
  });
}

/**
 * Judge every user of `judged` for each month against their pals and write
 * the changes.
 *
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @param {Array<string>} judged Users with a pals list.
 * @param {Map<string, ?object>} titleDocs uid → userTitles data.
 * @param {Map<string, Map<string, ?object>>} statsByMonth month → uid → stats.
 * @param {string} currentMonth Current month key.
 * @param {object} [options] buildCrownUpdate options.
 * @return {Promise<object>} Summary.
 */
async function judgeAndWrite(db, judged, titleDocs, statsByMonth, currentMonth, options = {}) {
  const summary = { evaluated: 0, written: 0, gained: 0, lost: [] };
  for (const uid of judged) {
    const pals = titleDocs.get(uid).pals;
    const verdicts = [...statsByMonth.entries()].map(([month, stats]) => [
      month,
      heldCrowns(stats.get(uid) || null, pals.map((pal) => stats.get(pal) || null)),
    ]);
    summary.evaluated += 1;
    // Cheap check on the doc already read; the write re-reads it
    if (!buildCrownUpdate(titleDocs.get(uid), verdicts, currentMonth, options).changed) continue;
    const update = await writeCrownUpdate(db, uid, verdicts, currentMonth, options);
    if (!update) continue;
    summary.written += 1;
    summary.gained += update.gained.length;
    for (const crownId of update.lost) summary.lost.push({ uid, crownId });
  }
  return summary;
}

/**
 * Re-judge the crowns of these users and their pals for the given months
 * (the game's month and the current one). Months after the current one are
 * ignored. Users whose userTitles has no pals list yet (no recompute since
 * pals existed) are not judged: the backfill or their next game does it.
 *
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @param {Array<string>} uids The game's players.
 * @param {Array<string>} months Month keys.
 * @param {object} [options] `{ now }` Unix millis.
 * @return {Promise<{evaluated: number, written: number, gained: number,
 *   lost: Array<{uid: string, crownId: string}>, reads: number}>}
 */
export async function recomputeMonthlyCrowns(db, uids, months, { now = Date.now() } = {}) {
  const currentMonth = crownMonthOf(now);
  const monthList = [...new Set((months || []).filter((m) => typeof m === 'string' && m && m <= currentMonth))].sort();
  const seeds = [...new Set((uids || []).filter((uid) => typeof uid === 'string' && uid))];
  if (!seeds.length || !monthList.length) {
    return { evaluated: 0, written: 0, gained: 0, lost: [], reads: 0 };
  }

  const titleDocs = new Map();
  await readTitleDocs(db, seeds, titleDocs);
  const palsOf = (uid) => {
    const pals = titleDocs.get(uid)?.pals;
    return Array.isArray(pals) ? pals : null;
  };
  const circle = new Set(seeds);
  for (const uid of seeds) for (const pal of palsOf(uid) || []) circle.add(pal);
  await readTitleDocs(db, [...circle], titleDocs);

  const judged = [...circle].filter((uid) => palsOf(uid)).sort();
  const needed = new Set(judged);
  for (const uid of judged) for (const pal of palsOf(uid)) needed.add(pal);
  const neededIds = [...needed];

  const statsByMonth = new Map();
  for (const month of monthList) {
    const refs = neededIds.map((uid) => db.collection(STATS_COLLECTION)
      .doc(statsDocId(uid, month)));
    const data = await readAll(db, refs);
    statsByMonth.set(month, new Map(neededIds.map((uid, i) => [uid, data[i]])));
  }

  const summary = await judgeAndWrite(db, judged, titleDocs, statsByMonth, currentMonth);
  // Doc reads: the userTitles, the month stats, one re-read per write
  const reads = titleDocs.size + neededIds.length * monthList.length + summary.written;
  return { ...summary, reads };
}

/**
 * Backfill --crown-history: replay every month in leaderboardStats for every
 * user with a pals list and set crowns + crownHistory from scratch
 * (idempotent). Past months are judged with today's pals: an approximation,
 * the circle back then is not stored.
 *
 * @param {FirebaseFirestore.Firestore} db Firestore instance.
 * @param {object} [options] `{ now }` Unix millis.
 * @return {Promise<{evaluated: number, written: number, months: number}>}
 */
export async function rebuildCrownHistory(db, { now = Date.now() } = {}) {
  const currentMonth = crownMonthOf(now);
  const titlesSnap = await db.collection(TITLES_COLLECTION).get();
  const titleDocs = new Map(titlesSnap.docs.map((docSnap) => [docSnap.id, docSnap.data()]));
  const judged = [...titleDocs.keys()]
    .filter((uid) => Array.isArray(titleDocs.get(uid)?.pals))
    .sort();

  const statsSnap = await db.collection(STATS_COLLECTION).where('periodType', '==', 'month').get();
  const statsByMonth = new Map();
  for (const docSnap of statsSnap.docs) {
    const data = docSnap.data();
    if (typeof data.period !== 'string' || data.period > currentMonth) continue;
    if (!statsByMonth.has(data.period)) statsByMonth.set(data.period, new Map());
    statsByMonth.get(data.period).set(data.uid, data);
  }

  const summary = await judgeAndWrite(
    db, judged, titleDocs, statsByMonth, currentMonth, { fromScratch: true },
  );
  return { evaluated: summary.evaluated, written: summary.written, months: statsByMonth.size };
}
