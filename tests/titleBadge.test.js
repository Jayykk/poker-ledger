import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import zhTW from '../src/i18n/locales/zh-TW.json';
import { crownMonthOf } from '../functions/src/utils/crownRules.js';

const THIS_MONTH = crownMonthOf(Date.now());

const docs = {
  // Turned on (titles are opt-in); displays from before frames, resolved on the client
  alice: { ladder: 2, display: { familyId: 'champion', tier: 7 }, unlocked: { champion: { tier: 7, at: 1 } }, prefs: { mode: 'auto', frame: 'auto' } },
  bob: { ladder: 2, display: { familyId: 'regular', tier: 3 }, unlocked: { regular: { tier: 3, at: 1 } }, prefs: { mode: 'auto', frame: 'auto' } },
  carol: { ladder: 2, display: null, unlocked: {} },
  dora: { ladder: 2, display: { familyId: 'hunter', tier: 10, frame: null }, unlocked: { hunter: { tier: 10, at: 1 } }, prefs: { mode: 'auto' } },
  // Written before the ten-step ladders: old champion 4 (12 wins) is 王朝 (6) now
  evan: { display: { familyId: 'champion', tier: 4, frame: null }, unlocked: { champion: { tier: 4, at: 1 } }, prefs: { mode: 'auto', frame: 'none' } },
  // 中二版: the display carries the owner's name set
  fay: { ladder: 2, display: { familyId: 'champion', tier: 7, frame: null, nameSet: 'chuuni' }, unlocked: { champion: { tier: 7, at: 1 } }, prefs: { mode: 'auto', frame: 'none', nameSet: 'chuuni' } },
  // A display from before 頭像框 (no frame): resolved on the client, from the prefs
  gus: { ladder: 2, display: { familyId: 'regular', tier: 3 }, unlocked: { regular: { tier: 3, at: 1 } }, prefs: { mode: 'auto', frame: 'auto', nameSet: 'chuuni' } },
  // Holds a crown this month: it shows, in its one set of names
  hal: { ladder: 2, display: null, unlocked: { regular: { tier: 3, at: 1 } }, prefs: { mode: 'auto', frame: 'none', nameSet: 'chuuni' }, crowns: { crownHunter: THIS_MONTH } },
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
  it('shows the title a player displays, with rarity and a crown from legendary (tier 7) up', async () => {
    const gold = mountBadge({ uid: 'alice' });
    const blue = mountBadge({ uid: 'bob' });
    await flushPromises();

    expect(gold.text()).toBe('冠軍帝國');
    expect(gold.classes()).toContain('legendary');
    expect(gold.find('.fa-crown').exists()).toBe(true);

    expect(blue.text()).toBe('常客');
    expect(blue.classes()).toContain('rare');
    expect(blue.find('.fa-crown').exists()).toBe(false);
  });

  it('mythic (tier 9–10): its own prismatic look, crown icon, readable in both themes, no motion when asked', async () => {
    const w = mountBadge({ uid: 'dora' });
    await flushPromises();
    expect(w.text()).toBe('冥王');
    expect(w.classes()).toContain('mythic');
    expect(w.classes()).not.toContain('crown');
    expect(w.find('.fa-crown').exists()).toBe(true);
    expect(mountBadge({ familyId: 'netWin', tier: 9 }).classes()).toContain('mythic');
    const css = readFileSync(resolve(__dirname, '..', 'src/components/common/TitleBadge.vue'), 'utf-8');
    const mythic = css.match(/\.title-badge\.mythic \{[^}]*\}/)[0];
    expect(mythic).toContain('animation: title-badge-prism');
    expect(mythic).toContain('background-clip: padding-box, border-box;');
    // Never the crown's red-gold
    expect(mythic).not.toMatch(/190, 18, 60|224, 160, 48/);
    expect(css).toMatch(/:root\[data-mode="light"\] \.title-badge\.mythic \{[^}]*color: #5b21b6;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.title-badge\.mythic \{ animation: none; \}/);
    // Still a pill that truncates, at the width of its line
    expect(css).toMatch(/\.title-badge \{[^}]*max-width: 100%;/);
    expect(css).toContain('.title-badge-text { overflow: hidden; text-overflow: ellipsis; }');
  });

  it('a doc from before the ten-step ladders shows its mapped tier, not the old number', async () => {
    const w = mountBadge({ uid: 'evan' });
    await flushPromises();
    expect(w.text()).toBe('王朝');
    expect(w.classes()).toContain('epic');
    expect(w.find('.fa-crown').exists()).toBe(false);
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
    const w = mountBadge({ familyId: 'nightOwl', tier: 1 });
    expect(w.text()).toBe('夜貓子');
    expect(w.classes()).toContain('common');
    const legendary = mountBadge({ familyId: 'champion', tier: 8 });
    expect(legendary.classes()).toContain('legendary');
    expect(legendary.find('.fa-crown').exists()).toBe(true);
    expect(mountBadge({ familyId: 'champion', tier: 6 }).find('.fa-crown').exists()).toBe(false);
  });
});

