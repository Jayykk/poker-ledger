/**
 * Unit tests for functions/src/utils/deck.js
 * Tests the real module — no mocks.
 */
import { describe, it, expect } from 'vitest';
import {
  SUITS,
  SUIT_CODES,
  RANKS,
  createDeck,
  shuffleDeck,
  dealCards,
  convertCardNotation,
  burnCard,
} from '../../functions/src/utils/deck.js';

describe('createDeck', () => {
  it('creates exactly 52 cards', () => {
    expect(createDeck()).toHaveLength(52);
  });

  it('contains no duplicate cards', () => {
    const deck = createDeck();
    expect(new Set(deck).size).toBe(52);
  });

  it('contains all 13 ranks for each of the 4 suit codes', () => {
    const deck = createDeck();
    for (const suitCode of SUIT_CODES) {
      const ofSuit = deck.filter((c) => c.endsWith(suitCode));
      expect(ofSuit).toHaveLength(13);
    }
    expect(SUIT_CODES).toHaveLength(4);
    expect(RANKS).toHaveLength(13);
  });

  it('uses rank+suitCode notation, with tens written as "10"', () => {
    const deck = createDeck();
    expect(deck).toContain('As');
    expect(deck).toContain('10h');
    expect(deck).toContain('Kd');
    expect(deck).toContain('2c');
    expect(deck.every((c) => /^(A|[2-9]|10|J|Q|K)[shdc]$/.test(c))).toBe(true);
  });

  it('returns a fresh array on every call', () => {
    expect(createDeck()).not.toBe(createDeck());
  });
});

describe('shuffleDeck', () => {
  it('preserves the exact card set (same 52 cards, just reordered)', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    expect(shuffled).toHaveLength(52);
    expect([...shuffled].sort()).toEqual([...deck].sort());
  });

  it('does not mutate the input deck', () => {
    const deck = createDeck();
    const original = [...deck];
    shuffleDeck(deck);
    expect(deck).toEqual(original);
  });

  it('returns a new array instance', () => {
    const deck = createDeck();
    expect(shuffleDeck(deck)).not.toBe(deck);
  });
});

describe('dealCards', () => {
  it('deals the requested number of cards from the top of the deck', () => {
    const deck = createDeck();
    const { cards, remainingDeck } = dealCards(deck, 2);
    expect(cards).toEqual(deck.slice(0, 2));
    expect(remainingDeck).toHaveLength(50);
  });

  it('removes the dealt cards from the remaining deck', () => {
    const deck = shuffleDeck(createDeck());
    const { cards, remainingDeck } = dealCards(deck, 5);
    for (const card of cards) {
      expect(remainingDeck).not.toContain(card);
    }
    // No card is lost: dealt + remaining reconstructs the original deck.
    expect([...cards, ...remainingDeck]).toEqual(deck);
  });

  it('does not mutate the source deck', () => {
    const deck = createDeck();
    const original = [...deck];
    dealCards(deck, 10);
    expect(deck).toEqual(original);
  });

  it('throws when asked to deal more cards than the deck holds', () => {
    const deck = createDeck().slice(0, 3);
    expect(() => dealCards(deck, 4)).toThrow('Cannot deal 4 cards from a deck of 3');
  });

  it('can deal the entire deck, leaving an empty remainder', () => {
    const deck = createDeck();
    const { cards, remainingDeck } = dealCards(deck, 52);
    expect(cards).toHaveLength(52);
    expect(remainingDeck).toEqual([]);
  });
});

describe('burnCard', () => {
  it('removes exactly the top card', () => {
    const deck = createDeck();
    const burned = burnCard(deck);
    expect(burned).toHaveLength(51);
    expect(burned).toEqual(deck.slice(1));
    expect(burned).not.toContain(deck[0]);
  });

  it('does not mutate the source deck', () => {
    const deck = createDeck();
    burnCard(deck);
    expect(deck).toHaveLength(52);
  });
});

describe('convertCardNotation', () => {
  it('converts suit codes to symbols', () => {
    expect(convertCardNotation('As')).toBe(`A${SUITS[0]}`);
    expect(convertCardNotation('10h')).toBe(`10${SUITS[1]}`);
  });

  it('converts suit symbols back to codes', () => {
    expect(convertCardNotation(`A${SUITS[0]}`)).toBe('As');
    expect(convertCardNotation(`10${SUITS[1]}`)).toBe('10h');
  });

  it('returns unrecognized notation unchanged', () => {
    expect(convertCardNotation('Ax')).toBe('Ax');
  });
});
