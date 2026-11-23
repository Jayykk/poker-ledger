import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import zhTW from '../src/i18n/locales/zh-TW.json';
import { crownMonthOf, previousMonthKey } from '../functions/src/utils/crownRules.js';
import { FRAME_TIERS, THEME_FRAMES, CROWN_FRAMES } from '../functions/src/utils/titleRules.js';
import { filterToCircle } from '../src/utils/leaderboardRanking.js';

const MONTH = crownMonthOf(Date.now());
const PREV = previousMonthKey(MONTH);
const label = (m) => m.replace('-', '/');
const month = (uid, { games = 1, profit = 0, knockouts = 0 } = {}) => ({
  uid, name: uid.toUpperCase(), hidden: false, period: MONTH, periodType: 'month',
  total: { games, profit, groupGames: 0, sumGroups: 0, sumSqGroups: 0 },
  cash: {},
  tournament: { knockouts },
});

// collection/id → data
const docs = {
  'userTitles/me': {
    ladder: 2,
    unlocked: { regular: { tier: 1, at: 1 } },
    // cy played nothing this month: still a pal, so the circle is big enough
    pals: ['amy', 'bob', 'cy'],
    // Leading this month's 釘子戶 race; won 印鈔機 last month (worn now)
    crowns: { crownRegular: MONTH },
    crownHistory: { crownHunter: ['2026-01', '2026-03'], crownProfit: [PREV] },
    display: { familyId: 'crownProfit', tier: 4, frame: null, month: MONTH },
  },
  // amy won 獵頭王 last month: still under crowns (not moved to history yet)
  'userTitles/amy': { ladder: 2, unlocked: { regular: { tier: 2, at: 1 } }, name: 'Amy', crowns: { crownHunter: PREV } },
  'userTitles/bob': { unlocked: {}, name: 'Bob' },
  'userTitles/cy': { unlocked: {}, name: 'Cy' },
  // A crown display from an older month: shown as what auto falls back to
  'userTitles/old': {
    ladder: 2,
    unlocked: { host: { tier: 2, at: 1 } },
    prefs: { mode: 'auto' },
    crowns: { crownHunter: '2020-01' },
    display: { familyId: 'crownHunter', tier: 4, frame: null, month: '2020-01' },
  },
  // All-time: 25 games → 常客 (regular Ⅲ), next 老主顧 at 30
  'leaderboardStats/me_all': {
    uid: 'me', period: 'all', total: { games: 25, profit: 0 }, cash: {}, tournament: {},
  },
  [`leaderboardStats/me_${MONTH}`]: month('me', { games: 3, knockouts: 2, profit: -300 }),
  [`leaderboardStats/amy_${MONTH}`]: month('amy', { games: 3, knockouts: 4 }),
  [`leaderboardStats/bob_${MONTH}`]: month('bob', { games: 1, knockouts: 4, profit: -300 }),
  // 幾人拿到, site-wide
  'titleStats/global': {
    players: 12,
    titles: { regular: [12, 9, 7, 5, 3, 2, 1, 0, 0, 0] },
    frames: { mint: 3, bronze: 6 },
    crowns: { crownProfit: 3 },
  },
};
const reads = [];

vi.mock('../src/firebase-init.js', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => async () => ({ data: {} }) }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, collection, id) => ({ path: `${collection}/${id}`, id }),
  getDoc: async (r) => {
    reads.push(r.path);
    const data = docs[r.path];
    return { exists: () => !!data, data: () => data };
  },
  onSnapshot: (r, next) => {
    const data = docs[r.path];
    Promise.resolve().then(() => next({ exists: () => !!data, data: () => data }));
    return () => {};
  },
}));
vi.mock('../src/composables/useAuth.js', () => ({
  useAuth: () => ({ user: ref({ uid: 'me', photoURL: '' }), displayName: ref('Me') }),
}));
// The dialog lives in the route (?item=kind:id): a reactive route, and a
// router that moves it and records what it was asked
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue');
  const route = reactive({ path: '/titles', query: {} });
  const calls = [];
  const go = (kind) => (to) => {
    calls.push([kind, to]);
    if (typeof to === 'object' && to.query) route.query = { ...to.query };
  };
  const router = {
    push: go('push'),
    replace: go('replace'),
    back: () => {
      calls.push(['back']);
      route.query = {};
    },
  };
  return { useRoute: () => route, useRouter: () => router, __route: route, __calls: calls };
});

const { default: TitlesView } = await import('../src/views/TitlesView.vue');
const { ensureUserTitles, titleDisplayOf, useUserTitles } = await import('../src/composables/useUserTitles.js');
const { __route: route, __calls: routerCalls } = await import('vue-router');
const i18n = createI18n({ legacy: false, locale: 'zh-TW', messages: { 'zh-TW': zhTW } });

