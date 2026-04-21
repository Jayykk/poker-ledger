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
    expect(eliminateFn[0]).toMatch(/if \(shouldEndTournament\)[\s\S]*placement:\s*1/);
  });

  it('view should not perform a second tournament session write after elimination', () => {
    const handleEliminate = tournamentGameViewContent.match(/const handleEliminate = async \(player\) => \{[\s\S]*?\n\};/);
    expect(handleEliminate).not.toBeNull();
    expect(handleEliminate[0]).not.toContain('firebase/firestore');
    expect(handleEliminate[0]).not.toContain('updateDoc(sessionRef');
  });
});

describe('Tournament clock timer sizing', () => {
  it('should give the timer display a proportional minimum width', () => {
    expect(clockViewContent).toContain('min-width: 6.4ch;');
  });

  it('should use larger responsive timer font sizes across breakpoints', () => {
    expect(clockViewContent).toContain('font-size: clamp(4.85rem, 13.6vw, 11rem);');
    expect(clockViewContent).toContain('font-size: clamp(7.5rem, 8.4vw, 8.75rem);');
    expect(clockViewContent).toContain('font-size: clamp(4.6rem, 17vw, 5.4rem);');
  });
});