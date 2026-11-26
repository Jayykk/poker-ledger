/**
 * 排行榜 › 特殊牌型 follows the period tab: the counts come from that
 * period's leaderboardStats doc (the hand events of its games, the way 稱號
 * count them), and a row's hand list is found the same way: the player's
 * history records in the period that count such a hand, then those games'
 * hands that give it to the player. 葫蘆 is gone (the hand events don't count it).
 */
import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import zhTW from '../src/i18n/locales/zh-TW.json';

vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2026-11-25T21:00:00+08:00'));

const at = (iso) => Date.parse(iso);
const row = (uid, name, total) => ({ uid, name, period: '2026-11', total: { games: 2, wins: 1, profit: 0, ...total } });
const STATS = [
  row('amy', 'Amy', { quads: 2, straightFlush: 1 }),
  row('bob', 'Bob', { quads: 2 }),
  row('cy', 'Cy', {}),
];
// Amy's history: dated by the record (when the game was played)
const HISTORY = {
  amy: [
    // Played Nov 30 late; one of its hands logged (補記) on Dec 1
    { id: 'gNov', createdAt: at('2026-11-30T23:00:00+08:00'), handEvents: { quads: 2, straightFlush: 1 } },
    // October: not this period
    { id: 'gOct', createdAt: at('2026-10-20T21:00:00+08:00'), handEvents: { quads: 1 } },
    // This month but no special hands: its hands aren't read
    { id: 'gPlain', createdAt: at('2026-11-10T21:00:00+08:00'), handEvents: { quads: 0 } },
  ],
};
const GAMES = {
  gNov: { players: [{ id: 'seat-a', uid: 'amy' }, { id: 'seat-b', uid: 'bob' }] },
  gOct: { players: [{ id: 'seat-a', uid: 'amy' }] },
};
const HANDS = {
  gNov: [
    // 補登: a type and a note, no cards
    { createdAt: at('2026-11-30T23:10:00+08:00'), note: '9K 同花順', communityCards: [], players: [{ playerId: 'seat-a', handType: 'straight_flush' }] },
    // Logged the next day (補記): still this game, so still November
    { createdAt: at('2026-12-01T10:00:00+08:00'), communityCards: ['A♥', 'A♦', 'A♣', '2♠', '7♦'], players: [{ playerId: 'seat-a', cards: ['A♠', 'K♦'], handType: 'four_of_a_kind' }] },
    // Four of a kind lying on the board: nobody's, whatever the type says
    { createdAt: at('2026-11-30T23:20:00+08:00'), communityCards: ['9♠', '9♥', '9♦', '9♣', 'K♦'], players: [{ playerId: 'seat-a', cards: ['2♠', '3♥'], handType: 'four_of_a_kind' }] },
    { createdAt: at('2026-11-30T23:30:00+08:00'), communityCards: [], players: [{ playerId: 'seat-a', handType: 'full_house' }] },
    { createdAt: at('2026-11-30T23:40:00+08:00'), excludeFromTitles: true, communityCards: [], players: [{ playerId: 'seat-a', handType: 'four_of_a_kind' }] },
    // Bob's hand in the same game
    { createdAt: at('2026-11-30T23:50:00+08:00'), communityCards: [], players: [{ playerId: 'seat-b', handType: 'four_of_a_kind' }] },
    // A seat no longer on the roster: the hand's own playerUid
    { createdAt: at('2026-11-30T22:00:00+08:00'), note: '舊座位', communityCards: [], players: [{ playerId: 'gone', playerUid: 'amy', handType: 'four_of_a_kind' }] },
  ],
  gOct: [
    { createdAt: at('2026-10-20T22:00:00+08:00'), communityCards: [], players: [{ playerId: 'seat-a', handType: 'four_of_a_kind' }] },
  ],
};
const reads = [];

vi.mock('../src/firebase-init.js', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db, ...path) => ({ path: path.join('/') }),
  doc: (_db, ...path) => ({ path: path.join('/') }),
  where: (field, op, value) => ({ where: [field, op, value] }),
  orderBy: (field, dir) => ({ orderBy: [field, dir] }),
  limit: (n) => ({ limit: n }),
  query: (source, ...parts) => ({ path: source.path, parts }),
  getDoc: async (ref) => {
    reads.push(ref);
    const data = GAMES[ref.path.split('/')[1]];
    return { exists: () => !!data, data: () => data };
  },
  getDocs: async (q) => {
    reads.push(q);
    const parts = q.path.split('/');
    let list = [];
    if (q.path === 'leaderboardStats') list = STATS;
    else if (parts[0] === 'users' && parts[2] === 'history_sub') list = HISTORY[parts[1]] || [];
    else if (parts[0] === 'games' && parts[2] === 'hands') list = HANDS[parts[1]] || [];
    const docs = list.map((data) => ({ id: data.id, data: () => data }));
    return { docs, forEach: (fn) => docs.forEach(fn) };
  },
}));
vi.mock('../src/composables/useAuth.js', () => ({ useAuth: () => ({ user: ref({ uid: 'me' }) }) }));
vi.mock('../src/composables/useUserTitles.js', () => ({ ensureUserTitles: () => {}, palsOf: () => [] }));

