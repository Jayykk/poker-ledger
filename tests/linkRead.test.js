import { describe, it, expect, vi, afterEach } from 'vitest';
import { isTransientReadError, withTimeoutMs, linkBounceMessageKey } from '../src/utils/linkRead.js';

describe('isTransientReadError', () => {
  it('retries what the network dropped', () => {
    expect(isTransientReadError({ code: 'unavailable', message: 'Failed to get document because the client is offline.' })).toBe(true);
    expect(isTransientReadError({ code: 'deadline-exceeded', message: 'x' })).toBe(true);
    expect(isTransientReadError(new Error('Failed to get document because the client is offline.'))).toBe(true);
  });

  it('does not retry a refused read or a bug', () => {
    expect(isTransientReadError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' })).toBe(false);
    expect(isTransientReadError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(isTransientReadError(null)).toBe(false);
  });
});

describe('withTimeoutMs', () => {
  afterEach(() => vi.useRealTimers());

  it('passes the value through when in time', async () => {
    await expect(withTimeoutMs(Promise.resolve(7), 1000)).resolves.toBe(7);
  });

  it('rejects with the code once the time is up', async () => {
    vi.useFakeTimers();
    const pending = withTimeoutMs(new Promise(() => {}), 8000, 'unavailable');
    vi.advanceTimersByTime(8000);
    await expect(pending).rejects.toMatchObject({ code: 'unavailable' });
  });
});

describe('linkBounceMessageKey', () => {
  it('an ended or missing table says so', () => {
    expect(linkBounceMessageKey({ reason: 'ended' })).toBe('game.linkEnded');
    expect(linkBounceMessageKey({ reason: 'missing' })).toBe('game.linkEnded');
  });

  it('anything else could not open', () => {
    expect(linkBounceMessageKey({ reason: 'network' })).toBe('game.linkUnreachable');
    expect(linkBounceMessageKey({ reason: 'failed' })).toBe('game.linkUnreachable');
    expect(linkBounceMessageKey(undefined)).toBe('game.linkUnreachable');
  });
});
