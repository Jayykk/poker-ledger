/**
 * Tournament Templates Test Suite
 * Validates template structures, payout ratios, level ordering,
 * and helper functions.
 */
import { describe, it, expect } from 'vitest';
import {
  TOURNAMENT_TEMPLATES,
  createBlankTournamentConfig,
  cloneTemplate,
} from '../src/utils/tournamentTemplates.js';
import {
  DEFAULT_STARTING_CHIPS,
  DEFAULT_REENTRY_LEVEL,
  DEFAULT_TOURNAMENT_LEVEL_DURATION,
} from '../src/utils/constants.js';

describe('TOURNAMENT_TEMPLATES', () => {
  it('should have at least one template', () => {
    expect(TOURNAMENT_TEMPLATES.length).toBeGreaterThanOrEqual(1);
  });

  it('each template should have required fields', () => {
    const requiredFields = ['id', 'nameKey', 'buyIn', 'startingChips', 'reentryUntilLevel', 'levels', 'payoutRatios'];
    for (const tmpl of TOURNAMENT_TEMPLATES) {
      for (const field of requiredFields) {
        expect(tmpl, `Template "${tmpl.id}" missing field "${field}"`).toHaveProperty(field);
      }
    }
  });

  it('each template should have a unique id', () => {
    const ids = TOURNAMENT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each template should have nameKey starting with "tournament."', () => {
    for (const tmpl of TOURNAMENT_TEMPLATES) {
      expect(tmpl.nameKey, `Template "${tmpl.id}" nameKey`).toMatch(/^tournament\./);
    }
  });

  describe('level structure', () => {
    for (const tmpl of TOURNAMENT_TEMPLATES) {
      describe(`template: ${tmpl.id}`, () => {
        it('should have at least one level', () => {
          expect(tmpl.levels.length).toBeGreaterThanOrEqual(1);
        });

        it('each level should have required fields', () => {
          const levelFields = ['level', 'small', 'big', 'duration', 'isBreak'];
          for (let i = 0; i < tmpl.levels.length; i++) {
            const lvl = tmpl.levels[i];
            for (const field of levelFields) {
              expect(lvl, `Level ${i} missing "${field}"`).toHaveProperty(field);
            }
          }
        });

        it('non-break levels should have sequential level numbers', () => {
          const playLevels = tmpl.levels.filter((l) => !l.isBreak);
          for (let i = 0; i < playLevels.length; i++) {
            expect(playLevels[i].level, `Play level ${i} should be ${i + 1}`).toBe(i + 1);
          }
        });

        it('break levels should have level = 0', () => {
          const breaks = tmpl.levels.filter((l) => l.isBreak);
          for (const brk of breaks) {
            expect(brk.level).toBe(0);
          }
        });

        it('non-break levels should have small < big', () => {
          const playLevels = tmpl.levels.filter((l) => !l.isBreak);
          for (const lvl of playLevels) {
            expect(lvl.small, `Level ${lvl.level}: small (${lvl.small}) should be < big (${lvl.big})`).toBeLessThan(lvl.big);
          }
        });

        it('non-break levels should have positive duration', () => {
          for (const lvl of tmpl.levels) {
            expect(lvl.duration, `Level ${lvl.level}: duration`).toBeGreaterThan(0);
          }
        });

        it('blind amounts should be non-negative', () => {
          for (const lvl of tmpl.levels) {
            expect(lvl.small).toBeGreaterThanOrEqual(0);
            expect(lvl.big).toBeGreaterThanOrEqual(0);
            if (lvl.ante !== undefined) {
              expect(lvl.ante).toBeGreaterThanOrEqual(0);
            }
          }
        });

        it('blinds should increase monotonically for play levels', () => {
          const playLevels = tmpl.levels.filter((l) => !l.isBreak);
          for (let i = 1; i < playLevels.length; i++) {
            expect(
              playLevels[i].big,
              `Level ${playLevels[i].level} BB should be >= Level ${playLevels[i - 1].level} BB`
            ).toBeGreaterThanOrEqual(playLevels[i - 1].big);
          }
        });
      });
    }
  });

  describe('payout structure', () => {
    for (const tmpl of TOURNAMENT_TEMPLATES) {
      describe(`template: ${tmpl.id}`, () => {
        it('should have at least one payout place', () => {
          expect(tmpl.payoutRatios.length).toBeGreaterThanOrEqual(1);
        });

        it('payout percentages should sum to 100', () => {
          const total = tmpl.payoutRatios.reduce((sum, p) => sum + p.percentage, 0);
          expect(total, `Payouts sum to ${total}% instead of 100%`).toBe(100);
        });

        it('places should be sequential 1, 2, 3...', () => {
          for (let i = 0; i < tmpl.payoutRatios.length; i++) {
            expect(tmpl.payoutRatios[i].place).toBe(i + 1);
          }
        });

        it('percentages should be positive', () => {
          for (const p of tmpl.payoutRatios) {
            expect(p.percentage).toBeGreaterThan(0);
          }
        });

        it('1st place should get the most', () => {
          const sorted = [...tmpl.payoutRatios].sort((a, b) => b.percentage - a.percentage);
          expect(sorted[0].place).toBe(1);
        });
      });
    }
  });

  describe('buyIn & chips', () => {
    for (const tmpl of TOURNAMENT_TEMPLATES) {
      it(`${tmpl.id}: buyIn should be positive`, () => {
        expect(tmpl.buyIn).toBeGreaterThan(0);
      });
      it(`${tmpl.id}: startingChips should be positive`, () => {
        expect(tmpl.startingChips).toBeGreaterThan(0);
      });
      it(`${tmpl.id}: reentryUntilLevel should be within level range`, () => {
        const maxLevel = Math.max(...tmpl.levels.filter((l) => !l.isBreak).map((l) => l.level));
        expect(tmpl.reentryUntilLevel).toBeGreaterThan(0);
        expect(tmpl.reentryUntilLevel).toBeLessThanOrEqual(maxLevel);
      });
    }
  });
});

