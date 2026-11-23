import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reactive, ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import zhTW from '../src/i18n/locales/zh-TW.json';

// 我的 › 稱號 › 指定: pick a family, and which of its reached steps to show

const MONTH = '2026-11';
// 王座 won in October are worn in November
const WON = '2026-10';
const titles = reactive({});
const saveTitlePrefs = vi.fn(async (uid, prefs) => {
  // What the callable answers: the prefs saved (the display is not needed here)
  titles[uid] = { ...titles[uid], prefs: { ...titles[uid].prefs, ...prefs } };
  return { prefs: titles[uid].prefs, display: null };
});

vi.mock('../src/composables/useUserTitles.js', () => {
  const api = {
    titles,
    saveTitlePrefs,
    watchMyTitles: () => () => {},
    titleDisplayOf: () => null,
    currentCrownMonth: () => MONTH,
    ensureUserTitles: async () => {},
    avatarOf: () => '',
    frameOf: () => null,
    wearsCrown: () => false,
  };
  return { ...api, useUserTitles: () => api };
});
vi.mock('../src/composables/useAuth.js', () => ({
  useAuth: () => ({
    displayName: ref('Me'),
    isGuest: ref(false),
    user: ref({ uid: 'me', photoURL: null }),
    logout: async () => {},
    linkEmailToGuest: async () => true,
  }),
}));
vi.mock('../src/composables/usePushNotification.js', () => ({
  usePushNotification: () => ({ notificationsEnabled: ref(false), toggleNotifications: async () => ({ success: true }) }),
}));
vi.mock('../src/composables/useNotification.js', () => ({
  useNotification: () => ({ error: vi.fn(), success: vi.fn() }),
}));
vi.mock('../src/composables/useLoading.js', () => ({
  useLoading: () => ({ withLoading: (fn) => fn() }),
}));
vi.mock('../src/composables/useLiff.js', () => ({
  useLiff: () => ({ lineNotifyEnabled: ref(false), toggleLineNotify: () => {}, isInLineClient: ref(false) }),
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: () => {} }) }));

const { default: ProfileView } = await import('../src/views/ProfileView.vue');
const { default: TitlePickGrid } = await import('../src/components/common/TitlePickGrid.vue');
const i18n = createI18n({ legacy: false, locale: 'zh-TW', messages: { 'zh-TW': zhTW } });
const global = { plugins: [i18n], stubs: { 'router-link': { template: '<a><slot /></a>' } } };

const names = (wrapper) => wrapper.findAll('.title-badge-text').map((w) => w.text());
const zh = zhTW.titles.families;

async function openProfilePicker() {
  const w = mount(ProfileView, { global });
  await flushPromises();
  // 顯示方式 starts folded
  await w.find('button.title-fold').trigger('click');
  return w;
}

describe('profile 指定: steps of a family', () => {
  beforeEach(() => {
    saveTitlePrefs.mockClear();
    titles.me = {
      unlocked: { regular: { tier: 4, at: 1 }, host: { tier: 1, at: 2 } },
      prefs: { mode: 'pick', titleId: 'host', titleTier: null, showRoomTitles: false, frame: 'none' },
      crowns: { crownHunter: WON },
      display: null,
    };
  });

  it('opens the strip under the family, lists its reached steps highest first, saves a lower one and closes', async () => {
    const w = await openProfilePicker();
    const cells = w.findAll('.title-pick');
    // Crown first, then by tier: regular (4), host (1)
    expect(cells.map((c) => c.find('.title-badge-text').text()))
      .toEqual([zhTW.titles.families.crownHunter.t4, zh.regular.t4, zh.host.t1]);
    expect(w.find('.title-tier-strip').exists()).toBe(false);

    await cells[1].trigger('click');
    const strip = w.find('.title-tier-strip');
    expect(strip.exists()).toBe(true);
    expect(cells[1].attributes('aria-expanded')).toBe('true');
    expect(names(strip)).toEqual([zh.regular.t4, zh.regular.t3, zh.regular.t2, zh.regular.t1]);
    // Not the current pick: nothing checked yet, and nothing saved by opening
    expect(strip.findAll('.title-tier.active')).toHaveLength(0);
    expect(saveTitlePrefs).not.toHaveBeenCalled();

    await strip.findAll('.title-tier')[2].trigger('click');
    await flushPromises();
    expect(saveTitlePrefs).toHaveBeenCalledWith('me', { mode: 'pick', titleId: 'regular', titleTier: 2 });
    expect(w.find('.title-tier-strip').exists()).toBe(false);
    // The cell now shows the picked step, checked
    const picked = w.findAll('.title-pick')[1];
    expect(picked.classes()).toContain('active');
    expect(picked.find('.title-badge-text').text()).toBe(zh.regular.t2);
    expect(picked.find('.title-badge').classes()).toContain('common');

    // Open again: the picked step is the checked one
    await picked.trigger('click');
    const again = w.find('.title-tier-strip');
    expect(again.findAll('.title-tier.active').map((b) => b.find('.title-badge-text').text())).toEqual([zh.regular.t2]);
    // Tapping the family again folds it
    await w.findAll('.title-pick')[1].trigger('click');
    expect(w.find('.title-tier-strip').exists()).toBe(false);
  });

  it('a family on its first step and a crown are picked on tap, no strip', async () => {
    titles.me.prefs = { ...titles.me.prefs, titleId: 'regular', titleTier: 3 };
    const w = await openProfilePicker();
    await w.findAll('.title-pick')[2].trigger('click');
    await flushPromises();
    expect(w.find('.title-tier-strip').exists()).toBe(false);
    expect(saveTitlePrefs).toHaveBeenLastCalledWith('me', { mode: 'pick', titleId: 'host', titleTier: null });

    await w.findAll('.title-pick')[0].trigger('click');
    await flushPromises();
    expect(w.find('.title-tier-strip').exists()).toBe(false);
    expect(saveTitlePrefs).toHaveBeenLastCalledWith('me', { mode: 'pick', titleId: 'crownHunter', titleTier: null });
  });
});

