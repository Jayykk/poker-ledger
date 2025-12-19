/**
 * Turn Timer Handler using Cloud Tasks
 * Manages turn timeouts in the backend to prevent client-side timer issues
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import { processAction } from '../engines/texasHoldem.js';
import {
  isLastManStanding,
  isRoundComplete,
  findNextPlayer,
} from '../engines/gameStateMachine.js';
import { addGameEvent } from '../lib/events.js';
import { createPokerTask } from '../utils/cloudTasks.js';
import { handleLastManStanding, advanceRound } from './game.js';

// Constants
const DEFAULT_TURN_TIMEOUT = 30; // seconds

/**
 * Handle turn timeout - HTTP endpoint for Cloud Tasks
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 */
export async function handleTurnTimeoutHttp(req, res) {
  const { gameId, turnId } = req.body;

  if (!gameId || !turnId) {
    return res.status(400).json({ error: 'Missing gameId or turnId' });
  }

  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const gameDoc = await transaction.get(gameRef);

      if (!gameDoc.exists) {
        return { success: false, reason: 'game_not_found' };
      }

      let game = gameDoc.data();

      // 🔑 ZOMBIE CHECK: Ignore if turnId doesn't match
      if (turnId !== game.table.currentTurnId) {
        console.log(`Zombie task ignored - turnId mismatch: ${turnId} !== ${game.table.currentTurnId}`);
        return { success: true, zombie: true };
      }

      // Check if game is still active
      if (game.status !== 'playing') {
        console.log(`Turn timeout ignored - game not active (${game.status})`);
        return { success: false, reason: 'game_not_active' };
      }

      const currentPlayerId = game.table.currentTurn;
      console.log(`Processing turn timeout for player ${currentPlayerId} in game ${gameId}`);

      // Track consecutive auto-actions (timeouts). Manual player actions reset this counter.
      const consecutiveAutoActions = (game.table.consecutiveAutoActions || 0) + 1;
      game.table.consecutiveAutoActions = consecutiveAutoActions;

      // AFK protection (no auto-pause): if every player has timed out consecutively,
      // disable auto-next so the next hand requires a manual start.
      const playerCount = Object.values(game.seats)
        .filter((s) => s && s.status !== 'folded' && s.status !== 'sitting_out').length;
      if (playerCount > 0 && consecutiveAutoActions >= playerCount) {
        game.table.isAutoNext = false;
        game.table.autoNextDisabledReason = 'afk_protection';
      }

      // Auto action on timeout:
      // - If there's a bet to call, fold
      // - Otherwise, check
      const currentSeat = Object.values(game.seats)
        .find((seat) => seat && seat.odId === currentPlayerId);

      const toCall = (game.table.currentBet || 0) - (currentSeat?.roundBet || 0);
      const timeoutAction = toCall <= 0 ? 'check' : 'fold';

      game = processAction(game, currentPlayerId, timeoutAction, 0);

      // Record timeout event
      await addGameEvent(
        gameId,
        {
          type: 'timeout',
          handNumber: game.handNumber,
          odId: currentPlayerId,
          action: timeoutAction,
          round: game.table.currentRound,
        },
        transaction,
      );

      // Check for Last Man Standing
      if (isLastManStanding(game)) {
        const lmsResult = await handleLastManStanding(transaction, gameRef, game);
        return { ...lmsResult, shouldCreateTask: false };
      }

      // Check if betting round is complete
      if (isRoundComplete(game)) {
        game = await advanceRound(game, transaction, gameRef);
      } else {
        // Move to next player
        const nextPlayer = findNextPlayer(game);
        game.table.currentTurn = nextPlayer;
        game.table.currentTurnId = uuidv4();
      }

      // Update game state
      const turnTimeout = game.table?.turnTimeout || DEFAULT_TURN_TIMEOUT;
      const gameToUpdate = {
        ...game,
        table: {
          ...game.table,
          turnStartedAt: FieldValue.serverTimestamp(),
          turnExpiresAt: createTurnExpiresAt(turnTimeout),
          turnTimeout,
        },
      };
      transaction.update(gameRef, gameToUpdate);

      return {
        success: true,
        gameId,
        action: timeoutAction,
        nextTurn: game.table.currentTurn,
        nextTurnId: game.table.currentTurnId,
        turnTimeout,
        shouldCreateTask: game.table.currentTurn !== null && game.status === 'playing',
        consecutiveAutoActions,
        isAutoNext: game.table.isAutoNext,
      };
    });

    // 🔑 POST-TRANSACTION: Create next timeout task only after transaction succeeds
    if (result.shouldCreateTask && result.nextTurnId) {
      await createPokerTask(gameId, result.nextTurnId, result.turnTimeout);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error handling turn timeout:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Create turn expiration timestamp
 * @param {number} timeoutSeconds - Timeout duration in seconds
 * @return {Object} Firestore timestamp
 */
export function createTurnExpiresAt(timeoutSeconds = DEFAULT_TURN_TIMEOUT) {
  const expiresAt = new Date(Date.now() + timeoutSeconds * 1000);
  return expiresAt;
}
