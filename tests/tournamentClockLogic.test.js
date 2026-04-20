/**
 * Tournament Clock Logic Tests
 * Tests the pure computational logic from the composable
 * by simulating the state without Firebase dependencies.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STARTING_CHIPS,
  DEFAULT_TOURNAMENT_LEVEL_DURATION,
  TIMER_WARNING_THRESHOLD,
  TIMER_DANGER_THRESHOLD,
  TIMER_CRITICAL_THRESHOLD,
} from '../src/utils/constants.js';
import { TOURNAMENT_TEMPLATES } from '../src/utils/tournamentTemplates.js';

/**
 * Extracted pure logic from useTournamentClock.
 * These mirror the computed properties to allow unit testing
 * without Vue reactivity or Firebase.
 */

function computeCurrentLevel(levels, currentLevelIndex) {
  const entry = levels[currentLevelIndex] || null;
  return entry?.isBreak ? 0 : (entry?.level ?? 0);
}

function computeCurrentBlinds(levels, currentLevelIndex) {
  const entry = levels[currentLevelIndex] || null;
  if (!entry || entry.isBreak) return { small: 0, big: 0, ante: 0 };
  return { small: entry.small, big: entry.big, ante: entry.ante || 0 };
}

function computeIsBreak(levels, currentLevelIndex) {
  const entry = levels[currentLevelIndex] || null;
  return entry?.isBreak === true;
}

function computeNextPlayLevelEntry(levels, currentLevelIndex) {
  for (let i = currentLevelIndex + 1; i < levels.length; i++) {
    if (!levels[i].isBreak) return levels[i];
  }
  return null;
}

function computeChipsInPlay(playersRegistered, reentries, startingChips) {
  return (playersRegistered + reentries) * (startingChips || 0);
}

function computeAverageStack(chipsInPlay, playersRemaining) {
  if (playersRemaining <= 0) return 0;
  return Math.round(chipsInPlay / playersRemaining);
}

function computePrizePool(playersRegistered, reentries, buyIn) {
  return (playersRegistered + reentries) * (buyIn || 0);
}

function computePayouts(payoutRatios, prizePool) {
  return (payoutRatios || []).map((r) => ({
    place: r.place,
    amount: Math.round(prizePool * r.percentage / 100),
  }));
}

