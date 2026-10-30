/**
 * The remaining deck must never reach the public pokerGames doc (anyone
 * signed in can read it). utils/pokerDeck.js keeps it in a server-only doc
 * and strips it from every game-doc write made through the guarded
 * transaction.
 */
import { describe, it, expect } from 'vitest';
import {
  deckRef, loadDeck, splitDeck, guardDeck, withoutDeck,
} from '../../functions/src/utils/pokerDeck.js';
import { initializeHand, dealHoleCards, dealFlop } from '../../functions/src/engines/texasHoldem.js';
import { isPokerRoomMember } from '../../functions/src/handlers/gameControl.js';

/** Minimal in-memory doc ref: path + collection().doc() chaining. */
function fakeRef(path) {
  return {
    path,
    id: path.split('/').pop(),
    collection: (name) => ({ doc: (id) => fakeRef(`${path}/${name}/${id}`) }),
  };
}

/** Records writes; reads come from `docs` keyed by path. */
function fakeTransaction(docs = {}) {
  const writes = [];
  const tx = {
    writes,
    async get(ref) {
      const data = docs[ref.path];
      return { exists: data !== undefined, data: () => data };
    },
    update(ref, data) {
      writes.push({ op: 'update', path: ref.path, data });
      return tx;
    },
    set(ref, data) {
      writes.push({ op: 'set', path: ref.path, data });
      return tx;
    },
    delete(ref) {
      writes.push({ op: 'delete', path: ref.path });
      return tx;
    },
  };
  return tx;
}

const gameRef = fakeRef('pokerGames/g1');
const DECK_PATH = 'pokerGames/g1/server/deck';

function baseGame() {
  return {
    handNumber: 0,
    meta: { maxPlayers: 2, blinds: { small: 10, big: 20 }, createdBy: 'host' },
    seats: {
      0: { odId: 'a', odName: 'A', chips: 1000, status: 'active' },
      1: { odId: 'b', odName: 'B', chips: 1000, status: 'active' },
    },
    table: { dealerSeat: 0, pot: 0 },
  };
}

