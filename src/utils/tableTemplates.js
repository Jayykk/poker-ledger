// Table templates (開桌範本) — one format for every kind of table.
//
// A table is one of exactly two kinds, decided by how money settles:
//   cash        stack − buy-in, converted at the rate
//   tournament  prize pool paid out by placement
// Everything else is a module on top of the kind:
//   structure   blind clock (cash: optional → a timed game; tournament: required)
//   entry       buy-in cutoff level (both); re-entry rules (tournament)
//   cash        settlement rounding (cash)
//   payout      placement ratios (tournament)
//   bounty      KO / PKO / mystery bounty (tournament) — reserved for phase 2,
//               normalised and stored but not played yet
//
// Blind structures (盲注結構) are a separate library: levels only. A template
// keeps a *snapshot* of the structure it uses, so editing the structure later
// never changes templates or tables already made from it.
//
// Legacy presets (users/{uid}/cashPresets, tournamentPresets) are read through
// the adapters below — their field quirks stay in here:
//   tournament reentryUntilLevel 0 = no re-entry at all
//   tournament maxReentries 0      = unlimited
//   timed cash structure.noCutoff  = no buy-in cutoff
// Pure functions only (unit-tested); Firestore I/O lives in useTableTemplates.

import {
  DEFAULT_BUY_IN,
  DEFAULT_STARTING_CHIPS,
  DEFAULT_REENTRY_LEVEL,
  DEFAULT_TOURNAMENT_LEVEL_DURATION,
} from './constants.js';
import { rateFromBuyIn, resolveBuyInAmount } from './buyInRate.js';
import { normalizeCashDecimals } from './cashRounding.js';
import { CLOCK_MODE_TIMED } from './timedStructure.js';

export const TEMPLATE_FORMAT_VERSION = 1;

export const TEMPLATE_KIND = Object.freeze({ CASH: 'cash', TOURNAMENT: 'tournament' });
export const TEMPLATE_KINDS = Object.values(TEMPLATE_KIND);

/** Bounty formats. Only 'none' is playable until phase 2. */
export const BOUNTY_TYPE = Object.freeze({ NONE: 'none', KO: 'ko', PKO: 'pko', MYSTERY: 'mystery' });
export const BOUNTY_TYPES = Object.values(BOUNTY_TYPE);
export const PLAYABLE_BOUNTY_TYPES = Object.freeze([BOUNTY_TYPE.NONE]);

/** Where legacy records live (users/{uid}/<collection>). */
export const LEGACY_SOURCE = Object.freeze({
  CASH_PRESETS: 'cashPresets',
  TOURNAMENT_PRESETS: 'tournamentPresets',
});

// ── small coercers ─────────────────────────────────────────────────────

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const positive = (v, fallback) => (num(v) > 0 ? num(v) : fallback);
const wholeOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.floor(num(v, NaN));
  return Number.isFinite(n) && n >= 1 ? n : null;
};
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

// ── blind structures ───────────────────────────────────────────────────

/** One level / break, with every field present and numeric. */
export function normalizeLevel(raw = {}) {
  const isBreak = !!raw.isBreak;
  return {
    level: isBreak ? 0 : Math.max(0, Math.floor(num(raw.level))),
    small: isBreak ? 0 : Math.max(0, num(raw.small)),
    big: isBreak ? 0 : Math.max(0, num(raw.big)),
    ante: isBreak ? 0 : Math.max(0, num(raw.ante)),
    duration: positive(raw.duration, DEFAULT_TOURNAMENT_LEVEL_DURATION),
    isBreak,
  };
}

export function normalizeLevels(levels) {
  return Array.isArray(levels) ? levels.map(normalizeLevel) : [];
}

/** Highest playable level number in a structure (0 if none). */
export function maxLevelNumber(levels = []) {
  return levels.reduce((max, l) => (l && !l.isBreak ? Math.max(max, num(l.level)) : max), 0);
}

/**
 * A blind-structure library item: name + levels, nothing else.
 * @param {object} raw
 * @returns {{id: ?string, name: string, levels: Array}}
 */
export function normalizeStructure(raw = {}) {
  return {
    id: raw.id || null,
    name: str(raw.name).trim(),
    levels: normalizeLevels(raw.levels),
  };
}

/** Snapshot of a structure as stored inside a template (or null). */
export function structureSnapshot(structure) {
  if (!structure || !Array.isArray(structure.levels) || structure.levels.length === 0) return null;
  return {
    sourceId: structure.sourceId ?? structure.id ?? null,
    name: str(structure.name).trim(),
    levels: normalizeLevels(structure.levels),
  };
}

// ── bounty module (reserved) ───────────────────────────────────────────

