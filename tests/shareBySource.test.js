import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  inviteText, cashSettlementText, tournamentSettlementText, dailySettlementText, dailyRankingText,
} from '../src/utils/shareText.js';

const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf-8');

describe('share texts (outside LINE)', () => {
  it('invite: host, table and the link', () => {
    const s = inviteText({ gameName: '週五賽', hostName: '嘉杰', isTournament: true, url: 'https://liff.line.me/x/tournament-game/g1' });
    expect(s).toContain('🏆 嘉杰 開了一桌「週五賽」！');
    expect(s).toContain('點連結報名參賽');
    expect(s.trim().endsWith('https://liff.line.me/x/tournament-game/g1')).toBe(true);
  });

  it('cash settlement: best first, rate and rounded cash', () => {
    const s = cashSettlementText({
      gameName: '1/2', rate: 10, cashDecimals: null,
      players: [{ name: 'B', profit: -500 }, { name: 'A', profit: 500 }],
      url: 'U',
    });
    expect(s.split('\n')[0]).toBe('🎲 結算報表｜1/2（1:10）');
    expect(s.indexOf('A：+50')).toBeLessThan(s.indexOf('B：-50'));
    expect(s).toContain('詳細：U');
  });

  it('tournament settlement: placements with medals and prize', () => {
    const s = tournamentSettlementText({
      gameName: 'T',
      players: [{ name: 'B', placement: 2, profit: 0, prize: 1000 }, { name: 'A', placement: 1, profit: 2000, prize: 3000 }, { name: 'C', placement: 3, profit: -1000, prize: 0 }],
    });
    const rows = s.split('\n');
    expect(rows[2]).toBe('🥇 A：+$2,000（獎金 $3,000）');
    expect(rows[3]).toBe('🥈 B：$0（獎金 $1,000）');
    expect(rows[4]).toBe('🥉 C：-$1,000');
  });

  it('daily settlement and ranking', () => {
    const d = dailySettlementText({
      dateLabel: '今天', totalGames: 2, totalBuyInAllCash: 3000,
      games: [{ gameName: 'G1', rate: 1 }, { gameName: 'G2', rate: 10 }],
      playerRanking: [{ name: 'A', profitCash: 120 }, { name: 'B', profitCash: -120 }],
    });
    expect(d).toContain('場次 2｜總買入 $3,000');
    expect(d).toContain('・G2（1:10）');
    expect(d).toContain('A：+$120');
    const r = dailyRankingText({ dateLabel: '今天', topWinners: [{ name: 'A', profitCash: 120 }], topLosers: [{ name: 'B', profitCash: -120 }] });
    expect(r).toContain('🥇 A：+$120');
    expect(r).toContain('💸 B：-$120');
    expect(d).toContain('B：-$120');
    expect(dailyRankingText({ dateLabel: '今天' })).toContain('暫無排行資料');
  });
});

describe('share by source wiring', () => {
  const header = read('src/components/game/RoomHeader.vue');
  const cash = read('src/views/GameView.vue');
  const tour = read('src/views/TournamentGameView.vue');
  const daily = read('src/views/DailyReportView.vue');
  const share = read('src/composables/useShare.js');

  it('the room invite is always offered: LINE card in LINE, share sheet elsewhere', () => {
    expect(header).toContain(`v-if="inLine"`);
    expect(header).toContain(`$t('share.invite')`);
    for (const v of [cash, tour]) {
      expect(v).toContain(':in-line="isInLineClient"');
      expect(v).toMatch(/handleShareInvite = async[\s\S]*?if \(isInLineClient\.value\)[\s\S]*?shareGameInvite[\s\S]*?shareOut/);
    }
  });

  it('settlement: LINE sends to the chat; elsewhere asks, then the share sheet', () => {
    expect(cash).toMatch(/if \(isInLineClient\.value\) \{[\s\S]*?sendSettlementMessage[\s\S]*?\} else if \(await askShareResult\(\)\)[\s\S]*?cashSettlementText/);
    expect(tour).toMatch(/if \(isInLineClient\.value\) \{[\s\S]*?sendTournamentSettlementMessage[\s\S]*?\} else if \(await confirm\(/);
    expect(tour).toContain('tournamentSettlementText(');
  });

  it('daily report: LINE card in LINE, text through the share sheet elsewhere', () => {
    expect(daily).toMatch(/if \(!inLine\.value\) \{[\s\S]*?dailySettlementText/);
    expect(daily).toMatch(/if \(!inLine\.value\) \{[\s\S]*?dailyRankingText/);
  });

  it('share sheet first, copy when there is none, a cancel is not an error', () => {
    expect(share).toMatch(/navigator\.share\(\{ title, text \}\)[\s\S]*?AbortError[\s\S]*?clipboard\.writeText/);
    expect(share).toContain('https://liff.line.me/${LIFF_ID}/${p}');
  });
});
