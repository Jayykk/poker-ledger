/**
 * Unit tests for src/utils/pokerEntry.js
 * Pure decision logic for the online-poker entry flow (P4-2).
 */
import { describe, it, expect } from 'vitest';
import {
  shouldAutoStartFirstHand,
  resolveAutoSeat,
  buildOnlineRoomConfig,
  buildPokerInviteUrl,
  parsePokerGameId,
} from '../src/utils/pokerEntry.js';

/** Minimal pokerGames-shaped state. */
function makeGame({
  status = 'waiting',
  handNumber = 0,
  createdBy = 'host',
  seats,
  meta = {},
} = {}) {
  return {
    status,
    handNumber,
    meta: { createdBy, minBuyIn: 1000, maxBuyIn: 5000, ...meta },
    seats: seats || {
      0: { odId: 'host', chips: 5000 },
      1: { odId: 'p2', chips: 5000 },
      2: null,
    },
  };
}

describe('shouldAutoStartFirstHand', () => {
  it('lets the host auto-start when 2+ funded players are waiting on hand 0', () => {
    expect(shouldAutoStartFirstHand(makeGame(), 'host')).toBe(true);
  });

  it('only the host triggers it (other clients do not)', () => {
    expect(shouldAutoStartFirstHand(makeGame(), 'p2')).toBe(false);
  });

  it('does not fire once a hand has already been played', () => {
    expect(shouldAutoStartFirstHand(makeGame({ handNumber: 1 }), 'host')).toBe(false);
  });

  it('does not fire unless the room is waiting', () => {
    expect(shouldAutoStartFirstHand(makeGame({ status: 'playing' }), 'host')).toBe(false);
  });

  it('requires at least 2 funded players', () => {
    const game = makeGame({ seats: { 0: { odId: 'host', chips: 5000 }, 1: null } });
    expect(shouldAutoStartFirstHand(game, 'host')).toBe(false);
  });

  it('ignores seated players with no chips', () => {
    const game = makeGame({
      seats: { 0: { odId: 'host', chips: 5000 }, 1: { odId: 'p2', chips: 0 } },
    });
    expect(shouldAutoStartFirstHand(game, 'host')).toBe(false);
  });

  it('is safe on null/empty input', () => {
    expect(shouldAutoStartFirstHand(null, 'host')).toBe(false);
    expect(shouldAutoStartFirstHand(makeGame(), undefined)).toBe(false);
  });
});

describe('resolveAutoSeat', () => {
  it('returns the room max buy-in for an unseated arrival with seats free', () => {
    const game = makeGame({ seats: { 0: { odId: 'host', chips: 5000 }, 1: null } });
    expect(resolveAutoSeat(game, 'newcomer')).toBe(5000);
  });

  it('returns null when the user is already seated (e.g. the host)', () => {
    expect(resolveAutoSeat(makeGame(), 'host')).toBeNull();
  });

  it('returns null when the table is full', () => {
    const game = makeGame({
      seats: { 0: { odId: 'host', chips: 5000 }, 1: { odId: 'p2', chips: 5000 } },
    });
    expect(resolveAutoSeat(game, 'newcomer')).toBeNull();
  });

  it('returns null when the game is not joinable', () => {
    expect(resolveAutoSeat(makeGame({ status: 'ended' }), 'newcomer')).toBeNull();
  });

  it('allows joining a game already in progress', () => {
    const game = makeGame({
      status: 'playing',
      handNumber: 3,
      seats: { 0: { odId: 'host', chips: 5000 }, 1: null },
    });
    expect(resolveAutoSeat(game, 'newcomer')).toBe(5000);
  });

  it('falls back to minBuyIn when maxBuyIn is missing', () => {
    const game = makeGame({
      seats: { 0: { odId: 'host', chips: 5000 }, 1: null },
      meta: { maxBuyIn: undefined },
    });
    expect(resolveAutoSeat(game, 'newcomer')).toBe(1000);
  });

  it('is safe on null/empty input', () => {
    expect(resolveAutoSeat(null, 'u')).toBeNull();
    expect(resolveAutoSeat(makeGame(), undefined)).toBeNull();
  });
});

describe('buildOnlineRoomConfig', () => {
  it('uses the chosen buy-in for the host stack and the whole buy-in band', () => {
    expect(buildOnlineRoomConfig({ buyIn: 2000 })).toEqual({
      mode: 'cash',
      smallBlind: 10,
      bigBlind: 20,
      minBuyIn: 2000,
      maxBuyIn: 2000,
      buyIn: 2000,
      turnTimeout: 30,
    });
  });

  it('falls back to a sane default for a missing/invalid buy-in', () => {
    expect(buildOnlineRoomConfig({}).buyIn).toBe(1000);
    expect(buildOnlineRoomConfig({ buyIn: 0 }).buyIn).toBe(1000);
    expect(buildOnlineRoomConfig().buyIn).toBe(1000);
  });

  it('honors custom blinds', () => {
    const cfg = buildOnlineRoomConfig({ buyIn: 1500, smallBlind: 25, bigBlind: 50 });
    expect(cfg.smallBlind).toBe(25);
    expect(cfg.bigBlind).toBe(50);
  });
});

describe('buildPokerInviteUrl', () => {
  it('builds a hash route under the app base', () => {
    expect(buildPokerInviteUrl('abc', 'https://x.com', '/poker-ledger/'))
      .toBe('https://x.com/poker-ledger/#/poker-game/abc');
  });

  it('normalizes a base path missing its trailing slash', () => {
    expect(buildPokerInviteUrl('abc', 'https://x.com', '/poker-ledger'))
      .toBe('https://x.com/poker-ledger/#/poker-game/abc');
  });

  it('works with defaults (relative)', () => {
    expect(buildPokerInviteUrl('abc')).toBe('/#/poker-game/abc');
  });
});

describe('parsePokerGameId', () => {
  it('extracts the id from a LIFF invite link', () => {
    expect(parsePokerGameId('https://liff.line.me/123-xyz/poker-game/AbC123xyz?k=1'))
      .toBe('AbC123xyz');
  });

  it('extracts the id from a web hash link', () => {
    expect(parsePokerGameId('https://host/poker-ledger/#/poker-game/AbC123xyz'))
      .toBe('AbC123xyz');
  });

  it('returns a bare id untouched', () => {
    expect(parsePokerGameId('  AbC123xyz  ')).toBe('AbC123xyz');
  });

  it('returns null for empty / non-string input', () => {
    expect(parsePokerGameId('')).toBeNull();
    expect(parsePokerGameId('   ')).toBeNull();
    expect(parsePokerGameId(null)).toBeNull();
    expect(parsePokerGameId(undefined)).toBeNull();
  });
});
