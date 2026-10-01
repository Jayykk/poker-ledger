/**
 * Flow Integration Tests
 * Verifies end-to-end flows by reading source code and simulating
 * state transitions without Firebase. Catches regressions in:
 * - Room creation flow (cash vs tournament vs online)
 * - Tournament clock lifecycle (level progression, last-level behavior)
 * - Lobby layout (tools section, ActionModal scope)
 * - Preset management (card interactions, delete)
 * - App.vue route guards (HUD, bottom nav)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
  GAME_TYPE, GAME_STATUS, DEFAULT_BUY_IN, DEFAULT_TOURNAMENT_LEVEL_DURATION,
  DEFAULT_STARTING_CHIPS, DEFAULT_REENTRY_LEVEL,
} from '../src/utils/constants.js';
import { TOURNAMENT_TEMPLATES, cloneTemplate, createBlankTournamentConfig } from '../src/utils/tournamentTemplates.js';

// ─── Helpers: read source files ────────────────────────────────────────
const read = (relPath) => readFileSync(resolve(__dirname, '..', relPath), 'utf-8');

const lobbyContent = read('src/views/LobbyView.vue');
const appContent = read('src/App.vue');
const clockViewContent = read('src/views/TournamentClockView.vue');
const structuresViewContent = read('src/views/BlindStructuresView.vue');
const templatesViewContent = read('src/views/TableTemplatesView.vue');
const gameStoreContent = read('src/store/modules/game.js');
const clockComposable = read('src/composables/useTournamentClock.js');

// ═══════════════════════════════════════════════════════════════════════
// 1. Room Creation Flow
// ═══════════════════════════════════════════════════════════════════════
describe('Room creation flow', () => {
  describe('multi-step create modal in LobbyView', () => {
    it('should have step 1 with game type selection (cash / tournament)', () => {
      expect(lobbyContent).toContain('createStep === 1');
      expect(lobbyContent).toContain("selectGameType('cash')");
      expect(lobbyContent).toContain("selectGameType('tournament')");
    });

    it('step 1 should show cashGame and tournamentGame i18n labels', () => {
      expect(lobbyContent).toContain("$t('lobby.cashGame')");
      expect(lobbyContent).toContain("$t('lobby.tournamentGame')");
    });

    it('should have step 2 for tournament template selection', () => {
      expect(lobbyContent).toContain("createStep === 2");
      expect(lobbyContent).toContain('allTemplateOptions');
      expect(lobbyContent).toContain('selectedTemplate');
    });

    it('cash game should skip template step (go to step 2 which is name+buyin)', () => {
      // selectGameType('cash') sets createStep to 2 directly
      expect(lobbyContent).toMatch(/selectGameType.*cash[\s\S]*?createStep\.value\s*=\s*2/);
    });

    it('step 3 / final step should have name input and buy-in controls', () => {
      expect(lobbyContent).toContain('gameName');
      expect(lobbyContent).toContain('createBuyIn');
      expect(lobbyContent).toContain('incrementCreateBuyIn');
      expect(lobbyContent).toContain('decrementCreateBuyIn');
    });

    it('should have back buttons to return to previous steps', () => {
      // Multiple back button references
      const backMatches = lobbyContent.match(/createStep\s*=\s*1/g);
      expect(backMatches).not.toBeNull();
      expect(backMatches.length).toBeGreaterThanOrEqual(1);
    });

    it('should reset all create state when modal closes', () => {
      expect(lobbyContent).toMatch(/watch\(showCreateModal/);
      expect(lobbyContent).toContain('createStep.value = 1');
      expect(lobbyContent).toContain('selectedGameType.value = null');
      expect(lobbyContent).toContain('selectedTemplate.value = null');
    });
  });

  describe('tournament room creation', () => {
    it('should auto-create tournament session before creating game', () => {
      expect(lobbyContent).toContain('createTournamentSession');
      // Tournament session is created first, then game
      const createSessionIdx = lobbyContent.indexOf('createTournamentSession(clockConfig)');
      const createGameIdx = lobbyContent.indexOf('createGame(');
      expect(createSessionIdx).toBeLessThan(createGameIdx);
    });

    it('should pass tournamentSessionId to createGame options', () => {
      expect(lobbyContent).toContain('gameCreationFromTemplate(template, { tournamentSessionId })');
      expect(lobbyContent).toContain('const options = game.options');
    });

    it('should merge built-in templates and user templates in allTemplateOptions', () => {
      expect(lobbyContent).toContain('allTemplateOptions');
      expect(lobbyContent).toContain('TOURNAMENT_TEMPLATES');
      expect(lobbyContent).toContain('userTemplates');
      expect(lobbyContent).toContain('templateFromBuiltInTournament');
    });

    it('should show template summary with change button in final step', () => {
      expect(lobbyContent).toContain("$t('common.change')");
      expect(lobbyContent).toContain('templateSummary(selectedTemplate, t)');
    });
  });

  describe('game store createGame status logic', () => {
    it('should use ACTIVE status for non-online games', () => {
      // Only online games should use WAITING
      expect(gameStoreContent).toContain('GAME_TYPE.ONLINE');
      expect(gameStoreContent).toMatch(
        /type\s*===\s*GAME_TYPE\.ONLINE\s*\?\s*GAME_STATUS\.WAITING\s*:\s*GAME_STATUS\.ACTIVE/
      );
    });

    it('tournament games should get ACTIVE status (not WAITING)', () => {
      // Verify by the ternary: only ONLINE -> WAITING, everything else -> ACTIVE
      // This ensures tournament rooms show up in loadMyRooms query
      const statusLine = gameStoreContent.match(/status:\s*type\s*===\s*GAME_TYPE\.\w+.*GAME_STATUS\.\w+.*GAME_STATUS\.\w+/);
      expect(statusLine).not.toBeNull();
      expect(statusLine[0]).toContain('GAME_TYPE.ONLINE');
      expect(statusLine[0]).not.toContain('GAME_TYPE.LIVE'); // Not checking LIVE specifically
    });

    it('loadMyRooms should query ACTIVE status', () => {
      expect(gameStoreContent).toMatch(/loadMyRooms[\s\S]*?GAME_STATUS\.ACTIVE/);
    });

    it('joinGameListener should check ACTIVE status', () => {
      expect(gameStoreContent).toMatch(/joinGameListener[\s\S]*?GAME_STATUS\.ACTIVE/);
    });

    it('should add tournamentSessionId for tournament games', () => {
      expect(gameStoreContent).toContain('GAME_TYPE.TOURNAMENT');
      expect(gameStoreContent).toContain('tournamentSessionId');
    });

    it('should navigate to /game after successful creation', () => {
      expect(lobbyContent).toMatch(/handleCreateGame[\s\S]*?router\.push\('\/game'\)/);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Tournament Clock Lifecycle
// ═══════════════════════════════════════════════════════════════════════
describe('Tournament clock lifecycle', () => {
  describe('level progression (pure logic)', () => {
    const template = TOURNAMENT_TEMPLATES[0];
    const levels = template.levels;
    const playLevels = levels.filter(l => !l.isBreak);
    const breakLevels = levels.filter(l => l.isBreak);

    it('should have both play and break levels', () => {
      expect(playLevels.length).toBeGreaterThan(0);
      expect(breakLevels.length).toBeGreaterThan(0);
    });

    it('blinds should increase monotonically across play levels', () => {
      for (let i = 1; i < playLevels.length; i++) {
        expect(playLevels[i].small).toBeGreaterThanOrEqual(playLevels[i - 1].small);
        expect(playLevels[i].big).toBeGreaterThanOrEqual(playLevels[i - 1].big);
      }
    });

    it('every level should have a positive duration', () => {
      for (const level of levels) {
        expect(level.duration).toBeGreaterThan(0);
      }
    });
  });

  describe('last-level behavior', () => {
    it('advanceLevel should NOT set status to ended at last level', () => {
      // Extract the advanceLevel function body (between the function declaration and the next async function)
      const advanceFnMatch = clockComposable.match(
        /async function advanceLevel\(\)([\s\S]*?)(?=async function \w)/
      );
      expect(advanceFnMatch).not.toBeNull();
      const advanceFnBody = advanceFnMatch[1];
      // The part after "nextIdx >= levels.value.length" should NOT set 'ended'
      const lastLevelBlock = advanceFnBody.match(
        /nextIdx >= levels\.value\.length[\s\S]*?return;/
      );
      expect(lastLevelBlock).not.toBeNull();
      expect(lastLevelBlock[0]).not.toContain("'ended'");
    });

    it('advanceLevel should return early at last level', () => {
      // When at last level, advanceLevel does nothing (returns early)
      expect(clockComposable).toMatch(
        /nextIdx >= levels\.value\.length[\s\S]*?return/
      );
    });

    it('repeatCurrentLevel should restart timer at last level', () => {
      expect(clockComposable).toMatch(
        /async function repeatCurrentLevel[\s\S]*?'state\.timeLeftSeconds':\s*duration/
      );
    });

    it('auto-advance should repeat when on last level', () => {
      // The tick loop should call repeatCurrentLevel for last level
      expect(clockComposable).toContain('repeatCurrentLevel');
    });

    it('endTournament must be called manually', () => {
      // endTournament is a separate function that sets status to ended
      expect(clockComposable).toMatch(
        /async function endTournament[\s\S]*?'state\.status':\s*'ended'/
      );
    });
  });

  describe('session creation defaults', () => {
    it('initial status should be waiting', () => {
      expect(clockComposable).toMatch(/status:\s*'waiting'/);
    });

    it('initial currentLevelIndex should be 0', () => {
      expect(clockComposable).toMatch(/currentLevelIndex:\s*0/);
    });

    it('initial timeLeftSeconds should use first level duration', () => {
      // firstLevel?.duration || DEFAULT_TOURNAMENT_LEVEL_DURATION) * 60
      expect(clockComposable).toContain('firstLevel?.duration');
      expect(clockComposable).toContain('DEFAULT_TOURNAMENT_LEVEL_DURATION');
    });

    it('initial players should be 0', () => {
      expect(clockComposable).toMatch(/playersRegistered:\s*0/);
      expect(clockComposable).toMatch(/playersRemaining:\s*0/);
      expect(clockComposable).toMatch(/reentries:\s*0/);
    });

    it('config should use constant defaults', () => {
      expect(clockComposable).toContain('DEFAULT_STARTING_CHIPS');
      expect(clockComposable).toContain('DEFAULT_REENTRY_LEVEL');
    });
  });

  describe('clock state machine transitions', () => {
    it('startClock should set status to running', () => {
      expect(clockComposable).toMatch(/startClock[\s\S]*?'state\.status':\s*'running'/);
    });

    it('pauseClock should set status to paused and clear lastTickAt', () => {
      expect(clockComposable).toMatch(/pauseClock[\s\S]*?'state\.status':\s*'paused'/);
      expect(clockComposable).toMatch(/pauseClock[\s\S]*?'state\.lastTickAt':\s*null/);
    });

    it('pauseClock should save current localTimeLeft', () => {
      expect(clockComposable).toMatch(/pauseClock[\s\S]*?localTimeLeft\.value/);
    });

    it('previousLevel should set status to paused', () => {
      expect(clockComposable).toMatch(/previousLevel[\s\S]*?'state\.status':\s*'paused'/);
    });

    it('previousLevel should clamp to index 0', () => {
      expect(clockComposable).toMatch(/Math\.max\(0,\s*currentLevelIndex\.value\s*-\s*1\)/);
    });

    it('advanceLevel should preserve running/paused state when advancing', () => {
      // wasRunning pattern
      expect(clockComposable).toContain("wasRunning ? 'running' : 'paused'");
    });

    it('endTournament should clear timer and lastTickAt', () => {
      expect(clockComposable).toMatch(/endTournament[\s\S]*?'state\.timeLeftSeconds':\s*0/);
      expect(clockComposable).toMatch(/endTournament[\s\S]*?'state\.lastTickAt':\s*null/);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. Lobby Layout & Tools
// ═══════════════════════════════════════════════════════════════════════
describe('Lobby layout', () => {
  describe('tools section in lobby (not ActionModal)', () => {
    it('lobby should have tools section with i18n label', () => {
      expect(lobbyContent).toContain("$t('lobby.tools')");
    });

    it('lobby should link to 盲注結構 (structures) and 開桌設定 (templates)', () => {
      expect(lobbyContent).toContain("'/structures'");
      expect(lobbyContent).toContain("'/templates'");
    });

    it('Time Bank is no longer linked from the lobby', () => {
      expect(lobbyContent).not.toContain("'/time-bank/new'");
    });

    it('lobby tools should show tournamentSetup and timeBank labels', () => {
      expect(lobbyContent).toContain("$t('action.tournamentSetup')");
      expect(lobbyContent).not.toContain("$t('action.timeBank')");
    });

    it('lobby tools sit in one row of three', () => {
      expect(lobbyContent).toContain('grid grid-cols-3 gap-2');
    });
  });

  describe('lobby: create / join first, no centre "+" in the nav', () => {
    it('create and join sit right under the stats, before rooms and events', () => {
      const main = lobbyContent.indexOf('<!-- Main actions');
      expect(main).toBeGreaterThan(lobbyContent.indexOf('<!-- Stats Card -->'));
      expect(main).toBeLessThan(lobbyContent.indexOf('<!-- My Rooms -->'));
      expect(main).toBeLessThan(lobbyContent.indexOf('<!-- My Live Events'));
    });

    it('events are always shown, with create and history in the header', () => {
      expect(lobbyContent).not.toContain('v-if="mySessions.length > 0 || endedSessionsCount > 0"');
      expect(lobbyContent).toMatch(/'\/session-setup'[\s\S]*?session\.createShort[\s\S]*?session\.historyEvents/);
      expect(lobbyContent).toContain("$t('session.noActiveEvents')");
    });

    it('join takes an online table invite link', () => {
      expect(lobbyContent).toMatch(/includes\('poker-game\/'\)[\s\S]*?parsePokerGameId/);
    });

    it('the nav has no centre action button or action modal', () => {
      expect(appContent).not.toContain('ActionModal');
      expect(appContent).not.toContain('showActionModal');
      expect(existsSync(resolve(__dirname, '..', 'src/components/common/ActionModal.vue'))).toBe(false);
    });
  });

  describe('room list badges', () => {
    it('should show tournament badge with amber color', () => {
      expect(lobbyContent).toContain("room.type === 'tournament'");
      expect(lobbyContent).toContain('bg-amber-600/50');
    });

    it('should use i18n for tournament label', () => {
      expect(lobbyContent).toContain("$t('lobby.tournamentLabel')");
    });

    it('should differentiate live, online, and tournament badges', () => {
      expect(lobbyContent).toContain("$t('lobby.liveLabel')");
      expect(lobbyContent).toContain("$t('lobby.onlineLabel')");
      expect(lobbyContent).toContain("$t('lobby.tournamentLabel')");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. App.vue Route Guards
// ═══════════════════════════════════════════════════════════════════════
describe('App.vue route guards', () => {
  describe('isPokerTableRoute (HUD visibility)', () => {
    it('should include poker-game routes', () => {
      expect(appContent).toMatch(/isPokerTableRoute[\s\S]*?poker-game/);
    });

    it('should NOT include tournament-clock in isPokerTableRoute', () => {
      // Extract the isPokerTableRoute computed function body
      const match = appContent.match(/isPokerTableRoute\s*=\s*computed\(\(\)\s*=>\s*\{([^}]*)\}/);
      expect(match).not.toBeNull();
      const body = match[1];
      expect(body).not.toContain('tournament-clock');
    });

    it('should NOT include time-bank in isPokerTableRoute', () => {
      const match = appContent.match(/isPokerTableRoute\s*=\s*computed\(\(\)\s*=>\s*\{([^}]*)\}/);
      expect(match).not.toBeNull();
      const body = match[1];
      expect(body).not.toContain('time-bank');
    });
  });

  describe('hideBottomNav', () => {
    it('should hide bottom nav on tournament-clock routes', () => {
      expect(appContent).toMatch(/hideBottomNav[\s\S]*?tournament-clock/);
    });

    it('should hide bottom nav on time-bank routes', () => {
      expect(appContent).toMatch(/hideBottomNav[\s\S]*?time-bank/);
    });

    it('should hide bottom nav on poker-game routes', () => {
      expect(appContent).toMatch(/hideBottomNav[\s\S]*?poker-game/);
    });

    it('should hide bottom nav when not authenticated', () => {
      expect(appContent).toMatch(/hideBottomNav[\s\S]*?isAuthenticated/);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Preset Management Flow
// ═══════════════════════════════════════════════════════════════════════
describe('Preset management flow', () => {
  for (const [label, content, newPath] of [
    ['BlindStructuresView', structuresViewContent, "'/structure-setup'"],
    ['TableTemplatesView', templatesViewContent, "'/template-setup'"],
  ]) {
    describe(`${label} card interactions`, () => {
      it('cards should be clickable (whole card)', () => {
        expect(content).toMatch(/@click="edit\((s|tpl)\)"/);
      });

      it('cards should NOT have play buttons', () => {
        expect(content).not.toContain('fa-play');
        expect(content).not.toContain('startFromPreset');
        expect(content).not.toContain('startFromTemplate');
      });

      it('user cards should have delete button with click.stop', () => {
        expect(content).toMatch(/@click\.stop="handleDelete\((s|tpl)\)"/);
      });

      it('cards should show chevron-right for navigation hint', () => {
        expect(content).toContain('fa-chevron-right');
      });

      it(`should have new button linking to ${newPath}`, () => {
        expect(content).toContain(newPath);
      });
    });
  }

  describe('template data integrity', () => {
    it('cloneTemplate should deep-copy levels', () => {
      const original = TOURNAMENT_TEMPLATES[0];
      const clone = cloneTemplate(original);
      clone.levels[0].small = 99999;
      expect(original.levels[0].small).not.toBe(99999);
    });

    it('cloneTemplate should deep-copy payoutRatios', () => {
      const original = TOURNAMENT_TEMPLATES[0];
      const clone = cloneTemplate(original);
      clone.payoutRatios[0].percentage = 0;
      expect(original.payoutRatios[0].percentage).not.toBe(0);
    });

    it('createBlankTournamentConfig should use constants', () => {
      const blank = createBlankTournamentConfig();
      expect(blank.startingChips).toBe(DEFAULT_STARTING_CHIPS);
      expect(blank.reentryUntilLevel).toBe(DEFAULT_REENTRY_LEVEL);
    });

    it('blank config should have at least one level with DEFAULT_TOURNAMENT_LEVEL_DURATION', () => {
      const blank = createBlankTournamentConfig();
      expect(blank.levels.length).toBeGreaterThan(0);
      expect(blank.levels[0].duration).toBe(DEFAULT_TOURNAMENT_LEVEL_DURATION);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. Tournament Clock View
// ═══════════════════════════════════════════════════════════════════════
describe('Tournament clock view', () => {
  describe('header controls', () => {
    it('should have settings gear button (host only)', () => {
      expect(clockViewContent).toContain('showControls = !showControls');
      expect(clockViewContent).toContain('fa-cog');
    });

    it('should have back button in header', () => {
      expect(clockViewContent).toContain('handleBack');
      expect(clockViewContent).toContain('fa-arrow-left');
    });

    it('no longer links to Time Bank', () => {
      expect(clockViewContent).not.toContain('showTimeBankFromClock');
      expect(clockViewContent).not.toContain('fa-hourglass-half');
    });

    it('host controls should be gated by isHost', () => {
      expect(clockViewContent).toContain('v-if="isHost"');
    });

    it('should NOT render App.vue HUD buttons (no game-hud class)', () => {
      // Clock view has its own header; App.vue HUD should not appear
      expect(clockViewContent).not.toContain('game-hud');
      expect(clockViewContent).not.toContain('hud-btn left');
    });
  });

  // The view picks a face (style 1 scoreboard / style 2 felt); the faces
  // render the figures.
  describe('display sections', () => {
    const scoreboard = read('src/components/tournament/ScoreboardClockBoard.vue');

    it('renders the host-chosen face', () => {
      expect(clockViewContent).toContain('<ScoreboardClockBoard');
      expect(clockViewContent).toContain('<FeltClockBoard');
      expect(clockViewContent).toContain("clockStyle === 'felt'");
    });

    it('passes player counts to the face', () => {
      expect(clockViewContent).toContain(':players-registered="playersRegistered"');
      expect(clockViewContent).toContain(':players-remaining="playersRemaining"');
      expect(clockViewContent).toContain(':entries="entries"');
    });

    it('style 1 shows prize pool + payouts, avg stack, break in, players / entries', () => {
      for (const key of ['prizePool', 'avgStack', 'breakIn', 'playersLeft', 'entries']) {
        expect(scoreboard).toContain(`t('clockFace.${key}')`);
      }
      expect(scoreboard).toContain('payouts.slice(0, 3)');
    });

    it('style 1 shows the next level and every clock status', () => {
      expect(scoreboard).toContain("t('clockFace.next')");
      for (const key of ['waiting', 'paused', 'running', 'ended', 'timeUp']) {
        expect(scoreboard).toContain(`t('clockFace.${key}')`);
      }
    });
  });

  describe('TournamentControls component', () => {
    it('should import TournamentControls', () => {
      expect(clockViewContent).toContain("import TournamentControls from");
    });

    it('should pass all required props', () => {
      expect(clockViewContent).toContain(':status="status"');
      expect(clockViewContent).toContain(':players-registered="playersRegistered"');
      expect(clockViewContent).toContain(':players-remaining="playersRemaining"');
      expect(clockViewContent).toContain(':current-level-index="currentLevelIndex"');
    });

    it('should emit all required events', () => {
      expect(clockViewContent).toContain('@start="startClock"');
      expect(clockViewContent).toContain('@pause="pauseClock"');
      expect(clockViewContent).toContain('@advance="advanceLevel"');
      expect(clockViewContent).toContain('@end="handleEnd"');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. Game Type Constants Correctness
// ═══════════════════════════════════════════════════════════════════════
describe('Game type and status constants usage', () => {
  it('GAME_TYPE should have LIVE, ONLINE, TOURNAMENT', () => {
    expect(GAME_TYPE.LIVE).toBe('live');
    expect(GAME_TYPE.ONLINE).toBe('online');
    expect(GAME_TYPE.TOURNAMENT).toBe('tournament');
  });

  it('GAME_STATUS should have ACTIVE and WAITING', () => {
    expect(GAME_STATUS.ACTIVE).toBe('active');
    expect(GAME_STATUS.WAITING).toBe('waiting');
  });

  it('tournament type string should match room list badge check', () => {
    // LobbyView checks room.type === 'tournament'
    expect(lobbyContent).toContain(`room.type === '${GAME_TYPE.TOURNAMENT}'`);
  });

  it('ACTIVE string should match loadMyRooms query filter', () => {
    // gameStore queries using GAME_STATUS.ACTIVE constant
    expect(gameStoreContent).toContain('GAME_STATUS.ACTIVE');
    expect(gameStoreContent).toMatch(/loadMyRooms[\s\S]*?GAME_STATUS\.ACTIVE/);
  });
});

describe('Lobby career profit can be hidden', () => {
  it('has an eye toggle that masks the amount and remembers the choice', () => {
    expect(lobbyContent).toContain('@click="toggleHideProfit"');
    expect(lobbyContent).toContain("hideProfit ? '••••••' : formatNumber(stats.totalProfit)");
    expect(lobbyContent).toContain('localStorage.setItem(STORAGE_KEYS.HIDE_CAREER_PROFIT');
    expect(lobbyContent).toContain('localStorage.getItem(STORAGE_KEYS.HIDE_CAREER_PROFIT)');
  });
});
