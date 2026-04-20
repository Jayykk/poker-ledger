/**
 * Built-in tournament structure templates.
 * Users can pick one as a starting point and customise.
 */

import {
  DEFAULT_STARTING_CHIPS, DEFAULT_REENTRY_LEVEL, DEFAULT_MAX_REENTRIES,
  DEFAULT_TOURNAMENT_LEVEL_DURATION,
} from './constants.js';

export const TOURNAMENT_TEMPLATES = [
  {
    id: 'turbo',
    nameKey: 'tournament.templateTurbo',
    name: 'Turbo',
    buyIn: 100,
    startingChips: 10000,
    reentryUntilLevel: 4,
    maxReentries: 1,
    levels: [
      { level: 1, small: 25, big: 50, ante: 0, duration: 5, isBreak: false },
      { level: 2, small: 50, big: 100, ante: 0, duration: 5, isBreak: false },
      { level: 3, small: 75, big: 150, ante: 25, duration: 5, isBreak: false },
      { level: 4, small: 100, big: 200, ante: 25, duration: 5, isBreak: false },
      { level: 0, small: 0, big: 0, ante: 0, duration: 5, isBreak: true },
      { level: 5, small: 150, big: 300, ante: 50, duration: 5, isBreak: false },
      { level: 6, small: 200, big: 400, ante: 50, duration: 5, isBreak: false },
      { level: 7, small: 300, big: 600, ante: 75, duration: 5, isBreak: false },
      { level: 8, small: 400, big: 800, ante: 100, duration: 5, isBreak: false },
      { level: 9, small: 500, big: 1000, ante: 100, duration: 5, isBreak: false },
      { level: 10, small: 750, big: 1500, ante: 200, duration: 5, isBreak: false },
    ],
    payoutRatios: [
      { place: 1, percentage: 50 },
      { place: 2, percentage: 30 },
      { place: 3, percentage: 20 },
    ],
  },
  {
    id: 'fast',
    nameKey: 'tournament.templateFast',
    name: '快速錦標賽',
    buyIn: 200,
    startingChips: 15000,
    reentryUntilLevel: 6,
    maxReentries: 2,
    levels: [
      { level: 1, small: 10, big: 20, ante: 0, duration: 10, isBreak: false },
      { level: 2, small: 25, big: 50, ante: 0, duration: 10, isBreak: false },
      { level: 3, small: 50, big: 100, ante: 10, duration: 10, isBreak: false },
      { level: 4, small: 75, big: 150, ante: 25, duration: 10, isBreak: false },
      { level: 5, small: 100, big: 200, ante: 25, duration: 10, isBreak: false },
      { level: 6, small: 150, big: 300, ante: 50, duration: 10, isBreak: false },
      { level: 0, small: 0, big: 0, ante: 0, duration: 5, isBreak: true },
      { level: 7, small: 200, big: 400, ante: 50, duration: 10, isBreak: false },
      { level: 8, small: 300, big: 600, ante: 75, duration: 10, isBreak: false },
      { level: 9, small: 400, big: 800, ante: 100, duration: 10, isBreak: false },
      { level: 10, small: 500, big: 1000, ante: 100, duration: 10, isBreak: false },
      { level: 11, small: 750, big: 1500, ante: 200, duration: 10, isBreak: false },
      { level: 12, small: 1000, big: 2000, ante: 200, duration: 10, isBreak: false },
    ],
    payoutRatios: [
      { place: 1, percentage: 50 },
      { place: 2, percentage: 30 },
      { place: 3, percentage: 20 },
    ],
  },
  {
    id: 'standard',
    nameKey: 'tournament.templateStandard',
    name: '標準錦標賽',
    buyIn: 250,
    startingChips: 25000,
    reentryUntilLevel: 7,
    maxReentries: 2,
    levels: [
      { level: 1, small: 10, big: 20, ante: 20, duration: 15, isBreak: false },
      { level: 2, small: 25, big: 50, ante: 50, duration: 15, isBreak: false },
      { level: 3, small: 50, big: 100, ante: 100, duration: 15, isBreak: false },
      { level: 4, small: 75, big: 150, ante: 150, duration: 15, isBreak: false },
      { level: 5, small: 100, big: 200, ante: 200, duration: 15, isBreak: false },
      { level: 6, small: 150, big: 300, ante: 300, duration: 15, isBreak: false },
      { level: 7, small: 200, big: 400, ante: 400, duration: 15, isBreak: false },
      { level: 0, small: 0, big: 0, ante: 0, duration: 10, isBreak: true },
      { level: 8, small: 300, big: 600, ante: 600, duration: 15, isBreak: false },
      { level: 9, small: 400, big: 800, ante: 800, duration: 15, isBreak: false },
      { level: 10, small: 500, big: 1000, ante: 1000, duration: 15, isBreak: false },
      { level: 11, small: 750, big: 1500, ante: 1500, duration: 15, isBreak: false },
      { level: 12, small: 1000, big: 2000, ante: 2000, duration: 15, isBreak: false },
      { level: 0, small: 0, big: 0, ante: 0, duration: 10, isBreak: true },
      { level: 13, small: 1500, big: 3000, ante: 3000, duration: 15, isBreak: false },
      { level: 14, small: 2000, big: 4000, ante: 4000, duration: 15, isBreak: false },
      { level: 15, small: 3000, big: 6000, ante: 6000, duration: 15, isBreak: false },
    ],
    payoutRatios: [
      { place: 1, percentage: 50 },
      { place: 2, percentage: 30 },
      { place: 3, percentage: 20 },
    ],
  },
  {
    id: 'deepstack',
    nameKey: 'tournament.templateDeep',
    name: '深碼錦標賽',
    buyIn: 500,
    startingChips: 50000,
    reentryUntilLevel: 8,
    maxReentries: 3,
    levels: [
      { level: 1, small: 25, big: 50, ante: 50, duration: 20, isBreak: false },
      { level: 2, small: 50, big: 100, ante: 100, duration: 20, isBreak: false },
      { level: 3, small: 75, big: 150, ante: 150, duration: 20, isBreak: false },
      { level: 4, small: 100, big: 200, ante: 200, duration: 20, isBreak: false },
      { level: 5, small: 150, big: 300, ante: 300, duration: 20, isBreak: false },
      { level: 0, small: 0, big: 0, ante: 0, duration: 10, isBreak: true },
      { level: 6, small: 200, big: 400, ante: 400, duration: 20, isBreak: false },
      { level: 7, small: 300, big: 600, ante: 600, duration: 20, isBreak: false },
      { level: 8, small: 400, big: 800, ante: 800, duration: 20, isBreak: false },
      { level: 9, small: 500, big: 1000, ante: 1000, duration: 20, isBreak: false },
      { level: 10, small: 600, big: 1200, ante: 1200, duration: 20, isBreak: false },
      { level: 0, small: 0, big: 0, ante: 0, duration: 15, isBreak: true },
      { level: 11, small: 800, big: 1600, ante: 1600, duration: 20, isBreak: false },
      { level: 12, small: 1000, big: 2000, ante: 2000, duration: 20, isBreak: false },
      { level: 13, small: 1500, big: 3000, ante: 3000, duration: 20, isBreak: false },
      { level: 14, small: 2000, big: 4000, ante: 4000, duration: 20, isBreak: false },
      { level: 15, small: 3000, big: 6000, ante: 6000, duration: 20, isBreak: false },
      { level: 0, small: 0, big: 0, ante: 0, duration: 15, isBreak: true },
      { level: 16, small: 4000, big: 8000, ante: 8000, duration: 20, isBreak: false },
      { level: 17, small: 5000, big: 10000, ante: 10000, duration: 20, isBreak: false },
      { level: 18, small: 7500, big: 15000, ante: 15000, duration: 20, isBreak: false },
    ],
    payoutRatios: [
      { place: 1, percentage: 45 },
      { place: 2, percentage: 27 },
      { place: 3, percentage: 18 },
      { place: 4, percentage: 10 },
    ],
  },
];