async function mountCodex() {
  const w = mount(TitlesView, { global: { plugins: [i18n], mocks: { $router: { push: () => {} } } } });
  await flushPromises();
  await flushPromises();
  return w;
}

beforeEach(() => {
  route.query = {};
  routerCalls.length = 0;
});

describe('稱號圖鑑 王座 section', () => {
  it('worn this month (last month\'s winners) and this month\'s race, in my circle', async () => {
    const w = await mountCodex();
    const throne = w.find('[data-testid="throne"]');
    expect(throne.exists()).toBe(true);
    // The header counts tiers held out of every tier (28 families × 10), not families
    expect(w.text()).toMatch(/已解鎖 \d+ \/ 280/);
    const card = (id) => throne.find(`[data-crown="${id}"]`);
    expect(throne.findAll('[data-crown]')).toHaveLength(5);

    // Worn: amy won 獵頭王 last month, I won 印鈔機 (my card gets the gold edge)
    expect(card('crownHunter').find('[data-testid="throne-reigning"]').text()).toContain('AMY');
    expect(card('crownProfit').find('.tv-reigning').text()).toBe('Me');
    expect(card('crownProfit').classes()).toContain('held');
    expect(card('crownRegular').classes()).not.toContain('held');
    expect(card('crownBoss').find('[data-testid="throne-reigning"]').text()).toContain('從缺');

    // The race: amy and bob tie on knockouts: both shown; me 2 short
    expect(card('crownHunter').find('.tv-holders').text()).toBe('AMY · BOB');
    expect(card('crownHunter').find('.tv-me').text()).toBe('我 2 淘汰 · 差 2 淘汰');
    expect(card('crownHunter').text()).toContain('歷代 2');

    // me and amy tie on games: leading together (worn only next month)
    expect(card('crownRegular').find('.tv-me').text()).toContain('你和牌友並列領先');

    // nobody won money this month; me and bob tie on the loss
    expect(card('crownLoss').find('.tv-holders').text()).toBe('Me · BOB');
    // Money crowns show who, never how much: no value, no gap
    for (const id of ['crownProfit', 'crownLoss']) {
      expect(card(id).find('.tv-value').exists()).toBe(false);
      expect(card(id).text()).not.toMatch(/\d{3}|差/);
    }
    expect(card('crownLoss').find('.tv-me').text()).toContain('你和牌友並列領先');
    expect(card('crownProfit').find('.tv-me').exists()).toBe(false);
    expect(card('crownHunter').find('.tv-value').exists()).toBe(true);
    expect(card('crownBoss').find('.tv-me').text()).toBe('本月滿 4 場有組數的牌局才列入');

    // One month doc per circle member
    expect(reads.filter((p) => p.startsWith('leaderboardStats/') && p.endsWith(MONTH)).sort())
      .toEqual(['amy', 'bob', 'cy', 'me'].map((u) => `leaderboardStats/${u}_${MONTH}`));
  });

  it('a crown card opens its detail: who wears it, the race, my wins, its frame', async () => {
    const w = await mountCodex();
    await w.find('[data-crown="crownProfit"]').trigger('click');
    expect(routerCalls[0]).toEqual(['push', { query: { item: 'crown:crownProfit' } }]);
    await flushPromises();
    const d = w.find('[data-testid="codex-crown"]');
    expect(d.find('[data-testid="codex-crown-reigning"]').text()).toBe('Me');
    expect(d.find('[data-testid="codex-crown-race"]').text()).toBe('本月還沒有人達標');
    expect(d.find('[data-testid="codex-crown-mine"]').text()).toBe(`拿過 1 次：${label(PREV)}`);
    expect(d.text()).toContain(zhTW.titles.frames.mint);
    expect(d.text()).toContain('全站 3 人拿過');
  });

  it('fewer than 3 pals (someone new): a note on how to join instead of the crowns', async () => {
    // The shared cache already holds me from the test above
    const cached = useUserTitles().titles.me;
    const saved = cached.pals;
    cached.pals = ['amy'];
    try {
      const w = await mountCodex();
      const throne = w.find('[data-testid="throne"]');
      expect(throne.findAll('[data-crown]')).toHaveLength(0);
      expect(throne.find('[data-testid="throne-need-pals"]').text()).toBe('再和 2 位牌友同桌（同一人滿 2 場）就能參加本月王座');
    } finally {
      cached.pals = saved;
    }
  });

  it('client display: a crown from an older month falls back like auto', async () => {
    await ensureUserTitles('old');
    expect(titleDisplayOf('old')).toEqual({ familyId: 'host', tier: 2, frame: null });
  });

  it('cards keep long names and several holders inside on a phone', () => {
    const src = readFileSync(resolve(__dirname, '../src/views/TitlesView.vue'), 'utf-8');
    expect(src).toMatch(/\.tv-holders \{[^}]*min-width: 0;[^}]*text-overflow: ellipsis;/);
    expect(src).toMatch(/\.tv-reigning \{[^}]*min-width: 0;[^}]*text-overflow: ellipsis;/);
    expect(src).toMatch(/\.tv-me \{[^}]*overflow: hidden;/);
    expect(src).toContain('row.wearing.slice(0, 3)');
  });
});

