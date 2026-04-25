/**
 * Tests for CashTableEditView logic and useTablePermissions
 * covering the pokerGames schema migration fixes from PR #144.
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
  return item?.hostUid === currentUid || item?.meta?.createdBy === currentUid;
}

// ── Extracted logic from CashTableEditView ──────────────────────────────────

const RISKY_FIELDS = new Set(['meta.blinds.small', 'meta.blinds.big', 'meta.minBuyIn', 'meta.maxBuyIn']);

function buildDiffChanges(before, after) {
  const changes = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    const bVal = before[key];
    const aVal = after[key];
    if (JSON.stringify(bVal ?? null) !== JSON.stringify(aVal ?? null)) {
      changes.push({ field: key, before: bVal, after: aVal, isRisky: RISKY_FIELDS.has(key) });
    }
  }
  return changes;
}

/** Build the dot-notation update payload from form values */
function formToUpdates(form) {
  return {
    'meta.minBuyIn': form.minBuyIn,
    'meta.maxBuyIn': form.maxBuyIn,
    'meta.blinds.small': form.blinds.small,
    'meta.blinds.big': form.blinds.big,
    'meta.notes': form.notes || '',
  };
}

/** Build the "before" snapshot from a loaded pokerGames document */
function formToBefore(game) {
  return {
    'meta.minBuyIn': game?.meta?.minBuyIn,
    'meta.maxBuyIn': game?.meta?.maxBuyIn,
    'meta.blinds.small': game?.meta?.blinds?.small,
    'meta.blinds.big': game?.meta?.blinds?.big,
    'meta.notes': game?.meta?.notes || '',
  };
}

/** Validation logic mirroring the validate() function in CashTableEditView */
function validate(form) {
  if (form.minBuyIn < 0 || form.maxBuyIn < 0) return 'buyInNegative';
  if (form.minBuyIn > form.maxBuyIn) return 'minBuyInExceedsMax';
  if (form.blinds.small < 0 || form.blinds.big < 0) return 'blindsNegative';
  if (form.blinds.big < form.blinds.small) return 'bigBlindLessThanSmall';
  return null; // valid
}

// ── Extracted helper from useConfigEditor ───────────────────────────────────

function getNestedValue(obj, dotPath) {
  return dotPath.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useTablePermissions – canEdit', () => {
  const uid = 'user-123';

  it('returns false when currentUid is null', () => {
    expect(canEdit({ hostUid: uid }, null)).toBe(false);
    expect(canEdit({ meta: { createdBy: uid } }, null)).toBe(false);
  });

  it('allows edit when item.hostUid matches (new schema)', () => {
    expect(canEdit({ hostUid: uid }, uid)).toBe(true);
  });

  it('allows edit when item.meta.createdBy matches (old pokerGames schema)', () => {
    expect(canEdit({ meta: { createdBy: uid } }, uid)).toBe(true);
  });

  it('denies edit when neither hostUid nor meta.createdBy match', () => {
    expect(canEdit({ hostUid: 'other', meta: { createdBy: 'another' } }, uid)).toBe(false);
  });

  it('denies edit when item has no host info', () => {
    expect(canEdit({}, uid)).toBe(false);
    expect(canEdit(null, uid)).toBe(false);
    expect(canEdit(undefined, uid)).toBe(false);
  });
});

describe('CashTableEditView – validation', () => {
  const baseForm = {
    minBuyIn: 100,
    maxBuyIn: 500,
    maxPlayers: 9,
    blinds: { small: 5, big: 10 },
    notes: '',
  };

  it('passes validation for a well-formed form', () => {
    expect(validate(baseForm)).toBe(null);
  });

  it('rejects negative buy-in', () => {
    expect(validate({ ...baseForm, minBuyIn: -1 })).toBe('buyInNegative');
    expect(validate({ ...baseForm, maxBuyIn: -1 })).toBe('buyInNegative');
  });

  it('rejects minBuyIn > maxBuyIn', () => {
    expect(validate({ ...baseForm, minBuyIn: 600, maxBuyIn: 500 })).toBe('minBuyInExceedsMax');
  });

  it('allows minBuyIn === maxBuyIn', () => {
    expect(validate({ ...baseForm, minBuyIn: 500, maxBuyIn: 500 })).toBe(null);
  });

  it('does not treat maxPlayers as an editable pokerGames validation field', () => {
    expect(validate({ ...baseForm, maxPlayers: 1 })).toBe(null);
    expect(validate({ ...baseForm, maxPlayers: 21 })).toBe(null);
  });

  it('rejects negative blinds', () => {
    expect(validate({ ...baseForm, blinds: { small: -1, big: 10 } })).toBe('blindsNegative');
  });

  it('rejects bigBlind < smallBlind', () => {
    expect(validate({ ...baseForm, blinds: { small: 20, big: 5 } })).toBe('bigBlindLessThanSmall');
  });
});

