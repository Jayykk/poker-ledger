// Plain-text versions of what the app shares, for sharing outside LINE
// (the system share sheet, or the clipboard). Inside LINE the same content
// goes out as Flex Messages (useLiff.js); these mirror their rows.
import { rowCash, formatCashAmount, roundCashTotal, formatCashTotal } from './cashRounding.js';

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
const signedMoney = (n) => {
  const r = Math.round(Number(n) || 0);
  return `${r > 0 ? '+' : r < 0 ? '-' : ''}${money(Math.abs(r))}`;
};
// +$120 / -$120 (sign before the dollar)
const signedCash = (cash, d) => `${cash > 0 ? '+' : cash < 0 ? '-' : ''}$${formatCashTotal(Math.abs(cash), d)}`;
const lines = (...rows) => rows.flat().filter((r) => r !== null && r !== undefined && r !== false).join('\n');

/** Room invite: who opened which table, and the link to join. */
export function inviteText({ gameName, hostName, isTournament = false, url }) {
  const name = gameName || (isTournament ? '錦標賽' : '牌局');
  return lines(
    `${isTournament ? '🏆' : '🃏'} ${hostName || '朋友'} 開了一桌「${name}」！`,
    isTournament ? '點連結報名參賽：' : '點連結加入牌桌：',
    url,
  );
}

/** Cash game settlement: each player's result, best first. */
export function cashSettlementText({ gameName, rate = 1, players = [], cashDecimals = null, url }) {
  const sorted = [...players].sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0));
  const rows = sorted.map((p) => {
    const cash = cashDecimals === null ? Math.round(rowCash(p, rate)) : rowCash(p, rate);
    const text = cashDecimals === null ? cash.toLocaleString() : formatCashAmount(cash, cashDecimals);
    return `${p.name || '???'}：${cash > 0 ? '+' : ''}${text}`;
  });
  return lines(
    `🎲 結算報表｜${gameName || '未命名'}${rate && rate !== 1 ? `（1:${rate}）` : ''}`,
    '———',
    rows,
    url ? ['———', `詳細：${url}`] : null,
  );
}

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

/** Tournament settlement: placements with prize and net. */
export function tournamentSettlementText({ gameName, players = [], url }) {
  const sorted = players.filter(Boolean).sort((a, b) => (a.placement || 999) - (b.placement || 999));
  const rows = sorted.map((p) => {
    const mark = MEDAL[p.placement] || `#${p.placement || '-'}`;
    const prize = Number(p.prize) > 0 ? `（獎金 ${money(p.prize)}）` : '';
    return `${mark} ${p.name || '???'}：${signedMoney(p.profit)}${prize}`;
  });
  return lines(
    `🏆 錦標賽結算｜${gameName || '未命名'}`,
    '———',
    rows,
    url ? ['———', `詳細：${url}`] : null,
  );
}

/** Daily report — settlement: games played, total buy-in, everyone's result. */
export function dailySettlementText({
  dateLabel, totalGames = 0, totalBuyInAllCash = 0, games = [], playerRanking = [], cashDecimals = 0, url,
}) {
  const gameRows = games.slice(0, 10).map((g) => {
    const rate = g.rate || 1;
    return `・${g.gameName || '未命名'}${rate !== 1 ? `（1:${rate}）` : ''}`;
  });
  const playerRows = playerRanking.map((p) => {
    const cash = roundCashTotal(p.profitCash, cashDecimals);
    return `${p.name || '???'}：${signedCash(cash, cashDecimals)}`;
  });
  return lines(
    `💰 日結結算｜${dateLabel}`,
    `場次 ${totalGames}｜總買入 ${money(totalBuyInAllCash)}`,
    gameRows.length ? ['', '📋 場次', gameRows] : null,
    playerRows.length ? ['', '📊 結算', playerRows] : null,
    url ? ['', `詳細：${url}`] : null,
  );
}

/** Daily report — ranking: biggest winners and losers. */
export function dailyRankingText({ dateLabel, topWinners = [], topLosers = [], cashDecimals = 0, url }) {
  const row = (p, mark) => `${mark} ${p.name}：${signedCash(roundCashTotal(p.profitCash, cashDecimals), cashDecimals)}`;
  const medals = ['🥇', '🥈', '🥉'];
  return lines(
    `🏆 日結排行｜${dateLabel}`,
    topWinners.length ? ['', '最大贏家', topWinners.map((p, i) => row(p, medals[i] || `${i + 1}.`))] : null,
    topLosers.length ? ['', '最大輸家', topLosers.map((p) => row(p, '💸'))] : null,
    !topWinners.length && !topLosers.length ? '暫無排行資料' : null,
    url ? ['', `詳細：${url}`] : null,
  );
}
