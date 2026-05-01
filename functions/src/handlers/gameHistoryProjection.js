import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

const HISTORY_SUBCOLLECTION = 'history_sub';
const PROJECTION_VERSION = 1;

/**
 * Round an input value to the nearest integer.
 *
 * @param {*} value Raw numeric-like value.
 * @return {number} Rounded integer value.
 */
function roundNumber(value) {
  return Math.round(Number(value) || 0);
}

/**
 * Convert a Firestore timestamp-like value into epoch milliseconds.
 *
 * @param {*} value Timestamp, ISO string, or number.
 * @return {number} Millisecond timestamp.
 */
function toMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return roundNumber(value);
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : roundNumber(parsed);
  }
  if (typeof value.toMillis === 'function') {
    return roundNumber(value.toMillis());
  }
  return 0;
}

/**
 * Recursively sort object keys so JSON hashing stays stable.
 *
 * @param {*} value Input value to normalize.
 * @return {*} Sorted clone of the input value.
 */
function deepSort(value) {
  if (Array.isArray(value)) {
    return value.map(deepSort);
  }

  if (value && typeof value === 'object') {
    const sorted = {};
    Object.keys(value).sort().forEach((key) => {
      sorted[key] = deepSort(value[key]);
    });
    return sorted;
  }

  return value;
}

/**
 * Build a stable JSON hash string from nested data.
 *
 * @param {*} value Source value.
 * @return {string} Stable JSON string.
 */
function stableHash(value) {
  return JSON.stringify(deepSort(value));
}

/**
 * Normalize player rows before projection math.
 *
 * @param {Array<object>} players Raw game players.
 * @return {Array<object>} Normalized player rows.
 */
function normalizePlayers(players) {
  return (players || []).map((player) => ({
    id: player.id || null,
    uid: player.uid || null,
    name: player.name || '',
    buyIn: roundNumber(player.buyIn),
    stack: roundNumber(player.stack),
    placement: player.placement == null ? null : roundNumber(player.placement),
    eliminated: !!player.eliminated,
  }));
}

/**
 * Normalize a stored settlement row.
 *
 * @param {object} row Raw settlement row.
 * @return {object} Normalized settlement row.
 */
function normalizeSettlementRow(row) {
  return {
    odId: row.odId || row.uid || null,
    name: row.name || '',
    buyIn: roundNumber(row.buyIn),
    stack: roundNumber(row.stack),
    placement: row.placement == null ? null : roundNumber(row.placement),
    prize: roundNumber(row.prize),
    profit: roundNumber(row.profit),
  };
}

/**
 * Build settlement rows for a completed cash game.
 *
 * @param {object} game Source game document.
 * @return {Array<object>} Cash settlement rows.
 */
function buildCashSettlement(game) {
  return normalizePlayers(game.players).map((player) => ({
    odId: player.uid,
    name: player.name,
    buyIn: roundNumber(player.buyIn),
    stack: roundNumber(player.stack),
    profit: roundNumber(player.stack - player.buyIn),
  }));
}

/**
 * Build settlement rows for a completed tournament game.
 *
 * @param {object} game Source game document.
 * @return {Array<object>} Tournament settlement rows.
 */
function buildTournamentSettlement(game) {
  if (Array.isArray(game.settlementSnapshot) && game.settlementSnapshot.length > 0) {
    return game.settlementSnapshot.map(normalizeSettlementRow);
  }

  const players = normalizePlayers(game.players);
  const payoutRatios = Array.isArray(game.payoutRatios) ? game.payoutRatios : [];

  if (!payoutRatios.length) {
    throw new HttpsError(
      'failed-precondition',
      'Completed tournament game is missing payoutRatios or settlementSnapshot',
    );
  }

  const totalBuyIns = roundNumber(players.reduce((sum, player) => sum + player.buyIn, 0));
  const prizeMap = {};

  payoutRatios.forEach((row) => {
    const place = roundNumber(row.place);
    const percentage = Number(row.percentage) || 0;
    prizeMap[place] = roundNumber(totalBuyIns * percentage / 100);
  });

  return players
    .map((player) => {
      const prize = roundNumber(prizeMap[player.placement] || 0);
      return {
        odId: player.uid,
        name: player.name,
        placement: player.placement,
        buyIn: roundNumber(player.buyIn),
        prize,
        profit: roundNumber(prize - player.buyIn),
      };
    })
    .sort((a, b) => (a.placement || 999) - (b.placement || 999));
}

