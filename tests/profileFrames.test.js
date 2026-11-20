import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import zhTW from '../src/i18n/locales/zh-TW.json';
import { THEME_FRAMES, FRAME_TIERS } from '../functions/src/utils/titleRules.js';
import { STORAGE_KEYS } from '../src/utils/constants.js';
import { applyFxLite, isFxLite } from '../src/utils/fx.js';

// 我的 → 頭像框: 等級框 / 主題框 groups, locked ones with what they need, and
// the 簡化特效 switch.
// 12 titles held → bronze; hotStreak at 5 earns its themed frame, hunter at 4
// doesn't yet; nightOwl / badBeat are hidden families not found yet.
const myDoc = {
  ladder: 2,
  unlocked: { hotStreak: { tier: 5, at: 3 }, hunter: { tier: 4, at: 2 }, regular: { tier: 3, at: 1 } },
  prefs: { mode: 'auto', frame: 'auto', nameSet: 'classic' },
  display: { familyId: 'hotStreak', tier: 5, frame: 'bronze' },
};
const calls = [];
const themed = (family) => THEME_FRAMES.find((f) => f.family === family).id;

vi.mock('../src/firebase-init.js', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => async (prefs) => {
    calls.push(prefs);
    return { data: { prefs: { ...myDoc.prefs, ...prefs }, display: { ...myDoc.display, frame: prefs.frame } } };
  },
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db, collection, id) => ({ collection, id }),
  getDoc: async () => ({ exists: () => true, data: () => myDoc }),
  onSnapshot: (_ref, next) => {
    Promise.resolve().then(() => next({ exists: () => true, data: () => myDoc }));
    return () => {};
  },
}));
vi.mock('../src/composables/useAuth.js', () => ({
  useAuth: () => ({
    user: ref({ uid: 'me', photoURL: '' }), displayName: ref('Me'), isGuest: ref(false),
    logout: async () => {}, linkEmailToGuest: async () => true,
  }),
}));
vi.mock('../src/composables/usePushNotification.js', () => ({
  usePushNotification: () => ({ notificationsEnabled: ref(false), toggleNotifications: async () => ({ success: true }) }),
}));
vi.mock('../src/composables/useLiff.js', () => ({
  useLiff: () => ({ lineNotifyEnabled: ref(false), toggleLineNotify: () => {}, isInLineClient: ref(false) }),
}));
vi.mock('../src/composables/useNotification.js', () => ({
  useNotification: () => ({ error: () => {}, success: () => {} }),
}));
vi.mock('../src/composables/useLoading.js', () => ({ useLoading: () => ({ withLoading: (fn) => fn() }) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: () => {} }) }));

const { default: ProfileView } = await import('../src/views/ProfileView.vue');
const i18n = createI18n({ legacy: false, locale: 'zh-TW', messages: { 'zh-TW': zhTW } });

async function openPicker() {
  const w = mount(ProfileView, { global: { plugins: [i18n], stubs: { 'router-link': true } } });
  await flushPromises();
  const fold = w.findAll('button.title-fold').find((b) => b.text().includes('頭像框'));
  await fold.trigger('click');
  return w;
}

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
  document.documentElement.removeAttribute('data-fx');
});

