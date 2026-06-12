/**
 * Game Control Handlers
 * Game control / lifecycle: ending, settlement, seating, pause/resume.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import {
  findNextPlayer,
} from '../engines/gameStateMachine.js';
import { addGameEvent } from '../lib/events.js';
import { createTurnExpiresAt } from './turnTimer.js';
import { GameErrorCodes, createGameError } from '../errors/gameErrors.js';
import { createRoomAutoCloseTask } from '../utils/cloudTasks.js';

import {
  DEFAULT_TURN_TIMEOUT,
  ROOM_IDLE_TIMEOUT_SECONDS,
} from '../utils/config.js';

// Constants
const DEFAULT_BUY_IN = 1000;

/**
 * Set game to end after current hand
 * @param {string} gameId - Game ID
 * @return {Promise<void>}
 */
export async function setEndAfterHand(gameId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  const autoCloseToken = uuidv4();

  await gameRef.update({
    'meta.pauseAfterHand': true,
    'meta.lastActivityAt': FieldValue.serverTimestamp(),
    'meta.autoCloseToken': autoCloseToken,
  });

  createRoomAutoCloseTask(gameId, autoCloseToken, ROOM_IDLE_TIMEOUT_SECONDS)
    .catch((err) => console.error('Auto-close task creation failed:', err));
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

  const autoCloseToken = uuidv4();

  const result = await db.runTransaction(async (transaction) => {
    // ===== READ PHASE =====
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw createGameError(GameErrorCodes.GAME_NOT_FOUND);
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
          odId: p.odId,
          name: p.odName,
          buyIn: p.initialBuyIn || game.meta.minBuyIn || DEFAULT_BUY_IN,
          stack: p.chips,
          profit: p.chips - (p.initialBuyIn || game.meta.minBuyIn || DEFAULT_BUY_IN),
        })),
      };

      return {
        ref: userRefs[index],
        exists: userDocs[index].exists,
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
      'status': 'completed',
      'completedAt': FieldValue.serverTimestamp(),
      'meta.lastActivityAt': FieldValue.serverTimestamp(),
      'meta.autoCloseToken': autoCloseToken,
    });
  });

  createRoomAutoCloseTask(gameId, autoCloseToken, ROOM_IDLE_TIMEOUT_SECONDS)
    .catch((err) => console.error('Auto-close task creation failed:', err));
  return result;
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

  const autoCloseToken = uuidv4();

  const result = await db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw createGameError(GameErrorCodes.GAME_NOT_FOUND);
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
      'meta.lastActivityAt': FieldValue.serverTimestamp(),
      'meta.autoCloseToken': autoCloseToken,
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

  createRoomAutoCloseTask(gameId, autoCloseToken, ROOM_IDLE_TIMEOUT_SECONDS)
    .catch((err) => console.error('Auto-close task creation failed:', err));
  return result;
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

  const autoCloseToken = uuidv4();

  const result = await db.runTransaction(async (transaction) => {
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
        'meta.lastActivityAt': FieldValue.serverTimestamp(),
        'meta.autoCloseToken': autoCloseToken,
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
        'meta.lastActivityAt': FieldValue.serverTimestamp(),
        'meta.autoCloseToken': autoCloseToken,
      });

      return { success: true, status: 'playing' };
    } else {
      throw createGameError(GameErrorCodes.INVALID_GAME_STATE, 'Game must be playing or paused to toggle pause');
    }
  });

  createRoomAutoCloseTask(gameId, autoCloseToken, ROOM_IDLE_TIMEOUT_SECONDS)
    .catch((err) => console.error('Auto-close task creation failed:', err));
  return result;
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

  const autoCloseToken = uuidv4();

  const result = await db.runTransaction(async (transaction) => {
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
      'meta.lastActivityAt': FieldValue.serverTimestamp(),
      'meta.autoCloseToken': autoCloseToken,
    });

    return { success: true };
  });

  createRoomAutoCloseTask(gameId, autoCloseToken, ROOM_IDLE_TIMEOUT_SECONDS)
    .catch((err) => console.error('Auto-close task creation failed:', err));
  return result;
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

  const autoCloseToken = uuidv4();

  const result = await db.runTransaction(async (transaction) => {
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
      'meta.lastActivityAt': FieldValue.serverTimestamp(),
      'meta.autoCloseToken': autoCloseToken,
    });

    return { success: true, nextTurn: nextPlayer };
  });

  createRoomAutoCloseTask(gameId, autoCloseToken, ROOM_IDLE_TIMEOUT_SECONDS)
    .catch((err) => console.error('Auto-close task creation failed:', err));
  return result;
}
