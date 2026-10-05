// 抽座位: random seats (and a starting dealer button per table) for a
// tournament room. Seats live on the players — `player.seat = { table, seat,
// dealer?, button? }` — so they're written with the roster and need no extra rules.
//
//   - a table seats 10: nine numbered seats and the 荷官 (dealer) position —
//     our dealer plays too. The host picks each table's dealer (or none: then
//     seats run 1..10). The dealer sits at seat 0, between seat 9 and seat 1.
//   - tables: by headcount (10 a table), or chosen by the host
//   - everyone else is spread so table sizes (dealer included) differ by at
//     most one; seats are numbered 1..n per table, no gaps
//   - the starting button is drawn from every position, the dealer's included
//   - a re-entry keeps its seat (same player record); a player added later
//     takes the next seat at the emptiest table that has room

export const SEATS_PER_TABLE = 10;
export const DEALER_SEAT = 0;

/** Tables for a headcount when the host doesn't choose. */
export const autoTableCount = (n) => Math.max(1, Math.ceil(n / SEATS_PER_TABLE));

/** Table counts the host can pick from: enough seats, at least two a table. */
export const tableCountOptions = (n) => {
  const min = autoTableCount(n);
  const max = Math.max(min, Math.floor(n / 2));
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
};

/** Unbiased shuffle (Fisher–Yates). `random` returns [0, 1). */
function shuffle(list, random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** crypto-backed [0, 1) where available (fair for a draw people watch). */
export function secureRandom() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 2 ** 32;
  }
  return Math.random();
}

/**
 * Draw every player a seat, and each table its starting button.
 * @param {Array<object>} players Roster
 * @param {number} [tables] Table count (default: by headcount)
 * @param {() => number} [random]
 * @param {Array<?string>} [dealerIds] Each table's dealer (player id), or null for none
 * @return {Array<object>} Roster with `seat` set on everyone
 */
export function drawSeats(players = [], tables, random = secureRandom, dealerIds = []) {
  const count = Math.min(Math.max(1, Math.floor(tables || autoTableCount(players.length))), Math.max(1, players.length));
  const ids = new Set(players.map((p) => p.id));
  const dealers = Array.from({ length: count }, (_, i) => (ids.has(dealerIds[i]) ? dealerIds[i] : null));
  const dealerSet = new Set(dealers.filter(Boolean));

  // Everyone else to the table with the fewest people (dealer counted)
  const members = Array.from({ length: count }, () => []);
  const sizes = dealers.map((d) => (d ? 1 : 0));
  for (const id of shuffle(players.map((p) => p.id).filter((id) => !dealerSet.has(id)), random)) {
    let t = 0;
    for (let i = 1; i < count; i++) if (sizes[i] < sizes[t]) t = i;
    members[t].push(id);
    sizes[t] += 1;
  }

  const seatOf = new Map();
  members.forEach((list, ti) => {
    // seat order within a table is random too (who sits next to whom)
    shuffle(list, random).forEach((id, i) => seatOf.set(id, { table: ti + 1, seat: i + 1 }));
    if (dealers[ti]) seatOf.set(dealers[ti], { table: ti + 1, seat: DEALER_SEAT, dealer: true });
  });

  // The button: any position at the table, the dealer's included
  const buttons = members.map((list, ti) => {
    const positions = [...(dealers[ti] ? [DEALER_SEAT] : []), ...list.map((_, i) => i + 1)];
    return positions.length ? positions[Math.floor(random() * positions.length)] : null;
  });

  return players.map((p) => {
    const s = seatOf.get(p.id);
    return { ...p, seat: { ...s, ...(buttons[s.table - 1] === s.seat ? { button: true } : {}) } };
  });
}

/** Has this roster been seated? */
export const isSeated = (players = []) => players.some((p) => p.seat);

/** Each table's dealer id (null = none), from a seated roster. */
export function currentDealers(players = []) {
  const tables = Math.max(0, ...players.filter((p) => p.seat).map((p) => p.seat.table));
  return Array.from({ length: tables }, (_, i) => players.find((p) => p.seat?.table === i + 1 && p.seat.dealer)?.id || null);
}

/**
 * A seat for a player joining after the draw: the next number at the table
 * with the fewest people that still has room. null when nobody has been
 * seated yet, or every table is full.
 * @param {Array<object>} players Roster (without the new player)
 * @return {?{table: number, seat: number}}
 */
export function seatForNewPlayer(players = []) {
  const seated = players.filter((p) => p.seat);
  if (!seated.length) return null;
  const tables = Math.max(...seated.map((p) => p.seat.table));
  let best = null;
  for (let table = 1; table <= tables; table++) {
    const here = seated.filter((p) => p.seat.table === table);
    if (here.length >= SEATS_PER_TABLE) continue;
    if (!best || here.length < best.count) {
      best = { table, count: here.length, next: Math.max(0, ...here.map((p) => p.seat.seat)) + 1 };
    }
  }
  return best ? { table: best.table, seat: best.next } : null;
}

/** Seated players by table: the dealer first, then seats in order. */
export function seatingChart(players = []) {
  const seated = players.filter((p) => p.seat);
  const tables = seated.length ? Math.max(...seated.map((p) => p.seat.table)) : 0;
  return Array.from({ length: tables }, (_, i) => seated
    .filter((p) => p.seat.table === i + 1)
    .sort((a, b) => a.seat.seat - b.seat.seat));
}

/** "3" / "荷" on one table, "2-3" / "2-荷" with several. */
export function seatLabel(seat, multiTable, dealerMark = '荷') {
  if (!seat) return '';
  const no = seat.dealer ? dealerMark : `${seat.seat}`;
  return multiTable ? `${seat.table}-${no}` : no;
}
