/**
 * Route & Integration Tests
 * Verifies that all tournament/time-bank routes are properly
 * defined and that key modules export expected interfaces.
 */
import { describe, it, expect } from 'vitest';

// We can't import the full main.js (Firebase side effects), so we test
// the route definitions and module interfaces separately.

describe('Route definitions', () => {
  // Read main.js as text and validate route paths exist
  const { readFileSync } = require('fs');
  const { resolve } = require('path');
  const mainContent = readFileSync(resolve(__dirname, '../src/main.js'), 'utf-8');

  const expectedRoutes = [
    { path: '/tournament-presets', name: 'TournamentPresets' },
    { path: '/tournament-setup', name: 'TournamentSetup' },
    { path: '/tournament-setup/:presetId', name: 'TournamentSetupEdit' },
    { path: '/tournament-clock/:sessionId', name: 'TournamentClock' },
    { path: '/time-bank/:sessionId', name: 'TimeBank' },
  ];

  for (const route of expectedRoutes) {
    it(`should define route "${route.path}" with name "${route.name}"`, () => {
      expect(mainContent).toContain(route.path);
      expect(mainContent).toContain(route.name);
    });

    it(`route "${route.name}" should require auth`, () => {
      // Match the route definition line and check for requiresAuth: true
      const routeRegex = new RegExp(
        `path:\\s*'${route.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[^}]*requiresAuth:\\s*true`
      );
      expect(mainContent).toMatch(routeRegex);
    });
  }
});

describe('Module interfaces', () => {
  describe('tournamentTemplates exports', () => {
    it('should export TOURNAMENT_TEMPLATES array', async () => {
      const mod = await import('../src/utils/tournamentTemplates.js');
      expect(Array.isArray(mod.TOURNAMENT_TEMPLATES)).toBe(true);
    });

    it('should export createBlankTournamentConfig function', async () => {
      const mod = await import('../src/utils/tournamentTemplates.js');
      expect(typeof mod.createBlankTournamentConfig).toBe('function');
    });

    it('should export cloneTemplate function', async () => {
      const mod = await import('../src/utils/tournamentTemplates.js');
      expect(typeof mod.cloneTemplate).toBe('function');
    });
  });

  describe('constants exports', () => {
    it('should export all tournament/timebank constants', async () => {
      const mod = await import('../src/utils/constants.js');
      expect(mod.DEFAULT_TOURNAMENT_LEVEL_DURATION).toBeDefined();
      expect(mod.DEFAULT_STARTING_CHIPS).toBeDefined();
      expect(mod.DEFAULT_REENTRY_LEVEL).toBeDefined();
      expect(mod.DEFAULT_TIME_BANK_SECONDS).toBeDefined();
      expect(mod.TIME_BANK_PRESETS).toBeDefined();
      expect(mod.TIMER_WARNING_THRESHOLD).toBeDefined();
      expect(mod.TIMER_DANGER_THRESHOLD).toBeDefined();
      expect(mod.TIMER_CRITICAL_THRESHOLD).toBeDefined();
      expect(mod.GAME_TYPE.TOURNAMENT).toBeDefined();
    });
  });
});

describe('View files exist and have correct structure', () => {
  const { existsSync, readFileSync } = require('fs');
  const { resolve } = require('path');

  const viewFiles = [
    { file: 'src/views/TournamentClockView.vue', composable: 'useTournamentClock' },
    { file: 'src/views/TournamentSetupView.vue', composable: 'useTournamentClock' },
    { file: 'src/views/TournamentPresetsView.vue', composable: 'useTournamentClock' },
    { file: 'src/views/TimeBankView.vue', composable: 'useTimeBank' },
  ];

  for (const { file, composable } of viewFiles) {
    describe(file, () => {
      const fullPath = resolve(__dirname, '..', file);

      it('should exist', () => {
        expect(existsSync(fullPath)).toBe(true);
      });

      it(`should import ${composable}`, () => {
        const content = readFileSync(fullPath, 'utf-8');
        expect(content).toContain(composable);
      });

      it('should use i18n ($t or useI18n)', () => {
        const content = readFileSync(fullPath, 'utf-8');
        expect(content).toMatch(/\$t\(|useI18n/);
      });

      it('should not contain hardcoded "Ante" text (should use i18n)', () => {
        const content = readFileSync(fullPath, 'utf-8');
        // Check for hardcoded "Ante" in template text (not as key name or value)
        // Match patterns like ">Ante " or " Ante " in template but exclude i18n keys and JS
        const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/);
        if (templateMatch) {
          const template = templateMatch[1];
          // Should not have bare "Ante" outside of $t() calls
          const hardcodedAnte = template.match(/(?<!\$t\([^)]*)[> ]Ante[ <]/g);
          expect(hardcodedAnte, 'Found hardcoded "Ante" in template').toBeNull();
        }
      });
    });
  }
});

describe('Composable files exist', () => {
  const { existsSync } = require('fs');
  const { resolve } = require('path');

  const composables = [
    'src/composables/useTournamentClock.js',
    'src/composables/useTimeBank.js',
  ];

  for (const file of composables) {
    it(`${file} should exist`, () => {
      expect(existsSync(resolve(__dirname, '..', file))).toBe(true);
    });
  }
});

describe('Component files exist', () => {
  const { existsSync } = require('fs');
  const { resolve } = require('path');

  it('TournamentControls.vue should exist', () => {
    expect(existsSync(resolve(__dirname, '../src/components/tournament/TournamentControls.vue'))).toBe(true);
  });
});

