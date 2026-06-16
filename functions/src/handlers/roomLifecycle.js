/**
 * Room lifecycle helpers — shared close/settlement logic used by BOTH the
 * per-room Cloud Task (handleRoomAutoClose) and the periodic sweep
 * (handleRoomSweep). Keeping a single implementation prevents the two paths
 * from drifting apart.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { ROOM_IDLE_TIMEOUT_SECONDS } from '../utils/config.js';

const DEFAULT_BUY_IN = 1000;

/**
 * Resolve a Firestore Timestamp-ish value to milliseconds, or null.
 * @param {*} ts - Firestore Timestamp, {seconds}, or null
 * @return {?number}
 */
function toMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return null;
}

/**
 * Count seats that are occupied (seat !== null), regardless of chip count.
 * @param {Object} game
 * @return {number}
 */
export function countSeatedPlayers(game) {
  return Object.values(game?.seats || {}).filter((seat) => seat !== null).length;
}

/**
 * Pure decision: should this room be auto-closed now?
 *
 * Two independent triggers, both gated on idle time so we never close a room
 * that is actively being used (every state-changing action bumps
 * meta.lastActivityAt):
 *   - idle_timeout:  no activity for >= idleTimeoutSeconds.
 *   - abandoned:     only 0 or 1 seated player AND idle for >= idleTimeoutSeconds
 *                    ("someone is just squatting an otherwise empty table").
 *
 * @param {Object} game - pokerGames doc data
 * @param {number} nowMs - current time in ms
 * @param {Object} [opts]
 * @param {number} [opts.idleTimeoutSeconds] - idle threshold (default: config)
 * @return {{ close: boolean, reason: ?string, idleSeconds: number }}
 */
export function evaluateRoomClose(game, nowMs, opts = {}) {
  const idleTimeoutSeconds = opts.idleTimeoutSeconds ?? ROOM_IDLE_TIMEOUT_SECONDS;

  if (!game || game.status === 'closed' || game.status === 'completed') {
    return { close: false, reason: null, idleSeconds: 0 };
  }

  const lastActivityMs = toMillis(game?.meta?.lastActivityAt);
  // Missing lastActivityAt → treat as fully idle (conservative: lets the sweep
  // reclaim legacy rooms created before lastActivityAt was tracked).
  const idleSeconds = lastActivityMs ?
    Math.floor((nowMs - lastActivityMs) / 1000) :
    idleTimeoutSeconds;

  if (idleSeconds < idleTimeoutSeconds) {
    return { close: false, reason: null, idleSeconds };
  }

  // Idle long enough. Distinguish "everyone left / squatting" from a normal
  // idle table purely for the audit trail (closedReason).
  const reason = countSeatedPlayers(game) <= 1 ? 'abandoned' : 'idle_timeout';
  return { close: true, reason, idleSeconds };
}

/**
 * Build the per-player settlement rows for a room close.
 * @param {Object} game
 * @return {Array<{odId:string,name:string,buyIn:number,stack:number,profit:number}>}
 */
export function buildSettlement(game) {
  const seatedPlayers = Object.values(game?.seats || {}).filter((s) => s !== null);
  return seatedPlayers.map((p) => {
    const initialBuyIn = p.initialBuyIn || game.meta?.minBuyIn || DEFAULT_BUY_IN;
    const chips = Number(p.chips) || 0;
    return {
      odId: p.odId,
      name: p.odName,
      buyIn: initialBuyIn,
      stack: chips,
      profit: chips - initialBuyIn,
    };
  });
}

/**
 * Settle every seated player, archive a room-close snapshot, and flip the room
 * to status='closed'. MUST be the first writes after the caller has read the
 * game doc — it performs its own user-doc reads (Firestore read-before-write).
 *
 * Idempotency: callers must check status !== 'closed' before invoking.
 *
 * @param {Object} params
 * @param {Object} params.transaction - Firestore transaction
 * @param {Object} params.db - Firestore instance
 * @param {Object} params.gameRef - Game document reference
 * @param {Object} params.game - Current game doc data
 * @param {string} params.gameId
 * @param {string} params.reason - closedReason ('idle_timeout' | 'abandoned')
 * @return {Promise<Object>} Close result summary
 */
