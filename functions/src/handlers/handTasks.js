/**
 * Hand-related Cloud Task HTTP handlers
 */

import { getFirestore } from 'firebase-admin/firestore';
import { resolveShowdown, winByFoldTimeout, startHand } from './game.js';

/**
 * Parse JSON body from request.
 * @param {Object} req
 * @return {Object}
 */
function getJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.rawBody?.toString?.('utf8') || '{}');
  } catch {
    return {};
  }
}

/**
 * Cloud Tasks handler: resolves a showdown after a short delay.
 * @param {Object} req
 * @param {Object} res
 * @return {Promise<void>}
 */
export async function handleShowdownResolveHttp(req, res) {
  let gameId;
  let showdownId;
  try {
    const body = getJsonBody(req);
    ({ gameId, showdownId } = body);

    if (!gameId || !showdownId) {
      res.status(400).json({
        success: false,
        handler: 'handleShowdownResolve',
        error: 'Missing gameId/showdownId',
      });
      return;
    }

    const result = await resolveShowdown(gameId, showdownId);
    console.log('handleShowdownResolveHttp ok:', { gameId, showdownId, result });
    res.status(200).json({
      success: true,
      handler: 'handleShowdownResolve',
      gameId,
      showdownId,
      result,
    });
  } catch (error) {
    console.error('handleShowdownResolveHttp error:', {
      gameId,
      showdownId,
      message: error?.message,
      stack: error?.stack,
    });
    res.status(500).json({
      success: false,
      handler: 'handleShowdownResolve',
      gameId,
      showdownId,
      error: error?.message ?? String(error),
    });
  }
}

/**
 * Cloud Tasks handler: win-by-fold 5s timeout.
 * If winner didn't show within the window, defaults to muck and starts next hand.
 * @param {Object} req
 * @param {Object} res
 * @return {Promise<void>}
 */
export async function handleWinByFoldTimeoutHttp(req, res) {
  let gameId;
  let winByFoldId;
  try {
    const body = getJsonBody(req);
    ({ gameId, winByFoldId } = body);

    if (!gameId || !winByFoldId) {
      res.status(400).json({
        success: false,
        handler: 'handleWinByFoldTimeout',
        error: 'Missing gameId/winByFoldId',
      });
      return;
    }

    const result = await winByFoldTimeout(gameId, winByFoldId);
    console.log('handleWinByFoldTimeoutHttp ok:', { gameId, winByFoldId, result });
    res.status(200).json({
      success: true,
      handler: 'handleWinByFoldTimeout',
      gameId,
      winByFoldId,
      result,
    });
  } catch (error) {
    console.error('handleWinByFoldTimeoutHttp error:', {
      gameId,
      winByFoldId,
      message: error?.message,
      stack: error?.stack,
    });
    res.status(500).json({
      success: false,
      handler: 'handleWinByFoldTimeout',
      gameId,
      winByFoldId,
      error: error?.message ?? String(error),
    });
  }
}

/**
 * Start-next-hand timeout (called by Cloud Tasks).
 * This is scheduled after showdown so players can admire results briefly.
 * Uses nextHandId for zombie prevention.
 * @param {Object} req
 * @param {Object} res
 * @return {Promise<void>}
 */
export async function handleStartNextHandHttp(req, res) {
  let gameId;
  let nextHandId;
  try {
    const body = getJsonBody(req);
    ({ gameId, nextHandId } = body);

    if (!gameId || !nextHandId) {
      res.status(400).json({
        success: false,
        handler: 'handleStartNextHand',
        error: 'Missing gameId/nextHandId',
      });
      return;
    }

    const db = getFirestore();
    const gameRef = db.collection('pokerGames').doc(gameId);

    const state = await db.runTransaction(async (transaction) => {
      const gameDoc = await transaction.get(gameRef);
      if (!gameDoc.exists) {
        return { ignored: true, reason: 'game_not_found' };
      }

      const game = gameDoc.data();

      if (game.table?.nextHandId !== nextHandId) {
        return { ignored: true, reason: 'stale_next_hand_task' };
      }

      if (game.status !== 'waiting') {
        return { ignored: true, reason: 'game_not_waiting' };
      }

      const isAutoNext = game.table?.isAutoNext ?? false;
      if (!isAutoNext) {
        return { ignored: true, reason: 'auto_next_disabled' };
      }

      if (game.meta?.pauseAfterHand === true || game.status === 'ended') {
        return { ignored: true, reason: 'game_paused_or_ended' };
      }

      return { startNext: true, isAutoNext };
    });

    if (state.startNext) {
      const result = await startHand(gameId);
      console.log('handleStartNextHandHttp ok:', { gameId, nextHandId, result });
      res.status(200).json({
        success: true,
        handler: 'handleStartNextHand',
        gameId,
        nextHandId,
        result,
      });
      return;
    }

    console.log('handleStartNextHandHttp ignored:', { gameId, nextHandId, state });
    res.status(200).json({
      success: true,
      handler: 'handleStartNextHand',
      gameId,
      nextHandId,
      result: state,
    });
  } catch (error) {
    console.error('handleStartNextHandHttp error:', {
      gameId,
      nextHandId,
      message: error?.message,
      stack: error?.stack,
    });
    res.status(500).json({
      success: false,
      handler: 'handleStartNextHand',
      gameId,
      nextHandId,
      error: error?.message ?? String(error),
    });
  }
}
