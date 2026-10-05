import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { summarizeTournamentSettlement, bountyDetail } from '../src/utils/tournamentSettlementSummary.js';
import { tournamentSettlementText } from '../src/utils/shareText.js';

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
// buy-in $200, $50 of it bounty, 6 entries: prize pool 900, bounties 300
const ko = [
  { name: 'Jay', placement: 1, buyIn: 200, prize: 630, bounty: 150, knockouts: 3, profit: 580 },
  { name: '阿華', placement: 2, buyIn: 200, prize: 270, bounty: 150, knockouts: 3, profit: 220 },
  { name: '小美', placement: 3, buyIn: 200, prize: 0, bounty: 0, knockouts: 0, profit: -200 },
];

describe('tournament settlement summary (LINE card / share text)', () => {
  it('a plain tournament: prize pool is what was paid by placement, no highlight', () => {
    const s = summarizeTournamentSettlement([{ prize: 600, buyIn: 200 }, { prize: 0, buyIn: 200 }]);
    expect(s).toEqual({ kind: 'none', prizePool: 600, bountyTotal: 0, highlight: null });
  });

  it('KO / PKO: prize pool and bounties apart; the Hunter has the most knockouts, then bounty', () => {
    const s = summarizeTournamentSettlement([...ko, { ...ko[1], name: 'Hunter', knockouts: 3, bounty: 200 }]);
    expect(s.kind).toBe('ko');
    expect(s.prizePool).toBe(1170);
    expect(s.highlight.type).toBe('hunter');
    expect(s.highlight.row.name).toBe('Hunter');
    expect(bountyDetail(ko[0], 'ko', money)).toBe('🎯 KO 3 · 賞金 $150');
  });

  it('mystery: 歐皇 is whoever won the most from envelopes', () => {
    const rows = [
      { name: 'A', prize: 500, bounty: 300, knockouts: 1, draws: 1, topDraws: 0 },
      { name: 'B', prize: 0, bounty: 810, knockouts: 1, draws: 2, topDraws: 1 },
    ];
    const s = summarizeTournamentSettlement(rows);
    expect(s.kind).toBe('mystery');
    expect(s.bountyTotal).toBe(1110);
    expect(s.highlight).toMatchObject({ type: 'lucky', row: { name: 'B' } });
    expect(bountyDetail(rows[1], 'mystery', money)).toBe('🎁 抽 2 封 $810');
  });

  it('nobody knocked anyone out: no Hunter', () => {
    expect(summarizeTournamentSettlement([{ prize: 100, bounty: 50, knockouts: 0 }]).highlight).toBe(null);
  });

  it('the share text carries the pools, the Hunter and each bounty', () => {
    const t = tournamentSettlementText({ gameName: '週五 KO', players: ko });
    expect(t).toContain('獎池 $900 ｜ 賞金 $300');
    expect(t).toContain('🎯 Hunter：Jay（KO 3）');
    expect(t).toContain('🥇 Jay：+$580（獎金 $630 · 🎯 KO 3 · 賞金 $150）');
    expect(t).toContain('🥉 小美：-$200（🎯 KO 0 · 賞金 $0）');
  });

  it('the LINE card uses the summary (real prize pool, bounty column, highlight box)', () => {
    const liff = readFileSync(resolve(__dirname, '..', 'src/composables/useLiff.js'), 'utf-8');
    expect(liff).toContain('summarizeTournamentSettlement(sorted)');
    expect(liff).not.toMatch(/totalPrizePool = sorted\.reduce\(\(sum, p\) => sum \+ \(p\.buyIn/);
    expect(liff).toContain("highlight.type === 'hunter' ? '🎯 Hunter' : '🍀 歐皇'");
  });
});

describe('LINE settlement card (built for real)', async () => {
  const { vi } = await import('vitest');
  it('a KO game: three summary columns, champion + Hunter boxes, bounty in each row', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_LIFF_ID', 'test-liff');
    const sent = [];
    vi.doMock('@line/liff', () => ({
      default: {
        init: async () => {}, isInClient: () => true, isLoggedIn: () => true,
        sendMessages: async (m) => { sent.push(...m); },
      },
    }));
    const { useLiff } = await import('../src/composables/useLiff.js');
    const l = useLiff();
    await l.initLiff?.();
    const ok = await l.sendTournamentSettlementMessage({ gameName: '週五 KO', gameId: 'g1', players: ko });
    expect(ok).toBe(true);
    const body = sent[0].contents.body.contents;
    expect(body[0].contents.map((c) => c.contents[0].text)).toEqual(['獎池', '賞金', '參賽']);
    expect(body[0].contents[0].contents[1].text).toBe('$900');
    expect(body[1].contents.map((c) => c.contents[0].text)).toEqual(['👑 冠軍', '🎯 Hunter']);
    expect(JSON.stringify(body)).toContain('🎯 KO 3 · 賞金 $150');
  });
});
