import { describe, it, expect } from 'vitest';
import {
  TEMPLATE_KIND,
  BOUNTY_TYPE,
  LEGACY_SOURCE,
  normalizeLevel,
  normalizeStructure,
  validateStructure,
  renumberLevels,
  builtInStructures,
  periodSnapshotFromTemplate,
  encodeTemplateShare,
  decodeTemplateShare,
  templateFromImport,
  structureSnapshot,
  maxLevelNumber,
  normalizeBounty,
  bountyPerEntry,
  isBountyPlayable,
  normalizeTemplate,
  validateTemplate,
  templateRate,
  templateFromCashPreset,
  templateFromTournamentPreset,
  templateFromBuiltInTournament,
  structureFromTournamentPreset,
  templateFromPeriodSnapshot,
  clockConfigFromTemplate,
  gameCreationFromTemplate,
  mergeTemplateSources,
  mergeStructureSources,
  templateForSave,
} from '../src/utils/tableTemplates.js';
import { TOURNAMENT_TEMPLATES } from '../src/utils/tournamentTemplates.js';
import { CLOCK_MODE_TIMED } from '../src/utils/timedStructure.js';

const LEVELS = [
  { level: 1, small: 100, big: 200, ante: 0, duration: 20 },
  { level: 2, small: 200, big: 400, ante: 400, duration: 20 },
  { isBreak: true, duration: 10 },
  { level: 3, small: 300, big: 600, ante: 600, duration: 20 },
];

describe('structures', () => {
  it('normalizes levels and breaks', () => {
    expect(normalizeLevel({ level: '2', small: '50', big: 100 })).toEqual({
      level: 2, small: 50, big: 100, ante: 0, duration: 15, isBreak: false,
    });
    expect(normalizeLevel({ isBreak: true, small: 5, duration: 10 })).toEqual({
      level: 0, small: 0, big: 0, ante: 0, duration: 10, isBreak: true,
    });
  });

  it('keeps only name, suggested cutoff and levels', () => {
    const s = normalizeStructure({ id: 's1', name: ' Turbo ', cutoffLevel: '2', levels: LEVELS, buyIn: 999 });
    expect(s).toEqual({ id: 's1', name: 'Turbo', cutoffLevel: 2, levels: expect.any(Array) });
    expect(s.levels).toHaveLength(4);
  });

  it('drops a cutoff past the last level', () => {
    expect(normalizeStructure({ cutoffLevel: 9, levels: LEVELS }).cutoffLevel).toBeNull();
    expect(normalizeStructure({ cutoffLevel: 0, levels: LEVELS }).cutoffLevel).toBeNull();
  });

  it('validates name and levels', () => {
    expect(validateStructure({ name: 'S', levels: LEVELS })).toEqual([]);
    expect(validateStructure({ levels: LEVELS })).toEqual(['nameRequired']);
    expect(validateStructure({ name: 'S', levels: [{ isBreak: true }] })).toEqual(['levelsRequired']);
  });

  it('renumbers playable levels around breaks', () => {
    const levels = [{ level: 5 }, { isBreak: true, level: 0 }, { level: 9 }];
    expect(renumberLevels(levels).map((l) => l.level)).toEqual([1, 0, 2]);
  });

  it('lists built-in structures with their cutoff', () => {
    const list = builtInStructures(TOURNAMENT_TEMPLATES, (k) => `T:${k}`);
    expect(list).toHaveLength(TOURNAMENT_TEMPLATES.length);
    expect(list[0]).toMatchObject({
      id: `builtin:${TOURNAMENT_TEMPLATES[0].id}`,
      name: `T:${TOURNAMENT_TEMPLATES[0].nameKey}`,
      cutoffLevel: TOURNAMENT_TEMPLATES[0].reentryUntilLevel,
      source: 'builtin',
    });
  });

  it('snapshots a structure (or null when empty)', () => {
    expect(structureSnapshot(null)).toBeNull();
    expect(structureSnapshot({ name: 'x', levels: [] })).toBeNull();
    expect(structureSnapshot({ id: 's1', name: 'S', levels: LEVELS }).sourceId).toBe('s1');
    expect(structureSnapshot({ sourceId: 'a', id: 'b', name: 'S', levels: LEVELS }).sourceId).toBe('a');
  });

  it('finds the last playable level', () => {
    expect(maxLevelNumber(LEVELS)).toBe(3);
    expect(maxLevelNumber([])).toBe(0);
  });
});

