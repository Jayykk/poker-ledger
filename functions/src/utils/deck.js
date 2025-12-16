/**
 * Deck Utilities for Texas Hold'em Poker
 * Handles card deck creation, shuffling, and dealing
 */

// Card suits
export const SUITS = ['♠', '♥', '♦', '♣'];
export const SUIT_CODES = ['s', 'h', 'd', 'c'];

// Card ranks (A, 2-10, J, Q, K)
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/**
 * Create a standard 52-card deck
 * @return {string[]} Array of card strings (e.g., ['As', 'Kh', ...])
 */
export function createDeck() {
  const deck = [];
  for (const suitCode of SUIT_CODES) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suitCode}`);
    }
  }
  return deck;
}

/**
 * Shuffle a deck using Fisher-Yates algorithm
 * @param {string[]} deck - Array of cards to shuffle
 * @return {string[]} Shuffled deck
 */
export function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Deal cards from the deck
 * @param {string[]} deck - The deck to deal from
 * @param {number} count - Number of cards to deal
 * @return {{ cards: string[], remainingDeck: string[] }}
 */
export function dealCards(deck, count) {
  if (count > deck.length) {
    throw new Error(`Cannot deal ${count} cards from a deck of ${deck.length}`);
  }

  const cards = deck.slice(0, count);
  const remainingDeck = deck.slice(count);

  return { cards, remainingDeck };
}

/**
 * Convert card notation between formats
 * @param {string} card - Card in format 'As' or 'A♠'
 * @return {string} Converted card notation
 */
export function convertCardNotation(card) {
  const rank = card.slice(0, -1);
  const lastChar = card.slice(-1);

  // If last char is a suit code, convert to symbol
  const suitIndex = SUIT_CODES.indexOf(lastChar);
  if (suitIndex !== -1) {
    return `${rank}${SUITS[suitIndex]}`;
  }

  // If last char is a suit symbol, convert to code
  const symbolIndex = SUITS.indexOf(lastChar);
  if (symbolIndex !== -1) {
    return `${rank}${SUIT_CODES[symbolIndex]}`;
  }

  return card;
}

/**
 * Burn a card (remove top card without revealing)
 * @param {string[]} deck - The deck
 * @return {string[]} Deck with top card removed
 */
export function burnCard(deck) {
  return deck.slice(1);
}
