/**
 * Server-only deck storage for online poker rooms.
 *
 * The remaining deck must never sit in `pokerGames/{id}`: every signed-in
 * user can read that doc, and the deck reveals the coming board (and, by
 * elimination, opponents' hole cards). It lives in
 * `pokerGames/{id}/server/deck`, which the rules never match (default deny),
 * and is only merged back into `game.table.deck` in memory while a
 * transaction deals.
 *
 * Usage, inside a transaction that may deal cards:
 *   const tx = guardDeck(transaction, gameRef);
 *   const game = await loadDeck(tx, gameRef, gameDoc.data()); // before any write
 *   ...pass `tx` everywhere instead of `transaction`
 * Every write of the game doc through `tx` has its deck stripped and stored
 * in the server doc instead.
 */

/**
 * @param {Object} gameRef pokerGames/{id} reference
 * @return {Object} Reference of the server-only deck doc
 */
export function deckRef(gameRef) {
  return gameRef.collection('server').doc('deck');
}

/**
 * Read the server-held deck into `game.table.deck`. Must run before the
 * transaction's first write. Falls back to a deck still stored on the public
 * doc (hands dealt before this storage moved), which the next guarded write
 * removes.
 * @param {Object} transaction Firestore transaction
 * @param {Object} gameRef pokerGames/{id} reference
 * @param {Object} game Game data (mutated)
 * @return {Promise<Object>} The same game
 */
export async function loadDeck(transaction, gameRef, game) {
  const snap = await transaction.get(deckRef(gameRef));
  const cards = snap.exists ? snap.data()?.cards : game.table?.deck;
  if (game.table) {
    game.table.deck = Array.isArray(cards) ? cards : [];
  }
  return game;
}

/**
 * Split the deck out of a game-doc write payload without mutating it.
 * Handles both a full `table` map and a dotted `table.deck` field.
 * @param {Object} data Update/set payload
 * @return {{ data: Object, deck: (Array|undefined) }}
 */
export function splitDeck(data) {
  let out = data;
  let deck;
  if (Object.prototype.hasOwnProperty.call(out, 'table.deck')) {
    out = { ...out };
    deck = out['table.deck'];
    delete out['table.deck'];
  }
  if (out.table && typeof out.table === 'object' &&
      Object.prototype.hasOwnProperty.call(out.table, 'deck')) {
    const { deck: tableDeck, ...table } = out.table;
    deck = tableDeck;
    out = { ...out, table };
  }
  return { data: out, deck };
}

/**
 * Wrap a transaction so writes to `gameRef` never persist the deck publicly.
 * A stripped deck is written to the server-only doc in the same transaction.
 * @param {Object} transaction Firestore transaction
 * @param {Object} gameRef pokerGames/{id} reference
 * @return {Object} Proxy usable anywhere the transaction is
 */
export function guardDeck(transaction, gameRef) {
  const proxy = new Proxy(transaction, {
    get(target, prop) {
      if (prop === 'update' || prop === 'set') {
        return (ref, data, ...rest) => {
          if (ref?.path !== gameRef.path || !data || typeof data !== 'object') {
            target[prop](ref, data, ...rest);
            return proxy;
          }
          const split = splitDeck(data);
          target[prop](ref, split.data, ...rest);
          if (split.deck !== undefined) {
            target.set(deckRef(gameRef), {
              cards: Array.isArray(split.deck) ? split.deck : [],
            });
          }
          return proxy;
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return proxy;
}

/**
 * Drop the deck from game data returned to clients.
 * @param {Object} game Game data
 * @return {Object} Copy without `table.deck`
 */
export function withoutDeck(game) {
  if (!game?.table || !('deck' in game.table)) return game;
  const table = { ...game.table };
  delete table.deck;
  return { ...game, table };
}
