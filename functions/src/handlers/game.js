/**
 * Game Flow Handlers
 * Functions for managing game progression
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import {
  initializeHand,
  dealHoleCards,
  dealFlop,
  dealTurnOrRiver,
  processAction,
} from '../engines/texasHoldem.js';
import { validateGameStart } from '../utils/validators.js';
import { validatePlayerAction as validateAction } from '../engines/actionValidator.js';
import {
  isLastManStanding,
  isRoundComplete,
  findNextPlayer,
  getFirstToAct,
} from '../engines/gameStateMachine.js';
import { addGameEvent } from '../lib/events.js';
import { createTurnExpiresAt } from './turnTimer.js';
import { GameErrorCodes, createGameError } from '../errors/gameErrors.js';
import { calculateSidePots, distributePots } from '../engines/potCalculator.js';
import { determineWinners } from '../utils/handEvaluator.js';
import { createPokerTask } from '../utils/cloudTasks.js';
import { createPokerHttpTask } from '../utils/cloudTasks.js';
import { getHandIdFromGame, writeHandHistoryEntry } from '../utils/handHistories.js';

// Constants
const DEFAULT_BUY_IN = 1000;
const DEFAULT_TURN_TIMEOUT = 30;
// UX: Pause at showdown so players can see runout + hand comparison.
// Cloud Tasks scheduleTime is second-granular; use 5s to avoid feeling instant.
const SHOWDOWN_RESOLVE_DELAY_SECONDS = 5;
const SHOWDOWN_ADMIRE_TIME_MS = 5000;
const WIN_BY_FOLD_TIMEOUT_SECONDS = 5;

/**
 * Effective all-in condition:
 * If 0 or only 1 player in the hand is NOT all-in, there are no further betting decisions.
 * (Everyone else is all-in or folded.)
 * @param {Object} game
 * @return {boolean}
 */
function isEffectiveAllIn(game) {
  const playersInHand = Object.values(game.seats)
    .filter((seat) => seat && (seat.status === 'active' || seat.status === 'all_in'));
  if (playersInHand.length <= 1) return false;

  const nonAllInCount = playersInHand
    .filter((seat) => seat.status !== 'all_in').length;

  return nonAllInCount <= 1;
}

/**
 * Betting is "settled" for auto-runout purposes when there is no pending call
 * for any ACTIVE (non-all-in) player.
 *
 * Important: we only compare ACTIVE players against currentBet.
 * All-in players may have roundBet < currentBet (short all-in), which is valid.
 * @param {Object} game
 * @return {boolean}
 */
function areBetsSettledForRunout(game) {
  const currentBet = game.table?.currentBet || 0;
  const activeSeats = Object.values(game.seats)
    .filter((seat) => seat && seat.status === 'active');

  return activeSeats.every((seat) => (seat.roundBet || 0) === currentBet);
}

/**
 * Run out remaining community cards to river and enter showdown (early reveal).
 * @param {Object} game
 * @param {Object} transaction
 * @param {Object} gameRef
 * @return {Promise<Object>}
 */
async function runoutToShowdown(game, transaction, gameRef) {
  let runoutGame = game;
  const round = runoutGame.table.currentRound;

  if (round === 'preflop') {
    runoutGame = dealFlop(runoutGame);
    runoutGame = dealTurnOrRiver(runoutGame, 'turn');
    runoutGame = dealTurnOrRiver(runoutGame, 'river');
  } else if (round === 'flop') {
    runoutGame = dealTurnOrRiver(runoutGame, 'turn');
    runoutGame = dealTurnOrRiver(runoutGame, 'river');
  } else if (round === 'turn') {
    runoutGame = dealTurnOrRiver(runoutGame, 'river');
  }

  // New flow: resolve showdown immediately (no delayed resolve task).
  return await resolveShowdownImmediately(runoutGame, transaction, gameRef);
}

/**
 * Resolve showdown immediately inside the transaction.
 * This computes winners + distributes pots synchronously, then sets an "admire" timer.
 * @param {Object} game
 * @param {Object} transaction
 * @param {Object} gameRef
 * @return {Promise<Object>} Updated game state
 */
async function resolveShowdownImmediately(game, transaction, gameRef) {
  // handleShowdown() performs the full READ → COMPUTE → WRITE pipeline (including payouts).
  const resolved = await handleShowdown(game, transaction, gameRef);

  // Add a short "admire" window before the next hand can auto-start.
  // Use client-readable epoch millis for consistency with existing UI conversions.
  const nextHandId = uuidv4();
  transaction.update(gameRef, {
    'table.turnExpiresAt': Date.now() + SHOWDOWN_ADMIRE_TIME_MS,
    'table.showdownEndTime': Date.now() + SHOWDOWN_ADMIRE_TIME_MS,
    'table.nextHandId': nextHandId,
  });

  return {
    ...resolved,
    table: {
      ...resolved.table,
      turnExpiresAt: Date.now() + SHOWDOWN_ADMIRE_TIME_MS,
      showdownEndTime: Date.now() + SHOWDOWN_ADMIRE_TIME_MS,
      nextHandId,
    },
  };
}

/**
 * Start a new hand
 * @param {string} gameId - Game ID
 * @return {Promise<Object>} Updated game state
 */
