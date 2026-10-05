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
