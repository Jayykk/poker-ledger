/**
 * Game Handlers (façade)
 *
 * This module used to contain all game logic in a single file. It has been
 * split into three cohesive modules, and this file now only re-exports their
 * public API so existing imports (index.js, room.js, turnTimer.js, handTasks.js)
 * keep working unchanged:
 *
 * - gameFlow.js    — hand lifecycle: startHand, advanceRound, handleLastManStanding,
 *                    resolveShowdown, winByFoldTimeout (+ showdown helpers)
 * - gameActions.js — player actions: handlePlayerAction, handlePlayerTimeout, showCards
 * - gameControl.js — game control/lifecycle: setEndAfterHand, settlePokerGame,
 *                    sitDown, togglePause, stopNextHand, resumeGame
 */

export {
  startHand,
  handleLastManStanding,
  advanceRound,
  resolveShowdown,
  winByFoldTimeout,
} from './gameFlow.js';

export {
  handlePlayerAction,
  showCards,
  handlePlayerTimeout,
} from './gameActions.js';

export {
  setEndAfterHand,
  settlePokerGame,
  sitDown,
  togglePause,
  stopNextHand,
  resumeGame,
} from './gameControl.js';