/**
 * Create a blank tournament config with sensible defaults.
 */
export function createBlankTournamentConfig() {
  return {
    name: '',
    subtitle: '',
    buyIn: 250,
    startingChips: DEFAULT_STARTING_CHIPS,
    reentryUntilLevel: DEFAULT_REENTRY_LEVEL,
    maxReentries: DEFAULT_MAX_REENTRIES,
    levels: [
      { level: 1, small: 25, big: 50, ante: 0, duration: DEFAULT_TOURNAMENT_LEVEL_DURATION, isBreak: false },
      { level: 2, small: 50, big: 100, ante: 0, duration: DEFAULT_TOURNAMENT_LEVEL_DURATION, isBreak: false },
      { level: 3, small: 100, big: 200, ante: 25, duration: DEFAULT_TOURNAMENT_LEVEL_DURATION, isBreak: false },
    ],
    payoutRatios: [
      { place: 1, percentage: 50 },
      { place: 2, percentage: 30 },
      { place: 3, percentage: 20 },
    ],
  };
}

/**
 * Deep-clone a template into a mutable config object.
 */
export function cloneTemplate(template) {
  return JSON.parse(JSON.stringify({
    name: template.name,
    subtitle: '',
    buyIn: template.buyIn,
    startingChips: template.startingChips,
    reentryUntilLevel: template.reentryUntilLevel,
    maxReentries: template.maxReentries ?? DEFAULT_MAX_REENTRIES,
    levels: template.levels,
    payoutRatios: template.payoutRatios,
  }));
}
