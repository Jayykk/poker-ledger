/**
 * Firebase Cloud Functions for Poker Game
 * Main entry point for all poker game functions
 */

import { initializeApp } from 'firebase-admin/app';
import { onCall, HttpsError, onRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { createRoom, joinSeat, leaveSeat, getRoom, deleteRoom, joinAsSpectator, leaveSpectator } from './handlers/room.js';
import {
  startHand,
  handlePlayerAction,
  setEndAfterHand as setEndAfterHandHandler,
  settlePokerGame as settlePokerGameHandler,
  showCards as showCardsHandler,
  handlePlayerTimeout as handlePlayerTimeoutHandler,
} from './handlers/game.js';
import {
  sendMessage,
  getMessages,
  deleteMessage,
} from './handlers/chat.js';
import {
  handleTurnTimeout as handleTurnTimeoutHandler,
  createTurnTimeoutTask,
  cancelTurnTimeoutTask,
} from './handlers/turnTimer.js';

// Constants
const TIMEOUT_ACTION = 'fold';

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

    // Return structured error if available
    if (error.code && error.details) {
      throw new HttpsError('failed-precondition', error.code, error.details);
    }

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

    // Return structured error if available
    if (error.code && error.details) {
      throw new HttpsError('failed-precondition', error.code, error.details);
    }

    throw new HttpsError('internal', error.message);
  }
});

/**
 * Set game to end after current hand
 */
export const setEndAfterHand = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { gameId } = request.data;
    await setEndAfterHandHandler(gameId);
    return { success: true };
  } catch (error) {
    console.error('Error setting end after hand:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Settle poker game and save to history
 */
export const settlePokerGame = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { gameId } = request.data;
    await settlePokerGameHandler(gameId);
    return { success: true };
  } catch (error) {
    console.error('Error settling game:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Delete a poker room (only creator can delete)
 */
export const deletePokerRoom = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { gameId } = request.data;
    const userId = request.auth.uid;

    await deleteRoom(gameId, userId);
    return { success: true };
  } catch (error) {
    console.error('Error deleting room:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Show cards voluntarily
 */
export const showPokerCards = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { gameId } = request.data;
    const userId = request.auth.uid;

    const result = await showCardsHandler(gameId, userId);
    return { success: true, result };
  } catch (error) {
    console.error('Error showing cards:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Handle player timeout
 */
export const playerTimeout = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { gameId } = request.data;
    const userId = request.auth.uid;

    const result = await handlePlayerTimeoutHandler(gameId, userId);
    return { success: true, result };
  } catch (error) {
    console.error('Error handling timeout:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Send chat message
 */
export const sendChatMessage = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { gameId, message } = request.data;
    const userId = request.auth.uid;
    const userInfo = {
      name: request.auth.token.name || 'Player',
      avatar: request.auth.token.picture || '',
    };

    const result = await sendMessage(gameId, userId, message, userInfo);
    return { success: true, result };
  } catch (error) {
    console.error('Error sending message:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Get chat messages
 */
export const getChatMessages = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { gameId, limit } = request.data;
    const messages = await getMessages(gameId, limit);
    return { success: true, messages };
  } catch (error) {
    console.error('Error getting messages:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Delete chat message
 */
export const deleteChatMessage = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { gameId, messageId } = request.data;
    const userId = request.auth.uid;

    await deleteMessage(gameId, messageId, userId);
    return { success: true };
  } catch (error) {
    console.error('Error deleting message:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Join as spectator
 */
export const joinPokerSpectator = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { gameId } = request.data;
    const userId = request.auth.uid;
    const userInfo = {
      name: request.auth.token.name || 'Spectator',
      avatar: request.auth.token.picture || '',
    };

    const result = await joinAsSpectator(gameId, userId, userInfo);
    return { success: true, result };
  } catch (error) {
    console.error('Error joining as spectator:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Leave spectator mode
 */
export const leavePokerSpectator = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { gameId } = request.data;
    const userId = request.auth.uid;

    await leaveSpectator(gameId, userId);
    return { success: true };
  } catch (error) {
    console.error('Error leaving spectator:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Handle turn timeout (called by Cloud Tasks)
 * This endpoint is called by Cloud Tasks when a player's turn times out
 */
export const handleTurnTimeout = onRequest(async (req, res) => {
  try {
    // Verify it's a POST request
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const { gameId, playerId, timestamp } = req.body;

    if (!gameId || !playerId) {
      res.status(400).send('Missing required parameters');
      return;
    }

    console.log(`Turn timeout triggered for player ${playerId} in game ${gameId} (timestamp: ${timestamp})`);

    // Process the timeout
    const result = await handleTurnTimeoutHandler(gameId, playerId);

    if (result.success) {
      // If timeout was valid, execute the fold action
      await handlePlayerAction(gameId, playerId, TIMEOUT_ACTION, 0);
      res.status(200).json({ success: true, action: TIMEOUT_ACTION });
    } else {
      res.status(200).json({ success: false, reason: result.reason });
    }
  } catch (error) {
    console.error('Error handling turn timeout:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Firestore trigger to manage turn timeout tasks
 * Triggered when the game document is updated
 */
export const onTurnChange = onDocumentWritten('pokerGames/{gameId}', async (event) => {
  const beforeData = event.data?.before?.data();
  const afterData = event.data?.after?.data();

  if (!afterData) return; // Document deleted

  const gameId = event.params.gameId;
  const beforeTurn = beforeData?.table?.currentTurn;
  const afterTurn = afterData?.table?.currentTurn;
  const turnTaskName = beforeData?.table?.currentTurnTaskName;

  // Check if the turn has changed
  if (beforeTurn !== afterTurn && afterTurn) {
    console.log(`Turn changed in game ${gameId}: ${beforeTurn} -> ${afterTurn}`);

    // Cancel previous turn's timeout task if it exists
    if (turnTaskName) {
      await cancelTurnTimeoutTask(turnTaskName);
    }

    // Create new timeout task for the new turn
    try {
      const turnTimeout = afterData.table?.turnTimeout || 30;
      const taskName = await createTurnTimeoutTask(gameId, afterTurn, turnTimeout);

      // Store the task name in Firestore so we can cancel it later
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();
      await db.collection('pokerGames').doc(gameId).update({
        'table.currentTurnTaskName': taskName,
      });
    } catch (error) {
      console.error('Error creating turn timeout task:', error);
    }
  }
});