function formatTime(t) {
  t = Math.max(0, t);
  const minutes = Math.floor(t / 60);
  const seconds = t % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function computeTimeToBreak(levels, currentLevelIndex, localTimeLeft) {
  const isBreak = levels[currentLevelIndex]?.isBreak === true;
  if (isBreak) return null;
  const hasBreakAhead = levels.slice(currentLevelIndex + 1).some((l) => l.isBreak);
  if (!hasBreakAhead) return null;
  let seconds = localTimeLeft;
  for (let i = currentLevelIndex + 1; i < levels.length; i++) {
    if (levels[i].isBreak) break;
    seconds += (levels[i].duration || 0) * 60;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function computeTimerColorClass(timeLeft, status) {
  if (status !== 'running') return '';
  if (timeLeft <= TIMER_CRITICAL_THRESHOLD) return 'timer-critical';
  if (timeLeft <= TIMER_DANGER_THRESHOLD) return 'timer-danger';
  if (timeLeft <= TIMER_WARNING_THRESHOLD) return 'timer-warning';
  return '';
}

// ── Tests ─────────────────────────────────────────────

describe('computeCurrentLevel', () => {
  const levels = TOURNAMENT_TEMPLATES[0].levels;

  it('should return level number for play levels', () => {
    expect(computeCurrentLevel(levels, 0)).toBe(1);
    expect(computeCurrentLevel(levels, 1)).toBe(2);
  });

  it('should return 0 for break levels', () => {
    const breakIdx = levels.findIndex((l) => l.isBreak);
    expect(computeCurrentLevel(levels, breakIdx)).toBe(0);
  });

  it('should return 0 for out-of-bounds index', () => {
    expect(computeCurrentLevel(levels, 999)).toBe(0);
    expect(computeCurrentLevel(levels, -1)).toBe(0);
  });

  it('should return 0 for empty levels', () => {
    expect(computeCurrentLevel([], 0)).toBe(0);
  });
});

describe('computeCurrentBlinds', () => {
  const levels = TOURNAMENT_TEMPLATES[0].levels;

  it('should return correct blinds for play level', () => {
    const blinds = computeCurrentBlinds(levels, 0);
    expect(blinds.small).toBe(levels[0].small);
    expect(blinds.big).toBe(levels[0].big);
  });

  it('should return zeros for break level', () => {
    const breakIdx = levels.findIndex((l) => l.isBreak);
    const blinds = computeCurrentBlinds(levels, breakIdx);
    expect(blinds.small).toBe(0);
    expect(blinds.big).toBe(0);
    expect(blinds.ante).toBe(0);
  });

  it('should return zeros for out-of-bounds', () => {
    const blinds = computeCurrentBlinds(levels, 999);
    expect(blinds.small).toBe(0);
    expect(blinds.big).toBe(0);
  });

  it('should default ante to 0 if missing', () => {
    const levelsNoAnte = [{ level: 1, small: 10, big: 20, isBreak: false }];
    const blinds = computeCurrentBlinds(levelsNoAnte, 0);
    expect(blinds.ante).toBe(0);
  });
});

describe('computeIsBreak', () => {
  it('should return true for break entry', () => {
    const levels = [{ isBreak: true }, { isBreak: false }];
    expect(computeIsBreak(levels, 0)).toBe(true);
  });

  it('should return false for play entry', () => {
    const levels = [{ isBreak: true }, { isBreak: false }];
    expect(computeIsBreak(levels, 1)).toBe(false);
  });

  it('should return false for out-of-bounds', () => {
    expect(computeIsBreak([], 0)).toBe(false);
  });
});

describe('computeNextPlayLevelEntry', () => {
  it('should skip breaks to find next play level', () => {
    const levels = [
      { level: 1, isBreak: false },
      { level: 0, isBreak: true },
      { level: 2, isBreak: false },
    ];
    const next = computeNextPlayLevelEntry(levels, 0);
    expect(next.level).toBe(2);
  });

  it('should return null when no play level ahead', () => {
    const levels = [
      { level: 1, isBreak: false },
      { level: 0, isBreak: true },
    ];
    const next = computeNextPlayLevelEntry(levels, 0);
    expect(next).toBeNull();
  });

  it('should return null at last index', () => {
    const levels = [{ level: 1, isBreak: false }];
    const next = computeNextPlayLevelEntry(levels, 0);
    expect(next).toBeNull();
  });
});

describe('computeChipsInPlay', () => {
  it('should calculate correctly', () => {
    expect(computeChipsInPlay(10, 2, 25000)).toBe(300000);
  });

  it('should handle zero players', () => {
    expect(computeChipsInPlay(0, 0, 25000)).toBe(0);
  });

  it('should handle zero chips', () => {
    expect(computeChipsInPlay(10, 0, 0)).toBe(0);
  });
});

describe('computeAverageStack', () => {
  it('should calculate correctly', () => {
    expect(computeAverageStack(300000, 10)).toBe(30000);
  });

  it('should return 0 when no remaining players', () => {
    expect(computeAverageStack(300000, 0)).toBe(0);
    expect(computeAverageStack(300000, -1)).toBe(0);
  });

  it('should round to nearest integer', () => {
    expect(computeAverageStack(100, 3)).toBe(33); // 33.33 → 33
  });
});

describe('computePrizePool', () => {
  it('should calculate buy-in × (registered + reentries)', () => {
    expect(computePrizePool(8, 2, 500)).toBe(5000);
  });

  it('should return 0 with no buy-in', () => {
    expect(computePrizePool(10, 0, 0)).toBe(0);
  });
});

describe('computePayouts', () => {
  it('should distribute prize pool by percentages', () => {
    const ratios = [
      { place: 1, percentage: 50 },
      { place: 2, percentage: 30 },
      { place: 3, percentage: 20 },
    ];
    const payouts = computePayouts(ratios, 10000);
    expect(payouts[0].amount).toBe(5000);
    expect(payouts[1].amount).toBe(3000);
    expect(payouts[2].amount).toBe(2000);
  });

  it('payouts should sum to prize pool (when no rounding error)', () => {
    const ratios = [
      { place: 1, percentage: 50 },
      { place: 2, percentage: 30 },
      { place: 3, percentage: 20 },
    ];
    const payouts = computePayouts(ratios, 10000);
    const total = payouts.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(10000);
  });

  it('should handle empty ratios', () => {
    expect(computePayouts([], 10000)).toEqual([]);
    expect(computePayouts(null, 10000)).toEqual([]);
  });

  it('should handle zero pool', () => {
    const ratios = [{ place: 1, percentage: 100 }];
    const payouts = computePayouts(ratios, 0);
    expect(payouts[0].amount).toBe(0);
  });

  it('should round amounts', () => {
    const ratios = [
      { place: 1, percentage: 45 },
      { place: 2, percentage: 27 },
      { place: 3, percentage: 18 },
      { place: 4, percentage: 10 },
    ];
    const payouts = computePayouts(ratios, 1500);
    // 45% of 1500 = 675, 27% = 405, 18% = 270, 10% = 150
    expect(payouts[0].amount).toBe(675);
    expect(payouts[1].amount).toBe(405);
    expect(payouts[2].amount).toBe(270);
    expect(payouts[3].amount).toBe(150);
  });
});

describe('formatTime', () => {
  it('should format 0 as 00:00', () => {
    expect(formatTime(0)).toBe('00:00');
  });

  it('should format negative as 00:00 (clamp)', () => {
    expect(formatTime(-5)).toBe('00:00');
  });

  it('should format seconds correctly', () => {
    expect(formatTime(30)).toBe('00:30');
    expect(formatTime(59)).toBe('00:59');
  });

  it('should format minutes and seconds', () => {
    expect(formatTime(60)).toBe('01:00');
    expect(formatTime(90)).toBe('01:30');
    expect(formatTime(600)).toBe('10:00');
    expect(formatTime(905)).toBe('15:05');
  });

  it('should pad single digits', () => {
    expect(formatTime(5)).toBe('00:05');
    expect(formatTime(65)).toBe('01:05');
  });
});

describe('computeTimeToBreak', () => {
  it('should return null if currently on break', () => {
    const levels = [
      { isBreak: true, duration: 5 },
      { isBreak: false, duration: 15, level: 1 },
    ];
    expect(computeTimeToBreak(levels, 0, 300)).toBeNull();
  });

  it('should return null if no break ahead', () => {
    const levels = [
      { isBreak: false, duration: 15, level: 1 },
      { isBreak: false, duration: 15, level: 2 },
    ];
    expect(computeTimeToBreak(levels, 0, 600)).toBeNull();
  });

  it('should calculate time to next break', () => {
    const levels = [
      { isBreak: false, duration: 15, level: 1 },
      { isBreak: false, duration: 15, level: 2 },
      { isBreak: true, duration: 10 },
    ];
    // 300 seconds left in current level + 15*60 for level 2 = 300 + 900 = 1200
    const result = computeTimeToBreak(levels, 0, 300);
    expect(result).toBe('20:00'); // 1200 seconds = 20:00
  });
});

describe('computeTimerColorClass', () => {
  it('should return empty when not running', () => {
    expect(computeTimerColorClass(5, 'paused')).toBe('');
    expect(computeTimerColorClass(5, 'waiting')).toBe('');
    expect(computeTimerColorClass(5, 'ended')).toBe('');
  });

  it('should return timer-critical when <= critical threshold', () => {
    expect(computeTimerColorClass(TIMER_CRITICAL_THRESHOLD, 'running')).toBe('timer-critical');
    expect(computeTimerColorClass(1, 'running')).toBe('timer-critical');
    expect(computeTimerColorClass(0, 'running')).toBe('timer-critical');
  });

  it('should return timer-danger between critical and danger thresholds', () => {
    expect(computeTimerColorClass(TIMER_CRITICAL_THRESHOLD + 1, 'running')).toBe('timer-danger');
    expect(computeTimerColorClass(TIMER_DANGER_THRESHOLD, 'running')).toBe('timer-danger');
  });

  it('should return timer-warning between danger and warning thresholds', () => {
    expect(computeTimerColorClass(TIMER_DANGER_THRESHOLD + 1, 'running')).toBe('timer-warning');
    expect(computeTimerColorClass(TIMER_WARNING_THRESHOLD, 'running')).toBe('timer-warning');
  });

  it('should return empty when above warning threshold', () => {
    expect(computeTimerColorClass(TIMER_WARNING_THRESHOLD + 1, 'running')).toBe('');
    expect(computeTimerColorClass(600, 'running')).toBe('');
  });
});

// ── Time Bank Logic Tests ─────────────────────────────

function computeTimeBankPercentage(localTimeLeft, totalSeconds) {
  if (totalSeconds <= 0) return 0;
  return Math.max(0, Math.min(100, (localTimeLeft / totalSeconds) * 100));
}

function computeTimeBankUrgency(percentage) {
  if (percentage > 50) return 'normal';
  if (percentage > 25) return 'warning';
  return 'critical';
}

function formatTimeBankTime(t) {
  t = Math.max(0, t);
  const minutes = Math.floor(t / 60);
  const seconds = t % 60;
  if (minutes > 0) return `${minutes}:${String(seconds).padStart(2, '0')}`;
  return String(seconds);
}

describe('computeTimeBankPercentage', () => {
  it('should return 100 when full', () => {
    expect(computeTimeBankPercentage(30, 30)).toBe(100);
  });

  it('should return 50 at half', () => {
    expect(computeTimeBankPercentage(15, 30)).toBe(50);
  });

  it('should return 0 when expired', () => {
    expect(computeTimeBankPercentage(0, 30)).toBe(0);
  });

  it('should clamp to 0 for negative', () => {
    expect(computeTimeBankPercentage(-5, 30)).toBe(0);
  });

  it('should clamp to 100 for overflow', () => {
    expect(computeTimeBankPercentage(60, 30)).toBe(100);
  });

  it('should handle zero totalSeconds', () => {
    expect(computeTimeBankPercentage(10, 0)).toBe(0);
  });
});

describe('computeTimeBankUrgency', () => {
  it('normal when > 50%', () => {
    expect(computeTimeBankUrgency(100)).toBe('normal');
    expect(computeTimeBankUrgency(51)).toBe('normal');
  });

  it('warning when 25-50%', () => {
    expect(computeTimeBankUrgency(50)).toBe('warning');
    expect(computeTimeBankUrgency(26)).toBe('warning');
  });

  it('critical when <= 25%', () => {
    expect(computeTimeBankUrgency(25)).toBe('critical');
    expect(computeTimeBankUrgency(0)).toBe('critical');
  });
});

describe('formatTimeBankTime', () => {
  it('should show seconds only when < 60', () => {
    expect(formatTimeBankTime(30)).toBe('30');
    expect(formatTimeBankTime(5)).toBe('5');
    expect(formatTimeBankTime(0)).toBe('0');
  });

  it('should show minutes:seconds when >= 60', () => {
    expect(formatTimeBankTime(60)).toBe('1:00');
    expect(formatTimeBankTime(90)).toBe('1:30');
    expect(formatTimeBankTime(125)).toBe('2:05');
  });

  it('should clamp negative to 0', () => {
    expect(formatTimeBankTime(-10)).toBe('0');
  });
});
