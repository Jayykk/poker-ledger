import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  CROWN_IDS, activeCrowns, applyCrownMonth, crownLeaders, crownMonthOf, crownStateFromScratch, crownValue,
  heldCrowns,
} from '../functions/src/utils/crownRules.js';
import {
  CROWN_FAMILIES, TITLE_FAMILIES, TITLE_SOURCES, buildCrownUpdate, buildUserTitles, effectiveDisplay,
  getTitleFamily, resolveDisplay, resolveTitle, titleCount, titleTierOf, validateTitlePrefs,
} from '../functions/src/utils/titleRules.js';
import * as frontend from '../src/utils/titles.js';

// Month stats as in leaderboardStats/{uid}_{month}
const month = ({ games = 0, profit = 0, knockouts = 0, groups = null, hidden = false } = {}) => {
  const total = { games, profit, groupGames: 0, sumGroups: 0, sumSqGroups: 0 };
  if (groups) {
    total.groupGames = groups.length;
    total.sumGroups = groups.reduce((a, b) => a + b, 0);
    total.sumSqGroups = groups.reduce((a, b) => a + b * b, 0);
  }
  return { hidden, total, cash: {}, tournament: { knockouts } };
};

describe('crown catalog', () => {
  it('five crowns, single legendary step, crown source, not in TITLE_FAMILIES', () => {
    expect(CROWN_IDS).toEqual(['crownHunter', 'crownBoss', 'crownProfit', 'crownLoss', 'crownRegular']);
    for (const fam of CROWN_FAMILIES) {
      expect(fam.source).toBe(TITLE_SOURCES.CROWN);
      expect(fam.tiers.map((s) => s.tier)).toEqual([4]);
      expect(getTitleFamily(fam.id)).toBe(fam);
      expect(titleTierOf(fam.id, 4).nameKey).toBe(`titles.families.${fam.id}.t4`);
      expect(TITLE_FAMILIES).not.toContain(fam);
    }
  });

  it('names (本月…), descriptions, 王座 and 只看牌友 texts in every locale', () => {
    for (const locale of ['zh-TW', 'en', 'zh-CN', 'ja']) {
      const messages = JSON.parse(readFileSync(resolve(__dirname, `../src/i18n/locales/${locale}.json`), 'utf-8'));
      const get = (key) => key.split('.').reduce((node, part) => node?.[part], messages);
      for (const fam of CROWN_FAMILIES) {
        for (const key of [fam.descKey, fam.tiers[0].nameKey]) expect(get(key), `${locale}: ${key}`).toBeTruthy();
      }
      for (const key of [
        'title', 'sub', 'history', 'vacant', 'youHold', 'youShare', 'mine', 'gap', 'noGames', 'bossNeed',
        'units.knockouts', 'units.games',
      ]) expect(get(`titles.throne.${key}`), `${locale}: throne.${key}`).toBeTruthy();
      for (const key of ['palsOnly', 'palsHint', 'palsCount', 'noPals']) {
        expect(get(`friends.${key}`), `${locale}: friends.${key}`).toBeTruthy();
      }
    }
    const zh = JSON.parse(readFileSync(resolve(__dirname, '../src/i18n/locales/zh-TW.json'), 'utf-8'));
    expect(CROWN_IDS.map((id) => zh.titles.families[id].t4))
      .toEqual(['本月獵頭王', '本月老闆', '本月印鈔機', '本月大善人', '本月釘子戶']);
  });

  it('crowns never count toward frames', () => {
    expect(titleCount({ crownHunter: { tier: 4, at: 1 }, regular: { tier: 1, at: 1 } })).toBe(1);
  });

  it('the frontend re-exports the crown rules', () => {
    expect(frontend.heldCrowns).toBe(heldCrowns);
    expect(frontend.CROWN_FAMILIES).toBe(CROWN_FAMILIES);
  });

  it('month key on the Asia/Taipei calendar', () => {
    expect(crownMonthOf(Date.parse('2026-09-30T16:30:00Z'))).toBe('2026-10');
    expect(crownMonthOf(Date.parse('2026-09-30T15:30:00Z'))).toBe('2026-09');
  });
});