export async function startHand(gameId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  const result = await db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw new Error('Game not found');
    }

    let game = gameDoc.data();

    try {
      // Validate can start
      const validation = validateGameStart(game);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Initialize new hand
      game = initializeHand(game);

      // Deal hole cards
      const { game: updatedGame, holeCards } = dealHoleCards(game);

      // SECURITY/UX: Explicitly clear any previously revealed public hole cards
      // at the start of the next hand to prevent flash of last hand's cards.
      const clearedSeats = { ...(updatedGame.seats || {}) };
      Object.keys(clearedSeats).forEach((seatNum) => {
        if (clearedSeats[seatNum]) {
          clearedSeats[seatNum] = {
            ...clearedSeats[seatNum],
            holeCards: null,
          };
        }
      });

      // Get turn timeout setting
      const turnTimeout = updatedGame.table?.turnTimeout || DEFAULT_TURN_TIMEOUT;

      // Update game state with turnStartedAt and turnExpiresAt merged into table
      const gameToUpdate = {
        ...updatedGame,
        seats: clearedSeats,
        table: {
          ...updatedGame.table,
          // Preserve correct pot math if someone left mid-hand previously
          deadContributors: [],
          // Reset any previous-hand reveal/muck metadata
          stage: null,
          lastHand: null,
          handResult: null,
          turnStartedAt: FieldValue.serverTimestamp(),
          turnExpiresAt: createTurnExpiresAt(turnTimeout),
          turnTimeout,
          isAutoNext: true, // Re-enable auto-next on manual start
        },
      };
      transaction.update(gameRef, gameToUpdate);

      // Store private hole cards
      Object.entries(holeCards).forEach(([playerId, cards]) => {
        const privateRef = gameRef.collection('private').doc(playerId);
        transaction.set(privateRef, { holeCards: cards });
      });

      return {
        gameId,
        handNumber: updatedGame.handNumber,
        currentTurn: updatedGame.table.currentTurn,
        currentTurnId: updatedGame.table.currentTurnId,
        turnTimeout,
        shouldCreateTask: updatedGame.table.currentTurn !== null && updatedGame.status === 'playing',
      };
    } catch (error) {
      const message = typeof error?.message === 'string' ? error.message : String(error);

      if (message.includes('Need at least 2 players')) {
        console.warn('Not enough players to start. Setting game to waiting.');

        transaction.update(gameRef, {
          'status': 'waiting',
          'table.stage': 'waiting',
          'table.currentTurn': null,
          'table.currentTurnId': null,
          'table.currentRound': null,
          'table.pot': 0,
          'table.communityCards': [],
          // Clear timers to avoid countdown/turn UI getting stuck.
          'table.turnStartedAt': null,
          'table.turnExpiresAt': null,
          // Clear per-hand result so UI doesn't assume an active hand.
          'table.handResult': null,
        });

        return {
          gameId,
          shouldCreateTask: false,
          started: false,
          setWaiting: true,
          reason: 'not_enough_players',
        };
      }

      throw error;
    }
  });

  // 🔑 POST-TRANSACTION: Create Cloud Task only after transaction succeeds
  if (result.shouldCreateTask && result.currentTurnId) {
    await createPokerTask(gameId, result.currentTurnId, result.turnTimeout);
  }

  return result;
}

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
      return await handleLastManStanding(transaction, gameRef, game, preFetchedSnapshots);
    }

    // Effective all-in: if 0 or only 1 player in the hand is NOT all-in,
    // there are no further betting decisions ONLY AFTER all pending calls are settled.
    // This prevents the common bug where an all-in raise triggers immediate runout
    // before opponents get a chance to call/fold.
    const shouldAutoRunout = isEffectiveAllIn(game) && areBetsSettledForRunout(game);
    if (shouldAutoRunout) {
      const runoutGame = await runoutToShowdown(game, transaction, gameRef);

      await addGameEvent(gameId, actionEventData, transaction);

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

  // 🔑 POST-TRANSACTION: Create Cloud Task only after transaction succeeds
  if (result.shouldCreateTask && result.nextTurnId) {
    await createPokerTask(gameId, result.nextTurnId, result.turnTimeout);
  }

  // New flow: showdown is resolved immediately in-transaction.
  // Schedule next hand start after a short admire window.
  if (result.shouldCreateStartNextHandTask && result.nextHandId) {
    await createPokerHttpTask({
      endpoint: 'handleStartNextHand',
      payload: {
        gameId,
        nextHandId: result.nextHandId,
        timestamp: Date.now(),
      },
      delaySeconds: SHOWDOWN_RESOLVE_DELAY_SECONDS,
      logLabel: `nextHandId: ${result.nextHandId}`,
    });
  }

  if (result.shouldCreateWinByFoldTask && result.winByFoldId) {
    await createPokerHttpTask({
      endpoint: 'handleWinByFoldTimeout',
      payload: {
        gameId,
        winByFoldId: result.winByFoldId,
        timestamp: Date.now(),
      },
      delaySeconds: WIN_BY_FOLD_TIMEOUT_SECONDS,
      logLabel: `winByFoldId: ${result.winByFoldId}`,
    });
  }

  return result;
}

