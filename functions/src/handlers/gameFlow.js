/**
 * Game Flow Handlers
 * Hand lifecycle: starting hands, advancing rounds, showdown resolution,
 * last-man-standing and win-by-fold handling.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import {
  initializeHand,
  dealHoleCards,
  dealFlop,
  dealTurnOrRiver,
} from '../engines/texasHoldem.js';
import { validateGameStart } from '../engines/actionValidator.js';
import {
  getFirstToAct,
} from '../engines/gameStateMachine.js';
import { addGameEvent } from '../lib/events.js';
import { createTurnExpiresAt } from './turnTimer.js';
import { GameErrorCodes, createGameError } from '../errors/gameErrors.js';
import { calculateSidePots, distributePots } from '../engines/potCalculator.js';
import { determineWinners } from '../utils/handEvaluator.js';
import { createPokerTask } from '../utils/cloudTasks.js';
import { createRoomAutoCloseTask } from '../utils/cloudTasks.js';
import { getHandIdFromGame, writeHandHistoryEntry } from '../utils/handHistories.js';

import {
  DEFAULT_TURN_TIMEOUT,
  SHOWDOWN_ADMIRE_TIME_MS,
  ROOM_IDLE_TIMEOUT_SECONDS,
} from '../utils/config.js';

/**
 * Compute a delay that covers the runout animation plus a base "admire" window.
 * This prevents auto-next / countdown UI from overlapping dramatic board reveal.
 *
 * @param {number} existingCommunityCardsCount How many board cards were already visible.
 * @return {number} Delay in milliseconds.
 */
function computeShowdownDelayMs(existingCommunityCardsCount) {
  const existingCards = Math.max(0, Number(existingCommunityCardsCount) || 0);
  const missingCards = Math.max(0, 5 - existingCards);
  const animationBuffer = missingCards * 2500;
  return SHOWDOWN_ADMIRE_TIME_MS + animationBuffer;
}

/**
 * Effective all-in condition:
 * If 0 or only 1 player in the hand is NOT all-in, there are no further betting decisions.
 * (Everyone else is all-in or folded.)
 * @param {Object} game
 * @return {boolean}
 */
export function isEffectiveAllIn(game) {
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
export function areBetsSettledForRunout(game) {
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
export async function runoutToShowdown(game, transaction, gameRef) {
  let runoutGame = game;
  const existingCardsCount = Array.isArray(runoutGame.table?.communityCards) ?
    runoutGame.table.communityCards.length :
    0;
  const totalDelayMs = computeShowdownDelayMs(existingCardsCount);
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
  return await resolveShowdownImmediately(runoutGame, transaction, gameRef, { totalDelayMs });
}

/**
 * Resolve showdown immediately inside the transaction.
 * This computes winners + distributes pots synchronously, then sets an "admire" timer.
 * @param {Object} game
 * @param {Object} transaction
 * @param {Object} gameRef
 * @param {Object} [options]
 * @param {number} [options.totalDelayMs]
 * @return {Promise<Object>} Updated game state
 */
async function resolveShowdownImmediately(game, transaction, gameRef, options = {}) {
  // handleShowdown() performs the full READ → COMPUTE → WRITE pipeline (including payouts).
  const resolved = await handleShowdown(game, transaction, gameRef);

  // Add a short "admire" window before the next hand can auto-start.
  // Use client-readable epoch millis for consistency with existing UI conversions.
  const totalDelayMs = typeof options?.totalDelayMs === 'number' ?
    Math.max(0, options.totalDelayMs) :
    computeShowdownDelayMs(
      Array.isArray(game.table?.communityCards) ? game.table.communityCards.length : 5,
    );
  const nextHandId = uuidv4();
  transaction.update(gameRef, {
    'table.turnExpiresAt': Date.now() + totalDelayMs,
    'table.showdownEndTime': Date.now() + totalDelayMs,
    'table.nextHandId': nextHandId,
  });

  return {
    ...resolved,
    table: {
      ...resolved.table,
      turnExpiresAt: Date.now() + totalDelayMs,
      showdownEndTime: Date.now() + totalDelayMs,
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

  const autoCloseToken = uuidv4();

  const result = await db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw createGameError(GameErrorCodes.GAME_NOT_FOUND);
    }

    let game = gameDoc.data();

    try {
      // Validate can start (throws a structured game error if not)
      validateGameStart(game);

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
        meta: {
          ...(updatedGame.meta || {}),
          lastActivityAt: FieldValue.serverTimestamp(),
          autoCloseToken,
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
          'meta.lastActivityAt': FieldValue.serverTimestamp(),
          'meta.autoCloseToken': autoCloseToken,
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
    createPokerTask(gameId, result.currentTurnId, result.turnTimeout)
      .catch((err) => console.error('Turn task creation failed:', err));
  }

  // Best-effort (fire-and-forget): delay auto-close after manual start.
  createRoomAutoCloseTask(gameId, autoCloseToken, ROOM_IDLE_TIMEOUT_SECONDS)
    .catch((err) => console.error('Auto-close task creation failed:', err));

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
export async function handleShowdown(game, transaction, gameRef) {
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
    // Primary winning 5-card combo (used by UI to highlight board contributors).
    // If there are multiple winners (tie), we pick the first winner's best 5.
    winningCards: (showdownResults.winners?.[0]?.cards || []).slice(0, 5),
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
