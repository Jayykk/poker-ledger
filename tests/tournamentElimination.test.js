import { describe, it, expect } from 'vitest';
import {
  applyElimination,
  crownSurvivors,
  buildEliminationRestore,
  buildReentryRestore,
  buildReopenedSessionUpdates,
  revertElimination,
  revertReentry,
  latestStatusTxIds,
  findTxTarget,
} from '../src/utils/tournamentElimination.js';

const makePlayers = () => [
  { id: 'a', name: 'A', buyIn: 1000, eliminated: false, placement: null },
  { id: 'b', name: 'B', buyIn: 1000, eliminated: false, placement: null },
  { id: 'c', name: 'C', buyIn: 1000, eliminated: false, placement: null },
  { id: 'd', name: 'D', buyIn: 1000, eliminated: true, eliminatedAt: 100, placement: 4 },
];

describe('applyElimination', () => {
  it('assigns placement = alive count and decrements aliveAfter', () => {
    const { players, placement, aliveAfter } = applyElimination(makePlayers(), 'c', 500);
    expect(placement).toBe(3);
    expect(aliveAfter).toBe(2);
    const c = players.find((p) => p.id === 'c');
    expect(c).toMatchObject({ eliminated: true, eliminatedAt: 500, placement: 3 });
  });

  it('rejects eliminating an already eliminated player or the last survivor', () => {
    expect(() => applyElimination(makePlayers(), 'd')).toThrow(/already eliminated/);
    const oneLeft = [
      { id: 'a', eliminated: false },
      { id: 'b', eliminated: true, placement: 2 },
    ];
    expect(() => applyElimination(oneLeft, 'a')).toThrow(/last remaining/);
  });
});

describe('crownSurvivors', () => {
  it('gives placement 1 to every non-eliminated player only', () => {
    const crowned = crownSurvivors(makePlayers());
    expect(crowned.filter((p) => !p.eliminated).every((p) => p.placement === 1)).toBe(true);
    expect(crowned.find((p) => p.id === 'd').placement).toBe(4);
  });
});

describe('revertElimination', () => {
  it('returns the player to play and clears placement', () => {
    const { players: afterElim } = applyElimination(makePlayers(), 'c', 500);
    const tx = { targetId: 'c', restore: buildEliminationRestore({ placement: 3, eliminatedAt: 500 }) };
    const { players, aliveAfter, reopensTournament } = revertElimination(afterElim, tx);
    expect(players.find((p) => p.id === 'c')).toMatchObject({ eliminated: false, eliminatedAt: null, placement: null });
    expect(aliveAfter).toBe(3);
    expect(reopensTournament).toBe(false);
    // Other eliminated players are untouched
    expect(players.find((p) => p.id === 'd').placement).toBe(4);
  });

  it('also clears the provisional champion when the elimination had ended the tournament', () => {
    const twoLeft = [
      { id: 'a', eliminated: false, placement: null },
      { id: 'b', eliminated: false, placement: null },
    ];
    let { players } = applyElimination(twoLeft, 'b', 900);
    players = crownSurvivors(players);
    expect(players.find((p) => p.id === 'a').placement).toBe(1);

    const tx = {
      targetId: 'b',
      restore: buildEliminationRestore({
        placement: 2,
        eliminatedAt: 900,
        endedTournament: true,
        sessionState: { status: 'running', timeLeftSeconds: 321, currentLevelIndex: 4 },
      }),
    };
    const result = revertElimination(players, tx);
    expect(result.reopensTournament).toBe(true);
    expect(result.aliveAfter).toBe(2);
    expect(result.players.find((p) => p.id === 'a').placement).toBeNull();
    expect(result.players.find((p) => p.id === 'b')).toMatchObject({ eliminated: false, placement: null });
  });

  it('refuses when the player is not currently eliminated (already re-entered)', () => {
    expect(() => revertElimination(makePlayers(), { targetId: 'a' })).toThrow(/not eliminated/);
  });

  it('falls back to uid / name matching for legacy records', () => {
    const players = [{ id: 'x', uid: 'u1', name: 'X', eliminated: true, placement: 2 }, { id: 'y', eliminated: false }];
    expect(findTxTarget(players, { targetUid: 'u1' })?.id).toBe('x');
    expect(findTxTarget(players, { targetName: 'X' })?.id).toBe('x');
    const { players: reverted } = revertElimination(players, { targetName: 'X' });
    expect(reverted.find((p) => p.id === 'x').eliminated).toBe(false);
  });
});