/**
 * Handle Last Man Standing scenario
 * Uses proper transaction ordering: READ → COMPUTE → WRITE
 * Optimized to avoid listDocuments() call by using game state
 * @param {Object} transaction - Firestore transaction
 * @param {Object} gameRef - Game document reference
 * @param {Object} game - Current game state
 * @param {Object|null} preFetchedSnapshots - Optional pre-read snapshots to avoid transaction reads
 * @return {Promise<Object>} Result
 */
export async function handleLastManStanding(
  transaction,
  gameRef,
  game,
  preFetchedSnapshots = null,
) {
  // ===== READ PHASE =====
  // Efficiently get all private documents by deriving player IDs from seats
  // This avoids the extra listDocuments() API call
  const privateCollection = gameRef.collection('private');
  const playerIds = Object.values(game.seats)
    .filter((seat) => seat !== null)
    .map((seat) => seat.odId);

  // Identify winner/targets purely from current game state (no writes yet)
  // NOTE: winner may be 'all_in' if they shoved and opponent folded.
  const playersInHand = Object.values(game.seats)
    .filter((seat) => seat && (seat.status === 'active' || seat.status === 'all_in'));

  if (playersInHand.length !== 1) {
    throw createGameError(GameErrorCodes.INVALID_ACTION, {
      message: 'Invalid last man standing state',
    });
  }

  const winner = playersInHand[0];

  /**
   * Optional pre-read snapshots to satisfy Firestore transaction ordering.
   * When provided, handleLastManStanding will not perform any transaction reads.
   *
   * @typedef {Object} LastManStandingPreFetchedSnapshots
   * @property {import('firebase-admin/firestore').DocumentSnapshot[]} [privateSnaps]
  * @property {Record<string, import('firebase-admin/firestore').DocumentSnapshot>}
  *   [historySnapByUserId]
   */
  // PRE-READ: private hole cards for all seated players
  const privateRefs = playerIds.map((playerId) => (
    privateCollection.doc(playerId)
  ));
  const privateSnaps = Array.isArray(preFetchedSnapshots?.privateSnaps) ?
    preFetchedSnapshots.privateSnaps :
    await transaction.getAll(...privateRefs);

  const holeCards = {};
  privateSnaps.forEach((snap) => {
    if (!snap?.exists) return;
    // Private docs are keyed by userId
    holeCards[snap.id] = snap.data()?.holeCards || [];
  });

  // PRE-READ: hand history docs existence for all seated players (to avoid read-after-write)
  const handId = getHandIdFromGame(game);
  const historySnapByUserId = preFetchedSnapshots?.historySnapByUserId || null;
  let resolvedHistorySnapByUserId = historySnapByUserId;

  if (!resolvedHistorySnapByUserId) {
    const historyRefs = playerIds.map((userId) => (
      getFirestore()
        .collection('handHistories')
        .doc(`${gameRef.id}_${handId}_${userId}`)
    ));
    const historySnaps = await transaction.getAll(...historyRefs);
    resolvedHistorySnapByUserId = {};
    historySnaps.forEach((snap, idx) => {
      resolvedHistorySnapByUserId[playerIds[idx]] = snap;
    });
  }

  // ===== COMPUTE PHASE =====
  const winAmount = game.table.pot;

  // Find winner's seat and award pot
  const winnerSeat = Object.entries(game.seats)
    .find(([, seat]) => seat && seat.odId === winner.odId);

  if (winnerSeat) {
    const [seatNum] = winnerSeat;
    game.seats[seatNum].chips += winAmount;
  }

  // Clear pot
  game.table.pot = 0;

  // Return to WAITING state (not auto-start)
  game.status = 'waiting';
  game.table.currentRound = null;
  game.table.currentTurn = null;
  game.table.currentTurnId = null;
  game.table.communityCards = [];

  // Mark the hand as ended by fold and allow winner to optionally reveal cards.
  // Default is muck (no reveal).
  game.table.stage = 'win_by_fold';
  game.table.lastHand = {
    handNumber: game.handNumber,
    endReason: 'win_by_fold',
    winnerId: winner.odId,
    winnerName: winner.odName,
    winByFoldId: uuidv4(),
    completedAt: FieldValue.serverTimestamp(),
  };
  game.table.handResult = null;

  // SECURITY: Ensure no public hole cards leak after win-by-fold.
  Object.keys(game.seats).forEach((num) => {
    if (game.seats[num]) {
      game.seats[num].holeCards = null;
    }
  });

  // ===== WRITE PHASE =====
  // Archive hole cards for analytics for everyone still seated in this hand.
  // Players who left mid-hand are archived during leaveSeat.
  for (const [, seat] of Object.entries(game.seats)) {
    if (!seat) continue;
    const userId = seat.odId;
    const outcome = userId === winner.odId ? 'win_by_fold' : 'fold';
    // Only write if we have a private snapshot (i.e. cards were dealt)
    const cards = holeCards[userId];
    if (Array.isArray(cards) && cards.length) {
      await writeHandHistoryEntry(
        transaction,
        {
          gameId: gameRef.id,
          handId,
          userId,
          holeCards: cards,
          outcome,
        },
        {
          skipIfExists: true,
          existingSnapshot: resolvedHistorySnapByUserId?.[userId] || null,
        },
      );
    }
  }

  // Update game state
  transaction.update(gameRef, game);

  // Record result event
  await addGameEvent(
    gameRef.id,
    {
      type: 'lastManStanding',
      handNumber: game.handNumber,
      winner: winner.odId,
      winnerName: winner.odName,
      amount: winAmount,
    },
    transaction,
  );

  // Save hand history
  const handRef = gameRef.collection('hands').doc(`hand_${game.handNumber}`);
  transaction.set(handRef, {
    result: {
      winners: [{
        odId: winner.odId,
        amount: winAmount,
        reason: 'last_man_standing',
      }],
      pot: winAmount,
    },
    notable: true,
    notableReasons: {
      lastManStanding: true,
    },
  }, { merge: true });

  // Clean up private hole cards for everyone EXCEPT the winner.
  // We keep the winner's private cards temporarily so they can choose to "Show".
  for (const docRef of privateRefs) {
    if (docRef.id !== winner.odId) {
      transaction.delete(docRef);
    }
  }

  return {
    gameId: gameRef.id,
    winner: winner.odId,
    amount: winAmount,
    reason: 'last_man_standing',
    shouldCreateTask: false,
    shouldCreateWinByFoldTask: true,
    winByFoldId: game.table.lastHand.winByFoldId,
  };
}