describe('bounty module', () => {
  it('defaults to none and drops fields of other types', () => {
    expect(normalizeBounty()).toEqual({ type: 'none' });
    expect(normalizeBounty({ type: 'weird' })).toEqual({ type: 'none' });
    expect(normalizeBounty({ type: 'ko', share: { value: 500 }, cashShare: 0.3 })).toEqual({
      type: 'ko', share: { mode: 'amount', value: 500 },
    });
  });

  it('pko keeps a clamped cash share (default half)', () => {
    expect(normalizeBounty({ type: 'pko', share: { mode: 'percent', value: 50 } }).cashShare).toBe(0.5);
    expect(normalizeBounty({ type: 'pko', cashShare: 3 }).cashShare).toBe(1);
  });

  it('mystery keeps envelopes, start and draw mode', () => {
    const b = normalizeBounty({
      type: 'mystery',
      share: { mode: 'percent', value: 150 },
      envelopes: [{ share: 20, count: 1 }, { share: 0, count: 5 }, { share: 5, count: '4' }],
      start: { mode: 'players', value: 9 },
      drawMode: 'manual',
    });
    expect(b.share).toEqual({ mode: 'percent', value: 100 });
    expect(b.envelopes).toEqual([{ share: 20, count: 1 }, { share: 5, count: 4 }]);
    expect(b.start).toEqual({ mode: 'players', value: 9 });
    expect(b.drawMode).toBe('manual');
    expect(normalizeBounty({ type: 'mystery' }).drawMode).toBe('system');
  });

  it('bounty per entry by amount or percent, capped at the buy-in', () => {
    expect(bountyPerEntry({ type: 'none' }, 1000)).toBe(0);
    expect(bountyPerEntry(normalizeBounty({ type: 'ko', share: { value: 300 } }), 1000)).toBe(300);
    expect(bountyPerEntry(normalizeBounty({ type: 'pko', share: { mode: 'percent', value: 50 } }), 1500)).toBe(750);
    expect(bountyPerEntry(normalizeBounty({ type: 'ko', share: { value: 5000 } }), 1000)).toBe(1000);
  });

  it('only "none" is playable in phase 1', () => {
    expect(isBountyPlayable({ type: 'none' })).toBe(true);
    expect(isBountyPlayable(undefined)).toBe(true);
    expect(isBountyPlayable({ type: 'ko' })).toBe(false);
  });
});

describe('normalizeTemplate', () => {
  it('cash defaults', () => {
    const t = normalizeTemplate({ name: 'Home' });
    expect(t.kind).toBe('cash');
    expect(t.buyIn).toEqual({ chips: 2000, amount: 2000 });
    expect(t.structure).toBeNull();
    expect(t.entry).toEqual({ cutoffLevel: null });
    expect(t.cash).toEqual({ decimals: null });
    expect(t).not.toHaveProperty('bounty');
  });

  it('cash cutoff only exists with a structure', () => {
    expect(normalizeTemplate({ kind: 'cash', entry: { cutoffLevel: 3 } }).entry.cutoffLevel).toBeNull();
    const timed = normalizeTemplate({ kind: 'cash', structure: { name: 'S', levels: LEVELS }, entry: { cutoffLevel: '2' } });
    expect(timed.entry.cutoffLevel).toBe(2);
    expect(normalizeTemplate({ kind: 'cash', structure: { levels: LEVELS }, entry: { cutoffLevel: 0 } }).entry.cutoffLevel).toBeNull();
  });

  it('tournament defaults', () => {
    const t = normalizeTemplate({ kind: 'tournament', name: 'MTT' });
    expect(t.buyIn).toEqual({ amount: 0, chips: 25000 });
    expect(t.entry).toEqual({ cutoffLevel: null, reentry: { allowed: true, max: null } });
    expect(t.payout).toEqual({ ratios: [] });
    expect(t.bounty).toEqual({ type: 'none' });
  });

  it('no re-entry clears the max', () => {
    const t = normalizeTemplate({ kind: 'tournament', entry: { reentry: { allowed: false, max: 3 } } });
    expect(t.entry.reentry).toEqual({ allowed: false, max: null });
  });

  it('drops zero payout rows', () => {
    const t = normalizeTemplate({ kind: 'tournament', payout: { ratios: [{ place: 1, percentage: 70 }, { place: 2, percentage: 0 }] } });
    expect(t.payout.ratios).toEqual([{ place: 1, percentage: 70 }]);
  });
});

