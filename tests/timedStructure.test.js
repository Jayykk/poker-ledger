import { describe, it, expect } from 'vitest';
import {
  CLOCK_MODE_TIMED,
  isTimedClock,
  resolveClockPosition,
  effectiveLevelAt,
  secondsToEnd,
  totalStructureSeconds,
  isTimedBuyInClosed,
  formatDuration,
  snapshotStructure,
  withTimedCutoff,
  buildTimedClockConfig,
} from '../src/utils/timedStructure.js';

// 3 × 10-minute levels with a 5-minute break after level 2.
const levels = [
  { level: 1, small: 100, big: 200, ante: 0, duration: 10, isBreak: false },
  { level: 2, small: 200, big: 400, ante: 50, duration: 10, isBreak: false },
  { level: 0, small: 0, big: 0, ante: 0, duration: 5, isBreak: true },
  { level: 3, small: 300, big: 600, ante: 100, duration: 10, isBreak: false },
];
const T0 = 1_700_000_000_000;
const running = (overrides = {}) => ({
  status: 'running', currentLevelIndex: 0, timeLeftSeconds: 600, lastTickAt: T0, ...overrides,
});
const at = (seconds) => T0 + seconds * 1000;

describe('isTimedClock', () => {
  it('only matches the timed mode', () => {
    expect(isTimedClock({ mode: CLOCK_MODE_TIMED })).toBe(true);
    expect(isTimedClock({})).toBe(false);
    expect(isTimedClock(undefined)).toBe(false);
  });
});

describe('resolveClockPosition', () => {
  it('returns the stored position when not running', () => {
    const pos = resolveClockPosition(levels, { status: 'paused', currentLevelIndex: 1, timeLeftSeconds: 42 }, at(9999));
    expect(pos).toEqual({ levelIndex: 1, timeLeftSeconds: 42, ended: false });
  });

  it('reports ended for a stored ended state', () => {
    expect(resolveClockPosition(levels, { status: 'ended' }, at(0)).ended).toBe(true);
  });

  it('counts down inside the current level', () => {
    expect(resolveClockPosition(levels, running(), at(100))).toEqual({ levelIndex: 0, timeLeftSeconds: 500, ended: false });
  });

  it('projects across levels and breaks the host has not persisted', () => {
    // 600 (L1) + 600 (L2) + 120 into the break
    expect(resolveClockPosition(levels, running(), at(1320))).toEqual({ levelIndex: 2, timeLeftSeconds: 180, ended: false });
  });

  it('timed: stops at the end of the last level', () => {
    // total = 600 + 600 + 300 + 600 = 2100
    expect(resolveClockPosition(levels, running(), at(2100), { timed: true }))
      .toEqual({ levelIndex: 3, timeLeftSeconds: 0, ended: true });
    expect(resolveClockPosition(levels, running(), at(99999), { timed: true }).ended).toBe(true);
  });

  it('timed: still running one second before the end', () => {
    expect(resolveClockPosition(levels, running(), at(2099), { timed: true }))
      .toEqual({ levelIndex: 3, timeLeftSeconds: 1, ended: false });
  });

  it('tournament: repeats the last level instead of ending', () => {
    const pos = resolveClockPosition(levels, running(), at(2100 + 30));
    expect(pos).toEqual({ levelIndex: 3, timeLeftSeconds: 570, ended: false });
  });

  it('accepts Firestore Timestamp-like lastTickAt', () => {
    const pos = resolveClockPosition(levels, running({ lastTickAt: { toMillis: () => T0 } }), at(60));
    expect(pos.timeLeftSeconds).toBe(540);
  });
});

describe('effectiveLevelAt', () => {
  it('uses the level just finished during a break', () => {
    expect(effectiveLevelAt(levels, 2)).toBe(2);
    expect(effectiveLevelAt(levels, 3)).toBe(3);
  });

  it('is 0 with no levels', () => {
    expect(effectiveLevelAt([], 0)).toBe(0);
  });
});

