/**
 * Lightweight logger.
 * debug() is a no-op in production builds so ad-hoc tracing never reaches
 * end users; warn/error always pass through to the console.
 */

const isDev = import.meta.env.DEV;

export const logger = {
  /**
   * Development-only diagnostic output (replaces ad-hoc console.log).
   * @param {...*} args Values to log
   */
  debug(...args) {
    if (isDev) console.log(...args);
  },

  /** @param {...*} args Values to log */
  info(...args) {
    if (isDev) console.info(...args);
  },

  /** @param {...*} args Values to log */
  warn(...args) {
    console.warn(...args);
  },

  /** @param {...*} args Values to log */
  error(...args) {
    console.error(...args);
  },
};
