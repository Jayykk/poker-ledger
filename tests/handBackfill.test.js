import { describe, it, expect } from 'vitest';
import {
  BACKFILL_WINDOW_DAYS, BACKFILL_WINDOW_MS, canRecordHandAfter, gameFinishedMillis, rosterIndexOf, backfillHandFields,
} from '../src/utils/handBackfill.js';

const DAY = 24 * 60 * 60 * 1000;
const END = Date.UTC(2026, 9, 10, 14, 0, 0);
const ts = (ms) => ({ toMillis: () => ms }); // a Firestore Timestamp
const roster = [
  { id: 'g', name: 'Guest' },
  { id: 'p1', uid: 'bob', name: 'Bob' },
  { id: 'p2', uid: 'cara', name: 'Cara', eliminated: true },
];
const game = (extra = {}) => ({ status: 'completed', hostUid: 'host', players: roster, completedAt: ts(END), ...extra });

describe('補記手牌: who may record a hand after the game', () => {
  it('seven days', () => {
    expect(BACKFILL_WINDOW_DAYS).toBe(7);
    expect(BACKFILL_WINDOW_MS).toBe(7 * DAY);
  });

  it('a player of the game (busted out too) may, within the window', () => {
    expect(canRecordHandAfter(game(), 'bob', END + DAY)).toBe(true);
    expect(canRecordHandAfter(game(), 'cara', END + DAY)).toBe(true);
  });

  it('not a guest seat, not an outsider, not the host who did not play, not signed out', () => {
    expect(canRecordHandAfter(game(), 'zed', END + DAY)).toBe(false);
    expect(canRecordHandAfter(game(), 'host', END + DAY)).toBe(false);
    expect(canRecordHandAfter(game(), '', END + DAY)).toBe(false);
    expect(canRecordHandAfter(game(), null, END + DAY)).toBe(false);
    expect(canRecordHandAfter(game(), undefined, END + DAY)).toBe(false);
  });

  it('the 7-day boundary: open until just before, closed from the moment it ends (rules: request.time < end + 7d)', () => {
    expect(canRecordHandAfter(game(), 'bob', END)).toBe(true);
    expect(canRecordHandAfter(game(), 'bob', END + 7 * DAY - 1)).toBe(true);
    expect(canRecordHandAfter(game(), 'bob', END + 7 * DAY)).toBe(false);
    expect(canRecordHandAfter(game(), 'bob', END + 30 * DAY)).toBe(false);
  });

  it('an active game: no (the room records its own hands)', () => {
    expect(canRecordHandAfter(game({ status: 'active' }), 'bob', END + DAY)).toBe(false);
    expect(canRecordHandAfter(null, 'bob', END)).toBe(false);
  });

  it('the end: completedAt, else updatedAt, else createdAt — the first one set, as the rules pick it', () => {
    expect(gameFinishedMillis(game())).toBe(END);
    expect(gameFinishedMillis(game({ completedAt: END - DAY }))).toBe(END - DAY);
    expect(gameFinishedMillis(game({ completedAt: undefined, updatedAt: ts(END - DAY), createdAt: ts(END - 9 * DAY) }))).toBe(END - DAY);
    expect(gameFinishedMillis(game({ completedAt: null, createdAt: new Date(END - 2 * DAY) }))).toBe(END - 2 * DAY);
    // A field that is set but holds no time closes it (the rules don't fall through either)
    expect(gameFinishedMillis(game({ completedAt: 'yesterday', updatedAt: ts(END) }))).toBe(null);
    expect(canRecordHandAfter(game({ completedAt: 'yesterday' }), 'bob', END)).toBe(false);
    expect(canRecordHandAfter(game({ completedAt: undefined }), 'bob', END)).toBe(false);
    expect(canRecordHandAfter(game({ completedAt: undefined, updatedAt: ts(END) }), 'bob', END + 6 * DAY)).toBe(true);
  });

  it('the fields a hand recorded afterwards carries: the recorder and their roster slot', () => {
    expect(rosterIndexOf(game(), 'bob')).toBe(1);
    expect(rosterIndexOf(game(), 'zed')).toBe(-1);
    expect(rosterIndexOf({}, 'bob')).toBe(-1);
    expect(backfillHandFields(game(), 'cara')).toEqual({ recordedBy: 'cara', recordedAfter: true, recorderIndex: 2 });
  });
});
