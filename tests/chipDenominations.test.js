import { describe, it, expect } from 'vitest';
import {
  MAX_DENOMINATIONS,
  normalizeDenominations,
  normalizeChipCounts,
  chipCountTotal,
  countsForStack,
} from '../src/utils/chipDenominations.js';
import { applyPlayerChange } from '../src/utils/ledgerOps.js';
import {
  normalizeTemplate,
  gameCreationFromTemplate,
  encodeTemplateShare,
  decodeTemplateShare,
  templateFromImport,
  periodSnapshotFromTemplate,
} from '../src/utils/tableTemplates.js';

const SET = [10000, 5000, 1000, 500, 100];

describe('normalizeDenominations', () => {
  it('is empty unless a list is given', () => {
    expect(normalizeDenominations(undefined)).toEqual([]);
    expect(normalizeDenominations(null)).toEqual([]);
    expect(normalizeDenominations('100,500')).toEqual([]);
  });

  it('keeps whole positive values once each, biggest first', () => {
    expect(normalizeDenominations([100, '5000', 500, 100, 0, -5, 'x', null, 25.9])).toEqual([5000, 500, 100, 25]);
  });

  it('caps the list', () => {
    const many = Array.from({ length: MAX_DENOMINATIONS + 5 }, (_, i) => i + 1);
    expect(normalizeDenominations(many)).toHaveLength(MAX_DENOMINATIONS);
  });
});

describe('chip counts', () => {
  it('adds up the example buy-in', () => {
    const counts = { 5000: 8, 10000: 2, 1000: 11, 500: 6, 100: 10 };
    expect(chipCountTotal(counts)).toBe(75000);
  });

  it('keeps only the table’s denominations, whole and above zero', () => {
    expect(normalizeChipCounts({ 5000: 8, 100: 0, 500: '', 1000: 2.9, 25: 4, 10000: -1 }, SET))
      .toEqual({ 5000: 8, 1000: 2 });
    expect(normalizeChipCounts(null, SET)).toEqual({});
    expect(normalizeChipCounts({ 5000: 8 }, [])).toEqual({});
  });

  it('counts nothing for nothing', () => {
    expect(chipCountTotal(null)).toBe(0);
    expect(chipCountTotal({})).toBe(0);
  });
});

describe('countsForStack', () => {
  it('shows the saved counts while they add up to the stack', () => {
    expect(countsForStack({ stack: 41000, stackCounts: { 5000: 8, 1000: 1 } }, SET)).toEqual({ 5000: 8, 1000: 1 });
  });

  it('drops them once the stack no longer matches', () => {
    expect(countsForStack({ stack: 40000, stackCounts: { 5000: 8, 1000: 1 } }, SET)).toEqual({});
  });

  it('drops them when the table has no denominations (or the seat no counts)', () => {
    expect(countsForStack({ stack: 41000, stackCounts: { 5000: 8, 1000: 1 } }, [])).toEqual({});
    expect(countsForStack({ stack: 41000 }, SET)).toEqual({});
  });
});

describe('a seat’s counts ride with its stack', () => {
  const roster = () => [{ id: 'p1', name: 'A', buyIn: 1000, stack: 0 }];

  it('saves the counts given with a stack', () => {
    const { player } = applyPlayerChange(roster(), { targetId: 'p1' }, {
      fields: { stack: 41000, stackCounts: { 5000: 8, 1000: 1 } },
    });
    expect(player.stack).toBe(41000);
    expect(player.stackCounts).toEqual({ 5000: 8, 1000: 1 });
  });

  it('forgets old counts when the stack is typed without them', () => {
    const before = [{ id: 'p1', name: 'A', buyIn: 1000, stack: 41000, stackCounts: { 5000: 8, 1000: 1 } }];
    const typed = applyPlayerChange(before, { targetId: 'p1' }, { fields: { stack: 30000 } });
    expect(typed.player).not.toHaveProperty('stackCounts');
    const empty = applyPlayerChange(before, { targetId: 'p1' }, { fields: { stack: 30000, stackCounts: {} } });
    expect(empty.player).not.toHaveProperty('stackCounts');
  });

  it('leaves the counts alone when the stack is not part of the change', () => {
    const before = [{ id: 'p1', name: 'A', buyIn: 1000, stack: 41000, stackCounts: { 5000: 8, 1000: 1 } }];
    const { player } = applyPlayerChange(before, { targetId: 'p1' }, { buyInDelta: 1000, fields: { name: 'B' } });
    expect(player.stackCounts).toEqual({ 5000: 8, 1000: 1 });
    expect(player.buyIn).toBe(2000);
  });
});

describe('denominations on a cash template', () => {
  it('has none unless set', () => {
    expect(normalizeTemplate({ kind: 'cash' }).denominations).toEqual([]);
    expect(gameCreationFromTemplate({ kind: 'cash' }).options).not.toHaveProperty('denominations');
  });

  it('is normalised, and reaches the table made from the template', () => {
    const tpl = normalizeTemplate({ kind: 'cash', denominations: [100, 5000, 100, 1000] });
    expect(tpl.denominations).toEqual([5000, 1000, 100]);
    expect(gameCreationFromTemplate(tpl).options.denominations).toEqual([5000, 1000, 100]);
  });

  it('is a cash-only module', () => {
    const tpl = normalizeTemplate({ kind: 'tournament', denominations: SET });
    expect(tpl).not.toHaveProperty('denominations');
    expect(gameCreationFromTemplate(tpl).options).not.toHaveProperty('denominations');
  });

  it('survives a share link, a JSON export and an event period snapshot', () => {
    const tpl = normalizeTemplate({ kind: 'cash', name: '1k', denominations: SET });
    expect(decodeTemplateShare(encodeTemplateShare(tpl)).denominations).toEqual(SET);
    expect(templateFromImport(JSON.parse(JSON.stringify(tpl))).denominations).toEqual(SET);
    expect(normalizeTemplate(periodSnapshotFromTemplate(tpl)).denominations).toEqual(SET);
  });

  it('reads a share link made before denominations existed', () => {
    const old = normalizeTemplate({ kind: 'cash', name: '1k' });
    expect(decodeTemplateShare(encodeTemplateShare(old)).denominations).toEqual([]);
  });
});
