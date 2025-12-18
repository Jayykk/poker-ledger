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
  getActivePlayers,
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

// Constants
const DEFAULT_BUY_IN = 1000;
const DEFAULT_TURN_TIMEOUT = 30;

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

    // Validate can start
    const validation = validateGameStart(game);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Initialize new hand
    game = initializeHand(game);

    // Deal hole cards
    const { game: updatedGame, holeCards } = dealHoleCards(game);

    // Get turn timeout setting
    const turnTimeout = updatedGame.table?.turnTimeout || DEFAULT_TURN_TIMEOUT;

    // Update game state with turnStartedAt and turnExpiresAt merged into table
    const gameToUpdate = {
      ...updatedGame,
      table: {
        ...updatedGame.table,
        turnStartedAt: FieldValue.serverTimestamp(),
        turnExpiresAt: createTurnExpiresAt(turnTimeout),
        turnTimeout,
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
    await addGameEvent(
      gameId,
      {
        type: 'action',
        handNumber: game.handNumber,
        odId: userId,
        action,
        amount,
        round: game.table.currentRound,
      },
      transaction,
    );

    // Check for Last Man Standing
    if (isLastManStanding(game)) {
      return await handleLastManStanding(transaction, gameRef, game);
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
      turnTimeout,
      shouldCreateTask: game.table.currentTurn !== null && game.status === 'playing',
    };
  });

  // 🔑 POST-TRANSACTION: Create Cloud Task only after transaction succeeds
  if (result.shouldCreateTask && result.nextTurnId) {
    await createPokerTask(gameId, result.nextTurnId, result.turnTimeout);
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
 * @return {Promise<Object>} Result
 */
export async function handleLastManStanding(transaction, gameRef, game) {
  // ===== READ PHASE =====
  // Efficiently get all private documents by deriving player IDs from seats
  // This avoids the extra listDocuments() API call
  const privateCollection = gameRef.collection('private');
  const playerIds = Object.values(game.seats)
    .filter((seat) => seat !== null)
    .map((seat) => seat.odId);

  // Read all private documents (even though we don't use them for last man standing,
  // we need to delete them, so we need the references)
  const privateDocs = playerIds.map((playerId) => privateCollection.doc(playerId));

  // ===== COMPUTE PHASE =====
  const activePlayers = getActivePlayers(game);

  if (activePlayers.length !== 1) {
    throw createGameError(GameErrorCodes.INVALID_ACTION, {
      message: 'Invalid last man standing state',
    });
  }

  const winner = activePlayers[0];
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

  // ===== WRITE PHASE =====
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

  // Clean up private hole cards
  for (const docRef of privateDocs) {
    transaction.delete(docRef);
  }

  return {
    gameId: gameRef.id,
    winner: winner.odId,
    amount: winAmount,
    reason: 'last_man_standing',
    shouldCreateTask: false,
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
    // Showdown
    updatedGame = await handleShowdown(updatedGame, transaction, gameRef);
    break;
  }

  // Set next player to act with new turnId
  if (updatedGame.table.currentRound !== 'showdown') {
    const nextPlayer = getFirstToAct(updatedGame);
    if (nextPlayer) {
      updatedGame.table.currentTurn = nextPlayer;
      updatedGame.table.currentTurnId = uuidv4(); // Generate new UUID
    }
  }

  return updatedGame;
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

  const holeCards = {};

  // Read each private document within the transaction
  for (const playerId of playerIds) {
    const docRef = privateCollection.doc(playerId);
    const docSnap = await transaction.get(docRef);
    if (docSnap.exists) {
      holeCards[playerId] = docSnap.data().holeCards;
    }
  }

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
  const allContributors = Object.entries(game.seats)
    .filter(([, seat]) => seat !== null && (seat.totalBet || 0) > 0)
    .map(([seatNum, seat]) => ({
      odId: seat.odId,
      odName: seat.odName,
      seatNum: parseInt(seatNum, 10),
      totalBet: seat.totalBet || 0,
      status: seat.status,
    }));

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
      holeCards: activePlayers.find((p) => p.odId === r.odId)?.holeCards || [],
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
      const finalSeat = updatedSeats[p.seatNum];
      return {
        odId: p.odId,
        odName: p.odName,
        holeCards: p.holeCards,
        finalChips: finalSeat ? finalSeat.chips : p.chips,
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
    Object.entries(holeCards).forEach(([playerId, cards]) => {
      handHistoryData.playerCards[playerId] = cards;
    });
  }

  // Check if game should end after this hand
  const shouldEndGame = game.meta?.pauseAfterHand === true;
  const finalStatus = shouldEndGame ? 'ended' : 'waiting';

  // ===== WRITE PHASE =====
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

    // Verify user is in the game
    const playerSeat = Object.entries(game.seats).find(
      ([, seat]) => seat && seat.odId === userId,
    );

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

    // Record shown cards in events subcollection
    // Note: Changed from arrayUnion to subcollection documents because
    // FieldValue.serverTimestamp() cannot be used inside array elements
    await addGameEvent(
      gameId,
      {
        type: 'shownCards',
        handNumber: game.handNumber,
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
    const hasBetToCall = seat.currentBet < game.table.currentBet;
    const action = hasBetToCall ? 'fold' : 'check';

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

