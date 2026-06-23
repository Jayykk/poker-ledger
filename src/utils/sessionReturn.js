/**
 * Session-return marker
 *
 * When a player/host opens a live table FROM a live-event session, we drop a
 * breadcrumb so the table's exit (settle / dissolve) returns to the session
 * page — where the host-side auto-advance reconciles to the next table —
 * instead of the generic lobby/report. Keyed by gameId so tables opened
 * outside any session are completely unaffected.
 */
const KEY = 'session_table_return';

/** Remember that `gameId` was opened from session `sessionId`. */
export function markSessionReturn(sessionId, gameId) {
  if (!sessionId || !gameId) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ sessionId, gameId }));
  } catch (_) { /* sessionStorage unavailable — ignore */ }
}

/**
 * If `gameId` was opened from a session, consume the marker and return the
 * session path to navigate back to; otherwise return null (caller falls back
 * to its default destination).
 */
export function consumeSessionReturn(gameId) {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const m = JSON.parse(raw);
    if (m && m.gameId === gameId && m.sessionId) {
      sessionStorage.removeItem(KEY);
      return `/session/${m.sessionId}`;
    }
  } catch (_) { /* malformed / unavailable — ignore */ }
  return null;
}
