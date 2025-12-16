/**
 * Chat Handler
 * Functions for managing in-game chat
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/**
 * Send a chat message in a poker game
 * @param {string} gameId - Game ID
 * @param {string} userId - User ID
 * @param {string} message - Message text
 * @param {Object} userInfo - User information (name, avatar)
 * @return {Promise<Object>} Result
 */
export async function sendMessage(gameId, userId, message, userInfo) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  // Validate message
  if (!message || typeof message !== 'string') {
    throw new Error('Invalid message');
  }

  // Sanitize and limit message length
  const sanitizedMessage = message.trim().substring(0, 500);

  if (sanitizedMessage.length === 0) {
    throw new Error('Message cannot be empty');
  }

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw new Error('Game not found');
    }

    const game = gameDoc.data();

    // Verify user is in the game or is a spectator
    const isPlayer = Object.values(game.seats || {})
      .some((seat) => seat && seat.odId === userId);
    const isSpectator = (game.spectators || []).some((s) => s.userId === userId);

    if (!isPlayer && !isSpectator) {
      throw new Error('User not in game');
    }

    // Add message to chat collection
    const chatRef = gameRef.collection('chat');
    const messageData = {
      userId,
      userName: userInfo.name || 'Player',
      userAvatar: userInfo.avatar || '',
      message: sanitizedMessage,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: Date.now(),
    };

    await chatRef.add(messageData);

    return {
      gameId,
      messageId: 'pending', // Will be assigned by Firestore
      success: true,
    };
  });
}

/**
 * Get chat messages for a game
 * @param {string} gameId - Game ID
 * @param {number} limit - Maximum number of messages to retrieve
 * @return {Promise<Array>} Array of messages
 */
export async function getMessages(gameId, limit = 50) {
  const db = getFirestore();
  const chatRef = db.collection('pokerGames').doc(gameId).collection('chat');

  const snapshot = await chatRef
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  const messages = [];
  snapshot.forEach((doc) => {
    messages.push({
      id: doc.id,
      ...doc.data(),
    });
  });

  return messages.reverse(); // Return in chronological order
}

/**
 * Delete a chat message (only sender or game creator can delete)
 * @param {string} gameId - Game ID
 * @param {string} messageId - Message ID
 * @param {string} userId - User ID requesting deletion
 * @return {Promise<void>}
 */
export async function deleteMessage(gameId, messageId, userId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);
  const messageRef = gameRef.collection('chat').doc(messageId);

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);
    const messageDoc = await transaction.get(messageRef);

    if (!gameDoc.exists) {
      throw new Error('Game not found');
    }

    if (!messageDoc.exists) {
      throw new Error('Message not found');
    }

    const game = gameDoc.data();
    const message = messageDoc.data();

    // Check permissions: message sender or game creator
    const isCreator = game.meta?.createdBy === userId;
    const isSender = message.userId === userId;

    if (!isCreator && !isSender) {
      throw new Error('Permission denied');
    }

    transaction.delete(messageRef);
  });
}
