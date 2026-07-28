import { describe, expect, it } from 'vitest';
import { tournamentSettlementErrorKey } from '../src/utils/tournamentSettlementErrors.js';

describe('tournamentSettlementErrorKey', () => {
  it.each([
    ['functions/permission-denied', 'tournament.settlementPermissionDenied'],
    ['functions/failed-precondition', 'tournament.settlementStateChanged'],
    ['functions/unavailable', 'tournament.settlementUnavailable'],
  ])('maps %s to %s', (code, expected) => {
    expect(tournamentSettlementErrorKey({ code })).toBe(expected);
  });

  it('uses a generic fallback', () => {
    expect(tournamentSettlementErrorKey({ code: 'functions/internal' }))
      .toBe('tournament.settlementFailed');
  });
});