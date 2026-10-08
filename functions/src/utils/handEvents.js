// 手牌稱號: what one game's recorded hands (games/{gameId}/hands) and its
// knockout log say about each player, for the 手牌 / 復仇者 titles.
//
// NO firebase imports here on purpose: used by
//   - functions/src/handlers/gameHandEvents.js (projection + backfill)
//   - tests/functions/handEvents.test.js
// It ranks hands with handEvaluator.js (pokersolver, a functions-only
// dependency), so the frontend does not import it.
//
// A hand record (src/components/game/HandRecordSheet.vue):
//   { communityCards: [≤ 5], players: [{ playerId, playerUid?, cards: [2] | [],
//     handType, chips, winner? }] }
// Cards are written as rank + suit symbol ('A♠', '10♥'); 'As' / 'Th' / '10h'
// are read too. playerId is the roster id on games/{gameId}.players[], whose
// `uid` the counts are keyed by; seats without an account are left out.
//
// Per player and hand (each at most once per hand):
//   quads / straightFlush / royalFlush  the final hand. From the cards when
//       both hole cards and ≥ 3 board cards are known (only when the made hand
//       uses a hole card: quads or a straight flush lying on the board belong
//       to nobody), else from the recorded handType.
//   tragicHero  four of a kind or better (same reading) in a hand they did not
//       take. Needs the winners: `winner: true`, or on older records (no
//       winner flags) the players with chips > 0; otherwise skipped.
//   badBeatWins / coolers  a winner and a player who didn't take the pot, both
//       with known hole cards and a full board: streetEquities() gives the
//       winner's equity preflop / flop / turn, classifyShowdown() decides
//       (rule and its approximation: see "the bad beat / cooler rule").

import { evaluateHand } from './handEvaluator.js';
import { HAND_EVENT_KEYS, emptyHandEvents } from './leaderboardStatsMath.js';
import { revengeCounts } from './knockoutLog.js';

// Weakest first; the index is the strength
export const HAND_CATEGORIES = Object.freeze([
  'high_card', 'one_pair', 'two_pair', 'three_of_a_kind', 'straight', 'flush',
  'full_house', 'four_of_a_kind', 'straight_flush', 'royal_flush',
]);
const strength = (category) => HAND_CATEGORIES.indexOf(category);
const QUADS = strength('four_of_a_kind');

// Preflop equity is sampled: an exact run over every 5-card board is ~1.7M
// boards (≈ 3.4M hand rankings, ~1 s per pair), too slow for the projection,
// which runs inside a callable / trigger for every recorded hand. 20,000
// seeded runouts (±~0.3% at 20%) take ~10 ms and give the same answer every
// run. Flop (≤ 990 runouts) and turn (≤ 44) are enumerated exactly.
export const PREFLOP_SAMPLES = 20000;

const STREETS = Object.freeze(['preflop', 'flop', 'turn']);

const SUIT_OF = Object.freeze({
  '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c', 's': 's', 'h': 'h', 'd': 'd', 'c': 'c',
});
const RANK_CHARS = 'AKQJT98765432';
const DECK = Object.freeze([...RANK_CHARS].flatMap((r) => ['s', 'h', 'd', 'c'].map((s) => r + s)));

/**
 * A recorded card in pokersolver notation ('A♠' → 'As', '10♥' → 'Th').
 *
 * @param {*} card Recorded card.
 * @return {?string} Card, or null when it can't be read.
 */
export function toSolverCard(card) {
  if (typeof card !== 'string') return null;
  const text = card.trim();
  if (text.length < 2) return null;
  const suit = SUIT_OF[text.slice(-1).toLowerCase()] || SUIT_OF[text.slice(-1)];
  let rank = text.slice(0, -1).toUpperCase();
  if (rank === '10') rank = 'T';
  if (!suit || rank.length !== 1 || !RANK_CHARS.includes(rank)) return null;
  return rank + suit;
}

/**
 * A recorded handType ('four_of_a_kind', 'Four of a Kind', …) as a category.
 *
 * @param {*} type Recorded hand type.
 * @return {?string} One of HAND_CATEGORIES, or null.
 */
export function normalizeHandType(type) {
  if (typeof type !== 'string' || !type.trim()) return null;
  const key = type.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const aliases = {
    pair: 'one_pair', four_of_kind: 'four_of_a_kind', three_of_kind: 'three_of_a_kind',
    quads: 'four_of_a_kind', trips: 'three_of_a_kind', set: 'three_of_a_kind',
  };
  const category = aliases[key] || key;
  return HAND_CATEGORIES.includes(category) ? category : null;
}

