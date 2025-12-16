/**
 * Hand Evaluator for Texas Hold'em Poker
 * Evaluates poker hands and determines winners
 */

import { RANKS } from './deck.js';

// Hand rankings (higher is better)
export const HAND_RANKINGS = {
  HIGH_CARD: 0,
  ONE_PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_KIND: 7,
  STRAIGHT_FLUSH: 8,
  ROYAL_FLUSH: 9,
};

export const HAND_NAMES = {
  0: 'High Card',
  1: 'One Pair',
  2: 'Two Pair',
  3: 'Three of a Kind',
  4: 'Straight',
  5: 'Flush',
  6: 'Full House',
  7: 'Four of a Kind',
  8: 'Straight Flush',
  9: 'Royal Flush',
};

/**
 * Parse card string
 * @param {string} card - Card like 'As' or 'Kh'
 * @returns {{ rank: string, suit: string }}
 */
function parseCard(card) {
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  return { rank, suit };
}

/**
 * Get numeric value for rank
 * @param {string} rank - Card rank
 * @returns {number} Numeric value (2-14, Ace=14)
 */
function getRankValue(rank) {
  const index = RANKS.indexOf(rank);
  if (index === -1) return 0;
  return index === 0 ? 14 : index + 1; // Ace is highest (14)
}

/**
 * Count card ranks
 * @param {Array} cards - Array of card objects
 * @returns {Object} Map of rank to count
 */
function countRanks(cards) {
  const counts = {};
  cards.forEach((card) => {
    counts[card.rank] = (counts[card.rank] || 0) + 1;
  });
  return counts;
}

/**
 * Count card suits
 * @param {Array} cards - Array of card objects
 * @returns {Object} Map of suit to count
 */
function countSuits(cards) {
  const counts = {};
  cards.forEach((card) => {
    counts[card.suit] = (counts[card.suit] || 0) + 1;
  });
  return counts;
}

/**
 * Check for flush
 * @param {Array} cards - Array of card objects
 * @returns {boolean}
 */
function isFlush(cards) {
  const suitCounts = countSuits(cards);
  return Object.values(suitCounts).some((count) => count >= 5);
}

/**
 * Check for straight
 * @param {Array} cards - Array of card objects
 * @returns {{ isStraight: boolean, highCard: number }}
 */
function isStraight(cards) {
  const values = cards.map((c) => getRankValue(c.rank)).sort((a, b) => b - a);
  const uniqueValues = [...new Set(values)];

  // Check for regular straight
  for (let i = 0; i <= uniqueValues.length - 5; i++) {
    if (uniqueValues[i] - uniqueValues[i + 4] === 4) {
      return { isStraight: true, highCard: uniqueValues[i] };
    }
  }

  // Check for A-2-3-4-5 (wheel)
  if (uniqueValues.includes(14) && uniqueValues.includes(5) &&
      uniqueValues.includes(4) && uniqueValues.includes(3) &&
      uniqueValues.includes(2)) {
    return { isStraight: true, highCard: 5 }; // 5 is high in wheel
  }

  return { isStraight: false, highCard: 0 };
}

/**
 * Evaluate best 5-card hand from 7 cards
 * @param {string[]} cardStrings - Array of card strings
 * @returns {{ rank: number, name: string, value: number[] }}
 */
