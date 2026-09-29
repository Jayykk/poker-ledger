import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  buildDealSettlement,
  buildTournamentPrizeMap,
  buildTournamentSettlement,
} from '../utils/tournamentSettlementMath.js';

/**
 * Check authorization for a normal tournament finish.
 * @param {object} game Current game.
 * @param {string} callerUid Caller UID.
 * @param {boolean} isAdmin Whether caller is an admin.
 * @return {boolean} Whether settlement is allowed.
 */
export function canRunNormalTournamentSettlement(game, callerUid, isAdmin) {
  return isAdmin || (game.players || []).some((player) => player.uid === callerUid);
}

/**
 * Check authorization for a negotiated tournament finish.
 * @param {object} game Current game.
 * @param {string} callerUid Caller UID.
 * @param {boolean} isAdmin Whether caller is an admin.
 * @return {boolean} Whether settlement is allowed.
 */
export function canRunNegotiatedSettlement(game, callerUid, isAdmin) {
  return isAdmin || game.hostUid === callerUid;
}

/**
 * Verify a tournament can be completed through the normal flow.
 * @param {object} game Current game.
 */
export function validateNormalTournamentState(game) {
  if (game.type !== 'tournament' || game.status !== 'active') {
    throw new HttpsError('failed-precondition', 'INVALID_TOURNAMENT_STATE');
  }
  if ((game.players || []).filter((player) => !player.eliminated).length !== 1) {
    throw new HttpsError('failed-precondition', 'INVALID_TOURNAMENT_STATE');
  }
}

/**
 * Verify negotiated placements and prizes against the current game.
 * @param {Array<object>} players Current players.
 * @param {Array<object>} payoutRatios Payout configuration.
 * @param {Array<object>} allocations Proposed deal allocations.
 */
export function validateDealAllocations(players, payoutRatios, allocations) {
  const aliveIds = players
    .filter((player) => !player.eliminated)
    .map((player) => player.id)
    .sort();
  const allocationIds = allocations.map((allocation) => allocation.playerId).sort();
  if (aliveIds.length !== allocationIds.length ||
      aliveIds.some((id, index) => id !== allocationIds[index])) {
    throw new HttpsError('failed-precondition', 'DEAL_STATE_CHANGED');
  }

  const placements = allocations.map((allocation) => Number(allocation.placement));
  if (placements.some((placement) =>
    !Number.isInteger(placement) || placement < 1 || placement > aliveIds.length) ||
      new Set(placements).size !== placements.length) {
    throw new HttpsError('invalid-argument', 'DEAL_PLACEMENT_INVALID');
  }
  if (allocations.some((allocation) =>
    typeof allocation.prize !== 'number' ||
    !Number.isFinite(allocation.prize) || allocation.prize < 0)) {
    throw new HttpsError('invalid-argument', 'DEAL_PRIZE_INVALID');
  }

  const totalBuyIns = players.reduce((sum, player) => sum + (Number(player.buyIn) || 0), 0);
  const prizeMap = buildTournamentPrizeMap(totalBuyIns, payoutRatios);
  const expectedTotal = aliveIds.reduce((sum, _, index) => sum + (prizeMap[index + 1] || 0), 0);
  const allocationTotal = allocations.reduce(
    (sum, allocation) => sum + (Number(allocation.prize) || 0), 0,
  );
  if (allocationTotal !== expectedTotal) {
    throw new HttpsError('failed-precondition', 'DEAL_TOTAL_MISMATCH');
  }
}

/**
 * Load all records needed by one atomic settlement.
 * @param {object} transaction Firestore transaction.
 * @param {object} db Firestore database.
 * @param {string} gameId Game ID.
 * @param {string} callerUid Caller UID.
 * @return {Promise<object>} Settlement context.
 */
async function loadSettlementContext(transaction, db, gameId, callerUid) {
  const gameRef = db.collection('games').doc(gameId);
  const adminRef = db.collection('admins').doc(callerUid);
  const gameSnap = await transaction.get(gameRef);
  if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found');

  const game = gameSnap.data();
  const adminSnap = await transaction.get(adminRef);
  let sessionRef = null;
  let session = null;
  if (game.tournamentSessionId) {
    sessionRef = db.collection('tournamentSessions').doc(game.tournamentSessionId);
    const sessionSnap = await transaction.get(sessionRef);
    if (sessionSnap.exists) session = sessionSnap.data();
  }
  return { gameRef, game, isAdmin: adminSnap.exists, sessionRef, session };
}

