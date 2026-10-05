// 抽座位: random seats (and a starting dealer button per table) for a
// tournament room. Seats live on the players — `player.seat = { table, seat,
// button? }` — so they're written with the roster and need no extra rules.
//
//   - tables: chosen by the host, or by headcount (10 a table at most)
//   - players are spread evenly (table sizes differ by at most one) and seats
//     are numbered 1..n per table, no gaps
//   - a re-entry keeps its seat (same player record); a player added later
//     takes the next seat at the emptiest table

export const MAX_PER_TABLE = 10;

/** Tables for a headcount when the host doesn't choose. */
export const autoTableCount = (n) => Math.max(1, Math.ceil(n / MAX_PER_TABLE));

/** Table counts the host can pick from (at least two players a table). */
export const tableCountOptions = (n) => {
  const max = Math.max(1, Math.floor(n / 2));
  return Array.from({ length: max }, (_, i) => i + 1);
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
 * Draw every player a seat, and each table its dealer button.
 * @param {Array<object>} players Roster
 * @param {number} [tables] Table count (default: by headcount)
 * @param {() => number} [random]
 * @return {Array<object>} Roster with `seat` set on everyone
 */
export function drawSeats(players = [], tables, random = secureRandom) {
  const count = Math.min(Math.max(1, Math.floor(tables || autoTableCount(players.length))), Math.max(1, players.length));
  const order = shuffle(players.map((p) => p.id), random);
  const seatOf = new Map();
  // Deal like cards: player k goes to table (k mod count) — even tables
  const sizes = Array(count).fill(0);
  order.forEach((id, k) => {
    const table = (k % count) + 1;
    sizes[table - 1] += 1;
    seatOf.set(id, { table, seat: sizes[table - 1] });
  });
  // A random seat on each table starts with the button
  const buttons = sizes.map((size) => (size > 0 ? 1 + Math.floor(random() * size) : 0));
  // Seat numbers so far follow the deal order; shuffle them within each table
  // so who sits next to whom is random too
  const byTable = Array.from({ length: count }, () => []);
  for (const [id, s] of seatOf) byTable[s.table - 1].push(id);
  byTable.forEach((ids, ti) => {
    shuffle(ids, random).forEach((id, i) => seatOf.set(id, { table: ti + 1, seat: i + 1 }));
  });
  return players.map((p) => {
    const s = seatOf.get(p.id);
    return { ...p, seat: { ...s, ...(buttons[s.table - 1] === s.seat ? { button: true } : {}) } };
  });
}

/** Has this roster been seated? */
export const isSeated = (players = []) => players.some((p) => p.seat);

/**
 * A seat for a player joining after the draw: the next number at the table
 * with the fewest players. null when nobody has been seated yet.
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
    if (!best || here.length < best.count) {
      best = { table, count: here.length, next: Math.max(0, ...here.map((p) => p.seat.seat)) + 1 };
    }
  }
  return { table: best.table, seat: best.next };
}

/** Seated players by table, in seat order. */
export function seatingChart(players = []) {
  const seated = players.filter((p) => p.seat);
  const tables = seated.length ? Math.max(...seated.map((p) => p.seat.table)) : 0;
  return Array.from({ length: tables }, (_, i) => seated
    .filter((p) => p.seat.table === i + 1)
    .sort((a, b) => a.seat.seat - b.seat.seat));
}

/** "3" on one table, "2-3" when there are several. */
export const seatLabel = (seat, multiTable) => (seat ? (multiTable ? `${seat.table}-${seat.seat}` : `${seat.seat}`) : '');