describe('secondsToEnd / totalStructureSeconds', () => {
  it('adds every remaining level including breaks', () => {
    expect(secondsToEnd(levels, 0, 600)).toBe(2100);
    expect(secondsToEnd(levels, 2, 60)).toBe(660);
    expect(secondsToEnd(levels, 3, 5)).toBe(5);
  });

  it('totals a whole structure', () => {
    expect(totalStructureSeconds(levels)).toBe(2100);
    expect(totalStructureSeconds([])).toBe(0);
  });
});

describe('isTimedBuyInClosed', () => {
  const session = (state, cutoff = 3) => ({
    config: { mode: CLOCK_MODE_TIMED, levels, reentryUntilLevel: cutoff },
    state,
  });

  it('is open before the cutoff level', () => {
    expect(isTimedBuyInClosed(session(running()), at(700))).toBe(false); // level 2
  });

  it('stays open through the break before the cutoff level', () => {
    expect(isTimedBuyInClosed(session(running()), at(1300))).toBe(false); // break after L2
  });

  it('closes once the cutoff level starts (same >= rule as re-entry)', () => {
    expect(isTimedBuyInClosed(session(running()), at(1500))).toBe(true); // level 3
  });

  it('closes when time is up even without a cutoff', () => {
    expect(isTimedBuyInClosed(session(running(), 0), at(2100))).toBe(true);
    expect(isTimedBuyInClosed(session({ status: 'ended' }, 0), at(0))).toBe(true);
  });

  it('a cutoff of 0 never closes early', () => {
    expect(isTimedBuyInClosed(session(running(), 0), at(1500))).toBe(false);
  });

  it('uses the projected level, not a stale stored one', () => {
    // Stored level 0 (host away), but 1500 s have passed → level 3.
    expect(isTimedBuyInClosed(session(running()), at(1500))).toBe(true);
  });
});

describe('formatDuration', () => {
  it('uses mm:ss under an hour and h:mm:ss above', () => {
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(3600 + 125)).toBe('1:02:05');
    expect(formatDuration(-3)).toBe('00:00');
  });
});

describe('snapshotStructure / buildTimedClockConfig', () => {
  it('keeps only what the clock needs and copies the levels', () => {
    const source = { id: 'p1', name: 'Deep', levels, reentryUntilLevel: 3, payoutRatios: [{ place: 1, percentage: 100 }] };
    const snap = snapshotStructure(source, 'Deep Stack');
    expect(snap).toEqual({ sourceId: 'p1', name: 'Deep Stack', levels, reentryUntilLevel: 3 });
    expect(snap.levels[0]).not.toBe(levels[0]);
    expect(snapshotStructure(null)).toBeNull();
  });

  it('builds a timed clock config with no payouts', () => {
    const cfg = buildTimedClockConfig({ name: 'Friday', buyIn: 1000, structure: snapshotStructure({ levels, reentryUntilLevel: 0 }, 'S') });
    expect(cfg).toMatchObject({ mode: CLOCK_MODE_TIMED, name: 'Friday', buyIn: 1000, reentryUntilLevel: 0, payoutRatios: [], maxReentries: 0 });
    expect(cfg.levels).toHaveLength(4);
  });
});

describe('withTimedCutoff', () => {
  const snap = snapshotStructure({ id: 's', levels, reentryUntilLevel: 3 }, 'S');

  it('keeps the structure cutoff by default', () => {
    expect(withTimedCutoff(snap, false)).toMatchObject({ reentryUntilLevel: 3, sourceCutoff: 3, noCutoff: false });
  });

  it('drops the cutoff when the preset opts out (only time-up closes buy-ins)', () => {
    const noCut = withTimedCutoff(snap, true);
    expect(noCut).toMatchObject({ reentryUntilLevel: 0, sourceCutoff: 3, noCutoff: true });
    expect(isTimedBuyInClosed({ config: { levels, reentryUntilLevel: noCut.reentryUntilLevel }, state: running() }, at(1500))).toBe(false);
  });

  it('can flip a stored no-cutoff snapshot back to the structure level', () => {
    expect(withTimedCutoff(withTimedCutoff(snap, true), false).reentryUntilLevel).toBe(3);
  });

  it('passes null through', () => {
    expect(withTimedCutoff(null, true)).toBeNull();
  });
});
