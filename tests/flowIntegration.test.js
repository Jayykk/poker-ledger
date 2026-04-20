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
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  GAME_TYPE, GAME_STATUS, DEFAULT_BUY_IN, DEFAULT_TOURNAMENT_LEVEL_DURATION,
  DEFAULT_STARTING_CHIPS, DEFAULT_REENTRY_LEVEL,
} from '../src/utils/constants.js';
import { TOURNAMENT_TEMPLATES, cloneTemplate, createBlankTournamentConfig } from '../src/utils/tournamentTemplates.js';

// ─── Helpers: read source files ────────────────────────────────────────
const read = (relPath) => readFileSync(resolve(__dirname, '..', relPath), 'utf-8');

const lobbyContent = read('src/views/LobbyView.vue');
const actionModalContent = read('src/components/common/ActionModal.vue');
const appContent = read('src/App.vue');
const clockViewContent = read('src/views/TournamentClockView.vue');
const presetsViewContent = read('src/views/TournamentPresetsView.vue');
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
      const createSessionIdx = lobbyContent.indexOf('createTournamentSession({');
      const createGameIdx = lobbyContent.indexOf('createGame(');
      expect(createSessionIdx).toBeLessThan(createGameIdx);
    });

    it('should pass tournamentSessionId to createGame options', () => {
      expect(lobbyContent).toContain('options.tournamentSessionId = sessionId');
    });

    it('should merge built-in templates and user presets in allTemplateOptions', () => {
      expect(lobbyContent).toContain('allTemplateOptions');
      expect(lobbyContent).toContain('TOURNAMENT_TEMPLATES');
      expect(lobbyContent).toContain('userPresets');
    });

    it('should show template summary with change button in final step', () => {
      expect(lobbyContent).toContain("$t('common.change')");
      expect(lobbyContent).toContain('selectedTemplate.isBuiltIn');
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

    it('advanceLevel should keep status running at last level', () => {
      // When at last level, status stays running with time at 0
      expect(clockComposable).toMatch(
        /nextIdx >= levels\.value\.length[\s\S]*?'state\.status':\s*'running'/
      );
    });

    it('advanceLevel should set timeLeft to 0 at last level', () => {
      expect(clockComposable).toMatch(
        /nextIdx >= levels\.value\.length[\s\S]*?'state\.timeLeftSeconds':\s*0/
      );
    });

    it('auto-advance should skip when on last level', () => {
      // The tick loop should check nextIdx < levels.value.length
      expect(clockComposable).toContain('nextIdx < levels.value.length');
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

    it('lobby should have tournament-presets link', () => {
      expect(lobbyContent).toContain("'/tournament-presets'");
    });

    it('lobby should have time-bank link', () => {
      expect(lobbyContent).toContain("'/time-bank/new'");
    });

    it('lobby tools should show tournamentSetup and timeBank labels', () => {
      expect(lobbyContent).toContain("$t('action.tournamentSetup')");
      expect(lobbyContent).toContain("$t('action.timeBank')");
    });

    it('lobby should use 2-column grid for tools', () => {
      expect(lobbyContent).toContain('grid-cols-2');
    });
  });

  describe('ActionModal should only contain game actions', () => {
    it('should NOT contain tournament-presets route', () => {
      expect(actionModalContent).not.toContain('tournament-presets');
    });

    it('should NOT contain time-bank route', () => {
      expect(actionModalContent).not.toContain('time-bank');
    });

    it('should NOT contain tournamentSetup handler', () => {
      expect(actionModalContent).not.toContain('handleTournamentSetup');
    });

    it('should NOT contain timeBank handler', () => {
      expect(actionModalContent).not.toContain('handleTimeBank');
    });

    it('should contain exactly 3 game actions', () => {
      expect(actionModalContent).toContain('handleLiveTrack');
      expect(actionModalContent).toContain('handleCreateOnline');
      expect(actionModalContent).toContain('handleJoinOnline');
    });

    it('should emit create-live, create-online, join-online events', () => {
      expect(actionModalContent).toContain("emit('create-live')");
      expect(actionModalContent).toContain("emit('create-online')");
      expect(actionModalContent).toContain("emit('join-online')");
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
  describe('TournamentPresetsView card interactions', () => {
    it('built-in template cards should be clickable (whole card)', () => {
      // Cards have @click handlers directly on the card div
      expect(presetsViewContent).toMatch(/@click="editFromTemplate\(tmpl\)"/);
    });

    it('built-in cards should NOT have play buttons', () => {
      // No fa-play icon in the built-in section
      const builtInSection = presetsViewContent.match(
        /builtInTemplates[\s\S]*?<\/section>/
      );
      expect(builtInSection).not.toBeNull();
      expect(builtInSection[0]).not.toContain('fa-play');
    });

    it('user preset cards should be clickable (whole card)', () => {
      expect(presetsViewContent).toMatch(/@click="editPreset\(preset\)"/);
    });

    it('user preset cards should have delete button with click.stop', () => {
      expect(presetsViewContent).toContain('@click.stop="handleDelete(preset)"');
    });

    it('user preset cards should NOT have play button', () => {
      // No startFromPreset function should exist
      expect(presetsViewContent).not.toContain('startFromPreset');
      expect(presetsViewContent).not.toContain('startFromTemplate');
    });

    it('cards should show chevron-right for navigation hint', () => {
      expect(presetsViewContent).toContain('fa-chevron-right');
    });

    it('should have new preset button linking to /tournament-setup', () => {
      expect(presetsViewContent).toContain("'/tournament-setup'");
    });
  });

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

    it('should have time-bank shortcut button for host', () => {
      expect(clockViewContent).toContain('showTimeBankFromClock');
      expect(clockViewContent).toContain('fa-hourglass-half');
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

  describe('display sections', () => {
    it('should display player stats (registered, remaining, reentries)', () => {
      expect(clockViewContent).toContain("$t('tournament.players')");
      expect(clockViewContent).toContain("$t('tournament.reentries')");
      expect(clockViewContent).toContain('playersRemaining');
      expect(clockViewContent).toContain('playersRegistered');
    });

    it('should display chips in play and average stack', () => {
      expect(clockViewContent).toContain("$t('tournament.chipsInPlay')");
      expect(clockViewContent).toContain("$t('tournament.averageStack')");
    });

    it('should display prize pool and payouts', () => {
      expect(clockViewContent).toContain("$t('tournament.prizePool')");
      expect(clockViewContent).toContain("$t('tournament.payouts')");
    });

    it('should show next blinds info', () => {
      expect(clockViewContent).toContain("$t('tournament.nextBlinds')");
    });

    it('should display status badges (waiting, paused, ended)', () => {
      expect(clockViewContent).toContain("$t('tournament.waitingToStart')");
      expect(clockViewContent).toContain("$t('tournament.paused')");
      expect(clockViewContent).toContain("$t('tournament.ended')");
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
