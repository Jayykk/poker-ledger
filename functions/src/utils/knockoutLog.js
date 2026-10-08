// Who knocked whom out in one tournament, from its transaction log.
//
// NO firebase imports here on purpose: shared by
//   - src/utils/roomTitles.js               (首殺, live in the room)
//   - functions/src/handlers/gameHandEvents.js (復仇者, after the game)
//   - tests/knockoutLog.test.js
//
// Every elimination writes a transactions/{id} record (type 'eliminate',
// targetId = the roster id knocked out). Its eliminators are
//   KO / PKO  restore.bounty.awards[].playerId
//   mystery   the `by` of the roster ticket named in restore.mysteryTicket
//             (a knockout only earns a ticket once the draw phase started, so
//             earlier mystery knockouts have no eliminator on record)
// Undone eliminations are left with status 'undone' (and their ticket is
// removed), so only 'active' records count. Order: the elimination status
// order (restore.seq), then the record's timestamp.

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Unix millis of a timestamp in any of the shapes it is read in (number,
 * Firestore Timestamp of either SDK, `{ seconds }`, ISO string).
 *
 * @param {*} value Timestamp.
 * @return {number} Millis, 0 when unknown.
 */
export function millisOf(value) {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

/**
 * The game's knockouts in order, each with its eliminators (roster ids still
 * on the roster, the knocked-out player never among them). Knockouts without
 * a recorded eliminator are kept, with an empty `by`.
 *
 * @param {Array<object>} players The game's roster (id, mysteryTickets).
 * @param {Array<object>} transactions The game's transaction records.
 * @return {Array<{targetId: string, by: Array<string>}>}
 */
export function orderedKnockouts(players, transactions) {
  const roster = (players || []).filter((p) => p && p.id);
  const ids = new Set(roster.map((p) => p.id));
  const ticketBy = new Map();
  for (const p of roster) {
    for (const ticket of p.mysteryTickets || []) {
      if (ticket?.id) ticketBy.set(ticket.id, ticket.by || []);
    }
  }
  const order = (tx) => [num(tx.restore?.seq) || Infinity, millisOf(tx.timestamp)];
  return (transactions || [])
    .filter((tx) => tx?.type === 'eliminate' && tx.status === 'active')
    .sort((a, b) => {
      const [seqA, atA] = order(a);
      const [seqB, atB] = order(b);
      return (seqA === seqB ? 0 : seqA - seqB) || (atA - atB);
    })
    .map((tx) => {
      const by = [
        ...(tx.restore?.bounty?.awards || []).map((a) => a?.playerId),
        ...(tx.restore?.mysteryTicket ? ticketBy.get(tx.restore.mysteryTicket) || [] : []),
      ].filter((id) => ids.has(id) && id !== tx.targetId);
      return { targetId: tx.targetId || null, by: [...new Set(by)] };
    });
}

/**
 * 復仇者: A knocked B out, and later in the same game B knocked A out. Counted
 * for the avenger (B), once per player they paid back.
 *
 * @param {Array<object>} players The game's roster.
 * @param {Array<object>} transactions The game's transaction records.
 * @return {Object<string, number>} roster id → revenges (none left out).
 */
export function revengeCounts(players, transactions) {
  // victim → everyone who has knocked them out so far
  const knockedOutBy = new Map();
  const paidBack = new Set();
  const counts = {};
  for (const { targetId, by } of orderedKnockouts(players, transactions)) {
    if (!targetId) continue;
    for (const avenger of by) {
      const pair = `${avenger}\u0000${targetId}`;
      if (knockedOutBy.get(avenger)?.has(targetId) && !paidBack.has(pair)) {
        paidBack.add(pair);
        counts[avenger] = (counts[avenger] || 0) + 1;
      }
    }
    if (!knockedOutBy.has(targetId)) knockedOutBy.set(targetId, new Set());
    for (const avenger of by) knockedOutBy.get(targetId).add(avenger);
  }
  return counts;
}