/**
 * Resolve the settlement snapshot for any completed game type.
 *
 * @param {object} game Source game document.
 * @return {Array<object>} Normalized settlement rows.
 */
function buildSettlementSnapshot(game) {
  if (Array.isArray(game.settlementSnapshot) && game.settlementSnapshot.length > 0) {
    return game.settlementSnapshot.map(normalizeSettlementRow);
  }

  if (game.type === 'tournament') {
    return buildTournamentSettlement(game);
  }

  return buildCashSettlement(game);
}

/**
 * Build the subset of game data used to detect projection changes.
 *
 * @param {object} game Source game document.
 * @return {object} Hashable projection source data.
 */
function buildProjectionSource(game) {
  return {
    status: game.status || null,
    type: game.type || 'live',
    name: game.name || '',
    rate: Number(game.rate) || 1,
    createdAt: toMillis(game.createdAt),
    // updatedAt intentionally omitted: every saveGameConfig call bumps updatedAt, which
    // would cause a spurious re-sync even when no settlement-relevant data changed.
    // lastCorrectedAt is kept because settlement corrections set it explicitly.
    completedAt: toMillis(game.completedAt),
    lastCorrectedAt: toMillis(game.lastCorrectedAt),
    players: normalizePlayers(game.players),
    payoutRatios: Array.isArray(game.payoutRatios) ? game.payoutRatios : [],
    settlementSnapshot: Array.isArray(game.settlementSnapshot)
      ? game.settlementSnapshot.map(normalizeSettlementRow)
      : [],
  };
}

/**
 * Extract the user ids that should receive a projection for a game.
 *
 * @param {object} game Source game document.
 * @return {Array<string>} Unique projected user ids.
 */
function extractProjectedUserIds(game) {
  const settlement = buildSettlementSnapshot(game);
  return [...new Set(settlement.map((row) => row.odId).filter(Boolean))];
}

/**
 * Build per-user history_sub documents for a completed game.
 *
 * @param {string} gameId Game document id.
 * @param {object} game Source game document.
 * @return {Array<object>} Projection writes grouped by user id.
 */
function buildUserProjectionDocs(gameId, game) {
  const settlement = buildSettlementSnapshot(game);
  const rate = Number(game.rate) || 1;
  const syncToken = game.historyProjection?.requestToken || null;
  const completedAt =
    toMillis(game.completedAt) ||
    toMillis(game.lastCorrectedAt) ||
    toMillis(game.updatedAt) ||
    toMillis(game.createdAt) ||
    Date.now();

  return settlement
    .filter((row) => row.odId)
    .map((row) => ({
      uid: row.odId,
      data: {
        gameId,
        gameName: game.name || 'Untitled',
        type: game.type || 'live',
        status: 'completed',
        date: new Date(completedAt).toISOString(),
        createdAt: roundNumber(completedAt),
        completedAt: roundNumber(completedAt),
        profit: roundNumber(row.profit),
        rate,
        placement: row.placement ?? null,
        settlement,
        sourceCollection: 'games',
        sourceVersion: PROJECTION_VERSION,
        sourceGameUpdatedAt: toMillis(game.updatedAt) || roundNumber(completedAt),
        syncToken,
        projectionUpdatedAt: FieldValue.serverTimestamp(),
      },
    }));
}

/**
 * Decide whether a game update requires projection sync.
 *
 * @param {?object} beforeGame Previous game snapshot.
 * @param {?object} afterGame Updated game snapshot.
 * @return {boolean} True when projections should be rebuilt.
 */
