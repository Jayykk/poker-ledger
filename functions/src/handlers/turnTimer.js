/**
 * Turn Timer Handler using Cloud Tasks
 * Manages turn timeouts in the backend to prevent client-side timer issues
 */

import { CloudTasksClient } from '@google-cloud/tasks';
import { getFirestore } from 'firebase-admin/firestore';

// Constants
const DEFAULT_TURN_TIMEOUT = 30; // seconds
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
const LOCATION = process.env.CLOUD_TASKS_LOCATION || 'us-central1';
const QUEUE_NAME = 'poker-turn-timeouts';
const GRPC_NOT_FOUND = 5; // gRPC status code for NOT_FOUND
const TIMEOUT_ACTION = 'fold'; // Action to perform on timeout

// Initialize Cloud Tasks client
let tasksClient = null;

/**
 * Get or initialize the Cloud Tasks client
 * @return {CloudTasksClient} The Cloud Tasks client instance
 */
function getTasksClient() {
  if (!tasksClient) {
    tasksClient = new CloudTasksClient();
  }
  return tasksClient;
}

/**
 * Create a Cloud Task to handle turn timeout
 * @param {string} gameId - Game ID
 * @param {string} playerId - Player ID whose turn it is
 * @param {number} delaySeconds - Delay before timeout (default: 30s)
 * @return {Promise<string>} Task name
 */
export async function createTurnTimeoutTask(gameId, playerId, delaySeconds = DEFAULT_TURN_TIMEOUT) {
  try {
    const client = getTasksClient();

    // Construct the fully qualified queue name
    const parent = client.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);

    // Construct the task
    const task = {
      httpRequest: {
        httpMethod: 'POST',
        url: `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net/handleTurnTimeout`,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify({
          gameId,
          playerId,
          timestamp: Date.now(),
        })).toString('base64'),
      },
      scheduleTime: {
        seconds: Math.floor(Date.now() / 1000) + delaySeconds,
      },
    };

    // Create the task
    const [response] = await client.createTask({ parent, task });
    console.log(`Created turn timeout task: ${response.name}`);

    return response.name;
  } catch (error) {
    console.error('Error creating turn timeout task:', error);
    throw error;
  }
}

/**
 * Cancel a pending turn timeout task
 * @param {string} taskName - Full task name to cancel
 * @return {Promise<void>}
 */
export async function cancelTurnTimeoutTask(taskName) {
  if (!taskName) return;

  try {
    const client = getTasksClient();
    await client.deleteTask({ name: taskName });
    console.log(`Cancelled turn timeout task: ${taskName}`);
  } catch (error) {
    // Task may have already executed or been deleted
    if (error.code !== GRPC_NOT_FOUND) {
      console.error('Error cancelling task:', error);
    }
  }
}

/**
 * Handle turn timeout - auto-fold the player
 * @param {string} gameId - Game ID
 * @param {string} playerId - Player ID who timed out
 * @return {Promise<Object>} Result
 */
export async function handleTurnTimeout(gameId, playerId) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);

  return db.runTransaction(async (transaction) => {
    const gameDoc = await transaction.get(gameRef);

    if (!gameDoc.exists) {
      throw new Error('Game not found');
    }

    const game = gameDoc.data();

    // Verify it's still this player's turn
    if (game.table?.currentTurn !== playerId) {
      console.log(`Turn timeout ignored - no longer player's turn (${playerId})`);
      return { success: false, reason: 'not_current_turn' };
    }

    // Check if game is still active
    if (game.status !== 'playing') {
      console.log(`Turn timeout ignored - game not active (${game.status})`);
      return { success: false, reason: 'game_not_active' };
    }

    console.log(`Processing turn timeout for player ${playerId} in game ${gameId}`);

    // Return success - the actual fold action will be handled by the HTTP endpoint
    // to avoid transaction issues
    return { success: true, action: TIMEOUT_ACTION, playerId };
  });
}

/**
 * Create turn expiration timestamp
 * @param {number} timeoutSeconds - Timeout duration in seconds
 * @return {Object} Firestore timestamp
 */
export function createTurnExpiresAt(timeoutSeconds = DEFAULT_TURN_TIMEOUT) {
  const expiresAt = new Date(Date.now() + timeoutSeconds * 1000);
  return expiresAt;
}
