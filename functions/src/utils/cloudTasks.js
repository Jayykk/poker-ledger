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
  return createPokerHttpTask({
    endpoint: 'handleTurnTimeout',
    payload: {
      gameId,
      turnId, // 🔑 Include turnId for zombie prevention
      timestamp: Date.now(),
    },
    delaySeconds,
    logLabel: `turnId: ${turnId}`,
  });
}

/**
 * Create a Cloud Task for room idle auto-close.
 * This should ONLY be called AFTER a successful write / transaction.
 * @param {string} gameId - Game ID
 * @param {string} autoCloseToken - Token for stale-task prevention
 * @param {number} delaySeconds - Delay before running (default: 60 minutes)
 * @return {Promise<string|null>} Task name or null if failed
 */
export async function createRoomAutoCloseTask(gameId, autoCloseToken, delaySeconds = 60 * 60) {
  return createPokerHttpTask({
    endpoint: 'handleRoomAutoClose',
    payload: {
      gameId,
      autoCloseToken,
      timestamp: Date.now(),
    },
    delaySeconds,
    logLabel: `autoCloseToken: ${autoCloseToken}`,
  });
}

/**
 * Create a Cloud Task targeting a poker Cloud Function HTTP endpoint.
 * This should ONLY be called AFTER a successful transaction.
 * @param {Object} params
 * @param {string} params.endpoint - Cloud Function endpoint name (no leading slash)
 * @param {Object} params.payload - JSON payload
 * @param {number} params.delaySeconds - Delay before running
 * @param {string} [params.queueName] - Cloud Tasks queue name
 * @param {string} [params.logLabel] - Extra log label
 * @return {Promise<string|null>} Task name or null if failed
 */
export async function createPokerHttpTask({
  endpoint,
  payload,
  delaySeconds = 30,
  queueName = QUEUE_NAME,
  logLabel = '',
}) {
  try {
    const client = getTasksClient();
    const parent = client.queuePath(PROJECT_ID, LOCATION, queueName);

    const task = {
      httpRequest: {
        httpMethod: 'POST',
        url: `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net/${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      },
      scheduleTime: {
        seconds: Math.floor(Date.now() / 1000) + delaySeconds,
      },
    };

    const [response] = await client.createTask({ parent, task });
    console.log(`Created poker task: ${response.name}${logLabel ? ` (${logLabel})` : ''}`);
    return response.name;
  } catch (error) {
    console.error('Error creating poker task:', error);
    // Don't throw - task creation failure shouldn't break the game
    return null;
  }
}
