/**
 * History Projection Utilities Test Suite
 * Covers createSyncRequestToken from src/utils/historyProjection.js.
 *
 * Real usages in the app (useConfigEditor.js, store/modules/game.js)
 * call it with the prefixes: 'correction', 'tournament-correction',
 * 'manual-sync', 'settle', 'settle-tournament' and store the token in
 * historyProjection.requestToken alongside a requestedAt timestamp.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSyncRequestToken } from '../src/utils/historyProjection.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createSyncRequestToken', () => {
  it('uses the "sync" prefix by default', () => {
    const token = createSyncRequestToken();
    expect(token).toMatch(/^sync-\d+-[a-z0-9]{1,8}$/);
  });

  it('has the shape <prefix>-<timestamp>-<random>', () => {
    const token = createSyncRequestToken('settle');
    const parts = token.split('-');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('settle');
    expect(parts[1]).toMatch(/^\d+$/);
    expect(parts[2]).toMatch(/^[a-z0-9]{1,8}$/);
  });

  it('supports every prefix used by the app, including dashed ones', () => {
    const prefixes = [
      'correction',
      'tournament-correction',
      'manual-sync',
      'settle',
      'settle-tournament',
    ];
    for (const prefix of prefixes) {
      const token = createSyncRequestToken(prefix);
      expect(token.startsWith(`${prefix}-`)).toBe(true);
      // After the prefix: a millisecond timestamp, a dash, then base36 randomness.
      const rest = token.slice(prefix.length + 1);
      expect(rest).toMatch(/^\d+-[a-z0-9]{1,8}$/);
    }
  });

  it('embeds the current Date.now() timestamp', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1750000000000);
    const token = createSyncRequestToken('settle');
    expect(token.split('-')[1]).toBe('1750000000000');
  });

  it('timestamp segment is close to real time when not mocked', () => {
    const before = Date.now();
    const token = createSyncRequestToken();
    const after = Date.now();
    const ts = Number(token.split('-')[1]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('generates distinct tokens even within the same millisecond', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1750000000000);
    const tokens = new Set(Array.from({ length: 200 }, () => createSyncRequestToken()));
    expect(tokens.size).toBe(200);
  });

  it('random segment is derived from Math.random in base36', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const token = createSyncRequestToken('sync');
    // (0.5).toString(36) === '0.i' → slice(2, 10) === 'i'
    expect(token.split('-')[2]).toBe('i');
  });

  it('accepts an empty prefix (token then starts with a dash)', () => {
    const token = createSyncRequestToken('');
    expect(token).toMatch(/^-\d+-[a-z0-9]{1,8}$/);
  });
});
