/**
 * i18n Completeness Tests
 * Ensures all 4 locale files have matching tournament & timeBank keys,
 * and no keys are missing across locales.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const LOCALES = ['zh-TW', 'en', 'zh-CN', 'ja'];

function loadLocale(locale) {
  const filePath = resolve(__dirname, `../src/i18n/locales/${locale}.json`);
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

/**
 * Recursively collect all key paths from an object.
 * e.g. { a: { b: 1 } } → ['a.b']
 */
function collectKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      keys.push(...collectKeys(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

describe('i18n locale completeness', () => {
  const allLocales = {};
  const allKeys = {};

  // Load all locale files
  for (const locale of LOCALES) {
    allLocales[locale] = loadLocale(locale);
    allKeys[locale] = collectKeys(allLocales[locale]);
  }

  // Use zh-TW as the reference (primary locale)
  const referenceKeys = allKeys['zh-TW'];

  describe('reference locale zh-TW', () => {
    it('should have tournament section', () => {
      expect(allLocales['zh-TW']).toHaveProperty('tournament');
    });

    it('should have timeBank section', () => {
      expect(allLocales['zh-TW']).toHaveProperty('timeBank');
    });

    it('should have action.tournament key', () => {
      expect(allLocales['zh-TW'].action).toHaveProperty('tournament');
    });

    it('should have action.tournamentSetup key', () => {
      expect(allLocales['zh-TW'].action).toHaveProperty('tournamentSetup');
    });

    it('should have action.timeBank key', () => {
      expect(allLocales['zh-TW'].action).toHaveProperty('timeBank');
    });

    it('should have common.change key', () => {
      expect(allLocales['zh-TW'].common).toHaveProperty('change');
    });

    it('should have lobby.chooseGameType key', () => {
      expect(allLocales['zh-TW'].lobby).toHaveProperty('chooseGameType');
    });

    it('should have report.filterTournament key', () => {
      expect(allLocales['zh-TW'].report).toHaveProperty('filterTournament');
    });

    it('should have tournament.ante key', () => {
      expect(allLocales['zh-TW'].tournament).toHaveProperty('ante');
    });
  });

  for (const locale of LOCALES.filter((l) => l !== 'zh-TW')) {
    describe(`locale: ${locale}`, () => {
      it('should have all keys from zh-TW reference', () => {
        const missing = referenceKeys.filter((key) => !allKeys[locale].includes(key));
        if (missing.length > 0) {
          expect.fail(`Missing keys in ${locale}: ${missing.join(', ')}`);
        }
      });

      it('should have tournament section', () => {
        expect(allLocales[locale]).toHaveProperty('tournament');
      });

      it('should have timeBank section', () => {
        expect(allLocales[locale]).toHaveProperty('timeBank');
      });

      it('should have action.tournament key', () => {
        expect(allLocales[locale].action).toHaveProperty('tournament');
      });

      it('should have action.tournamentSetup key', () => {
        expect(allLocales[locale].action).toHaveProperty('tournamentSetup');
      });

      it('should have action.timeBank key', () => {
        expect(allLocales[locale].action).toHaveProperty('timeBank');
      });

      it('should have common.change key', () => {
        expect(allLocales[locale].common).toHaveProperty('change');
      });

      it('should have lobby.chooseGameType key', () => {
        expect(allLocales[locale].lobby).toHaveProperty('chooseGameType');
      });

      it('should have report.filterTournament key', () => {
        expect(allLocales[locale].report).toHaveProperty('filterTournament');
      });

      it('should have tournament.ante key', () => {
        expect(allLocales[locale].tournament).toHaveProperty('ante');
      });
    });
  }

  describe('no missing keys across all locales', () => {
    // Collect the union of all keys
    const allKeySet = new Set();
    for (const locale of LOCALES) {
      for (const key of allKeys[locale]) {
        allKeySet.add(key);
      }
    }

    for (const locale of LOCALES) {
      it(`${locale} should have all keys from the full union`, () => {
        const missing = [...allKeySet].filter((key) => !allKeys[locale].includes(key));
        if (missing.length > 0) {
          expect.fail(`Missing in ${locale}: ${missing.join(', ')}`);
        }
      });
    }
  });

  describe('tournament key structure', () => {
    const requiredTournamentKeys = [
      'presets', 'builtInTemplates', 'myPresets', 'newPreset', 'noPresets',
      'createPreset', 'editPreset',
      'templateTurbo', 'templateFast', 'templateStandard', 'templateDeep',
      'startNow', 'customizeAndSave', 'confirmDelete',
      'basicInfo', 'tournamentName', 'namePlaceholder', 'subtitle', 'subtitlePlaceholder',
      'buyInAmount', 'startingChips', 'reentryLevel', 'reentryUntil',
      'blindStructure', 'addLevel', 'addBreak', 'smallBlind', 'bigBlind', 'ante', 'duration',
      'payoutStructure', 'addPlace', 'total',
      'nameRequired', 'payoutMustBe100',
      'importExport', 'import', 'importSuccess', 'invalidFormat',
      'sessionNotFound', 'controls', 'clockControl',
      'start', 'pause', 'prevLevel', 'nextLevel',
      'playerManagement', 'registered', 'remaining', 'addReentry',
      'endTournament', 'confirmEnd',
      'players', 'reentries', 'chipsInPlay', 'averageStack',
      'breakIn', 'breakTime', 'level',
      'prizePool', 'payouts', 'nextBlinds',
      'waitingToStart', 'paused', 'ended', 'viewClock',
    ];

    for (const locale of LOCALES) {
      it(`${locale} should have all required tournament keys`, () => {
        const missing = requiredTournamentKeys.filter(
          (key) => !allLocales[locale].tournament?.hasOwnProperty(key)
        );
        if (missing.length > 0) {
          expect.fail(`${locale} missing tournament keys: ${missing.join(', ')}`);
        }
      });
    }
  });

  describe('timeBank key structure', () => {
    const requiredTimeBankKeys = [
      'title', 'label', 'labelPlaceholder', 'totalSeconds',
      'create', 'start', 'pause', 'reset', 'settings',
      'ready', 'paused', 'expired',
    ];

    for (const locale of LOCALES) {
      it(`${locale} should have all required timeBank keys`, () => {
        const missing = requiredTimeBankKeys.filter(
          (key) => !allLocales[locale].timeBank?.hasOwnProperty(key)
        );
        if (missing.length > 0) {
          expect.fail(`${locale} missing timeBank keys: ${missing.join(', ')}`);
        }
      });
    }
  });

  describe('no empty translation values', () => {
    for (const locale of LOCALES) {
      it(`${locale} tournament values should not be empty`, () => {
        const tournament = allLocales[locale].tournament || {};
        for (const [key, val] of Object.entries(tournament)) {
          expect(val, `${locale}.tournament.${key} is empty`).not.toBe('');
        }
      });

      it(`${locale} timeBank values should not be empty`, () => {
        const timeBank = allLocales[locale].timeBank || {};
        for (const [key, val] of Object.entries(timeBank)) {
          expect(val, `${locale}.timeBank.${key} is empty`).not.toBe('');
        }
      });
    }
  });
});
