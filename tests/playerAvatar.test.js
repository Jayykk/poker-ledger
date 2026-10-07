import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import zhTW from '../src/i18n/locales/zh-TW.json';
import { crownMonthOf } from '../functions/src/utils/crownRules.js';

const NOW_MONTH = crownMonthOf(Date.now());

const docs = {
  // Wears a crown this month, titles on / off, and one from an older month
  kim: { unlocked: {}, prefs: { mode: 'auto' }, crowns: { crownHunter: NOW_MONTH } },
  lee: { unlocked: {}, prefs: { mode: 'off' }, crowns: { crownHunter: NOW_MONTH } },
  max: { unlocked: {}, prefs: { mode: 'pick', titleId: 'regular' }, crowns: { crownHunter: '2020-01' } },
  dave: {
    display: { familyId: 'regular', tier: 2, frame: 'gold' },
    unlocked: { regular: { tier: 2, at: 1 } },
    avatar: 'https://profile.line-scdn.net/dave.jpg',
    name: 'Dave',
  },
  // Title off, frame still shown
  erin: {
    display: { familyId: null, tier: null, frame: 'diamond' },
    unlocked: {},
    prefs: { mode: 'off', showRoomTitles: false },
  },
  // Written before frames existed: 4 + 4 + 1 = 9 titles → silver, resolved on the client
  olga: {
    display: { familyId: 'champion', tier: 4 },
    unlocked: { champion: { tier: 4, at: 3 }, regular: { tier: 4, at: 2 }, host: { tier: 1, at: 1 } },
    prefs: { mode: 'auto', frame: 'auto' },
  },
  // Title off before frames existed (display null), 4 titles → bronze
  pete: { display: null, unlocked: { regular: { tier: 4, at: 1 } }, prefs: { mode: 'off', frame: 'auto' } },
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

const { default: PlayerAvatar } = await import('../src/components/common/PlayerAvatar.vue');
const { default: TitleBadge } = await import('../src/components/common/TitleBadge.vue');
const { default: LiveTitleBadge } = await import('../src/components/common/LiveTitleBadge.vue');
const { titleDisplayOf, frameOf, allowsRoomTitles, ensureUserTitles, wearsCrown } = await import('../src/composables/useUserTitles.js');

describe('本月王座 corner crown', () => {
  it('only while wearing a crown this month with titles turned on', async () => {
    await ensureUserTitles(['kim', 'lee', 'max']);
    expect(wearsCrown('kim')).toBe(true);
    expect(wearsCrown('lee')).toBe(false); // titles off: the crown is a title too
    expect(wearsCrown('max')).toBe(false); // last time was 2020
    expect(wearsCrown('nobody')).toBe(false);
  });

  it('sits on the avatar by uid, or as given', async () => {
    const i18n = createI18n({ legacy: false, locale: 'zh-TW', messages: { 'zh-TW': zhTW } });
    const at = (props) => mount(PlayerAvatar, { props, global: { plugins: [i18n] } });
    const kim = at({ uid: 'kim', name: 'Kim' });
    const lee = at({ uid: 'lee', name: 'Lee' });
    await flushPromises();
    expect(kim.find('.pa-crown .fa-crown').exists()).toBe(true);
    expect(kim.find('.pa-crown').attributes('title')).toBe('本月王座');
    expect(lee.find('.pa-crown').exists()).toBe(false);
    expect(at({ name: 'A', crown: true }).find('.pa-crown').exists()).toBe(true);
    expect(at({ uid: 'kim', name: 'Kim', crown: false }).find('.pa-crown').exists()).toBe(false);
  });
});
const i18n = createI18n({ legacy: false, locale: 'zh-TW', messages: { 'zh-TW': zhTW } });
const mountWith = (component, props) => mount(component, { props, global: { plugins: [i18n] } });

describe('PlayerAvatar', () => {
  it('shows the image, or the first character of the name', async () => {
    const pic = mountWith(PlayerAvatar, { src: 'https://example.com/a.png', name: 'Alice', frame: null });
    expect(pic.find('img').attributes('src')).toBe('https://example.com/a.png');
    expect(pic.find('.pa-initial').exists()).toBe(false);

    const initial = mountWith(PlayerAvatar, { name: '  bob', frame: null });
    expect(initial.find('img').exists()).toBe(false);
    expect(initial.find('.pa-initial').text()).toBe('B');
    expect(mountWith(PlayerAvatar, { name: '小明', frame: null }).text()).toBe('小');
    expect(mountWith(PlayerAvatar, { name: '', frame: null }).text()).toBe('?');
  });

  it('a blue dot for a seat linked to an account', () => {
    expect(mountWith(PlayerAvatar, { name: 'A', frame: null, linked: true }).find('.pa-linked').exists()).toBe(true);
    expect(mountWith(PlayerAvatar, { name: 'A', frame: null }).find('.pa-linked').exists()).toBe(false);
  });

  it('falls back to the initial when the image fails', async () => {
    const w = mountWith(PlayerAvatar, { src: 'https://example.com/broken.png', name: 'Carl', frame: null });
    await w.find('img').trigger('error');
    expect(w.find('img').exists()).toBe(false);
    expect(w.text()).toBe('C');
  });

  it('sizes sm / md / lg (md for anything else)', () => {
    expect(mountWith(PlayerAvatar, { size: 'sm', frame: null }).classes()).toContain('pa-sm');
    expect(mountWith(PlayerAvatar, { size: 'lg', frame: null }).classes()).toContain('pa-lg');
    expect(mountWith(PlayerAvatar, { frame: null }).classes()).toContain('pa-md');
    expect(mountWith(PlayerAvatar, { size: 'huge', frame: null }).classes()).toContain('pa-md');
  });

  it('a given frame, or a neutral ring without one (unknown ids count as none)', () => {
    const gold = mountWith(PlayerAvatar, { name: 'A', frame: 'gold' });
    expect(gold.classes()).toContain('frame-gold');
    expect(gold.attributes('title')).toBe('金框');
    expect(mountWith(PlayerAvatar, { name: 'A', frame: null }).classes()).toContain('frame-none');
    expect(mountWith(PlayerAvatar, { name: 'A', frame: 'ruby' }).classes()).toContain('frame-none');
    expect(mountWith(PlayerAvatar, { name: 'A', frame: null }).attributes('title')).toBeUndefined();
  });

  it('no src: the LINE photo from the same cached doc, else the initial', async () => {
    const dave = mountWith(PlayerAvatar, { uid: 'dave', name: 'Dave' });
    const erin = mountWith(PlayerAvatar, { uid: 'erin', name: 'Erin' });
    const given = mountWith(PlayerAvatar, { uid: 'dave', name: 'Dave', src: 'https://example.com/seat.png' });
    await flushPromises();
    expect(dave.find('img').attributes('src')).toBe('https://profile.line-scdn.net/dave.jpg');
    expect(erin.find('img').exists()).toBe(false);
    expect(erin.text()).toBe('E');
    // A src passed in wins
    expect(given.find('img').attributes('src')).toBe('https://example.com/seat.png');
  });

  it('reads the frame a player shows through the shared cache', async () => {
    const dave = mountWith(PlayerAvatar, { uid: 'dave', name: 'Dave' });
    const erin = mountWith(PlayerAvatar, { uid: 'erin', name: 'Erin' });
    const nobody = mountWith(PlayerAvatar, { uid: 'nobody', name: 'N' });
    mountWith(TitleBadge, { uid: 'dave' });
    await flushPromises();
    expect(dave.classes()).toContain('frame-gold');
    expect(erin.classes()).toContain('frame-diamond');
    expect(nobody.classes()).toContain('frame-none');
    // The badge and the avatar share one read
    expect(reads.filter((id) => id === 'dave')).toHaveLength(1);
  });

  it('every frame has a style for both theme modes', () => {
    const src = readFileSync(resolve(__dirname, '../src/components/common/PlayerAvatar.vue'), 'utf-8');
    for (const id of ['bronze', 'silver', 'gold', 'platinum', 'diamond']) {
      expect(src).toContain(`.frame-${id} {`);
      expect(src).toContain(`:root[data-mode="light"] .frame-${id} {`);
    }
    expect(src).toMatch(/\.frame-platinum \{ background: linear-gradient/);
    expect(src).toMatch(/\.frame-diamond \{\s*background: conic-gradient/);
  });
});

describe('display with frames (cache)', () => {
  it('title off but a frame: no badge, the frame still shows', async () => {
    const badge = mountWith(TitleBadge, { uid: 'erin' });
    await flushPromises();
    expect(badge.html()).not.toContain('title-badge');
    expect(frameOf('erin')).toBe('diamond');
    expect(allowsRoomTitles('erin')).toBe(false);
  });

  it('docs from before frames get their frame resolved on the client', async () => {
    await ensureUserTitles(['olga', 'pete']);
    expect(titleDisplayOf('olga')).toEqual({ familyId: 'champion', tier: 4, frame: 'silver' });
    expect(titleDisplayOf('pete')).toEqual({ familyId: null, tier: null, frame: 'bronze' });
    // Room titles are opt-in: olga never turned them on
    expect(allowsRoomTitles('olga')).toBe(false);
    expect(allowsRoomTitles('not-loaded')).toBeNull();
  });
});

describe('LiveTitleBadge', () => {
  it('shows the live title with its icon', () => {
    const w = mountWith(LiveTitleBadge, { titleId: 'hunter' });
    expect(w.text()).toBe('獵人');
    expect(w.classes()).toContain('live-badge');
    expect(w.find('.fa-crosshairs').exists()).toBe(true);
    expect(w.attributes('title')).toBe('房內即時稱號 · 本場淘汰最多人');
  });

  it.each([
    ['prey', '人氣目標'], ['patron', '本場金主'], ['phoenix', '不死鳥'], ['chipLeader', '籌碼王'], ['firstBlood', '首殺'],
  ])('%s', (titleId, name) => {
    const w = mountWith(LiveTitleBadge, { titleId });
    expect(w.text()).toBe(name);
    expect(w.find('i.fas').classes().length).toBeGreaterThan(1);
  });

  it('renders nothing for an unknown id', () => {
    expect(mountWith(LiveTitleBadge, { titleId: 'wizard' }).html()).not.toContain('live-badge');
    expect(mountWith(LiveTitleBadge, {}).html()).not.toContain('live-badge');
  });
});

describe('where avatars and live titles go', () => {
  const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf-8');

  it.each([
    'src/components/game/PlayerCard.vue',
    'src/components/game/TournamentPlayerCard.vue',
  ])('%s: sm avatar first, the live title replaces the regular one', (file) => {
    const src = read(file);
    expect(src).toContain('<PlayerAvatar size="sm" :src="avatar" :name="player.name" :uid="player.uid || \'\'" :linked="!!player.uid" />');
    expect(src).toMatch(/<LiveTitleBadge v-if="liveTitle" :title-id="liveTitle" \/>\s*<TitleBadge v-else-if="player.uid"/);
    // The account dot moved onto the avatar; the second line never wraps
    expect(src).not.toContain('●');
    expect(src).toMatch(/-sub \{[^}]*white-space: nowrap; overflow: hidden; text-overflow: ellipsis;/);
  });

  it('the seat draw shows live titles too', () => {
    const src = read('src/components/game/SeatDrawModal.vue');
    expect(src).toContain('<LiveTitleBadge v-if="s.player && roomTitles[s.player.id]" :title-id="roomTitles[s.player.id]" />');
    expect(src).toContain('<LiveTitleBadge v-if="chart.dealer && roomTitles[chart.dealer.id]"');
  });

  it('both rooms compute live titles and pass avatars', () => {
    for (const file of ['src/views/GameView.vue', 'src/views/TournamentGameView.vue']) {
      const src = read(file);
      expect(src).toContain(':avatar="avatarSrcOf(player, user)"');
      expect(src).toContain(':live-title="roomTitles[player.id] || \'\'"');
      expect(src).toContain(':room-titles="roomTitles"');
      expect(src).toMatch(/const roomTitles = useRoomTitles\(game,/);
    }
  });

  it('live titles stay out of settlement, leaderboard and profile', () => {
    for (const file of [
      'src/components/common/SettlementDetailModal.vue',
      'src/components/social/Leaderboard.vue',
      'src/views/ProfileView.vue',
      'src/views/TitlesView.vue',
    ]) expect(read(file)).not.toContain('LiveTitleBadge');
  });

  it('leaderboard rows and the profile header use the avatar', () => {
    const board = read('src/components/social/Leaderboard.vue');
    expect(board).toContain('<PlayerAvatar size="sm" :src="avatarSrcOf(entry, user)" :name="entry.name" :uid="entry.uid" />');
    expect(board).toContain('<PlayerAvatar size="sm" :src="avatarSrcOf(myRankInfo, user)"');
    const profile = read('src/views/ProfileView.vue');
    expect(profile).toContain('<PlayerAvatar size="lg" :src="userAvatar || \'\'" :name="displayName || \'\'" :frame="myFrame" :uid="user?.uid || \'\'" />');
    expect(profile).toContain('@click="pickFrame(f.id)"');
    expect(profile).toContain("$t('titles.frameNeed', { n: f.min })");
    expect(read('src/views/TitlesView.vue')).toContain("$t('titles.titleCount', { n: myTitleCount })");
  });
});

describe('avatarSrcOf', () => {
  it('the seat avatar, else my own photo on my own seat, else nothing', async () => {
    const { avatarSrcOf } = await import('../src/utils/avatar.js');
    const me = { uid: 'u1', photoURL: 'https://example.com/me.png' };
    expect(avatarSrcOf({ uid: 'u2', avatar: 'https://example.com/x.png' }, me)).toBe('https://example.com/x.png');
    expect(avatarSrcOf({ uid: 'u1' }, me)).toBe('https://example.com/me.png');
    expect(avatarSrcOf({ uid: 'u2' }, me)).toBe('');
    expect(avatarSrcOf({ name: 'guest' }, me)).toBe('');
    expect(avatarSrcOf({ uid: 'u1' }, null)).toBe('');
  });
});
