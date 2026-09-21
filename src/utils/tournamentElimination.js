/**
 * Tournament elimination / re-entry state helpers.
 *
 * Pure functions (no Vue / Firebase) that describe how a tournament roster
 * changes when a player is eliminated, re-enters, or when either of those
 * actions is undone from the transaction log. The game store wires these into
 * Firestore transactions; keeping the state math here makes it unit-testable
 * and guarantees that "undo" is the exact inverse of the original action.
 *
 * Transaction record types handled here:
 *   - 'eliminate' — amount 0, carries a `restore` snapshot so the elimination
 *     can be reverted (placement, whether it ended the tournament, and the
 *     clock state at that moment).
 *   - 'reentry'   — amount = baseBuyIn, carries a `restore` snapshot of the
 *     eliminated state it replaced (placement / eliminatedAt) so undoing the
 *     re-entry puts the player back exactly where they were.
 */

export const TX_TYPE_ELIMINATE = 'eliminate';
export const TX_TYPE_REENTRY = 'reentry';

/** Transaction types whose undo changes a player's alive/eliminated status. */
export const STATUS_TX_TYPES = [TX_TYPE_ELIMINATE, TX_TYPE_REENTRY];

/**
 * Locate the player a transaction refers to. Newer records carry targetId;
 * older ones may only have targetUid or targetName.
 */
export function findTxTarget(players = [], tx = {}) {
  if (tx.targetId) return players.find((p) => p.id === tx.targetId) || null;
  if (tx.targetUid) return players.find((p) => p.uid === tx.targetUid) || null;
  if (tx.targetName) return players.find((p) => p.name === tx.targetName) || null;
  return null;
}

const countAlive = (players) => players.filter((p) => !p.eliminated).length;

/**
 * Eliminate a player. Placement = number of players alive before the
 * elimination (5 alive → the eliminated player finishes 5th).
 *
 * @return {{ players: Array, placement: number, aliveAfter: number }}
 */
export function applyElimination(players, playerId, now = Date.now()) {
  const target = players.find((p) => p.id === playerId);
  if (!target) throw new Error('Player not found');
  if (target.eliminated) throw new Error('Player already eliminated');

  const aliveBefore = countAlive(players);
  if (aliveBefore <= 1) throw new Error('Cannot eliminate the last remaining player');

  const placement = aliveBefore;
  const updated = players.map((p) => (
    p.id === playerId ? { ...p, eliminated: true, eliminatedAt: now, placement } : p
  ));

  return { players: updated, placement, aliveAfter: aliveBefore - 1 };
}

/** Give every surviving (non-eliminated) player placement 1. */
export function crownSurvivors(players) {
  return players.map((p) => (p.eliminated ? p : { ...p, placement: 1 }));
}

/**
 * Snapshot of the tournament clock taken right before an elimination ends the
 * tournament, so the clock can be reopened if that elimination is undone.
 */
export function snapshotSessionClock(state = {}) {
  return {
    status: state.status || 'paused',
    timeLeftSeconds: Number.isFinite(Number(state.timeLeftSeconds)) ? Number(state.timeLeftSeconds) : 0,
    currentLevelIndex: state.currentLevelIndex ?? 0,
  };
}

/** Build the `restore` payload stored on an 'eliminate' transaction. */
export function buildEliminationRestore({ placement, eliminatedAt, endedTournament = false, sessionState = null }) {
  return {
    placement: placement ?? null,
    eliminatedAt: eliminatedAt ?? null,
    endedTournament: !!endedTournament,
    sessionState: endedTournament && sessionState ? snapshotSessionClock(sessionState) : null,
  };
}

/** Build the `restore` payload stored on a 'reentry' transaction. */
export function buildReentryRestore(player = {}) {
  return {
    placement: player.placement ?? null,
    eliminatedAt: player.eliminatedAt ?? null,
  };
}

/**
 * Undo an elimination: the player returns to play with no placement. If the
 * elimination had ended the tournament (auto-crowned the last survivor), the
 * provisional champion placement is cleared too.
 *
 * @return {{ players: Array, aliveAfter: number, reopensTournament: boolean }}
 */
export function revertElimination(players, tx) {
  const target = findTxTarget(players, tx);
  if (!target) throw new Error('Player not found');
  if (!target.eliminated) throw new Error('Player is not eliminated');

  const restore = tx.restore || {};
  const reopensTournament = !!restore.endedTournament;

  const updated = players.map((p) => {
    if (p.id === target.id) {
      return { ...p, eliminated: false, eliminatedAt: null, placement: null };
    }
    if (reopensTournament && !p.eliminated && p.placement === 1) {
      return { ...p, placement: null };
    }
    return p;
  });

  return { players: updated, aliveAfter: countAlive(updated), reopensTournament };
}

/**
 * Session (clock) fields to write when an elimination that ended the
 * tournament is undone. A clock that was running is reopened as paused so the
 * host resumes it deliberately; nothing else about the level is touched.
 */
export function buildReopenedSessionUpdates(sessionState = null) {
  const snap = snapshotSessionClock(sessionState || {});
  return {
    'state.status': snap.status === 'running' || snap.status === 'ended' ? 'paused' : snap.status,
    'state.timeLeftSeconds': snap.timeLeftSeconds,
    'state.lastTickAt': null,
  };
}

/**
 * Undo a re-entry: refund the re-entry buy-in and put the player back into
 * the eliminated state recorded on the transaction. Older re-entry records
 * without a snapshot fall back to "eliminated now, placement = alive count".
 *
 * @return {{ players: Array, aliveAfter: number, refunded: number }}
 */
export function revertReentry(players, tx, now = Date.now()) {
  const target = findTxTarget(players, tx);
  if (!target) throw new Error('Player not found');
  if (target.eliminated) throw new Error('Player is already eliminated');

  const refunded = Math.abs(Number(tx.amount) || 0);
  const restore = tx.restore || {};
  const placement = restore.placement ?? countAlive(players);
  const eliminatedAt = restore.eliminatedAt ?? now;

  const updated = players.map((p) => (
    p.id === target.id
      ? {
        ...p,
        buyIn: Math.max(0, (p.buyIn || 0) - refunded),
        eliminated: true,
        eliminatedAt,
        placement,
      }
      : p
  ));

  return { players: updated, aliveAfter: countAlive(updated), refunded };
}

const txTargetKey = (tx) => tx.targetId || tx.targetUid || tx.targetName || null;
const txMillis = (ts) => {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  return new Date(ts).getTime() || 0;
};

/**
 * Status-changing records (eliminate / reentry) must be undone newest-first:
 * only the latest active one per player is undoable. Returns a Set of txIds
 * that are currently undoable under that rule.
 */
export function latestStatusTxIds(transactions = []) {
  const latest = new Map();
  for (const tx of transactions) {
    if (tx.status !== 'active' || !STATUS_TX_TYPES.includes(tx.type)) continue;
    const key = txTargetKey(tx);
    if (!key) continue;
    const ts = txMillis(tx.timestamp);
    const prev = latest.get(key);
    if (!prev || ts > prev.ts) latest.set(key, { ts, txId: tx.txId });
  }
  return new Set([...latest.values()].map((v) => v.txId));
}
