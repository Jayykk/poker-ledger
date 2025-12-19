/**
 * Hand Histories Utilities
 *
 * Writes per-player hole cards into the top-level `handHistories` collection
 * for analytics queries (e.g. "how often was I dealt AA?").
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const RANK_VALUE = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  'T': 10,
  'J': 11,
  'Q': 12,
  'K': 13,
  'A': 14,
};

/**
 * Parse a card string like 'Ah' into { rank: 'A', suit: 'h' }.
 * Returns null for invalid inputs.
 * @param {string} card
 * @return {{rank: string, suit: string} | null}
 */
function parseCard(card) {
  if (typeof card !== 'string' || card.length < 2) return null;
  const rank = card[0].toUpperCase();
  const suit = card[card.length - 1];
  if (!RANK_VALUE[rank]) return null;
  if (!suit) return null;
  return { rank, suit };
}

/**
 * Derive analytics fields from hole cards.
 * @param {Array<string>} holeCards
 * @return {{pocketPair: (string|null), isSuited: boolean, ranks: Array<string>}}
 */
export function deriveHoleCardAnalytics(holeCards) {
  if (!Array.isArray(holeCards) || holeCards.length !== 2) {
    return { pocketPair: null, isSuited: false, ranks: [] };
  }

  const c1 = parseCard(holeCards[0]);
  const c2 = parseCard(holeCards[1]);
  if (!c1 || !c2) {
    return { pocketPair: null, isSuited: false, ranks: [] };
  }

  const isSuited = c1.suit === c2.suit;
  const ranks = [c1.rank, c2.rank].sort((a, b) => RANK_VALUE[b] - RANK_VALUE[a]);
  const pocketPair = ranks[0] === ranks[1] ? `${ranks[0]}${ranks[1]}` : null;

  return { pocketPair, isSuited, ranks };
}

/**
 * Build a stable handId for a game hand.
 * @param {Object} game
 * @return {string}
 */
export function getHandIdFromGame(game) {
  return `hand_${game?.handNumber ?? 'unknown'}`;
}

/**
 * Build a unique document id for a player's hand history.
 * @param {Object} params
 * @param {string} params.gameId
 * @param {string} params.handId
 * @param {string} params.userId
 * @return {string}
 */
export function makeHandHistoryDocId({ gameId, handId, userId }) {
  return `${gameId}_${handId}_${userId}`;
}

/**
 * Write a single hand history entry within a Firestore transaction.
 *
 * If `skipIfExists` is true, this will perform an existence read and skip
 * writing when the document already exists (useful to preserve a prior,
 * more-specific outcome like `force_fold_leave`).
 *
 * @param {Object} transaction
 * @param {Object} entry
 * @param {string} entry.gameId
 * @param {string} entry.handId
 * @param {string} entry.userId
 * @param {Array<string>} entry.holeCards
 * @param {string} entry.outcome
 * @param {Object} [options]
 * @param {boolean} [options.skipIfExists]
 * @return {Promise<{written: boolean, skipped: boolean, refPath: string}>}
 */
export async function writeHandHistoryEntry(
  transaction,
  { gameId, handId, userId, holeCards = [], outcome },
  { skipIfExists = false } = {},
) {
  const db = getFirestore();
  const ref = db
    .collection('handHistories')
    .doc(makeHandHistoryDocId({ gameId, handId, userId }));

  if (skipIfExists) {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      return { written: false, skipped: true, refPath: ref.path };
    }
  }

  const normalizedHoleCards = Array.isArray(holeCards) ? holeCards : [];
  const analytics = deriveHoleCardAnalytics(normalizedHoleCards);

  transaction.set(ref, {
    gameId,
    handId,
    userId,
    holeCards: normalizedHoleCards,
    outcome,
    pocketPair: analytics.pocketPair,
    isSuited: analytics.isSuited,
    ranks: analytics.ranks,
    timestamp: FieldValue.serverTimestamp(),
  });

  return { written: true, skipped: false, refPath: ref.path };
}