describe('CashTableEditView – formToUpdates', () => {
  it('produces dot-notation keys for all meta fields', () => {
    const form = { minBuyIn: 100, maxBuyIn: 500, maxPlayers: 9, blinds: { small: 5, big: 10 }, notes: 'test' };
    const updates = formToUpdates(form);
    expect(Object.keys(updates)).toEqual([
      'meta.minBuyIn',
      'meta.maxBuyIn',
      'meta.blinds.small',
      'meta.blinds.big',
      'meta.notes',
    ]);
    expect(updates['meta.minBuyIn']).toBe(100);
    expect(updates['meta.maxBuyIn']).toBe(500);
    expect(updates['meta.blinds.small']).toBe(5);
    expect(updates['meta.blinds.big']).toBe(10);
    expect(updates['meta.notes']).toBe('test');
  });

  it('does NOT include meta.maxPlayers for pokerGames updates', () => {
    const form = { minBuyIn: 100, maxBuyIn: 500, maxPlayers: 6, blinds: { small: 5, big: 10 }, notes: '' };
    const updates = formToUpdates(form);
    expect('meta.maxPlayers' in updates).toBe(false);
  });

  it('does NOT include a top-level "meta.blinds" object key (no overwrite)', () => {
    const form = { minBuyIn: 0, maxBuyIn: 0, maxPlayers: 10, blinds: { small: 1, big: 2 }, notes: '' };
    const updates = formToUpdates(form);
    // There should be no key 'meta.blinds' (which would overwrite the whole blinds object)
    expect('meta.blinds' in updates).toBe(false);
  });
});

describe('CashTableEditView – formToBefore', () => {
  it('reads from game.meta with dot-notation keys', () => {
    const game = {
      meta: {
        minBuyIn: 200,
        maxBuyIn: 1000,
        maxPlayers: 8,
        blinds: { small: 10, big: 20, ante: 5 }, // extra 'ante' field
        notes: 'old note',
      },
    };
    const before = formToBefore(game);
    expect(before['meta.minBuyIn']).toBe(200);
    expect(before['meta.maxBuyIn']).toBe(1000);
    expect(before['meta.blinds.small']).toBe(10);
    expect(before['meta.blinds.big']).toBe(20);
    expect(before['meta.notes']).toBe('old note');
    expect('meta.maxPlayers' in before).toBe(false);
    // Only the managed fields are captured; extra blinds sub-fields are NOT in before
    expect('meta.blinds' in before).toBe(false);
  });
});

describe('CashTableEditView – buildDiffChanges', () => {
  it('detects changes and marks risky fields', () => {
    const before = {
      'meta.minBuyIn': 100,
      'meta.maxBuyIn': 500,
      'meta.blinds.small': 5,
      'meta.blinds.big': 10,
      'meta.notes': '',
    };
    const after = {
      'meta.minBuyIn': 200,
      'meta.maxBuyIn': 500,
      'meta.blinds.small': 5,
      'meta.blinds.big': 10,
      'meta.notes': 'updated',
    };
    const changes = buildDiffChanges(before, after);

    const minBuyInChange = changes.find((c) => c.field === 'meta.minBuyIn');
    expect(minBuyInChange).toBeDefined();
    expect(minBuyInChange.before).toBe(100);
    expect(minBuyInChange.after).toBe(200);
    expect(minBuyInChange.isRisky).toBe(true);

    const notesChange = changes.find((c) => c.field === 'meta.notes');
    expect(notesChange).toBeDefined();
    expect(notesChange.isRisky).toBe(false);
  });

  it('returns empty array when nothing changed', () => {
    const snap = {
      'meta.minBuyIn': 100,
      'meta.maxBuyIn': 500,
      'meta.blinds.small': 5,
      'meta.blinds.big': 10,
      'meta.notes': '',
    };
    expect(buildDiffChanges(snap, { ...snap })).toHaveLength(0);
  });

  it('uses meta.notes key (not bare notes) in diff field names', () => {
    const before = { 'meta.notes': 'old' };
    const after = { 'meta.notes': 'new' };
    const changes = buildDiffChanges(before, after);
    expect(changes[0].field).toBe('meta.notes');
  });
});

describe('useConfigEditor – getNestedValue', () => {
  it('extracts top-level values', () => {
    expect(getNestedValue({ status: 'waiting' }, 'status')).toBe('waiting');
  });

  it('extracts deeply nested values via dot path', () => {
    const obj = { meta: { blinds: { small: 5, big: 10 }, minBuyIn: 100 } };
    expect(getNestedValue(obj, 'meta.minBuyIn')).toBe(100);
    expect(getNestedValue(obj, 'meta.blinds.small')).toBe(5);
    expect(getNestedValue(obj, 'meta.blinds.big')).toBe(10);
  });

  it('returns undefined for missing paths', () => {
    expect(getNestedValue({}, 'meta.minBuyIn')).toBeUndefined();
    expect(getNestedValue(null, 'meta.minBuyIn')).toBeUndefined();
    expect(getNestedValue({ meta: null }, 'meta.minBuyIn')).toBeUndefined();
  });
});