const { default: Leaderboard } = await import('../src/components/social/Leaderboard.vue');
const i18n = createI18n({ legacy: false, locale: 'zh-TW', messages: { 'zh-TW': zhTW } });

const mountBoard = async () => {
  const w = mount(Leaderboard, {
    global: { plugins: [i18n], stubs: { TitleBadge: true, PlayerAvatar: true } },
  });
  await flushPromises();
  return w;
};
const click = async (w, label) => {
  const button = w.findAll('button').find((b) => b.text() === label);
  expect(button, label).toBeTruthy();
  await button.trigger('click');
  await flushPromises();
};
const ranking = (w) => w.findAll('.lb-row').map((r) => `${r.find('.truncate').text()} ${r.find('.lb-stat').text()}`);
const openAmy = async (w) => {
  await click(w, zhTW.friends.sortBySpecialHands);
  reads.length = 0;
  await w.findAll('.lb-row').find((r) => r.text().includes('Amy')).trigger('click');
  await flushPromises();
  return w.findAll('[data-testid="hand-item"]');
};
const T = zhTW.hand.handTypes;

describe('排行榜 › 特殊牌型 by period', () => {
  beforeEach(() => { reads.length = 0; });
  afterAll(() => vi.useRealTimers());

  it('counts the period stats (四條 + 同花順 + 皇家), no 葫蘆, no scan of every hand', async () => {
    const w = await mountBoard();
    await click(w, zhTW.friends.sortBySpecialHands);
    expect(ranking(w)).toEqual(['Amy 3', 'Bob 2']);
    await click(w, zhTW.friends.fourOfAKind);
    expect(ranking(w)).toEqual(['Amy 2', 'Bob 2']);
    await click(w, zhTW.friends.royalFlush);
    expect(ranking(w)).toEqual([]);
    expect(w.findAll('button').some((b) => b.text() === '葫蘆')).toBe(false);
    // Only the period's stats were read
    expect(reads.map((q) => q.path)).toEqual(['leaderboardStats']);
    expect(reads[0].parts).toContainEqual({ where: ['period', '==', '2026-11'] });
  });

  it("a row's hands: the games of the period that count them, 補記 included; board quads, 葫蘆 and test hands left out", async () => {
    const w = await mountBoard();
    const items = await openAmy(w);
    // Only this month's game with special hands was opened
    expect(reads.map((r) => r.path).sort()).toEqual(['games/gNov', 'games/gNov/hands', 'users/amy/history_sub']);
    // Newest first: the 補記 (Dec 1) one, then by time; Bob's isn't Amy's
    expect(items.map((c) => c.find('[data-testid="hand-type"]').text())).toEqual([T.four_of_a_kind, T.straight_flush, T.four_of_a_kind]);
    expect(w.findAll('[data-testid="hand-tally"] .hand-pill').map((p) => p.text())).toEqual([`${T.straight_flush} × 1`, `${T.four_of_a_kind} × 2`]);
    expect(items[1].find('[data-testid="hand-note"]').text()).toBe('9K 同花順');
    expect(items[1].findAll('[data-testid="playing-card"]')).toHaveLength(0);
    expect(items[1].text()).not.toContain(zhTW.hand.communityCards);
    expect(items[2].find('[data-testid="hand-note"]').text()).toBe('舊座位');
    expect(items[0].text()).toContain(zhTW.hand.holeCards);
  });

  it('the cards that make the hand are lit, the rest dimmed; hearts and diamonds red', async () => {
    const w = await mountBoard();
    const items = await openAmy(w);
    const cards = items[0].findAll('[data-testid="playing-card"]');
    const state = (c) => `${c.attributes('aria-label')}${c.classes('is-lit') ? '*' : ''}${c.classes('is-red') ? 'r' : ''}`;
    // A♠ K♦ | A♥ A♦ A♣ 2♠ 7♦ → four aces and the king kicker
    expect(cards.map(state)).toEqual(['A♠*', 'K♦*r', 'A♥*r', 'A♦*r', 'A♣*', '2♠', '7♦r']);
    expect(cards.filter((c) => c.classes('is-dim')).map((c) => c.attributes('aria-label'))).toEqual(['2♠', '7♦']);
  });
});
