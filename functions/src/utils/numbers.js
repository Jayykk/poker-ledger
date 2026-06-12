/**
 * Shared numeric coercion helpers.
 * Single source of truth for turning untrusted numeric-like input into safe
 * numbers (NaN/null/undefined/Infinity → fallback).
 */

/**
 * Coerce a numeric-like value into a finite number.
 * @param {*} value Raw input (string, number, null, …)
 * @param {number} fallback Value to use when input is not a finite number
 * @return {number} Finite number
 */
export function coerceNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Round an input value to the nearest integer.
 * @param {*} value Raw numeric-like value.
 * @return {number} Rounded integer value.
 */
export function roundNumber(value) {
  return Math.round(coerceNumber(value));
}

/**
 * Convert a Firestore timestamp-like value into epoch milliseconds.
 * @param {*} value Timestamp, ISO string, or number.
 * @return {number} Millisecond timestamp.
 */
export function toMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return roundNumber(value);
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : roundNumber(parsed);
  }
  if (typeof value.toMillis === 'function') {
    return roundNumber(value.toMillis());
  }
  return 0;
}
