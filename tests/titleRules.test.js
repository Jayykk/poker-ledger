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
  FRAME_IDS,
  THEME_FRAMES,
  THEME_FRAME_IDS,
  THEME_FRAME_MIN_TIER,
  ALL_FRAME_IDS,
  getThemeFrame,
  earnedThemeFrames,
  isFrameEarned,
  TITLE_NAME_SETS,
  DEFAULT_TITLE_PREFS,
  displayNameSet,
  sameDisplay,
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
      for (const frame of [...FRAME_TIERS, ...THEME_FRAMES]) expect(get(`titles.frames.${frame.id}`), `${locale} frame ${frame.id}`).toBeTruthy();
      expect(new Set(ALL_FRAME_IDS.map((id) => get(`titles.frames.${id}`))).size, `${locale} frame names`).toBe(ALL_FRAME_IDS.length);
      // No name left over from a frame that is gone
      expect(Object.keys(get('titles.frames')).sort(), `${locale} frame keys`).toEqual([...ALL_FRAME_IDS].sort());
      for (const key of ['frameTiers', 'frameThemes', 'frameEarnedOnly', 'frameHowMore', 'frameNoneOfKind']) {
        expect(get(`titles.${key}`), `${locale} titles.${key}`).toBeTruthy();
      }
      expect(get('titles.frameNoneOfKind')).toContain('{kind}');
      expect(get('titles.codexDetail.howTheme')).toContain('{name}');
      for (const key of ['fxLite', 'fxLiteHint']) expect(get(`profile.${key}`), `${locale} profile.${key}`).toBeTruthy();
      // Player-facing frame text never says 輸
      for (const key of ['frames', 'codexDetail']) {
        expect(JSON.stringify(get(`titles.${key}`)), `${locale} titles.${key}`).not.toMatch(/[輸输]/);
      }
      for (const rarity of frontend.TITLE_RARITIES) {
        expect(get(`titles.rarity.${rarity}`), `${locale} rarity ${rarity}`).toBeTruthy();
      }
      for (const key of ['frame', 'frameAuto', 'frameNone', 'titleCount', 'room.live', 'stepsOf']) {
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

  it('wallet: the games won and the games given add up apart; biggest single game in 組', () => {
    const ladder = [1000, 2000, 4000, 7000, 12000, 20000, 30000, 45000, 70000, 100000];
    expect(TITLE_LADDERS.netWin).toEqual(ladder);
    expect(TITLE_LADDERS.netLoss).toEqual(ladder);
    expect(evaluateTitles(stats({ total: { grossWon: 999 } })).netWin).toBeUndefined();
    expect(evaluateTitles(stats({ total: { grossWon: 1000 } })).netWin).toBe(1);
    expect(evaluateTitles(stats({ total: { grossWon: 100000 } })).netWin).toBe(10);
    expect(evaluateTitles(stats({ total: { grossGiven: 999 } })).netLoss).toBeUndefined();
    expect(evaluateTitles(stats({ total: { grossGiven: 100000 } })).netLoss).toBe(10);
    // Up and down by the same: a net of 0 still reaches both
    expect(evaluateTitles(stats({ total: { profit: 0, grossWon: 12000, grossGiven: 12000 } })))
      .toMatchObject({ netWin: 5, netLoss: 5 });
    // The metric is the gross, not the net
    const s = stats({ total: { profit: 3000, grossWon: 38000, grossGiven: 35000 } });
    expect(getTitleFamily('netWin').metric(s)).toBe(38000);
    expect(getTitleFamily('netLoss').metric(s)).toBe(35000);
    const big = evaluateTitles(stats({ total: { maxWinGroups: 10, maxLossGroups: 3 } }));
    expect(big.bigWin).toBe(6);
    expect(big.bigLoss).toBe(2);
  });

  it('wallet on a stats doc from before grossWon / grossGiven: the net, until the backfill', () => {
    expect(getTitleFamily('netWin').metric(stats({ total: { profit: 1500 } }))).toBe(1500);
    expect(getTitleFamily('netLoss').metric(stats({ total: { profit: 1500 } }))).toBe(0);
    expect(getTitleFamily('netLoss').metric(stats({ total: { profit: -2500 } }))).toBe(2500);
    expect(evaluateTitles(stats({ total: { profit: 999 } })).netWin).toBeUndefined();
    expect(evaluateTitles(stats({ total: { profit: 1000 } })).netWin).toBe(1);
    expect(evaluateTitles(stats({ total: { profit: -100000 } })).netLoss).toBe(10);
    expect(evaluateTitles({ total: {} })).toEqual({});
    expect(evaluateTitles({})).toEqual({});
    // A stored 0 is a value, not a missing field
    expect(getTitleFamily('netWin').metric(stats({ total: { profit: 5000, grossWon: 0 } }))).toBe(0);
  });

  it('today\'s leaders sit around tier 5–7, tier 1 is an easy first taste', () => {
    const top = evaluateTitles(stats({
      total: {
        games: 105, hostedGames: 72, profit: 12500, grossWon: 38000, grossGiven: 25500,
        maxWinGroups: 12.95, maxLossGroups: 9.1, winStreakBest: 8, lossStreakBest: 12,
      },
      tournament: { champion: 7, itm: 12, rebuyCount: 14, runnerUp: 6, bubble: 5, firstOut: 5, knockouts: 5 },
    }));
    expect(top).toMatchObject({
      regular: 6, host: 6, netWin: 7, bigWin: 6, bigLoss: 6, hotStreak: 6, coldStreak: 6,
      champion: 5, itm: 5, rebuyer: 5, runnerUp: 5, bubble: 5, firstOut: 5, hunter: 5,
    });
    // Production highs (2026-11): Σ won 38K → 7, Σ given 47K → 8
    expect(evaluateTitles(stats({ total: { grossGiven: 47000 } })).netLoss).toBe(8);
    const first = evaluateTitles(stats({ total: { games: 5, hostedGames: 3 }, tournament: { champion: 1, itm: 1 } }));
    expect(first).toMatchObject({ regular: 1, host: 1, champion: 1, itm: 1 });
  });

  it('volatility needs 10 games with a 組 size; steady also needs a net profit', () => {
    // 10 games of ±3 組 → σ = 3
    const swingy = { groupGames: 10, sumGroups: 0, sumSqGroups: 90 };
    expect(evaluateTitles(stats({ total: { games: 10, ...swingy } })).volatile).toBe(7);
    expect(evaluateTitles(stats({ total: { games: 9, ...swingy, groupGames: 9, sumSqGroups: 81 } })).volatile)
      .toBeUndefined();

    // 20 games of +0.5 組 → σ = 0, profitable
    const calm = { games: 20, groupGames: 20, sumGroups: 10, sumSqGroups: 5, profit: 100 };
    expect(evaluateTitles(stats({ total: calm })).steady).toBe(3);
    expect(evaluateTitles(stats({ total: { ...calm, profit: -1 } })).steady).toBeUndefined();
    expect(evaluateTitles(stats({ total: { ...swingy, games: 50, profit: 100 } })).steady).toBeUndefined();
    // σ = 2.5 still counts as steady (under 2.6), σ = 2.6 does not
    const sd = (v) => ({ games: 10, groupGames: 10, sumGroups: 0, sumSqGroups: 10 * v * v, profit: 100 });
    expect(evaluateTitles(stats({ total: sd(2.5) })).steady).toBe(1);
    expect(evaluateTitles(stats({ total: sd(2.6) })).steady).toBeUndefined();
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
      regular: 2, host: 3, hotStreak: 7, netWin: 4, steady: 1,
    });
    expect(all.total).toMatchObject({ grossWon: 10000, grossGiven: 0 });
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
    expect(p.next.threshold).toBe(30000);
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
    expect(normalizeTitlePrefs(null)).toEqual({ mode: 'off', titleId: null, titleTier: null, showRoomTitles: false, frame: 'none', nameSet: 'classic' });
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
    // Only the name style (or a picked step) changed: still the player's choice
    // (Codex review on #274: a rerun of the migration would have reset it)
    expect(isLegacyDefaultPrefs({ mode: 'auto', showRoomTitles: true, frame: 'auto', nameSet: 'chuuni' })).toBe(false);
    expect(isLegacyDefaultPrefs({ mode: 'auto', showRoomTitles: true, frame: 'auto', titleTier: 3 })).toBe(false);
    expect(isLegacyDefaultPrefs({ mode: 'auto', showRoomTitles: true, frame: 'auto', nameSet: 'classic', titleTier: null })).toBe(true);
  });

  it('validates setTitlePrefs input', () => {
    expect(validateTitlePrefs({ mode: 'pick', titleId: 'host' }, null, unlocked).prefs)
      .toEqual({ mode: 'pick', titleId: 'host', titleTier: null, showRoomTitles: false, frame: 'none', nameSet: 'classic' });
    expect(validateTitlePrefs({ mode: 'pick', titleId: 'nightOwl' }, null, unlocked).error).toBe('not-unlocked');
    expect(validateTitlePrefs({ mode: 'pick' }, null, unlocked).error).toBe('not-unlocked');
    expect(validateTitlePrefs({ mode: 'loud' }, null, unlocked).error).toBe('bad-mode');
    expect(validateTitlePrefs({ titleId: 7 }, null, unlocked).error).toBe('bad-title');
    expect(validateTitlePrefs({ showRoomTitles: 'yes' }, null, unlocked).error).toBe('bad-toggle');
    // Fields left out keep their stored value
    expect(validateTitlePrefs({ showRoomTitles: false }, { mode: 'off', titleId: 'host', frame: 'bronze' }, unlocked).prefs)
      .toEqual({ mode: 'off', titleId: 'host', titleTier: null, showRoomTitles: false, frame: 'bronze', nameSet: 'classic' });
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

  it('titleTier: an integer 1..10 is kept, anything else is null (the highest)', () => {
    expect(normalizeTitlePrefs({ titleTier: 3 }).titleTier).toBe(3);
    expect(normalizeTitlePrefs({ titleTier: 10 }).titleTier).toBe(10);
    for (const bad of [0, 11, 2.5, '3', -1, null, undefined, NaN, {}]) {
      expect(normalizeTitlePrefs({ titleTier: bad }).titleTier, String(bad)).toBeNull();
    }
    expect(frontend.pickedTitleTier(6, 2)).toBe(2);
    expect(frontend.pickedTitleTier(6, null)).toBe(6);
    // Never above the tier reached
    expect(frontend.pickedTitleTier(4, 7)).toBe(4);
  });

  it('validates titleTier: a reached step of the picked family', () => {
    // regular is at 4: steps 1..4
    const pick = (input, current = null) => validateTitlePrefs(input, current, unlocked);
    expect(pick({ mode: 'pick', titleId: 'regular', titleTier: 2 }).prefs)
      .toMatchObject({ mode: 'pick', titleId: 'regular', titleTier: 2 });
    expect(pick({ mode: 'pick', titleId: 'regular', titleTier: 4 }).prefs.titleTier).toBe(4);
    expect(pick({ mode: 'pick', titleId: 'regular', titleTier: null }).prefs.titleTier).toBeNull();
    expect(pick({ mode: 'pick', titleId: 'regular', titleTier: 5 }).error).toBe('tier-locked');
    expect(pick({ mode: 'pick', titleId: 'regular', titleTier: 0 }).error).toBe('bad-tier');
    expect(pick({ mode: 'pick', titleId: 'regular', titleTier: '2' }).error).toBe('bad-tier');
    expect(pick({ mode: 'pick', titleId: 'regular', titleTier: 1.5 }).error).toBe('bad-tier');
    // A step with nothing picked
    expect(pick({ titleTier: 1 }).error).toBe('tier-locked');
    // A step alone changes the step of the stored pick
    const stored = { mode: 'pick', titleId: 'regular', titleTier: 3 };
    expect(pick({ titleTier: 1 }, stored).prefs).toMatchObject({ titleId: 'regular', titleTier: 1 });
    // Another family without a step: back to its highest
    expect(pick({ mode: 'pick', titleId: 'host' }, stored).prefs).toMatchObject({ titleId: 'host', titleTier: null });
    // The same family again (re-entering 指定): the step stays
    expect(pick({ mode: 'pick', titleId: 'regular' }, { ...stored, mode: 'auto' }).prefs.titleTier).toBe(3);
    // Other prefs leave it alone
    expect(pick({ frame: 'bronze' }, stored).prefs.titleTier).toBe(3);
    expect(pick({ mode: 'off' }, stored).prefs).toMatchObject({ mode: 'off', titleId: 'regular', titleTier: 3 });
  });

  it('pick shows the picked step; auto still the highest', () => {
    const prefs = { mode: 'pick', titleId: 'regular', titleTier: 2, frame: 'auto' };
    expect(resolveTitle(unlocked, prefs)).toEqual({ familyId: 'regular', tier: 2 });
    // Rarity follows the step shown (2: common, though regular is at 4: rare)
    expect(frontend.titleRarity(resolveTitle(unlocked, prefs).tier)).toBe('common');
    expect(resolveDisplay(unlocked, prefs)).toEqual({ familyId: 'regular', tier: 2, frame: 'bronze' });
    expect(resolveTitle(unlocked, { ...prefs, titleTier: null })).toEqual({ familyId: 'regular', tier: 4 });
    expect(resolveTitle(unlocked, { ...prefs, mode: 'auto' })).toEqual({ familyId: 'champion', tier: 4 });
  });

  it('a rebuild that lowers the family below the picked step clamps it', () => {
    const prefs = { mode: 'pick', titleId: 'regular', titleTier: 4 };
    expect(resolveTitle({ ...unlocked, regular: { tier: 2, at: 100 } }, prefs)).toEqual({ familyId: 'regular', tier: 2 });
    const prev = {
      ladder: TITLE_LADDER_VERSION,
      unlocked: { regular: { tier: 6, at: 1 } },
      prefs: { mode: 'pick', titleId: 'regular', titleTier: 5, frame: 'none' },
      display: { familyId: 'regular', tier: 5, frame: null },
    };
    // 20 games: regular 3 now
    const next = buildUserTitles(prev, stats({ total: { games: 20 } }), 9, { rebuild: true });
    expect(next.prefs.titleTier).toBe(5);
    expect(next.display).toEqual({ familyId: 'regular', tier: 3, frame: null });
    // The client re-resolves a stale stored display with the same rules
    expect(effectiveDisplay({ ...prev, unlocked: next.unlocked, display: { familyId: 'regular', tier: 5 } }, '2026-11'))
      .toEqual({ familyId: 'regular', tier: 3, frame: null });
  });

  it('crowns ignore titleTier', () => {
    // Won in October, worn in November
    const crownCtx = { crowns: { crownHunter: '2026-10' }, month: '2026-11' };
    const v = validateTitlePrefs({ mode: 'pick', titleId: 'crownHunter', titleTier: 2 }, null, unlocked, crownCtx);
    expect(v.prefs).toMatchObject({ titleId: 'crownHunter', titleTier: null });
    // Even a stored step shows the crown's one step
    const shown = resolveTitle(unlocked, { mode: 'pick', titleId: 'crownHunter', titleTier: 2 }, crownCtx);
    expect(shown).toEqual({ familyId: 'crownHunter', tier: 4, month: '2026-11' });
  });
});