/**
 * Advance to next betting round
 * @param {Object} game - Current game state
 * @param {Object} transaction - Firestore transaction
 * @param {Object} gameRef - Game document reference
 * @return {Promise<Object>} Updated game state
 */
export async function advanceRound(game, transaction, gameRef) {
  const { currentRound } = game.table;

  // Reset round bets and turnActed for new round
  const seats = { ...game.seats };
  Object.keys(seats).forEach((seatNum) => {
    if (seats[seatNum]) {
      seats[seatNum].roundBet = 0;
      seats[seatNum].turnActed = false;
    }
  });

  let updatedGame = { ...game, seats };

  switch (currentRound) {
  case 'preflop':
    updatedGame = dealFlop(updatedGame);
    break;
  case 'flop':
    updatedGame = dealTurnOrRiver(updatedGame, 'turn');
    break;
  case 'turn':
    updatedGame = dealTurnOrRiver(updatedGame, 'river');
    break;
  case 'river':
    // Resolve showdown immediately (winner calculation + pot distribution happens now).
    updatedGame = await resolveShowdownImmediately(updatedGame, transaction, gameRef);
    break;
  }

  // Set next player to act with new turnId
  if (updatedGame.table.currentRound !== 'showdown') {
    const nextPlayer = getFirstToAct(updatedGame);
    if (nextPlayer) {
      updatedGame.table.currentTurn = nextPlayer;
      updatedGame.table.currentTurnId = uuidv4(); // Generate new UUID
    } else {
      // Safeguard: if nobody can legally act, avoid leaving the hand stuck.
      // When we're effectively all-in, just run out and move to showdown.
      if (isEffectiveAllIn(updatedGame)) {
        updatedGame = await runoutToShowdown(updatedGame, transaction, gameRef);
      } else {
        updatedGame.table.currentTurn = null;
        updatedGame.table.currentTurnId = null;
      }
    }
  }

  return updatedGame;
}

/**
 * Resolve a showdown after a short delay (called by Cloud Tasks).
 * Uses showdownId for zombie prevention.
 * @param {string} gameId - Game ID
 * @param {string} showdownId - Showdown ID
 * @return {Promise<Object>} Result
 */
export async function resolveShowdown(gameId, showdownId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists) {
      return { ignored: true, reason: 'game_not_found' };
    }

    const game = gameDoc.data();
    if (game.table?.stage !== 'showdown' || game.table?.showdownId !== showdownId) {
      return { ignored: true, reason: 'stale_showdown_task' };
    }

    // Re-use existing showdown logic (compute + write) now that cards are already revealed.
    // Note: This will delete private hole cards at the end.
    await handleShowdown(game, transaction, gameRef);
    return { resolved: true };
  });
}

/**
 * Win-by-fold timeout (called by Cloud Tasks).
 * If winner didn't voluntarily show within timeout window, default to muck
 * and immediately start the next hand.
 * @param {string} gameId - Game ID
 * @param {string} winByFoldId - Zombie prevention id
 * @return {Promise<Object>} Result
 */
export async function winByFoldTimeout(gameId, winByFoldId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  const state = await db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    if (!gameDoc.exists) {
      return { ignored: true, reason: 'game_not_found' };
    }

    const game = gameDoc.data();
    const stage = game.table?.stage;
    const lastHand = game.table?.lastHand;
    const isWinByFold = stage === 'win_by_fold' && lastHand?.endReason === 'win_by_fold';

    if (!isWinByFold || lastHand?.winByFoldId !== winByFoldId) {
      return { ignored: true, reason: 'stale_win_by_fold_task' };
    }

    // If winner already chose to show, do not auto-muck.
    if (lastHand?.voluntaryShowByWinner === true) {
      return { ignored: true, reason: 'winner_already_showed' };
    }

    const isAutoNext = game.table?.isAutoNext ?? false;

    // Mark as expired (best-effort metadata)
    transaction.update(gameRef, {
      'table.lastHand.voluntaryShowExpired': true,
      'table.lastHand.voluntaryShowExpiredAt': FieldValue.serverTimestamp(),
    });

    return { startNext: isAutoNext, isAutoNext };
  });

  if (state.startNext) {
    // Start next hand immediately (muck by default).
    const result = await startHand(gameId);

    // startHand() performs an in-transaction recovery write for low player count.
    if (result?.setWaiting === true && result?.reason === 'not_enough_players') {
      return {
        startedNextHand: false,
        autoStartFailed: true,
        reason: 'not_enough_players',
        setWaiting: true,
      };
    }

    return { startedNextHand: true };
  }

  return state;
}

