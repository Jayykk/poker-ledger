/**
 * A page left open across the month change: a 王座框 (and the corner crown)
 * goes at the change, without waiting for a new snapshot.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { computed } from 'vue';
import { crownMonthOf } from '../functions/src/utils/crownRules.js';

// Fake time from before the composable loads: its month clock is an interval
vi.useFakeTimers();
vi.setSystemTime(new Date('2026-11-30T23:58:00+08:00'));
const NOV = crownMonthOf(Date.now());

const gold = Object.fromEntries(['regular', 'host', 'netWin', 'netLoss', 'hotStreak'].map((id) => [id, { tier: 10, at: 1 }]));
const docs = {
  tess: {
    ladder: 2,
    unlocked: gold,
    prefs: { mode: 'off', frame: 'mint' },
    crowns: { crownProfit: NOV },
    display: { familyId: null, tier: null, frame: 'mint', month: NOV },
  },
};

vi.mock('../src/firebase-init.js', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => async () => ({ data: {} }) }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, collection, id) => ({ collection, id }),
  getDoc: async (ref) => ({ exists: () => !!docs[ref.id], data: () => docs[ref.id] }),
  onSnapshot: () => () => {},
}));

const { frameOf, ensureUserTitles, currentCrownMonth } = await import('../src/composables/useUserTitles.js');

describe('王座框 across the month change', () => {
  afterEach(() => vi.useRealTimers());

  it('a mounted avatar drops the crown frame when the month turns', async () => {
    expect(NOV).toBe('2026-11');
    await ensureUserTitles('tess');
    // what a mounted PlayerAvatar holds: a computed over frameOf
    const frame = computed(() => frameOf('tess'));
    const month = computed(() => currentCrownMonth());
    expect(frame.value).toBe('mint');
    expect(month.value).toBe('2026-11');

    // 00:01 on the 1st, Taipei: nothing else changed, only the clock
    vi.advanceTimersByTime(3 * 60 * 1000);
    expect(month.value).toBe('2026-12');
    expect(frame.value).toBe('gold');
  });
});