describe('validateTemplate', () => {
  const tourney = {
    kind: 'tournament', name: 'T', structure: { levels: LEVELS },
    payout: { ratios: [{ place: 1, percentage: 60 }, { place: 2, percentage: 40 }] },
  };

  it('accepts a complete template', () => {
    expect(validateTemplate(tourney)).toEqual([]);
    expect(validateTemplate({ kind: 'cash', name: 'C' })).toEqual([]);
  });

  it('flags missing pieces', () => {
    expect(validateTemplate({ kind: 'cash' })).toContain('nameRequired');
    expect(validateTemplate({ ...tourney, structure: null })).toContain('structureRequired');
    expect(validateTemplate({ ...tourney, payout: { ratios: [{ place: 1, percentage: 90 }] } })).toContain('payoutNot100');
    expect(validateTemplate({ ...tourney, entry: { cutoffLevel: 9 } })).toContain('cutoffBeyondStructure');
  });

  it('bounties are not playable yet', () => {
    const errs = validateTemplate({ ...tourney, buyIn: { amount: 1000 }, bounty: { type: 'ko', share: { value: 200 } } });
    expect(errs).toEqual(['bountyNotAvailable']);
    expect(validateTemplate({ ...tourney, bounty: { type: 'ko' } })).toContain('bountyShareRequired');
  });
});

describe('legacy cash presets', () => {
  it('plain cash preset', () => {
    const t = templateFromCashPreset({ id: 'c1', name: 'Home', buyIn: 1000, rate: 10, cashDecimals: 0 });
    expect(t).toMatchObject({
      kind: 'cash', id: 'c1', name: 'Home', buyIn: { chips: 1000, amount: 100 },
      structure: null, entry: { cutoffLevel: null }, cash: { decimals: 0 },
    });
    expect(templateRate(t)).toBe(10);
  });

  it('prefers the stored buy-in amount', () => {
    const t = templateFromCashPreset({ buyIn: 1000, rate: 3, buyInAmount: 300 });
    expect(t.buyIn.amount).toBe(300);
  });

  it('timed preset keeps its structure cutoff', () => {
    const t = templateFromCashPreset({
      buyIn: 2000, rate: 1,
      structure: { sourceId: 'p1', name: 'S', levels: LEVELS, reentryUntilLevel: 2, sourceCutoff: 2, noCutoff: false },
    });
    expect(t.structure.sourceId).toBe('p1');
    expect(t.entry.cutoffLevel).toBe(2);
  });

  it('noCutoff → no cutoff; older snapshots without sourceCutoff use reentryUntilLevel', () => {
    const s = { name: 'S', levels: LEVELS, reentryUntilLevel: 0, sourceCutoff: 3, noCutoff: true };
    expect(templateFromCashPreset({ buyIn: 2000, structure: s }).entry.cutoffLevel).toBeNull();
    expect(templateFromCashPreset({ buyIn: 2000, structure: { name: 'S', levels: LEVELS, reentryUntilLevel: 3 } }).entry.cutoffLevel).toBe(3);
  });
});