/**
 * Handle showdown and distribute winnings
 * Uses proper transaction ordering: READ → COMPUTE → WRITE
 * Optimized to avoid listDocuments() call by using game state
 * @param {Object} game - Current game state
 * @param {Object} transaction - Firestore transaction
 * @param {Object} gameRef - Game document reference
 * @return {Promise<Object>} Updated game state
 */
async function handleShowdown(game, transaction, gameRef) {
  const db = getFirestore();

  // ===== READ PHASE =====
  // Efficiently get all private documents by deriving player IDs from seats
  // This avoids the extra listDocuments() API call
  const privateCollection = gameRef.collection('private');
  const playerIds = Object.values(game.seats)
    .filter((seat) => seat !== null)
    .map((seat) => seat.odId);

  // PRE-READ: private hole cards for all seated players (Promise.all)
  const privateRefs = playerIds.map((playerId) => privateCollection.doc(playerId));
  const privateSnaps = await Promise.all(privateRefs.map((ref) => transaction.get(ref)));

  const holeCards = {};
  privateSnaps.forEach((snap, idx) => {
    if (!snap.exists) return;
    const playerId = playerIds[idx];
    holeCards[playerId] = snap.data()?.holeCards || [];
  });

  // PRE-READ: hand history docs existence for all seated players (to avoid read-after-write)
  const handId = getHandIdFromGame(game);
  const historyRefs = playerIds.map((userId) => (
    db
      .collection('handHistories')
      .doc(`${gameRef.id}_${handId}_${userId}`)
  ));
  const historySnaps = await Promise.all(historyRefs.map((ref) => transaction.get(ref)));
  const historySnapByUserId = {};
  historySnaps.forEach((snap, idx) => {
    historySnapByUserId[playerIds[idx]] = snap;
  });

  // Get active players who haven't folded (for showdown evaluation)
  const activePlayers = Object.entries(game.seats)
    .filter(([, seat]) => seat !== null && seat.status !== 'folded')
    .map(([seatNum, seat]) => ({
      odId: seat.odId,
      odName: seat.odName,
      seatNum: parseInt(seatNum, 10),
      holeCards: holeCards[seat.odId] || [],
      totalBet: seat.totalBet || 0,
      chips: seat.chips,
      status: seat.status,
    }));

  // Get ALL players who contributed to pot (including folded players for dead money)
  const deadContributors = Array.isArray(game.table?.deadContributors) ?
    game.table.deadContributors :
    [];

  const allContributors = Object.entries(game.seats)
    .filter(([, seat]) => seat !== null && (seat.totalBet || 0) > 0)
    .map(([seatNum, seat]) => ({
      odId: seat.odId,
      odName: seat.odName,
      seatNum: parseInt(seatNum, 10),
      totalBet: seat.totalBet || 0,
      status: seat.status,
    }))
    .concat(
      deadContributors
        .filter((p) => (p?.totalBet || 0) > 0)
        .map((p) => ({
          odId: p.odId,
          odName: p.odName,
          seatNum: p.seatNum,
          totalBet: p.totalBet || 0,
          status: 'folded',
        })),
    );

  // Read user docs for statistics update (if they exist)
  const userRefs = activePlayers.map((p) =>
    db.collection('users').doc(p.odId),
  );
  const userDocs = await Promise.all(userRefs.map((ref) => transaction.get(ref)));

  // ===== COMPUTE PHASE =====
  // 1. Calculate side pots (including dead money from folded players)
  const pots = calculateSidePots(allContributors);

  // 2. Determine winners using pokersolver
  const showdownResults = determineWinners(
    activePlayers,
    game.table.communityCards,
  );

  // 3. Distribute winnings from each pot
  const winnings = distributePots(pots, showdownResults, activePlayers);

  // 4. Update seats with winnings
  const updatedSeats = { ...game.seats };
  for (const [odId, amount] of Object.entries(winnings)) {
    const seatNum = Object.keys(updatedSeats).find(
      (key) => updatedSeats[key]?.odId === odId,
    );
    if (seatNum) {
      updatedSeats[seatNum].chips += amount;
    }
  }

  // ===== Bust Out (Kick from seat) =====
  // After chips are updated, remove anyone who busted (<= 0 chips) so they can re-buy.
  const finalChipsBySeatNum = {};
  Object.entries(updatedSeats).forEach(([seatNum, seat]) => {
    if (!seat) return;
    finalChipsBySeatNum[seatNum] = seat.chips;
  });

  Object.entries(updatedSeats).forEach(([seatNum, seat]) => {
    if (!seat) return;
    if ((seat.chips ?? 0) <= 0) {
      console.log(`Player ${seat.odId} busted (seat ${seatNum})`);
      // Kick them off the table so they can re-buy.
      updatedSeats[seatNum] = null;
    }
  });

  // SECURITY: Reveal hole cards only for players still active at showdown.
  // Folded players remain mucked.
  Object.keys(updatedSeats).forEach((num) => {
    if (!updatedSeats[num]) return;

    if (updatedSeats[num].status === 'folded') {
      updatedSeats[num].holeCards = null;
      return;
    }

    const odId = updatedSeats[num].odId;
    const cards = holeCards[odId] || [];
    updatedSeats[num].holeCards = cards.length ? cards : null;
  });

  // 5. Prepare hand result for display
  const handResult = {
    winners: showdownResults.winners.map((w) => ({
      odId: w.odId,
      odName: w.odName,
      handName: w.name,
      handDescr: w.descr,
      winningCards: w.cards,
      amount: winnings[w.odId] || 0,
    })),
    allResults: showdownResults.results.map((r) => ({
      odId: r.odId,
      odName: r.odName,
      handName: r.name,
      handDescr: r.descr,
      cards: r.cards,
    })),
    pots,
    timestamp: FieldValue.serverTimestamp(),
  };

  // 6. Prepare user statistics updates
  const userUpdates = userDocs.map((doc, index) => {
    const odId = activePlayers[index].odId;
    const won = winnings[odId] || 0;
    const isWinner = showdownResults.winners.some((w) => w.odId === odId);

    return {
      ref: userRefs[index],
      exists: doc.exists,
      data: {
        'stats.handsPlayed': FieldValue.increment(1),
        'stats.handsWon': FieldValue.increment(isWinner ? 1 : 0),
        'stats.totalWinnings': FieldValue.increment(won),
      },
    };
  });

  // 7. Prepare hand history
  const bigBlind = game.meta?.blinds?.big || 20;
  const potInBB = game.table.pot / bigBlind;

  // Check if this is a notable hand
  const hasHighRank = showdownResults.winners.some((w) => w.rank >= 6);
  const hasLargePot = potInBB >= 50;
  const hadAllIn = activePlayers.some((p) => p.status === 'all_in');
  const isNotable = hasHighRank || hasLargePot || hadAllIn;

  const handHistoryRef = gameRef
    .collection('hands')
    .doc(`hand_${game.handNumber}`);

  const handHistoryData = {
    handNumber: game.handNumber,
    communityCards: game.table.communityCards,
    players: activePlayers.map((p) => {
      return {
        odId: p.odId,
        odName: p.odName,
        holeCards: p.holeCards,
        finalChips: finalChipsBySeatNum[String(p.seatNum)] ?? p.chips,
      };
    }),
    actions: game.table.actionLog || [],
    result: {
      winners: handResult.winners,
      allResults: handResult.allResults,
      pot: game.table.pot,
      potInBB,
      pots,
    },
    notable: isNotable,
    notableReasons: {
      highRank: hasHighRank,
      largePot: hasLargePot,
      allIn: hadAllIn,
    },
    timestamp: FieldValue.serverTimestamp(),
  };

  // Save player cards if notable
  if (isNotable) {
    handHistoryData.playerCards = {};
    const revealedPlayerIds = new Set(
      activePlayers
        .filter((p) => p.status !== 'folded')
        .map((p) => p.odId),
    );
    Object.entries(holeCards).forEach(([playerId, cards]) => {
      if (revealedPlayerIds.has(playerId)) {
        handHistoryData.playerCards[playerId] = cards;
      }
    });
  }

  // Check if game should end after this hand
  const shouldEndGame = game.meta?.pauseAfterHand === true;
  const finalStatus = shouldEndGame ? 'ended' : 'waiting';

  // ===== WRITE PHASE =====
  // Archive hole cards for analytics (all currently seated players).
  // Players who left mid-hand are archived during leaveSeat.
  for (const [, seat] of Object.entries(game.seats)) {
    if (!seat) continue;
    const userId = seat.odId;
    const outcome = seat.status === 'folded' ? 'fold' : 'showdown';
    const cards = holeCards[userId];

    // Only write if we have a private snapshot (i.e. cards were dealt)
    if (Array.isArray(cards) && cards.length) {
      await writeHandHistoryEntry(
        transaction,
        {
          gameId: gameRef.id,
          handId,
          userId,
          holeCards: cards,
          outcome,
        },
        {
          skipIfExists: true,
          existingSnapshot: historySnapByUserId[userId] || null,
        },
      );
    }
  }

  // Update game state
  transaction.update(gameRef, {
    'seats': updatedSeats,
    'table.pot': 0,
    'table.stage': 'showdown_complete',
    'table.currentRound': 'showdown',
    'table.handResult': handResult,
    'table.currentTurn': null,
    'table.communityCards': game.table.communityCards, // Keep visible
    'status': finalStatus,
  });

  // Update user statistics
  userUpdates.forEach(({ ref, exists, data }) => {
    if (exists) {
      transaction.update(ref, data);
    }
  });

  // Write hand history
  transaction.set(handHistoryRef, handHistoryData);

  // Clean up private hole cards
  for (const playerId of playerIds) {
    const docRef = privateCollection.doc(playerId);
    transaction.delete(docRef);
  }

  // Return updated game state
  return {
    ...game,
    seats: updatedSeats,
    table: {
      ...game.table,
      pot: 0,
      stage: 'showdown_complete',
      currentRound: 'showdown',
      handResult,
      currentTurn: null,
      communityCards: game.table.communityCards,
    },
    status: finalStatus,
  };
}

