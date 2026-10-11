import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isLegacyDefaultPrefs,
  TITLE_FAMILIES,
  TITLE_GROUPS,
  TITLE_LADDERS,
  TITLE_LADDER_VERSION,
  TITLE_TIER_COUNT,
  evaluateTitles,
  nextTierProgress,
  mergeUnlocked,
  rebuildUnlocked,
  resolveDisplay,
  validateTitlePrefs,
  normalizeTitlePrefs,
  buildUserTitles,
  buildCrownUpdate,
  effectiveDisplay,
  getTitleFamily,
  legacyTier,
  upgradeTitlesDoc,
  resolveTitle,
  resolveFrame,
  titleCount,
  earnedFrame,
  earnedFrames,
  FRAME_TIERS,
} from '../functions/src/utils/titleRules.js';
import { aggregateHistoryRecords } from '../functions/src/utils/leaderboardStatsMath.js';
import { summarizeTitleTiers, formatTitleTierSummary, percentile } from '../functions/src/utils/titleTierStats.js';
import * as frontend from '../src/utils/titles.js';
import { ROOM_TITLE_IDS } from '../src/utils/roomTitles.js';

const LOCALES = ['zh-TW', 'en', 'zh-CN', 'ja'];
const messagesOf = (locale) => JSON.parse(readFileSync(resolve(__dirname, `../src/i18n/locales/${locale}.json`), 'utf-8'));

const stats = ({ total = {}, tournament = {} } = {}) => ({
  total: { games: 0, profit: 0, ...total },
  cash: {},
  tournament: { games: 0, ...tournament },
});

// Every string under a node, with its key path
function strings(node, path = '') {
  if (typeof node === 'string') return [[path, node]];
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
}

