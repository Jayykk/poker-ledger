/**
 * Runtime-tunable game timing configuration.
 * Each value can be overridden via environment variable (functions/.env or
 * `firebase functions:config` v2 env) without a code change — only a redeploy
 * to pick up the new value.
 */

import { coerceNumber } from './numbers.js';

/**
 * Read a positive number from the environment with a fallback.
 * @param {string} name Environment variable name
 * @param {number} fallback Default value
 * @return {number} Configured value
 */
function envNumber(name, fallback) {
  const value = coerceNumber(process.env[name], fallback);
  return value > 0 ? value : fallback;
}

// Seconds a player has to act before auto fold/check.
export const DEFAULT_TURN_TIMEOUT = envNumber('TURN_TIMEOUT_SECONDS', 30);

// UX: pause at showdown so players can see runout + hand comparison.
// Cloud Tasks scheduleTime is second-granular; 5s avoids feeling instant.
export const SHOWDOWN_RESOLVE_DELAY_SECONDS = envNumber('SHOWDOWN_RESOLVE_DELAY_SECONDS', 5);

// Base "admire the board" window before auto-starting the next hand (ms).
export const SHOWDOWN_ADMIRE_TIME_MS = envNumber('SHOWDOWN_ADMIRE_TIME_MS', 5000);

// If the win-by-fold winner doesn't choose show/muck in time, default to muck.
export const WIN_BY_FOLD_TIMEOUT_SECONDS = envNumber('WIN_BY_FOLD_TIMEOUT_SECONDS', 5);

// Idle time before a room is auto-closed.
export const ROOM_IDLE_TIMEOUT_SECONDS = envNumber('ROOM_IDLE_TIMEOUT_SECONDS', 60 * 60);
