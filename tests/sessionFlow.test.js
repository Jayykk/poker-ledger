/**
 * Unit tests for src/utils/sessionFlow.js — period-based live-event logic.
 */
import { describe, it, expect } from 'vitest';
import {
  isHost,
  periodById,
  periodRosterUids,
  periodCount,
  periodFull,
  isPeriodLocked,
  canJoinPeriod,
  isSignedUpForPeriod,
  isParticipant,
  buildActiveRoute,
  resolveSessionView,
  canViewLocation,
  defaultSessionName,
  aggregateSessionSummary,
} from '../src/utils/sessionFlow.js';

/** Minimal session with two periods (afternoon cash, evening tournament). */
function makeSession(overrides = {}) {
  return {
    hostUid: 'host',
    status: 'scheduling',
    periods: [
      { id: 'p1', order: 0, label: '下午', type: 'cash', maxPlayers: 3, status: 'queued',
        roster: [{ uid: 'host' }], rosterUids: ['host'] },
      { id: 'p2', order: 1, label: '晚上', type: 'tournament', maxPlayers: 9, status: 'queued',
        roster: [], rosterUids: [] },
    ],
    participantUids: ['host'],
    currentSlotIndex: -1,
    activeSlot: null,
    location: null,
    ...overrides,
  };
}

describe('isHost', () => {
  it('matches hostUid', () => {
    expect(isHost(makeSession(), 'host')).toBe(true);
    expect(isHost(makeSession(), 'p2')).toBe(false);
  });
});

describe('periods helpers', () => {
  it('finds a period by id', () => {
    expect(periodById(makeSession(), 'p2').label).toBe('晚上');
    expect(periodById(makeSession(), 'nope')).toBe(null);
  });

  it('reads roster uids and count', () => {
    const s = makeSession();
    expect(periodRosterUids(s.periods[0])).toEqual(['host']);
    expect(periodCount(s.periods[0])).toBe(1);
  });

  it('detects a full period by its own cap', () => {
    const full = { maxPlayers: 2, rosterUids: ['a', 'b'], roster: [{ uid: 'a' }, { uid: 'b' }] };
    expect(periodFull(full)).toBe(true);
    expect(periodFull({ maxPlayers: 3, rosterUids: ['a'] })).toBe(false);
    expect(periodFull({ maxPlayers: 0, rosterUids: ['a', 'b'] })).toBe(false); // uncapped
  });

  it('locks a period once active/done', () => {
    expect(isPeriodLocked({ status: 'queued' })).toBe(false);
    expect(isPeriodLocked({ status: 'active' })).toBe(true);
    expect(isPeriodLocked({ status: 'done' })).toBe(true);
  });
});

describe('canJoinPeriod', () => {
  it('allows joining a queued, non-full period', () => {
    expect(canJoinPeriod({ status: 'queued', maxPlayers: 3, rosterUids: ['a'] }, 'b')).toBe(true);
  });
  it('lets an already-signed-up player toggle even if full', () => {
    expect(canJoinPeriod({ status: 'queued', maxPlayers: 2, rosterUids: ['a', 'b'] }, 'b')).toBe(true);
  });
  it('rejects a full period for a newcomer', () => {
    expect(canJoinPeriod({ status: 'queued', maxPlayers: 2, rosterUids: ['a', 'b'] }, 'c')).toBe(false);
  });
  it('rejects a locked (active/done) period', () => {
    expect(canJoinPeriod({ status: 'active', maxPlayers: 9, rosterUids: [] }, 'a')).toBe(false);
  });
});

describe('isSignedUpForPeriod / isParticipant', () => {
  it('checks per-period membership', () => {
    const s = makeSession({ periods: [
      { id: 'p1', rosterUids: ['host', 'x'], status: 'queued' },
      { id: 'p2', rosterUids: ['y'], status: 'queued' },
    ], participantUids: ['host', 'x', 'y'] });
    expect(isSignedUpForPeriod(s, 'x', 'p1')).toBe(true);
    expect(isSignedUpForPeriod(s, 'x', 'p2')).toBe(false);
  });
  it('checks event-wide participation via participantUids', () => {
    const s = makeSession({ participantUids: ['host', 'z'] });
    expect(isParticipant(s, 'z')).toBe(true);
    expect(isParticipant(s, 'stranger')).toBe(false);
  });
});