describe('legacy tournament presets', () => {
  const preset = {
    id: 'p1', name: 'Friday', subtitle: 'Weekly', buyIn: 1500, startingChips: 30000,
    reentryUntilLevel: 2, maxReentries: 2, levels: LEVELS,
    payoutRatios: [{ place: 1, percentage: 100 }],
  };

  it('maps fields explicitly', () => {
    const t = templateFromTournamentPreset(preset);
    expect(t).toMatchObject({
      kind: 'tournament', id: 'p1', name: 'Friday', subtitle: 'Weekly',
      buyIn: { amount: 1500, chips: 30000 },
      entry: { cutoffLevel: 2, reentry: { allowed: true, max: 2 } },
      payout: { ratios: [{ place: 1, percentage: 100 }] },
      bounty: { type: 'none' },
    });
    expect(t.structure).toMatchObject({ sourceId: 'p1', name: 'Friday' });
  });

  it('reentryUntilLevel 0 = no re-entry; maxReentries 0 = unlimited', () => {
    expect(templateFromTournamentPreset({ ...preset, reentryUntilLevel: 0 }).entry).toEqual({
      cutoffLevel: null, reentry: { allowed: false, max: null },
    });
    expect(templateFromTournamentPreset({ ...preset, maxReentries: 0 }).entry.reentry.max).toBeNull();
  });

  it('missing reentryUntilLevel uses the default level', () => {
    const { reentryUntilLevel: _r, ...rest } = preset;
    expect(templateFromTournamentPreset(rest).entry.cutoffLevel).toBe(7);
  });

  it('extracts the structure as a library item', () => {
    expect(structureFromTournamentPreset(preset)).toEqual({ id: 'p1', name: 'Friday', cutoffLevel: 2, levels: expect.any(Array) });
    expect(structureFromTournamentPreset({ ...preset, reentryUntilLevel: 0 }).cutoffLevel).toBeNull();
  });

  it('built-in templates convert with a translated name', () => {
    const t = templateFromBuiltInTournament(TOURNAMENT_TEMPLATES[0], (k) => `T:${k}`);
    expect(t.id).toBe(`builtin:${TOURNAMENT_TEMPLATES[0].id}`);
    expect(t.name).toBe(`T:${TOURNAMENT_TEMPLATES[0].nameKey}`);
    expect(t.builtIn).toBe(true);
    for (const b of TOURNAMENT_TEMPLATES) {
      expect(validateTemplate(templateFromBuiltInTournament(b, () => 'x'))).toEqual([]);
    }
  });

  it('period snapshots pick the adapter by type', () => {
    expect(templateFromPeriodSnapshot('tournament', preset).kind).toBe('tournament');
    expect(templateFromPeriodSnapshot('cash', { buyIn: 1000 }).kind).toBe('cash');
  });
});

describe('clockConfigFromTemplate', () => {
  it('plain cash has no clock', () => {
    expect(clockConfigFromTemplate({ kind: 'cash', name: 'C' })).toBeNull();
  });

  it('timed cash → timed clock in chips, 0 = no cutoff', () => {
    const cfg = clockConfigFromTemplate({
      kind: 'cash', name: 'C', buyIn: { chips: 2000, amount: 200 },
      structure: { levels: LEVELS }, entry: { cutoffLevel: 2 },
    }, { name: 'Table 1' });
    expect(cfg).toMatchObject({ mode: CLOCK_MODE_TIMED, name: 'Table 1', buyIn: 2000, reentryUntilLevel: 2, maxReentries: 0 });
    expect(clockConfigFromTemplate({ kind: 'cash', structure: { levels: LEVELS } }).reentryUntilLevel).toBe(0);
  });

  it('matches what LobbyView built from the same legacy cash preset', () => {
    const structure = { name: 'S', levels: LEVELS, reentryUntilLevel: 2, sourceCutoff: 2, noCutoff: false };
    const cfg = clockConfigFromTemplate(templateFromCashPreset({ name: 'C', buyIn: 2000, rate: 10, structure }));
    expect(cfg).toMatchObject({ mode: 'timed', buyIn: 2000, reentryUntilLevel: 2, maxReentries: 0, payoutRatios: [] });
    expect(cfg.levels).toHaveLength(LEVELS.length);
  });

  it('tournament round-trips the legacy re-entry fields', () => {
    const preset = { name: 'F', buyIn: 1500, startingChips: 30000, reentryUntilLevel: 2, maxReentries: 2, levels: LEVELS, payoutRatios: [] };
    expect(clockConfigFromTemplate(templateFromTournamentPreset(preset))).toMatchObject({
      name: 'F', buyIn: 1500, startingChips: 30000, reentryUntilLevel: 2, maxReentries: 2,
    });
    expect(clockConfigFromTemplate(templateFromTournamentPreset({ ...preset, reentryUntilLevel: 0 }))).toMatchObject({
      reentryUntilLevel: 0, maxReentries: 0,
    });
  });

  it('tournament re-entry without cutoff stays open past the last level', () => {
    const cfg = clockConfigFromTemplate({
      kind: 'tournament', name: 'T', structure: { levels: LEVELS },
      entry: { cutoffLevel: null, reentry: { allowed: true, max: null } },
    });
    expect(cfg.reentryUntilLevel).toBe(4);
    expect(cfg.maxReentries).toBe(0);
  });
});

