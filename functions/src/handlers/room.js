/**
 * Room Management Handlers
 * Functions for creating and managing poker game rooms
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { validateJoinSeat } from '../utils/validators.js';

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

    // Ensure seat number is an integer
    const seatNum = parseInt(seatNumber, 10);

    // Validate join
    const validation = validateJoinSeat(game, seatNum, buyIn, userId);
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
      [`seats.${seatNum}`]: seatData,
    });

    return {
      gameId,
      seatNumber: seatNum,
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

  return db.runTransaction(async (transaction) => {
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

    const [seatNum] = seatEntry;

    // Can't leave during active hand if playing
    if (game.status === 'playing' && seatEntry[1].status === 'active') {
      throw new Error('Cannot leave during active hand');
    }

    // Remove player from seat
    transaction.update(gameRef, {
      [`seats.${seatNum}`]: null,
    });
  });
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
 * Delete a poker room (only by creator)
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID requesting deletion
 * @return {Promise<void>}
 */
export async function deleteRoom(gameId, userId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  // First verify permissions in a transaction
  await db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw new Error('Game not found');
    }

    const game = gameDoc.data();

    // Verify user is the creator
    if (game.meta?.createdBy !== userId) {
      throw new Error('Only the room creator can delete the room');
    }

    // Delete the game document
    transaction.delete(gameRef);
  });

  // Delete subcollections (private cards and hands) after main document
  // This is safe to do after the transaction since we verified permissions
  const privateSnapshot = await gameRef.collection('private').get();
  const handsSnapshot = await gameRef.collection('hands').get();

  const batch = db.batch();
  
  privateSnapshot.forEach((doc) => {
    batch.delete(doc.ref);
  });

  handsSnapshot.forEach((doc) => {
    batch.delete(doc.ref);
  });

  if (!privateSnapshot.empty || !handsSnapshot.empty) {
    await batch.commit();
  }
}