describe('buildActiveRoute', () => {
  it('routes cash periods to the ledger', () => {
    expect(buildActiveRoute({ id: 'p1', type: 'cash', gameId: 'g1' })).toBe('/game/g1');
  });
  it('routes tournament periods to the table manager', () => {
    expect(buildActiveRoute({ id: 'p2', type: 'tournament', gameId: 'g2' })).toBe('/tournament-game/g2');
  });
  it('returns null for custom / no-game slots', () => {
    expect(buildActiveRoute({ id: 'p3', type: 'custom' })).toBe(null);
    expect(buildActiveRoute(null)).toBe(null);
  });
});

describe('resolveSessionView', () => {
  it('shows the sign-up board to a non-host while scheduling', () => {
    expect(resolveSessionView(makeSession(), 'p2')).toEqual({ mode: 'rsvp' });
  });

  it('shows the host console (with route) to the host', () => {
    const s = makeSession({ status: 'active', activeSlot: { id: 'p1', type: 'cash', gameId: 'g1' } });
    expect(resolveSessionView(s, 'host')).toEqual({ mode: 'host-console', route: '/game/g1' });
  });

  it('redirects a member of the active linked period', () => {
    const s = makeSession({
      status: 'active',
      periods: [{ id: 'p1', type: 'cash', status: 'active', rosterUids: ['host', 'bob'] }],
      participantUids: ['host', 'bob'],
      activeSlot: { id: 'p1', type: 'cash', gameId: 'g1' },
    });
    expect(resolveSessionView(s, 'bob')).toEqual({ mode: 'redirect', route: '/game/g1' });
  });

  it('shows the board (no redirect) to a member NOT in the active period', () => {
    const s = makeSession({
      status: 'active',
      periods: [
        { id: 'p1', type: 'cash', status: 'active', rosterUids: ['host'] },
        { id: 'p2', type: 'tournament', status: 'queued', rosterUids: ['bob'] },
      ],
      participantUids: ['host', 'bob'],
      activeSlot: { id: 'p1', type: 'cash', gameId: 'g1' },
    });
    expect(resolveSessionView(s, 'bob')).toEqual({ mode: 'rsvp' });
  });

  it('shows the board when the active period is custom (no route)', () => {
    const s = makeSession({
      status: 'active',
      activeSlot: { id: 'p3', type: 'custom' },
    });
    expect(resolveSessionView(s, 'bob')).toEqual({ mode: 'rsvp' });
  });

  it('shows the summary when completed', () => {
    expect(resolveSessionView(makeSession({ status: 'completed' }), 'bob')).toEqual({ mode: 'completed' });
  });

  it('treats a missing session as completed', () => {
    expect(resolveSessionView(null, 'bob')).toEqual({ mode: 'completed' });
  });
});

describe('canViewLocation', () => {
  it('is hidden when there is no location', () => {
    expect(canViewLocation(makeSession())).toBe(false);
  });
  it('is shown when a venue name is set', () => {
    expect(canViewLocation(makeSession({ location: { name: '內湖基地' } }))).toBe(true);
  });
});

describe('defaultSessionName', () => {
  it('formats YYYYMMDD from the given time', () => {
    const ms = new Date(2026, 5, 22, 19, 30).getTime();
    expect(defaultSessionName(ms)).toBe('20260622 德州撲克活動');
  });
  it('returns empty string for invalid input', () => {
    expect(defaultSessionName('not-a-date')).toBe('');
  });
});

describe('aggregateSessionSummary', () => {
  const tableA = {
    name: '下午 限時', kind: 'cash', rate: 1,
    settlementSnapshot: [
      { odId: 'a', name: 'Alice', buyIn: 1000, stack: 1500, profit: 500 },
      { odId: 'b', name: 'Bob', buyIn: 1000, stack: 500, profit: -500 },
    ],
  };
  const tableB = {
    name: '晚上 MTT', kind: 'tournament', rate: 1,
    settlement: [
      { odId: 'a', name: 'Alice', buyIn: 500, stack: 0, profit: -500 },
      { odId: 'c', name: 'Cara', buyIn: 500, stack: 1500, profit: 1000 },
    ],
  };

  it('aggregates profit across periods keyed by odId', () => {
    const out = aggregateSessionSummary([tableA, tableB]);
    expect(out.tableCount).toBe(2);
    expect(out.ranking.find((p) => p.odId === 'a').profitCash).toBe(0);
    expect(out.totalBuyIn).toBe(3000);
    expect(out.ranking[0].odId).toBe('c');
    expect(out.topLosers[0].name).toBe('Bob');
  });

  it('handles empty / malformed input', () => {
    expect(aggregateSessionSummary([]).ranking).toEqual([]);
    expect(aggregateSessionSummary([null, { foo: 1 }]).tableCount).toBe(0);
  });
});
