/**
 * Cloud Tasks request authentication.
 *
 * Tasks created by our own functions sign the JSON body with an HMAC-SHA256
 * keyed by POKER_TASKS_SECRET. The HTTP endpoints called by Cloud Tasks verify
 * the signature before processing, so the endpoints cannot be driven by
 * arbitrary external POSTs.
 *
 * Backward compatibility: when POKER_TASKS_SECRET is not configured the check
 * is skipped (with a warning) so existing deployments keep working until the
 * secret is provisioned: `firebase functions:secrets:set POKER_TASKS_SECRET`
 * or via functions/.env.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const TASK_SIGNATURE_HEADER = 'x-poker-task-signature';

/**
 * Read the signing secret from the environment.
 * @return {string} Secret, or empty string when not configured
 */
function getSecret() {
  return process.env.POKER_TASKS_SECRET || '';
}

/**
 * Sign a task body (the exact JSON string sent to Cloud Tasks).
 * @param {string} bodyString - JSON payload as it is sent
 * @return {?string} hex HMAC, or null when no secret is configured
 */
export function signTaskBody(bodyString) {
  const secret = getSecret();
  if (!secret) return null;
  return createHmac('sha256', secret).update(bodyString, 'utf8').digest('hex');
}

/**
 * Verify the signature on an incoming Cloud Tasks request.
 * @param {Object} req - Express request (provides get(), rawBody, body)
 * @return {boolean} True when the signature is valid or no secret is set
 */
export function verifyTaskRequest(req) {
  const secret = getSecret();
  if (!secret) {
    console.warn(
      '[taskAuth] POKER_TASKS_SECRET not configured — skipping task signature verification',
    );
    return true;
  }

  const provided = req.get(TASK_SIGNATURE_HEADER);
  if (!provided) return false;

  // rawBody preserves the exact bytes Cloud Tasks delivered.
  const body = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
  const expected = createHmac('sha256', secret).update(body, 'utf8').digest('hex');

  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Wrap an HTTP task handler with signature verification.
 * @param {Function} handler - (req, res) => Promise<void>
 * @return {Function}
 */
export function requireSignedTask(handler) {
  return async (req, res) => {
    if (!verifyTaskRequest(req)) {
      console.error('[taskAuth] Rejected task request with missing/invalid signature');
      res.status(403).json({ error: 'Invalid task signature' });
      return;
    }
    return handler(req, res);
  };
}