describe('名稱風格 (name sets)', () => {
  const unlocked = { regular: { tier: 4, at: 100 }, champion: { tier: 6, at: 50 } };
  const MONTH = '2026-11';
  // Won in October, worn in November (MONTH)
  const crownCtx = { crowns: { crownHunter: '2026-10' }, month: MONTH };

  it('prefs.nameSet: classic by default, anything unknown is classic', () => {
    expect(TITLE_NAME_SETS).toEqual(['classic', 'chuuni']);
    expect(DEFAULT_TITLE_PREFS.nameSet).toBe('classic');
    expect(normalizeTitlePrefs({ nameSet: 'chuuni' }).nameSet).toBe('chuuni');
    expect(normalizeTitlePrefs({ nameSet: 'classic' }).nameSet).toBe('classic');
    for (const bad of ['Chuuni', 'emo', '', null, undefined, 1, true, {}, ['chuuni']]) {
      expect(normalizeTitlePrefs({ nameSet: bad }).nameSet, String(bad)).toBe('classic');
    }
  });

  it('validates nameSet; the other prefs stay, and it stays when they change', () => {
    const stored = { mode: 'pick', titleId: 'regular', titleTier: 2, showRoomTitles: true, frame: 'none' };
    expect(validateTitlePrefs({ nameSet: 'chuuni' }, stored, unlocked).prefs)
      .toEqual({ ...stored, nameSet: 'chuuni' });
    expect(validateTitlePrefs({ nameSet: 'classic' }, { ...stored, nameSet: 'chuuni' }, unlocked).prefs.nameSet).toBe('classic');
    for (const bad of ['emo', '', null, 2, false, ['chuuni']]) {
      expect(validateTitlePrefs({ nameSet: bad }, stored, unlocked).error, String(bad)).toBe('bad-name-set');
    }
    // Left out: kept
    expect(validateTitlePrefs({ mode: 'auto' }, { ...stored, nameSet: 'chuuni' }, unlocked).prefs.nameSet).toBe('chuuni');
    expect(validateTitlePrefs({ showRoomTitles: false }, null, unlocked).prefs.nameSet).toBe('classic');
    // With titles off, or nothing unlocked: still a pref the player can set
    expect(validateTitlePrefs({ nameSet: 'chuuni' }, null, {}).prefs).toMatchObject({ mode: 'off', nameSet: 'chuuni' });
    // A picked crown that has since gone does not block it
    expect(validateTitlePrefs({ nameSet: 'chuuni' }, { mode: 'pick', titleId: 'crownHunter' }, unlocked).prefs.nameSet).toBe('chuuni');
  });

  it('the display carries the set of a shown title; classic leaves it out (as before name sets)', () => {
    expect(resolveDisplay(unlocked, { mode: 'auto', nameSet: 'chuuni' }))
      .toEqual({ familyId: 'champion', tier: 6, frame: null, nameSet: 'chuuni' });
    expect(resolveDisplay(unlocked, { mode: 'pick', titleId: 'regular', titleTier: 2, nameSet: 'chuuni' }))
      .toEqual({ familyId: 'regular', tier: 2, frame: null, nameSet: 'chuuni' });
    expect(resolveDisplay(unlocked, { mode: 'auto', nameSet: 'classic' }))
      .toEqual({ familyId: 'champion', tier: 6, frame: null });
    expect(resolveDisplay(unlocked, { mode: 'auto' })).toEqual({ familyId: 'champion', tier: 6, frame: null });
    expect(resolveDisplay(unlocked, { mode: 'auto', nameSet: 'emo' })).toEqual({ familyId: 'champion', tier: 6, frame: null });
  });

  it('no title shown, no set: off, a frame alone, and crowns (one set of names)', () => {
    expect(resolveDisplay(unlocked, { mode: 'off', nameSet: 'chuuni' })).toBeNull();
    const many = Object.fromEntries(TITLE_FAMILIES.slice(0, 5).map((f) => [f.id, { tier: 2, at: 1 }]));
    expect(resolveDisplay(many, { mode: 'off', frame: 'auto', nameSet: 'chuuni' }))
      .toEqual({ familyId: null, tier: null, frame: 'bronze' });
    // Auto and a picked crown: the crown, classic
    expect(resolveDisplay(unlocked, { mode: 'auto', nameSet: 'chuuni' }, crownCtx))
      .toEqual({ familyId: 'crownHunter', tier: 4, frame: null, month: MONTH });
    expect(resolveDisplay(unlocked, { mode: 'pick', titleId: 'crownHunter', nameSet: 'chuuni' }, crownCtx))
      .toEqual({ familyId: 'crownHunter', tier: 4, frame: null, month: MONTH });
    // A picked normal title under a held crown: in the set again
    expect(resolveDisplay(unlocked, { mode: 'pick', titleId: 'regular', nameSet: 'chuuni' }, crownCtx))
      .toEqual({ familyId: 'regular', tier: 4, frame: null, nameSet: 'chuuni' });
  });

  it('displayNameSet: classic unless the display says otherwise, always classic for a crown', () => {
    expect(displayNameSet({ familyId: 'regular', tier: 2, nameSet: 'chuuni' })).toBe('chuuni');
    expect(displayNameSet({ familyId: 'regular', tier: 2 })).toBe('classic');
    expect(displayNameSet({ familyId: 'regular', tier: 2, nameSet: 'emo' })).toBe('classic');
    expect(displayNameSet({ familyId: 'crownHunter', tier: 4, nameSet: 'chuuni' })).toBe('classic');
    expect(displayNameSet({ familyId: null, tier: null, frame: 'gold', nameSet: 'chuuni' })).toBe('classic');
    expect(displayNameSet(null)).toBe('classic');
  });

  it('sameDisplay compares the set; none is classic', () => {
    const d = { familyId: 'regular', tier: 2, frame: null };
    expect(sameDisplay(d, { ...d, nameSet: 'classic' })).toBe(true);
    expect(sameDisplay(d, { ...d })).toBe(true);
    expect(sameDisplay(d, { ...d, nameSet: 'chuuni' })).toBe(false);
    expect(sameDisplay({ ...d, nameSet: 'chuuni' }, { ...d, nameSet: 'chuuni' })).toBe(true);
    expect(sameDisplay({ ...d, nameSet: 'chuuni' }, null)).toBe(false);
    expect(sameDisplay(null, null)).toBe(true);
  });

  it('a stored display keeps its set for viewers; a re-resolved one takes it from the prefs', () => {
    const stored = { familyId: 'regular', tier: 4, frame: null, nameSet: 'chuuni' };
    const doc = { ladder: TITLE_LADDER_VERSION, unlocked, prefs: { mode: 'pick', titleId: 'regular', nameSet: 'chuuni' }, display: stored };
    expect(effectiveDisplay(doc, MONTH)).toBe(stored);
    // A crown worn in October (won in September) went stale: back to the title, in the set
    const stale = { ...doc, prefs: { mode: 'auto', nameSet: 'chuuni' }, crowns: { crownHunter: '2026-09' }, display: { familyId: 'crownHunter', tier: 4, frame: null, month: '2026-10' } };
    expect(effectiveDisplay(stale, MONTH)).toEqual({ familyId: 'champion', tier: 6, frame: null, nameSet: 'chuuni' });
  });

  it('a crown verdict keeps the set of the title it falls back to', () => {
    const stored = {
      ladder: TITLE_LADDER_VERSION,
      unlocked,
      prefs: { mode: 'auto', frame: 'none', nameSet: 'chuuni' },
      // Won in September, worn in October
      crowns: { crownHunter: '2026-09' },
      display: { familyId: 'crownHunter', tier: 4, frame: null, month: '2026-10' },
    };
    const lost = buildCrownUpdate(stored, [[MONTH, []]], MONTH);
    expect(lost.display).toEqual({ familyId: 'champion', tier: 6, frame: null, nameSet: 'chuuni' });
    // Leading November wears nothing yet
    const leading = buildCrownUpdate(stored, [[MONTH, ['crownHunter']]], MONTH);
    expect(leading.display).toEqual({ familyId: 'champion', tier: 6, frame: null, nameSet: 'chuuni' });
    // Won in October: worn now
    const won = buildCrownUpdate({ ...stored, crowns: { crownHunter: '2026-10' } }, [[MONTH, []]], MONTH);
    expect(won.display).toEqual({ familyId: 'crownHunter', tier: 4, frame: null, month: MONTH });
  });
});

