const ERROR_KEYS = {
  'functions/permission-denied': 'game.settlementPermissionDenied',
  'functions/failed-precondition': 'game.settlementStateChanged',
  'functions/invalid-argument': 'game.settlementRateInvalid',
  'functions/unavailable': 'game.settlementUnavailable',
};

export function cashSettlementErrorKey(error) {
  return ERROR_KEYS[error?.code] || 'game.settlementFailed';
}