import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

const HISTORY_SUBCOLLECTION = 'history_sub';
const PROJECTION_VERSION = 1;

function roundNumber(value) {
  return Math.round(Number(value) || 0);
}

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

function stableHash(value) {
  return JSON.stringify(deepSort(value));
}

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

function buildCashSettlement(game) {
  return normalizePlayers(game.players).map((player) => ({
    odId: player.uid,
    name: player.name,
    buyIn: roundNumber(player.buyIn),
    stack: roundNumber(player.stack),
    profit: roundNumber(player.stack - player.buyIn),
  }));
}

function buildTournamentSettlement(game) {
  if (Array.isArray(game.settlementSnapshot) && game.settlementSnapshot.length > 0) {
    return game.settlementSnapshot.map(normalizeSettlementRow);
  }

  const players = normalizePlayers(game.players);
  const payoutRatios = Array.isArray(game.payoutRatios) ? game.payoutRatios : [];

  if (!payoutRatios.length) {
    throw new HttpsError(
      'failed-precondition',
      'Completed tournament game is missing payoutRatios or settlementSnapshot'
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
    .filter((player) => player.placement)
    .sort((a, b) => (a.placement || 999) - (b.placement || 999))
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
    });
}

function buildSettlementSnapshot(game) {
  if (Array.isArray(game.settlementSnapshot) && game.settlementSnapshot.length > 0) {
    return game.settlementSnapshot.map(normalizeSettlementRow);
  }

  if (game.type === 'tournament') {
    return buildTournamentSettlement(game);
  }

  return buildCashSettlement(game);
}

function buildProjectionSource(game) {
  return {
    status: game.status || null,
    type: game.type || 'live',
    name: game.name || '',
    rate: Number(game.rate) || 1,
    createdAt: toMillis(game.createdAt),
    updatedAt: toMillis(game.updatedAt),
    completedAt: toMillis(game.completedAt),
    lastCorrectedAt: toMillis(game.lastCorrectedAt),
    players: normalizePlayers(game.players),
    payoutRatios: Array.isArray(game.payoutRatios) ? game.payoutRatios : [],
    settlementSnapshot: Array.isArray(game.settlementSnapshot)
      ? game.settlementSnapshot.map(normalizeSettlementRow)
      : [],
  };
}

function extractProjectedUserIds(game) {
  const settlement = buildSettlementSnapshot(game);
  return [...new Set(settlement.map((row) => row.odId).filter(Boolean))];
}

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

export function shouldSyncCompletedGame(beforeGame, afterGame) {
  if (!afterGame) return false;
  if (afterGame.status !== 'completed') return false;
  if (!beforeGame || beforeGame.status !== 'completed') return true;

  const beforeHash = stableHash(buildProjectionSource(beforeGame));
  const afterHash = stableHash(buildProjectionSource(afterGame));
  return beforeHash !== afterHash;
}

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
    { merge: true }
  );
}

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
    { merge: true }
  );

  await batch.commit();

  return {
    gameId,
    projectedUsers: roundNumber(nextUserIds.length),
    staleUsersDeleted: roundNumber(staleUserIds.length),
    sourceHash,
  };
}