export async function settleAndCloseRoom({ transaction, db, gameRef, game, gameId, reason }) {
  // ===== READ PHASE =====
  const seatedPlayers = Object.values(game.seats || {}).filter((seat) => seat !== null);
  const isAlreadySettled = game.status === 'completed';
  const userRefs = seatedPlayers.map((p) => db.collection('users').doc(p.odId));
  const userDocs = isAlreadySettled ? [] : await Promise.all(
    userRefs.map((ref) => transaction.get(ref)),
  );

  // ===== COMPUTE PHASE =====
  const settlement = buildSettlement(game);
  const baseRecord = {
    date: new Date().toISOString(),
    createdAt: Date.now(),
    rate: 1,
    gameName: `Poker Game #${String(gameId).slice(0, 8)}`,
    gameType: 'online_poker',
    settlement,
    autoClosed: true,
    closedReason: reason,
  };
  const perUserRecords = settlement.reduce((acc, s) => {
    acc[s.odId] = { ...baseRecord, profit: s.profit };
    return acc;
  }, {});

  // ===== WRITE PHASE =====
  // 1) Archive a room-level history snapshot
  const historyRef = gameRef.collection('history').doc();
  transaction.set(historyRef, {
    type: 'room_close',
    reason,
    gameId,
    statusAtClose: game.status,
    meta: {
      mode: game.meta?.mode || null,
      blinds: game.meta?.blinds || null,
      createdAt: game.meta?.createdAt || null,
      lastActivityAt: game.meta?.lastActivityAt || null,
      createdBy: game.meta?.createdBy || null,
    },
    seatedCount: seatedPlayers.length,
    settlement,
    table: {
      pot: game.table?.pot || 0,
      currentRound: game.table?.currentRound || null,
      stage: game.table?.stage || null,
    },
    archivedAt: FieldValue.serverTimestamp(),
  });

  // 2) Auto-settle users (only if not already settled)
  if (!isAlreadySettled) {
    userDocs.forEach((docSnap, index) => {
      const ref = userRefs[index];
      const record = perUserRecords[ref.id];
      if (!record) return;
      if (docSnap.exists) {
        transaction.update(ref, { history: FieldValue.arrayUnion(record) });
      } else {
        transaction.set(ref, { history: [record], createdAt: Date.now() }, { merge: true });
      }
    });
  }

  // 3) Close the room
  transaction.update(gameRef, {
    'status': 'closed',
    'meta.closedAt': FieldValue.serverTimestamp(),
    'meta.closedReason': reason,
  });

  return {
    closed: true,
    archivedHistoryId: historyRef.id,
    autoSettled: !isAlreadySettled,
    seatedCount: seatedPlayers.length,
  };
}

/**
 * Build a single-player cash-out history record (used when ONE player leaves a
 * still-running table — manual leave or AFK kick — as opposed to the whole-room
 * close above). Profit is their stack at cash-out minus their total buy-in;
 * chips already committed to the live pot are forfeited (folded first).
 *
 * @param {Object} seat - Leaving player's seat ({ odId, odName, chips, initialBuyIn })
 * @param {string} gameId
 * @param {string} reason - 'manual' | 'afk'
 * @return {Object} History record
 */
export function buildCashOutRecord(seat, gameId, reason) {
  const initialBuyIn = Number(seat.initialBuyIn) || 0;
  const chips = Number(seat.chips) || 0;
  const profit = chips - initialBuyIn;
  return {
    date: new Date().toISOString(),
    createdAt: Date.now(),
    rate: 1,
    gameName: `Poker Game #${String(gameId).slice(0, 8)}`,
    gameType: 'online_poker',
    profit,
    settlement: [{ odId: seat.odId, name: seat.odName, buyIn: initialBuyIn, stack: chips, profit }],
    autoClosed: reason !== 'manual',
    leftReason: reason,
  };
}

/**
 * Record a player's cash-out to their user history with a plain (non-transaction)
 * merge write. arrayUnion is atomic at the field level, so this is safe to run
 * AFTER a game-state transaction commits. Best-effort: callers should catch.
 *
 * @param {Object} db - Firestore instance
 * @param {Object} seat - Leaving seat snapshot
 * @param {string} gameId
 * @param {string} reason - 'manual' | 'afk'
 * @return {Promise<void>}
 */
export async function recordPlayerCashOut(db, seat, gameId, reason) {
  if (!seat?.odId) return;
  await db.collection('users').doc(seat.odId).set(
    { history: FieldValue.arrayUnion(buildCashOutRecord(seat, gameId, reason)) },
    { merge: true },
  );
}

/**
 * Settle + remove any seats flagged `afkOut` (a player who hit the AFK kick
 * threshold mid-hand). MUST only be called when no live pot depends on their
 * bets — i.e. between hands or right after a hand resolves — because removing a
 * seat drops its totalBet from side-pot math.
 *
 * Mutates `game.seats` in place (so a following initializeHand skips them) AND
 * writes the removal + settlement into the transaction.
 *
 * @param {Object} transaction - Firestore transaction
 * @param {Object} db - Firestore instance
 * @param {Object} gameRef - Game document reference
 * @param {Object} game - Current game doc data (mutated)
 * @param {string} gameId
 * @return {Array<string>} Removed player odIds
 */
export function purgeAfkOutSeats(transaction, db, gameRef, game, gameId) {
  const removed = [];
  Object.keys(game.seats || {}).forEach((num) => {
    const seat = game.seats[num];
    if (!seat || !seat.afkOut) return;
    // Cash out (transaction merge write — arrayUnion needs no prior read).
    transaction.set(
      db.collection('users').doc(seat.odId),
      { history: FieldValue.arrayUnion(buildCashOutRecord(seat, gameId, 'afk')) },
      { merge: true },
    );
    transaction.update(gameRef, { [`seats.${num}`]: null });
    game.seats[num] = null;
    removed.push(seat.odId);
  });
  return removed;
}