describe('title catalog', () => {
  it('every family has a known group and ten steps: tiers 1..10, strictly rising thresholds', () => {
    const ids = new Set();
    expect(TITLE_TIER_COUNT).toBe(10);
    for (const fam of TITLE_FAMILIES) {
      expect(ids.has(fam.id)).toBe(false);
      ids.add(fam.id);
      expect(TITLE_GROUPS).toContain(fam.group);
      expect(fam.tiers.map((s) => s.tier), fam.id).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(fam.tiers.map((s) => s.threshold), fam.id).toEqual(TITLE_LADDERS[fam.id]);
      expect(fam.tiers.map((s) => s.nameKey)).toEqual(fam.tiers.map((s) => `titles.families.${fam.id}.t${s.tier}`));
      for (let i = 1; i < fam.tiers.length; i++) {
        expect(fam.tiers[i].threshold, `${fam.id} t${i + 1}`).toBeGreaterThan(fam.tiers[i - 1].threshold);
      }
      expect(fam.tiers[0].threshold).toBeGreaterThan(0);
      expect(fam.hidden ? fam.hintKey : true).toBeTruthy();
    }
    // One ladder line per family, nothing extra
    expect(Object.keys(TITLE_LADDERS).sort()).toEqual([...ids].sort());
  });

  it('every name / desc / hint key exists in every locale, ten distinct names per family', () => {
    for (const locale of LOCALES) {
      const messages = messagesOf(locale);
      const get = (key) => key.split('.').reduce((node, part) => node?.[part], messages);
      for (const fam of TITLE_FAMILIES) {
        for (const key of [fam.descKey, fam.hintKey, ...fam.tiers.map((s) => s.nameKey)].filter(Boolean)) {
          expect(get(key), `${locale}: ${key}`).toBeTruthy();
        }
        const names = fam.tiers.map((s) => get(s.nameKey));
        expect(new Set(names).size, `${locale}: ${fam.id} names`).toBe(10);
        // Nothing left over from the old 1..4 keys beyond the ten
        expect(get(`titles.families.${fam.id}.t11`)).toBeUndefined();
      }
      for (const group of TITLE_GROUPS) expect(get(`titles.groups.${group}`), `${locale} group ${group}`).toBeTruthy();
      for (const frame of FRAME_TIERS) expect(get(`titles.frames.${frame.id}`), `${locale} frame ${frame.id}`).toBeTruthy();
      for (const rarity of frontend.TITLE_RARITIES) {
        expect(get(`titles.rarity.${rarity}`), `${locale} rarity ${rarity}`).toBeTruthy();
      }
      for (const key of ['frame', 'frameAuto', 'frameNeed', 'frameNone', 'frameHint', 'titleCount', 'room.live',
        'showSteps', 'hideSteps', 'stepsOf']) {
        expect(get(`titles.${key}`), `${locale} titles.${key}`).toBeTruthy();
      }
      for (const id of ROOM_TITLE_IDS) {
        expect(get(`titles.room.names.${id}`), `${locale} room ${id}`).toBeTruthy();
        expect(get(`titles.room.desc.${id}`), `${locale} room desc ${id}`).toBeTruthy();
      }
    }
  });

  it('no title string says 輸 (lose), in either Chinese', () => {
    for (const locale of ['zh-TW', 'zh-CN']) {
      for (const [key, text] of strings(messagesOf(locale).titles, 'titles')) {
        expect(text, `${locale}: ${key}`).not.toMatch(/[輸输]/);
      }
    }
  });

  it('names fit a badge: at most 6 characters in Chinese', () => {
    for (const locale of ['zh-TW', 'zh-CN']) {
      const families = messagesOf(locale).titles.families;
      for (const fam of TITLE_FAMILIES) {
        for (const step of fam.tiers) {
          const name = families[fam.id][`t${step.tier}`];
          expect([...name].length, `${locale}: ${fam.id} t${step.tier} ${name}`).toBeLessThanOrEqual(6);
        }
      }
    }
  });

  it('the approved names sit where they belong', () => {
    const zh = messagesOf('zh-TW').titles.families;
    const name = (id, tier) => zh[id][`t${tier}`];
    expect(name('badBeat', 10)).toBe('卑鄙之王');
    expect(name('royalFlush', 10)).toBe('天選之人');
    expect(name('netWin', 10)).toBe('賭神');
    expect(['開路先鋒']).toContain(name('firstOut', 2));
    // Earlier names kept, in their order up the ladder
    const order = (id, list) => {
      const tiers = list.map((n) => Object.entries(zh[id]).find(([, v]) => v === n)?.[0]);
      expect(tiers.every(Boolean), `${id}: ${list}`).toBe(true);
      const nums = tiers.map((k) => Number(k.slice(1)));
      expect(nums, id).toEqual([...nums].sort((a, b) => a - b));
    };
    order('netWin', ['小有斬獲', '牌桌新貴', '印鈔機', '賭神']);
    order('bigWin', ['手氣不錯', '洗劫', '血洗全桌', '一夜傾城']);
    order('hunter', ['見習獵人', '賞金獵人', '獵頭專家', '死神']);
    order('champion', ['首冠', '三冠王', '王朝', '不朽傳奇']);
    order('regular', ['新面孔', '常客', '牌桌釘子戶', '住在牌桌的人']);
    order('host', ['開房', '房東', '包租公', '地產大亨']);
    order('volatile', ['小老闆', '老闆', '董事長', '集團總裁']);
    order('coldStreak', ['越挫越勇', '屢敗屢戰', '永不放棄']);
    order('netLoss', ['愛心捐款', '慈善家', '天使投資人', '全桌衣食父母']);
    order('bigLoss', ['豪氣出手', '一擲千金', '千金散盡', '散財童子']);
    order('hunted', ['備受矚目', '頭號目標', '高額懸賞', '傳說懸賞']);
    order('badBeat', ['小卑鄙', '卑鄙大師', '卑鄙之王']);
    order('cooler', ['宿命對決', '冤家路窄', '天命之戰']);
    order('quads', ['四大天王', '四條收藏家']);
    order('mysteryTop', ['小確幸', '歐洲人', '歐皇']);
    order('phoenix', ['浴火重生', '不死鳥', '九命怪貓']);
    for (const [id, n] of [['runnerUp', '銀牌專家'], ['bubble', '一步之遙'], ['nightOwl', '夜貓子'],
      ['tragicHero', '悲劇英雄'], ['straightFlush', '天降祥瑞'], ['avenger', '復仇者']]) {
      expect(Object.values(zh[id]), id).toContain(n);
    }
  });

  it('the frontend re-exports the shared rules', () => {
    expect(frontend.evaluateTitles).toBe(evaluateTitles);
    expect(frontend.TITLE_FAMILIES).toBe(TITLE_FAMILIES);
  });
});