/**
 * Set game to end after current hand
 * @param {string} gameId - Game ID
 * @return {Promise<void>}
 */
export async function setEndAfterHand(gameId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  await gameRef.update({
    'meta.pauseAfterHand': true,
  });
}

/**
 * Settle and complete poker game
 * Saves chip changes to user history
 * Uses proper transaction ordering: READ → COMPUTE → WRITE
 * @param {string} gameId - Game ID
 * @return {Promise<void>}
 */
export async function settlePokerGame(gameId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  return db.runTransaction(async (transaction) => {
    // ===== READ PHASE =====
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw new Error('Game not found');
    }

    const game = gameDoc.data();
    const seats = game.seats || {};

    // Get all seated players
    const seatedPlayers = Object.values(seats).filter((seat) => seat !== null);

    // Read all user documents first
    const userRefs = seatedPlayers.map((player) => db.collection('users').doc(player.odId));
    const userDocs = await Promise.all(userRefs.map((ref) => transaction.get(ref)));

    // ===== COMPUTE PHASE =====
    // Calculate profit/loss for each player
    const userUpdates = seatedPlayers.map((player, index) => {
      const initialBuyIn = player.initialBuyIn || game.meta.minBuyIn || DEFAULT_BUY_IN;
      const profit = player.chips - initialBuyIn;

      const record = {
        date: new Date().toISOString(),
        createdAt: Date.now(),
        profit: profit,
        rate: 1, // Online poker uses chip values directly
        gameName: `Poker Game #${gameId.slice(0, 8)}`,
        gameType: 'online_poker',
        settlement: seatedPlayers.map((p) => ({
          name: p.odName,
          buyIn: p.initialBuyIn || game.meta.minBuyIn || DEFAULT_BUY_IN,
          stack: p.chips,
          profit: p.chips - (p.initialBuyIn || game.meta.minBuyIn || DEFAULT_BUY_IN),
        })),
      };

      return {
        ref: userRefs[index],
        exists: userDocs[index].exists(),
        record,
      };
    });

    // ===== WRITE PHASE =====
    // Update user histories
    userUpdates.forEach(({ ref, exists, record }) => {
      if (exists) {
        transaction.update(ref, {
          history: FieldValue.arrayUnion(record),
        });
      } else {
        transaction.set(ref, {
          history: [record],
          createdAt: Date.now(),
        });
      }
    });

    // Mark game as completed
    transaction.update(gameRef, {
      status: 'completed',
      completedAt: FieldValue.serverTimestamp(),
    });
  });
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
      throw new Error('Game not found');
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
      throw new Error('Game not found');
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