describe('gameCreationFromTemplate', () => {
  it('cash counts chips and carries rate / amount / rounding', () => {
    const g = gameCreationFromTemplate({ kind: 'cash', buyIn: { chips: 1000, amount: 100 }, cash: { decimals: 2 } }, { tournamentSessionId: 's1' });
    expect(g).toEqual({
      type: 'live', buyIn: 1000,
      options: { rate: 10, buyInAmount: 100, cashDecimals: 2, tournamentSessionId: 's1' },
    });
    expect(gameCreationFromTemplate({ kind: 'cash' }).options).not.toHaveProperty('tournamentSessionId');
  });

  it('tournament counts the entry fee', () => {
    expect(gameCreationFromTemplate({ kind: 'tournament', buyIn: { amount: 1500 } }, { tournamentSessionId: 's1' })).toEqual({
      type: 'tournament', buyIn: 1500, options: { tournamentSessionId: 's1' },
    });
  });
});

describe('merging with legacy presets', () => {
  const cashPresets = [{ id: 'c1', name: 'Home', buyIn: 1000, rate: 10 }, { id: 'c2', name: 'Old', buyIn: 500 }];
  const tournamentPresets = [{ id: 't1', name: 'Friday', buyIn: 1500, levels: LEVELS }];

  it('lists stored and legacy items with their source', () => {
    const list = mergeTemplateSources({ templates: [{ id: 'x', kind: 'cash', name: 'New' }], cashPresets, tournamentPresets });
    expect(list.map((t) => [t.id, t.source])).toEqual([
      ['x', 'template'], ['c1', 'cashPresets'], ['c2', 'cashPresets'], ['t1', 'tournamentPresets'],
    ]);
  });

  it('hides legacy items already saved as a template', () => {
    const list = mergeTemplateSources({
      templates: [{ id: 'x', kind: 'cash', name: 'Home', migratedFrom: 'cashPresets/c1' }],
      cashPresets, tournamentPresets,
    });
    expect(list.map((t) => t.id)).toEqual(['x', 'c2', 't1']);
    expect(list[0].migratedFrom).toBe('cashPresets/c1');
  });

  it('structures include legacy tournament preset levels until saved', () => {
    expect(mergeStructureSources({ tournamentPresets }).map((s) => s.source)).toEqual(['tournamentPresets']);
    const list = mergeStructureSources({
      structures: [{ id: 's1', name: 'Friday', levels: LEVELS, migratedFrom: 'tournamentPresets/t1' }],
      tournamentPresets,
    });
    expect(list.map((s) => [s.id, s.source])).toEqual([['s1', 'structure']]);
  });

  it('saving a legacy item makes a new template pointing back at it', () => {
    const legacy = mergeTemplateSources({ cashPresets }).find((t) => t.id === 'c1');
    const toSave = templateForSave(legacy, legacy.source);
    expect(toSave.id).toBeNull();
    expect(toSave.migratedFrom).toBe(`${LEGACY_SOURCE.CASH_PRESETS}/c1`);
    expect(toSave).not.toHaveProperty('source');
    // round-trip: the saved template hides the legacy one
    const list = mergeTemplateSources({ templates: [{ ...toSave, id: 'new' }], cashPresets });
    expect(list.map((t) => t.id)).toEqual(['new', 'c2']);
  });

  it('saving a stored template keeps its id', () => {
    expect(templateForSave({ id: 'x', kind: 'cash', name: 'A' }).id).toBe('x');
  });
});

describe('kinds', () => {
  it('exposes the two kinds and four bounty types', () => {
    expect(Object.values(TEMPLATE_KIND)).toEqual(['cash', 'tournament']);
    expect(Object.values(BOUNTY_TYPE)).toEqual(['none', 'ko', 'pko', 'mystery']);
  });
});

