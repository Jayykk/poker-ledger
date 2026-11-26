import { evaluateHand, getHandCards } from './pokerHandEvaluator.js';

/**
 * The special hand (四條 / 同花順 / 皇家同花順) a hand record gives one of its
 * players, the way the 手牌 titles and 排行榜 count it
 * (functions/src/utils/handEvents.js, handEventsOfHand — functions-only, it
 * ranks with pokersolver):
 *   - the cards when they can be used (every card readable, none seen twice,
 *     the player's 2 hole cards and at least a flop), else the recorded type;
 *   - a made hand that uses none of the player's hole cards (the board's own
 *     four of a kind) belongs to nobody.
 */
export const SPECIAL_HAND_TYPES = ['royal_flush', 'straight_flush', 'four_of_a_kind'];

const SUITS = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c', s: 's', h: 'h', d: 'd', c: 'c' };
const RANKS = 'AKQJT98765432';
// "10♥" / "Th" → "Th"; null when unreadable
const cardKey = (card) => {
  if (typeof card !== 'string') return null;
  const text = card.trim();
  const suit = SUITS[text.slice(-1)] || SUITS[text.slice(-1).toLowerCase()];
  let rank = text.slice(0, -1).toUpperCase();
  if (rank === '10') rank = 'T';
  return suit && rank.length === 1 && RANKS.includes(rank) ? rank + suit : null;
};

// The board and this player's hole cards, or null when the cards can't be used
const usableCards = (hand, playerId) => {
  const board = Array.isArray(hand?.communityCards) ? hand.communityCards : [];
  const keys = board.map(cardKey);
  if (keys.some((k) => !k) || board.length > 5) return null;
  const seen = new Set(keys);
  if (seen.size !== keys.length) return null;
  let own = null;
  for (const p of hand.players || []) {
    const raw = Array.isArray(p?.cards) ? p.cards : [];
    if (raw.length !== 2 || !p.playerId) continue;
    const pk = raw.map(cardKey);
    if (pk.some((k) => !k)) continue;
    for (const k of pk) {
      if (seen.has(k)) return null;
      seen.add(k);
    }
    if (p.playerId === playerId) own = raw;
  }
  return own && board.length >= 3 ? { own, board } : null;
};

/**
 * @param {object} hand Hand record ({ communityCards, players: [{ playerId, cards, handType }] }).
 * @param {string} playerId The player's id in the hand.
 * @return {?string} 'royal_flush' | 'straight_flush' | 'four_of_a_kind', or null.
 */
export function specialHandOf(hand, playerId) {
  const player = (hand?.players || []).find((p) => p && p.playerId === playerId);
  if (!player) return null;
  const cards = usableCards(hand, playerId);
  if (!cards) {
    return SPECIAL_HAND_TYPES.includes(player.handType) ? player.handType : null;
  }
  const { own, board } = cards;
  const category = evaluateHand(own, board);
  if (!SPECIAL_HAND_TYPES.includes(category)) return null;
  const ownKeys = own.map(cardKey);
  if (category === 'four_of_a_kind') {
    const counts = {};
    for (const k of [...ownKeys, ...board.map(cardKey)]) counts[k[0]] = (counts[k[0]] || 0) + 1;
    const quadRank = Object.keys(counts).find((r) => counts[r] === 4);
    return ownKeys.some((k) => k[0] === quadRank) ? category : null;
  }
  const made = getHandCards(own, board).map(cardKey);
  return ownKeys.some((k) => made.includes(k)) ? category : null;
}
