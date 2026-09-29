import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { buildCashSettlement } from '../utils/cashSettlementMath.js';
import { normalizeCashDecimals, withCashAmounts } from '../utils/cashRounding.js';

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
 * Resolve the settlement's cash decimal places. The host's choice in the
 * settlement dialog wins; older clients don't send it (undefined), so the
 * game's own setting (from its cash preset) applies.
 * @param {*} requested Value from the request (null = no rounding).
 * @param {*} gameSetting game.cashDecimals.
 * @return {?number} 0 / 1 / 2, or null for no rounding.
 */
export function resolveCashDecimals(requested, gameSetting) {
  if (requested === undefined) return normalizeCashDecimals(gameSetting);
  if (requested === null) return null;
  const decimals = normalizeCashDecimals(requested);
  if (decimals === null) {
    throw new HttpsError('invalid-argument', 'INVALID_CASH_DECIMALS');
  }
  return decimals;
}

/**
 * Settle a cash game using server-loaded player balances.
 * @param {object} input Settlement input.
 * @param {string} input.gameId Game ID.
 * @param {string} input.callerUid Caller UID.
 * @param {number} input.exchangeRate Cash conversion rate.
 * @param {?number} [input.cashDecimals] Rounding places (see resolveCashDecimals).
 * @param {object} input.db Firestore database.
 * @return {Promise<object>} Settlement result.
 */
export async function settleCashGame({ gameId, callerUid, exchangeRate, cashDecimals, db }) {
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
        cashDecimals: normalizeCashDecimals(game.cashDecimals),
        settlement: game.settlementSnapshot,
        syncToken: game.historyProjection?.requestToken || null,
        alreadySettled: true,
      };
    }

    validateCashSettlementState(game, exchangeRate);
    const decimals = resolveCashDecimals(cashDecimals, game.cashDecimals);
    // Rounded rows carry `cash` (zero-sum, see cashRounding.js); readers
    // fall back to profit / rate when it's absent.
    const settlement = withCashAmounts(
      buildCashSettlement(game.players || []), exchangeRate, decimals,
    );
    const syncToken = `settle-cash-${randomUUID()}`;
    transaction.update(gameRef, {
      'status': 'completed',
      'rate': exchangeRate,
      'cashDecimals': decimals,
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
      cashDecimals: decimals,
      settlement,
      syncToken,
      alreadySettled: false,
    };
  });
}