describe('稱號圖鑑 family cards and their detail', () => {
  it('current tier as Ⅲ / Ⅹ with ten dots, the next step and its bar; a tap opens the ten steps', async () => {
    const w = await mountCodex();
    const card = w.find('[data-family="regular"]');
    expect(card.find('.title-badge').text()).toBe('常客');
    expect(card.find('[data-testid="tier-roman"]').text()).toBe('Ⅲ / Ⅹ');
    expect(card.findAll('.tv-dot')).toHaveLength(10);
    expect(card.findAll('.tv-dot.reached')).toHaveLength(3);
    expect(card.find('[data-testid="tier-next"]').text()).toBe('下一階：老主顧');
    expect(card.text()).toContain('25 / 30');
    expect(card.find('.tv-fill').attributes('style')).toContain('width: 50%');
    // The steps live in the dialog now
    expect(w.find('[data-testid="codex-steps"]').exists()).toBe(false);
    await card.trigger('click');
    expect(route.query.item).toBe('title:regular');
    await flushPromises();
    const d = w.find('[data-testid="codex-title"]');
    expect(d.find('[data-testid="codex-title-progress"]').text()).toBe('目前 25 · 再 5 升到「老主顧」');
    const steps = d.findAll('[data-testid="codex-steps"] li');
    expect(steps).toHaveLength(10);
    expect(steps[0].text()).toContain('新面孔');
    expect(steps[2].classes()).toEqual(expect.arrayContaining(['reached', 'current', 'rare']));
    expect(steps[9].classes()).toContain('mythic');
    expect(steps[9].text()).toContain('與牌桌合一');
    expect(steps[9].text()).toContain('300');
    // How many hold each step: site-wide, and in my circle (me 1, amy 2)
    expect(steps.map((li) => li.find('[data-testid="step-site"]').text())).toEqual(['12', '9', '7', '5', '3', '2', '1', '0', '0', '0']);
    expect(steps.map((li) => li.find('[data-testid="step-circle"]').text())).toEqual(['2', '1', '0', '0', '0', '0', '0', '0', '0', '0']);
    // The themed frame the family unlocks, one tap away
    const frameId = THEME_FRAMES.find((f) => f.family === 'regular').id;
    expect(d.find('[data-testid="codex-title-frame"]').text()).toContain(zhTW.titles.frames[frameId]);
    await d.find('[data-testid="codex-title-frame"]').trigger('click');
    expect(routerCalls.at(-1)).toEqual(['replace', { query: { item: `frame:${frameId}` } }]);

    // Not reached yet: — / Ⅹ, the first step as the goal
    const host = w.find('[data-family="host"]');
    expect(host.find('[data-testid="tier-roman"]').text()).toBe('— / Ⅹ');
    expect(host.find('[data-testid="tier-next"]').text()).toBe('下一階：開房');

    // Hidden and locked: ??? and the riddle only, no ladder
    const owl = w.find('[data-family="nightOwl"]');
    expect(owl.text()).toContain('???');
    expect(owl.find('.tv-hint').exists()).toBe(true);
    expect(owl.find('.tv-ladder').exists()).toBe(false);
  });

  it('closing goes back over the entry the tap pushed; a deep link is closed in place', async () => {
    const w = await mountCodex();
    await w.find('[data-family="regular"]').trigger('click');
    await flushPromises();
    await w.find('.fa-times').element.parentElement.click();
    await flushPromises();
    expect(routerCalls.at(-1)).toEqual(['back']);
    expect(w.find('[data-testid="codex-title"]').exists()).toBe(false);
    // Opened from a link: nothing to go back over
    route.query = { item: 'title:host' };
    await flushPromises();
    expect(w.find('[data-testid="codex-title"]').exists()).toBe(true);
    await w.find('.fa-times').element.parentElement.click();
    expect(routerCalls.at(-1)).toEqual(['replace', { query: {} }]);
    // Junk in the route opens nothing
    route.query = { item: 'title:nope' };
    await flushPromises();
    expect(w.find('[data-testid="codex-title"]').exists()).toBe(false);
  });

  it('中二版: my badge, the next step and the ten steps are in my own name set; the 王座 crowns are not', async () => {
    const chuuni = zhTW.titles.familiesChuuni;
    const w = await mountCodex();
    // My doc is live (one shared listener): the switch in 我的 lands in the cache
    const { titles } = useUserTitles();
    const mine = titles.me;
    titles.me = { ...mine, prefs: { ...mine.prefs, nameSet: 'chuuni' } };
    try {
      await flushPromises();
      const card = w.find('[data-family="regular"]');
      expect(card.find('.title-badge').text()).toBe(chuuni.regular.t3);
      expect(card.find('[data-testid="tier-next"]').text()).toBe(`下一階：${chuuni.regular.t4}`);
      await card.trigger('click');
      await flushPromises();
      const steps = w.findAll('[data-testid="codex-steps"] li');
      expect(steps.map((li) => li.find('.cd-step-name').text())).toEqual(Object.values(chuuni.regular));
      expect(w.find('[data-family="host"] [data-testid="tier-next"]').text()).toBe(`下一階：${chuuni.host.t1}`);
      // Crowns have one set of names
      expect(w.find('[data-crown="crownHunter"] .title-badge').text()).toBe(zhTW.titles.families.crownHunter.t4);
    } finally {
      titles.me = mine;
    }
  });

  it('nothing overflows a phone: the step rows truncate, the dots shrink', () => {
    const view = readFileSync(resolve(__dirname, '../src/views/TitlesView.vue'), 'utf-8');
    const detail = readFileSync(resolve(__dirname, '../src/components/titles/CodexDetail.vue'), 'utf-8');
    expect(detail).toMatch(/\.cd-step-name \{[^}]*min-width: 0;[^}]*text-overflow: ellipsis;/);
    expect(detail).toMatch(/\.cd-step \{[^}]*min-width: 0;/);
    expect(view).toMatch(/\.tv-dots \{[^}]*min-width: 0;/);
    expect(view).toMatch(/\.tv-ladder \{[^}]*min-width: 0;/);
    // Above the bottom nav (z-9999)
    expect(detail).toContain('layer="z-[10010]"');
  });
});

