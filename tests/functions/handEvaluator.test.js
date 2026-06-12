/**
 * Unit tests for functions/src/utils/handEvaluator.js
 * Tests the real module backed by the real pokersolver package — no mocks.
 *
 * Note on card notation: pokersolver requires tens to be written as 'T'
 * (e.g. 'Th'); its Card constructor only reads one character for the value.
 * Our deck (utils/deck.js) emits '10h', which handEvaluator's
 * convertCardFormat rewrites to 'Th'. A regression test at the bottom covers
 * that conversion.
 */
import { describe, it, expect } from 'vitest';
import {
  HAND_RANKINGS,
  HAND_NAMES,
  evaluateHand,
  determineWinners,
  compareHands,
} from '../../functions/src/utils/handEvaluator.js';

describe('evaluateHand — hand name labeling and ranks', () => {
  it('labels a pair', () => {
    const result = evaluateHand(['As', 'Ad'], ['Kc', '7h', '5d', '3s', '2c']);
    expect(result.name).toBe('Pair');
    expect(result.descr).toBe("Pair, A's");
    expect(result.rank).toBe(2);
    expect(result.cards).toHaveLength(5);
  });

  it('labels a flush', () => {
    const result = evaluateHand(['Ah', 'Kh'], ['2h', '7h', '9h', '8c', '4d']);
    expect(result.name).toBe('Flush');
    expect(result.rank).toBe(6);
  });

  it('labels a straight', () => {
    const result = evaluateHand(['5s', '6s'], ['2h', '7h', '9h', '8c', '4d']);
    expect(result.name).toBe('Straight');
    expect(result.rank).toBe(5);
  });

  it('labels a full house', () => {
    const result = evaluateHand(['9s', '9d'], ['9h', '5c', '5d', 'Ac', '2d']);
    expect(result.name).toBe('Full House');
    expect(result.descr).toBe("Full House, 9's over 5's");
    expect(result.rank).toBe(7);
  });

  it('labels a high card', () => {
    const result = evaluateHand(['As', 'Jd'], ['9h', '7c', '5d', '3s', '2c']);
    expect(result.name).toBe('High Card');
    expect(result.rank).toBe(1);
  });

  it('recognizes a royal flush (using pokersolver "T" notation) and converts T back to 10 for display', () => {
    const result = evaluateHand(['Th', 'Jh'], ['Qh', 'Kh', 'Ah', '2c', '3d']);
    expect(result.name).toBe('Straight Flush');
    expect(result.descr).toBe('Royal Flush');
    expect(result.rank).toBe(9);
    // Display conversion: pokersolver's internal 'T' becomes '10'.
    expect(result.cards).toContain('10h');
    expect(result.cards).not.toContain('Th');
  });

  it('exposes the raw pokersolver hand object for comparisons', () => {
    const result = evaluateHand(['As', 'Ad'], ['Kc', '7h', '5d', '3s', '2c']);
    expect(result.hand).toBeDefined();
    expect(typeof result.hand.rank).toBe('number');
  });
});

