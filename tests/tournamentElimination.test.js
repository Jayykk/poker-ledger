import { describe, it, expect } from 'vitest';
import {
  applyElimination,
  applyReentry,
  crownSurvivors,
  buildEliminationRestore,
  buildReentryRestore,
  buildReopenedSessionUpdates,
  revertElimination,
  revertReentry,
  latestStatusTxId,
  findTxTarget,
  currentStatusSeq,
  isLatestStatusEvent,
  NOT_LATEST_STATUS_EVENT,
} from '../src/utils/tournamentElimination.js';

const makePlayers = () => [
  { id: 'a', name: 'A', buyIn: 1000, eliminated: false, placement: null },
  { id: 'b', name: 'B', buyIn: 1000, eliminated: false, placement: null },
  { id: 'c', name: 'C', buyIn: 1000, eliminated: false, placement: null },
  { id: 'd', name: 'D', buyIn: 1000, eliminated: true, eliminatedAt: 100, placement: 4, statusSeq: 1 },
];

/** Build the 'eliminate' tx record the store would write for an applyElimination result. */
const elimTx = (playerId, result, extra = {}) => ({
  targetId: playerId,
  type: 'eliminate',
  restore: buildEliminationRestore({
    placement: result.placement,
    eliminatedAt: 0,
    seq: result.seq,
    prevSeq: result.prevSeq,
    ...extra,
  }),
});

