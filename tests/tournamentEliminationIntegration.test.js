import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (relPath) => readFileSync(resolve(__dirname, '..', relPath), 'utf-8');

const gameStoreContent = read('src/store/modules/game.js');
const tournamentGameViewContent = read('src/views/TournamentGameView.vue');
const clockViewContent = read('src/views/TournamentClockView.vue');

describe('Tournament elimination integration', () => {
  it('should keep playersRemaining sync inside eliminatePlayer transaction', () => {
    const eliminateFn = gameStoreContent.match(/const eliminatePlayer = async \(playerId\) => \{[\s\S]*?\n  \};/);
    expect(eliminateFn).not.toBeNull();
    expect(eliminateFn[0]).toContain("'state.playersRemaining': aliveAfter");
  });

  it('should auto-crown the last remaining player when the tournament ends', () => {
    const eliminateFn = gameStoreContent.match(/const eliminatePlayer = async \(playerId\) => \{[\s\S]*?\n  \};/);
    expect(eliminateFn).not.toBeNull();
    expect(eliminateFn[0]).toMatch(/if \(shouldEndTournament\)[\s\S]*crownSurvivors\(/);
  });

  it('should log the elimination with a restore snapshot inside the same transaction', () => {
    const eliminateFn = gameStoreContent.match(/const eliminatePlayer = async \(playerId\) => \{[\s\S]*?\n  \};/);
    expect(eliminateFn[0]).toContain('type: TX_TYPE_ELIMINATE');
    expect(eliminateFn[0]).toContain('buildEliminationRestore(');
    expect(eliminateFn[0]).toContain('snapshotSessionClock(');
  });

  it('should log the re-entry with a snapshot of the eliminated state it replaces', () => {
    const reentryFn = gameStoreContent.match(/const reentryPlayer = async \(playerId\) => \{[\s\S]*?\n  \};/);
    expect(reentryFn).not.toBeNull();
    expect(reentryFn[0]).toContain('type: TX_TYPE_REENTRY');
    expect(reentryFn[0]).toContain('applyReentry(players, playerId, baseBuyIn)');
    // The view must not write a second, non-atomic 'reentry' log record
    expect(tournamentGameViewContent).not.toContain("'reentry', baseBuyIn)");
  });

  it('undoing a re-entry should restore eliminated state and sync session counters atomically', () => {
    const undoFn = gameStoreContent.match(/const undoReentryTx = async \(txId\) => \{[\s\S]*?\n  \};/);
    expect(undoFn).not.toBeNull();
    expect(undoFn[0]).toContain('revertReentry(');
    expect(undoFn[0]).toContain("'state.playersRemaining': aliveAfter");
    expect(undoFn[0]).toContain("'state.reentries'");
    expect(undoFn[0]).toContain("transaction.update(txRef, { status: 'undone' })");
  });

  it('undoing an elimination should reopen the clock when that elimination had ended the tournament', () => {
    const undoFn = gameStoreContent.match(/const undoEliminationTx = async \(txId\) => \{[\s\S]*?\n  \};/);
    expect(undoFn).not.toBeNull();
    expect(undoFn[0]).toContain('revertElimination(');
    expect(undoFn[0]).toContain('buildReopenedSessionUpdates(');
    expect(undoFn[0]).toContain("'state.playersRemaining': aliveAfter");
  });

  it('view should route eliminate / reentry log undo to the dedicated store actions', () => {
    const handleUndo = tournamentGameViewContent.match(/const handleUndoBuyIn = async \(tx\) => \{[\s\S]*?\n\};/);
    expect(handleUndo).not.toBeNull();
    expect(handleUndo[0]).toContain("tx.type === 'eliminate'");
    expect(handleUndo[0]).toContain("tx.type === 'reentry'");
    expect(handleUndo[0]).not.toContain("'state.reentries'");
    expect(tournamentGameViewContent).toContain('undoEliminationTx(tx.txId)');
    expect(tournamentGameViewContent).toContain('undoReentryTx(tx.txId)');
  });

  it('view should not perform a second tournament session write after elimination', () => {
    const handleEliminate = tournamentGameViewContent.match(/const handleEliminate = async \(player\) => \{[\s\S]*?\n\};/);
    expect(handleEliminate).not.toBeNull();
    expect(handleEliminate[0]).not.toContain('firebase/firestore');
    expect(handleEliminate[0]).not.toContain('updateDoc(sessionRef');
  });
});

// The timer lives in the style 1 face (ScoreboardClockBoard) now.
describe('Tournament clock timer sizing', () => {
  const scoreboard = read('src/components/tournament/ScoreboardClockBoard.vue');
  const timerRule = scoreboard.slice(scoreboard.indexOf('.sb-timer {'), scoreboard.indexOf('}', scoreboard.indexOf('.sb-timer {')));

  it('keeps the timer width steady while it counts (tabular figures)', () => {
    expect(timerRule).toContain('font-variant-numeric: tabular-nums');
  });

  it('scales the timer with the screen, including a phone size', () => {
    expect(timerRule).toContain('calc(var(--u) * 21)');
    expect(scoreboard).toContain('--u: min(1cqw, 1.75cqh)');
    expect(scoreboard).toMatch(/@container \(max-width: 720px\)[\s\S]*\.sb-timer \{ font-size: calc\(var\(--u\) \* 15\); \}/);
  });

  it('the host view still renders it', () => {
    expect(clockViewContent).toContain('<ScoreboardClockBoard');
  });
});