describe('event period snapshots', () => {
  const tpl = normalizeTemplate({
    kind: 'cash', id: 'x', name: 'Home', buyIn: { chips: 1000, amount: 100 },
    structure: { name: 'S', levels: LEVELS }, entry: { cutoffLevel: 2 }, migratedFrom: 'cashPresets/c1',
  });

  it('stores the template without its id / origin', () => {
    const snap = periodSnapshotFromTemplate(tpl);
    expect(snap).not.toHaveProperty('id');
    expect(snap).not.toHaveProperty('migratedFrom');
    expect(snap.formatVersion).toBe(1);
  });

  it('reads new snapshots as templates and old ones through the adapters', () => {
    const snap = periodSnapshotFromTemplate(tpl);
    expect(templateFromPeriodSnapshot('cash', snap)).toMatchObject({ name: 'Home', buyIn: { chips: 1000, amount: 100 }, entry: { cutoffLevel: 2 } });
    expect(templateFromPeriodSnapshot('cash', { name: 'Old', buyIn: 500, rate: 5 }).buyIn).toEqual({ chips: 500, amount: 100 });
  });

  it('a period starts the same table as the lobby would', () => {
    const snap = periodSnapshotFromTemplate(tpl);
    const fromPeriod = templateFromPeriodSnapshot('cash', snap);
    expect(clockConfigFromTemplate(fromPeriod)).toEqual(clockConfigFromTemplate(tpl));
    expect(gameCreationFromTemplate(fromPeriod)).toEqual(gameCreationFromTemplate(tpl));
  });
});

describe('share links and import', () => {
  it('round-trips a tournament template', () => {
    const tpl = templateFromTournamentPreset({
      name: '週五賽', subtitle: 'Weekly', buyIn: 1500, startingChips: 30000,
      reentryUntilLevel: 2, maxReentries: 2, levels: LEVELS, payoutRatios: [{ place: 1, percentage: 100 }],
    });
    const back = decodeTemplateShare(encodeTemplateShare(tpl));
    expect(back).toMatchObject({
      kind: 'tournament', name: '週五賽', subtitle: 'Weekly', buyIn: { amount: 1500, chips: 30000 },
      entry: { cutoffLevel: 2, reentry: { allowed: true, max: 2 } },
      payout: { ratios: [{ place: 1, percentage: 100 }] },
    });
    expect(back.structure.levels).toEqual(tpl.structure.levels);
  });

  it('round-trips a timed cash template', () => {
    const tpl = normalizeTemplate({
      kind: 'cash', name: 'Home', buyIn: { chips: 1000, amount: 300 },
      structure: { name: 'S', levels: LEVELS }, entry: { cutoffLevel: 3 }, cash: { decimals: 2 },
    });
    expect(decodeTemplateShare(encodeTemplateShare(tpl))).toMatchObject({
      kind: 'cash', name: 'Home', buyIn: { chips: 1000, amount: 300 },
      structure: { name: 'S' }, entry: { cutoffLevel: 3 }, cash: { decimals: 2 },
    });
  });

  it('still reads links made by the old 賽制設定 page', () => {
    const compact = { n: 'Old', s: '', b: 200, c: 20000, r: 4, m: 0, l: [[1, 25, 50, 0, 15, 0], [0, 0, 0, 0, 5, 1]], p: [[1, 100]] };
    const b64 = Buffer.from(JSON.stringify(compact), 'utf8').toString('base64');
    expect(decodeTemplateShare(b64)).toMatchObject({
      kind: 'tournament', name: 'Old', buyIn: { amount: 200, chips: 20000 },
      entry: { cutoffLevel: 4, reentry: { allowed: true, max: null } },
    });
    expect(decodeTemplateShare('not base64 json')).toBeNull();
  });

  it('imports template files and old tournament exports', () => {
    expect(templateFromImport({ kind: 'cash', id: 'x', name: 'C' })).toMatchObject({ kind: 'cash', id: null, name: 'C' });
    expect(templateFromImport({ name: 'T', levels: LEVELS, buyIn: 100 }).kind).toBe('tournament');
    expect(templateFromImport({ foo: 1 })).toBeNull();
    expect(templateFromImport(null)).toBeNull();
  });
});