describe('createBlankTournamentConfig()', () => {
  it('should return a valid config object', () => {
    const config = createBlankTournamentConfig();
    expect(config).toHaveProperty('name');
    expect(config).toHaveProperty('subtitle');
    expect(config).toHaveProperty('buyIn');
    expect(config).toHaveProperty('startingChips');
    expect(config).toHaveProperty('reentryUntilLevel');
    expect(config).toHaveProperty('levels');
    expect(config).toHaveProperty('payoutRatios');
  });

  it('should use constants for defaults', () => {
    const config = createBlankTournamentConfig();
    expect(config.startingChips).toBe(DEFAULT_STARTING_CHIPS);
    expect(config.reentryUntilLevel).toBe(DEFAULT_REENTRY_LEVEL);
  });

  it('levels should use DEFAULT_TOURNAMENT_LEVEL_DURATION', () => {
    const config = createBlankTournamentConfig();
    for (const lvl of config.levels) {
      expect(lvl.duration).toBe(DEFAULT_TOURNAMENT_LEVEL_DURATION);
    }
  });

  it('name should be empty string', () => {
    const config = createBlankTournamentConfig();
    expect(config.name).toBe('');
  });

  it('should have levels with sequential numbering', () => {
    const config = createBlankTournamentConfig();
    const playLevels = config.levels.filter((l) => !l.isBreak);
    for (let i = 0; i < playLevels.length; i++) {
      expect(playLevels[i].level).toBe(i + 1);
    }
  });

  it('payout ratios should sum to 100', () => {
    const config = createBlankTournamentConfig();
    const total = config.payoutRatios.reduce((sum, p) => sum + p.percentage, 0);
    expect(total).toBe(100);
  });

  it('should return a new object each time (no shared references)', () => {
    const a = createBlankTournamentConfig();
    const b = createBlankTournamentConfig();
    expect(a).not.toBe(b);
    expect(a.levels).not.toBe(b.levels);
    a.name = 'modified';
    expect(b.name).toBe('');
  });
});

describe('cloneTemplate()', () => {
  it('should deep-clone a template', () => {
    const original = TOURNAMENT_TEMPLATES[0];
    const cloned = cloneTemplate(original);
    expect(cloned.buyIn).toBe(original.buyIn);
    expect(cloned.startingChips).toBe(original.startingChips);
    expect(cloned.levels.length).toBe(original.levels.length);
    // Ensure it's a deep copy
    expect(cloned.levels).not.toBe(original.levels);
    expect(cloned.payoutRatios).not.toBe(original.payoutRatios);
  });

  it('modifying clone should not affect original', () => {
    const original = TOURNAMENT_TEMPLATES[0];
    const cloned = cloneTemplate(original);
    cloned.name = 'MODIFIED';
    cloned.levels[0].small = 99999;
    expect(original.levels[0].small).not.toBe(99999);
  });

  it('should preserve all level data', () => {
    for (const tmpl of TOURNAMENT_TEMPLATES) {
      const cloned = cloneTemplate(tmpl);
      for (let i = 0; i < tmpl.levels.length; i++) {
        expect(cloned.levels[i].level).toBe(tmpl.levels[i].level);
        expect(cloned.levels[i].small).toBe(tmpl.levels[i].small);
        expect(cloned.levels[i].big).toBe(tmpl.levels[i].big);
        expect(cloned.levels[i].duration).toBe(tmpl.levels[i].duration);
        expect(cloned.levels[i].isBreak).toBe(tmpl.levels[i].isBreak);
      }
    }
  });

  it('should preserve payout ratios', () => {
    for (const tmpl of TOURNAMENT_TEMPLATES) {
      const cloned = cloneTemplate(tmpl);
      const totalOriginal = tmpl.payoutRatios.reduce((s, p) => s + p.percentage, 0);
      const totalCloned = cloned.payoutRatios.reduce((s, p) => s + p.percentage, 0);
      expect(totalCloned).toBe(totalOriginal);
    }
  });
});
