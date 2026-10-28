/**
 * SessionView with expenses: the completed summary gains 總和 / 牌局 / 代墊
 * tabs, sharing sends the poker summary with the expenses, the expense section only shows to
 * the event's players, and deleting the event removes its expenses first.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import zhTW from '../src/i18n/locales/zh-TW.json';

const session = ref(null);
const expenses = ref([]);
const calls = [];
const shareSessionSummary = vi.fn(async () => true);
let confirmAnswer = true;

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { sessionId: 's1' } }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('../src/composables/useSessions.js', () => ({
  useSessions: () => ({
    session,
    loading: ref(false),
    listenSession: vi.fn(),
    getSession: vi.fn(),
    rsvp: vi.fn(),
    cancelRsvp: vi.fn(),
    activateFirstTable: vi.fn(),
    advanceToNextTable: vi.fn(),
    endSession: vi.fn(),
    deleteSession: vi.fn(async () => { calls.push('deleteSession'); }),
    loadSessionSummary: vi.fn(async () => ({
      tableCount: 1,
      totalBuyIn: 3000,
      cashDecimals: 0,
      ranking: [
        { odId: 'amy', name: 'Amy', profitCash: 400 },
        { odId: 'jay', name: 'Jay', profitCash: -400 },
      ],
    })),
    listenGameStatus: vi.fn(() => () => {}),
    isGameLive: vi.fn(async () => false),
    hasNextSlot: vi.fn(() => false),
  }),
}));
vi.mock('../src/composables/useLiff.js', () => ({
  useLiff: () => ({
    shareSessionInvite: vi.fn(),
    sendSessionRsvpMessage: vi.fn(),
    shareSessionTableCard: vi.fn(),
    shareSessionSummary,
  }),
}));
vi.mock('../src/composables/useConfirm.js', () => ({
  useConfirm: () => ({ confirm: vi.fn(async () => confirmAnswer) }),
}));
vi.mock('../src/composables/useEventExpenses.js', () => ({
  useEventExpenses: () => ({
    expenses,
    recognizing: ref(false),
    listen: vi.fn(() => { calls.push('listen'); }),
    stop: vi.fn(),
    saveExpense: vi.fn(),
    deleteExpense: vi.fn(),
    recognizeReceipt: vi.fn(),
  }),
  deleteEventExpenses: vi.fn(async () => { calls.push('deleteEventExpenses'); }),
  prewarmReceiptRecognition: vi.fn(),
}));

const { default: SessionView } = await import('../src/views/SessionView.vue');
const { useAuthStore } = await import('../src/store/modules/auth.js');

const makeSession = (over = {}) => ({
  id: 's1',
  name: '週五局',
  hostUid: 'host',
  hostName: 'Host',
  status: 'completed',
  dateTimeMs: Date.now(),
  periods: [{ id: 'p1', type: 'cash', label: '晚上', status: 'done', maxPlayers: 8,
    roster: [{ uid: 'amy', name: 'Amy' }, { uid: 'jay', name: 'Jay' }], rosterUids: ['amy', 'jay'] }],
  participantUids: ['amy', 'jay'],
  ...over,
});

// Jay paid 300 for dinner; Amy's share 200, Jay's own 100.
const dinner = {
  id: 'e1', title: 'UE', payerUid: 'jay', createdBy: 'jay', names: { jay: 'Jay', amy: 'Amy' },
  lines: [
    { id: 'a', kind: 'item', name: '牛排', amount: 200, charged: true, assignees: ['amy'] },
    { id: 'b', kind: 'item', name: '沙拉', amount: 100, charged: true, assignees: ['jay'] },
  ],
};

async function mountAs(uid, sess = makeSession()) {
  setActivePinia(createPinia());
  useAuthStore().user = { uid, displayName: uid };
  session.value = null;
  const i18n = createI18n({ legacy: false, locale: 'zh-TW', messages: { 'zh-TW': zhTW } });
  const w = mount(SessionView, { global: { plugins: [i18n], stubs: { Teleport: true } } });
  // Arrives after mount, like the real onSnapshot
  session.value = sess;
  await flushPromises();
  return w;
}

// Each row's cells joined by a space ("🥇 Amy +400")
const rows = (w) => w.findAll('.summary .rank-list li')
  .map((li) => [...li.element.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).join(' '));

describe('SessionView expense summary', () => {
  enableAutoUnmount(afterEach);

  beforeEach(() => {
    calls.length = 0;
    expenses.value = [];
    shareSessionSummary.mockClear();
    confirmAnswer = true;
  });

  it('without expenses the summary is the poker ranking, no tabs', async () => {
    const w = await mountAs('amy');
    expect(w.find('.summary-tabs').exists()).toBe(false);
    expect(rows(w)).toEqual(['🥇 Amy +400', '🥈 Jay -400']);
  });

  it('with expenses it defaults to 總和: poker plus expense balance', async () => {
    expenses.value = [dinner];
    const w = await mountAs('amy');
    expect(w.findAll('.summary-tabs button').map((b) => b.text())).toEqual(['總和', '牌局', '代墊']);
    expect(rows(w)).toEqual([
      'Amy 牌局 +400 · 代墊 -200 +200',
      'Jay 牌局 -400 · 代墊 +200 -200',
    ]);

    await w.findAll('.summary-tabs button')[2].trigger('click');
    expect(rows(w)).toEqual(['Jay +200', 'Amy -200']);

    await w.findAll('.summary-tabs button')[1].trigger('click');
    expect(rows(w)).toEqual(['🥇 Amy +400', '🥈 Jay -400']);
  });

  it('shares the poker summary plus the expenses, whichever tab is on screen', async () => {
    expenses.value = [dinner];
    const w = await mountAs('amy');
    await w.findAll('.summary-tabs button')[1].trigger('click');
    await w.find('.summary .full-w').trigger('click');
    await flushPromises();
    const [, shared, sharedExpenses] = shareSessionSummary.mock.calls[0];
    expect(shared.ranking.map((p) => p.profitCash)).toEqual([400, -400]);
    expect(sharedExpenses).toEqual([dinner]);
  });

  it('players and the host see the expense section, others do not', async () => {
    const amy = await mountAs('amy');
    expect(amy.find('.expenses').exists()).toBe(true);
    expect(calls).toContain('listen');
    amy.unmount();
    const host = await mountAs('host');
    expect(host.find('.expenses').exists()).toBe(true);
    host.unmount();
    calls.length = 0;
    expect((await mountAs('stranger')).find('.expenses').exists()).toBe(false);
    expect(calls).not.toContain('listen');
  });

  it('deleting the event removes its expenses before the event', async () => {
    const w = await mountAs('host', makeSession({ status: 'scheduling' }));
    const del = w.findAll('button').find((b) => b.text().includes('刪除活動'));
    await del.trigger('click');
    await flushPromises();
    expect(calls.filter((c) => c.startsWith('delete'))).toEqual(['deleteEventExpenses', 'deleteSession']);
  });
});
