import { describe, it, expect } from 'vitest';
import { applyPlayerChange, isSnapshotCurrent, matchesPlayer } from '../src/utils/ledgerOps.js';

const roster = () => [
  { id: 'p1', uid: 'u1', name: 'Alice', buyIn: 1000, stack: 0 },
  { id: 'p2', uid: null, name: 'Bob', buyIn: 2000, stack: 0 },
];

describe('matchesPlayer', () => {
  it('prefers id, then uid, then name', () => {
    const p = roster()[0];
    expect(matchesPlayer(p, { targetId: 'p1', targetUid: 'nope' })).toBe(true);
    expect(matchesPlayer(p, { targetId: 'p2', targetUid: 'u1' })).toBe(false);
    expect(matchesPlayer(p, { targetUid: 'u1', targetName: 'nope' })).toBe(true);
    expect(matchesPlayer(p, { targetName: 'Alice' })).toBe(true);
  });
});

describe('applyPlayerChange', () => {
  it('adds a buy-in by delta and leaves other seats untouched', () => {
    const before = roster();
    const { players, player } = applyPlayerChange(before, { targetId: 'p2' }, { buyInDelta: 1000 });
    expect(player.buyIn).toBe(3000);
    expect(players[1].buyIn).toBe(3000);
    expect(players[0]).toBe(before[0]);
    expect(before[1].buyIn).toBe(2000); // input not mutated
  });

  it('applies a correction on top of a concurrent buy-in instead of overwriting it', () => {
    // Host opened the edit form at 1000; meanwhile Alice bought in to 2000.
    // Host adds one group (+1000) → 3000, not back to 2000.
    const live = roster().map((p) => (p.id === 'p1' ? { ...p, buyIn: 2000 } : p));
    const { player } = applyPlayerChange(live, { targetId: 'p1' }, { buyInDelta: 1000 });
    expect(player.buyIn).toBe(3000);
  });

  it('updates stack/name without touching buyIn when delta is 0', () => {
    const { player } = applyPlayerChange(roster(), { targetId: 'p1' }, { fields: { stack: 1500 } });
    expect(player).toMatchObject({ buyIn: 1000, stack: 1500, name: 'Alice' });
  });

  it('carries fields and delta in the same change', () => {
    const { player } = applyPlayerChange(
      roster(), { targetId: 'p1' }, { buyInDelta: -1000, fields: { stack: 800 } },
    );
    expect(player).toMatchObject({ buyIn: 0, stack: 800 });
  });

  it('ignores fields outside name/stack (buyIn cannot be overwritten)', () => {
    const { player } = applyPlayerChange(roster(), { targetId: 'p1' }, { fields: { buyIn: 99999, uid: 'x' } });
    expect(player.buyIn).toBe(1000);
    expect(player.uid).toBe('u1');
  });

  it('clamps buyIn at zero (undo of an already-corrected seat)', () => {
    const { player } = applyPlayerChange(roster(), { targetId: 'p1' }, { buyInDelta: -5000 });
    expect(player.buyIn).toBe(0);
  });

  it('only changes the first matching seat for name-matched legacy records', () => {
    const dup = [...roster(), { id: 'p3', uid: null, name: 'Bob', buyIn: 500 }];
    const { players } = applyPlayerChange(dup, { targetName: 'Bob' }, { buyInDelta: 100 });
    expect(players[1].buyIn).toBe(2100);
    expect(players[2].buyIn).toBe(500);
  });

  it('throws when the seat is gone', () => {
    expect(() => applyPlayerChange(roster(), { targetId: 'zzz' }, { buyInDelta: 1 }))
      .toThrow('Player not found');
  });
});

describe('isSnapshotCurrent', () => {
  it('rejects snapshots older than what is on screen', () => {
    expect(isSnapshotCurrent(4, 5)).toBe(false);
  });

  it('accepts equal and newer revs (legacy writers do not bump rev)', () => {
    expect(isSnapshotCurrent(5, 5)).toBe(true);
    expect(isSnapshotCurrent(6, 5)).toBe(true);
  });

  it('treats a missing rev as 0 (games created before rev existed)', () => {
    expect(isSnapshotCurrent(undefined, 0)).toBe(true);
    expect(isSnapshotCurrent(undefined, 3)).toBe(false);
  });
});