function normalizeBountyShare(raw) {
  const mode = raw?.mode === 'percent' ? 'percent' : 'amount';
  const value = Math.max(0, num(raw?.value));
  return { mode, value: mode === 'percent' ? Math.min(100, value) : value };
}

/**
 * Bounty settings. Unknown / missing type → none. Type-specific fields are
 * kept only for their type, so switching type never leaves stale settings.
 *   ko       share (amount or % of the buy-in that becomes the head's bounty)
 *   pko      share + cashShare (fraction paid out on a KO; the rest is added
 *            to the eliminator's own head)
 *   mystery  share + envelopes (shares of the bounty pool × count), when the
 *            draws start, and how they're drawn (system / physical envelopes)
 */
export function normalizeBounty(raw = {}) {
  const type = BOUNTY_TYPES.includes(raw?.type) ? raw.type : BOUNTY_TYPE.NONE;
  if (type === BOUNTY_TYPE.NONE) return { type };
  const bounty = { type, share: normalizeBountyShare(raw.share) };
  if (type === BOUNTY_TYPE.PKO) {
    const cashShare = num(raw.cashShare, 0.5);
    bounty.cashShare = Math.min(1, Math.max(0, cashShare));
  }
  if (type === BOUNTY_TYPE.MYSTERY) {
    bounty.envelopes = (Array.isArray(raw.envelopes) ? raw.envelopes : [])
      .map((e) => ({ share: Math.max(0, num(e?.share)), count: Math.max(1, Math.floor(num(e?.count, 1))) }))
      .filter((e) => e.share > 0);
    bounty.start = {
      mode: raw.start?.mode === 'players' ? 'players' : 'level',
      value: Math.max(0, Math.floor(num(raw.start?.value))),
    };
    bounty.drawMode = raw.drawMode === 'manual' ? 'manual' : 'system';
  }
  return bounty;
}

/** Bounty part of one entry's buy-in (whole currency units). */
export function bountyPerEntry(bounty, buyInAmount) {
  if (!bounty || bounty.type === BOUNTY_TYPE.NONE || !bounty.share) return 0;
  const amount = Math.max(0, num(buyInAmount));
  const value = bounty.share.mode === 'percent'
    ? Math.round((amount * bounty.share.value) / 100)
    : Math.round(bounty.share.value);
  return Math.min(amount, value);
}

export const isBountyPlayable = (bounty) => PLAYABLE_BOUNTY_TYPES.includes(bounty?.type || BOUNTY_TYPE.NONE);

// ── templates ──────────────────────────────────────────────────────────

/**
 * The canonical template shape. Always returns every field for its kind.
 *
 * cash:       { kind, id, name, buyIn: {chips, amount}, structure, entry: {cutoffLevel},
 *               cash: {decimals} }
 * tournament: { kind, id, name, subtitle, buyIn: {amount, chips}, structure,
 *               entry: {cutoffLevel, reentry: {allowed, max}}, payout: {ratios}, bounty }
 *
 * entry.cutoffLevel: level from which buy-ins (cash) / re-entries
 * (tournament) close; null = never (only the end of the clock closes them).
 * reentry.max: null = unlimited.
 */
export function normalizeTemplate(raw = {}) {
  const kind = TEMPLATE_KINDS.includes(raw.kind) ? raw.kind : TEMPLATE_KIND.CASH;
  const base = {
    formatVersion: TEMPLATE_FORMAT_VERSION,
    kind,
    id: raw.id || null,
    name: str(raw.name).trim(),
    structure: structureSnapshot(raw.structure),
  };
  if (raw.migratedFrom) base.migratedFrom = str(raw.migratedFrom);

  if (kind === TEMPLATE_KIND.CASH) {
    const chips = positive(raw.buyIn?.chips, DEFAULT_BUY_IN);
    return {
      ...base,
      buyIn: { chips, amount: positive(raw.buyIn?.amount, chips) },
      entry: { cutoffLevel: base.structure ? wholeOrNull(raw.entry?.cutoffLevel) : null },
      cash: { decimals: normalizeCashDecimals(raw.cash?.decimals) },
    };
  }

  const allowed = raw.entry?.reentry?.allowed !== false;
  return {
    ...base,
    subtitle: str(raw.subtitle),
    buyIn: {
      amount: Math.max(0, num(raw.buyIn?.amount)),
      chips: positive(raw.buyIn?.chips, DEFAULT_STARTING_CHIPS),
    },
    entry: {
      cutoffLevel: wholeOrNull(raw.entry?.cutoffLevel),
      reentry: { allowed, max: allowed ? wholeOrNull(raw.entry?.reentry?.max) : null },
    },
    payout: {
      ratios: (Array.isArray(raw.payout?.ratios) ? raw.payout.ratios : [])
        .map((r, i) => ({ place: Math.floor(num(r?.place, i + 1)) || i + 1, percentage: Math.max(0, num(r?.percentage)) }))
        .filter((r) => r.percentage > 0),
    },
    bounty: normalizeBounty(raw.bounty),
  };
}

