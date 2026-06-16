/**
 * Game Action Handlers
 * Player-driven actions: betting actions, timeouts, and voluntary card reveals.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import {
  processAction,
} from '../engines/texasHoldem.js';
import { validatePlayerAction as validateAction } from '../engines/actionValidator.js';
import {
  isLastManStanding,
  isRoundComplete,
  findNextPlayer,
} from '../engines/gameStateMachine.js';
import { addGameEvent } from '../lib/events.js';
import { createTurnExpiresAt } from './turnTimer.js';
import { GameErrorCodes, createGameError } from '../errors/gameErrors.js';
import { createPokerTask } from '../utils/cloudTasks.js';
import { createPokerHttpTask } from '../utils/cloudTasks.js';
import { createRoomAutoCloseTask } from '../utils/cloudTasks.js';
import { getHandIdFromGame } from '../utils/handHistories.js';
import {
  handleLastManStanding,
  advanceRound,
  isEffectiveAllIn,
  areBetsSettledForRunout,
  runoutToShowdown,
} from './gameFlow.js';

import {
  DEFAULT_TURN_TIMEOUT,
  SHOWDOWN_RESOLVE_DELAY_SECONDS,
  WIN_BY_FOLD_TIMEOUT_SECONDS,
  ROOM_IDLE_TIMEOUT_SECONDS,
} from '../utils/config.js';

/**
 * Process player action
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID
 * @param {string} action - Action type
 * @param {number} amount - Bet amount
 * @param {string} turnId - Turn UUID for zombie prevention
 * @return {Promise<Object>} Updated game state
 */
