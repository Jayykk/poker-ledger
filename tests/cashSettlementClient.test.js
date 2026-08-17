import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cashSettlementErrorKey } from '../src/utils/cashSettlementErrors.js';
import { buildCashSettlementReport } from '../src/utils/cashSettlementFlow.js';

describe('cash settlement client contract', () => {
  const storeSource = readFileSync(
    resolve(__dirname, '../src/store/modules/game.js'), 'utf8',
  );
  const settleStart = storeSource.indexOf('const settleGame = async');
  const settleEnd = storeSource.indexOf('const closeGame = async', settleStart);
  const settleGameSource = storeSource.slice(settleStart, settleEnd);
  const viewSource = readFileSync(
    resolve(__dirname, '../src/views/GameView.vue'), 'utf8',
  );
  const handleStart = viewSource.indexOf('const handleSettle = async');
  const handleEnd = viewSource.indexOf('const handleCloseGame = async', handleStart);
  const handleSettleSource = viewSource.slice(handleStart, handleEnd);

  it('uses the cash settlement callable instead of a direct Firestore transaction', () => {
    expect(settleGameSource).toContain("httpsCallable(functions, 'settleCashGame')");
    expect(settleGameSource).not.toContain('runTransaction');
  });

  it.each([
    ['functions/permission-denied', 'game.settlementPermissionDenied'],
    ['functions/failed-precondition', 'game.settlementStateChanged'],
    ['functions/invalid-argument', 'game.settlementRateInvalid'],
    ['functions/unavailable', 'game.settlementUnavailable'],
  ])('maps %s to %s', (code, expected) => {
    expect(cashSettlementErrorKey({ code })).toBe(expected);
  });

  it('builds the LINE report from the callable response', () => {
    expect(buildCashSettlementReport({
      gameId: 'game-1',
      gameName: 'Friday Cash',
      rate: 100,
      settlement: [{ name: 'Alice', buyIn: 1000, profit: 500 }],
    })).toEqual({
      gameId: 'game-1',
      gameName: 'Friday Cash',
      rate: 100,
      players: [{ name: 'Alice', buyIn: 1000, profit: 500 }],
    });
  });

  it('awaits LINE delivery without blocking completion on history projection', () => {
    expect(handleSettleSource).toContain('await sendSettlementMessage');
    expect(handleSettleSource).toContain('void userStore.waitForHistorySync');
    expect(handleSettleSource).not.toContain('await userStore.waitForHistorySync');
  });
});