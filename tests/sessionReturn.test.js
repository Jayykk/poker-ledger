/**
 * Unit tests for src/utils/sessionReturn.js — the session-return breadcrumb.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { markSessionReturn, consumeSessionReturn } from '../src/utils/sessionReturn.js';

beforeEach(() => {
  sessionStorage.clear();
});

describe('sessionReturn', () => {
  it('returns the session path when the gameId matches, and consumes the marker', () => {
    markSessionReturn('s1', 'g1');
    expect(consumeSessionReturn('g1')).toBe('/session/s1');
    // consumed — a second read is null
    expect(consumeSessionReturn('g1')).toBe(null);
  });

  it('returns null for a different gameId and leaves the marker intact', () => {
    markSessionReturn('s1', 'g1');
    expect(consumeSessionReturn('other')).toBe(null);
    expect(consumeSessionReturn('g1')).toBe('/session/s1');
  });

  it('returns null when there is no marker', () => {
    expect(consumeSessionReturn('g1')).toBe(null);
  });

  it('ignores incomplete mark calls', () => {
    markSessionReturn('', 'g1');
    markSessionReturn('s1', '');
    expect(consumeSessionReturn('g1')).toBe(null);
  });
});