describe('profile 名稱風格 switch', () => {
  const chuuni = zhTW.titles.familiesChuuni;
  const opt = (w, id) => w.find(`[data-testid="name-set"] [data-name-set="${id}"]`);

  beforeEach(() => {
    saveTitlePrefs.mockClear();
    titles.me = {
      unlocked: { regular: { tier: 4, at: 1 }, host: { tier: 1, at: 2 } },
      prefs: { mode: 'pick', titleId: 'regular', titleTier: null, showRoomTitles: false, frame: 'none' },
      crowns: { crownHunter: WON },
      display: null,
    };
  });

  it('two options with the display settings, classic on until the player switches', async () => {
    const w = await openProfilePicker();
    const row = w.find('[data-testid="name-set"]');
    expect(row.exists()).toBe(true);
    expect(row.text()).toContain(zhTW.titles.nameSet);
    expect(row.findAll('button').map((b) => b.text())).toEqual(['經典', '氣質']);
    expect(opt(w, 'classic').classes()).toContain('active');
    expect(opt(w, 'classic').attributes('aria-pressed')).toBe('true');
    expect(opt(w, 'chuuni').classes()).not.toContain('active');
    // Folded away with the rest of 顯示方式
    await w.find('button.title-fold').trigger('click');
    expect(w.find('[data-testid="name-set"]').exists()).toBe(false);
  });

  it('saves nameSet, and the picker (cells and steps) shows the names in the new set; crowns stay', async () => {
    const w = await openProfilePicker();
    expect(names(w.find('.title-pick-grid'))).toEqual([zhTW.titles.families.crownHunter.t4, zh.regular.t4, zh.host.t1]);

    await opt(w, 'chuuni').trigger('click');
    await flushPromises();
    expect(saveTitlePrefs).toHaveBeenCalledTimes(1);
    expect(saveTitlePrefs).toHaveBeenCalledWith('me', { nameSet: 'chuuni' });
    expect(opt(w, 'chuuni').classes()).toContain('active');
    expect(names(w.find('.title-pick-grid')))
      .toEqual([zhTW.titles.families.crownHunter.t4, chuuni.regular.t4, chuuni.host.t1]);
    await w.findAll('.title-pick')[1].trigger('click');
    expect(names(w.find('.title-tier-strip')))
      .toEqual([chuuni.regular.t4, chuuni.regular.t3, chuuni.regular.t2, chuuni.regular.t1]);
    await w.findAll('.title-pick')[1].trigger('click');

    // The one already on saves nothing; back to classic saves that
    await opt(w, 'chuuni').trigger('click');
    await flushPromises();
    expect(saveTitlePrefs).toHaveBeenCalledTimes(1);
    await opt(w, 'classic').trigger('click');
    await flushPromises();
    expect(saveTitlePrefs).toHaveBeenLastCalledWith('me', { nameSet: 'classic' });
    expect(names(w.find('.title-pick-grid'))).toEqual([zhTW.titles.families.crownHunter.t4, zh.regular.t4, zh.host.t1]);
  });

  it('the switch keeps its size and the label gives way (nothing leaves the card on a phone)', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const src = readFileSync(resolve(__dirname, '..', 'src/views/ProfileView.vue'), 'utf-8');
    expect(src).toMatch(/\.title-nameset \{[^}]*min-width: 0;/);
    expect(src).toMatch(/\.title-nameset-opts \{[^}]*flex-shrink: 0;/);
    expect(src).toMatch(/\.title-nameset-opt \{[^}]*white-space: nowrap;/);
    // The summary badge and the grid get the player's set
    expect(src).toContain(':family-id="myDisplay.familyId" :tier="myDisplay.tier" :name-set="titlePrefs.nameSet" />');
    expect(src).toMatch(/<TitlePickGrid[^>]*:name-set="titlePrefs\.nameSet"/);
  });
});