describe('buildReopenedSessionUpdates', () => {
  it('reopens a previously running clock as paused with its remaining time', () => {
    const updates = buildReopenedSessionUpdates({ status: 'running', timeLeftSeconds: 321 });
    expect(updates).toEqual({ 'state.status': 'paused', 'state.timeLeftSeconds': 321, 'state.lastTickAt': null });
  });

  it('keeps a paused clock paused and never leaves status as ended', () => {
    expect(buildReopenedSessionUpdates({ status: 'paused', timeLeftSeconds: 10 })['state.status']).toBe('paused');
    expect(buildReopenedSessionUpdates({ status: 'ended', timeLeftSeconds: 0 })['state.status']).toBe('paused');
    expect(buildReopenedSessionUpdates(null)['state.status']).toBe('paused');
  });
});

describe('revertReentry', () => {
  it('refunds the buy-in and restores the snapshotted eliminated state', () => {
    const before = makePlayers();
    const d = before.find((p) => p.id === 'd');
    const restore = buildReentryRestore(d);
    expect(restore).toEqual({ placement: 4, eliminatedAt: 100 });

    // Simulate the re-entry
    const reentered = before.map((p) => (
      p.id === 'd' ? { ...p, eliminated: false, eliminatedAt: null, placement: null, buyIn: 2000 } : p
    ));
    const tx = { targetId: 'd', amount: 1000, restore };
    const { players, aliveAfter, refunded } = revertReentry(reentered, tx, 999);
    expect(refunded).toBe(1000);
    expect(aliveAfter).toBe(3);
    expect(players.find((p) => p.id === 'd')).toMatchObject({
      buyIn: 1000, eliminated: true, eliminatedAt: 100, placement: 4,
    });
  });

  it('falls back to "eliminated now, placement = alive count" for records without a snapshot', () => {
    const players = makePlayers().map((p) => (p.id === 'd' ? { ...p, eliminated: false, placement: null, eliminatedAt: null, buyIn: 2000 } : p));
    const { players: reverted } = revertReentry(players, { targetId: 'd', amount: 1000 }, 777);
    expect(reverted.find((p) => p.id === 'd')).toMatchObject({ eliminated: true, eliminatedAt: 777, placement: 4, buyIn: 1000 });
  });

  it('never lets buyIn go negative and refuses if the player is already eliminated', () => {
    const players = makePlayers();
    const { players: reverted } = revertReentry(players, { targetId: 'a', amount: 5000 });
    expect(reverted.find((p) => p.id === 'a').buyIn).toBe(0);
    expect(() => revertReentry(players, { targetId: 'd', amount: 1000 })).toThrow(/already eliminated/);
  });
});

describe('latestStatusTxIds', () => {
  it('only allows the newest active eliminate/reentry per player to be undone', () => {
    const txs = [
      { txId: 't1', type: 'eliminate', status: 'active', targetId: 'a', timestamp: 100 },
      { txId: 't2', type: 'reentry', status: 'active', targetId: 'a', timestamp: 200 },
      { txId: 't3', type: 'eliminate', status: 'active', targetId: 'a', timestamp: 300 },
      { txId: 't4', type: 'eliminate', status: 'undone', targetId: 'a', timestamp: 400 },
      { txId: 't5', type: 'eliminate', status: 'active', targetId: 'b', timestamp: 50 },
      { txId: 't6', type: 'buy_in', status: 'active', targetId: 'b', timestamp: 500 },
    ];
    const ids = latestStatusTxIds(txs);
    expect(ids.has('t3')).toBe(true);
    expect(ids.has('t5')).toBe(true);
    expect(ids.has('t1')).toBe(false);
    expect(ids.has('t2')).toBe(false);
    expect(ids.has('t4')).toBe(false);
    expect(ids.has('t6')).toBe(false);
  });
});