/**
 * Sit down at a seat (for spectators joining during active game)
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID
 * @param {Object} userInfo - User information
 * @param {number} seatNumber - Seat to join
 * @param {number} buyIn - Buy-in amount
 * @return {Promise<Object>} Updated game state
 */
export async function sitDown(gameId, userId, userInfo, seatNumber, buyIn) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw new Error('Game not found');
    }

    const game = gameDoc.data();

    // Smart seat assignment:
    // If requested seat is occupied, fall back to the first available seat.
    const maxSeats = game?.meta?.maxPlayers ?? Object.keys(game.seats || {}).length;
    const isValidRequestedSeat =
      Number.isInteger(seatNumber) && seatNumber >= 0 && seatNumber < maxSeats;
    const findFirstEmptySeat = () => {
      for (let i = 0; i < maxSeats; i++) {
        if (game.seats?.[i] === null) return i;
      }
      return null;
    };

    if (!isValidRequestedSeat) {
      const firstEmpty = findFirstEmptySeat();
      if (firstEmpty === null) {
        throw new Error('Table is full');
      }
      seatNumber = firstEmpty;
    } else if (game.seats?.[seatNumber] !== null) {
      const firstEmpty = findFirstEmptySeat();
      if (firstEmpty === null) {
        throw new Error('Table is full');
      }
      seatNumber = firstEmpty;
    }

    // Check if user is already seated elsewhere
    const existingSeat = Object.entries(game.seats).find(
      ([, seat]) => seat && seat.odId === userId,
    );
    if (existingSeat) {
      throw new Error('Already seated at another position');
    }

    // Validate buy-in amount
    const minBuyIn = game.meta?.minBuyIn || DEFAULT_BUY_IN;
    const maxBuyIn = game.meta?.maxBuyIn || DEFAULT_BUY_IN * 5;
    if (buyIn < minBuyIn || buyIn > maxBuyIn) {
      throw new Error(`Buy-in must be between ${minBuyIn} and ${maxBuyIn}`);
    }

    // Determine status based on game state
    // If game is playing, set to waiting_for_hand so they join next hand
    // If game is waiting, set to active so they can play immediately
    const status = game.status === 'playing' ? 'waiting_for_hand' : 'active';

    // Add player to seat
    const seatData = {
      odId: userId,
      odName: userInfo.name || 'Player',
      odAvatar: userInfo.avatar || '',
      chips: buyIn,
      initialBuyIn: buyIn,
      status: status,
      roundBet: 0,
      totalBet: 0,
      turnActed: false,
      isDealer: false,
      isSmallBlind: false,
      isBigBlind: false,
    };

    transaction.update(gameRef, {
      [`seats.${seatNumber}`]: seatData,
    });

    // Add event
    await addGameEvent(
      gameId,
      {
        type: 'playerJoin',
        handNumber: game.handNumber,
        odId: userId,
        odName: userInfo.name || 'Player',
        seatNumber,
        buyIn,
        status,
      },
      transaction,
    );

    return {
      gameId,
      seatNumber,
      ...seatData,
    };
  });
}

