const ERROR_KEYS = {
  'functions/permission-denied': 'tournament.settlementPermissionDenied',
  'functions/failed-precondition': 'tournament.settlementStateChanged',
  'functions/unavailable': 'tournament.settlementUnavailable',
};

export function tournamentSettlementErrorKey(error) {
  return ERROR_KEYS[error?.code] || 'tournament.settlementFailed';
}