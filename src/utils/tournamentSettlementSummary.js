// What a tournament's settlement rows say about bounties — shared by the
// LINE settlement card (useLiff) and the plain-text share (shareText).
//
// Rows come from the settlement (functions/src/utils/tournamentSettlementMath.js):
// bounty games carry `bounty` and `knockouts`, mystery games also `draws`.

const num = (v) => Number(v) || 0;

/**
 * @param {Array<object>} rows Settlement rows
 * @return {{
 *   kind: 'none' | 'ko' | 'mystery',
 *   prizePool: number,      paid by placement (Σ prize)
 *   bountyTotal: number,    paid as bounties (Σ bounty)
 *   highlight: ?{ type: 'hunter' | 'lucky', row: object },
 * }}
 */
export function summarizeTournamentSettlement(rows = []) {
  const list = rows.filter(Boolean);
  const isBounty = list.some((r) => Number.isFinite(r.bounty));
  const isMystery = list.some((r) => Number.isInteger(r.draws));
  const kind = isMystery ? 'mystery' : isBounty ? 'ko' : 'none';
  const prizePool = list.reduce((s, r) => s + num(r.prize), 0);
  const bountyTotal = list.reduce((s, r) => s + num(r.bounty), 0);

  let highlight = null;
  if (kind === 'ko') {
    // Hunter: most knockouts, then most bounty
    const best = [...list].sort((a, b) => num(b.knockouts) - num(a.knockouts) || num(b.bounty) - num(a.bounty))[0];
    if (best && num(best.knockouts) > 0) highlight = { type: 'hunter', row: best };
  } else if (kind === 'mystery') {
    // 歐皇: most won from envelopes
    const best = [...list].sort((a, b) => num(b.bounty) - num(a.bounty) || num(b.topDraws) - num(a.topDraws))[0];
    if (best && num(best.draws) > 0 && num(best.bounty) > 0) highlight = { type: 'lucky', row: best };
  }
  return { kind, prizePool, bountyTotal, highlight };
}

/**
 * The bounty part of one row's detail line, or '' (no bounty).
 * @param {object} row Settlement row
 * @param {'none'|'ko'|'mystery'} kind
 * @param {(n: number) => string} money Formatter
 * @return {string}
 */
export function bountyDetail(row, kind, money) {
  if (kind === 'ko') return `🎯 KO ${num(row.knockouts)} · 賞金 ${money(row.bounty)}`;
  if (kind === 'mystery') return `🎁 抽 ${num(row.draws)} 封 ${money(row.bounty)}`;
  return '';
}
