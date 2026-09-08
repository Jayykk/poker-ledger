/**
 * Card Recognition utils test suite
 * Covers the pure helpers behind the photo → Gemini → cards feature:
 * response parsing, normalisation to the app's "A♠" format, error mapping
 * and merging recognised cards into a hand record.
 */
import { describe, it, expect } from 'vitest';
import {
  CARD_RESPONSE_SCHEMA,
  CARD_RECOGNITION_PROMPT,
  CardRecognitionError,
  RECOGNITION_ERROR,
  parseGeminiJson,
  normalizeRecognizedCards,
  mapAiError,
  applyAssignments,
} from '../src/utils/cardRecognition.js';
import { RANKS } from '../src/utils/constants.js';

// ── parseGeminiJson ───────────────────────────────────

describe('parseGeminiJson', () => {
  it('parses a plain JSON object', () => {
    expect(parseGeminiJson('{"cards":[{"rank":"A","suit":"spades"}]}'))
      .toEqual({ cards: [{ rank: 'A', suit: 'spades' }] });
  });

  it('parses a bare JSON array', () => {
    expect(parseGeminiJson('[{"rank":"K","suit":"hearts"}]'))
      .toEqual([{ rank: 'K', suit: 'hearts' }]);
  });

  it('strips ```json fences', () => {
    const text = '```json\n{"cards":[]}\n```';
    expect(parseGeminiJson(text)).toEqual({ cards: [] });
  });

  it('strips bare ``` fences', () => {
    expect(parseGeminiJson('```\n{"cards":[]}\n```')).toEqual({ cards: [] });
  });

  it('extracts JSON surrounded by prose', () => {
    const text = 'Here are the cards I found: {"cards":[{"rank":"7","suit":"clubs"}]} Hope that helps!';
    expect(parseGeminiJson(text)).toEqual({ cards: [{ rank: '7', suit: 'clubs' }] });
  });

  it('throws PARSE_FAILED on empty or garbage input', () => {
    for (const bad of ['', '   ', 'no json here', undefined, null, 42]) {
      let thrown;
      try { parseGeminiJson(bad); } catch (e) { thrown = e; }
      expect(thrown).toBeInstanceOf(CardRecognitionError);
      expect(thrown.code).toBe(RECOGNITION_ERROR.PARSE_FAILED);
    }
  });
});

// ── normalizeRecognizedCards ──────────────────────────

describe('normalizeRecognizedCards', () => {
  it('converts { cards } payload to app card strings', () => {
    expect(normalizeRecognizedCards({ cards: [{ rank: 'A', suit: 'spades' }] })).toEqual(['A♠']);
  });

  it('accepts a bare array', () => {
    expect(normalizeRecognizedCards([{ rank: '10', suit: 'hearts' }, { rank: 'Q', suit: 'diamonds' }]))
      .toEqual(['10♥', 'Q♦']);
  });

  it('is case-insensitive for suits and ranks', () => {
    expect(normalizeRecognizedCards([
      { rank: 'a', suit: 'Hearts' },
      { rank: 'j', suit: 'CLUBS' },
    ])).toEqual(['A♥', 'J♣']);
  });

  it('accepts suit symbols and single-letter suit codes', () => {
    expect(normalizeRecognizedCards([
      { rank: '2', suit: '♠' },
      { rank: '3', suit: 'h' },
      { rank: '4', suit: 'D' },
      { rank: '5', suit: '♣' },
    ])).toEqual(['2♠', '3♥', '4♦', '5♣']);
  });

  it('maps T to 10 and keeps 10 as-is', () => {
    expect(normalizeRecognizedCards([{ rank: 'T', suit: 'spades' }, { rank: '10', suit: 'clubs' }]))
      .toEqual(['10♠', '10♣']);
  });

  it('drops invalid ranks, suits and non-object entries', () => {
    expect(normalizeRecognizedCards([
      { rank: '11', suit: 'spades' },
      { rank: 'Joker', suit: 'spades' },
      { rank: '1', suit: 'spades' },
      { rank: 'A' },
      { suit: 'hearts' },
      { rank: 'A', suit: 'stars' },
      'A♠',
      null,
      { rank: 'K', suit: 'diamonds' },
    ])).toEqual(['K♦']);
  });

  it('dedupes while preserving order', () => {
    expect(normalizeRecognizedCards([
      { rank: 'A', suit: 'spades' },
      { rank: 'K', suit: 'hearts' },
      { rank: 'A', suit: 'spades' },
      { rank: 'a', suit: 'Spades' },
    ])).toEqual(['A♠', 'K♥']);
  });

  it('returns [] for non-array input', () => {
    expect(normalizeRecognizedCards(null)).toEqual([]);
    expect(normalizeRecognizedCards(undefined)).toEqual([]);
    expect(normalizeRecognizedCards('A♠')).toEqual([]);
    expect(normalizeRecognizedCards({ cards: 'A♠' })).toEqual([]);
    expect(normalizeRecognizedCards({})).toEqual([]);
  });
});

// ── mapAiError ────────────────────────────────────────

