import { createHash } from 'crypto';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

/**
 * Cards for a 補登 four of a kind known only by its rank (「J鐵」): a pocket
 * pair of that rank, the other two on the board with three blanks of other
 * ranks. The suits and blanks are made up, picked from the seed so the same
 * hand always gets the same cards.
 *
 * @param {string} rank 'A', 'K', … '10', … '2'
 * @param {string} seed e.g. the hand's id
 * @return {{ cards: string[], communityCards: string[] } | null} null for an unknown rank
 */
export function dealQuads(rank, seed) {
  if (!RANKS.includes(rank)) return null;
  // Deterministic stream of numbers from the seed
  let counter = 0;
  let pool = [];
  const next = (n) => {
    if (!pool.length) {
      pool = [...createHash('sha256').update(`${seed}|${counter++}`).digest()];
    }
    return pool.shift() % n;
  };
  const shuffle = (list) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = next(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  const quadSuits = shuffle(SUITS);
  const blanks = shuffle(RANKS.filter((r) => r !== rank)).slice(0, 3)
    .map((r) => `${r}${SUITS[next(4)]}`);
  return {
    cards: quadSuits.slice(0, 2).map((s) => `${rank}${s}`),
    communityCards: shuffle([...quadSuits.slice(2).map((s) => `${rank}${s}`), ...blanks]),
  };
}
