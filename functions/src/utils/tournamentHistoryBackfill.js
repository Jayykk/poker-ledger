import { deriveTournamentEntryMetrics } from './tournamentSettlementMath.js';

/* eslint-disable valid-jsdoc */

/** Build an idempotent metric patch for one user's tournament history. */
export function buildTournamentMetricPatch(history, game, uid) {
  if (history?.type !== 'tournament') return { status: 'skipped', patch: null };
  const rows = Array.isArray(history.settlement) ? history.settlement : [];
  const ownRow = rows.find((row) => row?.odId === uid);
  if (Number(history.baseBuyIn) > 0 && Number.isInteger(ownRow?.rebuyCount)) {
    return { status: 'already-complete', patch: null };
  }

  const baseBuyIn = Number(game?.baseBuyIn) || 0;
  const metrics = deriveTournamentEntryMetrics(ownRow?.buyIn, baseBuyIn);
  if (!ownRow || !metrics) return { status: 'unknown', patch: null };

  return {
    status: 'resolved',
    patch: {
      baseBuyIn,
      settlement: rows.map((row) => row === ownRow ? { ...row, ...metrics } : row),
    },
  };
}
