/**
 * Room Management Handlers
 * Functions for creating and managing poker game rooms
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import { validateJoinSeat } from '../utils/validators.js';
import { addGameEvent } from '../lib/events.js';
import { processAction } from '../engines/texasHoldem.js';
import {
  isLastManStanding,
  isRoundComplete,
  findNextPlayer,
} from '../engines/gameStateMachine.js';
import { advanceRound, handleLastManStanding } from './game.js';
import { createTurnExpiresAt } from './turnTimer.js';
import { createPokerTask, createPokerHttpTask } from '../utils/cloudTasks.js';
import { writeHandHistoryEntry } from '../utils/handHistories.js';

/**
 * Create a new poker game room
 * @param {Object} config - Room configuration
 * @param {string} userId - Creator user ID
 * @return {Promise<Object>} Created room data
 */
export async function createRoom(config, userId) {
  const db = getFirestore();

  const roomData = {
    meta: {
      type: 'texas_holdem',
      mode: config.mode || 'cash',
      blinds: {
        small: config.smallBlind || 10,
        big: config.bigBlind || 20,
      },
      minBuyIn: config.minBuyIn || 1000,
      maxBuyIn: config.maxBuyIn || 5000,
      maxPlayers: 10, // Fixed to 10 players
      autoStartDelay: config.autoStartDelay || 5, // seconds between hands
      createdBy: userId,
      createdAt: FieldValue.serverTimestamp(),
    },
    status: 'waiting',
    table: {
      pot: 0,
      sidePots: [],
      communityCards: [],
      currentRound: 'waiting',
      dealerSeat: 0,
      currentTurn: null,
      turnStartedAt: null,
      turnTimeout: config.turnTimeout || 30,
      minRaise: config.bigBlind || 20,
      lastRaise: 0,
      currentBet: 0,
      isAutoNext: false, // whether to auto-start next hand
      pausedAt: null, // timestamp when paused
      remainingTurnTime: null, // ms remaining when paused
      pauseReason: null, // 'host_paused' | 'afk_protection'
    },
    seats: {},
    handNumber: 0,
  };

  // Initialize empty seats
  for (let i = 0; i < roomData.meta.maxPlayers; i++) {
    roomData.seats[i] = null;
  }

  const roomRef = await db.collection('pokerGames').add(roomData);

  return {
    id: roomRef.id,
    ...roomData,
  };
}

/**
 * Join a seat in a poker room
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID
 * @param {Object} userInfo - User information
 * @param {number} seatNumber - Seat to join
 * @param {number} buyIn - Buy-in amount
 * @return {Promise<Object>} Updated game state
 */
export async function joinSeat(gameId, userId, userInfo, seatNumber, buyIn) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw new Error('Game not found');
    }

    const game = gameDoc.data();

    // Validate join
    const validation = validateJoinSeat(game, seatNumber, buyIn, userId);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Add player to seat
    const seatData = {
      odId: userId,
      odName: userInfo.name || 'Player',
      odAvatar: userInfo.avatar || '',
      chips: buyIn,
      initialBuyIn: buyIn, // Track initial buy-in for settlement
      status: 'active',
      currentBet: 0,
      isDealer: false,
      isSmallBlind: false,
      isBigBlind: false,
    };

    transaction.update(gameRef, {
      [`seats.${seatNumber}`]: seatData,
    });

    return {
      gameId,
      seatNumber,
      ...seatData,
    };
  });
}

/**
 * Leave a poker room
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID
 * @return {Promise<void>}
 */