describe('who holds a crown', () => {
  it('minimums: 2 KOs, 4 games with 組 for σ, profit > 0, loss < 0, 3 games', () => {
    expect(heldCrowns(month({ knockouts: 1, games: 2 }), [])).toEqual([]);
    expect(heldCrowns(month({ knockouts: 2, games: 2 }), [])).toEqual(['crownHunter']);
    expect(heldCrowns(month({ games: 3, groups: [3, -3, 3] }), [])).toEqual(['crownRegular']);
    expect(heldCrowns(month({ games: 4, groups: [3, -3, 3, -3] }), [])).toEqual(['crownBoss', 'crownRegular']);
    expect(heldCrowns(month({ games: 1, profit: 500 }), [])).toEqual(['crownProfit']);
    expect(heldCrowns(month({ games: 1, profit: -500 }), [])).toEqual(['crownLoss']);
    expect(heldCrowns(month({ games: 1, profit: 0 }), [])).toEqual([]);
    expect(heldCrowns(null, [])).toEqual([]);
    // Hidden accounts never hold one
    expect(heldCrowns(month({ knockouts: 9, games: 9, hidden: true }), [])).toEqual([]);
  });

  it('strictly #1 among the pals takes it', () => {
    const me = month({ knockouts: 4, games: 3, profit: 800 });
    const pal = month({ knockouts: 3, games: 5, profit: 900 });
    expect(heldCrowns(me, [pal])).toEqual(['crownHunter']);
    expect(heldCrowns(pal, [me])).toEqual(['crownProfit', 'crownRegular']);
  });

  it('a tie shares the crown: every tied leader holds it', () => {
    const a = month({ knockouts: 3 });
    const b = month({ knockouts: 3 });
    const c = month({ knockouts: 1 });
    expect(heldCrowns(a, [b, c])).toEqual(['crownHunter']);
    expect(heldCrowns(b, [a, c])).toEqual(['crownHunter']);
    expect(heldCrowns(c, [a, b])).toEqual([]);
  });

  it('a pal below the 老闆 game count does not block, a pal with no games neither', () => {
    const me = month({ games: 4, groups: [1, -1, 1, -1] });
    const wild = month({ games: 3, groups: [9, -9, 9] });
    expect(heldCrowns(me, [wild, null])).toContain('crownBoss');
  });

  it('different circles can each have their own holder', () => {
    // amy – bob are pals, bob – cat are pals, amy and cat are not
    const stats = { amy: month({ knockouts: 5 }), bob: month({ knockouts: 2 }), cat: month({ knockouts: 3 }) };
    const pals = { amy: ['bob'], bob: ['amy', 'cat'], cat: ['bob'] };
    const holds = (uid) => heldCrowns(stats[uid], pals[uid].map((p) => stats[p])).includes('crownHunter');
    expect([holds('amy'), holds('bob'), holds('cat')]).toEqual([true, false, true]);
  });

  it('circle leaders for the 王座 section (ties listed together)', () => {
    const members = [
      { uid: 'me', stats: month({ knockouts: 2, games: 3 }) },
      { uid: 'amy', stats: month({ knockouts: 4, games: 3 }) },
      { uid: 'bob', stats: month({ knockouts: 4, games: 1 }) },
    ];
    expect(crownLeaders('crownHunter', members)).toEqual({ holders: ['amy', 'bob'], value: 4 });
    expect(crownLeaders('crownRegular', members)).toEqual({ holders: ['me', 'amy'], value: 3 });
    expect(crownLeaders('crownProfit', members)).toEqual({ holders: [], value: null });
    expect(crownValue('crownBoss', members[0].stats)).toBeNull();
  });
});

