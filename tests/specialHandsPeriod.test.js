/**
 * 排行榜 › 特殊牌型 follows the period tab: the counts come from that
 * period's leaderboardStats doc (the hand events of its games, the way 稱號
 * count them), and a row's hand list reads only that period's hands.
 * 葫蘆 is gone (the hand events don't count it).
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import zhTW from '../src/i18n/locales/zh-TW.json';
import { periodKeysForMillis, periodRangeMillis } from '../functions/src/utils/leaderboardStatsMath.js';

vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2026-11-25T21:00:00+08:00'));

const NOV = Date.parse('2026-11-01T00:00:00+08:00');
const DEC = Date.parse('2026-12-01T00:00:00+08:00');
const row = (uid, name, total) => ({ uid, name, period: '2026-11', total: { games: 2, wins: 1, profit: 0, ...total } });
const STATS = [
  row('amy', 'Amy', { quads: 1, straightFlush: 1 }),
  row('bob', 'Bob', { quads: 2 }),
  row('cy', 'Cy', {}),
];
const HANDS = [
  // 補登: a type and a note, no cards
  { createdAt: NOV + 3600e3, note: '9K 同花順', communityCards: [], players: [{ playerUid: 'amy', handType: 'straight_flush' }] },
  { createdAt: NOV + 7200e3, communityCards: ['A♥', 'A♦', 'A♣', '2♠', '7♦'], players: [{ playerUid: 'amy', cards: ['A♠', 'K♦'], handType: 'four_of_a_kind' }] },
  { createdAt: NOV + 9000e3, communityCards: [], players: [{ playerUid: 'amy', handType: 'full_house' }] },
  { createdAt: NOV + 9500e3, excludeFromTitles: true, communityCards: [], players: [{ playerUid: 'amy', handType: 'four_of_a_kind' }] },
];
const queries = [];

vi.mock('../src/firebase-init.js', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ name }),
  collectionGroup: (_db, name) => ({ name, group: true }),
  where: (field, op, value) => ({ where: [field, op, value] }),
  orderBy: (field, dir) => ({ orderBy: [field, dir] }),
  limit: (n) => ({ limit: n }),
  query: (source, ...parts) => ({ source, parts }),
  getDocs: async (q) => {
    queries.push(q);
    const list = q.source.name === 'leaderboardStats' ? STATS : HANDS;
    const docs = list.map((data) => ({ data: () => data }));
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

describe('排行榜 › 特殊牌型 by period', () => {
  afterAll(() => vi.useRealTimers());

  it('counts the period stats (四條 + 同花順 + 皇家), no 葫蘆, no scan of every hand', async () => {
    const w = await mountBoard();
    await click(w, zhTW.friends.sortBySpecialHands);
    expect(ranking(w)).toEqual(['Amy 2', 'Bob 2']);
    await click(w, zhTW.friends.fourOfAKind);
    expect(ranking(w)).toEqual(['Bob 2', 'Amy 1']);
    await click(w, zhTW.friends.royalFlush);
    expect(ranking(w)).toEqual([]);
    expect(w.findAll('button').some((b) => b.text() === '葫蘆')).toBe(false);
    // Only the period's stats were read: nothing from the hands collection group
    expect(queries.map((q) => q.source.name)).toEqual(['leaderboardStats']);
    expect(queries[0].parts).toContainEqual({ where: ['period', '==', '2026-11'] });
  });

  it("a row's hands: only this month's, test hands and 葫蘆 left out; a 補登 hand shows its note, no empty card rows", async () => {
    const w = await mountBoard();
    await click(w, zhTW.friends.sortBySpecialHands);
    queries.length = 0;
    await w.findAll('.lb-row').find((r) => r.text().includes('Amy')).trigger('click');
    await flushPromises();
    const [q] = queries;
    expect(q.source).toEqual({ name: 'hands', group: true });
    expect(q.parts).toContainEqual({ where: ['createdAt', '>=', NOV] });
    expect(q.parts).toContainEqual({ where: ['createdAt', '<', DEC] });
    const items = w.findAll('[data-testid="hand-item"]');
    expect(items.map((c) => c.find('[data-testid="hand-type"]').text())).toEqual([zhTW.hand.handTypes.straight_flush, zhTW.hand.handTypes.four_of_a_kind]);
    expect(w.findAll('[data-testid="hand-tally"] .hand-pill').map((p) => p.text())).toEqual([`${zhTW.hand.handTypes.straight_flush} × 1`, `${zhTW.hand.handTypes.four_of_a_kind} × 1`]);
    expect(items[0].find('[data-testid="hand-note"]').text()).toBe('9K 同花順');
    expect(items[0].findAll('[data-testid="playing-card"]')).toHaveLength(0);
    expect(items[0].text()).not.toContain(zhTW.hand.communityCards);
    expect(items[1].text()).toContain(zhTW.hand.holeCards);
    expect(items[1].text()).toContain(zhTW.hand.communityCards);
  });

  it('the cards that make the hand are lit, the rest dimmed; hearts and diamonds red', async () => {
    const w = await mountBoard();
    await click(w, zhTW.friends.sortBySpecialHands);
    await w.findAll('.lb-row').find((r) => r.text().includes('Amy')).trigger('click');
    await flushPromises();
    const cards = w.findAll('[data-testid="hand-item"]')[1].findAll('[data-testid="playing-card"]');
    const state = (c) => `${c.attributes('aria-label')}${c.classes('is-lit') ? '*' : ''}${c.classes('is-red') ? 'r' : ''}`;
    // A♠ K♦ | A♥ A♦ A♣ 2♠ 7♦ → four aces and the king kicker
    expect(cards.map(state)).toEqual(['A♠*', 'K♦*r', 'A♥*r', 'A♦*r', 'A♣*', '2♠', '7♦r']);
    expect(cards.filter((c) => c.classes('is-dim')).map((c) => c.attributes('aria-label'))).toEqual(['2♠', '7♦']);
  });
});

describe('periodRangeMillis', () => {
  it('each key spans its Taipei calendar period', () => {
    expect(periodRangeMillis('2026-04')).toEqual({ start: Date.parse('2026-04-01T00:00+08:00'), end: Date.parse('2026-05-01T00:00+08:00') });
    expect(periodRangeMillis('2026-12')).toEqual({ start: Date.parse('2026-12-01T00:00+08:00'), end: Date.parse('2027-01-01T00:00+08:00') });
    expect(periodRangeMillis('2026-Q4')).toEqual({ start: Date.parse('2026-10-01T00:00+08:00'), end: Date.parse('2027-01-01T00:00+08:00') });
    expect(periodRangeMillis('2026')).toEqual({ start: Date.parse('2026-01-01T00:00+08:00'), end: Date.parse('2027-01-01T00:00+08:00') });
    expect(periodRangeMillis('week-2026-11-23')).toEqual({ start: Date.parse('2026-11-23T00:00+08:00'), end: Date.parse('2026-11-30T00:00+08:00') });
    expect(periodRangeMillis('all')).toBeNull();
    expect(periodRangeMillis('nonsense')).toBeNull();
  });

  it('agrees with periodKeysForMillis on both edges of every period', () => {
    for (const at of ['2026-01-01T00:00+08:00', '2026-03-31T23:59+08:00', '2026-11-29T23:59:59+08:00', '2026-12-31T23:30+08:00']) {
      const ms = Date.parse(at);
      for (const [kind, key] of Object.entries(periodKeysForMillis(ms))) {
        if (kind === 'all') continue;
        const { start, end } = periodRangeMillis(key);
        expect(ms >= start && ms < end, `${at} ${key}`).toBe(true);
        expect(periodKeysForMillis(start)[kind], `${key} start`).toBe(key);
        expect(periodKeysForMillis(end - 1)[kind], `${key} end`).toBe(key);
        expect(periodKeysForMillis(end)[kind], `${key} after`).not.toBe(key);
      }
    }
  });
});