describe('中二版 names (titles.familiesChuuni)', () => {
  const chuuni = (locale) => messagesOf(locale).titles.familiesChuuni;

  it('every family has ten distinct names in every locale, and nothing else is in there', () => {
    const ids = TITLE_FAMILIES.map((f) => f.id).sort();
    const steps = Array.from({ length: TITLE_TIER_COUNT }, (_, i) => `t${i + 1}`);
    for (const locale of LOCALES) {
      const set = chuuni(locale);
      // Stats families only: crowns and room titles have one set of names
      expect(Object.keys(set).sort(), locale).toEqual(ids);
      for (const id of ids) {
        expect(Object.keys(set[id]), `${locale}: ${id}`).toEqual(steps);
        const names = Object.values(set[id]);
        for (const name of names) {
          expect(typeof name === 'string' && name.trim() === name && name.length > 0, `${locale}: ${id} ${name}`).toBe(true);
        }
        expect(new Set(names).size, `${locale}: ${id} names`).toBe(TITLE_TIER_COUNT);
      }
    }
  });

  it('Chinese names: at most 8 characters, never 輸', () => {
    for (const locale of ['zh-TW', 'zh-CN']) {
      for (const [id, fam] of Object.entries(chuuni(locale))) {
        for (const [step, name] of Object.entries(fam)) {
          expect([...name].length, `${locale}: ${id} ${step} ${name}`).toBeLessThanOrEqual(8);
          expect(name, `${locale}: ${id} ${step}`).not.toMatch(/[輸输]/);
        }
      }
    }
  });

  it('zh-TW is the approved table; zh-CN the same names in Simplified', () => {
    const tw = chuuni('zh-TW');
    const cn = chuuni('zh-CN');
    const row = (set, id) => Object.values(set[id]).join(' ');
    expect(tw.badBeat.t10).toBe('萬惡的卑鄙之王');
    expect(tw.royalFlush.t10).toBe('天選之人');
    expect(row(tw, 'netWin')).toBe('微光拾金者 黃金的學徒 聚財術士 黃金鍊成師 財富召喚師 金脈支配者 點金之魔手 黃金鄉領主 財貨的魔王 黃金律之主');
    expect(row(tw, 'netLoss')).toBe('慷慨的旅人 施予之徒 散金的賢者 恩賜祭司 豐饒的供奉者 萬財施主 聖財的守護者 無盡寶庫之主 施予的聖王 豐饒之神格');
    expect(row(tw, 'bigLoss')).toBe('豪邁的一擲 烈焰揮金 千金狂想曲 豪奢的宴主 萬金之雨 散華的貴公子 黃金雨的召喚者 財寶散華仙 萬金歸塵之王 散財的神格');
    expect(row(tw, 'coldStreak')).toBe('蓄勢的潛龍 越挫越勇者 屢戰不退之人 永不言棄者 百折不撓 鋼鐵的意志 臥薪嚐膽者 堅忍的修行者 不滅的鬥魂 永劫不滅之魂');
    expect(row(tw, 'nightOwl')).toBe('夜行的貓 夜歸的旅人 暗夜行者 午夜的牌客 不夜城之主 暗夜騎士 月下的賭俠 夜之帝王 永夜的君主 月神');
    expect(tw.steady.t10).toBe('絕對零度的支配者');
    expect(tw.hunter.t10).toBe('冥界之王');
    expect(tw.champion.t10).toBe('萬王之王');
    expect(tw.bubble.t10).toBe('泡沫宇宙的創造者');
    expect(tw.quads.t1).toBe('四天王降臨');
    expect(tw.host.t1).toBe('開局之人');
    expect(tw.regular.t10).toBe('與牌桌同化者');
    expect(tw.hotStreak.t10).toBe('不敗的絕對王權');
    // Simplified: the same name, character for character
    expect(cn.badBeat.t10).toBe('万恶的卑鄙之王');
    expect(cn.royalFlush.t10).toBe('天选之人');
    expect(cn.netWin.t10).toBe('黄金律之主');
    expect(cn.steady.t10).toBe('绝对零度的支配者');
    for (const [id, fam] of Object.entries(tw)) {
      for (const [step, name] of Object.entries(fam)) {
        expect([...cn[id][step]].length, `${id} ${step}`).toBe([...name].length);
      }
    }
  });

  it('the switch has its strings in every locale', () => {
    for (const locale of LOCALES) {
      const titles = messagesOf(locale).titles;
      for (const key of ['nameSet', 'nameSetClassic', 'nameSetChuuni', 'nameSetHint']) {
        expect(titles[key], `${locale} titles.${key}`).toBeTruthy();
      }
    }
  });

  it('nameSetKey / titleName: the set\'s name, the classic one when it has none', () => {
    expect(frontend.nameSetKey('regular', 3, 'chuuni')).toBe('titles.familiesChuuni.regular.t3');
    expect(frontend.nameSetKey('regular', 3, 'classic')).toBeNull();
    expect(frontend.nameSetKey('regular', 3, undefined)).toBeNull();
    expect(frontend.nameSetKey('crownHunter', 4, 'chuuni')).toBeNull();
    const t = (key) => key;
    const all = { t, te: () => true };
    const none = { t, te: () => false };
    expect(frontend.titleName(all, 'regular', 3, 'chuuni')).toBe('titles.familiesChuuni.regular.t3');
    expect(frontend.titleName(all, 'regular', 3)).toBe('titles.families.regular.t3');
    expect(frontend.titleName(all, 'regular', 3, 'classic')).toBe('titles.families.regular.t3');
    // Missing in this language: the classic name
    expect(frontend.titleName(none, 'regular', 3, 'chuuni')).toBe('titles.families.regular.t3');
    expect(frontend.titleName(all, 'crownHunter', 4, 'chuuni')).toBe('titles.families.crownHunter.t4');
    expect(frontend.titleName(all, 'nope', 1, 'chuuni')).toBe('');
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

  it('frames at 10 / 25 / 50 / 80 / 100 titles', () => {
    expect(FRAME_TIERS.map((f) => [f.id, f.min])).toEqual([
      ['bronze', 10], ['silver', 25], ['gold', 50], ['platinum', 80], ['diamond', 100],
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
    expect(earnedFrame(held(79))).toBe('gold');
    expect(earnedFrame(held(80))).toBe('platinum');
    expect(earnedFrame(held(99))).toBe('platinum');
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

describe('主題框 (themed frames)', () => {
  // The catalog is data: these read it instead of naming frames, so an id can
  // change without touching the rules
  const [first, second] = THEME_FRAMES;
  const at = (frame, tier) => ({ [frame.family]: { tier, at: 1 } });

  it('every title family has a themed frame of its own; the first eight keep their place', () => {
    expect(THEME_FRAMES.slice(0, 8).map((f) => [f.id, f.family])).toEqual([
      ['fire', 'hotStreak'], ['thunder', 'volatile'], ['coin', 'netWin'], ['king', 'champion'],
      ['night', 'nightOwl'], ['frost', 'coldStreak'], ['abyss', 'badBeat'], ['tide', 'hunter'],
    ]);
    expect(THEME_FRAMES.map((f) => f.family).sort()).toEqual(TITLE_FAMILIES.map((f) => f.id).sort());
    expect(Object.fromEntries(THEME_FRAMES.map((f) => [f.family, f.id]))).toMatchObject({
      netLoss: 'petal', bigWin: 'firework', bigLoss: 'meteor', steady: 'zen',
      hunted: 'ghost', mysteryTop: 'mystery', avenger: 'blade',
      itm: 'laurel', phoenix: 'firebird', rebuyer: 'reload', runnerUp: 'silverwing', bubble: 'foam', firstOut: 'gale',
      cooler: 'clash', tragicHero: 'thorn', quads: 'quad', straightFlush: 'rainbow', royalFlush: 'royal',
      regular: 'clock', host: 'carnival',
    });
    expect(FRAME_IDS).toEqual(['bronze', 'silver', 'gold', 'platinum', 'diamond']);
  });

  it('the catalog: one array, each frame on a real family at tier 5, ids apart from the tier frames', () => {
    expect(THEME_FRAME_MIN_TIER).toBe(5);
    expect(THEME_FRAMES.length).toBeGreaterThan(0);
    for (const f of THEME_FRAMES) {
      expect(getTitleFamily(f.family), f.id).toBeTruthy();
      expect(f.minTier).toBe(THEME_FRAME_MIN_TIER);
      expect(getThemeFrame(f.id)).toBe(f);
    }
    expect(THEME_FRAME_IDS).toEqual(THEME_FRAMES.map((f) => f.id));
    expect(ALL_FRAME_IDS.slice(0, FRAME_IDS.length + THEME_FRAME_IDS.length)).toEqual([...FRAME_IDS, ...THEME_FRAME_IDS]);
    expect(new Set(ALL_FRAME_IDS).size).toBe(ALL_FRAME_IDS.length);
    expect(new Set(THEME_FRAMES.map((f) => f.family)).size).toBe(THEME_FRAMES.length);
    for (const reserved of ['auto', 'none']) expect(ALL_FRAME_IDS).not.toContain(reserved);
    expect(getThemeFrame('gold')).toBeNull();
    expect(getThemeFrame('ruby')).toBeNull();
    expect(getThemeFrame(null)).toBeNull();
  });

  it('earned at tier 5 of its family, not at 4', () => {
    expect(earnedThemeFrames(null)).toEqual([]);
    expect(earnedThemeFrames({})).toEqual([]);
    expect(earnedThemeFrames(at(first, 4))).toEqual([]);
    expect(earnedThemeFrames(at(first, 5))).toEqual([first.id]);
    expect(earnedThemeFrames(at(first, 10))).toEqual([first.id]);
    // Catalog order, whatever the map's order
    expect(earnedThemeFrames({ ...at(second, 6), ...at(first, 5) })).toEqual([first.id, second.id]);
    // Another family's tier earns only its own; an expiring entry earns nothing
    expect(earnedThemeFrames({ regular: { tier: 10, at: 1 } })).toEqual(['clock']);
    expect(earnedThemeFrames({ [first.family]: { tier: 9, at: 1, expiresAt: 99 } })).toEqual([]);
    for (const f of THEME_FRAMES) {
      expect(earnedThemeFrames(at(f, f.minTier))).toEqual([f.id]);
      expect(earnedThemeFrames(at(f, f.minTier - 1))).toEqual([]);
    }
  });

  it('isFrameEarned covers both kinds', () => {
    expect(isFrameEarned(first.id, at(first, 5))).toBe(true);
    expect(isFrameEarned(first.id, at(first, 4))).toBe(false);
    expect(isFrameEarned(second.id, at(first, 5))).toBe(false);
    // 10 titles → bronze only
    const ten = { regular: { tier: 10, at: 1 } };
    expect(isFrameEarned('bronze', ten)).toBe(true);
    expect(isFrameEarned('silver', ten)).toBe(false);
    expect(isFrameEarned('bronze', {})).toBe(false);
    for (const id of ['auto', 'none', 'ruby', null, undefined]) expect(isFrameEarned(id, ten)).toBe(false);
  });

  it('prefs keep a themed pick; validation needs it earned', () => {
    expect(normalizeTitlePrefs({ frame: first.id }).frame).toBe(first.id);
    expect(validateTitlePrefs({ frame: first.id }, null, at(first, 5)).prefs.frame).toBe(first.id);
    expect(validateTitlePrefs({ frame: first.id }, null, at(first, 4)).error).toBe('frame-locked');
    expect(validateTitlePrefs({ frame: first.id }, null, {}).error).toBe('frame-locked');
    // Tier frames earned don't open a themed one, and the other way round
    expect(validateTitlePrefs({ frame: first.id }, null, { regular: { tier: 10, at: 1 }, host: { tier: 10, at: 1 } }).error).toBe('frame-locked');
    expect(validateTitlePrefs({ frame: 'bronze' }, null, at(first, 5)).error).toBe('frame-locked');
    expect(validateTitlePrefs({ frame: second.id }, null, at(first, 5)).error).toBe('frame-locked');
    expect(validateTitlePrefs({ frame: 'ruby' }, null, at(first, 5)).error).toBe('bad-frame');
    // Going back to auto / none is always allowed
    expect(validateTitlePrefs({ frame: 'auto' }, { frame: first.id }, at(first, 5)).prefs.frame).toBe('auto');
    expect(validateTitlePrefs({ frame: 'none' }, { frame: first.id }, {}).prefs.frame).toBe('none');
    // A themed pick that is no longer earned doesn't block other prefs
    expect(validateTitlePrefs({ showRoomTitles: true }, { frame: first.id }, {}).prefs)
      .toMatchObject({ frame: first.id, showRoomTitles: true });
  });

  it('resolveFrame: the themed pick while earned, with or without a tier frame', () => {
    // 5 titles: no tier frame yet, the themed one still shows
    expect(earnedFrame(at(first, 5))).toBeNull();
    expect(resolveFrame(at(first, 5), { frame: first.id })).toBe(first.id);
    const both = { ...at(first, 5), regular: { tier: 10, at: 1 }, host: { tier: 10, at: 1 } };
    expect(earnedFrame(both)).toBe('silver');
    expect(resolveFrame(both, { frame: first.id })).toBe(first.id);
    expect(resolveFrame(both, { frame: 'none' })).toBeNull();
  });

  it('auto is always the highest tier frame, never a themed one', () => {
    const all = Object.fromEntries(THEME_FRAMES.map((f) => [f.family, { tier: 10, at: 1 }]));
    expect(earnedThemeFrames(all)).toEqual(THEME_FRAME_IDS);
    expect(FRAME_IDS).toContain(resolveFrame(all, { frame: 'auto' }));
    expect(resolveFrame(all, { frame: 'auto' })).toBe(earnedFrame(all));
    expect(resolveFrame(at(first, 5), { frame: 'auto' })).toBeNull();
    expect(earnedFrames(all)).not.toContain(first.id);
  });

  it('falls back like auto when the family is below tier 5 (a rebuild lowered it)', () => {
    const low = { ...at(first, 4), regular: { tier: 10, at: 1 } };
    expect(resolveFrame(low, { frame: first.id })).toBe('bronze');
    expect(resolveFrame(at(first, 4), { frame: first.id })).toBeNull();
    expect(resolveFrame({}, { frame: first.id })).toBeNull();

    const stored = {
      ladder: TITLE_LADDER_VERSION,
      unlocked: { ...at(first, 5), regular: { tier: 10, at: 1 } },
      prefs: { mode: 'off', frame: first.id },
      display: { familyId: null, tier: null, frame: first.id },
    };
    // Stats that no longer reach the family at all: a rebuild takes it away
    const next = buildUserTitles(stored, stats({ total: { games: 300 } }), 9, { rebuild: true });
    expect(next.unlocked[first.family]).toBeUndefined();
    expect(next.prefs.frame).toBe(first.id);
    expect(next.display).toEqual({ familyId: null, tier: null, frame: 'bronze' });
    expect(next.changed).toBe(true);
  });

  it('display.frame carries the themed id, with or without a title', () => {
    const unlocked = { ...at(first, 6), regular: { tier: 3, at: 2 } };
    expect(resolveDisplay(unlocked, { mode: 'off', frame: first.id }))
      .toEqual({ familyId: null, tier: null, frame: first.id });
    expect(resolveDisplay(unlocked, { mode: 'pick', titleId: 'regular', frame: first.id }))
      .toEqual({ familyId: 'regular', tier: 3, frame: first.id });
    const display = { familyId: 'regular', tier: 3, frame: first.id };
    expect(sameDisplay(display, { ...display })).toBe(true);
    expect(sameDisplay(display, { ...display, frame: second.id })).toBe(false);
    expect(sameDisplay(display, { ...display, frame: null })).toBe(false);
    // A stored display with a themed frame is shown as stored
    expect(effectiveDisplay({ ladder: TITLE_LADDER_VERSION, unlocked, prefs: { mode: 'off', frame: first.id }, display }, '2026-11'))
      .toEqual(display);
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
    expect(next.prefs).toEqual({ mode: 'off', titleId: null, titleTier: null, showRoomTitles: false, frame: 'none', nameSet: 'classic' });
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
    expect(next.prefs).toEqual({ ...prev.prefs, titleTier: null, nameSet: 'classic' });
    expect(next.display).toBeNull();
  });

  it('a title now in another name set is a change; a doc from before name sets is not', () => {
    const base = {
      ladder: L,
      unlocked: { regular: { tier: 2, at: 5 } },
      prefs: { mode: 'auto', frame: 'none' },
      display: { familyId: 'regular', tier: 2, frame: null },
    };
    const same = stats({ total: { games: 12 } });
    // No nameSet anywhere (written before name sets): classic, nothing to write
    const old = buildUserTitles(base, same, 9);
    expect(old.changed).toBe(false);
    expect(old.prefs.nameSet).toBe('classic');
    expect(old.display).toEqual({ familyId: 'regular', tier: 2, frame: null });
    // The pref says 中二 but the stored display is still classic: rewritten
    const switched = buildUserTitles({ ...base, prefs: { ...base.prefs, nameSet: 'chuuni' } }, same, 9);
    expect(switched.changed).toBe(true);
    expect(switched.upgraded).toEqual([]);
    expect(switched.prefs.nameSet).toBe('chuuni');
    expect(switched.display).toEqual({ familyId: 'regular', tier: 2, frame: null, nameSet: 'chuuni' });
    // …and once stored that way it is settled
    const settled = buildUserTitles({ ...base, prefs: switched.prefs, display: switched.display }, same, 9);
    expect(settled.changed).toBe(false);
    // Back to classic: the display drops it again
    const back = buildUserTitles({ ...base, prefs: { ...base.prefs, nameSet: 'classic' }, display: switched.display }, same, 9);
    expect(back.changed).toBe(true);
    expect(back.display).toEqual({ familyId: 'regular', tier: 2, frame: null });
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
    // Earned before frames were recorded: the tier frame's time is unknown; a
    // themed frame whose family sits on its minTier takes that step's time
    expect(next.frames).toEqual({ bronze: 0, clock: 5, carnival: 6 });
    expect(buildUserTitles({ ...prev, display: next.display, frames: next.frames }, s, 10).changed).toBe(false);
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
    // netWin 1-2-3-4 were 2000 / 5000 / 10000 / 30000 (net: a floor of the gross)
    expect([1, 2, 3, 4].map((t) => legacyTier('netWin', t))).toEqual([2, 3, 4, 7]);
    // netLoss 2000 / 5000 / 15000 / 40000
    expect([1, 2, 3, 4].map((t) => legacyTier('netLoss', t))).toEqual([2, 3, 5, 7]);
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
      unlocked: { netWin: { tier: 7, at: 3 }, someNewFamily: { tier: 2, at: 4 }, broken: null },
      prefs: old.prefs,
      crowns: old.crowns,
      display: null,
      pals: ['amy'],
      ladder: TITLE_LADDER_VERSION,
    });
    // Already on the ladders (or nothing at all): as is
    const current = { ...up, display: { familyId: 'netWin', tier: 7, frame: null } };
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
    // 賭神 (old legendary 4) → 點石成金 (7, legendary); with regular 4 → 8: 15 titles
    expect(shown).toEqual({ familyId: 'netWin', tier: 7, frame: earnedFrame({ netWin: { tier: 7 }, regular: { tier: 8 } }) });
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
    // Prefs untouched (titleTier: none picked), the pick still resolves
    expect(next.prefs).toEqual({ ...old.prefs, titleTier: null, nameSet: 'classic' });
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
    const stored = { ...old, ladder: next.ladder, unlocked: next.unlocked, display: next.display, frames: next.frames };
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
