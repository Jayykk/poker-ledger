/* eslint-disable valid-jsdoc */
// Mystery bounty math, shared by the settlement Cloud Functions and the app
// (src/utils/bounty.js re-exports it).
//
// Every entry puts `perEntry` of its buy-in into the mystery bounty pool. The
// pool is cut into envelopes, each worth a share (%) of it:
//   bounty.envelopes  [{ share, count }]  — Σ share × count = 100
//   bounty.start      { mode: 'players' | 'level' | 'cutoff', value }
//   bounty.drawMode   'system' (random draw) | 'manual' (physical envelopes)
// Draws only happen once re-entry has closed (the pool is final), and from the
// start condition on:
//   - each knockout with an eliminator earns one draw (a ticket); a shared
//     knockout splits the envelope it draws
//   - the champion draws one more at the end; in a deal each player left
//     draws one
//   - a knockout with no eliminator earns nothing
// Envelopes nobody drew go into the prize pool (paid by placement), so
// Σ prizes + Σ bounties = Σ buy-ins.
//
// Tickets live on the `players` array (every seated player may write it):
//   player.mysteryTickets  [{ id, by: [playerIds], envelope: null | slot,
//                             final?: true, at }]
// A knockout's ticket sits on the knocked-out player; a final draw's on the
// player drawing. `envelope` is a slot index into envelopeSlots().

export const MYSTERY = 'mystery';
export const START_MODES = ['players', 'level', 'cutoff'];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const isMysteryBounty = (bounty) => bounty?.type === MYSTERY;

/** [{ share, count }] → one entry per envelope: [{ slot, share, tier }]. */
export function envelopeSlots(bounty) {
  const slots = [];
  (bounty?.envelopes || []).forEach((tier, tierIndex) => {
    const count = Math.max(0, Math.floor(num(tier.count)));
    for (let i = 0; i < count; i++) {
      slots.push({ slot: slots.length, share: Math.max(0, num(tier.share)), tier: tierIndex });
    }
  });
  return slots;
}

/** Σ share × count (should be 100). */
export function envelopeTotalShare(envelopes = []) {
  return envelopes.reduce(
    (sum, e) => sum + num(e.share) * Math.max(0, Math.floor(num(e.count))), 0,
  );
}

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * Suggested envelopes for n envelopes: one big prize, a couple of medium
 * ones, the rest equal. Shares are per envelope, rounded to 0.01 %, with the
 * last tier absorbing the rounding so the total is exactly 100.
 */
export function suggestEnvelopes(n) {
  const count = Math.max(1, Math.floor(num(n)) || 1);
  let tiers;
  if (count <= 3) tiers = [{ share: 100 / count, count }];
  else if (count <= 5) {
    tiers = [{ share: 40, count: 1 }, { share: 60 / (count - 1), count: count - 1 }];
  } else {
    tiers = [
      { share: 30, count: 1 },
      { share: 15, count: 2 },
      { share: 40 / (count - 3), count: count - 3 },
    ];
  }
  tiers = tiers.map((t) => ({ share: round2(t.share), count: t.count }));
  // Exact 100: fold the rounding into one envelope of its own if needed
  const drift = round2(100 - envelopeTotalShare(tiers));
  if (drift !== 0) {
    const last = tiers[tiers.length - 1];
    if (last.count === 1) last.share = round2(last.share + drift);
    else {
      last.count -= 1;
      tiers.push({ share: round2(last.share + drift), count: 1 });
    }
  }
  return tiers;
}

/**
 * Whole-unit amount of every envelope slot for a pool, largest remainder,
 * summing exactly to the pool (shares are normalized to their total).
 */
export function envelopeAmounts(bounty, pool) {
  const slots = envelopeSlots(bounty);
  const total = slots.reduce((sum, s) => sum + s.share, 0);
  const target = Math.max(0, Math.round(num(pool)));
  if (!slots.length || total <= 0) return [];
  const exact = slots.map((s) => (target * s.share) / total);
  const floored = exact.map((x) => Math.floor(x));
  let leftover = target - floored.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (leftover <= 0) break;
    floored[i] += 1;
    leftover -= 1;
  }
  return floored;
}

/** Every ticket in the game (with the player it sits on). */
export function allTickets(players = []) {
  return players.flatMap((p) => (p.mysteryTickets || []).map((t) => ({ ...t, holderId: p.id })));
}

/** Envelope slots nobody has drawn yet. */
export function remainingSlots(bounty, players = []) {
  const used = new Set(allTickets(players)
    .map((t) => t.envelope)
    .filter((e) => e !== null && e !== undefined));
  return envelopeSlots(bounty).filter((s) => !used.has(s.slot));
}

/** Tickets still waiting for their draw. */
export const pendingTickets = (players = []) =>
  allTickets(players).filter((t) => t.envelope === null || t.envelope === undefined);

/** Slots not drawn and not reserved by a waiting ticket. */
export function freeSlotCount(bounty, players = []) {
  return Math.max(0, remainingSlots(bounty, players).length - pendingTickets(players).length);
}

