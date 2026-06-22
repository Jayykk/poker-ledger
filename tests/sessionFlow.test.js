/**
 * Unit tests for src/utils/sessionFlow.js
 * Pure decision & aggregation logic for the live-event (Session) layer.
 */
import { describe, it, expect } from 'vitest';
import {
  isRosterMember,
  isHost,
  rosterCount,
  isFull,
  canJoinRsvp,
  buildActiveRoute,
  resolveSessionView,
  canViewLocation,
  defaultSessionName,
  aggregateSessionSummary,
} from '../src/utils/sessionFlow.js';

/**
 * Minimal sessions-shaped state. When only `rosterUids` is overridden, `roster`
 * mirrors it so the two stay in sync (as the real RSVP write keeps them).
 */
function makeSession(overrides = {}) {
  const base = {
    hostUid: 'host',
    maxPlayers: 3,
    status: 'scheduling',
    rosterUids: ['host'],
    activeTable: null,
    location: null,
  };
  const merged = { ...base, ...overrides };
  if (!('roster' in overrides)) {
    merged.roster = merged.rosterUids.map((uid) => ({ uid, name: uid }));
  }
  return merged;
}

describe('isRosterMember', () => {
  it('uses rosterUids when present', () => {
    expect(isRosterMember(makeSession({ rosterUids: ['host', 'p2'] }), 'p2')).toBe(true);
    expect(isRosterMember(makeSession({ rosterUids: ['host'] }), 'p2')).toBe(false);
  });

  it('falls back to roster array when rosterUids is absent', () => {
    const s = { roster: [{ uid: 'p9' }] };
    expect(isRosterMember(s, 'p9')).toBe(true);
    expect(isRosterMember(s, 'nobody')).toBe(false);
  });

  it('guards null inputs', () => {
    expect(isRosterMember(null, 'x')).toBe(false);
    expect(isRosterMember(makeSession(), null)).toBe(false);
  });
});

describe('isHost', () => {
  it('matches hostUid', () => {
    expect(isHost(makeSession(), 'host')).toBe(true);
    expect(isHost(makeSession(), 'p2')).toBe(false);
  });
});

describe('rosterCount / isFull', () => {
  it('counts the roster', () => {
    expect(rosterCount(makeSession({ rosterUids: ['a', 'b'] }))).toBe(2);
  });

  it('is full at maxPlayers', () => {
    expect(isFull(makeSession({ maxPlayers: 2, rosterUids: ['a', 'b'] }))).toBe(true);
    expect(isFull(makeSession({ maxPlayers: 3, rosterUids: ['a', 'b'] }))).toBe(false);
  });

  it('treats maxPlayers <= 0 as uncapped', () => {
    expect(isFull(makeSession({ maxPlayers: 0, rosterUids: ['a', 'b'] }))).toBe(false);
  });
});

describe('canJoinRsvp', () => {
  it('allows a new visitor while scheduling and not full', () => {
    expect(canJoinRsvp(makeSession({ rosterUids: ['host'] }), 'p2')).toBe(true);
  });

  it('rejects when already on the roster', () => {
    expect(canJoinRsvp(makeSession({ rosterUids: ['host', 'p2'] }), 'p2')).toBe(false);
  });

  it('rejects when full', () => {
    expect(canJoinRsvp(makeSession({ maxPlayers: 2, rosterUids: ['host', 'x'] }), 'p2')).toBe(false);
  });

  it('rejects once the session is no longer scheduling', () => {
    expect(canJoinRsvp(makeSession({ status: 'active', rosterUids: ['host'] }), 'p2')).toBe(false);
  });
});

describe('buildActiveRoute', () => {
  it('routes cash tables to the ledger', () => {
    expect(buildActiveRoute({ kind: 'cash', gameId: 'g1' })).toBe('/game/g1');
  });

  it('routes tournaments to the clock', () => {
    expect(buildActiveRoute({ kind: 'tournament', tournamentSessionId: 't1' })).toBe('/tournament-clock/t1');
  });

  it('returns null when nothing is activated', () => {
    expect(buildActiveRoute(null)).toBe(null);
    expect(buildActiveRoute({ kind: 'cash' })).toBe(null);
  });
});

