/**
 * Firebase Cloud Functions for Poker Ledger
 * Main entry point: settlement, history projection, titles, LINE login
 */

import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError, onRequest } from 'firebase-functions/v2/https';
import { onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FUNCTIONS_REGION } from './utils/config.js';
import { FIRESTORE_DATABASE_ID } from './utils/db.js';
import { lineLogin as lineLoginHandler } from './handlers/lineAuth.js';
import {
  handleLineLoginCallback,
  claimLineLoginHandoff as claimLineLoginHandoffHandler,
} from './handlers/lineLoginHandoff.js';
import {
  recordBuyIn as recordBuyInHandler,
  undoBuyIn as undoBuyInHandler,
  getTransactionLog as getTransactionLogHandler,
} from './handlers/transaction.js';
import {
  assertCanManageCompletedGame,
  recordProjectionError,
  shouldSyncCompletedGame,
  syncCompletedGameHistoryProjection,
} from './handlers/gameHistoryProjection.js';
import { getFirestore } from './utils/db.js';
import {
  settleTournamentDeal as settleTournamentDealHandler,
  settleTournamentGame as settleTournamentGameHandler,
} from './handlers/tournamentSettlement.js';
import { settleCashGame as settleCashGameHandler } from './handlers/cashSettlement.js';
import { reportClientError as reportClientErrorHandler } from './handlers/clientErrors.js';
import { setTitlePrefs as setTitlePrefsHandler, syncPublicProfile } from './handlers/userTitles.js';
import { refreshGameHandEvents } from './handlers/gameHandEvents.js';

// Initialize Firebase Admin
initializeApp();

// Deploy every function to FUNCTIONS_REGION (asia-east1 / Taiwan) by default.
// Individual triggers can still override per-function, but all share this region.
setGlobalOptions({ region: FUNCTIONS_REGION });

export const settleCashGame = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
  const { gameId, exchangeRate, cashDecimals } = request.data || {};
  if (!gameId) throw new HttpsError('invalid-argument', 'Missing gameId');
  return settleCashGameHandler({
    gameId, callerUid: request.auth.uid, exchangeRate, cashDecimals, db: getFirestore(),
  });
});

export const settleTournamentGame = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
  const gameId = request.data?.gameId;
  if (!gameId) throw new HttpsError('invalid-argument', 'Missing gameId');
  return settleTournamentGameHandler({ gameId, callerUid: request.auth.uid, db: getFirestore() });
});

export const settleTournamentDeal = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
  const { gameId, deal } = request.data || {};
  if (!gameId || !deal) throw new HttpsError('invalid-argument', 'Missing gameId or deal');
  return settleTournamentDealHandler({
    gameId, callerUid: request.auth.uid, deal, db: getFirestore(),
  });
});

// ============================================
// LINE Integration Endpoints
// ============================================

/**
 * LINE Login — verify LINE access token and return Firebase Custom Token
 */
