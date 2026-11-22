/**
 * SessionView while a table runs: nobody is sent to the table on their own
 * (that kept players off this page, and so off 代墊分帳). A member of the
 * active period gets an 進入牌桌 button once the table is known to be live;
 * only the "table is live" card (?enter=1) still goes straight in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import zhTW from '../src/i18n/locales/zh-TW.json';

const session = ref(null);
const push = vi.fn();
const replace = vi.fn(async () => {});
const query = {};
let live = true;

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { sessionId: 's1' }, query }),
  useRouter: () => ({ push, replace }),
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
    deleteSession: vi.fn(),
    loadSessionSummary: vi.fn(async () => null),
    listenGameStatus: vi.fn(() => () => {}),
    isGameLive: vi.fn(async () => live),
    hasNextSlot: vi.fn(() => false),
  }),
}));
vi.mock('../src/composables/useLiff.js', () => ({
  useLiff: () => ({
    shareSessionInvite: vi.fn(),
    sendSessionRsvpMessage: vi.fn(),
    shareSessionTableCard: vi.fn(),
    shareSessionSummary: vi.fn(),
  }),
}));
vi.mock('../src/composables/useConfirm.js', () => ({
  useConfirm: () => ({ confirm: vi.fn(async () => true) }),
}));
vi.mock('../src/composables/useEventExpenses.js', () => ({
  useEventExpenses: () => ({
    expenses: ref([]),
    recognizing: ref(false),
    listen: vi.fn(),
    stop: vi.fn(),
    saveExpense: vi.fn(),
    deleteExpense: vi.fn(),
    recognizeReceipt: vi.fn(),
  }),
  deleteEventExpenses: vi.fn(),
  prewarmReceiptRecognition: vi.fn(),
}));

const { default: SessionView } = await import('../src/views/SessionView.vue');
const { useAuthStore } = await import('../src/store/modules/auth.js');

const running = (over = {}) => ({
  id: 's1',
  name: '週五局',
  hostUid: 'host',
  status: 'active',
  dateTimeMs: Date.now(),
  periods: [
    { id: 'p1', type: 'cash', label: '晚上', status: 'active', maxPlayers: 8,
      roster: [{ uid: 'host', name: 'Host' }, { uid: 'amy', name: 'Amy' }], rosterUids: ['host', 'amy'] },
    { id: 'p2', type: 'tournament', label: '深夜', status: 'queued', maxPlayers: 8,
      roster: [{ uid: 'bob', name: 'Bob' }], rosterUids: ['bob'] },
  ],
  participantUids: ['host', 'amy', 'bob'],
  activeSlot: { id: 'p1', type: 'cash', gameId: 'g1' },
  ...over,
});

async function mountAs(uid, sess = running()) {
  setActivePinia(createPinia());
  useAuthStore().user = { uid, displayName: uid };
  session.value = null;
  const i18n = createI18n({ legacy: false, locale: 'zh-TW', messages: { 'zh-TW': zhTW } });
  const w = mount(SessionView, { global: { plugins: [i18n], stubs: { Teleport: true } } });
  session.value = sess;
  await flushPromises();
  return w;
}

describe('SessionView while a table runs', () => {
  enableAutoUnmount(afterEach);

  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    delete query.enter;
    live = true;
    sessionStorage.clear();
  });

  it('a player at the running table stays on the page: expenses reachable, a button into the table', async () => {
    const w = await mountAs('amy');
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(w.find('.expenses').exists()).toBe(true);
    expect(w.find('[data-test="add-expense"]').exists()).toBe(true);
    expect(w.find('[data-test="live"]').text()).toContain('進行中');

    await w.find('[data-test="enter-table"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/game/g1');
    // leaving the table comes back to this event
    expect(JSON.parse(sessionStorage.getItem('session_table_return'))).toEqual({ sessionId: 's1', gameId: 'g1' });
  });

  it('no button into a table that already finished, nor for someone not at it', async () => {
    live = false;
    const gone = await mountAs('amy');
    expect(gone.find('[data-test="enter-table"]').exists()).toBe(false);
    expect(gone.find('[data-test="live"]').text()).toContain('目前無進行中時段');
    gone.unmount();

    live = true;
    const bob = await mountAs('bob');
    expect(bob.find('[data-test="enter-table"]').exists()).toBe(false);
    expect(bob.find('[data-test="live"]').text()).toContain('進行中');
  });

  it('someone not at the table is not told 進行中 over a table that already finished', async () => {
    live = false;
    const bob = await mountAs('bob');
    expect(bob.find('[data-test="live"]').text()).toContain('目前無進行中時段');
    expect(bob.find('[data-test="live"]').text()).not.toContain('進行中 ·');
  });

  it('?enter=1 takes nobody to a table they are not signed up for', async () => {
    query.enter = '1';
    await mountAs('bob');
    expect(push).not.toHaveBeenCalled();
  });

  it('the host has the button too, without waiting for a check', async () => {
    live = false;
    const w = await mountAs('host');
    await w.find('[data-test="enter-table"]').trigger('click');
    expect(push).toHaveBeenCalledWith('/game/g1');
  });

  it('from the "table is live" card (?enter=1) a player goes straight in, once', async () => {
    query.enter = '1';
    await mountAs('amy');
    // the page without ?enter is what stays in history
    expect(replace).toHaveBeenCalledWith('/session/s1');
    expect(push).toHaveBeenCalledWith('/game/g1');
  });

  it('?enter=1 sends nobody into a finished table', async () => {
    query.enter = '1';
    live = false;
    const w = await mountAs('amy');
    expect(push).not.toHaveBeenCalled();
    expect(w.find('.expenses').exists()).toBe(true);
  });

  it('the card links with ?enter=1; the invite and the page itself do not', () => {
    const liff = readFileSync(resolve(__dirname, '../src/composables/useLiff.js'), 'utf-8');
    expect(liff).toContain('liffLink(LIFF_ID, `session/${session.id}?enter=1`)');
    expect(liff.match(/\?enter=1`/g)).toHaveLength(1);
  });

  it('buttons keep their label inside: one shared .btn, grids of equal cells', () => {
    const v = readFileSync(resolve(__dirname, '../src/views/SessionView.vue'), 'utf-8');
    expect(v).toMatch(/\.btn \{[^}]*min-width: 0;[^}]*min-height: 44px;/);
    expect(v).toMatch(/\.btn\.block span \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
    expect(v).toContain('.btn-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));');
    // no bare <button> styling left to fight with
    expect(v).not.toMatch(/\nbutton \{/);
  });
});