export async function handlePlayerAction(gameId, userId, action, amount = 0, turnId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  const autoCloseToken = uuidv4();

  // Transaction result will contain info needed for post-transaction task creation
  const result = await db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw createGameError(GameErrorCodes.GAME_NOT_FOUND);
    }

    let game = gameDoc.data();

    // Check if game is paused
    if (game.status === 'paused') {
      throw createGameError(GameErrorCodes.GAME_PAUSED);
    }

    // 🔑 Validate turnId to prevent stale actions
    if (turnId && turnId !== game.table.currentTurnId) {
      throw createGameError(GameErrorCodes.STALE_ACTION, {
        message: '此操作已過期',
      });
    }

    // Validate action using new validator
    validateAction(game, userId, action, amount);

    // Process the action
    game = processAction(game, userId, action, amount);

    // Reset consecutive auto actions on manual player action
    game.table.consecutiveAutoActions = 0;

    // The acting player is clearly present — clear their AFK strike streak so a
    // single earlier timeout doesn't carry over toward the sit-out threshold.
    const actorEntry = Object.entries(game.seats).find(([, s]) => s && s.odId === userId);
    if (actorEntry && actorEntry[1].afkStrikes) {
      game.seats[actorEntry[0]] = { ...actorEntry[1], afkStrikes: 0 };
    }

    // Record action in events subcollection
    const actionEventData = {
      type: 'action',
      handNumber: game.handNumber,
      odId: userId,
      action,
      amount,
      round: game.table.currentRound,
    };

    // Check for Last Man Standing
    if (isLastManStanding(game)) {
      // ✅ Pre-Read Pattern: ensure all reads happen before any writes in this transaction.
      // addGameEvent() performs transaction writes, and handleLastManStanding() needs
      // private/history reads.
      // So we prefetch what handleLastManStanding needs first.
      const playersInHand = Object.values(game.seats)
        .filter((seat) => seat && (seat.status === 'active' || seat.status === 'all_in'));
      let preFetchedSnapshots = null;

      if (playersInHand.length !== 1) {
        throw createGameError(GameErrorCodes.INVALID_ACTION, {
          message: 'Invalid last man standing state',
        });
      }

      const playerIds = Object.values(game.seats)
        .filter((seat) => seat !== null)
        .map((seat) => seat.odId);

      const privateRefs = playerIds.map((playerId) => (
        gameRef.collection('private').doc(playerId)
      ));
      const privateSnaps = await transaction.getAll(...privateRefs);

      const handId = getHandIdFromGame(game);
      const historyRefs = playerIds.map((userId) => (
        getFirestore()
          .collection('handHistories')
          .doc(`${gameRef.id}_${handId}_${userId}`)
      ));
      const historySnaps = await transaction.getAll(...historyRefs);
      const historySnapByUserId = {};
      historySnaps.forEach((snap, idx) => {
        historySnapByUserId[playerIds[idx]] = snap;
      });

      preFetchedSnapshots = {
        privateSnaps,
        historySnapByUserId,
      };

      await addGameEvent(gameId, actionEventData, transaction);
      const lms = await handleLastManStanding(transaction, gameRef, game, preFetchedSnapshots);
      transaction.update(gameRef, {
        'meta.lastActivityAt': FieldValue.serverTimestamp(),
        'meta.autoCloseToken': autoCloseToken,
      });
      return lms;
    }

    // Effective all-in: if 0 or only 1 player in the hand is NOT all-in,
    // there are no further betting decisions ONLY AFTER all pending calls are settled.
    // This prevents the common bug where an all-in raise triggers immediate runout
    // before opponents get a chance to call/fold.
    const shouldAutoRunout = isEffectiveAllIn(game) && areBetsSettledForRunout(game);
    if (shouldAutoRunout) {
      const runoutGame = await runoutToShowdown(game, transaction, gameRef);

      await addGameEvent(gameId, actionEventData, transaction);

      transaction.update(gameRef, {
        'meta.lastActivityAt': FieldValue.serverTimestamp(),
        'meta.autoCloseToken': autoCloseToken,
      });

      const isAutoNext = runoutGame.table?.isAutoNext ?? false;
      const canAutoStart = isAutoNext && runoutGame.status === 'waiting';
      return {
        gameId,
        action,
        nextRound: runoutGame.table.currentRound,
        nextTurn: null,
        nextTurnId: null,
        showdownId: null,
        shouldCreateShowdownTask: false,
        shouldCreateStartNextHandTask: canAutoStart,
        nextHandId: runoutGame.table?.nextHandId || null,
        turnTimeout: runoutGame.table?.turnTimeout || DEFAULT_TURN_TIMEOUT,
        shouldCreateTask: false,
      };
    }

    // Check if betting round is complete
    if (isRoundComplete(game)) {
      game = await advanceRound(game, transaction, gameRef);
    } else {
      // Move to next player with new turnId
      const nextPlayer = findNextPlayer(game);
      game.table.currentTurn = nextPlayer;
      game.table.currentTurnId = uuidv4(); // Generate new UUID
    }

    // 1. 寫入剛剛暫存的 Action Event (延遲到這裡才寫)
    await addGameEvent(gameId, actionEventData, transaction);

    // If the action completed the hand (showdown resolved immediately), do not restart turn timers.
    if (game.table?.stage === 'showdown_complete' || game.status !== 'playing' || game.table?.currentTurn === null) {
      const isAutoNext = game.table?.isAutoNext ?? false;
      const canAutoStart = isAutoNext && game.status === 'waiting';

      transaction.update(gameRef, {
        'meta.lastActivityAt': FieldValue.serverTimestamp(),
        'meta.autoCloseToken': autoCloseToken,
      });

      return {
        gameId,
        action,
        nextRound: game.table.currentRound,
        nextTurn: null,
        nextTurnId: null,
        showdownId: null,
        shouldCreateShowdownTask: false,
        shouldCreateStartNextHandTask: canAutoStart,
        nextHandId: game.table?.nextHandId || null,
        turnTimeout: game.table?.turnTimeout || DEFAULT_TURN_TIMEOUT,
        shouldCreateTask: false,
      };
    }

    // Get turn timeout setting
    const turnTimeout = game.table?.turnTimeout || DEFAULT_TURN_TIMEOUT;

    // Update game state with turnStartedAt and turnExpiresAt merged into table
    const gameToUpdate = {
      ...game,
      table: {
        ...game.table,
        turnStartedAt: FieldValue.serverTimestamp(),
        turnExpiresAt: createTurnExpiresAt(turnTimeout),
        turnTimeout,
      },
      meta: {
        ...(game.meta || {}),
        lastActivityAt: FieldValue.serverTimestamp(),
        autoCloseToken,
      },
    };
    transaction.update(gameRef, gameToUpdate);

    // Return data needed for post-transaction task creation
    return {
      gameId,
      action,
      nextRound: game.table.currentRound,
      nextTurn: game.table.currentTurn,
      nextTurnId: game.table.currentTurnId,
      showdownId: game.table.showdownId || null,
      shouldCreateShowdownTask: game.table?.stage === 'showdown' && !!game.table.showdownId,
      shouldCreateStartNextHandTask: false,
      nextHandId: null,
      turnTimeout,
      shouldCreateTask: game.table.currentTurn !== null && game.status === 'playing',
    };
  });

  // 🔑 POST-TRANSACTION: Create Cloud Tasks only after transaction succeeds (fire-and-forget)
  const postTxTasks = [];

  if (result.shouldCreateTask && result.nextTurnId) {
    postTxTasks.push(
      createPokerTask(gameId, result.nextTurnId, result.turnTimeout)
        .catch((err) => console.error('Turn task creation failed:', err)),
    );
  }

  // New flow: showdown is resolved immediately in-transaction.
  // Schedule next hand start after a short admire window.
  if (result.shouldCreateStartNextHandTask && result.nextHandId) {
    const delaySeconds = typeof result.nextHandDelaySeconds === 'number' ?
      result.nextHandDelaySeconds :
      SHOWDOWN_RESOLVE_DELAY_SECONDS;
    postTxTasks.push(
      createPokerHttpTask({
        endpoint: 'handleStartNextHand',
        payload: {
          gameId,
          nextHandId: result.nextHandId,
          timestamp: Date.now(),
        },
        delaySeconds,
        logLabel: `nextHandId: ${result.nextHandId}`,
      }).catch((err) => console.error('Start next hand task failed:', err)),
    );
  }

  if (result.shouldCreateWinByFoldTask && result.winByFoldId) {
    postTxTasks.push(
      createPokerHttpTask({
        endpoint: 'handleWinByFoldTimeout',
        payload: {
          gameId,
          winByFoldId: result.winByFoldId,
          timestamp: Date.now(),
        },
        delaySeconds: WIN_BY_FOLD_TIMEOUT_SECONDS,
        logLabel: `winByFoldId: ${result.winByFoldId}`,
      }).catch((err) => console.error('Win-by-fold task failed:', err)),
    );
  }

  // Best-effort (fire-and-forget): delay auto-close after any manual action.
  postTxTasks.push(
    createRoomAutoCloseTask(gameId, autoCloseToken, ROOM_IDLE_TIMEOUT_SECONDS)
      .catch((err) => console.error('Auto-close task creation failed:', err)),
  );

  // Fire all tasks in parallel, don't block the response
  Promise.all(postTxTasks).catch(() => {});

  return result;
}

