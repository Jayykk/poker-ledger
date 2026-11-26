/**
 * 補登 four of a kind: dealt as a pocket pair plus two on the board, so the
 * hand list shows cards and the hand events still give the player 四條.
 */
import { describe, it, expect } from 'vitest';
import { dealQuads } from '../functions/scripts/dealQuads.js';
import { handEventsOfHand } from '../functions/src/utils/handEvents.js';

const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const rankOf = (card) => card.slice(0, -1);

describe('dealQuads', () => {
  it('a pocket pair of the rank, the other two on the board, three blanks; seven different cards', () => {
    for (const rank of RANKS) {
      for (let i = 0; i < 40; i += 1) {
        const { cards, communityCards } = dealQuads(rank, `import-${rank}-${i}`);
        expect(cards.map(rankOf)).toEqual([rank, rank]);
        expect(communityCards).toHaveLength(5);
        expect(communityCards.filter((c) => rankOf(c) === rank)).toHaveLength(2);
        const blanks = communityCards.filter((c) => rankOf(c) !== rank).map(rankOf);
        expect(new Set(blanks).size).toBe(3);
        expect(new Set([...cards, ...communityCards]).size).toBe(7);
      }
    }
  });

  it('the hand events give the player 四條 and nothing else', () => {
    for (const rank of RANKS) {
      for (let i = 0; i < 20; i += 1) {
        const { cards, communityCards } = dealQuads(rank, `seed-${rank}-${i}`);
        const hand = { communityCards, players: [{ playerId: 'p1', cards, handType: 'four_of_a_kind', chips: 0 }] };
        expect(handEventsOfHand(hand)).toEqual({ p1: { quads: 1 } });
      }
    }
  });

  it('the same seed, the same cards; an unknown rank, nothing', () => {
    expect(dealQuads('J', 'import-abc')).toEqual(dealQuads('J', 'import-abc'));
    expect(dealQuads('J', 'import-abc')).not.toEqual(dealQuads('J', 'import-abd'));
    expect(dealQuads('T', 'x')).toBeNull();
    expect(dealQuads('', 'x')).toBeNull();
  });
});
