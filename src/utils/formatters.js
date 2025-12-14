// Formatting utilities for Poker Sync Pro

/**
 * Format number with thousand separators
 * @param {number} n - Number to format
 * @returns {string} Formatted number string
 */
export const formatNumber = (n) => {
  if (n === null || n === undefined) return '0';
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/**
 * Format cash value with exchange rate
 * @param {number} chips - Chip amount
 * @param {number} rate - Exchange rate
 * @returns {string} Formatted cash value
 */
export const formatCash = (chips, rate = 1) => {
  const val = chips / rate;
  return Number.isInteger(val) ? val.toString() : val.toFixed(1);
};

/**
 * Format currency with symbol
 * @param {number} amount - Amount to format
 * @param {string} currencyCode - Currency code (TWD, USD, etc.)
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount, currencyCode = 'TWD') => {
  const currencies = {
    TWD: 'NT$',
    USD: '$',
    CNY: '¥',
    JPY: '¥'
  };
  const symbol = currencies[currencyCode] || '';
  return `${symbol}${formatNumber(amount)}`;
};

/**
 * Format date to localized string
 * @param {Date|string|number} date - Date to format
 * @param {string} locale - Locale code
 * @returns {string} Formatted date string
 */
export const formatDate = (date, locale = 'zh-TW') => {
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

/**
 * Format short date (date only, no time)
 * @param {Date|string|number} date - Date to format
 * @param {string} locale - Locale code
 * @returns {string} Formatted date string
 */
export const formatShortDate = (date, locale = 'zh-TW') => {
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toLocaleDateString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

/**
 * Format time (time only, no date)
 * @param {Date|string|number} date - Date to format
 * @param {string} locale - Locale code
 * @returns {string} Formatted time string
 */
export const formatTime = (date, locale = 'zh-TW') => {
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

/**
 * Calculate net profit/loss
 * @param {Object} player - Player object with stack and buyIn
 * @returns {number} Net profit or loss
 */
export const calculateNet = (player) => {
  if (!player) return 0;
  return (player.stack || 0) - (player.buyIn || 0);
};

/**
 * Get color class based on profit/loss
 * @param {number} value - Value to check
 * @returns {string} Tailwind color class
 */
export const getProfitColorClass = (value) => {
  if (value > 0) return 'text-emerald-400';
  if (value < 0) return 'text-rose-400';
  return 'text-gray-400';
};

/**
 * Sanitize input string to prevent XSS
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
export const sanitizeInput = (str) => {
  if (!str) return '';
  return str.replace(/[<>]/g, '').trim();
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
export const isValidEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

/**
 * Generate short ID
 * @returns {string} Short ID
 */
export const generateShortId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
export const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
};
