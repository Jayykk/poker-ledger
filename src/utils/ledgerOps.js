// Pure roster math for ledger games (cash / tournament bookkeeping) — kept
// Firebase-free so the buy-in / undo rules are unit-testable. The game store
// runs these inside a client Firestore transaction.

/**
 * Does this roster entry match the target? Matches by player id first, then
 * uid, then name — same precedence the old recordBuyInTx Cloud Function used,
 * so transaction logs written by either path resolve to the same seat.
 */
/**
 * Can this seat's name be changed? Only seats without an account (added by
 * hand) and guest (anonymous) logins — an account's name comes from its
 * profile.
 */
export function canRenamePlayer(player = {}) {
  return !player.uid || player.isGuest === true;
}

export function matchesPlayer(player, { targetId, targetUid, targetName } = {}) {
  if (targetId) return player.id === targetId;
  if (targetUid) return player.uid === targetUid;
  return player.name === targetName;
}

/**
 * Apply a buy-in delta and/or field edits to one player.
 *
 * buyIn is changed by delta (never overwritten) so a concurrent buy-in from
 * another device is never reverted by a stale edit form. The result is
 * clamped at 0, mirroring the old undo path.
 *
 * @param {Array} players - Current roster (not mutated)
 * @param {{targetId?: string, targetUid?: string, targetName?: string}} target
 * @param {{buyInDelta?: number, fields?: {name?: string, stack?: number}}} change
 * @returns {{players: Array, player: object}} next roster + the updated player
 * @throws {Error} 'Player not found' when no seat matches
 */
export function applyPlayerChange(players = [], target = {}, { buyInDelta = 0, fields = {} } = {}) {
  const delta = Number(buyInDelta) || 0;
  let updated = null;

  const next = players.map((p) => {
    if (updated || !matchesPlayer(p, target)) return p;
    const player = { ...p };
    for (const field of ['name', 'stack']) {
      if (Object.prototype.hasOwnProperty.call(fields, field)) {
        player[field] = fields[field];
      }
    }
    if (delta !== 0) {
      player.buyIn = Math.max(0, (Number(p.buyIn) || 0) + delta);
    }
    updated = player;
    return player;
  });

  if (!updated) throw new Error('Player not found');
  return { players: next, player: updated };
}

/**
 * Should a realtime snapshot replace what's on screen?
 *
 * Every roster write bumps the game's `rev`. After a local commit the store
 * shows the committed roster immediately, so a snapshot still carrying an
 * older rev (in flight before our write landed) must not roll the screen back.
 * Equal revs are accepted: writers that don't bump rev (legacy Cloud
 * Function, admin tools) still show up.
 */
export function isSnapshotCurrent(incomingRev, localRev) {
  return (Number(incomingRev) || 0) >= (Number(localRev) || 0);
}
