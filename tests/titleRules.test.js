import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  TITLE_FAMILIES,
  TITLE_GROUPS,
  evaluateTitles,
  nextTierProgress,
  mergeUnlocked,
  resolveDisplay,
  validateTitlePrefs,
  normalizeTitlePrefs,
  buildUserTitles,
  getTitleFamily,
} from '../functions/src/utils/titleRules.js';
import { aggregateHistoryRecords } from '../functions/src/utils/leaderboardStatsMath.js';
import * as frontend from '../src/utils/titles.js';

const stats = ({ total = {}, tournament = {} } = {}) => ({
  total: { games: 0, profit: 0, ...total },
  cash: {},
  tournament: { games: 0, ...tournament },
});

describe('title catalog', () => {
  it('every family has a known group, ascending thresholds and rising tiers 1-4', () => {
    const ids = new Set();
    for (const fam of TITLE_FAMILIES) {
      expect(ids.has(fam.id)).toBe(false);
      ids.add(fam.id);
      expect(TITLE_GROUPS).toContain(fam.group);
      for (let i = 1; i < fam.tiers.length; i++) {
        expect(fam.tiers[i].threshold).toBeGreaterThan(fam.tiers[i - 1].threshold);
        expect(fam.tiers[i].tier).toBeGreaterThan(fam.tiers[i - 1].tier);
      }
      for (const step of fam.tiers) {
        expect(step.tier).toBeGreaterThanOrEqual(1);
        expect(step.tier).toBeLessThanOrEqual(4);
      }
      expect(fam.hidden ? fam.hintKey : true).toBeTruthy();
    }
  });

  it('every name / desc / hint key exists in every locale', () => {
    for (const locale of ['zh-TW', 'en', 'zh-CN', 'ja']) {
      const messages = JSON.parse(readFileSync(resolve(__dirname, `../src/i18n/locales/${locale}.json`), 'utf-8'));
      const get = (key) => key.split('.').reduce((node, part) => node?.[part], messages);
      for (const fam of TITLE_FAMILIES) {
        for (const key of [fam.descKey, fam.hintKey, ...fam.tiers.map((s) => s.nameKey)].filter(Boolean)) {
          expect(get(key), `${locale}: ${key}`).toBeTruthy();
        }
      }
      for (const group of TITLE_GROUPS) expect(get(`titles.groups.${group}`), `${locale} group ${group}`).toBeTruthy();
    }
  });

  it('the frontend re-exports the shared rules', () => {
    expect(frontend.evaluateTitles).toBe(evaluateTitles);
    expect(frontend.TITLE_FAMILIES).toBe(TITLE_FAMILIES);
  });
});

describe('evaluateTitles', () => {
  it('no stats → no titles', () => {
    expect(evaluateTitles(null)).toEqual({});
    expect(evaluateTitles(stats())).toEqual({});
  });

  it('wallet: net win / loss and biggest single game in 組', () => {
    expect(evaluateTitles(stats({ total: { profit: 5000 } })).netWin).toBe(2);
    expect(evaluateTitles(stats({ total: { profit: 1999 } })).netWin).toBeUndefined();
    expect(evaluateTitles(stats({ total: { profit: -40000 } })).netLoss).toBe(4);
    const big = evaluateTitles(stats({ total: { maxWinGroups: 10, maxLossGroups: 3 } }));
    expect(big.bigWin).toBe(3);
    expect(big.bigLoss).toBe(1);
  });

  it('volatility needs 10 games with a 組 size; steady also needs a net profit', () => {
    // 10 games of ±3 組 → σ = 3
    const swingy = { groupGames: 10, sumGroups: 0, sumSqGroups: 90 };
    expect(evaluateTitles(stats({ total: { games: 10, ...swingy } })).volatile).toBe(2);
    expect(evaluateTitles(stats({ total: { games: 9, ...swingy, groupGames: 9, sumSqGroups: 81 } })).volatile)
      .toBeUndefined();

    // 20 games of +0.5 組 → σ = 0, profitable
    const calm = { games: 20, groupGames: 20, sumGroups: 10, sumSqGroups: 5, profit: 100 };
    expect(evaluateTitles(stats({ total: calm })).steady).toBe(2);
    expect(evaluateTitles(stats({ total: { ...calm, profit: -1 } })).steady).toBeUndefined();
    expect(evaluateTitles(stats({ total: { ...swingy, games: 50, profit: 100 } })).steady).toBeUndefined();
  });

  it('families with fewer steps start at a higher rarity', () => {
    expect(evaluateTitles(stats({ tournament: { topDraws: 1 } })).mysteryTop).toBe(2);
    expect(evaluateTitles(stats({ tournament: { topDraws: 10 } })).mysteryTop).toBe(4);
    expect(evaluateTitles(stats({ tournament: { rebuyCount: 100 } })).rebuyer).toBe(3);
    expect(evaluateTitles(stats({ tournament: { maxRebuyItm: 6 } })).phoenix).toBe(4);
    expect(evaluateTitles(stats({ total: { winStreakBest: 3 } })).hotStreak).toBe(2);
  });

  it('hidden ones unlock like the rest', () => {
    const got = evaluateTitles(stats({
      total: { nightGames: 10 },
      tournament: { runnerUp: 5, bubble: 3, firstOut: 5 },
    }));
    expect(got).toMatchObject({ nightOwl: 3, runnerUp: 3, bubble: 3, firstOut: 3 });
  });

  it('works on real aggregated stats', () => {
    const at = Date.parse('2026-07-22T20:00:00+08:00');
    const records = Array.from({ length: 10 }, (_, i) => ({
      type: 'live', profit: 1000, rate: 1, baseBuyIn: 1000, createdAt: at + i * 1000, hostUid: 'me',
    }));
    const all = aggregateHistoryRecords('me', records).get('all');
    expect(evaluateTitles(all)).toMatchObject({
      regular: 1, host: 1, hotStreak: 4, netWin: 3, steady: 1,
    });
  });
});