describe('TitleBadge in the owner\'s name set (中二版)', () => {
  const chuuni = zhTW.titles.familiesChuuni;

  it('a chuuni display shows the chuuni name; rarity and crown icon are the tier\'s as ever', async () => {
    const w = mountBadge({ uid: 'fay' });
    const resolved = mountBadge({ uid: 'gus' });
    await flushPromises();
    expect(w.text()).toBe('冠軍帝國的皇帝');
    expect(w.text()).toBe(chuuni.champion.t7);
    expect(w.classes()).toContain('legendary');
    expect(w.find('.fa-crown').exists()).toBe(true);
    expect(w.attributes('title')).toContain(chuuni.champion.t7);
    // Re-resolved on the client (old display shape): the set comes from the prefs
    expect(resolved.text()).toBe(chuuni.regular.t3);
    // Next to it, a classic owner keeps the classic name
    const classic = mountBadge({ uid: 'alice' });
    await flushPromises();
    expect(classic.text()).toBe('冠軍帝國');
  });

  it('a crown is always in the classic names, whatever the owner picked', async () => {
    const held = mountBadge({ uid: 'hal' });
    await flushPromises();
    expect(held.text()).toBe('本月獵頭王');
    expect(held.classes()).toContain('crown');
    expect(mountBadge({ familyId: 'crownHunter', tier: 4, nameSet: 'chuuni' }).text()).toBe('本月獵頭王');
    expect(zhTW.titles.familiesChuuni.crownHunter).toBeUndefined();
  });

  it('familyId mode takes the set as a prop (picker / 圖鑑); none or an unknown one is classic', () => {
    expect(mountBadge({ familyId: 'nightOwl', tier: 10, nameSet: 'chuuni' }).text()).toBe('月神');
    expect(mountBadge({ familyId: 'badBeat', tier: 10, nameSet: 'chuuni' }).text()).toBe('萬惡的卑鄙之王');
    expect(mountBadge({ familyId: 'nightOwl', tier: 1, nameSet: 'classic' }).text()).toBe('夜貓子');
    expect(mountBadge({ familyId: 'nightOwl', tier: 1 }).text()).toBe('夜貓子');
    expect(mountBadge({ familyId: 'nightOwl', tier: 1, nameSet: 'emo' }).text()).toBe('夜貓子');
  });

  it('a chuuni name this language lacks falls back to the classic one', async () => {
    // A locale file from before the chuuni names, and one missing a single step
    const { familiesChuuni, ...titles } = zhTW.titles;
    const { t3: _dropped, ...regular } = familiesChuuni.regular;
    const partial = { ...familiesChuuni, regular };
    const mountWith = (messages, props) => mount(TitleBadge, {
      props,
      global: { plugins: [createI18n({ legacy: false, locale: 'zh-TW', missingWarn: false, messages: { 'zh-TW': messages } })] },
    });
    const none = mountWith({ ...zhTW, titles }, { uid: 'fay' });
    const gap = mountWith({ ...zhTW, titles: { ...titles, familiesChuuni: partial } }, { familyId: 'regular', tier: 3, nameSet: 'chuuni' });
    const kept = mountWith({ ...zhTW, titles: { ...titles, familiesChuuni: partial } }, { familyId: 'regular', tier: 4, nameSet: 'chuuni' });
    await flushPromises();
    expect(none.text()).toBe('冠軍帝國');
    expect(gap.text()).toBe('常客');
    expect(kept.text()).toBe(chuuni.regular.t4);
  });

  it('the pill is as wide as its line allows and only then truncates (no fixed cap)', () => {
    const css = readFileSync(resolve(__dirname, '..', 'src/components/common/TitleBadge.vue'), 'utf-8');
    expect(css).toMatch(/\.title-badge \{[^}]*min-width: 0;[^}]*max-width: 100%;[^}]*white-space: nowrap;/);
    expect(css).not.toMatch(/max-width: [\d.]+rem/);
    expect(css).toContain('.title-badge-text { overflow: hidden; text-overflow: ellipsis; }');
    const longest = Math.max(...Object.values(chuuni).flatMap((f) => Object.values(f)).map((n) => [...n].length));
    expect(longest).toBe(8);
  });
});

