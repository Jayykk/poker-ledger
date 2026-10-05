import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import zhTW from '../src/i18n/locales/zh-TW.json';
import { splitPot, quickPutIns } from '../src/utils/handRecordFlow.js';

const created = [];
vi.mock('../src/composables/useHand.js', () => ({
  useHand: () => ({ createHandRecord: async (gameId, data) => { created.push({ gameId, data }); return 'h1'; } }),
}));
vi.mock('../src/composables/useNotification.js', () => ({
  useNotification: () => ({ success: () => {}, error: () => {} }),
}));
// The photo panel isn't part of this flow
vi.mock('../src/components/game/CardRecognitionPanel.vue', () => ({ default: { name: 'CardRecognitionPanel', render: () => null } }));

const { default: HandRecordSheet } = await import('../src/components/game/HandRecordSheet.vue');

describe('hand record money', () => {
  it('winners split the pot in whole chips', () => {
    expect(splitPot(14000, ['a'])).toEqual({ a: 14000 });
    expect(splitPot(1001, ['a', 'b'])).toEqual({ a: 501, b: 500 });
    expect(splitPot(500, [])).toEqual({});
  });
  it('quick amounts: big blinds with a clock, parts of a buy-in without', () => {
    expect(quickPutIns({ bigBlind: 2000 }).map((q) => q.label)).toEqual(['1BB', '2BB', '3BB', '5BB', '10BB']);
    expect(quickPutIns({ bigBlind: 2000 })[2].amount).toBe(6000);
    expect(quickPutIns({ baseBuyIn: 1000 }).map((q) => q.amount)).toEqual([50, 100, 250, 500]);
  });
});

describe('紀錄手牌: three steps, balances by itself', () => {
  const players = [
    { id: 'p3', name: '嘉杰 Jay', seat: { seat: 3 } },
    { id: 'p0', name: '大雄', seat: { seat: 0, dealer: true } },
    { id: 'p8', name: '小美', seat: { seat: 8 } },
    { id: 'p4', name: '阿華', seat: { seat: 4 } },
    { id: 'px', name: '出局', seat: { seat: 6 }, eliminated: true },
  ];
  const i18n = createI18n({ legacy: false, locale: 'zh-TW', messages: { 'zh-TW': zhTW } });
  const mountSheet = () => mount(HandRecordSheet, {
    props: { modelValue: true, gameId: 'g1', players, baseBuyIn: 1000, bigBlind: 2000 },
    global: { plugins: [i18n] },
  });
  const btn = (w, text) => w.findAll('button').find((b) => b.text().trim() === text);

  it('① seat order (dealer first), eliminated left out; needs two players', async () => {
    const w = mountSheet();
    expect(w.findAll('.hr-chip').map((c) => c.text())).toEqual(['🃏大雄', '3嘉杰 Jay', '4阿華', '8小美']);
    expect(btn(w, '下一步：填牌').attributes('disabled')).toBeDefined();
  });

  it('② one pad fills the next slot; skip a player = mucked; ③ the winner gets the put-ins', async () => {
    created.length = 0;
    const w = mountSheet();
    const chips = w.findAll('.hr-chip');
    await chips[1].trigger('click'); // 嘉杰 Jay
    await chips[2].trigger('click'); // 阿華
    await chips[3].trigger('click'); // 小美
    await btn(w, '下一步：填牌').trigger('click');

    const tap = async (rank, suit) => {
      await w.findAll('.hr-key.suit').find((k) => k.text() === suit).trigger('click');
      await w.findAll('.hr-key').find((k) => !k.classes('suit') && k.text() === rank).trigger('click');
    };
    // board: A♠ K♥ 7♣, then skip the rest of the board
    await tap('A', '♠'); await tap('K', '♥'); await tap('7', '♣');
    await btn(w, '略過').trigger('click');
    // 嘉杰 Jay: A♣ A♦ (three of a kind), 阿華: K♦ Q♥, 小美: skipped = mucked
    await tap('A', '♣'); await tap('A', '♦');
    await tap('K', '♦'); await tap('Q', '♥');
    await btn(w, '略過').trigger('click');
    expect(w.text()).toContain('三條');
    expect(w.text()).toContain('蓋牌');
    // a used card can't be picked again
    await w.findAll('.hr-key.suit').find((k) => k.text() === '♠').trigger('click');
    expect(w.findAll('.hr-key').find((k) => !k.classes('suit') && k.text() === 'A').attributes('disabled')).toBeDefined();

    await btn(w, '下一步：誰贏').trigger('click');
    await w.findAll('.hr-chip').find((c) => c.text().includes('嘉杰 Jay')).trigger('click');
    const rows = w.findAll('.hr-row.wrap');
    await rows[0].find('input').setValue(8000); // 阿華
    await rows[1].findAll('.hr-quick').find((q) => q.text() === '+3BB').trigger('click'); // 小美 6,000
    expect(w.text()).toContain('+14,000');
    expect(w.text()).toContain('底池 14,000');

    await btn(w, '儲存').trigger('click');
    await flushPromises();
    expect(created).toHaveLength(1);
    const { data } = created[0];
    expect(data.communityCards).toEqual(['A♠', 'K♥', '7♣']);
    const by = Object.fromEntries(data.players.map((p) => [p.playerName, p]));
    expect(by['嘉杰 Jay']).toMatchObject({ cards: ['A♣', 'A♦'], handType: 'three_of_a_kind', chips: 14000, winner: true });
    expect(by['阿華']).toMatchObject({ cards: ['K♦', 'Q♥'], chips: -8000 });
    expect(by['小美']).toMatchObject({ cards: [], handType: '', chips: -6000 });
    expect(data.players.reduce((s, p) => s + p.chips, 0)).toBe(0);
    expect(data.players.some((p) => p.playerName === '大雄')).toBe(false); // not in this hand
  });
});