describe('resolveSessionView', () => {
  it('shows RSVP to a non-host while scheduling', () => {
    expect(resolveSessionView(makeSession(), 'p2')).toEqual({ mode: 'rsvp' });
  });

  it('shows the host console while scheduling', () => {
    expect(resolveSessionView(makeSession(), 'host')).toEqual({ mode: 'host-console' });
  });

  it('redirects a roster member to the active table', () => {
    const s = makeSession({
      status: 'active',
      rosterUids: ['host', 'p2'],
      activeTable: { kind: 'cash', gameId: 'g1' },
    });
    expect(resolveSessionView(s, 'p2')).toEqual({ mode: 'redirect', route: '/game/g1' });
  });

  it('keeps the host on the console when active (with route for tap-in)', () => {
    const s = makeSession({
      status: 'active',
      activeTable: { kind: 'tournament', tournamentSessionId: 't1' },
    });
    expect(resolveSessionView(s, 'host')).toEqual({ mode: 'host-console', route: '/tournament-clock/t1' });
  });

  it('blocks a non-roster visitor on an active session', () => {
    const s = makeSession({
      status: 'active',
      rosterUids: ['host'],
      activeTable: { kind: 'cash', gameId: 'g1' },
    });
    expect(resolveSessionView(s, 'stranger')).toEqual({ mode: 'blocked' });
  });

  it('shows the summary when completed', () => {
    expect(resolveSessionView(makeSession({ status: 'completed' }), 'p2')).toEqual({ mode: 'completed' });
  });

  it('treats a missing session as completed/closed', () => {
    expect(resolveSessionView(null, 'p2')).toEqual({ mode: 'completed' });
  });
});

describe('canViewLocation', () => {
  it('is hidden when there is no location', () => {
    expect(canViewLocation(makeSession(), 'host')).toBe(false);
  });

  it('is public when not marked joined-only', () => {
    const s = makeSession({ location: { name: '內湖基地', showToJoinedOnly: false } });
    expect(canViewLocation(s, 'stranger')).toBe(true);
  });

  it('is gated to host/roster when joined-only', () => {
    const s = makeSession({
      rosterUids: ['host', 'p2'],
      location: { name: '內湖基地', showToJoinedOnly: true },
    });
    expect(canViewLocation(s, 'host')).toBe(true);
    expect(canViewLocation(s, 'p2')).toBe(true);
    expect(canViewLocation(s, 'stranger')).toBe(false);
  });
});

describe('defaultSessionName', () => {
  it('formats YYYYMMDD from the given time', () => {
    const ms = new Date(2026, 5, 22, 19, 30).getTime(); // 2026-06-22 local
    expect(defaultSessionName(ms)).toBe('20260622 德州撲克活動');
  });

  it('returns empty string for invalid input', () => {
    expect(defaultSessionName('not-a-date')).toBe('');
  });
});

describe('aggregateSessionSummary', () => {
  const tableA = {
    name: '現金 10/20',
    kind: 'cash',
    rate: 1,
    settlementSnapshot: [
      { odId: 'a', name: 'Alice', buyIn: 1000, stack: 1500, profit: 500 },
      { odId: 'b', name: 'Bob', buyIn: 1000, stack: 500, profit: -500 },
    ],
  };
  const tableB = {
    name: 'MTT',
    kind: 'tournament',
    rate: 1,
    settlement: [
      { odId: 'a', name: 'Alice', buyIn: 500, stack: 0, profit: -500 },
      { odId: 'c', name: 'Cara', buyIn: 500, stack: 1500, profit: 1000 },
    ],
  };

  it('aggregates profit across tables keyed by odId', () => {
    const out = aggregateSessionSummary([tableA, tableB]);
    expect(out.tableCount).toBe(2);
    const alice = out.ranking.find((p) => p.odId === 'a');
    expect(alice.profitCash).toBe(0); // +500 then -500
    expect(alice.tables).toBe(2);
    expect(alice.buyInCash).toBe(1500);
  });

  it('totals buy-in across all tables and players', () => {
    const out = aggregateSessionSummary([tableA, tableB]);
    expect(out.totalBuyIn).toBe(3000); // 2000 + 1000
  });

  it('ranks winners first and exposes top winners/losers', () => {
    const out = aggregateSessionSummary([tableA, tableB]);
    expect(out.ranking[0].odId).toBe('c'); // +1000
    expect(out.topWinners[0].name).toBe('Cara');
    expect(out.topLosers[0].name).toBe('Bob'); // -500
  });

  it('applies per-table rate to convert chips to cash', () => {
    const out = aggregateSessionSummary([
      { name: 'cash', kind: 'cash', rate: 10, settlementSnapshot: [
        { odId: 'a', name: 'Alice', buyIn: 1000, stack: 2000, profit: 1000 },
      ] },
    ]);
    expect(out.ranking[0].profitCash).toBe(100); // 1000 / 10
    expect(out.totalBuyIn).toBe(100); // 1000 / 10
  });

  it('handles empty / malformed input', () => {
    expect(aggregateSessionSummary([]).ranking).toEqual([]);
    expect(aggregateSessionSummary([null, { foo: 1 }]).tableCount).toBe(0);
  });
});
