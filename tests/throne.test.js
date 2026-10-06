import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import zhTW from '../src/i18n/locales/zh-TW.json';
import { crownMonthOf } from '../functions/src/utils/crownRules.js';
import { filterToCircle } from '../src/utils/leaderboardRanking.js';

const MONTH = crownMonthOf(Date.now());
const month = (uid, { games = 1, profit = 0, knockouts = 0 } = {}) => ({
  uid, name: uid.toUpperCase(), hidden: false, period: MONTH, periodType: 'month',
  total: { games, profit, groupGames: 0, sumGroups: 0, sumSqGroups: 0 },
  cash: {},
  tournament: { knockouts },
});

// collection/id → data
const docs = {
  'userTitles/me': {
    unlocked: { regular: { tier: 1, at: 1 } },
    pals: ['amy', 'bob'],
    crowns: { crownRegular: MONTH },
    crownHistory: { crownHunter: ['2026-01', '2026-03'] },
    display: { familyId: 'crownRegular', tier: 4, frame: null, month: MONTH },
  },
  'userTitles/amy': { unlocked: {}, name: 'Amy' },
  'userTitles/bob': { unlocked: {}, name: 'Bob' },
  // A crown display from an older month: shown as what auto falls back to
  'userTitles/old': {
    unlocked: { host: { tier: 2, at: 1 } },
    crowns: { crownHunter: '2020-01' },
    display: { familyId: 'crownHunter', tier: 4, frame: null, month: '2020-01' },
  },
  [`leaderboardStats/me_${MONTH}`]: month('me', { games: 3, knockouts: 2, profit: -300 }),
  [`leaderboardStats/amy_${MONTH}`]: month('amy', { games: 3, knockouts: 4 }),
  [`leaderboardStats/bob_${MONTH}`]: month('bob', { games: 1, knockouts: 4, profit: -300 }),
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

const { default: TitlesView } = await import('../src/views/TitlesView.vue');
const { ensureUserTitles, titleDisplayOf } = await import('../src/composables/useUserTitles.js');
const i18n = createI18n({ legacy: false, locale: 'zh-TW', messages: { 'zh-TW': zhTW } });

describe('稱號圖鑑 王座 section', () => {
  it('this month\'s 5 crowns in my circle: holders (ties together), my gap, 歷代', async () => {
    const w = mount(TitlesView, { global: { plugins: [i18n], mocks: { $router: { push: () => {} } } } });
    await flushPromises();
    await flushPromises();
    const throne = w.find('[data-testid="throne"]');
    expect(throne.exists()).toBe(true);
    const card = (id) => throne.find(`[data-crown="${id}"]`);
    expect(throne.findAll('[data-crown]')).toHaveLength(5);

    // amy and bob tie on knockouts: both shown; me 2 short
    expect(card('crownHunter').find('.tv-holders').text()).toBe('AMY · BOB');
    expect(card('crownHunter').findAll('.tv-stack .pa')).toHaveLength(2);
    expect(card('crownHunter').find('.tv-me').text()).toBe('我 2 淘汰 · 差 2 淘汰');
    expect(card('crownHunter').text()).toContain('歷代 2');

    // me and amy tie on games: shared, and marked as mine
    expect(card('crownRegular').classes()).toContain('held');
    expect(card('crownRegular').find('.tv-me').text()).toContain('你和牌友並列王座');

    // nobody won money: vacant; me and bob tie on the loss
    expect(card('crownProfit').text()).toContain('從缺');
    expect(card('crownLoss').find('.tv-holders').text()).toBe('Me · BOB');
    expect(card('crownBoss').find('.tv-me').text()).toBe('本月滿 4 場有組數的牌局才列入');

    // One month doc per circle member
    expect(reads.filter((p) => p.startsWith('leaderboardStats/') && p.endsWith(MONTH)).sort())
      .toEqual(['amy', 'bob', 'me'].map((u) => `leaderboardStats/${u}_${MONTH}`));
  });

  it('client display: a crown from an older month falls back like auto', async () => {
    await ensureUserTitles('old');
    expect(titleDisplayOf('old')).toEqual({ familyId: 'host', tier: 2, frame: null });
  });

  it('cards keep long names and several holders inside on a phone', () => {
    const src = readFileSync(resolve(__dirname, '../src/views/TitlesView.vue'), 'utf-8');
    expect(src).toMatch(/\.tv-holders \{[^}]*min-width: 0;[^}]*text-overflow: ellipsis;/);
    expect(src).toMatch(/\.tv-me \{[^}]*overflow: hidden;/);
    expect(src).toContain('row.holders.slice(0, 3)');
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
  it('crowns held this month come first', () => {
    const src = readFileSync(resolve(__dirname, '../src/views/ProfileView.vue'), 'utf-8');
    expect(src).toMatch(/pickableTitles = computed\(\(\) => \[\s*\.\.\.heldCrownIds\.value\.map/);
    expect(src).toContain('v-for="item in pickableTitles"');
  });
});