describe('rarity bands', () => {
  it('two tiers per rarity: common · rare · epic · legendary · mythic', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((t) => frontend.titleRarity(t))).toEqual([
      'common', 'common', 'rare', 'rare', 'epic', 'epic', 'legendary', 'legendary', 'mythic', 'mythic',
    ]);
    expect(frontend.titleRarity(0)).toBe('common');
    expect(frontend.titleRarity(undefined)).toBe('common');
    expect(frontend.titleRarity(11)).toBe('common');
    // A crown is its own red-gold legendary, whatever its stored number
    expect(frontend.titleRarity(4, 'crownHunter')).toBe('legendary');
    expect(frontend.titleRarity(4, 'regular')).toBe('rare');
    expect(frontend.CROWN_ICON_MIN_TIER).toBe(7);
  });
});

describe('evaluateTitles', () => {
  it('no stats → no titles', () => {
    expect(evaluateTitles(null)).toEqual({});
    expect(evaluateTitles(stats())).toEqual({});
  });

  it('wallet: net win / loss and biggest single game in 組', () => {
    expect(evaluateTitles(stats({ total: { profit: 499 } })).netWin).toBeUndefined();
    expect(evaluateTitles(stats({ total: { profit: 500 } })).netWin).toBe(1);
    expect(evaluateTitles(stats({ total: { profit: 60000 } })).netWin).toBe(10);
    expect(evaluateTitles(stats({ total: { profit: -90000 } })).netLoss).toBe(10);
    const big = evaluateTitles(stats({ total: { maxWinGroups: 10, maxLossGroups: 3 } }));
    expect(big.bigWin).toBe(6);
    expect(big.bigLoss).toBe(2);
  });

  it('today\'s leaders sit around tier 5–7, tier 1 is an easy first taste', () => {
    const top = evaluateTitles(stats({
      total: {
        games: 105, hostedGames: 72, profit: 12500, maxWinGroups: 12.95, maxLossGroups: 9.1,
        winStreakBest: 8, lossStreakBest: 12,
      },
      tournament: { champion: 7, itm: 12, rebuyCount: 14, runnerUp: 6, bubble: 5, firstOut: 5, knockouts: 5 },
    }));
    expect(top).toMatchObject({
      regular: 6, host: 6, netWin: 6, bigWin: 6, bigLoss: 6, hotStreak: 6, coldStreak: 6,
      champion: 5, itm: 5, rebuyer: 5, runnerUp: 5, bubble: 5, firstOut: 5, hunter: 5,
    });
    expect(evaluateTitles(stats({ total: { profit: -20600 } })).netLoss).toBe(6);
    const first = evaluateTitles(stats({ total: { games: 5, hostedGames: 3 }, tournament: { champion: 1, itm: 1 } }));
    expect(first).toMatchObject({ regular: 1, host: 1, champion: 1, itm: 1 });
  });

  it('volatility needs 10 games with a 組 size; steady also needs a net profit', () => {
    // 10 games of ±3 組 → σ = 3
    const swingy = { groupGames: 10, sumGroups: 0, sumSqGroups: 90 };
    expect(evaluateTitles(stats({ total: { games: 10, ...swingy } })).volatile).toBe(4);
    expect(evaluateTitles(stats({ total: { games: 9, ...swingy, groupGames: 9, sumSqGroups: 81 } })).volatile)
      .toBeUndefined();

    // 20 games of +0.5 組 → σ = 0, profitable
    const calm = { games: 20, groupGames: 20, sumGroups: 10, sumSqGroups: 5, profit: 100 };
    expect(evaluateTitles(stats({ total: calm })).steady).toBe(3);
    expect(evaluateTitles(stats({ total: { ...calm, profit: -1 } })).steady).toBeUndefined();
    expect(evaluateTitles(stats({ total: { ...swingy, games: 50, profit: 100 } })).steady).toBeUndefined();
  });

  it('the families that used to have one to three steps climb all ten now', () => {
    expect(evaluateTitles(stats({ tournament: { topDraws: 1 } })).mysteryTop).toBe(1);
    expect(evaluateTitles(stats({ tournament: { topDraws: 20 } })).mysteryTop).toBe(10);
    expect(evaluateTitles(stats({ tournament: { rebuyCount: 80 } })).rebuyer).toBe(10);
    expect(evaluateTitles(stats({ tournament: { maxRebuyItm: 9 } })).phoenix).toBe(9);
    expect(evaluateTitles(stats({ total: { winStreakBest: 1 } })).hotStreak).toBeUndefined();
    expect(evaluateTitles(stats({ total: { winStreakBest: 2 } })).hotStreak).toBe(1);
    expect(evaluateTitles(stats({ total: { lossStreakBest: 25 } })).coldStreak).toBe(10);
  });

  it('hidden ones unlock like the rest, from their first step', () => {
    const got = evaluateTitles(stats({
      total: { nightGames: 1 },
      tournament: { runnerUp: 1, bubble: 1, firstOut: 1 },
    }));
    expect(got).toMatchObject({ nightOwl: 1, runnerUp: 1, bubble: 1, firstOut: 1 });
    expect(evaluateTitles(stats({ total: { nightGames: 100 } })).nightOwl).toBe(10);
  });

  it('手牌 and 復仇者 read the hand events in the total bucket', () => {
    expect(evaluateTitles(stats({ total: { badBeatWins: 1 } })).badBeat).toBe(1);
    expect(evaluateTitles(stats({ total: { badBeatWins: 4 } })).badBeat).toBe(4);
    expect(evaluateTitles(stats({ total: { badBeatWins: 20 } })).badBeat).toBe(10);
    expect(evaluateTitles(stats({ total: { coolers: 1 } })).cooler).toBe(1);
    expect(evaluateTitles(stats({ total: { coolers: 25 } })).cooler).toBe(10);
    expect(evaluateTitles(stats({ total: { quads: 4 } })).quads).toBe(4);
    expect(evaluateTitles(stats({ total: { quads: 5 } })).quads).toBe(5);
    expect(evaluateTitles(stats({
      total: { tragicHero: 1, straightFlush: 1, royalFlush: 1, revenge: 1 },
    }))).toMatchObject({ tragicHero: 1, straightFlush: 1, royalFlush: 1, avenger: 1 });
    expect(evaluateTitles(stats({ total: { royalFlush: 10 } })).royalFlush).toBe(10);
    expect(evaluateTitles(stats())).toEqual({});
    expect(getTitleFamily('avenger').group).toBe('hunter');
    for (const id of ['badBeat', 'cooler', 'tragicHero', 'quads', 'straightFlush', 'royalFlush']) {
      expect(getTitleFamily(id).group).toBe('hands');
    }
    for (const id of ['badBeat', 'tragicHero', 'straightFlush', 'royalFlush', 'avenger']) {
      expect(getTitleFamily(id).hidden).toBe(true);
    }
    expect(getTitleFamily('cooler').hidden).toBe(false);
    expect(getTitleFamily('quads').hidden).toBe(false);
  });

  it('a hand title from aggregated history unlocks but shows nothing until opted in', () => {
    const at = Date.parse('2026-07-22T20:00:00+08:00');
    const all = aggregateHistoryRecords('me', [
      { type: 'live', profit: 0, rate: 1, createdAt: at, handEvents: { badBeatWins: 1, quads: 1 } },
    ]).get('all');
    const built = buildUserTitles(null, all, at);
    expect(built.unlocked).toMatchObject({ badBeat: { tier: 1 }, quads: { tier: 1 } });
    expect(built.prefs.mode).toBe('off');
    expect(built.display).toBeNull();
  });

  it('works on real aggregated stats', () => {
    const at = Date.parse('2026-07-22T20:00:00+08:00');
    const records = Array.from({ length: 10 }, (_, i) => ({
      type: 'live', profit: 1000, rate: 1, baseBuyIn: 1000, createdAt: at + i * 1000, hostUid: 'me',
    }));
    const all = aggregateHistoryRecords('me', records).get('all');
    expect(evaluateTitles(all)).toMatchObject({
      regular: 2, host: 3, hotStreak: 7, netWin: 6, steady: 1,
    });
  });
});