describe('TitlePickGrid', () => {
  const items = [
    { familyId: 'crownHunter', tier: 4 },
    { familyId: 'champion', tier: 6 },
    { familyId: 'regular', tier: 3 },
    { familyId: 'nightOwl', tier: 1 },
  ];
  const mountGrid = (props = {}) => mount(TitlePickGrid, { props: { items, ...props }, global: { plugins: [i18n] } });

  it('the strip sits right after the tapped cell, full width; one open at a time', async () => {
    const w = mountGrid();
    await w.findAll('.title-pick')[1].trigger('click');
    // DOM: crown, champion, strip, regular, nightOwl (dense flow fills the row back)
    const kids = w.find('.title-pick-grid').element.children;
    expect(kids[2].classList.contains('title-tier-strip')).toBe(true);
    expect(w.findAll('.title-tier')).toHaveLength(6);

    await w.findAll('.title-pick')[2].trigger('click');
    expect(w.findAll('.title-tier-strip')).toHaveLength(1);
    expect(w.findAll('.title-tier')).toHaveLength(3);
    expect(w.emitted('pick')).toBeUndefined();
  });

  it('the top step is saved as null (keeps following new tiers); the shown step can be clamped', async () => {
    const w = mountGrid({ pickedId: 'champion', pickedTier: 9 });
    // Picked step above the reached one (lowered by a rebuild): shows the reached
    expect(w.findAll('.title-pick')[1].find('.title-badge-text').text()).toBe(zh.champion.t6);
    await w.findAll('.title-pick')[2].trigger('click');
    await w.findAll('.title-tier')[0].trigger('click');
    expect(w.emitted('pick')[0]).toEqual([{ titleId: 'regular', titleTier: null }]);
    // The clamped pick shows the top step while 9 is still saved: tapping it
    // resets to following the highest (Codex review on #273)
    await w.findAll('.title-pick')[1].trigger('click');
    await w.findAll('.title-tier')[0].trigger('click');
    expect(w.emitted('pick')[1]).toEqual([{ titleId: 'champion', titleTier: null }]);
    expect(w.find('.title-tier-strip').exists()).toBe(false);
  });

  it('a tap that changes nothing saves nothing, it just closes', async () => {
    // Following the highest already: tapping the top step
    const top = mountGrid({ pickedId: 'champion', pickedTier: null });
    await top.findAll('.title-pick')[1].trigger('click');
    await top.findAll('.title-tier')[0].trigger('click');
    expect(top.emitted('pick')).toBeUndefined();
    expect(top.find('.title-tier-strip').exists()).toBe(false);
    // A lower step already saved: tapping that step again
    const low = mountGrid({ pickedId: 'champion', pickedTier: 3 });
    await low.findAll('.title-pick')[1].trigger('click');
    await low.findAll('.title-tier')[3].trigger('click'); // 6,5,4,3 → 3
    expect(low.emitted('pick')).toBeUndefined();
    // …and a different step saves it
    await low.findAll('.title-pick')[1].trigger('click');
    await low.findAll('.title-tier')[1].trigger('click'); // 5
    expect(low.emitted('pick')[0]).toEqual([{ titleId: 'champion', titleTier: 5 }]);
  });

  it('names in the set it is given; a crown keeps its one name', async () => {
    const c = zhTW.titles.familiesChuuni;
    const w = mountGrid({ nameSet: 'chuuni' });
    expect(names(w)).toEqual([zhTW.titles.families.crownHunter.t4, c.champion.t6, c.regular.t3, c.nightOwl.t1]);
    await w.findAll('.title-pick')[2].trigger('click');
    expect(names(w.find('.title-tier-strip'))).toEqual([c.regular.t3, c.regular.t2, c.regular.t1]);
    expect(names(mountGrid())).toEqual([zhTW.titles.families.crownHunter.t4, zh.champion.t6, zh.regular.t3, zh.nightOwl.t1]);
  });

  it('only the reached steps, and nothing while saving', async () => {
    const w = mountGrid({ disabled: true });
    expect(w.findAll('.title-pick').every((b) => b.attributes('disabled') !== undefined)).toBe(true);
    // Single step / crown cells have no chevron (nothing to open)
    expect(w.findAll('.title-pick').map((b) => b.find('.title-pick-more').exists())).toEqual([false, true, true, false]);
  });
});
