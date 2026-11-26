/**
 * specialHandOf (client, the 排行榜 hand list) gives the same 四條 / 同花順 /
 * 皇家 as handEventsOfHand (functions, what the titles and stats count).
 */
import { describe, it, expect } from 'vitest';
import { specialHandOf } from '../src/utils/specialHandOf.js';
import { handEventsOfHand } from '../functions/src/utils/handEvents.js';

const EVENT_TYPE = { quads: 'four_of_a_kind', straightFlush: 'straight_flush', royalFlush: 'royal_flush' };
const serverSays = (hand, playerId) => {
  const events = handEventsOfHand(hand)[playerId] || {};
  return Object.keys(EVENT_TYPE).filter((k) => events[k]).map((k) => EVENT_TYPE[k])[0] || null;
};

// A deck rich in quads and straight flushes, so both show up often
const DECK = [
  'A♠', 'K♠', 'Q♠', 'J♠', '10♠', '9♠', '5♠', '4♠', '3♠', '2♠',
  'A♥', 'A♦', 'A♣', 'K♥', 'K♦', 'K♣', 'Q♥', '9♥',
];
let seed = 7;
const rand = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed % n;
};
const deal = (n) => {
  const deck = [...DECK];
  const out = [];
  while (out.length < n) out.push(deck.splice(rand(deck.length), 1)[0]);
  return out;
};

describe('specialHandOf', () => {
  it('agrees with handEventsOfHand on many dealt hands (board sizes 3–5, two players)', () => {
    let special = 0;
    for (let i = 0; i < 4000; i += 1) {
      const boardSize = 3 + (i % 3);
      const cards = deal(boardSize + 4);
      const hand = {
        communityCards: cards.slice(0, boardSize),
        players: [
          { playerId: 'p1', cards: cards.slice(boardSize, boardSize + 2), handType: 'high_card', chips: 0 },
          { playerId: 'p2', cards: cards.slice(boardSize + 2), handType: 'high_card', chips: 0 },
        ],
      };
      for (const id of ['p1', 'p2']) {
        const expected = serverSays(hand, id);
        if (expected) special += 1;
        expect(specialHandOf(hand, id), `${id} ${JSON.stringify(hand)}`).toBe(expected);
      }
    }
    expect(special).toBeGreaterThan(200);
  });

  it("the board's own four of a kind is nobody's; the recorded type when there are no cards", () => {
    const boardQuads = { communityCards: ['A♠', 'A♥', 'A♦', 'A♣', '7♦'], players: [{ playerId: 'p1', cards: ['2♠', '3♥'], handType: 'four_of_a_kind' }] };
    expect(specialHandOf(boardQuads, 'p1')).toBeNull();
    expect(serverSays(boardQuads, 'p1')).toBeNull();
    const logged = { communityCards: [], players: [{ playerId: 'p1', cards: [], handType: 'straight_flush' }] };
    expect(specialHandOf(logged, 'p1')).toBe('straight_flush');
    expect(serverSays(logged, 'p1')).toBe('straight_flush');
    // A card seen twice: the cards can't be trusted, the recorded type counts
    const dup = { communityCards: ['A♠', 'A♥', 'K♦'], players: [{ playerId: 'p1', cards: ['A♠', 'A♦'], handType: 'four_of_a_kind' }] };
    expect(specialHandOf(dup, 'p1')).toBe(serverSays(dup, 'p1'));
    expect(specialHandOf(logged, 'nobody')).toBeNull();
  });
});