describe('nextTierProgress', () => {
  it('reports the next goal and how far along', () => {
    const p = nextTierProgress('regular', stats({ total: { games: 25 } }));
    expect(p).toMatchObject({ value: 25, tier: 3, from: 20, maxed: false });
    expect(p.next).toMatchObject({ tier: 4, threshold: 30 });
    expect(p.ratio).toBeCloseTo(0.5);
  });

  it('starts above an already-unlocked tier even if the value dropped', () => {
    const p = nextTierProgress(getTitleFamily('netWin'), stats({ total: { profit: 8000 } }), 6);
    expect(p.tier).toBe(6);
    expect(p.next.threshold).toBe(15000);
    expect(p.ratio).toBe(0);
  });

  it('maxed at tier 10', () => {
    expect(nextTierProgress('champion', stats({ tournament: { champion: 51 } })))
      .toMatchObject({ tier: 10, next: null, maxed: true, ratio: 1 });
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

    const again = mergeUnlocked(unlocked, { regular: 9 }, 2000);
    expect(again.unlocked.regular).toEqual({ tier: 9, at: 2000 });
  });
});

describe('prefs and display', () => {
  const unlocked = {
    regular: { tier: 4, at: 100 },
    champion: { tier: 4, at: 300 },
    host: { tier: 2, at: 900 },
  };

  // 4 + 4 + 2 = 10 titles held → bronze (FRAME_MIN_BRONZE)
  it('auto: highest tier, ties go to the most recent', () => {
    expect(resolveDisplay(unlocked, { mode: 'auto', frame: 'auto' })).toEqual({ familyId: 'champion', tier: 4, frame: 'bronze' });
    expect(resolveDisplay({}, { mode: 'auto' })).toBeNull();
    expect(resolveTitle(unlocked, { mode: 'auto' })).toEqual({ familyId: 'champion', tier: 4 });
  });

  it('auto with tiers up to 10: a mythic tier beats everything below it', () => {
    const high = {
      ...unlocked,
      netWin: { tier: 8, at: 50 },
      hunter: { tier: 10, at: 10 },
      bubble: { tier: 9, at: 999 },
    };
    expect(resolveTitle(high, { mode: 'auto' })).toEqual({ familyId: 'hunter', tier: 10 });
    expect(resolveTitle({ ...high, hunter: { tier: 7, at: 10 } }, { mode: 'auto' })).toEqual({ familyId: 'bubble', tier: 9 });
  });

  it('off hides the title but keeps the frame; pick shows the chosen one (auto if it is not unlocked)', () => {
    expect(resolveDisplay(unlocked, { mode: 'off', frame: 'auto' })).toEqual({ familyId: null, tier: null, frame: 'bronze' });
    expect(resolveDisplay({ host: { tier: 1, at: 1 } }, { mode: 'off', frame: 'auto' })).toBeNull();
    expect(resolveDisplay(unlocked, { mode: 'pick', titleId: 'host', frame: 'auto' })).toEqual({ familyId: 'host', tier: 2, frame: 'bronze' });
    expect(resolveDisplay(unlocked, { mode: 'pick', titleId: 'nightOwl', frame: 'auto' })).toEqual({ familyId: 'champion', tier: 4, frame: 'bronze' });
    // A title but no frame yet
    expect(resolveDisplay({ host: { tier: 1, at: 1 } }, { mode: 'auto', frame: 'auto' })).toEqual({ familyId: 'host', tier: 1, frame: null });
  });

  it('opt-in: with no prefs set nothing shows, not even an earned frame', () => {
    expect(resolveDisplay(unlocked, null)).toBeNull();
    expect(resolveDisplay(unlocked, { mode: 'auto', frame: 'none' })).toEqual({ familyId: 'champion', tier: 4, frame: null });
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
  // Families at tier n hold n titles each, filled one family at a time
  const held = (n) => {
    const out = {};
    let left = n;
    for (const fam of TITLE_FAMILIES) {
      if (left <= 0) break;
      const tier = Math.min(TITLE_TIER_COUNT, left);
      out[fam.id] = { tier, at: 1 };
      left -= tier;
    }
    return out;
  };

  it('frames at 10 / 25 / 50 / 70 / 100 titles (set from the 2026-10 simulation)', () => {
    expect(FRAME_TIERS.map((f) => [f.id, f.min])).toEqual([
      ['bronze', 10], ['silver', 25], ['gold', 50], ['platinum', 70], ['diamond', 100],
    ]);
  });

  it('titleCount: every step reached is a title (tier n of ten = n titles)', () => {
    expect(titleCount(null)).toBe(0);
    expect(titleCount({})).toBe(0);
    expect(titleCount({ regular: { tier: 3, at: 1 }, host: { tier: 1, at: 1 } })).toBe(4);
    // Hidden families count their steps like the rest
    expect(titleCount({ mysteryTop: { tier: 3, at: 1 }, runnerUp: { tier: 10, at: 1 } })).toBe(13);
    // A family from a newer catalog counts its tier; bad entries count nothing
    expect(titleCount({ someNewFamily: { tier: 2, at: 1 }, broken: { tier: 0 }, junk: null })).toBe(2);
  });

  it('crowns and expiring entries never count (frames must not drop)', () => {
    expect(titleCount({ regular: { tier: 4, at: 1, expiresAt: 99 } })).toBe(0);
    expect(titleCount({ regular: { tier: 2, at: 1 }, monthlyCrown: { tier: 4, at: 1, expiresAt: 99 } })).toBe(2);
  });

  it('earnedFrame at each threshold', () => {
    expect(earnedFrame({})).toBeNull();
    expect(earnedFrame(held(9))).toBeNull();
    expect(earnedFrame(held(10))).toBe('bronze');
    expect(earnedFrame(held(24))).toBe('bronze');
    expect(earnedFrame(held(25))).toBe('silver');
    expect(earnedFrame(held(50))).toBe('gold');
    expect(earnedFrame(held(69))).toBe('gold');
    expect(earnedFrame(held(70))).toBe('platinum');
    expect(earnedFrame(held(100))).toBe('diamond');
    expect(earnedFrame(held(120))).toBe('diamond');
    expect(earnedFrames(held(50))).toEqual(['bronze', 'silver', 'gold']);
    expect(earnedFrames({})).toEqual([]);
  });

  it('the shown frame: picked while earned, else the highest earned', () => {
    expect(resolveFrame(held(50), null)).toBeNull();
    expect(resolveFrame(held(50), { frame: 'auto' })).toBe('gold');
    expect(resolveFrame(held(50), { frame: 'bronze' })).toBe('bronze');
    expect(resolveFrame(held(50), { frame: 'diamond' })).toBe('gold');
    expect(resolveFrame({}, { frame: 'bronze' })).toBeNull();
  });

  it('frames never drop: unlocked only grows', () => {
    const before = held(25);
    const { unlocked } = mergeUnlocked(before, {}, 5);
    expect(earnedFrame(unlocked)).toBe('silver');
  });
});

describe('buildUserTitles', () => {
  const L = TITLE_LADDER_VERSION;

  it('writes nothing for a user with no titles and no doc', () => {
    expect(buildUserTitles(null, stats(), 1).changed).toBe(false);
  });

  it('first unlock creates the doc on the ten-step ladders, shown nowhere until the player turns it on', () => {
    const next = buildUserTitles(null, stats({ total: { games: 10 } }), 5);
    expect(next.changed).toBe(true);
    expect(next.unlocked).toEqual({ regular: { tier: 2, at: 5 } });
    expect(next.ladder).toBe(L);
    expect(next.prefs).toEqual({ mode: 'off', titleId: null, showRoomTitles: false, frame: 'none' });
    expect(next.display).toBeNull();
  });

  it('unchanged stats → no write; keeps the user prefs', () => {
    const prev = {
      ladder: L,
      unlocked: { regular: { tier: 2, at: 5 } },
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
      ladder: L,
      // 5 + 5 = 10 titles: bronze
      unlocked: { regular: { tier: 5, at: 5 }, host: { tier: 5, at: 6 } },
      prefs: { mode: 'off', titleId: null, showRoomTitles: true, frame: 'auto' },
      display: null,
    };
    const s = stats({ total: { games: 50, hostedGames: 35 } });
    const next = buildUserTitles(prev, s, 9);
    expect(next.changed).toBe(true);
    expect(next.display).toEqual({ familyId: null, tier: null, frame: 'bronze' });
    expect(next.prefs.frame).toBe('auto');
    // Written once; the same again is no change
    expect(buildUserTitles({ ...prev, display: next.display }, s, 10).changed).toBe(false);
  });

  it('a new tier that crosses a frame threshold updates the frame', () => {
    const prev = {
      ladder: L,
      unlocked: { regular: { tier: 5, at: 5 }, host: { tier: 4, at: 6 } },
      prefs: { mode: 'auto', titleId: null, showRoomTitles: true, frame: 'auto' },
      display: { familyId: 'regular', tier: 5, frame: null },
    };
    // host 4 → 5: 10 titles held (FRAME_MIN_BRONZE)
    const next = buildUserTitles(prev, stats({ total: { games: 50, hostedGames: 35 } }), 9);
    expect(next.changed).toBe(true);
    expect(next.display).toEqual({ familyId: 'host', tier: 5, frame: 'bronze' });
  });

  it('rebuild: tiers can go down after a threshold change; earlier unlock times stay', () => {
    const prev = {
      ladder: L,
      unlocked: {
        regular: { tier: 5, at: 5 }, // given by an older, lower threshold
        host: { tier: 1, at: 6 },
        bubble: { tier: 3, at: 7 }, // no longer reached at all
        someNewFamily: { tier: 2, at: 8 }, // a newer catalog: left alone
      },
      prefs: { mode: 'pick', titleId: 'bubble', showRoomTitles: true, frame: 'auto' },
      display: { familyId: 'bubble', tier: 3, frame: null },
    };
    const s = stats({ total: { games: 10, hostedGames: 5 }, tournament: { bubble: 0 } });
    // The normal path only adds
    expect(buildUserTitles(prev, s, 9).unlocked.regular).toEqual({ tier: 5, at: 5 });

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

describe('docs from before the ten-step ladders (old 1..4 tiers)', () => {
  it('legacyTier: where the old step\'s threshold lands on the new ladder (at least 1)', () => {
    // netWin 1-2-3-4 were 2000 / 5000 / 10000 / 30000
    expect([1, 2, 3, 4].map((t) => legacyTier('netWin', t))).toEqual([3, 4, 6, 8]);
    // regular 10 / 40 / 100 / 200 games
    expect([1, 2, 3, 4].map((t) => legacyTier('regular', t))).toEqual([2, 4, 6, 8]);
    // Single-step families: their old step was 1 (or 5 / 10) of something
    expect(legacyTier('royalFlush', 4)).toBe(1);
    expect(legacyTier('avenger', 3)).toBe(1);
    expect(legacyTier('bubble', 3)).toBe(5);
    expect(legacyTier('nightOwl', 3)).toBe(4);
    // mysteryTop went 2-3-4 over 1 / 3 / 10
    expect([2, 3, 4].map((t) => legacyTier('mysteryTop', t))).toEqual([1, 3, 8]);
    // Unknown families keep their number (capped)
    expect(legacyTier('someNewFamily', 3)).toBe(3);
  });

  it('upgradeTitlesDoc maps stats tiers, drops the stored display, keeps the rest', () => {
    const old = {
      unlocked: {
        netWin: { tier: 4, at: 3 },
        someNewFamily: { tier: 2, at: 4 },
        broken: null,
      },
      prefs: { mode: 'pick', titleId: 'netWin' },
      crowns: { crownHunter: '2026-10' },
      display: { familyId: 'netWin', tier: 4, frame: null },
      pals: ['amy'],
    };
    const up = upgradeTitlesDoc(old);
    expect(up).toEqual({
      unlocked: { netWin: { tier: 8, at: 3 }, someNewFamily: { tier: 2, at: 4 }, broken: null },
      prefs: old.prefs,
      crowns: old.crowns,
      display: null,
      pals: ['amy'],
      ladder: TITLE_LADDER_VERSION,
    });
    // Already on the ladders (or nothing at all): as is
    const current = { ...up, display: { familyId: 'netWin', tier: 8, frame: null } };
    expect(upgradeTitlesDoc(current)).toBe(current);
    expect(upgradeTitlesDoc(null)).toBeNull();
  });

  it('client: an old doc shows the mapped tier (same rarity band as before), never the old number', () => {
    const old = {
      unlocked: { netWin: { tier: 4, at: 3 }, regular: { tier: 4, at: 1 } },
      prefs: { mode: 'pick', titleId: 'netWin', frame: 'auto' },
      display: { familyId: 'netWin', tier: 4, frame: null },
    };
    const shown = effectiveDisplay(old, '2026-10');
    // 賭神 (old legendary 4) → 富可敵國 (8, legendary); with regular 4 → 8: 16 titles
    expect(shown).toEqual({ familyId: 'netWin', tier: 8, frame: earnedFrame({ netWin: { tier: 8 }, regular: { tier: 8 } }) });
    expect(shown.frame).toBe('bronze');
    expect(frontend.titleRarity(shown.tier)).toBe('legendary');
  });

  it('rebuildUnlocked from the old numbering: up or down, the time kept unless the tier rose', () => {
    const old = {
      unlocked: {
        regular: { tier: 3, at: 5 }, // 100 games → 6
        champion: { tier: 4, at: 6 }, // 12 wins → 6
        avenger: { tier: 3, at: 7 }, // 1 → 1
        hunter: { tier: 1, at: 8 }, // 5 → 5
        crownHunter: { tier: 4, at: 9 }, // not judged here: kept
      },
      prefs: { mode: 'pick', titleId: 'champion', showRoomTitles: true, frame: 'none' },
      display: { familyId: 'champion', tier: 4, frame: null },
    };
    const s = stats({
      total: { games: 105, revenge: 1 },
      tournament: { champion: 7, knockouts: 7 },
    });
    const next = buildUserTitles(old, s, 99, { rebuild: true });
    expect(next.changed).toBe(true);
    expect(next.ladder).toBe(TITLE_LADDER_VERSION);
    expect(next.unlocked).toEqual({
      regular: { tier: 6, at: 5 }, // same as mapped: time kept
      champion: { tier: 5, at: 6 }, // lower than mapped: down, time kept
      avenger: { tier: 1, at: 7 },
      hunter: { tier: 6, at: 99 }, // higher than mapped: newly reached
      crownHunter: { tier: 4, at: 9 },
    });
    expect(next.upgraded).toEqual([{ familyId: 'hunter', tier: 6 }]);
    // Prefs untouched, the pick still resolves
    expect(next.prefs).toEqual(old.prefs);
    expect(next.display).toEqual({ familyId: 'champion', tier: 5, frame: null });
    // Opt-in stays: an old doc that never turned titles on still shows nothing
    const off = buildUserTitles({ ...old, prefs: undefined, display: null }, s, 99, { rebuild: true });
    expect(off.prefs.mode).toBe('off');
    expect(off.display).toBeNull();
    // A plain recompute (no rebuild) of an old doc maps too, and gets written
    const merged = buildUserTitles(old, s, 99);
    expect(merged.changed).toBe(true);
    expect(merged.unlocked.champion).toEqual({ tier: 6, at: 6 });
    // The rebuilt doc is stable
    const stored = { ...old, ladder: next.ladder, unlocked: next.unlocked, display: next.display };
    expect(buildUserTitles(stored, s, 100, { rebuild: true }).changed).toBe(false);
    // rebuildUnlocked itself works on whatever numbering it is given
    expect(rebuildUnlocked({ regular: { tier: 6, at: 5 } }, { regular: 6 }, 1).unlocked).toEqual({ regular: { tier: 6, at: 5 } });
  });

  it('a crown update on an old doc resolves its display on the new ladders', () => {
    const old = {
      unlocked: { regular: { tier: 4, at: 1 } },
      prefs: { mode: 'auto', frame: 'none' },
      display: { familyId: 'regular', tier: 4, frame: null },
    };
    const lost = buildCrownUpdate(old, [['2026-10', []]], '2026-10');
    expect(lost.display).toEqual({ familyId: 'regular', tier: 8, frame: null });
  });
});

describe('simulate_title_tiers (pure part)', () => {
  it('counts players per tier and the titleCount spread', () => {
    const docs = [
      stats({ total: { games: 105, hostedGames: 72 } }), // regular 6, host 6 → 12
      stats({ total: { games: 10 } }), // regular 2 → 2
      stats(), // nothing → 0
      null,
    ];
    const summary = summarizeTitleTiers(docs);
    expect(summary.players).toBe(3);
    const regular = summary.families.find((f) => f.id === 'regular');
    expect(regular.reached).toEqual([2, 2, 1, 1, 1, 1, 0, 0, 0, 0]);
    expect(regular.top).toBe(105);
    expect(summary.families.find((f) => f.id === 'nightOwl').hidden).toBe(true);
    expect(summary.counts).toEqual([0, 2, 12]);
    expect(summary.histogram).toEqual({ 0: 1, 2: 1, 12: 1 });
    expect(summary.percentiles).toMatchObject({ p50: 2, p100: 12 });
    // Players per frame: whoever holds at least each frame's min
    expect(summary.frames.map((f) => [f.id, f.min, f.players])).toEqual(
      FRAME_TIERS.map((f) => [f.id, f.min, [0, 2, 12].filter((n) => n >= f.min).length]),
    );
    expect(summary.frames[0]).toMatchObject({ id: 'bronze', players: 1 });
    const text = formatTitleTierSummary(summary).join('\n');
    expect(text).toContain('Players: 3');
    expect(text).toMatch(/regular\s+2\s+2\s+1\s+1\s+1\s+1\s+0\s+0\s+0\s+0\s+105/);
    expect(summarizeTitleTiers([]).percentiles.p50).toBe(0);
    expect(percentile([1, 2, 3, 4], 75)).toBe(3);
  });

  it('the script only reads', () => {
    const src = readFileSync(resolve(__dirname, '../functions/scripts/simulate_title_tiers.js'), 'utf-8');
    expect(src).toContain(".where('period', '==', 'all').get()");
    expect(src).not.toMatch(/\.(set|update|delete|add|batch|runTransaction)\(/);
  });
});
