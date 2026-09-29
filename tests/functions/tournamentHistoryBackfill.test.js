import { describe, expect, it } from 'vitest';
import { buildTournamentMetricPatch } from '../../functions/src/utils/tournamentHistoryBackfill.js';

describe('buildTournamentMetricPatch', () => {
  it('derives a legacy rebuy snapshot from the source game', () => {
    expect(buildTournamentMetricPatch({
      type: 'tournament',
      settlement: [{ odId: 'u1', buyIn: 3000, prize: 4000 }],
    }, { baseBuyIn: 1000 }, 'u1')).toEqual({
      status: 'resolved',
      patch: {
        baseBuyIn: 1000,
        settlement: [{
          odId: 'u1', buyIn: 3000, prize: 4000,
          entryCount: 3, rebuyCount: 2,
        }],
      },
    });
  });

  it('reports unknown without source data', () => {
    expect(buildTournamentMetricPatch({
      type: 'tournament', settlement: [{ odId: 'u1', buyIn: 3000 }],
    }, null, 'u1')).toEqual({ status: 'unknown', patch: null });
  });

  it('does not rewrite completed snapshots', () => {
    expect(buildTournamentMetricPatch({
      type: 'tournament', baseBuyIn: 1000,
      settlement: [{ odId: 'u1', buyIn: 3000, entryCount: 3, rebuyCount: 2 }],
    }, null, 'u1')).toEqual({ status: 'already-complete', patch: null });
  });
});