export function shouldSyncCompletedGame(beforeGame, afterGame) {
  if (!afterGame) return false;
  if (afterGame.status !== 'completed') return false;
  if (!beforeGame || beforeGame.status !== 'completed') return true;

  const beforeHash = stableHash(buildProjectionSource(beforeGame));
  const afterHash = stableHash(buildProjectionSource(afterGame));
  return beforeHash !== afterHash;
}

/**
 * Persist the last projection sync error onto the game document.
 *
 * @param {string} gameId Game document id.
 * @param {Error} error Sync failure.
 * @return {Promise<void>} Write completion promise.
 */
export async function recordProjectionError(gameId, error) {
  const db = getFirestore();
  await db.collection('games').doc(gameId).set(
    {
      historyProjection: {
        lastError: error.message || String(error),
        failedAt: FieldValue.serverTimestamp(),
        version: PROJECTION_VERSION,
      },
    },
    { merge: true },
  );
}

/**
 * Ensure the caller can manage completed game history sync.
 *
 * @param {string} uid Authenticated user id.
 * @param {object} game Source game document.
 * @return {Promise<boolean>} True when sync is allowed.
 */
export async function assertCanManageCompletedGame(uid, game) {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  const db = getFirestore();
  const isHost = game.hostUid && game.hostUid === uid;

  if (isHost) return true;

  const adminSnap = await db.collection('admins').doc(uid).get();
  if (adminSnap.exists) return true;

  throw new HttpsError('permission-denied', 'Only host or admin can sync completed game history');
}

/**
 * Rebuild history_sub projections for a completed game.
 *
 * @param {string} gameId Game document id.
 * @param {object} [options={}] Sync options and preloaded snapshots.
 * @return {Promise<object>} Projection sync summary.
 */
export async function syncCompletedGameHistoryProjection(gameId, options = {}) {
  const db = getFirestore();
  const gameRef = db.collection('games').doc(gameId);
  const gameSnapshot = options.afterGame ? null : await gameRef.get();
  const game = options.afterGame || gameSnapshot.data();
  const syncToken = options.syncToken || game?.historyProjection?.requestToken || null;

  if (syncToken && game) {
    game.historyProjection = {
      ...(game.historyProjection || {}),
      requestToken: syncToken,
    };
  }

  if (!game) {
    throw new HttpsError('not-found', 'Game not found');
  }

  if (options.authUid && typeof options.assertPermission === 'function') {
    await options.assertPermission(options.authUid, game);
  }

  if (game.status !== 'completed') {
    throw new HttpsError('failed-precondition', 'Game is not completed');
  }

  const writes = buildUserProjectionDocs(gameId, game);
  const nextUserIds = writes.map((item) => item.uid);
  const previousUserIds = options.beforeGame
    ? extractProjectedUserIds(options.beforeGame)
    : Array.isArray(game.historyProjection?.syncedUserIds)
      ? game.historyProjection.syncedUserIds
      : [];
  const staleUserIds = previousUserIds.filter((uid) => !nextUserIds.includes(uid));
  const sourceHash = stableHash(buildProjectionSource(game));

  const batch = db.batch();

  writes.forEach((item) => {
    const historyRef = db
      .collection('users')
      .doc(item.uid)
      .collection(HISTORY_SUBCOLLECTION)
      .doc(gameId);

    batch.set(historyRef, item.data, { merge: true });
  });

  staleUserIds.forEach((uid) => {
    const staleRef = db
      .collection('users')
      .doc(uid)
      .collection(HISTORY_SUBCOLLECTION)
      .doc(gameId);

    batch.delete(staleRef);
  });

  batch.set(
    gameRef,
    {
      historyProjection: {
        version: PROJECTION_VERSION,
        sourceHash,
        syncedAt: FieldValue.serverTimestamp(),
        lastSyncRequestToken: syncToken,
        syncedUserIds: nextUserIds,
        projectedUsers: roundNumber(nextUserIds.length),
        lastError: FieldValue.delete(),
      },
    },
    { merge: true },
  );

  await batch.commit();

  return {
    gameId,
    projectedUsers: roundNumber(nextUserIds.length),
    staleUsersDeleted: roundNumber(staleUserIds.length),
    sourceHash,
  };
}