describe('badges next to names', () => {
  const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf-8');
  it.each([
    ['src/components/game/PlayerCard.vue', '<TitleBadge v-else :uid="player.uid" />'],
    ['src/components/game/TournamentPlayerCard.vue', '<TitleBadge v-else :uid="player.uid" />'],
    ['src/components/game/SeatDrawModal.vue', '<TitleBadge v-else-if="s.player?.uid" :uid="s.player.uid" />'],
    ['src/components/game/SeatTable.vue', '<TitleBadge v-else-if="picked.player.uid" :uid="picked.player.uid" />'],
    ['src/components/common/SettlementDetailModal.vue', '<TitleBadge v-if="player.odId" :uid="player.odId" />'],
    ['src/components/social/Leaderboard.vue', '<TitleBadge :uid="entry.uid" />'],
    ['src/components/social/Leaderboard.vue', '<TitleBadge :uid="myRankInfo.uid" />'],
    ['src/views/ProfileView.vue', '<TitleBadge :family-id="myDisplay.familyId" :tier="myDisplay.tier" :name-set="titlePrefs.nameSet" />'],
  ])('%s', (file, tag) => {
    const src = read(file);
    expect(src).toContain(tag);
    // Outside the rooms too the title has its own line under the name, never
    // beside it where a narrow phone cut it to "…"
    if (/SettlementDetail|Leaderboard|Seat/.test(file)) {
      const at = src.indexOf(tag);
      const line = src.lastIndexOf('<div class="title-line">', at);
      expect(line).toBeGreaterThan(-1);
      // nothing but badges between the line's opening tag and this badge
      expect(src.slice(line, at)).not.toContain('</div>');
      expect(src.slice(line, at)).not.toContain('{{');
      expect(src).not.toContain('shrink-[10]');
    }
  });

  it('the shared title line: full width, and no line at all without a title', () => {
    const css = read('src/styles/main.css');
    expect(css).toMatch(/\.title-line \{[^}]*display: flex;[^}]*min-width: 0;/);
    expect(css).toMatch(/\.title-line:empty \{[^}]*display: none;/);
    expect(read('src/components/common/LiveTitleBadge.vue')).toMatch(/\.live-badge \{[^}]*max-width: 100%;/);
  });

  it.each([
    ['src/components/game/PlayerCard.vue', 'c'],
    ['src/components/game/TournamentPlayerCard.vue', 't'],
  ])('%s: the title sits on its own line under the name, full width', (file, p) => {
    const src = read(file);
    expect(src).toContain(`<div v-if="liveTitle || player.uid" class="${p}-titles">`);
    expect(src).toContain(`.${p}-titles:empty { display: none; }`);
    expect(src).toContain(`.${p}-titles > .title-badge, .${p}-titles > .live-badge { max-width: 100%; }`);
    // the name line holds only seat, name and the D button
    expect(src).toMatch(new RegExp(`<span class="${p}-name">\\{\\{ player\\.name \\}\\}</span>\\s*<span v-if="isButton"`));
    // a long name wraps to two lines instead of "…"
    expect(src).toMatch(new RegExp(`\\.${p}-name \\{[^}]*-webkit-line-clamp: 2;`));
  });

  it('the codex has a route and the page width every page uses', () => {
    expect(read('src/main.js')).toMatch(/path: '\/titles', name: 'Titles', component: TitlesView, meta: \{ requiresAuth: true \}/);
    expect(read('src/views/TitlesView.vue')).toContain('class="pt-8 px-4 pb-nav w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto"');
  });
});

describe('profile 指定 picker', () => {
  const profile = readFileSync(resolve(__dirname, '..', 'src/views/ProfileView.vue'), 'utf-8');
  const grid = readFileSync(resolve(__dirname, '..', 'src/components/common/TitlePickGrid.vue'), 'utf-8');

  it('equal cells that keep a long name inside (no pill row)', () => {
    expect(profile).toMatch(/<TitlePickGrid\s+v-if="titlePrefs\.mode === 'pick' && pickableTitles\.length"\s+:items="pickableTitles"/);
    expect(grid).toContain('<div class="title-pick-grid">');
    expect(grid).toMatch(/\.title-pick-grid \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    expect(grid).toMatch(/\.title-pick \{[^}]*overflow: hidden;/);
    expect(grid).toContain('.title-pick > .title-badge { max-width: 100%; }');
  });

  it('the steps strip: full width under its row, badges wrap inside it', () => {
    // dense: the cells after the strip fill the row it opened from
    expect(grid).toMatch(/\.title-pick-grid \{[^}]*grid-auto-flow: row dense;/);
    expect(grid).toMatch(/\.title-tier-strip \{[^}]*grid-column: 1 \/ -1;[^}]*flex-wrap: wrap;/);
    expect(grid).toMatch(/\.title-tier-strip \{[^}]*min-width: 0;/);
    expect(grid).toMatch(/\.title-tier \{[^}]*max-width: 100%;/);
    expect(grid).toContain('.title-tier > .title-badge { max-width: 100%; }');
  });

  it('a stable order: same tier and time fall back to 圖鑑 order (the list jumped on every pick)', () => {
    expect(profile).toContain('|| (familyOrder.get(a.familyId) - familyOrder.get(b.familyId))');
  });
});
