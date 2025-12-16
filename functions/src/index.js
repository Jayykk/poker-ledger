/**
 * Firebase Cloud Functions for Poker Game
 * Main entry point for all poker game functions 
 */

import { initializeApp } from 'firebase-admin/app';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { createRoom, joinSeat, leaveSeat, getRoom } from './handlers/room.js';
import { startHand, handlePlayerAction } from './handlers/game.js';

// Initialize Firebase Admin
initializeApp();

/**
 * Create a new poker game room
 */
export const createPokerRoom = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { config } = request.data;
    const userId = request.auth.uid;
    const room = await createRoom(config, userId);
    return { success: true, room };
  } catch (error) {
    console.error('Error creating room:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Join a seat in a poker room
 */
export const joinPokerSeat = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { gameId, seatNumber, buyIn } = request.data;
    const userId = request.auth.uid;
    const userInfo = {
      name: request.auth.token.name || 'Player',
      avatar: request.auth.token.picture || '',
    };

    const result = await joinSeat(gameId, userId, userInfo, seatNumber, buyIn);
    return { success: true, result };
  } catch (error) {
    console.error('Error joining seat:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Leave a poker room
 */
export const leavePokerSeat = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { gameId } = request.data;
    const userId = request.auth.uid;

    await leaveSeat(gameId, userId);
    return { success: true };
  } catch (error) {
    console.error('Error leaving seat:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Get poker room details
 */
export const getPokerRoom = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { gameId } = request.data;
    const room = await getRoom(gameId);
    return { success: true, room };
  } catch (error) {
    console.error('Error getting room:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Start a new poker hand
 */
export const startPokerHand = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { gameId } = request.data;
    const result = await startHand(gameId);
    return { success: true, result };
  } catch (error) {
    console.error('Error starting hand:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Process player action (fold, check, call, raise, all-in)
 */
export const pokerPlayerAction = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { gameId, action, amount } = request.data;
    const userId = request.auth.uid;

    const result = await handlePlayerAction(gameId, userId, action, amount);
    return { success: true, result };
  } catch (error) {
    console.error('Error processing action:', error);
    throw new HttpsError('internal', error.message);
  }
});