describe('mapAiError', () => {
  it('passes through CardRecognitionError codes', () => {
    expect(mapAiError(new CardRecognitionError(RECOGNITION_ERROR.NO_CARDS))).toBe(RECOGNITION_ERROR.NO_CARDS);
    expect(mapAiError(new CardRecognitionError(RECOGNITION_ERROR.IMAGE))).toBe(RECOGNITION_ERROR.IMAGE);
  });

  it('maps 429 / quota messages to QUOTA', () => {
    expect(mapAiError({ customErrorData: { status: 429 }, message: 'Too many requests' })).toBe(RECOGNITION_ERROR.QUOTA);
    expect(mapAiError({ message: 'RESOURCE_EXHAUSTED: quota exceeded' })).toBe(RECOGNITION_ERROR.QUOTA);
  });

  it('maps 403 / App Check messages to APP_CHECK', () => {
    expect(mapAiError({ customErrorData: { status: 403 }, message: 'PERMISSION_DENIED' })).toBe(RECOGNITION_ERROR.APP_CHECK);
    expect(mapAiError({ message: 'To access this model, you must enforce Firebase App Check' })).toBe(RECOGNITION_ERROR.APP_CHECK);
  });

  it('maps api-not-enabled codes', () => {
    expect(mapAiError({ code: 'AI/api-not-enabled', message: 'enable it' })).toBe(RECOGNITION_ERROR.API_NOT_ENABLED);
  });

  it('maps network failures', () => {
    expect(mapAiError(new TypeError('Failed to fetch'))).toBe(RECOGNITION_ERROR.NETWORK);
    expect(mapAiError({ code: 'AI/fetch-error', message: 'Error fetching from ...' })).toBe(RECOGNITION_ERROR.NETWORK);
  });

  it('falls back to UNKNOWN', () => {
    expect(mapAiError({})).toBe(RECOGNITION_ERROR.UNKNOWN);
    expect(mapAiError(new Error('boom'))).toBe(RECOGNITION_ERROR.UNKNOWN);
    expect(mapAiError(null)).toBe(RECOGNITION_ERROR.UNKNOWN);
  });
});

// ── applyAssignments ──────────────────────────────────

const makeRecord = () => ({
  communityCards: ['A♠'],
  players: [
    { playerId: 'p1', playerName: 'Alice', participating: true, cards: ['K♥'] },
    { playerId: 'p2', playerName: 'Bob', participating: true, cards: [] },
    { playerId: 'p3', playerName: 'Carol', participating: false, cards: [] },
  ],
});

describe('applyAssignments', () => {
  it('appends community cards up to the limit and drops overflow', () => {
    const result = applyAssignments(makeRecord(), {
      communityCards: ['2♣', '3♣', '4♣', '5♣', '6♣', '7♣'],
    });
    expect(result.communityCards).toEqual(['A♠', '2♣', '3♣', '4♣', '5♣']);
    expect(result.appliedCount).toBe(4);
  });

  it('appends player cards up to 2', () => {
    const result = applyAssignments(makeRecord(), {
      playerCards: { p1: ['Q♦', 'J♦'], p2: ['9♠', '8♠', '7♠'] },
    });
    expect(result.players[0].cards).toEqual(['K♥', 'Q♦']);
    expect(result.players[1].cards).toEqual(['9♠', '8♠']);
    expect(result.appliedCount).toBe(3);
  });

  it('skips cards already used anywhere in the record or earlier in the batch', () => {
    const result = applyAssignments(makeRecord(), {
      communityCards: ['K♥', '2♣'],
      playerCards: { p2: ['A♠', '2♣', '3♣'] },
    });
    expect(result.communityCards).toEqual(['A♠', '2♣']);
    expect(result.players[1].cards).toEqual(['3♣']);
    expect(result.appliedCount).toBe(2);
  });

  it('ignores non-participating and unknown players', () => {
    const result = applyAssignments(makeRecord(), {
      playerCards: { p3: ['5♦'], ghost: ['6♦'] },
    });
    expect(result.players[2].cards).toEqual([]);
    expect(result.players).toHaveLength(3);
    expect(result.appliedCount).toBe(0);
  });

  it('does not mutate the input record', () => {
    const record = makeRecord();
    applyAssignments(record, { communityCards: ['2♣'], playerCards: { p2: ['3♣'] } });
    expect(record.communityCards).toEqual(['A♠']);
    expect(record.players[1].cards).toEqual([]);
  });

  it('handles empty assignments and missing arrays', () => {
    const result = applyAssignments({ communityCards: undefined, players: undefined });
    expect(result).toEqual({ communityCards: [], players: [], appliedCount: 0 });
  });
});

// ── schema / prompt sanity ────────────────────────────

describe('CARD_RESPONSE_SCHEMA & prompt', () => {
  it('rank enum matches the app RANKS', () => {
    expect(CARD_RESPONSE_SCHEMA.properties.cards.items.properties.rank.enum).toEqual(RANKS);
  });

  it('suit enum covers the four suits', () => {
    expect(CARD_RESPONSE_SCHEMA.properties.cards.items.properties.suit.enum)
      .toEqual(['spades', 'hearts', 'diamonds', 'clubs']);
  });

  it('prompt insists on "10" rather than "T"', () => {
    expect(CARD_RECOGNITION_PROMPT).toContain('"10"');
    expect(CARD_RECOGNITION_PROMPT).toContain('never "T"');
  });
});