export function evaluateHand(cardStrings) {
  const cards = cardStrings.map(parseCard);
  const rankCounts = countRanks(cards);
  const suitCounts = countSuits(cards);

  // Get rank frequencies
  const frequencies = Object.entries(rankCounts)
      .map(([rank, count]) => ({ rank, count, value: getRankValue(rank) }))
      .sort((a, b) => b.count - a.count || b.value - a.value);

  const hasFlush = isFlush(cards);
  const straightResult = isStraight(cards);

  // Royal Flush: A-K-Q-J-10 suited
  if (hasFlush && straightResult.isStraight && straightResult.highCard === 14) {
    return {
      rank: HAND_RANKINGS.ROYAL_FLUSH,
      name: HAND_NAMES[HAND_RANKINGS.ROYAL_FLUSH],
      value: [14],
    };
  }

  // Straight Flush
  if (hasFlush && straightResult.isStraight) {
    return {
      rank: HAND_RANKINGS.STRAIGHT_FLUSH,
      name: HAND_NAMES[HAND_RANKINGS.STRAIGHT_FLUSH],
      value: [straightResult.highCard],
    };
  }

  // Four of a Kind
  if (frequencies[0].count === 4) {
    return {
      rank: HAND_RANKINGS.FOUR_OF_KIND,
      name: HAND_NAMES[HAND_RANKINGS.FOUR_OF_KIND],
      value: [frequencies[0].value, frequencies[1].value],
    };
  }

  // Full House
  if (frequencies[0].count === 3 && frequencies[1].count >= 2) {
    return {
      rank: HAND_RANKINGS.FULL_HOUSE,
      name: HAND_NAMES[HAND_RANKINGS.FULL_HOUSE],
      value: [frequencies[0].value, frequencies[1].value],
    };
  }

  // Flush
  if (hasFlush) {
    const flushSuit = Object.entries(suitCounts)
        .find(([, count]) => count >= 5)[0];
    const flushCards = cards
        .filter((c) => c.suit === flushSuit)
        .map((c) => getRankValue(c.rank))
        .sort((a, b) => b - a)
        .slice(0, 5);
    return {
      rank: HAND_RANKINGS.FLUSH,
      name: HAND_NAMES[HAND_RANKINGS.FLUSH],
      value: flushCards,
    };
  }

  // Straight
  if (straightResult.isStraight) {
    return {
      rank: HAND_RANKINGS.STRAIGHT,
      name: HAND_NAMES[HAND_RANKINGS.STRAIGHT],
      value: [straightResult.highCard],
    };
  }

  // Three of a Kind
  if (frequencies[0].count === 3) {
    return {
      rank: HAND_RANKINGS.THREE_OF_KIND,
      name: HAND_NAMES[HAND_RANKINGS.THREE_OF_KIND],
      value: [
        frequencies[0].value,
        frequencies[1].value,
        frequencies[2].value,
      ],
    };
  }

  // Two Pair
  if (frequencies[0].count === 2 && frequencies[1].count === 2) {
    return {
      rank: HAND_RANKINGS.TWO_PAIR,
      name: HAND_NAMES[HAND_RANKINGS.TWO_PAIR],
      value: [
        frequencies[0].value,
        frequencies[1].value,
        frequencies[2].value,
      ],
    };
  }

  // One Pair
  if (frequencies[0].count === 2) {
    return {
      rank: HAND_RANKINGS.ONE_PAIR,
      name: HAND_NAMES[HAND_RANKINGS.ONE_PAIR],
      value: [
        frequencies[0].value,
        frequencies[1].value,
        frequencies[2].value,
        frequencies[3].value,
      ],
    };
  }

  // High Card
  return {
    rank: HAND_RANKINGS.HIGH_CARD,
    name: HAND_NAMES[HAND_RANKINGS.HIGH_CARD],
    value: frequencies.slice(0, 5).map((f) => f.value),
  };
}

/**
 * Compare two hands
 * @param {Object} hand1 - First hand evaluation
 * @param {Object} hand2 - Second hand evaluation
 * @returns {number} 1 if hand1 wins, -1 if hand2 wins, 0 if tie
 */
export function compareHands(hand1, hand2) {
  // Compare rank first
  if (hand1.rank > hand2.rank) return 1;
  if (hand1.rank < hand2.rank) return -1;

  // Same rank, compare values
  for (let i = 0; i < hand1.value.length; i++) {
    if (hand1.value[i] > hand2.value[i]) return 1;
    if (hand1.value[i] < hand2.value[i]) return -1;
  }

  return 0; // Exact tie
}

/**
 * Determine winners from multiple players
 * @param {Array} players - Array of { playerId, cards }
 * @param {string[]} communityCards - Community cards
 * @returns {Array} Array of winner player IDs
 */
export function determineWinners(players, communityCards) {
  const evaluations = players.map((player) => {
    const allCards = [...player.cards, ...communityCards];
    const evaluation = evaluateHand(allCards);
    return {
      playerId: player.playerId,
      evaluation,
    };
  });

  // Find best hand
  let bestHand = evaluations[0].evaluation;
  evaluations.forEach((e) => {
    if (compareHands(e.evaluation, bestHand) > 0) {
      bestHand = e.evaluation;
    }
  });

  // Get all players with best hand (could be multiple winners)
  const winners = evaluations
      .filter((e) => compareHands(e.evaluation, bestHand) === 0)
      .map((e) => ({
        playerId: e.playerId,
        hand: e.evaluation,
      }));

  return winners;
}