/**
 * Show cards voluntarily (before or after showdown)
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID
 * @return {Promise<void>}
 */
export async function showCards(gameId, userId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw createGameError(GameErrorCodes.GAME_NOT_FOUND);
    }

    const game = gameDoc.data();

    // Rule: During betting rounds (pre-showdown), players cannot show cards.
    // The only allowed voluntary reveal is after a win-by-fold, by the winner.
    const stage = game.table?.stage;
    const lastHand = game.table?.lastHand;
    const isWinByFold = stage === 'win_by_fold' && lastHand?.endReason === 'win_by_fold';

    if (!isWinByFold || lastHand?.winnerId !== userId) {
      throw createGameError(GameErrorCodes.INVALID_ACTION, {
        message: 'Cards cannot be shown at this time',
        stage,
      });
    }

    // If already revealed, no-op.
    const alreadyRevealed = Object.values(game.seats || {}).some((seat) => (
      seat &&
      seat.odId === userId &&
      Array.isArray(seat.holeCards) &&
      seat.holeCards.length > 0
    ));
    if (alreadyRevealed) {
      return {
        gameId,
        userId,
        alreadyRevealed: true,
      };
    }

    // Verify user is in the game
    const playerSeat = Object.entries(game.seats).find(([, seat]) => seat && seat.odId === userId);

    if (!playerSeat) {
      throw new Error('Player not in game');
    }

    // Get player's hole cards from private collection
    const privateRef = gameRef.collection('private').doc(userId);
    const privateDoc = await transaction.get(privateRef);

    if (!privateDoc.exists) {
      throw new Error('No cards to show');
    }

    const holeCards = privateDoc.data().holeCards;

    const [seatNumStr, seat] = playerSeat;
    const seatNum = Number(seatNumStr);
    if (!Number.isFinite(seatNum)) {
      throw new Error('Invalid seat number');
    }

    // SECURITY: Persist reveal only into the PUBLIC seat holeCards (legal reveal).
    const seats = { ...game.seats };
    seats[seatNum] = {
      ...seat,
      holeCards,
    };
    transaction.update(gameRef, {
      seats,
      'table.lastHand.voluntaryShowByWinner': true,
    });

    // Record shown cards in events subcollection
    // Note: Changed from arrayUnion to subcollection documents because
    // FieldValue.serverTimestamp() cannot be used inside array elements
    await addGameEvent(
      gameId,
      {
        type: 'shownCards',
        handNumber: lastHand?.handNumber ?? game.handNumber,
        odId: userId,
        cards: holeCards,
      },
      transaction,
    );

    return {
      gameId,
      userId,
      cards: holeCards,
    };
  });
}

/**
 * Handle player timeout
 * Auto-fold if there's a bet to call, otherwise check
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID
 * @return {Promise<Object>} Result of timeout action
 */
export async function handlePlayerTimeout(gameId, userId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw createGameError(GameErrorCodes.GAME_NOT_FOUND);
    }

    const game = gameDoc.data();

    // Verify it's the player's turn
    if (game.table.currentTurn !== userId) {
      throw new Error('Not player\'s turn');
    }

    // Find player seat
    const playerSeat = Object.entries(game.seats).find(
      ([, seat]) => seat && seat.odId === userId,
    );

    if (!playerSeat) {
      throw new Error('Player not in game');
    }

    const [seatNum, seat] = playerSeat;

    // Determine action: fold if bet to call, otherwise check
    // Calculate call amount using roundBet (fixed bug: was using currentBet)
    const toCall = game.table.currentBet - (seat.roundBet || 0);
    const action = toCall <= 0 ? 'check' : 'fold';

    // Mark player as timed out
    const seats = { ...game.seats };
    seats[seatNum] = {
      ...seat,
      timedOut: true,
      lastTimeout: FieldValue.serverTimestamp(),
    };

    // Update game with timeout marker
    transaction.update(gameRef, { seats });

    // Process the automatic action through the normal flow
    // This ensures all game logic is consistently applied
    return {
      gameId,
      userId,
      action,
      automatic: true,
    };
  });
}
