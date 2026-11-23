// Money for 紀錄手牌 (HandRecordSheet): the losers' put-ins make the pot,
// the winners split it — so a recorded hand always balances to zero.

/**
 * Split a pot between winners in whole chips (leftover to the earlier ones).
 * @param {number} pot
 * @param {Array<string>} winnerIds
 * @return {Object<string, number>} id → share
 */
export function splitPot(pot, winnerIds = []) {
  const total = Math.max(0, Math.round(Number(pot) || 0));
  const ids = [...new Set(winnerIds)];
  if (!ids.length) return {};
  const base = Math.floor(total / ids.length);
  let left = total - base * ids.length;
  return Object.fromEntries(ids.map((id) => {
    const extra = left > 0 ? 1 : 0;
    left -= extra;
    return [id, base + extra];
  }));
}

/**
 * Quick put-in buttons: big blinds when a clock gives one (1 / 2 / 3 / 5 /
 * 10 BB), else parts of a buy-in (5 / 10 / 25 / 50 %).
 * @param {{ bigBlind?: number, baseBuyIn?: number }} ctx
 * @return {Array<{ label: string, amount: number }>}
 */
export function quickPutIns({ bigBlind = 0, baseBuyIn = 0 } = {}) {
  const bb = Math.round(Number(bigBlind) || 0);
  if (bb > 0) return [1, 2, 3, 5, 10].map((n) => ({ label: `${n}BB`, amount: n * bb }));
  const buyIn = Math.round(Number(baseBuyIn) || 0);
  if (buyIn <= 0) return [];
  return [0.05, 0.1, 0.25, 0.5]
    .map((f) => Math.max(1, Math.round(buyIn * f)))
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((amount) => ({ label: amount.toLocaleString(), amount }));
}

/**
 * Winners of a saved hand, biggest share first: flagged `winner: true`, else
 * (older records) chips > 0. Chips are optional, so a winner may hold 0.
 * @param {Array<{ chips?: number, winner?: boolean }>} players
 * @return {Array<Object>}
 */
export function handWinners(players = []) {
  const list = players || [];
  const flagged = list.filter((p) => p.winner);
  const winners = flagged.length ? flagged : list.filter((p) => (Number(p.chips) || 0) > 0);
  return [...winners].sort((a, b) => (Number(b.chips) || 0) - (Number(a.chips) || 0));
}

/**
 * "Name (+chips)", or just the name when the hand was saved without chips.
 * @param {{ playerName: string, chips?: number }} p
 * @return {string}
 */
export function winnerLabel(p) {
  const chips = Number(p.chips) || 0;
  return chips > 0 ? `${p.playerName} (+${chips})` : p.playerName;
}

/**
 * A player's result cell in a saved hand: signed chips, a 🏆 for a winner
 * (also when the hand was saved without chips), "—" for 0 and not a winner.
 * @param {{ chips?: number }} p
 * @param {Array<Object>} players the hand's players
 * @return {{ text: string, tone: 'win' | 'loss' | 'none' }}
 */
export function handResult(p, players = []) {
  const chips = Number(p.chips) || 0;
  const won = handWinners(players).includes(p);
  const amount = chips ? `${chips > 0 ? '+' : ''}${chips}` : '';
  if (won) return { text: amount ? `🏆 ${amount}` : '🏆', tone: 'win' };
  if (chips) return { text: amount, tone: chips > 0 ? 'win' : 'loss' };
  return { text: '—', tone: 'none' };
}
