// 抽座位: random seats (and a starting dealer button) for a room. A room is
// one physical table — a second table is another room. Seats live on the
// players (`player.seat = { seat, dealer?, button? }`) so they're written with
// the roster and need no extra rules.
//
//   - the table: the 荷官 (dealer — ours plays too) position plus seats 1..9,
//     always — ten people at most with a dealer, nine without one (the dealer
//     position stays empty). The dealer sits at seat 0, between 9 and 1.
//   - fewer players than seats: they land on random seats, gaps and all
//   - the starting button is drawn from every taken position, dealer's included
//   - joining later: a random free seat. A re-entry keeps its seat unless
//     someone took it meanwhile (then a random free one). Free = not held by
//     anyone still in.

export const DEALER_SEAT = 0;
export const TABLE_FULL = 'TABLE_FULL';

/** Numbered seats at the table (the dealer position comes on top). */
export const SEAT_COUNT = 9;

/** People the table holds: the nine seats, plus the dealer if there is one. */
export const tableCapacity = (hasDealer) => SEAT_COUNT + (hasDealer ? 1 : 0);

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

const pick = (list, random) => list[Math.floor(random() * list.length)];

/**
 * Draw everyone a seat and the starting button.
 * @param {Array<object>} players Roster
 * @param {{ dealerId?: ?string, random?: () => number }} [opts]
 * @return {Array<object>} Roster with `seat` set on everyone
 * @throws {Error} TABLE_FULL when there are more players than seats
 */
export function drawSeats(players = [], { dealerId = null, random = secureRandom } = {}) {
  const dealer = players.some((p) => p.id === dealerId) ? dealerId : null;
  const others = players.filter((p) => p.id !== dealer);
  const cap = SEAT_COUNT;
  if (others.length > cap) throw new Error(TABLE_FULL);

  const numbers = shuffle(Array.from({ length: cap }, (_, i) => i + 1), random);
  const seatOf = new Map(shuffle(others.map((p) => p.id), random).map((id, i) => [id, numbers[i]]));
  if (dealer) seatOf.set(dealer, DEALER_SEAT);
  const button = pick([...seatOf.values()], random);

  return players.map((p) => {
    const seat = seatOf.get(p.id);
    return {
      ...p,
      seat: {
        seat,
        ...(seat === DEALER_SEAT ? { dealer: true } : {}),
        ...(seat === button ? { button: true } : {}),
      },
    };
  });
}

/** Has this roster been seated? */
export const isSeated = (players = []) => players.some((p) => p.seat);

/** The dealer's player id, or null. */
export const currentDealer = (players = []) => players.find((p) => p.seat?.dealer)?.id || null;

/** Numbered seats nobody still in is holding. */
export function freeSeats(players = [], exceptId = null) {
  const cap = SEAT_COUNT;
  const taken = new Set(players
    .filter((p) => p.seat && !p.eliminated && p.id !== exceptId && !p.seat.dealer)
    .map((p) => p.seat.seat));
  return Array.from({ length: cap }, (_, i) => i + 1).filter((n) => !taken.has(n));
}

/**
 * A seat for someone joining after the draw: a random free seat. null when
 * nobody has been seated yet, or the table is full.
 * @param {Array<object>} players Roster (without the new player)
 * @param {() => number} [random]
 * @return {?{seat: number}}
 */
export function seatForNewPlayer(players = [], random = secureRandom) {
  if (!isSeated(players)) return null;
  const free = freeSeats(players);
  return free.length ? { seat: pick(free, random) } : null;
}

/**
 * Re-entry: keep the seat if it's still free (the dealer always keeps theirs),
 * else a random free one, else none.
 * @param {Array<object>} players Roster, the re-entering player included
 * @param {string} playerId
 * @param {() => number} [random]
 * @return {Array<object>} Roster
 */
export function reseatOnReentry(players = [], playerId, random = secureRandom) {
  const me = players.find((p) => p.id === playerId);
  if (!me || !isSeated(players)) return players;
  if (me.seat?.dealer) return players;
  const free = freeSeats(players, playerId);
  if (me.seat && free.includes(me.seat.seat)) return players;
  const seat = free.length ? { seat: pick(free, random) } : null;
  return players.map((p) => {
    if (p.id !== playerId) return p;
    const rest = { ...p };
    delete rest.seat;
    return seat ? { ...rest, seat } : rest;
  });
}

/**
 * The table as it stands: the dealer, then every numbered seat with whoever
 * is in it (null = empty). Eliminated players leave their seat empty.
 * @param {Array<object>} players
 * @return {{ dealer: ?object, seats: Array<{ no: number, player: ?object }> }}
 */
export function seatingChart(players = []) {
  const live = players.filter((p) => p.seat && !p.eliminated);
  const dealer = players.find((p) => p.seat?.dealer) || null;
  const cap = SEAT_COUNT;
  return {
    dealer,
    seats: Array.from({ length: cap }, (_, i) => ({
      no: i + 1,
      player: live.find((p) => !p.seat.dealer && p.seat.seat === i + 1) || null,
    })),
  };
}

/** "3", or the dealer mark. */
export const seatLabel = (seat, dealerMark = '荷') => (seat ? (seat.dealer ? dealerMark : `${seat.seat}`) : '');

/**
 * The table as it stands during play: like seatingChart, plus who used to
 * sit in each free seat (`out`: the knocked-out player who held it and
 * finished best, i.e. left it last), so the table can show them greyed out
 * with their place. A seat someone else took since has no `out`.
 */
export function liveSeatingChart(players = []) {
  const chart = seatingChart(players);
  const lastOut = (match) => players
    .filter((p) => p.seat && p.eliminated && match(p))
    .sort((a, b) => (a.placement || 999) - (b.placement || 999))[0] || null;
  const dealerOut = !!chart.dealer?.eliminated;
  return {
    dealer: dealerOut ? null : chart.dealer,
    dealerOut: dealerOut ? chart.dealer : null,
    seats: chart.seats.map((s) => ({
      ...s,
      out: s.player ? null : lastOut((p) => !p.seat.dealer && p.seat.seat === s.no),
    })),
  };
}

/**
 * Who sits next to `me`, skipping empty seats and knocked-out players. Left /
 * right as I see them from my seat, facing the table: the seats run clockwise
 * seen from above (dealer, 1, 2 … 9), so the next number up is on my left.
 * @return {{ left: ?object, right: ?object }} null when I have no seat or
 *   nobody else is seated (heads-up, both are the same player)
 */
export function seatNeighbours(players = [], me = null) {
  const indexOf = (p) => (p.seat.dealer ? DEALER_SEAT : p.seat.seat);
  if (!me?.seat) return { left: null, right: null };
  const total = SEAT_COUNT + 1;
  const at = new Map(players
    .filter((p) => p.seat && !p.eliminated && p.id !== me.id)
    .map((p) => [indexOf(p), p]));
  const mine = indexOf(me);
  const find = (dir) => {
    for (let k = 1; k < total; k++) {
      const hit = at.get((mine + dir * k + total * k) % total);
      if (hit) return hit;
    }
    return null;
  };
  return { left: find(1), right: find(-1) };
}
