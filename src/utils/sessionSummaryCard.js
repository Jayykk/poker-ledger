/**
 * LINE flex bubble for the shared 活動總結 card.
 *
 * Lists every player, not just the top few. When the event has expenses
 * (代墊分帳) the card carries all three views the summary page has: 總和
 * (poker + expenses, what everyone finally receives or pays), 牌局, and
 * 代墊 with a line per expense saying who owes the payer what.
 *
 * Pure so it can be unit tested; useLiff hands the result to shareTargetPicker.
 */
import { formatCashTotal } from './cashRounding.js';
import { aggregateExpenses, combineEventTotals, expenseDebts } from './eventExpenses.js';

const MEDALS = ['🥇', '🥈', '🥉'];
const GREEN = '#1DB446';
const RED = '#DC143C';
const INK = '#333333';
const MUTED = '#777777';

const signed = (n, decimals) => `${n >= 0 ? '+' : ''}${formatCashTotal(n, decimals)}`;

function amountRow({ label, amount, decimals, first }) {
  return {
    type: 'box', layout: 'horizontal', margin: first ? 'md' : 'sm', contents: [
      { type: 'text', text: label, size: 'sm', color: INK, flex: 5, wrap: true },
      { type: 'text', text: signed(amount, decimals), size: 'sm', weight: 'bold', align: 'end', color: amount >= 0 ? GREEN : RED, flex: 3 },
    ],
  };
}

function sectionTitle(text) {
  return { type: 'text', text, size: 'sm', weight: 'bold', color: MUTED, margin: 'lg' };
}

const ranked = (i, name) => `${MEDALS[i] || `${i + 1}.`} ${name || ''}`;

/**
 * @param {object} session sessions/{id} doc ({ name })
 * @param {{ ranking: Array<{odId?, name, profitCash}>, tableCount: number, totalBuyIn: number, cashDecimals?: number }} summary
 * @param {Array} [expenses] the event's expenses (sessions/{id}/expenses docs)
 * @param {string} [uri] link to the event page
 * @returns {object} flex bubble
 */
export function buildSessionSummaryBubble(session, summary, expenses = [], uri = '') {
  const decimals = summary?.cashDecimals;
  const ranking = summary?.ranking || [];
  const expenseRows = aggregateExpenses(expenses);
  const body = [
    { type: 'text', text: session?.name || '撲克活動', weight: 'bold', size: 'md', color: INK, wrap: true },
    { type: 'box', layout: 'horizontal', margin: 'md', contents: [
      { type: 'text', text: `桌數 ${summary?.tableCount || 0}`, size: 'sm', color: MUTED, flex: 0 },
      { type: 'text', text: `總買入 ${Math.round(summary?.totalBuyIn || 0)}`, size: 'sm', color: MUTED, align: 'end' },
    ] },
    { type: 'separator', color: '#EEEEEE', margin: 'lg' },
  ];

  if (!expenseRows.length) {
    ranking.forEach((p, i) => body.push(amountRow({ label: ranked(i, p.name), amount: p.profitCash, decimals, first: i === 0 })));
  } else {
    body.push(sectionTitle('💰 總和（牌局＋代墊）'));
    combineEventTotals(ranking, expenseRows).forEach((r, i) => body.push(
      amountRow({ label: ranked(i, r.name), amount: r.total, decimals, first: i === 0 }),
    ));

    if (ranking.length) {
      body.push(sectionTitle('🃏 牌局'));
      ranking.forEach((p, i) => body.push(amountRow({ label: ranked(i, p.name), amount: p.profitCash, decimals, first: i === 0 })));
    }

    body.push(sectionTitle('💸 代墊'));
    expenseRows.forEach((r, i) => body.push(amountRow({ label: r.name || '—', amount: r.net, decimals, first: i === 0 })));
    // One line per expense: who owes the payer what
    for (const e of expenses) {
      const debts = expenseDebts(e);
      if (!debts.length) continue;
      const names = e.names || {};
      const payer = e.payerName || names[e.payerUid] || '—';
      const total = debts.reduce((s, d) => s + d.amount, 0);
      body.push({
        type: 'text', size: 'xs', color: MUTED, wrap: true, margin: 'md',
        text: `${e.title || '代墊'}（${payer} 付，收 $${total}）`,
      });
      body.push({
        type: 'text', size: 'xs', color: MUTED, wrap: true,
        text: debts.map((d) => `${names[d.uid] || '—'} $${d.amount}`).join('、'),
      });
    }
  }

  const action = uri ? { action: { type: 'uri', label: '查看總結', uri } } : {};
  return {
    type: 'bubble',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: GREEN,
      contents: [{ type: 'text', text: '🏆 活動總結', color: '#FFFFFF', weight: 'bold', size: 'lg' }],
      ...action,
    },
    body: { type: 'box', layout: 'vertical', contents: body, ...action },
  };
}
