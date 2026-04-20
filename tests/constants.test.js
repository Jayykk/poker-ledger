/**
 * Constants Test Suite
 * Ensures all tournament/time-bank constants are defined,
 * have valid types and sensible ranges.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TOURNAMENT_LEVEL_DURATION,
  DEFAULT_STARTING_CHIPS,
  DEFAULT_REENTRY_LEVEL,
  DEFAULT_TIME_BANK_SECONDS,
  TIME_BANK_PRESETS,
  TIMER_WARNING_THRESHOLD,
  TIMER_DANGER_THRESHOLD,
  TIMER_CRITICAL_THRESHOLD,
  GAME_TYPE,
} from '../src/utils/constants.js';

describe('Tournament constants', () => {
  it('DEFAULT_TOURNAMENT_LEVEL_DURATION should be a positive number', () => {
    expect(typeof DEFAULT_TOURNAMENT_LEVEL_DURATION).toBe('number');
    expect(DEFAULT_TOURNAMENT_LEVEL_DURATION).toBeGreaterThan(0);
  });

  it('DEFAULT_STARTING_CHIPS should be a positive integer', () => {
    expect(typeof DEFAULT_STARTING_CHIPS).toBe('number');
    expect(DEFAULT_STARTING_CHIPS).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_STARTING_CHIPS)).toBe(true);
  });

  it('DEFAULT_REENTRY_LEVEL should be a positive integer', () => {
    expect(typeof DEFAULT_REENTRY_LEVEL).toBe('number');
    expect(DEFAULT_REENTRY_LEVEL).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_REENTRY_LEVEL)).toBe(true);
  });
});

describe('Time Bank constants', () => {
  it('DEFAULT_TIME_BANK_SECONDS should be a positive number', () => {
    expect(typeof DEFAULT_TIME_BANK_SECONDS).toBe('number');
    expect(DEFAULT_TIME_BANK_SECONDS).toBeGreaterThan(0);
  });

  it('TIME_BANK_PRESETS should be a non-empty sorted array of positive numbers', () => {
    expect(Array.isArray(TIME_BANK_PRESETS)).toBe(true);
    expect(TIME_BANK_PRESETS.length).toBeGreaterThan(0);
    for (const p of TIME_BANK_PRESETS) {
      expect(p).toBeGreaterThan(0);
    }
    // Should be sorted ascending
    for (let i = 1; i < TIME_BANK_PRESETS.length; i++) {
      expect(TIME_BANK_PRESETS[i]).toBeGreaterThan(TIME_BANK_PRESETS[i - 1]);
    }
  });

  it('DEFAULT_TIME_BANK_SECONDS should be one of the presets', () => {
    expect(TIME_BANK_PRESETS).toContain(DEFAULT_TIME_BANK_SECONDS);
  });
});

describe('Timer threshold constants', () => {
  it('should be positive numbers', () => {
    expect(TIMER_WARNING_THRESHOLD).toBeGreaterThan(0);
    expect(TIMER_DANGER_THRESHOLD).toBeGreaterThan(0);
    expect(TIMER_CRITICAL_THRESHOLD).toBeGreaterThan(0);
  });

  it('should be in descending order: warning > danger > critical', () => {
    expect(TIMER_WARNING_THRESHOLD).toBeGreaterThan(TIMER_DANGER_THRESHOLD);
    expect(TIMER_DANGER_THRESHOLD).toBeGreaterThan(TIMER_CRITICAL_THRESHOLD);
  });
});

describe('GAME_TYPE', () => {
  it('should have TOURNAMENT type defined', () => {
    expect(GAME_TYPE.TOURNAMENT).toBe('tournament');
  });

  it('should have LIVE type defined', () => {
    expect(GAME_TYPE.LIVE).toBe('live');
  });

  it('should have ONLINE type defined', () => {
    expect(GAME_TYPE.ONLINE).toBe('online');
  });

  it('all types should be unique', () => {
    const values = Object.values(GAME_TYPE);
    expect(new Set(values).size).toBe(values.length);
  });
});
