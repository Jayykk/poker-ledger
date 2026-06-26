/**
 * Room-related Cloud Task HTTP handlers
 */

import { getFirestore } from '../utils/db.js';
import { createPokerHttpTask } from '../utils/cloudTasks.js';
import { ROOM_IDLE_TIMEOUT_SECONDS as IDLE_TIMEOUT_SECONDS } from '../utils/config.js';
import { evaluateRoomClose, settleAndCloseRoom } from './roomLifecycle.js';
const RESCHEDULE_CHECK_SECONDS = 10 * 60; // if playing, re-check periodically
const MAX_PLAYING_RESCHEDULES = 3;

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
 * Cloud Tasks handler: closes an idle room after timeout.
 *
 * Contract:
 * - Input: { gameId, autoCloseToken }
 * - Only acts if token matches current game.meta.autoCloseToken.
 * - Closes by setting status='closed' and meta.closedAt/meta.closedReason.
 *
 * @param {Object} req
 * @param {Object} res
 * @return {Promise<void>}
 */
export async function handleRoomAutoCloseHttp(req, res) {
  let gameId;
  let autoCloseToken;
  let playingChecks;

  try {
    const body = getJsonBody(req);
    ({ gameId, autoCloseToken } = body);
    playingChecks = Number.isFinite(Number(body.playingChecks)) ? Number(body.playingChecks) : 0;

    if (!gameId || !autoCloseToken) {
      res.status(400).json({
        success: false,
        handler: 'handleRoomAutoClose',
        error: 'Missing gameId/autoCloseToken',
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
      const currentToken = game?.meta?.autoCloseToken || null;

      // Zombie/stale task protection
      if (currentToken !== autoCloseToken) {
        return { ignored: true, reason: 'stale_auto_close_task' };
      }

      if (game.status === 'closed') {
        return { ignored: true, reason: 'already_closed' };
      }

      const lastActivity = game?.meta?.lastActivityAt;
      const lastActivityMs = typeof lastActivity?.toMillis === 'function' ?
        lastActivity.toMillis() :
        null;
      const nowMs = Date.now();

      // If missing lastActivityAt, treat as idle since creation time (or now) - be conservative.
      const idleSeconds = lastActivityMs ?
        Math.floor((nowMs - lastActivityMs) / 1000) :
        IDLE_TIMEOUT_SECONDS;

      if (idleSeconds < IDLE_TIMEOUT_SECONDS) {
        return {
          reschedule: true,
          delaySeconds: Math.max(1, IDLE_TIMEOUT_SECONDS - idleSeconds),
          reason: 'not_idle_enough',
          idleSeconds,
        };
      }

      // Avoid closing mid-hand; re-check later (no writes on reschedule, so we
      // never settle a room more than once).
      if (game.status === 'playing' && playingChecks < MAX_PLAYING_RESCHEDULES) {
        return {
          reschedule: true,
          delaySeconds: RESCHEDULE_CHECK_SECONDS,
          reason: 'game_playing',
          idleSeconds,
          playingChecks,
          archivedHistory: false,
        };
      }

      // Settle + archive + close (shared with the periodic sweep).
      const closeResult = await settleAndCloseRoom({
        transaction, db, gameRef, game, gameId, reason: 'idle_timeout',
      });

      return {
        closed: true,
        forcedCloseWhilePlaying: game.status === 'playing',
        idleSeconds,
        playingChecks,
        archivedHistory: true,
        archivedHistoryId: closeResult.archivedHistoryId,
        autoSettled: closeResult.autoSettled,
      };
    });

    if (state?.reschedule) {
      await createPokerHttpTask({
        endpoint: 'handleRoomAutoClose',
        payload: {
          gameId,
          autoCloseToken,
          timestamp: Date.now(),
          reason: state.reason,
          playingChecks: state.reason === 'game_playing' ? playingChecks + 1 : playingChecks,
        },
        delaySeconds: state.delaySeconds,
        logLabel: `autoCloseToken: ${autoCloseToken} (${state.reason})`,
      });
    }

    if (state?.archivedHistory === true) {
      console.log(`History archived for room: ${gameId}`);
    }

    res.status(200).json({
      success: true,
      handler: 'handleRoomAutoClose',
      gameId,
      autoCloseToken,
      state,
    });
  } catch (error) {
    console.error('handleRoomAutoCloseHttp error:', {
      gameId,
      autoCloseToken,
      message: error?.message,
      stack: error?.stack,
    });
    res.status(500).json({
      success: false,
      handler: 'handleRoomAutoClose',
      gameId,
      autoCloseToken,
      error: error?.message ?? String(error),
    });
  }
}

/**
 * Periodic sweep: the safety net behind the per-room Cloud Tasks.
 *
 * The per-room auto-close task can be lost (queue/region/signature changes, an
 * emulator restart, a deploy gap), leaving a room idle forever — exactly the
 * "orphan room" symptom. This sweep does not depend on any pre-scheduled task:
 * it scans open rooms on a fixed cron and closes whatever is genuinely idle
 * (including single-occupant "squatting" tables). It is also what reclaims
 * legacy rooms that predate the task pipeline.
 *
 * Each room is processed in its own transaction so one failure can't abort the
 * rest of the batch.
 *
 * @param {Object} [opts]
 * @param {number} [opts.nowMs] - Override "now" (for tests)
 * @param {number} [opts.idleTimeoutSeconds] - Idle threshold override (for tests)
 * @return {Promise<{scanned:number, closed:number, errors:number}>}
 */
export async function sweepIdleRooms(opts = {}) {
  const db = getFirestore();
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();

  const snapshot = await db
    .collection('pokerGames')
    .where('status', 'in', ['waiting', 'playing'])
    .get();

  let closed = 0;
  let errors = 0;

  for (const docSnap of snapshot.docs) {
    const gameId = docSnap.id;
    const gameRef = docSnap.ref;
    try {
      const result = await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(gameRef);
        if (!fresh.exists) return { skipped: 'gone' };
        const game = fresh.data();

        const verdict = evaluateRoomClose(game, nowMs, {
          idleTimeoutSeconds: opts.idleTimeoutSeconds,
        });
        if (!verdict.close) return { skipped: 'not_idle', idleSeconds: verdict.idleSeconds };

        return settleAndCloseRoom({
          transaction, db, gameRef, game, gameId, reason: verdict.reason,
        });
      });

      if (result?.closed) {
        closed += 1;
        console.log(`Sweep closed room ${gameId} (${result.seatedCount} seated)`);
      }
    } catch (error) {
      errors += 1;
      console.error(`Sweep failed for room ${gameId}:`, error?.message || error);
    }
  }

  const summary = { scanned: snapshot.size, closed, errors };
  console.log('Room sweep complete:', summary);
  return summary;
}
