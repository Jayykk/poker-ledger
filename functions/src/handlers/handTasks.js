/**
 * Hand-related Cloud Task HTTP handlers
 */

import { resolveShowdown, winByFoldTimeout } from './game.js';

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