describe('lazy finalisation', () => {
  const OCT = '2026-10';
  const NOV = '2026-11';

  it('gain: dated this month', () => {
    const r = applyCrownMonth(null, OCT, OCT, ['crownHunter']);
    expect(r).toMatchObject({ crowns: { crownHunter: OCT }, crownHistory: {}, changed: true, gained: ['crownHunter'], lost: [] });
  });

  it('lose mid-month: removed, no history', () => {
    const r = applyCrownMonth({ crowns: { crownHunter: OCT } }, OCT, OCT, []);
    expect(r).toMatchObject({ crowns: {}, crownHistory: {}, changed: true, lost: ['crownHunter'] });
  });

  it('kept this month: no change', () => {
    const r = applyCrownMonth({ crowns: { crownHunter: OCT } }, OCT, OCT, ['crownHunter']);
    expect(r.changed).toBe(false);
    expect(r.gained).toEqual([]);
  });

  it('kept into the next month: the old month goes to history, the crown is re-dated', () => {
    const r = applyCrownMonth({ crowns: { crownHunter: OCT } }, NOV, NOV, ['crownHunter']);
    expect(r.crowns).toEqual({ crownHunter: NOV });
    expect(r.crownHistory).toEqual({ crownHunter: [OCT] });
    // It was held at the end of October, then won again: a gain for November
    expect(r.gained).toEqual(['crownHunter']);
  });

  it('an older month not held now: finalised into history, removed', () => {
    const stored = { crowns: { crownHunter: OCT, crownLoss: OCT }, crownHistory: { crownHunter: ['2026-08'] } };
    const r = applyCrownMonth(stored, NOV, NOV, ['crownLoss']);
    expect(r.crowns).toEqual({ crownLoss: NOV });
    expect(r.crownHistory).toEqual({ crownHunter: ['2026-08', OCT], crownLoss: [OCT] });
    expect(r.lost).toEqual([]);
  });

  it('a correction to a past month edits its history directly', () => {
    const add = applyCrownMonth({ crowns: { crownHunter: NOV } }, OCT, NOV, ['crownRegular']);
    expect(add.crowns).toEqual({ crownHunter: NOV });
    expect(add.crownHistory).toEqual({ crownRegular: [OCT] });
    const drop = applyCrownMonth({ crownHistory: { crownRegular: [OCT] } }, OCT, NOV, []);
    expect(drop.crownHistory).toEqual({});
    expect(drop.changed).toBe(true);
  });

  it('from scratch (backfill): past months to history, this month to crowns', () => {
    expect(crownStateFromScratch({ '2026-08': ['crownHunter'], [OCT]: ['crownHunter', 'crownLoss'], '2026-09': [] }, OCT))
      .toEqual({ crowns: { crownHunter: OCT, crownLoss: OCT }, crownHistory: { crownHunter: ['2026-08'] } });
  });
});