describe('頭像框 picker', () => {
  it('two groups: 等級框 (off / auto / every tier) and 主題框 (the catalog)', async () => {
    const w = await openPicker();
    expect(w.text()).toContain('等級框');
    expect(w.text()).toContain('主題框');
    const tiers = w.find('[data-testid="frame-tiers"]');
    expect(tiers.findAll('.frame-opt')).toHaveLength(2 + FRAME_TIERS.length);
    expect(tiers.findAll('[data-frame]').map((b) => b.attributes('data-frame'))).toEqual(FRAME_TIERS.map((f) => f.id));
    const themes = w.find('[data-testid="frame-themes"]');
    expect(themes.findAll('[data-frame]').map((b) => b.attributes('data-frame'))).toEqual(THEME_FRAMES.map((f) => f.id));
    // Every option previews the frame on my avatar
    expect(themes.findAll('.frame-opt .pa')).toHaveLength(THEME_FRAMES.length);
    for (const f of THEME_FRAMES) {
      expect(themes.find(`[data-frame="${f.id}"] .pa`).classes()).toContain(`frame-${f.id}`);
      expect(themes.find(`[data-frame="${f.id}"] .frame-opt-name`).text()).toBe(zhTW.titles.frames[f.id]);
    }
  });

  it('locked tier frames say how many titles, locked themed ones which title', async () => {
    const w = await openPicker();
    const tier = (id) => w.find(`[data-testid="frame-tiers"] [data-frame="${id}"]`);
    expect(tier('bronze').classes()).not.toContain('locked');
    expect(tier('silver').classes()).toContain('locked');
    expect(tier('silver').attributes('disabled')).toBeDefined();
    expect(tier('silver').find('.frame-opt-sub').text()).toBe('收集 25 個稱號');
    expect(tier('platinum').find('.frame-opt-sub').text()).toBe('收集 80 個稱號');

    const theme = (family) => w.find(`[data-testid="frame-themes"] [data-frame="${themed(family)}"]`);
    // Earned: no condition, can be picked
    expect(theme('hotStreak').classes()).not.toContain('locked');
    expect(theme('hotStreak').attributes('disabled')).toBeUndefined();
    expect(theme('hotStreak').find('.frame-opt-sub').exists()).toBe(false);
    // One step short: the tier 5 title of the family, by name
    expect(theme('hunter').classes()).toContain('locked');
    expect(theme('hunter').attributes('disabled')).toBeDefined();
    expect(theme('hunter').find('.frame-opt-sub').text()).toBe(`取得第 5 階稱號「${zhTW.titles.families.hunter.t5}」`);
    expect(theme('netWin').find('.frame-opt-sub').text()).toBe(`取得第 5 階稱號「${zhTW.titles.families.netWin.t5}」`);
    // A hidden family not found yet keeps its name
    for (const family of ['nightOwl', 'badBeat']) {
      expect(theme(family).find('.frame-opt-sub').text()).toBe('某個隱藏稱號達到第 5 階');
      expect(theme(family).text()).not.toContain(zhTW.titles.families[family].t5);
    }
  });

  it('picking a themed frame saves it; the summary then shows its name', async () => {
    const w = await openPicker();
    const fire = themed('hotStreak');
    await w.find(`[data-testid="frame-themes"] [data-frame="${fire}"]`).trigger('click');
    await flushPromises();
    expect(calls).toEqual([{ frame: fire }]);
    expect(w.find(`[data-frame="${fire}"]`).classes()).toContain('active');
    const fold = w.findAll('button.title-fold').find((b) => b.text().includes('頭像框'));
    expect(fold.text()).toContain(zhTW.titles.frames[fire]);
    // A locked one does nothing
    await w.find(`[data-testid="frame-themes"] [data-frame="${themed('hunter')}"]`).trigger('click');
    await flushPromises();
    expect(calls).toHaveLength(1);
  });

  it('the options wrap inside the card and long text breaks instead of spilling', () => {
    const src = readFileSync(resolve(__dirname, '../src/views/ProfileView.vue'), 'utf-8');
    expect(src).toMatch(/\.frame-grid \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(4\.25rem, 1fr\)\);/);
    expect(src).toMatch(/\.frame-opt-name, \.frame-opt-sub \{ max-width: 100%; overflow-wrap: anywhere;/);
    expect(src).toMatch(/\.frame-opt \{[^}]*min-width: 0;/);
  });
});

describe('簡化特效', () => {
  it('the switch stores the flag and sets it on the document root', async () => {
    const w = mount(ProfileView, { global: { plugins: [i18n], stubs: { 'router-link': true } } });
    await flushPromises();
    const row = w.find('[data-testid="fx-lite"]');
    expect(row.text()).toContain('簡化特效');
    const sw = row.find('button[role="switch"]');
    expect(sw.attributes('aria-checked')).toBe('false');

    await sw.trigger('click');
    expect(sw.attributes('aria-checked')).toBe('true');
    expect(localStorage.getItem(STORAGE_KEYS.FX_LITE)).toBe('true');
    expect(document.documentElement.getAttribute('data-fx')).toBe('lite');

    await sw.trigger('click');
    expect(sw.attributes('aria-checked')).toBe('false');
    expect(localStorage.getItem(STORAGE_KEYS.FX_LITE)).toBe('false');
    expect(document.documentElement.hasAttribute('data-fx')).toBe(false);
  });

  it('starts from the stored choice', async () => {
    localStorage.setItem(STORAGE_KEYS.FX_LITE, 'true');
    const w = mount(ProfileView, { global: { plugins: [i18n], stubs: { 'router-link': true } } });
    await flushPromises();
    expect(w.find('[data-testid="fx-lite"] button[role="switch"]').attributes('aria-checked')).toBe('true');
  });

  it('applyFxLite / isFxLite: off by default, survive a storage that throws', () => {
    expect(isFxLite(STORAGE_KEYS.FX_LITE)).toBe(false);
    expect(applyFxLite(true)).toBe(true);
    expect(document.documentElement.getAttribute('data-fx')).toBe('lite');
    // Without a key nothing is stored
    expect(localStorage.getItem(STORAGE_KEYS.FX_LITE)).toBeNull();
    expect(applyFxLite(false, { storageKey: STORAGE_KEYS.FX_LITE })).toBe(false);
    expect(document.documentElement.hasAttribute('data-fx')).toBe(false);

    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('private mode'); });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('private mode'); });
    expect(isFxLite(STORAGE_KEYS.FX_LITE)).toBe(false);
    expect(applyFxLite(true, { storageKey: STORAGE_KEYS.FX_LITE })).toBe(true);
    expect(document.documentElement.getAttribute('data-fx')).toBe('lite');
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('read at app start, next to the theme', () => {
    const main = readFileSync(resolve(__dirname, '../src/main.js'), 'utf-8');
    expect(main).toContain('applyFxLite(isFxLite(THEME_STORAGE_KEYS.FX_LITE));');
  });

  it('the frame renderer reads the flag itself, watching the root for changes', () => {
    const src = readFileSync(resolve(__dirname, '../src/utils/frameFx.js'), 'utf-8');
    expect(src).toContain("root()?.getAttribute('data-fx') === 'lite'");
    expect(src).toContain("attributeFilter: ['data-fx', 'data-mode']");
  });
});