describe('nextTierProgress', () => {
  it('reports the next goal and how far along', () => {
    const p = nextTierProgress('regular', stats({ total: { games: 20 } }));
    expect(p).toMatchObject({ value: 20, tier: 1, from: 10, maxed: false });
    expect(p.next).toMatchObject({ tier: 2, threshold: 30 });
    expect(p.ratio).toBeCloseTo(0.5);
  });

  it('starts above an already-unlocked tier even if the value dropped', () => {
    const p = nextTierProgress(getTitleFamily('netWin'), stats({ total: { profit: 8000 } }), 3);
    expect(p.tier).toBe(3);
    expect(p.next.threshold).toBe(30000);
    expect(p.ratio).toBe(0);
  });

  it('maxed at the top tier', () => {
    expect(nextTierProgress('champion', stats({ tournament: { champion: 31 } })))
      .toMatchObject({ tier: 4, next: null, maxed: true, ratio: 1 });
  });
});

describe('mergeUnlocked', () => {
  it('only goes up, and keeps the time a tier was first reached', () => {
    const prev = { regular: { tier: 2, at: 100 }, netWin: { tier: 3, at: 50 } };
    const { unlocked, upgraded } = mergeUnlocked(prev, { regular: 2, netWin: 1, champion: 1, host: 1 }, 999);
    expect(unlocked.regular).toEqual({ tier: 2, at: 100 });
    expect(unlocked.netWin).toEqual({ tier: 3, at: 50 });
    expect(unlocked.champion).toEqual({ tier: 1, at: 999 });
    expect(upgraded.map((u) => u.familyId).sort()).toEqual(['champion', 'host']);

    const again = mergeUnlocked(unlocked, { regular: 3 }, 2000);
    expect(again.unlocked.regular).toEqual({ tier: 3, at: 2000 });
  });
});

describe('prefs and display', () => {
  const unlocked = {
    regular: { tier: 2, at: 100 },
    champion: { tier: 2, at: 300 },
    host: { tier: 1, at: 900 },
  };

  it('auto: highest tier, ties go to the most recent', () => {
    expect(resolveDisplay(unlocked, { mode: 'auto' })).toEqual({ familyId: 'champion', tier: 2 });
    expect(resolveDisplay({}, { mode: 'auto' })).toBeNull();
  });

  it('off hides; pick shows the chosen one (auto if it is not unlocked)', () => {
    expect(resolveDisplay(unlocked, { mode: 'off' })).toBeNull();
    expect(resolveDisplay(unlocked, { mode: 'pick', titleId: 'host' })).toEqual({ familyId: 'host', tier: 1 });
    expect(resolveDisplay(unlocked, { mode: 'pick', titleId: 'nightOwl' })).toEqual({ familyId: 'champion', tier: 2 });
  });

  it('defaults: auto, nothing picked, room titles on', () => {
    expect(normalizeTitlePrefs(null)).toEqual({ mode: 'auto', titleId: null, showRoomTitles: true });
  });

  it('validates setTitlePrefs input', () => {
    expect(validateTitlePrefs({ mode: 'pick', titleId: 'host' }, null, unlocked).prefs)
      .toEqual({ mode: 'pick', titleId: 'host', showRoomTitles: true });
    expect(validateTitlePrefs({ mode: 'pick', titleId: 'nightOwl' }, null, unlocked).error).toBe('not-unlocked');
    expect(validateTitlePrefs({ mode: 'pick' }, null, unlocked).error).toBe('not-unlocked');
    expect(validateTitlePrefs({ mode: 'loud' }, null, unlocked).error).toBe('bad-mode');
    expect(validateTitlePrefs({ titleId: 7 }, null, unlocked).error).toBe('bad-title');
    expect(validateTitlePrefs({ showRoomTitles: 'yes' }, null, unlocked).error).toBe('bad-toggle');
    // Fields left out keep their stored value
    expect(validateTitlePrefs({ showRoomTitles: false }, { mode: 'off', titleId: 'host' }, unlocked).prefs)
      .toEqual({ mode: 'off', titleId: 'host', showRoomTitles: false });
  });
});

describe('buildUserTitles', () => {
  it('writes nothing for a user with no titles and no doc', () => {
    expect(buildUserTitles(null, stats(), 1).changed).toBe(false);
  });

  it('first unlock creates the doc with auto display', () => {
    const next = buildUserTitles(null, stats({ total: { games: 10 } }), 5);
    expect(next.changed).toBe(true);
    expect(next.unlocked).toEqual({ regular: { tier: 1, at: 5 } });
    expect(next.display).toEqual({ familyId: 'regular', tier: 1 });
  });

  it('unchanged stats → no write; keeps the user prefs', () => {
    const prev = {
      unlocked: { regular: { tier: 1, at: 5 } },
      prefs: { mode: 'off', titleId: null, showRoomTitles: false },
      display: null,
    };
    const next = buildUserTitles(prev, stats({ total: { games: 12 } }), 9);
    expect(next.changed).toBe(false);
    expect(next.prefs).toEqual(prev.prefs);
    expect(next.display).toBeNull();
  });
});