/**
 * Has the draw phase started for the next knockout?
 * @param {object} ctx { aliveBefore, reentryClosed, level }
 */
export function mysteryPhaseActive(
  bounty, { aliveBefore = 0, reentryClosed = false, level = 0 } = {},
) {
  if (!isMysteryBounty(bounty) || !reentryClosed) return false;
  const value = Math.floor(num(bounty.start?.value));
  switch (bounty.start?.mode) {
  case 'players': return aliveBefore <= value;
  case 'level': return level >= value;
  default: return true; // 'cutoff': as soon as re-entry closes
  }
}

let seq = 0;
const ticketId = () => {
  const rand = Math.random().toString(36).slice(2, 6);
  return `t_${Date.now().toString(36)}_${(seq++).toString(36)}_${rand}`;
};

/** Add a draw ticket to a player. Returns { players, ticket }. */
export function addTicket(players, holderId, by, { final = false, now = Date.now() } = {}) {
  const ticket = {
    id: ticketId(),
    by: [...new Set(by)],
    envelope: null,
    ...(final ? { final: true } : {}),
    at: now,
  };
  return {
    ticket,
    players: players.map((p) => (p.id === holderId ?
      { ...p, mysteryTickets: [...(p.mysteryTickets || []), ticket] } :
      p)),
  };
}

/** Remove a ticket (undoing the knockout that earned it). */
export function removeTicket(players, ticketIdToRemove) {
  return players.map((p) => (p.mysteryTickets?.some((t) => t.id === ticketIdToRemove)
    ? { ...p, mysteryTickets: p.mysteryTickets.filter((t) => t.id !== ticketIdToRemove) }
    : p));
}

/**
 * Record (or clear, envelope = null) the envelope a ticket drew. drawnAt
 * lets screens showing the draw (the TV stage) tell a new draw from an old one.
 */
export function setTicketEnvelope(players, id, envelope, now = Date.now()) {
  const drawn = envelope !== null && envelope !== undefined;
  return players.map((p) => (p.mysteryTickets?.some((t) => t.id === id) ?
    {
      ...p,
      mysteryTickets: p.mysteryTickets.map((t) => (t.id === id ?
        { ...t, envelope: drawn ? envelope : null, drawnAt: drawn ? now : null } :
        t)),
    } :
    p));
}

/**
 * When may a draw be made, and by whom (the rules on the draw screens):
 *   - the host: while the clock is paused or on a break, or the TV stage is
 *     open (they're presenting it)
 *   - a player, for their own draw: only while the TV stage is open, and
 *     not with physical envelopes (the host records those)
 * @param {object} ctx { isHost, mySeatId, clockPaused, onBreak, stageOpen, drawMode }
 */
export function canDrawTicket(ticket, ctx = {}) {
  if (!ticket || (ticket.envelope !== null && ticket.envelope !== undefined)) return false;
  if (ctx.isHost) return !!(ctx.clockPaused || ctx.onBreak || ctx.stageOpen);
  if (ctx.drawMode === 'manual') return false;
  return !!ctx.stageOpen && (ticket.by || []).includes(ctx.mySeatId);
}

/** A random free slot (system draw). `random` returns [0, 1). */
export function pickRandomSlot(bounty, players, random = Math.random) {
  const free = remainingSlots(bounty, players);
  if (!free.length) return null;
  return free[Math.min(free.length - 1, Math.floor(random() * free.length))].slot;
}

/** A free slot of a tier (manual draw: the host picks what was in the envelope). */
export function slotOfTier(bounty, players, tier) {
  return remainingSlots(bounty, players).find((s) => s.tier === tier)?.slot ?? null;
}

/**
 * Settlement view of a mystery game.
 * @return {{ pool, amounts, bountyByPlayer, drawn, undrawn }}
 *   pool            the whole mystery bounty pool
 *   amounts         amount per envelope slot
 *   bountyByPlayer  { playerId: total from drawn envelopes }
 *   undrawn         what goes into the prize pool
 */
export function mysteryResults(players = [], bounty, pool) {
  const amounts = envelopeAmounts(bounty, pool);
  const bountyByPlayer = {};
  let drawn = 0;
  for (const t of allTickets(players)) {
    if (t.envelope === null || t.envelope === undefined) continue;
    const amount = amounts[t.envelope] || 0;
    drawn += amount;
    const ids = (t.by || []).filter(Boolean);
    if (!ids.length) continue;
    const base = Math.floor(amount / ids.length);
    let leftover = amount - base * ids.length;
    for (const id of ids) {
      const extra = leftover > 0 ? 1 : 0;
      leftover -= extra;
      bountyByPlayer[id] = (bountyByPlayer[id] || 0) + base + extra;
    }
  }
  const total = Math.round(num(pool));
  return { pool: total, amounts, bountyByPlayer, drawn, undrawn: total - drawn };
}