describe('Firestore rules include tournament/timebank collections', () => {
  const { readFileSync } = require('fs');
  const { resolve } = require('path');
  const rules = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf-8');

  it('should have tournamentSessions rules', () => {
    expect(rules).toContain('tournamentSessions');
  });

  it('should have timeBankSessions rules', () => {
    expect(rules).toContain('timeBankSessions');
  });

  it('should have tournamentPresets rules', () => {
    expect(rules).toContain('tournamentPresets');
  });

  it('should restrict tournamentSessions write to host', () => {
    expect(rules).toMatch(/tournamentSessions[\s\S]*?hostUid/);
  });

  it('should restrict timeBankSessions write to host', () => {
    expect(rules).toMatch(/timeBankSessions[\s\S]*?hostUid/);
  });
});

describe('App.vue immersive mode', () => {
  const { readFileSync } = require('fs');
  const { resolve } = require('path');
  const content = readFileSync(resolve(__dirname, '../src/App.vue'), 'utf-8');

  it('should hide bottom nav for tournament-clock routes', () => {
    expect(content).toContain("'/tournament-clock'");
  });

  it('should hide bottom nav for time-bank routes', () => {
    expect(content).toContain("'/time-bank'");
  });

  it('should include tournament routes in isPokerTableRoute', () => {
    // Check that the computed references tournament-clock
    expect(content).toMatch(/isPokerTableRoute[\s\S]*?tournament-clock/);
  });
});

describe('ActionModal integration', () => {
  const { readFileSync } = require('fs');
  const { resolve } = require('path');
  const content = readFileSync(resolve(__dirname, '../src/components/common/ActionModal.vue'), 'utf-8');

  it('should not have tournament/timebank actions (moved to lobby)', () => {
    expect(content).not.toContain('tournament-presets');
    expect(content).not.toContain('time-bank');
  });

  it('should have live track and online actions', () => {
    expect(content).toContain("$t('action.liveTrack')");
    expect(content).toContain("$t('action.createOnline')");
    expect(content).toContain("$t('action.joinOnline')");
  });
});

describe('No hardcoded magic numbers in composables', () => {
  const { readFileSync } = require('fs');
  const { resolve } = require('path');

  it('useTournamentClock should use DEFAULT_STARTING_CHIPS', () => {
    const content = readFileSync(resolve(__dirname, '../src/composables/useTournamentClock.js'), 'utf-8');
    expect(content).toContain('DEFAULT_STARTING_CHIPS');
    // Should NOT contain hardcoded 25000
    expect(content).not.toMatch(/\b25000\b/);
  });

  it('useTournamentClock should use DEFAULT_REENTRY_LEVEL', () => {
    const content = readFileSync(resolve(__dirname, '../src/composables/useTournamentClock.js'), 'utf-8');
    expect(content).toContain('DEFAULT_REENTRY_LEVEL');
  });

  it('useTournamentClock should use DEFAULT_TOURNAMENT_LEVEL_DURATION', () => {
    const content = readFileSync(resolve(__dirname, '../src/composables/useTournamentClock.js'), 'utf-8');
    expect(content).toContain('DEFAULT_TOURNAMENT_LEVEL_DURATION');
  });

  it('useTimeBank should use DEFAULT_TIME_BANK_SECONDS', () => {
    const content = readFileSync(resolve(__dirname, '../src/composables/useTimeBank.js'), 'utf-8');
    expect(content).toContain('DEFAULT_TIME_BANK_SECONDS');
    // Should NOT contain hardcoded 30 as a fallback default (except in 250ms interval)
    const lines = content.split('\n');
    for (const line of lines) {
      // Skip lines that are comments or the tick interval (250)
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
      if (line.includes('250')) continue; // tick interval is fine
      // Check for standalone "|| 30" pattern which indicates hardcoded fallback
      if (line.match(/\|\|\s*30[^0-9]/)) {
        expect.fail(`Found hardcoded "|| 30" in useTimeBank.js: ${line.trim()}`);
      }
    }
  });

  it('TimeBankView should use constants', () => {
    const content = readFileSync(resolve(__dirname, '../src/views/TimeBankView.vue'), 'utf-8');
    expect(content).toContain('DEFAULT_TIME_BANK_SECONDS');
    expect(content).toContain('DEFAULT_TIME_BANK_INTERVAL');
    expect(content).toContain('DEFAULT_TIME_BANK_BUTTON_COUNT');
  });

  it('TournamentClockView should use timer threshold constants', () => {
    const content = readFileSync(resolve(__dirname, '../src/views/TournamentClockView.vue'), 'utf-8');
    expect(content).toContain('TIMER_CRITICAL_THRESHOLD');
    expect(content).toContain('TIMER_DANGER_THRESHOLD');
    expect(content).toContain('TIMER_WARNING_THRESHOLD');
  });
});

describe('GameView tournament integration', () => {
  const { readFileSync } = require('fs');
  const { resolve } = require('path');
  const content = readFileSync(resolve(__dirname, '../src/views/GameView.vue'), 'utf-8');

  it('should display tournament badge', () => {
    expect(content).toContain('tournament');
  });

  it('should use i18n for view clock button', () => {
    expect(content).toContain("$t('tournament.viewClock')");
  });
});

describe('Report filtering', () => {
  const { readFileSync } = require('fs');
  const { resolve } = require('path');

  it('DailyReportView should have tournament filter', () => {
    const content = readFileSync(resolve(__dirname, '../src/views/DailyReportView.vue'), 'utf-8');
    expect(content).toContain('filterTournament');
    expect(content).toContain('tournament');
  });

  it('ReportView should have tournament filter', () => {
    const content = readFileSync(resolve(__dirname, '../src/views/ReportView.vue'), 'utf-8');
    expect(content).toContain('filterTournament');
  });
});