/**
 * Problems that block saving / using a template (empty = valid). Messages
 * are i18n-key-shaped codes for the UI to translate.
 */
export function validateTemplate(template) {
  const t = normalizeTemplate(template);
  const errors = [];
  if (!t.name) errors.push('nameRequired');
  if (t.kind === TEMPLATE_KIND.TOURNAMENT) {
    if (!t.structure) errors.push('structureRequired');
    const total = t.payout.ratios.reduce((s, r) => s + r.percentage, 0);
    if (t.payout.ratios.length && Math.abs(total - 100) > 0.001) errors.push('payoutNot100');
    if (!isBountyPlayable(t.bounty)) errors.push('bountyNotAvailable');
    if (t.bounty.type !== BOUNTY_TYPE.NONE && bountyPerEntry(t.bounty, t.buyIn.amount) <= 0) errors.push('bountyShareRequired');
  }
  if (t.entry.cutoffLevel != null && t.structure && t.entry.cutoffLevel > maxLevelNumber(t.structure.levels)) {
    errors.push('cutoffBeyondStructure');
  }
  return errors;
}

/** Settlement rate of a cash template (chips per currency unit). */
export const templateRate = (template) =>
  rateFromBuyIn(template.buyIn?.chips, template.buyIn?.amount) || 1;

// ── legacy adapters (read) ─────────────────────────────────────────────

/** A cash preset (限時賽設定) as a template. */
export function templateFromCashPreset(preset = {}) {
  const chips = positive(preset.buyIn, DEFAULT_BUY_IN);
  const rate = positive(preset.rate, 1);
  const s = preset.structure || null;
  return normalizeTemplate({
    kind: TEMPLATE_KIND.CASH,
    id: preset.id || null,
    name: preset.name,
    buyIn: { chips, amount: resolveBuyInAmount({ buyInAmount: preset.buyInAmount, buyIn: chips, rate }) || chips },
    structure: s,
    // noCutoff → none; otherwise the structure's own cutoff (sourceCutoff keeps
    // it even when the preset had switched it off earlier)
    entry: { cutoffLevel: s && !s.noCutoff ? (s.sourceCutoff ?? s.reentryUntilLevel) : null },
    cash: { decimals: preset.cashDecimals },
  });
}

/** A tournament preset (or built-in template) as a tournament template. */
export function templateFromTournamentPreset(preset = {}, displayName) {
  const until = num(preset.reentryUntilLevel ?? DEFAULT_REENTRY_LEVEL);
  const maxR = Math.floor(num(preset.maxReentries));
  return normalizeTemplate({
    kind: TEMPLATE_KIND.TOURNAMENT,
    id: preset.id || null,
    name: displayName || preset.name,
    subtitle: preset.subtitle,
    buyIn: { amount: preset.buyIn, chips: preset.startingChips },
    structure: { sourceId: preset.id || null, name: displayName || preset.name, levels: preset.levels },
    entry: {
      cutoffLevel: until > 0 ? until : null,
      reentry: { allowed: until > 0, max: maxR > 0 ? maxR : null },
    },
    payout: { ratios: preset.payoutRatios },
    bounty: { type: BOUNTY_TYPE.NONE },
  });
}

/** Id prefix for built-in tournament templates (utils/tournamentTemplates.js). */
export const BUILT_IN_PREFIX = 'builtin:';

/** A built-in tournament template; `translate` resolves its nameKey. */
export function templateFromBuiltInTournament(builtIn, translate = (k) => k) {
  const name = translate(builtIn.nameKey);
  return {
    ...templateFromTournamentPreset({ ...builtIn, id: `${BUILT_IN_PREFIX}${builtIn.id}` }, name),
    builtIn: true,
  };
}

/** The blind structure inside a tournament preset, as a library item. */
export function structureFromTournamentPreset(preset = {}, displayName) {
  return normalizeStructure({ id: preset.id, name: displayName || preset.name, levels: preset.levels });
}

/**
 * An event period's stored preset snapshot (useSessions) as a template, so
 * periods created before templates start through the same path.
 */
export function templateFromPeriodSnapshot(type, snapshot = {}) {
  if (type === TEMPLATE_KIND.TOURNAMENT) return templateFromTournamentPreset(snapshot);
  return templateFromCashPreset(snapshot);
}

// ── into what the clock and game creation consume ──────────────────────

/**
 * useTournamentClock().createSession() config for a table made from the
 * template, or null for a cash table without a clock.
 * Translates the template's explicit rules back into the clock's legacy
 * fields (see the quirks at the top of this file).
 */