/**
 * Category of an evaluated (pokersolver, standard game: rank 1–9) hand.
 *
 * @param {object} evaluation evaluateHand() result.
 * @return {string}
 */
function categoryOf(evaluation) {
  if (evaluation.descr === 'Royal Flush') return 'royal_flush';
  return HAND_CATEGORIES[evaluation.rank - 1] || 'high_card';
}

/**
 * Does the made part of a quads / straight-flush hand use a hole card?
 *
 * @param {object} evaluation evaluateHand() result.
 * @param {Array<string>} holes Hole cards (solver notation).
 * @param {string} category categoryOf(evaluation).
 * @return {boolean}
 */
function usesHoleCard(evaluation, holes, category) {
  const cards = evaluation.hand.cards.map((c) => c.value + c.suit);
  if (category === 'four_of_a_kind') {
    const counts = {};
    for (const c of cards) counts[c[0]] = (counts[c[0]] || 0) + 1;
    const quadRank = Object.keys(counts).find((r) => counts[r] === 4);
    return holes.some((h) => h[0] === quadRank);
  }
  return holes.some((h) => cards.includes(h));
}

/**
 * The cards of one hand record that can be used: every card readable and no
 * card seen twice, else none of the hand's cards are trusted (hand types only).
 *
 * @param {object} hand Hand record.
 * @return {{board: Array<string>, holes: Map<string, Array<string>>}}
 *   holes: playerId → its 2 hole cards (players without 2 known cards absent).
 */
function readCards(hand) {
  const board = (Array.isArray(hand?.communityCards) ? hand.communityCards : []).map(toSolverCard);
  const holes = new Map();
  const empty = { board: [], holes: new Map() };
  if (board.some((c) => !c) || board.length > 5) return empty;
  const seen = new Set(board);
  if (seen.size !== board.length) return empty;
  for (const p of hand.players || []) {
    const raw = Array.isArray(p?.cards) ? p.cards : [];
    if (raw.length !== 2 || !p.playerId) continue;
    const cards = raw.map(toSolverCard);
    if (cards.some((c) => !c)) continue;
    for (const c of cards) {
      if (seen.has(c)) return empty;
      seen.add(c);
    }
    holes.set(p.playerId, cards);
  }
  return { board, holes };
}

/**
 * Winners of a hand: `winner: true`, else (older records) chips > 0.
 *
 * @param {object} hand Hand record.
 * @return {?Set<string>} playerIds, or null when nobody can be told apart.
 */
export function handWinners(hand) {
  const players = (hand?.players || []).filter((p) => p && p.playerId);
  let ids = players.filter((p) => p.winner === true).map((p) => p.playerId);
  if (!ids.length) ids = players.filter((p) => (Number(p.chips) || 0) > 0).map((p) => p.playerId);
  return ids.length && ids.length < players.length ? new Set(ids) : null;
}

// ── equity ───────────────────────────────────────────────────────────

/**
 * Deterministic PRNG (mulberry32) so a sampled equity is the same on every
 * run: the backfill must be idempotent.
 *
 * @param {number} seed 32-bit seed.
 * @return {function(): number} [0, 1).
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a of a string.
 *
 * @param {string} text Text.
 * @return {number} 32-bit hash.
 */
