import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { buildCashSettlement } from '../utils/cashSettlementMath.js';

/**
 * Check whether a caller may settle a cash game.
 * @param {object} game Current game.
 * @param {string} callerUid Caller UID.
 * @param {boolean} isAdmin Whether caller is an admin.
 * @return {boolean} Whether settlement is allowed.
 */
export function canRunCashSettlement(game, callerUid, isAdmin) {
  return isAdmin || (game.players || []).some((player) => player.uid === callerUid);
}

/**
 * Validate mutable cash-game settlement inputs and state.
 * @param {object} game Current game.
 * @param {number} exchangeRate Cash conversion rate.
 */
export function validateCashSettlementState(game, exchangeRate) {
  if (game.type === 'tournament' || game.status !== 'active') {
    throw new HttpsError('failed-precondition', 'INVALID_CASH_GAME_STATE');
  }
  if (typeof exchangeRate !== 'number' ||
      !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new HttpsError('invalid-argument', 'INVALID_CASH_SETTLEMENT_RATE');
  }
}

/**
 * Settle a cash game using server-loaded player balances.
 * @param {object} input Settlement input.
 * @param {string} input.gameId Game ID.
 * @param {string} input.callerUid Caller UID.
 * @param {number} input.exchangeRate Cash conversion rate.
 * @param {object} input.db Firestore database.
 * @return {Promise<object>} Settlement result.
 */
export async function settleCashGame({ gameId, callerUid, exchangeRate, db }) {
  return db.runTransaction(async (transaction) => {
    const gameRef = db.collection('games').doc(gameId);
    const adminRef = db.collection('admins').doc(callerUid);
    const gameSnap = await transaction.get(gameRef);
    if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found');

    const game = gameSnap.data();
    const adminSnap = await transaction.get(adminRef);
    if (!canRunCashSettlement(game, callerUid, adminSnap.exists)) {
      throw new HttpsError('permission-denied', 'Cash game participant required');
    }

    if (game.type === 'tournament') {
      throw new HttpsError('failed-precondition', 'INVALID_CASH_GAME_STATE');
    }

    if (game.status === 'completed' && Array.isArray(game.settlementSnapshot)) {
      return {
        success: true,
        gameId,
        gameName: game.name || '',
        rate: Number(game.rate) || 1,
        settlement: game.settlementSnapshot,
        syncToken: game.historyProjection?.requestToken || null,
        alreadySettled: true,
      };
    }

    validateCashSettlementState(game, exchangeRate);
    const settlement = buildCashSettlement(game.players || []);
    const syncToken = `settle-cash-${randomUUID()}`;
    transaction.update(gameRef, {
      'status': 'completed',
      'rate': exchangeRate,
      'settlementSnapshot': settlement,
      'completedAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
      'historyProjection.requestToken': syncToken,
      'historyProjection.requestedAt': FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      gameId,
      gameName: game.name || '',
      rate: exchangeRate,
      settlement,
      syncToken,
      alreadySettled: false,
    };
  });
}