export function clockConfigFromTemplate(template, { name } = {}) {
  const t = normalizeTemplate(template);
  const tableName = name || t.name;
  if (t.kind === TEMPLATE_KIND.CASH) {
    if (!t.structure) return null;
    return {
      mode: CLOCK_MODE_TIMED,
      name: tableName,
      subtitle: '',
      buyIn: t.buyIn.chips, // timed clocks count buy-ins in chips (as LobbyView/useSessions do)
      reentryUntilLevel: t.entry.cutoffLevel ?? 0, // timed: 0 = no cutoff
      maxReentries: 0,
      levels: t.structure.levels,
      payoutRatios: [],
    };
  }
  const { reentry } = t.entry;
  let reentryUntilLevel = 0; // tournament: 0 = no re-entry
  if (reentry.allowed) {
    // "no cutoff" → one past the last level, so it never closes
    reentryUntilLevel = t.entry.cutoffLevel ?? (maxLevelNumber(t.structure?.levels) + 1);
  }
  return {
    name: tableName,
    subtitle: t.subtitle,
    buyIn: t.buyIn.amount,
    startingChips: t.buyIn.chips,
    reentryUntilLevel,
    maxReentries: reentry.allowed ? (reentry.max ?? 0) : 0, // 0 = unlimited
    levels: t.structure?.levels || [],
    payoutRatios: t.payout.ratios,
    bounty: t.bounty,
  };
}

/**
 * Arguments for gameStore.createGame() for a table made from the template.
 * Cash tables count buy-ins in chips; tournaments in currency (entry fee).
 * The caller creates the clock first (clockConfigFromTemplate) and passes its
 * id in via `tournamentSessionId`.
 */
export function gameCreationFromTemplate(template, { tournamentSessionId = null } = {}) {
  const t = normalizeTemplate(template);
  if (t.kind === TEMPLATE_KIND.CASH) {
    return {
      type: 'live',
      buyIn: t.buyIn.chips,
      options: {
        rate: templateRate(t),
        buyInAmount: t.buyIn.amount,
        cashDecimals: t.cash.decimals,
        ...(tournamentSessionId ? { tournamentSessionId } : {}),
      },
    };
  }
  return {
    type: 'tournament',
    buyIn: t.buyIn.amount,
    options: { tournamentSessionId },
  };
}

// ── merging stored templates with legacy presets ───────────────────────

/**
 * The list the UI shows: stored templates plus legacy presets converted on
 * the fly, minus legacy presets that were already saved as a template
 * (their template carries migratedFrom = '<collection>/<id>').
 *
 * @param {{templates?: Array, cashPresets?: Array, tournamentPresets?: Array}} sources
 * @returns {Array} templates, each with `source` ('template' | legacy collection)
 */
export function mergeTemplateSources({ templates = [], cashPresets = [], tournamentPresets = [] } = {}) {
  const migrated = new Set(templates.map((t) => t.migratedFrom).filter(Boolean));
  const out = templates.map((t) => ({ ...normalizeTemplate(t), source: 'template' }));
  for (const p of cashPresets) {
    if (migrated.has(`${LEGACY_SOURCE.CASH_PRESETS}/${p.id}`)) continue;
    out.push({ ...templateFromCashPreset(p), source: LEGACY_SOURCE.CASH_PRESETS });
  }
  for (const p of tournamentPresets) {
    if (migrated.has(`${LEGACY_SOURCE.TOURNAMENT_PRESETS}/${p.id}`)) continue;
    out.push({ ...templateFromTournamentPreset(p), source: LEGACY_SOURCE.TOURNAMENT_PRESETS });
  }
  return out;
}

/**
 * Blind-structure library: stored structures plus the levels inside legacy
 * tournament presets (not yet saved as a structure of their own).
 */
export function mergeStructureSources({ structures = [], tournamentPresets = [] } = {}) {
  const migrated = new Set(structures.map((s) => s.migratedFrom).filter(Boolean));
  const out = structures.map((s) => ({ ...normalizeStructure(s), migratedFrom: s.migratedFrom || null, source: 'structure' }));
  for (const p of tournamentPresets) {
    if (migrated.has(`${LEGACY_SOURCE.TOURNAMENT_PRESETS}/${p.id}`)) continue;
    out.push({ ...structureFromTournamentPreset(p), source: LEGACY_SOURCE.TOURNAMENT_PRESETS });
  }
  return out;
}

/**
 * What to write when saving a template shown from `source`: a stored
 * template keeps its id; a legacy one becomes a new template that records
 * where it came from (so the legacy entry stops appearing).
 */
export function templateForSave(template, source = 'template') {
  const t = normalizeTemplate(template);
  if (source === 'template' || !source) return t;
  return { ...t, id: null, migratedFrom: `${source}/${template.id}` };
}