describe('determineWinners', () => {
  const community = ['2h', '7h', '9h', '8c', '4d'];
  const straightPlayer = { odId: 'p1', odName: 'Straight Sam', holeCards: ['5s', '6s'] };
  const flushPlayer = { odId: 'p2', odName: 'Flush Fiona', holeCards: ['Ah', 'Kh'] };

  it('picks the flush over the straight', () => {
    const { winners, results } = determineWinners([straightPlayer, flushPlayer], community);

    expect(winners).toHaveLength(1);
    expect(winners[0].odId).toBe('p2');
    expect(winners[0].name).toBe('Flush');
    expect(results).toHaveLength(2);

    const straightResult = results.find((r) => r.odId === 'p1');
    const flushResult = results.find((r) => r.odId === 'p2');
    expect(straightResult.name).toBe('Straight');
    expect(flushResult.rank).toBeGreaterThan(straightResult.rank);
  });

  it('returns evaluation details for every player, not just the winners', () => {
    const { results } = determineWinners([straightPlayer, flushPlayer], community);
    for (const r of results) {
      expect(r.odId).toBeDefined();
      expect(r.odName).toBeDefined();
      expect(r.hand).toBeDefined();
      expect(typeof r.name).toBe('string');
      expect(typeof r.rank).toBe('number');
      expect(r.cards).toHaveLength(5);
    }
  });

  it('detects a tie and returns every tied player as a winner', () => {
    const board = ['Ac', '7s', '5h', '3d', '2c'];
    const { winners } = determineWinners(
      [
        { odId: 'tieA', odName: 'TieA', holeCards: ['As', 'Kd'] },
        { odId: 'tieB', odName: 'TieB', holeCards: ['Ad', 'Kh'] },
      ],
      board,
    );
    expect(winners).toHaveLength(2);
    expect(winners.map((w) => w.odId).sort()).toEqual(['tieA', 'tieB']);
  });

  it('picks a single best hand among three players', () => {
    const board = ['Qs', '7d', '5c', '8h', '2d'];
    const { winners } = determineWinners(
      [
        { odId: 'tripsQ', odName: 'Q', holeCards: ['Qh', 'Qc'] },
        { odId: 'trips8', odName: '8', holeCards: ['8s', '8d'] },
        { odId: 'aceHigh', odName: 'A', holeCards: ['Ac', 'Kd'] },
      ],
      board,
    );
    expect(winners).toHaveLength(1);
    expect(winners[0].odId).toBe('tripsQ');
    expect(winners[0].name).toBe('Three of a Kind');
  });

  it('accepts the legacy playerId/name/cards field aliases', () => {
    const { winners, results } = determineWinners(
      [
        { playerId: 'legacy1', name: 'Legacy One', cards: ['Ah', 'Kh'] },
        { playerId: 'legacy2', name: 'Legacy Two', cards: ['5s', '6s'] },
      ],
      community,
    );
    expect(results.map((r) => r.odId)).toEqual(['legacy1', 'legacy2']);
    expect(results[0].odName).toBe('Legacy One');
    expect(winners[0].playerId).toBe('legacy1');
  });
});

describe('compareHands', () => {
  const community = ['2h', '7h', '9h', '8c', '4d'];
  const flush = evaluateHand(['Ah', 'Kh'], community);
  const straight = evaluateHand(['5s', '6s'], community);

  it('returns 1 when the first hand wins', () => {
    expect(compareHands(flush, straight)).toBe(1);
  });

  it('returns -1 when the second hand wins', () => {
    expect(compareHands(straight, flush)).toBe(-1);
  });

  it('returns 0 for an exact tie', () => {
    const board = ['Ac', '7s', '5h', '3d', '2c'];
    const h1 = evaluateHand(['As', 'Kd'], board);
    const h2 = evaluateHand(['Ad', 'Kh'], board);
    expect(compareHands(h1, h2)).toBe(0);
  });
});

describe('exported ranking constants', () => {
  it('keeps HAND_NAMES aligned with HAND_RANKINGS', () => {
    expect(HAND_NAMES[HAND_RANKINGS.FLUSH]).toBe('Flush');
    expect(HAND_NAMES[HAND_RANKINGS.ROYAL_FLUSH]).toBe('Royal Flush');
    expect(Object.keys(HAND_NAMES)).toHaveLength(Object.keys(HAND_RANKINGS).length);
  });
});

describe('deck.js "10x" notation is converted for pokersolver (regression)', () => {
  // deck.js createDeck() emits tens as '10h'/'10s'/…, but pokersolver's Card
  // constructor reads only ONE character for the value and requires 'Th'.
  // convertCardFormat in handEvaluator.js rewrites '10x' → 'Tx'; before that
  // fix, any hand containing a ten was mis-evaluated (a royal flush dealt in
  // deck notation scored as high card).
  it('detects a royal flush dealt in deck.js notation', () => {
    const correct = evaluateHand(['Th', 'Jh'], ['Qh', 'Kh', 'Ah', '2c', '3d']);
    expect(correct.descr).toBe('Royal Flush'); // 'T' notation works

    const converted = evaluateHand(['10h', 'Jh'], ['Qh', 'Kh', 'Ah', '2c', '3d']);
    expect(converted.descr).toBe('Royal Flush'); // '10' notation now works too
  });

  it('treats deck-notation tens identically to T notation in comparisons', () => {
    const players = [
      { odId: 'a', odName: 'A', holeCards: ['10s', '10d'] }, // pair of tens
      { odId: 'b', odName: 'B', holeCards: ['9s', '9d'] }, // pair of nines
    ];
    const { winners } = determineWinners(players, ['2c', '5h', '7d', 'Jc', '3s']);
    expect(winners).toHaveLength(1);
    expect(winners[0].odId).toBe('a');
  });
});