/**
 * Toggle pause state of a poker game
 * Only the host can pause/unpause
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID (host)
 * @return {Promise<Object>} Result with success and new status
 */
export async function togglePause(gameId, userId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw createGameError(GameErrorCodes.GAME_NOT_FOUND);
    }

    const game = gameDoc.data();

    // Verify user is the host
    if (game.meta?.createdBy !== userId) {
      throw createGameError(GameErrorCodes.NOT_AUTHORIZED, 'Only the host can pause/unpause the game');
    }

    const currentStatus = game.status;

    if (currentStatus === 'playing') {
      // Pause the game
      const now = Date.now();
      const turnExpiresAt = game.table?.turnExpiresAt;
      let remainingTurnTime = null;

      // Calculate remaining turn time if there's an active turn
      if (turnExpiresAt) {
        const expiresMs = turnExpiresAt.toMillis ?
          turnExpiresAt.toMillis() :
          turnExpiresAt.seconds * 1000;
        remainingTurnTime = Math.max(0, expiresMs - now);
      }

      transaction.update(gameRef, {
        'status': 'paused',
        'table.pausedAt': FieldValue.serverTimestamp(),
        'table.remainingTurnTime': remainingTurnTime,
        'table.pauseReason': 'host_paused',
      });

      return { success: true, status: 'paused' };
    } else if (currentStatus === 'paused') {
      // Resume the game
      const turnTimeout = game.table?.turnTimeout || DEFAULT_TURN_TIMEOUT;
      const remainingTime = game.table?.remainingTurnTime;

      // Calculate new expiration time based on remaining time
      const newExpiresAt = (remainingTime !== null && remainingTime !== undefined) ?
        createTurnExpiresAt(Math.ceil(remainingTime / 1000)) :
        createTurnExpiresAt(turnTimeout);

      transaction.update(gameRef, {
        'status': 'playing',
        'table.pausedAt': FieldValue.delete(),
        'table.remainingTurnTime': FieldValue.delete(),
        'table.pauseReason': FieldValue.delete(),
        'table.turnExpiresAt': newExpiresAt,
        'table.turnStartedAt': FieldValue.serverTimestamp(),
      });

      return { success: true, status: 'playing' };
    } else {
      throw createGameError(GameErrorCodes.INVALID_GAME_STATE, 'Game must be playing or paused to toggle pause');
    }
  });
}

/**
 * Stop auto-next hand
 * Only the host can stop auto-next
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID (host)
 * @return {Promise<Object>} Result with success
 */
export async function stopNextHand(gameId, userId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw createGameError(GameErrorCodes.GAME_NOT_FOUND);
    }

    const game = gameDoc.data();

    // Verify user is the host
    if (game.meta?.createdBy !== userId) {
      throw createGameError(GameErrorCodes.NOT_AUTHORIZED, 'Only the host can stop auto-next');
    }

    transaction.update(gameRef, {
      'table.isAutoNext': false,
    });

    return { success: true };
  });
}

/**
 * Resume a paused poker game
 * Only the host can resume
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID (host)
 * @return {Promise<Object>} Result with success and next turn
 */
export async function resumeGame(gameId, userId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw createGameError(GameErrorCodes.GAME_NOT_FOUND);
    }

    const game = gameDoc.data();

    // Verify user is the host
    if (game.meta?.createdBy !== userId) {
      throw createGameError(GameErrorCodes.NOT_AUTHORIZED, 'Only the host can resume the game');
    }

    // Verify game is paused
    if (game.status !== 'paused') {
      throw createGameError(GameErrorCodes.INVALID_GAME_STATE, 'Game is not paused');
    }

    // Find next active player
    const nextPlayer = findNextPlayer(game, game.table?.currentTurn);
    const newTurnId = `turn-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const turnTimeout = game.table?.turnTimeout || DEFAULT_TURN_TIMEOUT;

    // Resume the game
    transaction.update(gameRef, {
      'status': 'playing',
      'table.pauseReason': FieldValue.delete(),
      'table.currentTurn': nextPlayer,
      'table.currentTurnId': newTurnId,
      'table.consecutiveAutoActions': 0,
      'table.turnStartedAt': FieldValue.serverTimestamp(),
      'table.turnExpiresAt': createTurnExpiresAt(turnTimeout),
    });

    return { success: true, nextTurn: nextPlayer };
  });
}

