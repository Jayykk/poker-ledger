import { HAND_TYPES, SUITS, RANKS } from './constants.js';

/**
 * Poker Hand Evaluator
 * Evaluates the best possible hand from player cards and community cards
 */

/**
 * Parse card string (e.g., "A♠") into rank and suit
 */
const parseCard = (cardStr) => {
  if (!cardStr || typeof cardStr !== 'string') return null;
  
  const suit = cardStr.slice(-1);
  const rank = cardStr.slice(0, -1);
  
  return { rank, suit, original: cardStr };
};

/**
 * Get numeric value for rank (for comparison)
 * Ace can be 1 or 14, we'll handle both cases
 */
const getRankValue = (rank) => {
  const rankIndex = RANKS.indexOf(rank);
  if (rankIndex === -1) return 0;
  // A=1, 2=2, ..., K=13 (but A can also be 14 for high straights)
  return rankIndex === 0 ? 14 : rankIndex + 1;
};

/**
 * Get all rank values for a card (Ace has two values: 1 and 14)
 */
const getRankValues = (rank) => {
  const rankIndex = RANKS.indexOf(rank);
  if (rankIndex === -1) return [0];
  if (rankIndex === 0) return [1, 14]; // Ace can be low or high
  return [rankIndex + 1];
};

/**
 * Count occurrences of each rank
 */
const countRanks = (cards) => {
  const counts = {};
  cards.forEach(card => {
    const parsed = parseCard(card);
    if (parsed) {
      counts[parsed.rank] = (counts[parsed.rank] || 0) + 1;
    }
  });
  return counts;
};

/**
 * Count occurrences of each suit
 */
const countSuits = (cards) => {
  const counts = {};
  cards.forEach(card => {
    const parsed = parseCard(card);
    if (parsed) {
      counts[parsed.suit] = (counts[parsed.suit] || 0) + 1;
    }
  });
  return counts;
};

/**
 * Check if cards form a flush (5+ cards of same suit)
 */
const isFlush = (cards) => {
  const suitCounts = countSuits(cards);
  return Object.values(suitCounts).some(count => count >= 5);
};

/**
 * Get flush suit if exists
 */
const getFlushSuit = (cards) => {
  const suitCounts = countSuits(cards);
  for (const [suit, count] of Object.entries(suitCounts)) {
    if (count >= 5) return suit;
  }
  return null;
};

/**
 * Check if cards form a straight
 * Returns the high card value of the straight, or 0 if no straight
 */
const getStraightHighCard = (cards) => {
  const parsed = cards.map(parseCard).filter(c => c !== null);
  const values = parsed.map(c => getRankValue(c.rank));
  const uniqueValues = [...new Set(values)].sort((a, b) => b - a);
  
  // Check for regular straight (5 consecutive cards)
  for (let i = 0; i <= uniqueValues.length - 5; i++) {
    if (uniqueValues[i] - uniqueValues[i + 4] === 4) {
      return uniqueValues[i]; // Return high card
    }
  }
  
  // Check for A-2-3-4-5 (wheel) straight - special case
  // Need to check if we have A (14), 2, 3, 4, 5
  const hasAce = values.includes(14);
  const hasTwo = values.includes(2);
  const hasThree = values.includes(3);
  const hasFour = values.includes(4);
  const hasFive = values.includes(5);
  
  if (hasAce && hasTwo && hasThree && hasFour && hasFive) {
    return 5; // In wheel, 5 is the high card
  }
  
  return 0;
};

/**
 * Check for straight flush
 */
const isStraightFlush = (cards) => {
  const flushSuit = getFlushSuit(cards);
  if (!flushSuit) return false;
  
  const flushCards = cards.filter(card => {
    const parsed = parseCard(card);
    return parsed && parsed.suit === flushSuit;
  });
  
  return getStraightHighCard(flushCards) > 0;
};

/**
 * Check for royal flush (A-K-Q-J-10 of same suit)
 */
const isRoyalFlush = (cards) => {
  const flushSuit = getFlushSuit(cards);
  if (!flushSuit) return false;
  
  const flushCards = cards.filter(card => {
    const parsed = parseCard(card);
    return parsed && parsed.suit === flushSuit;
  });
  
  const straightHigh = getStraightHighCard(flushCards);
  return straightHigh === 14; // Royal flush is straight flush with Ace high
};

/**
 * Check for four of a kind
 */
const isFourOfAKind = (cards) => {
  const rankCounts = countRanks(cards);
  return Object.values(rankCounts).some(count => count === 4);
};

/**
 * Check for full house (3 of a kind + pair)
 */
const isFullHouse = (cards) => {
  const rankCounts = countRanks(cards);
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  return counts.length >= 2 && counts[0] >= 3 && counts[1] >= 2;
};

/**
 * Check for three of a kind
 */
const isThreeOfAKind = (cards) => {
  const rankCounts = countRanks(cards);
  return Object.values(rankCounts).some(count => count === 3);
};

/**
 * Check for two pair
 */
const isTwoPair = (cards) => {
  const rankCounts = countRanks(cards);
  const pairs = Object.values(rankCounts).filter(count => count === 2);
  return pairs.length >= 2;
};

/**
 * Check for one pair
 */
const isOnePair = (cards) => {
  const rankCounts = countRanks(cards);
  return Object.values(rankCounts).some(count => count === 2);
};

/**
 * Evaluate the best hand from player cards and community cards
 * @param {Array<string>} playerCards - Player's hole cards (e.g., ["A♠", "K♠"])
 * @param {Array<string>} communityCards - Community cards (e.g., ["Q♠", "J♠", "10♠", "2♥", "3♦"])
 * @returns {string} - Hand type from HAND_TYPES constants
 */
export const evaluateHand = (playerCards, communityCards) => {
  // Combine all cards
  const allCards = [...(playerCards || []), ...(communityCards || [])];
  
  // Need at least 5 cards to evaluate
  if (allCards.length < 5) {
    return HAND_TYPES.HIGH_CARD;
  }
  
  // Check hands from best to worst
  if (isRoyalFlush(allCards)) {
    return HAND_TYPES.ROYAL_FLUSH;
  }
  
  if (isStraightFlush(allCards)) {
    return HAND_TYPES.STRAIGHT_FLUSH;
  }
  
  if (isFourOfAKind(allCards)) {
    return HAND_TYPES.FOUR_OF_A_KIND;
  }
  
  if (isFullHouse(allCards)) {
    return HAND_TYPES.FULL_HOUSE;
  }
  
  if (isFlush(allCards)) {
    return HAND_TYPES.FLUSH;
  }
  
  if (getStraightHighCard(allCards) > 0) {
    return HAND_TYPES.STRAIGHT;
  }
  
  if (isThreeOfAKind(allCards)) {
    return HAND_TYPES.THREE_OF_A_KIND;
  }
  
  if (isTwoPair(allCards)) {
    return HAND_TYPES.TWO_PAIR;
  }
  
  if (isOnePair(allCards)) {
    return HAND_TYPES.ONE_PAIR;
  }
  
  return HAND_TYPES.HIGH_CARD;
};

/**
 * Validate if a card string is valid
 */
export const isValidCard = (cardStr) => {
  const parsed = parseCard(cardStr);
  if (!parsed) return false;
  
  const validSuits = Object.values(SUITS);
  return RANKS.includes(parsed.rank) && validSuits.includes(parsed.suit);
};
