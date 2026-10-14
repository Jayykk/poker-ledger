// 補記手牌: a player of a finished game records a hand afterwards (from the
// game's settlement detail). Who and until when — mirrored in firestore.rules
// (games/{gameId}/hands create), so keep the two in step:
//   - the game is completed
//   - the viewer's uid is on its roster (games/{gameId}.players[].uid): a
//     participant with an account, not a guest, not an outsider
//   - less than BACKFILL_WINDOW_DAYS since it finished: completedAt, or when a
//     game has none, updatedAt, else createdAt
// The rules can't search the roster (a list of maps), so a hand recorded
// afterwards names the recorder's roster slot (`recorderIndex`) and the rules
// check that one slot. Hands recorded afterwards carry recordedBy +
// recordedAfter; the hands trigger (functions: onGameHandWrite) brings the
// players' hand titles up to date.

export const BACKFILL_WINDOW_DAYS = 7;
export const BACKFILL_WINDOW_MS = BACKFILL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Millis of a stored time the way the rules read it: a Timestamp (or Date)
 * or a number; anything else is no time.
 *
 * @param {*} value Stored value.
 * @return {?number}
 */
function millisOf(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return null;
}

/**
 * When the game finished, for the window: the first of completedAt /
 * updatedAt / createdAt that is set (as the rules pick it).
 *
 * @param {?object} game games/{gameId} data.
 * @return {?number} Unix millis, null when the field set holds no time.
 */
export function gameFinishedMillis(game) {
  const field = ['completedAt', 'updatedAt', 'createdAt'].find((key) => game?.[key] != null);
  return field ? millisOf(game[field]) : null;
}

/**
 * The viewer's slot on the roster (first one with their uid), -1 when none.
 *
 * @param {?object} game games/{gameId} data.
 * @param {?string} uid Viewer.
 * @return {number}
 */
export function rosterIndexOf(game, uid) {
  if (!uid || !Array.isArray(game?.players)) return -1;
  return game.players.findIndex((p) => p && p.uid === uid);
}

/**
 * May this viewer record a hand for this finished game now?
 *
 * @param {?object} game games/{gameId} data.
 * @param {?string} uid Viewer.
 * @param {number} [now=Date.now()] Unix millis.
 * @return {boolean}
 */
export function canRecordHandAfter(game, uid, now = Date.now()) {
  if (!game || game.status !== 'completed') return false;
  if (rosterIndexOf(game, uid) < 0) return false;
  const finished = gameFinishedMillis(game);
  return finished != null && now < finished + BACKFILL_WINDOW_MS;
}

/**
 * The fields a hand recorded afterwards carries (the rules check them).
 *
 * @param {object} game games/{gameId} data.
 * @param {string} uid Recorder.
 * @return {{recordedBy: string, recordedAfter: true, recorderIndex: number}}
 */
export function backfillHandFields(game, uid) {
  return { recordedBy: uid, recordedAfter: true, recorderIndex: rosterIndexOf(game, uid) };
}