/**
 * Build protected lifecycle fields for a completed game.
 * @param {Array<object>} players Final players.
 * @param {Array<object>} payoutRatios Payout configuration.
 * @param {Array<object>} settlement Final settlement rows.
 * @param {string} syncToken History projection token.
 * @param {object} extra Additional completion fields.
 * @return {object} Firestore update patch.
 */
function completionPatch(players, payoutRatios, settlement, syncToken, extra = {}) {
  return {
    players,
    'status': 'completed',
    'rate': 1,
    payoutRatios,
    'settlementSnapshot': settlement,
    'completedAt': FieldValue.serverTimestamp(),
    'updatedAt': FieldValue.serverTimestamp(),
    'historyProjection.requestToken': syncToken,
    'historyProjection.requestedAt': FieldValue.serverTimestamp(),
    ...extra,
  };
}

/** Settle a tournament after normal elimination play. */
export async function settleTournamentGame({ gameId, callerUid, db }) {
  return db.runTransaction(async (transaction) => {
    const context = await loadSettlementContext(transaction, db, gameId, callerUid);
    const { game, gameRef, isAdmin, session } = context;
    if (!canRunNormalTournamentSettlement(game, callerUid, isAdmin)) {
      throw new HttpsError('permission-denied', 'Tournament participant required');
    }
    if (game.status === 'completed' && Array.isArray(game.settlementSnapshot)) {
      return {
        success: true, gameId, settlement: game.settlementSnapshot,
        syncToken: game.historyProjection?.requestToken || null, alreadySettled: true,
      };
    }

    validateNormalTournamentState(game);
    const payoutRatios = session?.config?.payoutRatios || game.payoutRatios || [];
    if (!payoutRatios.length) throw new HttpsError('failed-precondition', 'PAYOUT_RATIOS_NOT_CONFIGURED');

    const players = (game.players || []).map((player) => (
      !player.eliminated ? { ...player, placement: 1 } : player
    ));
    const settlement = buildTournamentSettlement(players, payoutRatios, game.baseBuyIn);
    const syncToken = `settle-tournament-${randomUUID()}`;
    transaction.update(gameRef, completionPatch(players, payoutRatios, settlement, syncToken));
    return { success: true, gameId, settlement, syncToken, alreadySettled: false };
  });
}

/** Settle a tournament using host-approved deal allocations. */
export async function settleTournamentDeal({ gameId, callerUid, deal, db }) {
  return db.runTransaction(async (transaction) => {
    const context = await loadSettlementContext(transaction, db, gameId, callerUid);
    const { game, gameRef, isAdmin, session, sessionRef } = context;
    if (!canRunNegotiatedSettlement(game, callerUid, isAdmin)) {
      throw new HttpsError('permission-denied', 'Only host or admin can settle a deal');
    }
    if (game.status === 'completed' && game.dealt && Array.isArray(game.settlementSnapshot)) {
      return {
        success: true, gameId, settlement: game.settlementSnapshot,
        syncToken: game.historyProjection?.requestToken || null, alreadySettled: true,
      };
    }
    if (game.type !== 'tournament' || game.status !== 'active') {
      throw new HttpsError('failed-precondition', 'INVALID_TOURNAMENT_STATE');
    }
    if (!['icm', 'chipchop', 'custom'].includes(deal?.mode)) {
      throw new HttpsError('invalid-argument', 'DEAL_MODE_INVALID');
    }

    const payoutRatios = session?.config?.payoutRatios || game.payoutRatios || [];
    if (!payoutRatios.length) throw new HttpsError('failed-precondition', 'PAYOUT_RATIOS_NOT_CONFIGURED');
    const allocations = deal.allocations || [];
    validateDealAllocations(game.players || [], payoutRatios, allocations);
    const allocationMap = new Map(
      allocations.map((allocation) => [allocation.playerId, allocation]),
    );
    const players = (game.players || []).map((player) => {
      const allocation = allocationMap.get(player.id);
      return allocation ? { ...player, placement: allocation.placement } : player;
    });
    const settlement = buildDealSettlement(players, payoutRatios, allocations, game.baseBuyIn);
    const syncToken = `settle-tournament-${randomUUID()}`;

    if (sessionRef) {
      transaction.update(sessionRef, {
        'state.status': 'ended',
        'state.timeLeftSeconds': 0,
        'state.lastTickAt': null,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    }
    transaction.update(gameRef, completionPatch(players, payoutRatios, settlement, syncToken, {
      dealt: true,
      deal: {
        mode: deal.mode,
        stacks: deal.stacks || null,
        deadChips: Number(deal.deadChips) || 0,
        allocations,
        approvals: deal.approvals || [],
        dealtAt: FieldValue.serverTimestamp(),
      },
    }));
    return { success: true, gameId, settlement, syncToken, alreadySettled: false };
  });
}