describe('display with crowns', () => {
  const OCT = '2026-10';
  const unlocked = { regular: { tier: 4, at: 1 }, champion: { tier: 2, at: 2 } };
  const crowns = { crownProfit: OCT, crownHunter: OCT, crownLoss: '2026-09' };

  it('active crowns: only this month, fixed order', () => {
    expect(activeCrowns(crowns, OCT)).toEqual(['crownHunter', 'crownProfit']);
    expect(activeCrowns(crowns, '2026-11')).toEqual([]);
  });

  it('auto: an active crown beats any title; the frame is unchanged', () => {
    expect(resolveDisplay(unlocked, { mode: 'auto', frame: 'auto' }, { crowns, month: OCT }))
      .toEqual({ familyId: 'crownHunter', tier: 4, frame: 'bronze', month: OCT });
    expect(resolveTitle(unlocked, { mode: 'auto' }, { crowns, month: '2026-11' })).toEqual({ familyId: 'regular', tier: 4 });
    expect(resolveTitle(unlocked, { mode: 'auto' })).toEqual({ familyId: 'regular', tier: 4 });
    // Opt-in: nothing set means nothing shown, crowns included
    expect(resolveTitle(unlocked, null, { crowns, month: OCT })).toBeNull();
  });

  it('pick: a held crown, falls back like auto once it is gone; off hides crowns too', () => {
    const pick = { mode: 'pick', titleId: 'crownProfit' };
    expect(resolveTitle(unlocked, pick, { crowns, month: OCT })).toMatchObject({ familyId: 'crownProfit', month: OCT });
    expect(resolveTitle(unlocked, pick, { crowns, month: '2026-11' })).toEqual({ familyId: 'regular', tier: 4 });
    // A picked normal title wins over an active crown
    expect(resolveTitle(unlocked, { mode: 'pick', titleId: 'champion' }, { crowns, month: OCT }))
      .toEqual({ familyId: 'champion', tier: 2 });
    expect(resolveTitle(unlocked, { mode: 'off' }, { crowns, month: OCT })).toBeNull();
  });

  it('client: a stored crown display from an older month is re-resolved', () => {
    const doc = {
      unlocked,
      prefs: { mode: 'auto', frame: 'auto' },
      crowns,
      display: { familyId: 'crownHunter', tier: 4, frame: 'bronze', month: OCT },
    };
    expect(effectiveDisplay(doc, OCT)).toBe(doc.display);
    expect(effectiveDisplay(doc, '2026-11')).toEqual({ familyId: 'regular', tier: 4, frame: 'bronze' });
    // Normal titles are shown as stored
    const plain = { ...doc, display: { familyId: 'regular', tier: 4, frame: 'bronze' } };
    expect(effectiveDisplay(plain, '2026-11')).toBe(plain.display);
    expect(effectiveDisplay(null, OCT)).toBeNull();
  });

  it('server: the next recompute drops a stale crown display', () => {
    const prev = {
      unlocked,
      prefs: { mode: 'auto', frame: 'auto' },
      crowns,
      display: { familyId: 'crownHunter', tier: 4, frame: 'bronze', month: OCT },
    };
    const stats = { total: { games: 200 }, cash: {}, tournament: { champion: 3 } };
    const nov = Date.parse('2026-11-02T12:00:00+08:00');
    const next = buildUserTitles(prev, stats, nov);
    expect(next.changed).toBe(true);
    expect(next.display).toEqual({ familyId: 'regular', tier: 4, frame: 'bronze' });
    const oct = Date.parse('2026-10-20T12:00:00+08:00');
    expect(buildUserTitles(prev, stats, oct).changed).toBe(false);
  });

  it('setTitlePrefs validation: a crown can be picked while held this month', () => {
    const ctx = { crowns, month: OCT };
    expect(validateTitlePrefs({ mode: 'pick', titleId: 'crownHunter' }, null, unlocked, ctx).prefs)
      .toMatchObject({ mode: 'pick', titleId: 'crownHunter' });
    expect(validateTitlePrefs({ mode: 'pick', titleId: 'crownLoss' }, null, unlocked, ctx).error).toBe('not-unlocked');
    expect(validateTitlePrefs({ mode: 'pick', titleId: 'crownRegular' }, null, unlocked, ctx).error).toBe('not-unlocked');
    expect(validateTitlePrefs({ mode: 'pick', titleId: 'crownHunter' }, null, unlocked).error).toBe('not-unlocked');
    // The picked crown is gone: other prefs can still change
    const stored = { mode: 'pick', titleId: 'crownHunter' };
    expect(validateTitlePrefs({ showRoomTitles: false }, stored, unlocked, { crowns, month: '2026-11' }).prefs)
      .toMatchObject({ mode: 'pick', titleId: 'crownHunter', showRoomTitles: false });
    expect(validateTitlePrefs({ mode: 'pick' }, stored, unlocked, { crowns, month: '2026-11' }).error).toBe('not-unlocked');
  });

  it('buildCrownUpdate: crowns + history + the display they give', () => {
    const stored = { unlocked, prefs: { mode: 'auto', frame: 'auto' }, display: { familyId: 'regular', tier: 4, frame: 'bronze' } };
    const gain = buildCrownUpdate(stored, [[OCT, ['crownRegular']]], OCT);
    expect(gain).toMatchObject({
      crowns: { crownRegular: OCT },
      display: { familyId: 'crownRegular', tier: 4, frame: 'bronze', month: OCT },
      changed: true,
      gained: ['crownRegular'],
    });
    const held = { ...stored, crowns: gain.crowns, crownHistory: gain.crownHistory, display: gain.display };
    expect(buildCrownUpdate(held, [[OCT, ['crownRegular']]], OCT).changed).toBe(false);
    const lost = buildCrownUpdate(held, [[OCT, []]], OCT);
    expect(lost).toMatchObject({ crowns: {}, display: stored.display, lost: ['crownRegular'], changed: true });
  });
});