describe('稱號圖鑑 tabs', () => {
  it('稱號 by default (王座 + families); 頭像框 on its own tab, switched in place', async () => {
    const w = await mountCodex();
    const tab = (id) => w.find(`[data-testid="codex-tabs"] [data-tab="${id}"]`);
    expect(tab('titles').classes()).toContain('active');
    expect(tab('titles').text()).toContain('/ 280');
    // 38 frames, 印鈔機 (worn this month) the only one earned
    expect(tab('frames').text()).toContain(`1 / ${FRAME_TIERS.length + THEME_FRAMES.length + CROWN_FRAMES.length}`);
    expect(w.find('[data-testid="throne"]').exists()).toBe(true);
    expect(w.find('[data-family="regular"]').exists()).toBe(true);
    expect(w.find('[data-testid="codex-frames"]').exists()).toBe(false);

    await tab('frames').trigger('click');
    expect(routerCalls.at(-1)).toEqual(['replace', { query: { tab: 'frames' } }]);
    await flushPromises();
    expect(tab('frames').classes()).toContain('active');
    expect(w.find('[data-testid="codex-frames"]').exists()).toBe(true);
    expect(w.find('[data-testid="throne"]').exists()).toBe(false);
    expect(w.find('[data-family="regular"]').exists()).toBe(false);
    // A frame's dialog keeps the tab under it
    await w.find('[data-frame="bronze"]').trigger('click');
    expect(route.query).toEqual({ tab: 'frames', item: 'frame:bronze' });

    route.query = {};
    await flushPromises();
    await tab('frames').trigger('click');
    await tab('titles').trigger('click');
    expect(routerCalls.at(-1)).toEqual(['replace', { query: {} }]);
  });
});