describe('pokerDeck storage', () => {
  it('keeps the deck in pokerGames/{id}/server/deck', () => {
    expect(deckRef(gameRef).path).toBe(DECK_PATH);
  });

  it('splitDeck strips a full table map and a dotted table.deck without mutating', () => {
    const payload = { status: 'playing', table: { pot: 30, deck: ['As', 'Kd'] } };
    const { data, deck } = splitDeck(payload);
    expect(deck).toEqual(['As', 'Kd']);
    expect(data.table).toEqual({ pot: 30 });
    expect(payload.table.deck).toEqual(['As', 'Kd']);

    const dotted = splitDeck({ 'table.deck': ['2c'], 'table.pot': 5 });
    expect(dotted.deck).toEqual(['2c']);
    expect(dotted.data).toEqual({ 'table.pot': 5 });

    expect(splitDeck({ 'meta.x': 1 }).deck).toBeUndefined();
  });

  it('guarded writes never put the deck on the public doc, and store it server-side', () => {
    const raw = fakeTransaction();
    const tx = guardDeck(raw, gameRef);
    let game = initializeHand(baseGame());
    const { game: dealt } = dealHoleCards(game);
    game = dealt;

    tx.update(gameRef, { ...game, table: { ...game.table, turnTimeout: 30 } });

    const publicWrite = raw.writes.find((w) => w.path === 'pokerGames/g1');
    expect(publicWrite.data.table).not.toHaveProperty('deck');
    expect(publicWrite.data.table.turnTimeout).toBe(30);
    const deckWrite = raw.writes.find((w) => w.path === DECK_PATH);
    expect(deckWrite.data.cards).toEqual(game.table.deck);
    expect(deckWrite.data.cards).toHaveLength(52 - 4);
  });

  it('writes to other docs pass through untouched', () => {
    const raw = fakeTransaction();
    const tx = guardDeck(raw, gameRef);
    const other = fakeRef('pokerGames/g1/events/e1');
    tx.set(other, { table: { deck: ['x'] } });
    expect(raw.writes).toEqual([{ op: 'set', path: other.path, data: { table: { deck: ['x'] } } }]);
  });

  it('a later transaction deals the flop from the stored deck', async () => {
    const first = fakeTransaction();
    let game = dealHoleCards(initializeHand(baseGame())).game;
    guardDeck(first, gameRef).update(gameRef, game);
    const stored = first.writes.find((w) => w.path === DECK_PATH).data;
    const publicDoc = first.writes.find((w) => w.path === 'pokerGames/g1').data;

    const second = fakeTransaction({ [DECK_PATH]: stored });
    const loaded = await loadDeck(second, gameRef, structuredClone(publicDoc));
    expect(loaded.table.deck).toEqual(stored.cards);

    const flopped = dealFlop(loaded);
    // burn one, then the next three
    expect(flopped.table.communityCards).toEqual(stored.cards.slice(1, 4));
  });

  it('falls back to a deck still on the public doc (hands dealt before the move)', async () => {
    const tx = fakeTransaction();
    const game = { table: { deck: ['As', 'Kd', 'Qh'] } };
    await loadDeck(tx, gameRef, game);
    expect(game.table.deck).toEqual(['As', 'Kd', 'Qh']);
  });

  it('a dotted-only update scrubs a legacy public deck and moves it server-side', async () => {
    const raw = fakeTransaction();
    const tx = guardDeck(raw, gameRef);
    await loadDeck(tx, gameRef, { table: { deck: ['As', 'Kd'] } });

    tx.update(gameRef, { 'meta.lastActivityAt': 1 });
    tx.update(gameRef, { 'meta.autoCloseToken': 'x' });

    const [first, second] = raw.writes.filter((w) => w.path === 'pokerGames/g1');
    expect(Object.keys(first.data)).toContain('table.deck');
    expect(first.data['meta.lastActivityAt']).toBe(1);
    const deckWrites = raw.writes.filter((w) => w.path === DECK_PATH);
    expect(deckWrites).toEqual([{ op: 'set', path: DECK_PATH, data: { cards: ['As', 'Kd'] } }]);
    // only the first write needs the scrub
    expect(second.data).toEqual({ 'meta.autoCloseToken': 'x' });
  });

  it('a full table write needs no extra scrub for a legacy deck', async () => {
    const raw = fakeTransaction();
    const tx = guardDeck(raw, gameRef);
    const game = await loadDeck(tx, gameRef, { table: { pot: 0, deck: ['As', 'Kd'] } });
    tx.update(gameRef, { table: { ...game.table, pot: 5 } });
    const publicWrite = raw.writes.find((w) => w.path === 'pokerGames/g1');
    expect(publicWrite.data).toEqual({ table: { pot: 5 } });
    expect(raw.writes.filter((w) => w.path === DECK_PATH).at(-1).data.cards).toEqual(['As', 'Kd']);
  });

  it('no scrub once the deck already lives server-side', async () => {
    const raw = fakeTransaction({ [DECK_PATH]: { cards: ['2c'] } });
    const tx = guardDeck(raw, gameRef);
    await loadDeck(tx, gameRef, { table: { pot: 0 } });
    tx.update(gameRef, { 'meta.x': 1 });
    expect(raw.writes).toEqual([{ op: 'update', path: 'pokerGames/g1', data: { 'meta.x': 1 } }]);
  });

  it('withoutDeck drops the deck from data returned to clients', () => {
    expect(withoutDeck({ status: 'x', table: { pot: 1, deck: ['As'] } }))
      .toEqual({ status: 'x', table: { pot: 1 } });
    const noDeck = { table: { pot: 1 } };
    expect(withoutDeck(noDeck)).toBe(noDeck);
  });
});

describe('isPokerRoomMember', () => {
  const game = baseGame();
  it('accepts the creator and seated players', () => {
    expect(isPokerRoomMember(game, 'host')).toBe(true);
    expect(isPokerRoomMember(game, 'a')).toBe(true);
  });
  it('rejects spectators and missing uids', () => {
    expect(isPokerRoomMember(game, 'stranger')).toBe(false);
    expect(isPokerRoomMember(game, undefined)).toBe(false);
    expect(isPokerRoomMember({ ...game, seats: { 0: null } }, 'a')).toBe(false);
  });
});
