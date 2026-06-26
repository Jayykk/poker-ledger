/**
 * Cloud Tasks Utilities
 * Handles creating Cloud Tasks for turn timeouts with zombie prevention
 */

import { CloudTasksClient } from '@google-cloud/tasks';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirestore } from './db.js';
import { signTaskBody, TASK_SIGNATURE_HEADER } from './taskAuth.js';
import { FUNCTIONS_REGION } from './config.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
// Tasks live in the same region as the functions they invoke unless overridden.
const LOCATION = process.env.CLOUD_TASKS_LOCATION || FUNCTIONS_REGION;
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

    const bodyString = JSON.stringify(payload);
    const headers = { 'Content-Type': 'application/json' };
    const signature = signTaskBody(bodyString);
    if (signature) {
      headers[TASK_SIGNATURE_HEADER] = signature;
    }

    const task = {
      httpRequest: {
        httpMethod: 'POST',
        url: `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net/${endpoint}`,
        headers,
        body: Buffer.from(bodyString).toString('base64'),
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
    // Don't throw — task creation failure shouldn't break the game, but a
    // silently missing timer leaves the game stuck. Dead-letter the failure
    // so it can be alerted on / replayed.
    await recordTaskFailure({ endpoint, payload, error });
    return null;
  }
}

/**
 * Dead-letter record for failed task creation. Written best-effort — if even
 * this write fails we only log, to never break the calling game flow.
 * @param {Object} params
 * @param {string} params.endpoint - Target endpoint name
 * @param {Object} params.payload - Task payload that failed to schedule
 * @param {Error} params.error - Creation error
 */
async function recordTaskFailure({ endpoint, payload, error }) {
  try {
    await getFirestore().collection('taskFailures').add({
      endpoint,
      payload,
      error: String(error?.message || error),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (writeError) {
    console.error('Failed to dead-letter task failure:', writeError);
  }
}
