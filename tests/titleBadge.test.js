import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import zhTW from '../src/i18n/locales/zh-TW.json';

const docs = {
  // Turned on (titles are opt-in); displays from before frames, resolved on the client
  alice: { display: { familyId: 'champion', tier: 4 }, unlocked: { champion: { tier: 4, at: 1 } }, prefs: { mode: 'auto', frame: 'auto' } },
  bob: { display: { familyId: 'regular', tier: 2 }, unlocked: { regular: { tier: 2, at: 1 } }, prefs: { mode: 'auto', frame: 'auto' } },
  carol: { display: null, unlocked: {} },
};
const reads = [];

vi.mock('../src/firebase-init.js', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => async () => ({ data: {} }) }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, collection, id) => ({ collection, id }),
  getDoc: async (ref) => {
    reads.push(ref.id);
    const data = docs[ref.id];
    return { exists: () => !!data, data: () => data };
  },
  onSnapshot: () => () => {},
}));

const { default: TitleBadge } = await import('../src/components/common/TitleBadge.vue');
const i18n = createI18n({ legacy: false, locale: 'zh-TW', messages: { 'zh-TW': zhTW } });
const mountBadge = (props) => mount(TitleBadge, { props, global: { plugins: [i18n] } });

describe('TitleBadge', () => {
  it('shows the title a player displays, with rarity and a crown only for legendary', async () => {
    const gold = mountBadge({ uid: 'alice' });
    const blue = mountBadge({ uid: 'bob' });
    await flushPromises();

    expect(gold.text()).toBe('不朽傳奇');
    expect(gold.classes()).toContain('legendary');
    expect(gold.find('.fa-crown').exists()).toBe(true);

    expect(blue.text()).toBe('常客');
    expect(blue.classes()).toContain('rare');
    expect(blue.find('.fa-crown').exists()).toBe(false);
  });

  it('renders nothing without a displayed title', async () => {
    const none = mountBadge({ uid: 'carol' });
    const missing = mountBadge({ uid: 'nobody' });
    await flushPromises();
    expect(none.html()).not.toContain('title-badge');
    expect(missing.html()).not.toContain('title-badge');
  });

  it('one read per player, however many badges', async () => {
    mountBadge({ uid: 'alice' });
    mountBadge({ uid: 'alice' });
    await flushPromises();
    expect(reads.filter((id) => id === 'alice')).toHaveLength(1);
  });

  it('a 本月王座 crown: crown icon and its own red-gold, apart from a legendary title', () => {
    const w = mountBadge({ familyId: 'crownHunter', tier: 4 });
    expect(w.text()).toBe('本月獵頭王');
    expect(w.classes()).toEqual(expect.arrayContaining(['legendary', 'crown']));
    expect(w.find('.fa-crown').exists()).toBe(true);
    const css = readFileSync(resolve(__dirname, '..', 'src/components/common/TitleBadge.vue'), 'utf-8');
    expect(css).toMatch(/\.title-badge\.crown \{[^}]*background: rgba\(190, 18, 60, 0\.3\);/);
    expect(css).toMatch(/:root\[data-mode="light"\] \.title-badge\.crown \{[^}]*color: #9f1239;/);
  });

  it('can show a given family + tier (codex / picker)', () => {
    const w = mountBadge({ familyId: 'nightOwl', tier: 3 });
    expect(w.text()).toBe('夜貓子');
    expect(w.classes()).toContain('epic');
  });
});

describe('badges next to names', () => {
  const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf-8');
  it.each([
    ['src/components/game/PlayerCard.vue', '<TitleBadge v-else-if="player.uid" :uid="player.uid" />'],
    ['src/components/game/TournamentPlayerCard.vue', '<TitleBadge v-else-if="player.uid" :uid="player.uid" />'],
    ['src/components/game/SeatDrawModal.vue', '<TitleBadge v-else-if="s.player?.uid" :uid="s.player.uid" />'],
    ['src/components/common/SettlementDetailModal.vue', '<TitleBadge v-if="player.odId" :uid="player.odId" />'],
    ['src/components/social/Leaderboard.vue', '<TitleBadge :uid="entry.uid" />'],
    ['src/views/ProfileView.vue', '<TitleBadge :family-id="myDisplay.familyId" :tier="myDisplay.tier" />'],
  ])('%s', (file, tag) => {
    const src = read(file);
    expect(src).toContain(tag);
    // The name gives way first on a narrow phone
    if (!file.includes('SeatDraw') && !file.includes('ProfileView')) expect(src).toContain('truncate shrink-[10]');
  });

  it('the codex has a route and the page width every page uses', () => {
    expect(read('src/main.js')).toMatch(/path: '\/titles', name: 'Titles', component: TitlesView, meta: \{ requiresAuth: true \}/);
    expect(read('src/views/TitlesView.vue')).toContain('class="pt-8 px-4 pb-nav w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto"');
  });
});

describe('profile 指定 picker', () => {
  const profile = readFileSync(resolve(__dirname, '..', 'src/views/ProfileView.vue'), 'utf-8');

  it('equal cells that keep a long name inside (no pill row)', () => {
    expect(profile).toContain(`<div v-if="titlePrefs.mode === 'pick' && pickableTitles.length" class="title-pick-grid">`);
    expect(profile).toMatch(/\.title-pick-grid \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    expect(profile).toMatch(/\.title-pick \{[^}]*overflow: hidden;/);
    expect(profile).toContain('.title-pick > .title-badge { max-width: 100%; }');
  });

  it('a stable order: same tier and time fall back to 圖鑑 order (the list jumped on every pick)', () => {
    expect(profile).toContain('|| (familyOrder.get(a.familyId) - familyOrder.get(b.familyId))');
  });
});