describe('稱號圖鑑 頭像框 tab', () => {
  beforeEach(() => {
    route.query = { tab: 'frames' };
  });

  it('every frame in three groups; earned / worn marked; the rest say how far', async () => {
    const w = await mountCodex();
    const section = w.find('[data-testid="codex-frames"]');
    const ids = section.findAll('[data-frame]').map((b) => b.attributes('data-frame'));
    expect(ids).toEqual([...FRAME_TIERS, ...THEME_FRAMES, ...CROWN_FRAMES].map((f) => f.id));
    const tile = (id) => section.find(`[data-frame="${id}"]`);
    // 1 title held: bronze needs 10
    expect(tile('bronze').classes()).not.toContain('earned');
    expect(tile('bronze').find('.tv-frame-sub').text()).toBe(`1/${FRAME_TIERS[0].min} 個`);
    // regular at tier 1 (stored): its themed frame needs tier 5
    const regularFrame = THEME_FRAMES.find((f) => f.family === 'regular');
    expect(tile(regularFrame.id).find('.tv-frame-sub').text()).toBe(`第 1/${regularFrame.minTier} 階`);
    // A hidden family not found yet stays ???
    expect(tile(THEME_FRAMES.find((f) => f.family === 'nightOwl').id).find('.tv-frame-sub').text()).toBe('???');
    // 印鈔機 won last month: its throne frame can be worn
    expect(tile('mint').classes()).toContain('earned');
    expect(tile('mint').find('.tv-frame-sub').text()).toBe('已獲得');
    expect(tile('reticle').find('.tv-frame-sub').text()).toBe('拿過 2 次');
  });

  it('a frame opens how to get it, where I am and how many have it', async () => {
    const w = await mountCodex();
    await w.find('[data-testid="codex-frames"] [data-frame="bronze"]').trigger('click');
    await flushPromises();
    let d = w.find('[data-testid="codex-frame"]');
    expect(d.find('[data-testid="codex-frame-status"]').text()).toBe('未獲得');
    expect(d.find('[data-testid="codex-frame-how"]').text()).toContain(`收集滿 ${FRAME_TIERS[0].min} 個`);
    expect(d.find('[data-testid="codex-frame-progress"]').text()).toBe(`已收集 1 / ${FRAME_TIERS[0].min} 個，還差 ${FRAME_TIERS[0].min - 1} 個`);
    expect(d.find('[data-testid="codex-frame-counts"]').text()).toContain('全站 6 / 12 人拿到');
    expect(d.find('[data-testid="codex-frame-counts"]').text()).toContain('牌友圈 0 / 4 人拿到');

    route.query = { tab: 'frames', item: 'frame:mint' };
    await flushPromises();
    d = w.find('[data-testid="codex-frame"]');
    expect(d.find('[data-testid="codex-frame-status"]').text()).toBe('已獲得');
    expect(d.find('[data-testid="codex-frame-how"]').text()).toContain('下個月一整個月都能戴');
    const lines = d.findAll('[data-testid="codex-frame-line"]').map((p) => p.text());
    expect(lines).toEqual([
      `${label(PREV)} 拿下，${label(MONTH)} 整個月都能戴`,
      `拿過 1 次：${label(PREV)}`,
      '本月還沒有人達標',
    ]);
    await d.find('button.cd-link').trigger('click');
    expect(routerCalls.at(-1)).toEqual(['replace', { query: { tab: 'frames', item: 'crown:crownProfit' } }]);
  });
});

describe('leaderboard 只看牌友', () => {
  it('keeps me and my pals', () => {
    const rows = [{ uid: 'me' }, { uid: 'amy' }, { uid: 'zed' }];
    expect(filterToCircle(rows, 'me', ['amy', 'bob']).map((r) => r.uid)).toEqual(['me', 'amy']);
    expect(filterToCircle(rows, 'me', []).map((r) => r.uid)).toEqual(['me']);
    expect(filterToCircle(rows, null, ['amy'])).toBe(rows);
  });

  it('a toggle in the filter style, remembered with try/catch', () => {
    const src = readFileSync(resolve(__dirname, '../src/components/social/Leaderboard.vue'), 'utf-8');
    expect(src).toContain(":class=\"palsOnly ? 'bg-amber-600 text-white' : 'bg-slate-700 text-gray-300 hover:bg-slate-600'\"");
    expect(src).toContain('filterToCircle(statsRows.value, user.value?.uid, myPals.value)');
    expect(src).toMatch(/try \{\s*return localStorage\.getItem\(STORAGE_KEYS\.LEADERBOARD_PALS_ONLY\) === 'true';/);
    expect(src).toMatch(/try \{\s*localStorage\.setItem\(STORAGE_KEYS\.LEADERBOARD_PALS_ONLY/);
  });
});

describe('profile 指定 picker', () => {
  it('crowns worn this month (won last month) come first', () => {
    const src = readFileSync(resolve(__dirname, '../src/views/ProfileView.vue'), 'utf-8');
    expect(src).toMatch(/pickableTitles = computed\(\(\) => \[\s*\.\.\.heldCrownIds\.value\.map/);
    expect(src).toContain(':items="pickableTitles"');
  });
});
