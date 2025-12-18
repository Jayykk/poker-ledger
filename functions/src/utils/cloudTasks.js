/**
 * Cloud Tasks Utilities
 * Handles creating Cloud Tasks for turn timeouts with zombie prevention
 */

import { CloudTasksClient } from '@google-cloud/tasks';

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
const LOCATION = process.env.CLOUD_TASKS_LOCATION || 'us-central1';
const QUEUE_NAME = 'poker-turn-timeouts';

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
 * Create a Cloud Task for turn timeout
 * This should ONLY be called AFTER a successful transaction
 * @param {string} gameId - Game ID
 * @param {string} turnId - Turn UUID (for zombie prevention)
 * @param {number} delaySeconds - Delay before timeout
 * @return {Promise<string|null>} Task name or null if failed
 */
export async function createPokerTask(gameId, turnId, delaySeconds = 30) {
  try {
    const client = getTasksClient();
    const parent = client.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);

    const task = {
      httpRequest: {
        httpMethod: 'POST',
        url: `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net/handleTurnTimeout`,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify({
          gameId,
          turnId, // 🔑 Include turnId for zombie prevention
          timestamp: Date.now(),
        })).toString('base64'),
      },
      scheduleTime: {
        seconds: Math.floor(Date.now() / 1000) + delaySeconds,
      },
    };

    const [response] = await client.createTask({ parent, task });
    console.log(`Created poker task: ${response.name} for turnId: ${turnId}`);
    return response.name;
  } catch (error) {
    console.error('Error creating poker task:', error);
    // Don't throw - task creation failure shouldn't break the game
    // The player will just need to wait for manual intervention
    return null;
  }
}
