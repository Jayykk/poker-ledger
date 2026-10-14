import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { ref } from 'vue';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import zhTW from '../src/i18n/locales/zh-TW.json';

// 補記手牌 in the settlement detail (ReportView / DailyReportView)
const DAY = 24 * 60 * 60 * 1000;
const games = {};
let viewer = 'bob';
const loads = [];

vi.mock('../src/firebase-init.js', () => ({ db: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, collection, id) => ({ collection, id }),
  getDoc: async (ref) => ({ exists: () => !!games[ref.id], data: () => games[ref.id] }),
}));
vi.mock('../src/store/modules/auth.js', () => ({ useAuthStore: () => ({ user: viewer ? { uid: viewer } : null }) }));
vi.mock('../src/composables/useHand.js', () => {
  const hands = ref([]);
  return {
    useHand: () => ({
      hands,
      loadHandRecords: async (gameId) => { loads.push(gameId); },
      createHandRecord: async () => 'h1',
      cleanup: () => {},
    }),
  };
});
vi.mock('../src/composables/useNotification.js', () => ({
  useNotification: () => ({ success: () => {}, error: () => {} }),
}));
vi.mock('../src/components/common/TitleBadge.vue', () => ({ default: { name: 'TitleBadge', render: () => null } }));
vi.mock('../src/components/game/CardRecognitionPanel.vue', () => ({ default: { name: 'CardRecognitionPanel', render: () => null } }));

const { default: SettlementDetailModal } = await import('../src/components/common/SettlementDetailModal.vue');
const { default: HandRecordSheet } = await import('../src/components/game/HandRecordSheet.vue');
const i18n = createI18n({ legacy: false, locale: 'zh-TW', messages: { 'zh-TW': zhTW } });

const roster = [
  { id: 'g', name: 'Guest' },
  { id: 'p1', uid: 'bob', name: 'Bob' },
  { id: 'p2', uid: 'cara', name: 'Cara', eliminated: true },
];
const record = (gameId) => ({
  gameId, gameName: 'Friday', type: 'tournament', rate: 1,
  settlement: [{ odId: 'bob', name: 'Bob', placement: 1 }, { odId: 'cara', name: 'Cara', placement: 2 }],
});

async function open(gameId) {
  const w = mount(SettlementDetailModal, {
    props: { modelValue: false, record: record(gameId) },
    global: { plugins: [i18n] },
  });
  await w.setProps({ modelValue: true });
  await flushPromises();
  return w;
}
const button = (w) => w.find('[data-test="record-after"]');

describe('補記手牌 button in the settlement detail', () => {
  beforeEach(() => {
    viewer = 'bob';
    loads.length = 0;
    const at = (ms) => ({ toMillis: () => ms });
    Object.assign(games, {
      recent: { status: 'completed', hostUid: 'host', players: roster, baseBuyIn: 1000, completedAt: at(Date.now() - DAY) },
      old: { status: 'completed', hostUid: 'host', players: roster, completedAt: at(Date.now() - 8 * DAY) },
      live: { status: 'active', hostUid: 'host', players: roster },
    });
  });

  it('a player of the game, within 7 days: the button, which opens the sheet with everyone on the roster', async () => {
    const w = await open('recent');
    expect(button(w).exists()).toBe(true);
    expect(button(w).text()).toContain('補記手牌');
    expect(button(w).text()).toContain('7 天內');

    const sheet = w.findComponent(HandRecordSheet);
    expect(sheet.props('modelValue')).toBe(false);
    await button(w).find('button').trigger('click');
    expect(sheet.props('modelValue')).toBe(true);
    expect(sheet.props('gameId')).toBe('recent');
    expect(sheet.props('includeEliminated')).toBe(true);
    expect(sheet.props('extraFields')).toEqual({ recordedBy: 'bob', recordedAfter: true, recorderIndex: 1 });
    // the busted-out player is pickable too
    expect(sheet.findAll('.hr-chip').map((c) => c.text())).toEqual(['·Guest', '·Bob', '·Cara']);
  });

  it('after saving, the hand list loads again', async () => {
    const w = await open('recent');
    expect(loads).toEqual(['recent']);
    w.findComponent(HandRecordSheet).vm.$emit('saved');
    await flushPromises();
    expect(loads).toEqual(['recent', 'recent']);
  });

  it.each([
    ['an outsider', 'zed', 'recent'],
    ['the host who did not play', 'host', 'recent'],
    ['signed out', null, 'recent'],
    ['a player, after 7 days', 'bob', 'old'],
    ['a player, game still on', 'bob', 'live'],
    ['a player, game gone', 'bob', 'missing'],
  ])('%s: nothing shown', async (_label, uid, gameId) => {
    viewer = uid;
    const w = await open(gameId);
    expect(button(w).exists()).toBe(false);
    expect(w.findComponent(HandRecordSheet).exists()).toBe(false);
    expect(w.text()).not.toContain('補記');
  });

  it('fits a 375px phone: a full-width button and a wrapping hint inside the modal', () => {
    const src = readFileSync(resolve(__dirname, '..', 'src/components/common/SettlementDetailModal.vue'), 'utf-8');
    expect(src).toContain('<BaseButton variant="ghost" size="sm" full-width @click="showHandSheet = true">');
    expect(src).toContain('<p class="text-xs text-gray-500 mt-1.5 text-center">{{ $t(\'hand.recordAfterHint\') }}</p>');
  });

  it('DailyReportView and ReportView both use this modal', () => {
    for (const view of ['src/views/ReportView.vue', 'src/views/DailyReportView.vue']) {
      expect(readFileSync(resolve(__dirname, '..', view), 'utf-8')).toContain('<SettlementDetailModal');
    }
  });
});
