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
  try {
    const body = getJsonBody(req);
    const { gameId, showdownId } = body;

    if (!gameId || !showdownId) {
      res.status(400).json({ success: false, error: 'Missing gameId/showdownId' });
      return;
    }

    const result = await resolveShowdown(gameId, showdownId);
    res.json({ success: true, result });
  } catch (error) {
    console.error('handleShowdownResolveHttp error:', error);
    res.status(500).json({ success: false, error: error.message });
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
  try {
    const body = getJsonBody(req);
    const { gameId, winByFoldId } = body;

    if (!gameId || !winByFoldId) {
      res.status(400).json({ success: false, error: 'Missing gameId/winByFoldId' });
      return;
    }

    const result = await winByFoldTimeout(gameId, winByFoldId);
    res.json({ success: true, result });
  } catch (error) {
    console.error('handleWinByFoldTimeoutHttp error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