export const lineLogin = onCall(async (request) => {
  try {
    const { accessToken } = request.data;
    const result = await lineLoginHandler(accessToken);
    return result;
  } catch (error) {
    console.error('Error in lineLogin:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * LINE Login redirect target for the home-screen app hand-off: parks the
 * authorization code and asks the user to confirm (see lineLoginHandoff.js).
 */
export const lineLoginCallback = onRequest(async (req, res) => {
  try {
    await handleLineLoginCallback(req, res, { db: getFirestore() });
  } catch (error) {
    console.error('Error in lineLoginCallback:', error);
    res.status(500).send('Internal error');
  }
});

/**
 * Home-screen app polls this after starting LINE Login; returns a Firebase
 * custom token once the hand-off is confirmed.
 */
export const claimLineLoginHandoff = onCall(async (request) => {
  const { state, codeVerifier } = request.data || {};
  try {
    return await claimLineLoginHandoffHandler({ state, codeVerifier }, { db: getFirestore() });
  } catch (error) {
    console.error('Error in claimLineLoginHandoff:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * The app's uncaught errors → one GitHub issue per kind of error (private
 * repo), see handlers/clientErrors.js. Signed-out reports count but file
 * nothing new, so only people using the app can open issues.
 */
export const reportClientError = onCall(async (request) => {
  try {
    const uid = request.auth?.uid || null;
    const env = uid ? process.env : { ...process.env, ERRORS_GITHUB_TOKEN: '' };
    return await reportClientErrorHandler(request.data || {}, { db: getFirestore(), uid, env });
  } catch (error) {
    console.error('Error in reportClientError:', error);
    return { ok: false };
  }
});

/**
 * 稱號: display mode (off / auto / pick), the picked title (must be unlocked),
 * the 頭像框 (auto or an earned frame) and the in-room titles toggle.
 * userTitles is server-written only, so the
 * profile page saves through here; returns the prefs and resolved display.
 */
export const setTitlePrefs = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
  return setTitlePrefsHandler(getFirestore(), request.auth.uid, request.data || {});
});

// ============================================
// Transaction Endpoints (Buy-in Audit Trail)
// ============================================

/**
 * Record a buy-in transaction (with "who did it for whom")
 */
export const recordBuyInTx = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { gameId, targetId, targetUid, targetName, amount, type } = request.data;
    const actionUid = request.auth.uid;
    const actionName = request.auth.token.name || 'Player';

    const result = await recordBuyInHandler(
      { gameId, targetId, targetUid, targetName, amount, type },
      actionUid,
      actionName,
    );
    return { success: true, ...result };
  } catch (error) {
    console.error('Error recording buy-in:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Undo a buy-in transaction
 */
export const undoBuyInTx = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { txId } = request.data;
    const callerUid = request.auth.uid;
    const callerName = request.auth.token.name || 'Player';

    const result = await undoBuyInHandler(txId, callerUid, callerName);
    return { success: true, ...result };
  } catch (error) {
    console.error('Error undoing buy-in:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Get transaction log for a game
 */
export const getTransactionLog = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { gameId } = request.data;
    const log = await getTransactionLogHandler(gameId);
    return { success: true, transactions: log };
  } catch (error) {
    console.error('Error getting transaction log:', error);
    throw new HttpsError('internal', error.message);
  }
});

export const syncCompletedGameHistory = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  const { gameId, syncToken } = request.data || {};
  if (!gameId) {
    throw new HttpsError('invalid-argument', 'Missing gameId');
  }

  try {
    const result = await syncCompletedGameHistoryProjection(gameId, {
      authUid: request.auth.uid,
      assertPermission: assertCanManageCompletedGame,
      syncToken,
    });

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error('syncCompletedGameHistory callable failed:', gameId, error);
    await recordProjectionError(gameId, error);
    throw error;
  }
});

// A new LINE photo / name reaches userTitles (what every name in the app
// reads) right away, not only after the user's next game
export const onUserProfileWrite = onDocumentWritten({ document: 'users/{uid}', database: FIRESTORE_DATABASE_ID }, async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  try {
    await syncPublicProfile(getFirestore(), event.params.uid, before, after);
  } catch (error) {
    console.error('onUserProfileWrite failed:', event.params.uid, error);
  }
});

// 補記手牌: a hand added / changed / removed after a game finished brings the
// players' hand titles up to date (active games: the projection counts their
// hands at completion). Logged, never thrown.
export const onGameHandWrite = onDocumentWritten({ document: 'games/{gameId}/hands/{handId}', database: FIRESTORE_DATABASE_ID }, async (event) => {
  const { gameId, handId } = event.params;
  try {
    const result = await refreshGameHandEvents(getFirestore(), gameId);
    if (result.written.length) {
      console.log('onGameHandWrite: hand events updated', gameId, handId, result);
    }
  } catch (error) {
    console.error('onGameHandWrite failed:', gameId, handId, error);
  }
});

export const onCompletedGameProjectionUpdate = onDocumentUpdated({ document: 'games/{gameId}', database: FIRESTORE_DATABASE_ID }, async (event) => {
  const beforeGame = event.data.before.exists ? event.data.before.data() : null;
  const afterGame = event.data.after.exists ? event.data.after.data() : null;
  const { gameId } = event.params;

  if (!shouldSyncCompletedGame(beforeGame, afterGame)) {
    return;
  }

  try {
    await syncCompletedGameHistoryProjection(gameId, {
      beforeGame,
      afterGame,
    });
  } catch (error) {
    console.error('onCompletedGameProjectionUpdate failed:', gameId, error);
    await recordProjectionError(gameId, error);
    throw error;
  }
});