function hashOf(text) {
  let h = 0x811C9DC5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Equity runs tens of thousands of showdowns per pair, too many for
// pokersolver (~15 µs a hand), so they use handScore below: a plain 7-card
// ranking that orders hands exactly like handEvaluator.js (checked against it
// in tests/functions/handEvents.test.js). Final hands still come from
// handEvaluator.js.
const SCORE_RANKS = '23456789TJQKA';
const SCORE_SUITS = 'shdc';
const B = 13;
const B5 = B ** 5;

/**
 * Solver card → 0..51 (rank · 4 + suit, rank 0 = deuce).
 *
 * @param {string} card Card ('Th').
 * @return {number}
 */
function cardInt(card) {
  return SCORE_RANKS.indexOf(card[0]) * 4 + SCORE_SUITS.indexOf(card[1]);
}

/**
 * Highest straight in a rank bitmask (bit r = rank r).
 *
 * @param {number} mask Rank bitmask.
 * @return {number} Top rank of the straight, -1 when none.
 */
function straightTop(mask) {
  // bit 0 = the ace played low, bit r + 1 = rank r
  const ext = (mask << 1) | ((mask >> 12) & 1);
  for (let hi = 13; hi >= 4; hi--) {
    const need = 0x1F << (hi - 4);
    if ((ext & need) === need) return hi - 1;
  }
  return -1;
}

/**
 * Score of a category plus up to five ranks, highest first.
 *
 * @param {number} category 0 high card … 8 straight flush.
 * @param {Array<number>} ranks Tie-breaking ranks, most significant first.
 * @return {number}
 */
function packScore(category, ranks) {
  let score = category * B5;
  for (let i = 0; i < 5; i++) score += (ranks[i] ?? 0) * B ** (4 - i);
  return score;
}

/**
 * Strength of the best 5 of 5–7 cards as one number (higher is better, equal
 * is a split): category 0 high card … 8 straight flush, then the ranks that
 * break ties.
 *
 * @param {Array<number>} cards cardInt() cards.
 * @return {number}
 */
export function handScore(cards) {
  const counts = new Array(13).fill(0);
  const suitMask = [0, 0, 0, 0];
  const suitCount = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cards) {
    const r = c >> 2;
    const s = c & 3;
    counts[r] += 1;
    suitMask[s] |= 1 << r;
    suitCount[s] += 1;
    mask |= 1 << r;
  }
  let flushMask = 0;
  for (let s = 0; s < 4; s++) {
    if (suitCount[s] >= 5) flushMask = suitMask[s];
  }
  if (flushMask) {
    const top = straightTop(flushMask);
    if (top >= 0) return packScore(8, [top]);
  }
  const quads = [];
  const trips = [];
  const pairs = [];
  const singles = [];
  for (let r = 12; r >= 0; r--) {
    if (counts[r] === 4) quads.push(r);
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
    else if (counts[r] === 1) singles.push(r);
  }
  const highest = (exclude) => {
    for (let r = 12; r >= 0; r--) if (counts[r] && !exclude.includes(r)) return r;
    return 0;
  };
  if (quads.length) return packScore(7, [quads[0], highest([quads[0]])]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const pair = Math.max(trips[1] ?? -1, pairs[0] ?? -1);
    return packScore(6, [trips[0], pair]);
  }
  if (flushMask) {
    const ranks = [];
    for (let r = 12; r >= 0 && ranks.length < 5; r--) if (flushMask & (1 << r)) ranks.push(r);
    return packScore(5, ranks);
  }
  const straight = straightTop(mask);
  if (straight >= 0) return packScore(4, [straight]);
  if (trips.length) return packScore(3, [trips[0], ...singles.slice(0, 2)]);
  if (pairs.length >= 2) return packScore(2, [pairs[0], pairs[1], highest([pairs[0], pairs[1]])]);
  if (pairs.length) return packScore(1, [pairs[0], ...singles.slice(0, 3)]);
  return packScore(0, singles.slice(0, 5));
}

/**
 * Hero's equity against villain with `known` board cards out and the rest to
 * come, over every runout (or `samples` random ones, drawn with a seeded
 * PRNG so the result is the same every run).
 *
 * @param {Array<string>} hero 2 hole cards (solver notation).
 * @param {Array<string>} villain 2 hole cards.
 * @param {Array<string>} known Board cards already out (0, 3 or 4).
 * @param {Array<string>} dead Other known cards that can't come.
 * @param {object} [options] `{ samples, seed }`: sample instead of enumerate.
 * @return {{win: number, tie: number, n: number, equity: number}}
 */
