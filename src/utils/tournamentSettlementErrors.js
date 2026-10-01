const ERROR_KEYS = {
  'functions/permission-denied': 'tournament.settlementPermissionDenied',
  'functions/failed-precondition': 'tournament.settlementStateChanged',
  'functions/unavailable': 'tournament.settlementUnavailable',
};

export function tournamentSettlementErrorKey(error) {
  // Mystery bounty: a knockout's envelope hasn't been drawn yet
  if (String(error?.message || '').includes('MYSTERY_DRAWS_PENDING')) return 'mystery.drawsPending';
  return ERROR_KEYS[error?.code] || 'tournament.settlementFailed';
}