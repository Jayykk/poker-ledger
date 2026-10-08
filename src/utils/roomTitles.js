// 房內即時稱號: live titles for this game only, computed on the client from
// the room the players are looking at. Never stored; they move as the game
// does and vanish when it ends. Shown only in the room (player rows, seat
// draw), in place of the player's regular 稱號 while one is active.
//
// Titles, in priority order (a player shows only the first one they hold):
//   hunter      獵人      most knockouts this game, at least 2 (ties: all)
//   chipLeader  籌碼王    tournament: the biggest stack among the players
//                         still in, with 3+ of them in and stacks actually
//                         tracked (some non-zero, not all equal); tie: nobody
//   phoenix     不死鳥    3+ rebuys (4+ buy-in groups) and, in a tournament,
//                         still in
//   patron      本場金主  most buy-in groups, at least 3 (ties: all)
//   prey        人氣目標  tournament: most times knocked out, at least 2
//                         (ties: all)
//   firstBlood  首殺      tournament: whoever made the first knockout that
//                         had an eliminator (every eliminator on a shared one)
//
// Where the numbers come from (the roster on the game doc, plus the room's
// transaction log for 首殺):
//   groups      buyIn / baseBuyIn (rounded, at least 1) — a tournament entry
//               or a cash buy-in is one group
//   knockouts   KO / PKO: player.knockouts (credited per eliminator on each
//               knockout, see bountyMath.applyKnockout). Mystery: the
//               non-final tickets' `by` (a knockout only earns a ticket once
//               the draw phase started; earlier ones aren't recorded).
//               Plain tournaments don't record who knocked whom out, so they
//               never have a 獵人 (or a 首殺).
//   knocked out a tournament re-enters only after being eliminated, so every
//               entry but the live one ended in a knockout:
//               entries − (still in ? 1 : 0). Works in every tournament
//               (bounty or not) and is the same count the all-time 被收頭
//               stat uses.
//   first KO    the active 'eliminate' records in status order (restore.seq,
//               then timestamp): the first whose bounty.awards name an
//               eliminator (KO / PKO), or whose mysteryTicket's `by` does
//               (functions/src/utils/knockoutLog.js).
//
// The subject decides, and it's opt-in: only a player whose userTitles
// prefs.showRoomTitles is true gets one (prefsOf), whatever the viewer's own
// setting. Leaders are still worked out over everyone, so someone not opted
// in doesn't hand a title to the runner-up. Seats without an account can't
// opt in, so they never get one.

import { DEFAULT_BUY_IN } from './constants.js';
// The ordered knockout log (shared with the server's 復仇者)
import { orderedKnockouts } from '../../functions/src/utils/knockoutLog.js';

export const ROOM_TITLE_IDS = Object.freeze([
  'hunter', 'chipLeader', 'phoenix', 'patron', 'prey', 'firstBlood',
]);

export const ROOM_TITLE_MIN = Object.freeze({
  hunterKnockouts: 2,
  preyKnockedOut: 2,
  patronGroups: 3,
  phoenixGroups: 4,
  chipLeaderPlayers: 3,
});

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Buy-in groups of a player (a tournament entry or a cash buy-in each). */
export function buyInGroups(player, baseBuyIn) {
  const base = num(baseBuyIn);
  if (base <= 0) return 1;
  return Math.max(1, Math.round(num(player?.buyIn) / base));
}

/** Knockouts credited to each player id this game. */
function knockoutCounts(players, bounty) {
  const counts = {};
  if (bounty?.type === 'mystery') {
    for (const p of players) {
      for (const ticket of p.mysteryTickets || []) {
        if (ticket.final) continue;
        for (const id of ticket.by || []) counts[id] = (counts[id] || 0) + 1;
      }
    }
    return counts;
  }
  for (const p of players) counts[p.id] = num(p.knockouts);
  return counts;
}

/**
 * Ids holding the top value (≥ min). All of them on a tie.
 * @return {Array<string>}
 */
function leaders(players, valueOf, min) {
  let best = -Infinity;
  for (const p of players) best = Math.max(best, valueOf(p));
  if (best < min) return [];
  return players.filter((p) => valueOf(p) === best).map((p) => p.id);
}

/** Eliminators of the game's first knockout (see the header). */
function firstBloodIds(players, transactions) {
  return orderedKnockouts(players, transactions).find((ko) => ko.by.length)?.by || [];
}

/**
 * Live titles of a game's players.
 *
 * @param {?object} game Game doc ({ type, players, baseBuyIn, bounty }).
 * @param {object} [options]
 * @param {Array<object>} [options.transactions] The room's transaction log
 *   (only for 首殺; leave out to skip it).
 * @param {boolean} [options.tournament] Tournament room (default: game.type).
 * @param {function(string): ?object} [options.prefsOf] uid → that player's
 *   title prefs; only `showRoomTitles: true` gets a title.
 * @return {Object<string, string>} playerId → title id (players without one
 *   left out).
 */
export function computeRoomTitles(game, { transactions, tournament, prefsOf } = {}) {
  const players = Array.isArray(game?.players) ? game.players.filter((p) => p && p.id) : [];
  if (!players.length) return {};
  const isTournament = tournament ?? game.type === 'tournament';
  const base = num(game.baseBuyIn) || (isTournament ? 0 : DEFAULT_BUY_IN);
  const groups = (p) => buyInGroups(p, base);
  const held = {};
  const give = (id, title) => { (held[id] ||= new Set()).add(title); };

  // 本場金主 / 不死鳥: buy-in groups
  leaders(players, groups, ROOM_TITLE_MIN.patronGroups).forEach((id) => give(id, 'patron'));
  for (const p of players) {
    if (groups(p) >= ROOM_TITLE_MIN.phoenixGroups && !(isTournament && p.eliminated)) give(p.id, 'phoenix');
  }

  if (isTournament) {
    // 獵人
    const kos = knockoutCounts(players, game.bounty);
    leaders(players, (p) => kos[p.id] || 0, ROOM_TITLE_MIN.hunterKnockouts)
      .forEach((id) => give(id, 'hunter'));

    // 人氣目標: every entry but the live one ended in a knockout
    const knockedOut = (p) => groups(p) - (p.eliminated ? 0 : 1);
    leaders(players, knockedOut, ROOM_TITLE_MIN.preyKnockedOut).forEach((id) => give(id, 'prey'));

    // 籌碼王: only when stacks are tracked, one clear leader
    const alive = players.filter((p) => !p.eliminated);
    const stacks = alive.map((p) => num(p.stack));
    const tracked = stacks.some((s) => s > 0) && new Set(stacks).size > 1;
    if (alive.length >= ROOM_TITLE_MIN.chipLeaderPlayers && tracked) {
      const top = leaders(alive, (p) => num(p.stack), 1);
      if (top.length === 1) give(top[0], 'chipLeader');
    }

    // 首殺
    if (transactions) firstBloodIds(players, transactions).forEach((id) => give(id, 'firstBlood'));
  }

  const result = {};
  for (const p of players) {
    const titles = held[p.id];
    if (!titles) continue;
    // (Without prefsOf, e.g. working out leaders alone, everyone counts)
    if (prefsOf && (!p.uid || prefsOf(p.uid)?.showRoomTitles !== true)) continue;
    result[p.id] = ROOM_TITLE_IDS.find((id) => titles.has(id));
  }
  return result;
}
