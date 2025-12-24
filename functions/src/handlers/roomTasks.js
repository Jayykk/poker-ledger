/**
 * Room-related Cloud Task HTTP handlers
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createPokerHttpTask } from '../utils/cloudTasks.js';

const IDLE_TIMEOUT_SECONDS = 60 * 60; // 60 minutes
const RESCHEDULE_CHECK_SECONDS = 10 * 60; // if playing, re-check periodically
const MAX_PLAYING_RESCHEDULES = 3;

const DEFAULT_BUY_IN = 1000;

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

      // ===== READ PHASE (for settlement/history) =====
      const seatsObj = game.seats || {};
      const seatedPlayers = Object.values(seatsObj).filter((seat) => seat !== null);
      const isAlreadySettled = game.status === 'completed';

      // Pre-read user docs BEFORE any writes.
      const userRefs = seatedPlayers.map((player) => (
        db.collection('users').doc(player.odId)
      ));
      const userDocs = isAlreadySettled ? [] : await Promise.all(
        userRefs.map((ref) => transaction.get(ref)),
      );

      // ===== COMPUTE PHASE =====
      const settlement = seatedPlayers.map((p) => {
        const initialBuyIn = p.initialBuyIn || game.meta?.minBuyIn || DEFAULT_BUY_IN;
        const chips = Number(p.chips) || 0;
        return {
          odId: p.odId,
          name: p.odName,
          buyIn: initialBuyIn,
          stack: chips,
          profit: chips - initialBuyIn,
        };
      });

      // user history record format aligned with settlePokerGame
      const baseRecord = {
        date: new Date().toISOString(),
        createdAt: Date.now(),
        rate: 1,
        gameName: `Poker Game #${String(gameId).slice(0, 8)}`,
        gameType: 'online_poker',
        settlement,
        autoClosed: true,
        closedReason: 'idle_timeout',
      };

      const perUserRecords = settlement.reduce((acc, s) => {
        acc[s.odId] = {
          ...baseRecord,
          profit: s.profit,
        };
        return acc;
      }, {});

      // ===== WRITE PHASE =====
      // 1) Archive a room-level history snapshot
      const historyRef = gameRef.collection('history').doc();
      transaction.set(historyRef, {
        type: 'room_close',
        reason: 'idle_timeout',
        gameId,
        statusAtClose: game.status,
        meta: {
          mode: game.meta?.mode || null,
          blinds: game.meta?.blinds || null,
          createdAt: game.meta?.createdAt || null,
          lastActivityAt: game.meta?.lastActivityAt || null,
          createdBy: game.meta?.createdBy || null,
        },
        seatedCount: seatedPlayers.length,
        settlement,
        table: {
          pot: game.table?.pot || 0,
          currentRound: game.table?.currentRound || null,
          stage: game.table?.stage || null,
        },
        archivedAt: FieldValue.serverTimestamp(),
      });

      // 2) Auto-settle users (only if not already settled)
      if (!isAlreadySettled) {
        userDocs.forEach((docSnap, index) => {
          const ref = userRefs[index];
          const userId = ref.id;
          const record = perUserRecords[userId];
          if (!record) return;

          if (docSnap.exists) {
            transaction.update(ref, {
              history: FieldValue.arrayUnion(record),
            });
          } else {
            transaction.set(ref, {
              history: [record],
              createdAt: Date.now(),
            }, { merge: true });
          }
        });
      }

      // Avoid closing mid-hand; re-check later.
      if (game.status === 'playing') {
        if (playingChecks >= MAX_PLAYING_RESCHEDULES) {
          transaction.update(gameRef, {
            'status': 'closed',
            'meta.closedAt': FieldValue.serverTimestamp(),
            'meta.closedReason': 'idle_timeout',
          });

          return {
            closed: true,
            forcedCloseWhilePlaying: true,
            idleSeconds,
            playingChecks,
            archivedHistory: true,
            archivedHistoryId: historyRef.id,
            autoSettled: !isAlreadySettled,
          };
        }

        return {
          reschedule: true,
          delaySeconds: RESCHEDULE_CHECK_SECONDS,
          reason: 'game_playing',
          idleSeconds,
          playingChecks,
          archivedHistory: false,
        };
      }

      transaction.update(gameRef, {
        'status': 'closed',
        'meta.closedAt': FieldValue.serverTimestamp(),
        'meta.closedReason': 'idle_timeout',
      });

      return {
        closed: true,
        idleSeconds,
        archivedHistory: true,
        archivedHistoryId: historyRef.id,
        autoSettled: !isAlreadySettled,
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