function equityAt(hero, villain, known, dead, { samples = 0, seed = 0 } = {}) {
  const out = new Set([...hero, ...villain, ...known, ...dead]);
  const unseen = DECK.filter((c) => !out.has(c)).map(cardInt);
  const heroCards = [...hero, ...known].map(cardInt);
  const villainCards = [...villain, ...known].map(cardInt);
  const need = 5 - known.length;
  let win = 0;
  let tie = 0;
  let n = 0;
  const add = (runout) => {
    const a = handScore([...heroCards, ...runout]);
    const b = handScore([...villainCards, ...runout]);
    if (a > b) win += 1; else if (a === b) tie += 1;
    n += 1;
  };
  if (samples > 0) {
    const rand = mulberry32(seed);
    const deck = [...unseen];
    for (let s = 0; s < samples; s++) {
      // Partial Fisher-Yates: the first `need` cards are a uniform draw
      for (let i = 0; i < need; i++) {
        const j = i + Math.floor(rand() * (deck.length - i));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      add(deck.slice(0, need));
    }
  } else {
    const pick = (from, chosen) => {
      if (chosen.length === need) {
        add(chosen);
        return;
      }
      for (let i = from; i <= unseen.length - (need - chosen.length); i++) {
        pick(i + 1, [...chosen, unseen[i]]);
      }
    };
    pick(0, []);
  }
  return { win, tie, n, equity: n ? (win + tie / 2) / n : 0 };
}

/**
 * Hero's equity against villain at each street of a hand whose full board is
 * known: preflop (sampled, PREFLOP_SAMPLES, seeded by the cards so it is
 * repeatable), flop (every turn + river) and turn (every river). Ties count
 * half. `dead`: other players' known hole cards, which can't come.
 *
 * @param {Array<string>} hero 2 hole cards (solver notation).
 * @param {Array<string>} villain 2 hole cards.
 * @param {Array<string>} board The full 5-card board.
 * @param {Array<string>} [dead] Other known cards.
 * @param {object} [options] `{ samples }` preflop sample count;
 *   `{ streets }` which of 'preflop' | 'flop' | 'turn' to work out.
 * @return {{preflop: ?object, flop: ?object, turn: ?object}} Each
 *   `{ win, tie, n, equity }`; null when not asked for.
 */
export function streetEquities(hero, villain, board, dead = [], options = {}) {
  const { samples = PREFLOP_SAMPLES, streets = STREETS } = options;
  const result = { preflop: null, flop: null, turn: null };
  if (streets.includes('preflop')) {
    const seed = hashOf([...hero].sort().join('') + '|' + [...villain].sort().join('') + '|' + [...dead].sort().join(''));
    result.preflop = equityAt(hero, villain, [], dead, { samples, seed });
  }
  if (streets.includes('flop')) result.flop = equityAt(hero, villain, board.slice(0, 3), dead);
  if (streets.includes('turn')) result.turn = equityAt(hero, villain, board.slice(0, 4), dead);
  return result;
}

// ── the bad beat / cooler rule ───────────────────────────────────────
//
// APPROXIMATION: a hand record says who showed what and who took the pot, not
// on which street the chips went in. So the winner's equity is looked at
// preflop, on the flop and on the turn alike:
//   bad beat  at ANY of the three the winner had ≤ 20% (KK over AA preflop,
//             ~18%, counts)
//   cooler    both had a big hand (premium preflop: QQ+ or AK; or a final
//             hand of three of a kind or better) and the winner was ≥ 50% at
//             all three: ahead the whole way, so never also a bad beat
//             (a big made hand must also beat what the board alone shows)

/**
 * Premium starting hand: a pocket pair QQ or higher, or AK.
 *
 * @param {Array<string>} holes 2 hole cards (solver notation).
 * @return {boolean}
 */
export function isPremiumStart(holes) {
  if (!Array.isArray(holes) || holes.length !== 2) return false;
  const [a, b] = holes.map((c) => c[0]);
  if (a === b) return 'QKA'.includes(a);
  return (a === 'A' && b === 'K') || (a === 'K' && b === 'A');
}

/**
 * Bad beat or cooler, for one winner against one player who didn't take the
 * pot (both hole cards known, full board).
 *
 * @param {object} input `{ equities }` streetEquities() for the winner;
 *   `{ winnerBig, loserBig }` whether each had a big hand (isPremiumStart or
 *   a final hand of three of a kind or better).
 * @return {{badBeat: boolean, cooler: boolean}}
 */
export function classifyShowdown({ equities, winnerBig, loserBig }) {
  // Compared in whole numbers (equity = (2·win + tie) / 2n), so exactly 20%
  // is exactly 20%: ≤ 1/5 ⇔ 5·(2·win + tie) ≤ 2n; ≥ 1/2 ⇔ 2·win + tie ≥ n
  const halves = (e) => 2 * e.win + e.tie;
  const known = STREETS.map((street) => equities?.[street]).filter((e) => e && e.n > 0);
  const badBeat = known.some((e) => 5 * halves(e) <= 2 * e.n);
  const cooler = !!winnerBig && !!loserBig && known.length === STREETS.length
    && known.every((e) => halves(e) >= e.n);
  return { badBeat, cooler };
}

// ── per hand / per game ──────────────────────────────────────────────

/**
 * Events of one hand record, per playerId (players with none left out).
 *
 * @param {object} hand Hand record.
 * @param {object} [options] Passed to streetEquities.
 * @return {Object<string, Object<string, number>>} playerId → counts (0 / 1).
 */
export function handEventsOfHand(hand, options = {}) {
  const result = {};
  const players = (hand?.players || []).filter((p) => p && p.playerId);
  if (!players.length) return result;
  const { board, holes } = readCards(hand);
  const winners = handWinners(hand);
  const give = (id, key) => {
    if (!result[id]) result[id] = {};
    result[id][key] = 1;
  };

  // Final hands
  const finals = new Map();
  for (const p of players) {
    const own = holes.get(p.playerId);
    let category = null;
    let owned = true;
    if (own && board.length >= 3) {
      const evaluation = evaluateHand(own, board);
      category = categoryOf(evaluation);
      if (strength(category) >= QUADS) owned = usesHoleCard(evaluation, own, category);
    } else {
      category = normalizeHandType(p.handType);
    }
    finals.set(p.playerId, category);
    if (!owned) continue;
    if (category === 'four_of_a_kind') give(p.playerId, 'quads');
    if (category === 'straight_flush') give(p.playerId, 'straightFlush');
    if (category === 'royal_flush') give(p.playerId, 'royalFlush');
    if (winners && !winners.has(p.playerId) && strength(category) >= QUADS) {
      give(p.playerId, 'tragicHero');
    }
  }

  // Showdowns between a winner and someone who didn't take the pot
  if (winners && board.length === 5) {
    const known = [...holes.keys()];
    // A made hand only counts as big when it is three of a kind or better AND
    // better than what the board alone shows (trips on the board are nobody's)
    const boardStrength = strength(categoryOf(evaluateHand([], board)));
    const isBig = (id) => isPremiumStart(holes.get(id)) || (
      strength(finals.get(id)) >= strength('three_of_a_kind') && strength(finals.get(id)) > boardStrength
    );
    for (const w of known.filter((id) => winners.has(id))) {
      for (const l of known.filter((id) => !winners.has(id))) {
        const dead = known.filter((id) => id !== w && id !== l).flatMap((id) => holes.get(id));
        const equities = streetEquities(holes.get(w), holes.get(l), board, dead, options);
        const verdict = classifyShowdown({ equities, winnerBig: isBig(w), loserBig: isBig(l) });
        if (verdict.badBeat) give(w, 'badBeatWins');
        if (verdict.cooler) {
          give(w, 'coolers');
          give(l, 'coolers');
        }
      }
    }
  }
  return result;
}

/**
 * Hand events of one game per uid: every hand record plus the knockout log
 * (復仇者). Every roster player with an account gets a full set of counts.
 *
 * @param {object} input `{ players }` the roster (id, uid, mysteryTickets),
 *   `{ hands }` hand records, `{ transactions }` the game's transactions.
 * @param {object} [options] Passed to streetEquities.
 * @return {Object<string, Object<string, number>>} uid → HAND_EVENT_KEYS counts.
 */
export function gameHandEvents({ players, hands, transactions }, options = {}) {
  const roster = (Array.isArray(players) ? players : []).filter((p) => p && p.id);
  const uidById = new Map(roster.map((p) => [p.id, p.uid || null]));
  const result = {};
  for (const p of roster) {
    if (p.uid && !result[p.uid]) result[p.uid] = emptyHandEvents();
  }
  // A seat taken off the roster since: the hand's own playerUid
  const uidOf = (playerId, hand) => {
    if (uidById.has(playerId)) return uidById.get(playerId);
    return (hand.players || []).find((p) => p?.playerId === playerId)?.playerUid || null;
  };
  const add = (uid, key, count) => {
    if (!uid || !count) return;
    if (!result[uid]) result[uid] = emptyHandEvents();
    result[uid][key] += count;
  };

  for (const hand of Array.isArray(hands) ? hands : []) {
    // Test hands kept for the record but marked out of the titles
    if (hand?.excludeFromTitles === true) continue;
    for (const [playerId, counts] of Object.entries(handEventsOfHand(hand, options))) {
      const uid = uidOf(playerId, hand);
      for (const key of HAND_EVENT_KEYS) add(uid, key, counts[key] || 0);
    }
  }
  for (const [playerId, count] of Object.entries(revengeCounts(roster, transactions))) {
    add(uidById.get(playerId), 'revenge', count);
  }
  return result;
}
