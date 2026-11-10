/**
 * Tests for CashTableEditView's settlement-correction logic and
 * useTablePermissions.
 *
 * All tests use pure extracted logic — no Firebase or Vue dependencies required.
 */

import { describe, it, expect } from 'vitest';

// ── Extracted logic from useTablePermissions ────────────────────────────────

/**
 * Pure canEdit check mirroring the composable's logic.
 * Admin check is omitted here (it's covered by isAdmin.value = true path).
 */
function canEdit(item, currentUid) {
  if (!currentUid) return false;
  return !!item?.hostUid && item.hostUid === currentUid;
}

// ── Extracted logic from CashTableEditView ──────────────────────────────────

function toBuyInChips(units, baseBuyIn) {
  return Math.round((Number(units) || 0) * baseBuyIn);
}

function buildCorrectedPlayers(players, rows, baseBuyIn) {
  return rows.map((row, index) => ({
    ...players[index],
    name: row.name.trim(),
    buyIn: toBuyInChips(row.buyInUnits, baseBuyIn),
    stack: Math.round(Number(row.stack) || 0),
  }));
}

function buildCashSettlement(players) {
  return players.map((player) => ({
    odId: player.uid || null,
    name: player.name,
    buyIn: player.buyIn,
    stack: player.stack || 0,
    profit: (player.stack || 0) - player.buyIn,
  }));
}

function buildCorrectedCashRecord(existingRecord, player, gameId, gameData, exchangeRate, settlement, nowMs) {
  const recordTimestamp = existingRecord?.createdAt || gameData.createdAt || nowMs;

  return {
    ...existingRecord,
    date: existingRecord?.date || new Date(recordTimestamp).toISOString(),
    createdAt: recordTimestamp,
    profit: (player.stack || 0) - player.buyIn,
    rate: exchangeRate,
    gameName: gameData.name,
    gameId,
    type: gameData.type || existingRecord?.type || 'live',
    settlement,
    lastCorrectedAt: nowMs,
    lastCorrectedBy: 'editor-1',
    lastCorrectedByName: 'Editor',
  };
}

function replaceHistoryRecord(history, gameId, correctedRecord) {
  let replaced = false;
  const nextHistory = history.map((record) => {
    if (record.gameId !== gameId) return record;
    replaced = true;
    return correctedRecord;
  });

  if (!replaced) {
    nextHistory.push(correctedRecord);
  }

  return nextHistory;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useTablePermissions – canEdit', () => {
  const uid = 'user-123';

  it('returns false when currentUid is null', () => {
    expect(canEdit({ hostUid: uid }, null)).toBe(false);
  });

  it('allows edit when item.hostUid matches', () => {
    expect(canEdit({ hostUid: uid }, uid)).toBe(true);
  });

  it('denies edit when hostUid does not match', () => {
    expect(canEdit({ hostUid: 'other' }, uid)).toBe(false);
  });

  it('denies edit when item has no host info', () => {
    expect(canEdit({}, uid)).toBe(false);
    expect(canEdit(null, uid)).toBe(false);
    expect(canEdit(undefined, uid)).toBe(false);
  });
});

describe('completed cash settlement correction helpers', () => {
  it('converts buy-in units back to chip amounts and preserves player fields', () => {
    const players = [{ uid: 'u1', name: 'Alice', role: 'host' }];
    const rows = [{ name: 'Alice A', buyInUnits: 2.5, stack: 32000 }];
    const corrected = buildCorrectedPlayers(players, rows, 10000);

    expect(corrected).toEqual([
      { uid: 'u1', name: 'Alice A', role: 'host', buyIn: 25000, stack: 32000 },
    ]);
  });

  it('builds settlement rows with corrected chip profit', () => {
    const settlement = buildCashSettlement([
      { uid: 'u1', name: 'Alice', buyIn: 20000, stack: 24000 },
      { uid: null, name: 'Bob', buyIn: 15000, stack: 11000 },
    ]);

    expect(settlement).toEqual([
      { odId: 'u1', name: 'Alice', buyIn: 20000, stack: 24000, profit: 4000 },
      { odId: null, name: 'Bob', buyIn: 15000, stack: 11000, profit: -4000 },
    ]);
  });

  it('preserves original history timestamp while updating rate and settlement', () => {
    const existing = {
      createdAt: 1710000000000,
      date: '2024-03-09T00:00:00.000Z',
      profit: -1000,
      rate: 50,
      settlement: [],
    };
    const player = { uid: 'u1', name: 'Alice', buyIn: 20000, stack: 24000 };
    const settlement = buildCashSettlement([player]);

    const next = buildCorrectedCashRecord(
      existing,
      player,
      'game-1',
      { name: 'Friday Cash', type: 'live', createdAt: 1700000000000 },
      100,
      settlement,
      1720000000000
    );

    expect(next.createdAt).toBe(1710000000000);
    expect(next.date).toBe('2024-03-09T00:00:00.000Z');
    expect(next.rate).toBe(100);
    expect(next.profit).toBe(4000);
    expect(next.settlement).toEqual(settlement);
    expect(next.lastCorrectedAt).toBe(1720000000000);
  });

  it('replaces matching history record and appends when missing', () => {
    const oldHistory = [
      { gameId: 'game-1', rate: 50 },
      { gameId: 'game-2', rate: 20 },
    ];
    const corrected = { gameId: 'game-1', rate: 100 };

    expect(replaceHistoryRecord(oldHistory, 'game-1', corrected)).toEqual([
      { gameId: 'game-1', rate: 100 },
      { gameId: 'game-2', rate: 20 },
    ]);

    expect(replaceHistoryRecord([{ gameId: 'game-2', rate: 20 }], 'game-1', corrected)).toEqual([
      { gameId: 'game-2', rate: 20 },
      { gameId: 'game-1', rate: 100 },
    ]);
  });
});
