import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isLegacyDefaultPrefs,
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
  resolveTitle,
  resolveFrame,
  titleCount,
  earnedFrame,
  earnedFrames,
  FRAME_TIERS,
} from '../functions/src/utils/titleRules.js';
import { aggregateHistoryRecords } from '../functions/src/utils/leaderboardStatsMath.js';
import * as frontend from '../src/utils/titles.js';
import { ROOM_TITLE_IDS } from '../src/utils/roomTitles.js';

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
      for (const frame of FRAME_TIERS) expect(get(`titles.frames.${frame.id}`), `${locale} frame ${frame.id}`).toBeTruthy();
      for (const key of ['frame', 'frameAuto', 'frameNeed', 'frameNone', 'frameHint', 'titleCount', 'room.live']) {
        expect(get(`titles.${key}`), `${locale} titles.${key}`).toBeTruthy();
      }
      for (const id of ROOM_TITLE_IDS) {
        expect(get(`titles.room.names.${id}`), `${locale} room ${id}`).toBeTruthy();
        expect(get(`titles.room.desc.${id}`), `${locale} room desc ${id}`).toBeTruthy();
      }
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
    expect(evaluateTitles(stats({ total: { winStreakBest: 3 } })).hotStreak).toBeUndefined();
    expect(evaluateTitles(stats({ total: { winStreakBest: 4 } })).hotStreak).toBe(2);
  });

  it('hidden ones unlock like the rest', () => {
    const got = evaluateTitles(stats({
      total: { nightGames: 10 },
      tournament: { runnerUp: 5, bubble: 5, firstOut: 5 },
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
    const p = nextTierProgress('regular', stats({ total: { games: 25 } }));
    expect(p).toMatchObject({ value: 25, tier: 1, from: 10, maxed: false });
    expect(p.next).toMatchObject({ tier: 2, threshold: 40 });
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

  // 2 + 2 + 1 = 5 titles held → bronze
  it('auto: highest tier, ties go to the most recent', () => {
    expect(resolveDisplay(unlocked, { mode: 'auto', frame: 'auto' })).toEqual({ familyId: 'champion', tier: 2, frame: 'bronze' });
    expect(resolveDisplay({}, { mode: 'auto' })).toBeNull();
    expect(resolveTitle(unlocked, { mode: 'auto' })).toEqual({ familyId: 'champion', tier: 2 });
  });

  it('off hides the title but keeps the frame; pick shows the chosen one (auto if it is not unlocked)', () => {
    expect(resolveDisplay(unlocked, { mode: 'off', frame: 'auto' })).toEqual({ familyId: null, tier: null, frame: 'bronze' });
    expect(resolveDisplay({ host: { tier: 1, at: 1 } }, { mode: 'off', frame: 'auto' })).toBeNull();
    expect(resolveDisplay(unlocked, { mode: 'pick', titleId: 'host', frame: 'auto' })).toEqual({ familyId: 'host', tier: 1, frame: 'bronze' });
    expect(resolveDisplay(unlocked, { mode: 'pick', titleId: 'nightOwl', frame: 'auto' })).toEqual({ familyId: 'champion', tier: 2, frame: 'bronze' });
    // A title but no frame yet
    expect(resolveDisplay({ host: { tier: 1, at: 1 } }, { mode: 'auto', frame: 'auto' })).toEqual({ familyId: 'host', tier: 1, frame: null });
  });

  it('opt-in: with no prefs set nothing shows, not even an earned frame', () => {
    expect(resolveDisplay(unlocked, null)).toBeNull();
    expect(resolveDisplay(unlocked, { mode: 'auto', frame: 'none' })).toEqual({ familyId: 'champion', tier: 2, frame: null });
    expect(resolveFrame(unlocked, { frame: 'none' })).toBeNull();
  });

  it('defaults are all off (opt-in): no title, no frame, no room titles', () => {
    expect(normalizeTitlePrefs(null)).toEqual({ mode: 'off', titleId: null, showRoomTitles: false, frame: 'none' });
    expect(normalizeTitlePrefs({ frame: 'ruby' }).frame).toBe('none');
    expect(normalizeTitlePrefs({ frame: 'gold' }).frame).toBe('gold');
    expect(normalizeTitlePrefs({ frame: 'auto' }).frame).toBe('auto');
  });

  it('spots prefs that are only the old defaults from before opt-in', () => {
    expect(isLegacyDefaultPrefs(null)).toBe(true);
    expect(isLegacyDefaultPrefs({ mode: 'auto', titleId: null, showRoomTitles: true, frame: 'auto' })).toBe(true);
    expect(isLegacyDefaultPrefs({ mode: 'auto', titleId: null, showRoomTitles: true })).toBe(true);
    // Anything the player changed
    expect(isLegacyDefaultPrefs({ mode: 'pick', titleId: 'host', showRoomTitles: true, frame: 'auto' })).toBe(false);
    expect(isLegacyDefaultPrefs({ mode: 'off', showRoomTitles: true, frame: 'auto' })).toBe(false);
    expect(isLegacyDefaultPrefs({ mode: 'auto', showRoomTitles: false, frame: 'auto' })).toBe(false);
    expect(isLegacyDefaultPrefs({ mode: 'auto', showRoomTitles: true, frame: 'gold' })).toBe(false);
  });

  it('validates setTitlePrefs input', () => {
    expect(validateTitlePrefs({ mode: 'pick', titleId: 'host' }, null, unlocked).prefs)
      .toEqual({ mode: 'pick', titleId: 'host', showRoomTitles: false, frame: 'none' });
    expect(validateTitlePrefs({ mode: 'pick', titleId: 'nightOwl' }, null, unlocked).error).toBe('not-unlocked');
    expect(validateTitlePrefs({ mode: 'pick' }, null, unlocked).error).toBe('not-unlocked');
    expect(validateTitlePrefs({ mode: 'loud' }, null, unlocked).error).toBe('bad-mode');
    expect(validateTitlePrefs({ titleId: 7 }, null, unlocked).error).toBe('bad-title');
    expect(validateTitlePrefs({ showRoomTitles: 'yes' }, null, unlocked).error).toBe('bad-toggle');
    // Fields left out keep their stored value
    expect(validateTitlePrefs({ showRoomTitles: false }, { mode: 'off', titleId: 'host', frame: 'bronze' }, unlocked).prefs)
      .toEqual({ mode: 'off', titleId: 'host', showRoomTitles: false, frame: 'bronze' });
  });

  it('validates the frame pick: auto or an earned frame', () => {
    expect(validateTitlePrefs({ frame: 'bronze' }, null, unlocked).prefs.frame).toBe('bronze');
    expect(validateTitlePrefs({ frame: 'auto' }, { frame: 'bronze' }, unlocked).prefs.frame).toBe('auto');
    expect(validateTitlePrefs({ frame: 'none' }, { frame: 'bronze' }, unlocked).prefs.frame).toBe('none');
    expect(validateTitlePrefs({ frame: 'none' }, null, {}).prefs.frame).toBe('none');
    expect(validateTitlePrefs({ frame: 'silver' }, null, unlocked).error).toBe('frame-locked');
    expect(validateTitlePrefs({ frame: 'bronze' }, null, {}).error).toBe('frame-locked');
    expect(validateTitlePrefs({ frame: 'ruby' }, null, unlocked).error).toBe('bad-frame');
    expect(validateTitlePrefs({ frame: null }, null, unlocked).error).toBe('bad-frame');
    expect(validateTitlePrefs({ frame: 3 }, null, unlocked).error).toBe('bad-frame');
  });
});

describe('頭像框', () => {
  // A 1-2-3-4 family at tier n holds n titles
  const held = (n) => {
    const out = {};
    const fours = TITLE_FAMILIES.filter((f) => f.tiers.length === 4);
    let left = n;
    for (const fam of fours) {
      if (left <= 0) break;
      const tier = Math.min(4, left);
      out[fam.id] = { tier, at: 1 };
      left -= tier;
    }
    return out;
  };

  it('frames at 4 / 8 / 16 / 22 / 30 titles', () => {
    expect(FRAME_TIERS.map((f) => [f.id, f.min])).toEqual([
      ['bronze', 4], ['silver', 8], ['gold', 16], ['platinum', 22], ['diamond', 30],
    ]);
  });

  it('titleCount: every step reached is a title', () => {
    expect(titleCount(null)).toBe(0);
    expect(titleCount({})).toBe(0);
    expect(titleCount({ regular: { tier: 3, at: 1 }, host: { tier: 1, at: 1 } })).toBe(4);
    // Shorter families start higher: 神秘賞金頭獎 at tier 3 (2-3-4) is 2 titles, a hidden one is 1
    expect(titleCount({ mysteryTop: { tier: 3, at: 1 }, runnerUp: { tier: 3, at: 1 } })).toBe(3);
    // rebuyer goes 1-2-3
    expect(titleCount({ rebuyer: { tier: 3, at: 1 } })).toBe(3);
    // A family from a newer catalog counts its tier; bad entries count nothing
    expect(titleCount({ someNewFamily: { tier: 2, at: 1 }, broken: { tier: 0 }, junk: null })).toBe(2);
  });

  it('crowns and expiring entries never count (frames must not drop)', () => {
    expect(titleCount({ regular: { tier: 4, at: 1, expiresAt: 99 } })).toBe(0);
    expect(titleCount({ regular: { tier: 2, at: 1 }, monthlyCrown: { tier: 4, at: 1, expiresAt: 99 } })).toBe(2);
  });

  it('earnedFrame at each threshold', () => {
    expect(earnedFrame({})).toBeNull();
    expect(earnedFrame(held(3))).toBeNull();
    expect(earnedFrame(held(4))).toBe('bronze');
    expect(earnedFrame(held(7))).toBe('bronze');
    expect(earnedFrame(held(8))).toBe('silver');
    expect(earnedFrame(held(16))).toBe('gold');
    expect(earnedFrame(held(21))).toBe('gold');
    expect(earnedFrame(held(22))).toBe('platinum');
    expect(earnedFrame(held(30))).toBe('diamond');
    expect(earnedFrame(held(40))).toBe('diamond');
    expect(earnedFrames(held(16))).toEqual(['bronze', 'silver', 'gold']);
    expect(earnedFrames({})).toEqual([]);
  });

  it('the shown frame: picked while earned, else the highest earned', () => {
    expect(resolveFrame(held(16), null)).toBeNull();
    expect(resolveFrame(held(16), { frame: 'auto' })).toBe('gold');
    expect(resolveFrame(held(16), { frame: 'bronze' })).toBe('bronze');
    expect(resolveFrame(held(16), { frame: 'diamond' })).toBe('gold');
    expect(resolveFrame({}, { frame: 'bronze' })).toBeNull();
  });

  it('frames never drop: unlocked only grows', () => {
    const before = held(8);
    const { unlocked } = mergeUnlocked(before, {}, 5);
    expect(earnedFrame(unlocked)).toBe('silver');
  });
});

describe('buildUserTitles', () => {
  it('writes nothing for a user with no titles and no doc', () => {
    expect(buildUserTitles(null, stats(), 1).changed).toBe(false);
  });

  it('first unlock creates the doc, shown nowhere until the player turns it on', () => {
    const next = buildUserTitles(null, stats({ total: { games: 10 } }), 5);
    expect(next.changed).toBe(true);
    expect(next.unlocked).toEqual({ regular: { tier: 1, at: 5 } });
    expect(next.prefs).toEqual({ mode: 'off', titleId: null, showRoomTitles: false, frame: 'none' });
    expect(next.display).toBeNull();
  });

  it('unchanged stats → no write; keeps the user prefs', () => {
    const prev = {
      unlocked: { regular: { tier: 1, at: 5 } },
      prefs: { mode: 'off', titleId: null, showRoomTitles: false, frame: 'auto' },
      display: null,
    };
    const next = buildUserTitles(prev, stats({ total: { games: 12 } }), 9);
    expect(next.changed).toBe(false);
    expect(next.prefs).toEqual(prev.prefs);
    expect(next.display).toBeNull();
  });

  it('recomputes the frame: a doc from before frames gets one written', () => {
    const prev = {
      unlocked: { regular: { tier: 2, at: 5 }, host: { tier: 2, at: 6 } },
      prefs: { mode: 'off', titleId: null, showRoomTitles: true, frame: 'auto' },
      display: null,
    };
    const next = buildUserTitles(prev, stats({ total: { games: 40, hostedGames: 15 } }), 9);
    expect(next.changed).toBe(true);
    expect(next.display).toEqual({ familyId: null, tier: null, frame: 'bronze' });
    expect(next.prefs.frame).toBe('auto');
    // Written once; the same again is no change
    expect(buildUserTitles({ ...prev, display: next.display }, stats({ total: { games: 40, hostedGames: 15 } }), 10).changed)
      .toBe(false);
  });

  it('a new tier that crosses a frame threshold updates the frame', () => {
    const prev = {
      unlocked: { regular: { tier: 2, at: 5 }, host: { tier: 1, at: 6 } },
      prefs: { mode: 'auto', titleId: null, showRoomTitles: true, frame: 'auto' },
      display: { familyId: 'regular', tier: 2, frame: null },
    };
    // host 1 → 2: 4 titles held
    const next = buildUserTitles(prev, stats({ total: { games: 40, hostedGames: 15 } }), 9);
    expect(next.changed).toBe(true);
    expect(next.display).toEqual({ familyId: 'host', tier: 2, frame: 'bronze' });
  });

  it('rebuild: tiers can go down after a threshold change; earlier unlock times stay', () => {
    const prev = {
      unlocked: {
        regular: { tier: 3, at: 5 }, // given by an older, lower threshold
        host: { tier: 1, at: 6 },
        bubble: { tier: 3, at: 7 }, // no longer reached at all
        someNewFamily: { tier: 2, at: 8 }, // a newer catalog: left alone
      },
      prefs: { mode: 'pick', titleId: 'bubble', showRoomTitles: true, frame: 'auto' },
      display: { familyId: 'bubble', tier: 3, frame: null },
    };
    const s = stats({ total: { games: 66, hostedGames: 15 }, tournament: { bubble: 3 } });
    // The normal path only adds
    expect(buildUserTitles(prev, s, 9).unlocked.regular).toEqual({ tier: 3, at: 5 });

    const next = buildUserTitles(prev, s, 9, { rebuild: true });
    expect(next.changed).toBe(true);
    expect(next.unlocked).toEqual({
      regular: { tier: 2, at: 5 },
      host: { tier: 2, at: 9 },
      someNewFamily: { tier: 2, at: 8 },
    });
    expect(next.upgraded).toEqual([{ familyId: 'host', tier: 2 }]);
    // The picked title is gone: shown as auto, the pick itself kept
    expect(next.prefs.titleId).toBe('bubble');
    expect(next.display.familyId).toBe('host');
    // Rebuilding what is already right writes nothing
    expect(buildUserTitles({ ...prev, unlocked: next.unlocked, display: next.display }, s, 10, { rebuild: true }).changed)
      .toBe(false);
  });
});
