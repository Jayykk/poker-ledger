/**
 * Structured Game Error Definitions
 * Provides standardized error codes for consistent error handling
 */

/**
 * Game error codes
 */
export const GameErrorCodes = {
  // Game state errors
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  INSUFFICIENT_CHIPS: 'INSUFFICIENT_CHIPS',
  INVALID_ACTION: 'INVALID_ACTION',
  GAME_NOT_ACTIVE: 'GAME_NOT_ACTIVE',
  GAME_NOT_FOUND: 'GAME_NOT_FOUND',
  GAME_ALREADY_IN_PROGRESS: 'GAME_ALREADY_IN_PROGRESS',
  GAME_ALREADY_STARTED: 'GAME_ALREADY_STARTED',
  INVALID_GAME_STATE: 'INVALID_GAME_STATE',

  // Player errors
  INVALID_RAISE_AMOUNT: 'INVALID_RAISE_AMOUNT',
  RAISE_TOO_SMALL: 'RAISE_TOO_SMALL',
  ALREADY_FOLDED: 'ALREADY_FOLDED',
  ALREADY_ALL_IN: 'ALREADY_ALL_IN',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  INVALID_PLAYER_STATUS: 'INVALID_PLAYER_STATUS',

  // Action errors
  CANNOT_CHECK: 'CANNOT_CHECK',
  NOTHING_TO_CALL: 'NOTHING_TO_CALL',
  NOT_ENOUGH_CHIPS: 'NOT_ENOUGH_CHIPS',
  NO_CHIPS_FOR_ALL_IN: 'NO_CHIPS_FOR_ALL_IN',

  // Seat errors
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  SEAT_ALREADY_OCCUPIED: 'SEAT_ALREADY_OCCUPIED',
  ALREADY_SEATED: 'ALREADY_SEATED',
  INVALID_SEAT_NUMBER: 'INVALID_SEAT_NUMBER',
  INVALID_BUY_IN: 'INVALID_BUY_IN',

  // Authorization errors
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  // Turn synchronization errors
  STALE_ACTION: 'STALE_ACTION',
};

/**
 * Error messages for each error code
 */
export const GameErrorMessages = {
  // Game state errors
  [GameErrorCodes.NOT_YOUR_TURN]: '還沒輪到你',
  [GameErrorCodes.INSUFFICIENT_CHIPS]: '籌碼不足',
  [GameErrorCodes.INVALID_ACTION]: '無效的操作',
  [GameErrorCodes.GAME_NOT_ACTIVE]: '遊戲尚未開始',
  [GameErrorCodes.GAME_NOT_FOUND]: '找不到遊戲房間',
  [GameErrorCodes.GAME_ALREADY_IN_PROGRESS]: '遊戲已經開始',
  [GameErrorCodes.GAME_ALREADY_STARTED]: '遊戲已經開始',
  [GameErrorCodes.INVALID_GAME_STATE]: '遊戲狀態無效',

  // Player errors
  [GameErrorCodes.INVALID_RAISE_AMOUNT]: '加注金額無效',
  [GameErrorCodes.RAISE_TOO_SMALL]: '加注金額太小',
  [GameErrorCodes.ALREADY_FOLDED]: '你已經棄牌了',
  [GameErrorCodes.ALREADY_ALL_IN]: '你已經全下了',
  [GameErrorCodes.PLAYER_NOT_FOUND]: '找不到玩家',
  [GameErrorCodes.INVALID_PLAYER_STATUS]: '玩家狀態無效',

  // Action errors
  [GameErrorCodes.CANNOT_CHECK]: '不能過牌，必須跟注或棄牌',
  [GameErrorCodes.NOTHING_TO_CALL]: '沒有需要跟注的金額',
  [GameErrorCodes.NOT_ENOUGH_CHIPS]: '籌碼不足',
  [GameErrorCodes.NO_CHIPS_FOR_ALL_IN]: '沒有籌碼可以全下',

  // Seat errors
  [GameErrorCodes.NOT_ENOUGH_PLAYERS]: '至少需要2位玩家才能開始',
  [GameErrorCodes.SEAT_ALREADY_OCCUPIED]: '座位已被佔用',
  [GameErrorCodes.ALREADY_SEATED]: '你已經坐在牌桌上了',
  [GameErrorCodes.INVALID_SEAT_NUMBER]: '無效的座位號碼',
  [GameErrorCodes.INVALID_BUY_IN]: '買入金額無效',

  // Authorization errors
  [GameErrorCodes.NOT_AUTHORIZED]: '沒有權限執行此操作',
  // Turn synchronization errors
  [GameErrorCodes.STALE_ACTION]: '此操作已過期',
};

/**
 * Create a structured game error
 * @param {string} code - Error code from GameErrorCodes
 * @param {Object} details - Additional error details
 * @return {Error} Error object with code and details
 */
export function createGameError(code, details = {}) {
  const error = new Error(GameErrorMessages[code] || code);
  error.code = code;
  error.details = details;
  return error;
}
