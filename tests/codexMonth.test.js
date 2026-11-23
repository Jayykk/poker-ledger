/**
 * 稱號圖鑑 left open across the month change: November's race leader becomes
 * December's wearer (在位 row, its 王座框 on my header) without a remount.
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import zhTW from '../src/i18n/locales/zh-TW.json';

// Fake time from before anything loads: the month clock is an interval
vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
vi.setSystemTime(new Date('2026-11-30T23:58:00+08:00'));
const NOV = '2026-11';

const docs = {
  'userTitles/me': {
    ladder: 2,
    unlocked: { regular: { tier: 1, at: 1 } },
    pals: ['amy', 'bob', 'cy'],
    // Picked the 印鈔機 frame: worn once the crown is
    prefs: { mode: 'auto', frame: 'mint' },
    // Leading November's 印鈔機 race
    crowns: { crownProfit: NOV },
    display: { familyId: 'regular', tier: 1, frame: null },
  },
  'userTitles/amy': { ladder: 2, unlocked: {}, name: 'Amy' },
  'userTitles/bob': { ladder: 2, unlocked: {}, name: 'Bob' },
  'userTitles/cy': { ladder: 2, unlocked: {}, name: 'Cy' },
};

vi.mock('../src/firebase-init.js', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => async () => ({ data: {} }) }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, collection, id) => ({ path: `${collection}/${id}`, id }),
  getDoc: async (r) => ({ exists: () => !!docs[r.path], data: () => docs[r.path] }),
  onSnapshot: (r, next) => {
    Promise.resolve().then(() => next({ exists: () => !!docs[r.path], data: () => docs[r.path] }));
    return () => {};
  },
}));
vi.mock('../src/composables/useAuth.js', () => ({
  useAuth: () => ({ user: ref({ uid: 'me', photoURL: '' }), displayName: ref('Me') }),
}));
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue');
  const route = reactive({ path: '/titles', query: {} });
  return { useRoute: () => route, useRouter: () => ({ push() {}, replace() {}, back() {} }) };
});

const { default: TitlesView } = await import('../src/views/TitlesView.vue');
const i18n = createI18n({ legacy: false, locale: 'zh-TW', messages: { 'zh-TW': zhTW } });

describe('稱號圖鑑 across the month change', () => {
  afterAll(() => vi.useRealTimers());

  it('the leader of the month that just ended shows as wearing it, without a remount', async () => {
    const w = mount(TitlesView, { global: { plugins: [i18n], mocks: { $router: { push: () => {} } } } });
    await flushPromises();
    await flushPromises();
    const reigning = () => w.find('[data-crown="crownProfit"] [data-testid="throne-reigning"]').text();
    expect(reigning()).toContain('從缺');
    // My header avatar: no frame yet (stored display, nothing worn)
    expect(w.find('.pa.frame-mint').exists()).toBe(false);
    expect(w.find('[data-testid="throne"]').text()).toContain('2026-11');

    // 00:01 on the 1st, Taipei: only the clock moved
    vi.advanceTimersByTime(3 * 60 * 1000);
    await flushPromises();
    expect(w.find('[data-testid="throne"]').text()).toContain('2026-12');
    expect(reigning()).toContain('Me');
    expect(w.find('[data-crown="crownProfit"]').classes()).toContain('held');
    // The stored display still says no frame: the header follows the resolved one
    expect(docs['userTitles/me'].display.frame).toBeNull();
    expect(w.find('.pa.frame-mint').exists()).toBe(true);
  });
});