export async function leaveSeat(gameId, userId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  const result = await db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw new Error('Game not found');
    }

    const game = gameDoc.data();

    // Find player's seat
    const seatEntry = Object.entries(game.seats)
      .find(([, seat]) => seat && seat.odId === userId);

    if (!seatEntry) {
      throw new Error('Player not in game');
    }

    const [seatNum, seat] = seatEntry;

    const isPlaying = game.status === 'playing';
    const shouldForceFold = isPlaying && seat?.status !== 'folded';

    // If leaving mid-hand, force-fold and advance the game if necessary.
    // IMPORTANT: We still clear the seat (set to null), so we preserve their
    // dead money contribution in table.deadContributors for correct side-pot math.
    if (shouldForceFold) {
      // Archive the leaving player's hole cards for analytics before deleting private state.
      const privateRef = gameRef.collection('private').doc(userId);
      const privateSnap = await transaction.get(privateRef);
      const holeCards = privateSnap.exists ? (privateSnap.data()?.holeCards || []) : [];
      const handId = `hand_${game.handNumber}`;
      await writeHandHistoryEntry(
        transaction,
        {
          gameId: gameRef.id,
          handId,
          userId,
          holeCards,
          outcome: 'force_fold_leave',
        },
        { skipIfExists: true },
      );

      let updatedGame = processAction(game, userId, 'fold', 0);

      const contribution = seat?.totalBet || 0;
      if (contribution > 0) {
        const existing = Array.isArray(updatedGame.table?.deadContributors) ?
          updatedGame.table.deadContributors :
          [];
        const next = existing.concat([
          {
            odId: userId,
            odName: seat?.odName || 'Player',
            seatNum: parseInt(seatNum, 10),
            totalBet: contribution,
            status: 'folded',
          },
        ]);
        updatedGame = {
          ...updatedGame,
          table: {
            ...updatedGame.table,
            deadContributors: next,
          },
        };
      }

      // Clear seat immediately (force leave)
      updatedGame.seats = { ...updatedGame.seats, [seatNum]: null };

      // Remove private hole cards for the leaving player (no longer needed)
      transaction.delete(privateRef);

      // If this was the current player's turn, advance turn/round to prevent getting stuck.
      const wasCurrentTurn = updatedGame.table?.currentTurn === userId;

      if (isLastManStanding(updatedGame)) {
        // This will update game state inside the transaction.
        const lms = await handleLastManStanding(transaction, gameRef, updatedGame);
        return {
          ...lms,
          forcedLeave: true,
          forcedFold: true,
        };
      }

      if (wasCurrentTurn) {
        if (isRoundComplete(updatedGame)) {
          updatedGame = await advanceRound(updatedGame, transaction, gameRef);
        } else {
          const nextPlayer = findNextPlayer(updatedGame);
          updatedGame.table.currentTurn = nextPlayer;
          updatedGame.table.currentTurnId = uuidv4();
        }

        const turnTimeout = updatedGame.table?.turnTimeout || 30;
        transaction.update(gameRef, {
          ...updatedGame,
          table: {
            ...updatedGame.table,
            turnStartedAt: FieldValue.serverTimestamp(),
            turnExpiresAt: createTurnExpiresAt(turnTimeout),
            turnTimeout,
          },
        });

        return {
          success: true,
          forcedLeave: true,
          forcedFold: true,
          nextTurn: updatedGame.table.currentTurn,
          nextTurnId: updatedGame.table.currentTurnId,
          turnTimeout,
          shouldCreateTask: updatedGame.table.currentTurn !== null && updatedGame.status === 'playing',
        };
      }

      // Not current turn: just remove the seat and keep game running.
      transaction.update(gameRef, {
        ...updatedGame,
      });

      return {
        success: true,
        forcedLeave: true,
        forcedFold: true,
        shouldCreateTask: false,
      };
    }

    // Not in an active hand (or already folded): just remove player from seat.
    transaction.update(gameRef, {
      [`seats.${seatNum}`]: null,
    });

    // Best-effort cleanup of private hole cards.
    transaction.delete(gameRef.collection('private').doc(userId));

    return { success: true, forcedLeave: true, forcedFold: false, shouldCreateTask: false };
  });

  // Post-transaction task creation
  if (result?.shouldCreateTask && result?.nextTurnId) {
    await createPokerTask(gameId, result.nextTurnId, result.turnTimeout);
  }
  if (result?.shouldCreateWinByFoldTask && result?.winByFoldId) {
    await createPokerHttpTask({
      endpoint: 'handleWinByFoldTimeout',
      payload: {
        gameId,
        winByFoldId: result.winByFoldId,
        timestamp: Date.now(),
      },
      delaySeconds: 5,
      logLabel: `winByFoldId: ${result.winByFoldId}`,
    });
  }

  return result;
}

/**
 * Get game room details
 * @param {string} gameId - Game ID
 * @return {Promise<Object>} Game data
 */
export async function getRoom(gameId) {
  const db = getFirestore();
  const gameDoc = await db.collection('pokerGames').doc(gameId).get();

  if (!gameDoc.exists) {
    throw new Error('Game not found');
  }

  return {
    id: gameDoc.id,
    ...gameDoc.data(),
  };
}

/**
 * Delete a poker room (only creator can delete)
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID (must be creator)
 * @return {Promise<void>}
 */
export async function deleteRoom(gameId, userId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw new Error('Game not found');
    }

    const game = gameDoc.data();

    // Only creator can delete
    if (game.meta.createdBy !== userId) {
      throw new Error('Only room creator can delete the room');
    }

    // Can only delete if game is waiting or ended
    if (game.status === 'playing') {
      throw new Error('Cannot delete room while game is in progress');
    }

    // Delete the game document
    transaction.delete(gameRef);

    // Note: Subcollections (hands, private) are not automatically deleted in Firestore.
    // For this poker game implementation:
    // - 'hands' subcollection: Historical data, can be kept or cleaned by a scheduled function
    // - 'private' subcollection: Should be empty after each hand (cleaned in handleShowdown)
    // If immediate cleanup is needed, implement a recursive delete function
  });
}

/**
 * Join as spectator
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID
 * @param {Object} userInfo - User information
 * @return {Promise<Object>} Result
 */
export async function joinAsSpectator(gameId, userId, userInfo) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw new Error('Game not found');
    }

    const game = gameDoc.data();

    // Check if already a player
    const isPlayer = Object.values(game.seats || {})
      .some((seat) => seat && seat.odId === userId);

    if (isPlayer) {
      throw new Error('Already seated as player');
    }

    // Check if already spectator
    const spectators = game.spectators || [];
    if (spectators.some((s) => s.userId === userId)) {
      throw new Error('Already spectating');
    }

    // Add spectator event to events subcollection
    // Note: Changed from arrayUnion to subcollection documents because
    // FieldValue.serverTimestamp() cannot be used inside array elements
    await addGameEvent(
      gameId,
      {
        type: 'spectatorJoin',
        userId,
        userName: userInfo.name || 'Spectator',
        userAvatar: userInfo.avatar || '',
      },
      transaction,
    );

    return {
      gameId,
      role: 'spectator',
    };
  });
}

/**
 * Leave spectator mode
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID
 * @return {Promise<void>}
 */
export async function leaveSpectator(gameId, userId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw new Error('Game not found');
    }

    // Add spectator leave event to track when spectators leave
    await addGameEvent(
      gameId,
      {
        type: 'spectatorLeave',
        userId,
      },
      transaction,
    );
  });
}