describe('applyElimination', () => {
  it('assigns placement = alive count, decrements aliveAfter and stamps the next global seq', () => {
    const { players, placement, aliveAfter, seq, prevSeq } = applyElimination(makePlayers(), 'c', 500);
    expect(placement).toBe(3);
    expect(aliveAfter).toBe(2);
    expect(seq).toBe(2); // D already holds seq 1
    expect(prevSeq).toBe(0);
    const c = players.find((p) => p.id === 'c');
    expect(c).toMatchObject({ eliminated: true, eliminatedAt: 500, placement: 3, statusSeq: 2 });
    expect(currentStatusSeq(players)).toBe(2);
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

describe('applyReentry', () => {
  it('revives the player, adds the buy-in, stamps the next seq and snapshots the replaced state', () => {
    const { players, aliveAfter, seq, restore } = applyReentry(makePlayers(), 'd', 1000);
    expect(seq).toBe(2);
    expect(aliveAfter).toBe(4);
    expect(restore).toEqual({ placement: 4, eliminatedAt: 100, seq: 2, prevSeq: 1 });
    expect(players.find((p) => p.id === 'd')).toMatchObject({
      eliminated: false, eliminatedAt: null, placement: null, buyIn: 2000, statusSeq: 2,
    });
  });

  it('refuses to re-enter a player who is still alive', () => {
    expect(() => applyReentry(makePlayers(), 'a', 1000)).toThrow(/not eliminated/);
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
  it('returns the player to play, clears placement and rolls the seq back', () => {
    const result = applyElimination(makePlayers(), 'c', 500);
    const { players, aliveAfter, reopensTournament } = revertElimination(result.players, elimTx('c', result));
    expect(players.find((p) => p.id === 'c')).toMatchObject({
      eliminated: false, eliminatedAt: null, placement: null, statusSeq: 0,
    });
    expect(aliveAfter).toBe(3);
    expect(reopensTournament).toBe(false);
    expect(currentStatusSeq(players)).toBe(1); // back to D's seq
    // Other eliminated players are untouched
    expect(players.find((p) => p.id === 'd').placement).toBe(4);
  });

  it('also clears the provisional champion when the elimination had ended the tournament', () => {
    const twoLeft = [
      { id: 'a', eliminated: false, placement: null },
      { id: 'b', eliminated: false, placement: null },
    ];
    const result = applyElimination(twoLeft, 'b', 900);
    const players = crownSurvivors(result.players);
    expect(players.find((p) => p.id === 'a').placement).toBe(1);

    const tx = elimTx('b', result, {
      endedTournament: true,
      sessionState: { status: 'running', timeLeftSeconds: 321, currentLevelIndex: 4 },
    });
    const reverted = revertElimination(players, tx);
    expect(reverted.reopensTournament).toBe(true);
    expect(reverted.aliveAfter).toBe(2);
    expect(reverted.players.find((p) => p.id === 'a').placement).toBeNull();
    expect(reverted.players.find((p) => p.id === 'b')).toMatchObject({ eliminated: false, placement: null });
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

describe('global reverse-order restoration', () => {
  it('only the latest status event of the whole game can be undone, even across players', () => {
    // A out (5th), B out (4th), C out (3rd) → only C's elimination is undoable
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, eliminated: false, placement: null }));
    const rA = applyElimination(five, 'a');
    const rB = applyElimination(rA.players, 'b');
    const rC = applyElimination(rB.players, 'c');
    const players = rC.players;

    expect(isLatestStatusEvent(players, elimTx('a', rA))).toBe(false);
    expect(isLatestStatusEvent(players, elimTx('b', rB))).toBe(false);
    expect(isLatestStatusEvent(players, elimTx('c', rC))).toBe(true);
    expect(() => revertElimination(players, elimTx('a', rA))).toThrow(NOT_LATEST_STATUS_EVENT);

    // Undo C, then B becomes undoable, then A
    const afterC = revertElimination(players, elimTx('c', rC)).players;
    expect(isLatestStatusEvent(afterC, elimTx('b', rB))).toBe(true);
    const afterB = revertElimination(afterC, elimTx('b', rB)).players;
    const afterA = revertElimination(afterB, elimTx('a', rA)).players;
    expect(afterA.every((p) => !p.eliminated && p.placement === null)).toBe(true);
    expect(currentStatusSeq(afterA)).toBe(0);
  });

  it('a re-entry followed by another elimination blocks undoing the re-entry until the later event is undone', () => {
    const three = ['a', 'b', 'c'].map((id) => ({ id, eliminated: false, placement: null, buyIn: 100 }));
    const rA = applyElimination(three, 'a'); // seq 1
    const re = applyReentry(rA.players, 'a', 100); // seq 2
    const reTx = { targetId: 'a', type: 'reentry', amount: 100, restore: re.restore };
    const rB = applyElimination(re.players, 'b'); // seq 3

    expect(() => revertReentry(rB.players, reTx)).toThrow(NOT_LATEST_STATUS_EVENT);

    const afterB = revertElimination(rB.players, elimTx('b', rB)).players;
    const { players: afterRe } = revertReentry(afterB, reTx);
    expect(afterRe.find((p) => p.id === 'a')).toMatchObject({ eliminated: true, placement: 3, buyIn: 100, statusSeq: 1 });
    expect(currentStatusSeq(afterRe)).toBe(1);
    // and finally A's original elimination is undoable again
    expect(isLatestStatusEvent(afterRe, elimTx('a', rA))).toBe(true);
  });

  it('legacy records without a seq are only undoable while no sequenced event exists', () => {
    const legacyTx = { targetId: 'd', type: 'reentry', amount: 1000 };
    const noSeq = makePlayers().map((p) => ({ ...p, statusSeq: 0, eliminated: p.id === 'd' ? false : p.eliminated }));
    expect(isLatestStatusEvent(noSeq, legacyTx)).toBe(true);
    const withSeq = noSeq.map((p) => (p.id === 'a' ? { ...p, statusSeq: 3 } : p));
    expect(isLatestStatusEvent(withSeq, legacyTx)).toBe(false);
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
    expect(buildReentryRestore(d, 2)).toEqual({ placement: 4, eliminatedAt: 100, seq: 2, prevSeq: 1 });

    const re = applyReentry(before, 'd', 1000);
    const tx = { targetId: 'd', amount: 1000, restore: re.restore };
    const { players, aliveAfter, refunded } = revertReentry(re.players, tx, 999);
    expect(refunded).toBe(1000);
    expect(aliveAfter).toBe(3);
    expect(players.find((p) => p.id === 'd')).toMatchObject({
      buyIn: 1000, eliminated: true, eliminatedAt: 100, placement: 4, statusSeq: 1,
    });
  });

  it('falls back to "eliminated now, placement = alive count" for records without a snapshot', () => {
    const players = makePlayers().map((p) => (
      p.id === 'd' ? { ...p, eliminated: false, placement: null, eliminatedAt: null, buyIn: 2000, statusSeq: 0 } : p
    ));
    const { players: reverted } = revertReentry(players, { targetId: 'd', amount: 1000 }, 777);
    expect(reverted.find((p) => p.id === 'd')).toMatchObject({ eliminated: true, eliminatedAt: 777, placement: 4, buyIn: 1000 });
  });

  it('never lets buyIn go negative and refuses if the player is already eliminated', () => {
    const players = makePlayers().map((p) => ({ ...p, statusSeq: 0 }));
    const { players: reverted } = revertReentry(players, { targetId: 'a', amount: 5000 });
    expect(reverted.find((p) => p.id === 'a').buyIn).toBe(0);
    expect(() => revertReentry(players, { targetId: 'd', amount: 1000 })).toThrow(/already eliminated/);
  });
});

describe('latestStatusTxId', () => {
  it('returns the single latest active eliminate/reentry record across the whole game', () => {
    const txs = [
      { txId: 't1', type: 'eliminate', status: 'active', targetId: 'a', timestamp: 100, restore: { seq: 1 } },
      { txId: 't2', type: 'reentry', status: 'active', targetId: 'a', timestamp: 200, restore: { seq: 2 } },
      { txId: 't3', type: 'eliminate', status: 'active', targetId: 'b', timestamp: 300, restore: { seq: 3 } },
      { txId: 't4', type: 'eliminate', status: 'undone', targetId: 'c', timestamp: 400, restore: { seq: 4 } },
      { txId: 't5', type: 'buy_in', status: 'active', targetId: 'b', timestamp: 500 },
    ];
    expect(latestStatusTxId(txs)).toBe('t3');
  });

  it('prefers seq over timestamp and falls back to timestamp for legacy records', () => {
    expect(latestStatusTxId([
      { txId: 'old', type: 'eliminate', status: 'active', timestamp: 900, restore: { seq: 1 } },
      { txId: 'new', type: 'eliminate', status: 'active', timestamp: 100, restore: { seq: 2 } },
    ])).toBe('new');
    expect(latestStatusTxId([
      { txId: 'l1', type: 'reentry', status: 'active', timestamp: 100 },
      { txId: 'l2', type: 'reentry', status: 'active', timestamp: 200 },
    ])).toBe('l2');
    expect(latestStatusTxId([{ txId: 'x', type: 'buy_in', status: 'active' }])).toBeNull();
  });
});
