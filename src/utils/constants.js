// Constants for the Poker Sync Pro application

// Currency configurations
export const CURRENCIES = {
  TWD: { symbol: 'NT$', name: '新台幣', rate: 1 },
  USD: { symbol: '$', name: '美元', rate: 0.032 },
  CNY: { symbol: '¥', name: '人民幣', rate: 0.22 },
  JPY: { symbol: '¥', name: '日圓', rate: 4.5 }
};

// Default buy-in amounts
export const DEFAULT_BUY_IN = 2000;
export const BUY_IN_INCREMENT = 100;

// Default exchange rate (chips to cash)
export const DEFAULT_EXCHANGE_RATE = 10;

// Blind timer presets (in minutes)
export const BLIND_TIMER_PRESETS = [15, 20, 30, 45, 60];
export const DEFAULT_BLIND_DURATION = 20;
export const DEFAULT_BREAK_DURATION = 5;

// Game status
export const GAME_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Friend request status
export const FRIEND_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected'
};

// Chart colors
export const CHART_COLORS = {
  profit: '#10b981',
  loss: '#ef4444',
  neutral: '#6b7280',
  background: 'rgba(16,185,129,0.1)'
};

// Time periods for analytics
export const TIME_PERIODS = {
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
  ALL: 'all'
};

// Notification sounds
export const SOUND_ENABLED_KEY = 'poker_sound_enabled';

// Storage keys
export const STORAGE_KEYS = {
  LAST_GAME_ID: 'last_game_id',
  THEME: 'poker_theme',
  LANGUAGE: 'poker_language',
  SOUND_ENABLED: 'poker_sound_enabled',
  NOTIFICATIONS_ENABLED: 'poker_notifications_enabled'
};

// Theme options
export const THEMES = {
  DARK: 'dark',
  LIGHT: 'light'
};

// Language options
export const LANGUAGES = {
  ZH_TW: 'zh-TW',
  ZH_CN: 'zh-CN',
  EN: 'en',
  JA: 'ja'
};

// Export formats
export const EXPORT_FORMATS = {
  CSV: 'csv',
  PDF: 'pdf'
};

// Maximum players per game
export const MAX_PLAYERS = 10;

// Minimum name length
export const MIN_NAME_LENGTH = 1;
export const MAX_NAME_LENGTH = 20;

// Z-index layers
export const Z_INDEX = {
  TOAST: 100,
  ACTION_NOTIFICATION: 200,
  MODAL: 300
};
