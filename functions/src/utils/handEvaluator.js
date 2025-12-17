/**
 * Hand Evaluator for Texas Hold'em Poker
 * Evaluates poker hands and determines winners using pokersolver
 */

import { Hand } from 'pokersolver';

// Hand rankings (higher is better) - kept for backward compatibility
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
 * Convert card format from our notation to pokersolver format
 * Both use the same format (e.g., 'As', 'Kh'), so just pass through
 * @param {string} card - Card in our format
 * @return {string} Card in pokersolver format
 */
function convertCardFormat(card) {
  // pokersolver and our format are the same, just return as-is
  return card;
}

/**
 * Calculate player's best hand using pokersolver
 * @param {string[]} holeCards - Player's hole cards ['Ah', 'Kd']
 * @param {string[]} communityCards - Community cards ['Qs', 'Jc', 'Tc', '2h', '5d']
 * @return {Object} { hand, cards, name, descr, rank }
 */
export function evaluateHand(holeCards, communityCards = []) {
  const allCards = [...holeCards, ...communityCards].map(convertCardFormat);
  const hand = Hand.solve(allCards);

  return {
    hand, // pokersolver Hand object for internal comparison
    // Convert card values for frontend display (T → 10)
    cards: hand.cards.map((c) => {
      let val = c.value;
      if (val === 'T') val = '10';
      return val + c.suit.toLowerCase();
    }),
    name: hand.name, // e.g., "Full House"
    descr: hand.descr, // e.g., "Full House, Aces over Kings"
    rank: hand.rank, // Numeric rank (higher is better)
  };
}

/**
 * Compare multiple players' hands and find winners using pokersolver
 * @param {Array} players - [{ odId, odName, holeCards }]
 * @param {string[]} communityCards - Community cards
 * @return {Object} { winners: [], results: [] }
 */
export function determineWinners(players, communityCards) {
  const results = players.map((player) => {
    const evaluation = evaluateHand(player.holeCards || player.cards, communityCards);
    return {
      playerId: player.odId || player.playerId,
      odId: player.odId || player.playerId,
      odName: player.odName || player.name || 'Unknown',
      ...evaluation,
    };
  });

  // Use pokersolver's winners function to find best hands
  const hands = results.map((r) => r.hand);
  const winningHands = Hand.winners(hands);

  // Find all players with winning hands (handles ties)
  const winners = results.filter((r) =>
    winningHands.some((w) => w === r.hand),
  );

  return { winners, results };
}

/**
 * Legacy function for backward compatibility
 * Compare two hands
 * @param {Object} hand1 - First hand evaluation
 * @param {Object} hand2 - Second hand evaluation
 * @return {number} 1 if hand1 wins, -1 if hand2 wins, 0 if tie
 */
export function compareHands(hand1, hand2) {
  // If using pokersolver hands, compare them directly
  if (hand1.hand && hand2.hand) {
    const winners = Hand.winners([hand1.hand, hand2.hand]);
    if (winners.length === 2) return 0; // Tie
    if (winners[0] === hand1.hand) return 1;
    return -1;
  }

  // Fallback to rank comparison
  if (hand1.rank > hand2.rank) return 1;
  if (hand1.rank < hand2.rank) return -1;

  // Same rank, compare values if available
  if (hand1.value && hand2.value) {
    for (let i = 0; i < hand1.value.length; i++) {
      if (hand1.value[i] > hand2.value[i]) return 1;
      if (hand1.value[i] < hand2.value[i]) return -1;
    }
  }

  return 0; // Exact tie
}
