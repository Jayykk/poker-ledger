// One-line summaries of blind structures and table templates for lists and
// pickers. `t` is vue-i18n's translate function.

import { formatNumber } from './formatters.js';
import { formatDuration, totalStructureSeconds } from './timedStructure.js';
import { TEMPLATE_KIND, BOUNTY_TYPE, bountyPerEntry } from './tableTemplates.js';

const playLevels = (levels = []) => levels.filter((l) => !l.isBreak).length;

/** "12 個級別 · 共 3:00:00 · 截買 Level 6" */
export function structureSummary(structure, t) {
  const levels = structure?.levels || [];
  const parts = [
    t('structure.levelsCount', { n: playLevels(levels) }),
    t('structure.totalTime', { duration: formatDuration(totalStructureSeconds(levels)) }),
  ];
  if (structure?.cutoffLevel) parts.push(t('timed.cutoff', { level: structure.cutoffLevel }));
  return parts.join(' · ');
}

/** Re-entry rule of a tournament template, e.g. "Re-entry 至 Level 7 · 最多 2 次". */
export function reentrySummary(template, t) {
  const { cutoffLevel, reentry } = template.entry || {};
  if (!reentry?.allowed) return t('template.noReentry');
  const until = cutoffLevel ? t('tournament.reentryUntil', { level: cutoffLevel }) : t('template.reentryNoCutoff');
  return reentry.max ? `${until} · ${t('template.reentryMaxN', { n: reentry.max })}` : until;
}

/** "2,000 籌碼 · $200 · ⏱ Turbo" / "$1,500 · 30,000 籌碼 · 10 個級別 · Re-entry 至 Level 7" */
export function templateSummary(template, t) {
  if (!template) return '';
  if (template.kind === TEMPLATE_KIND.CASH) {
    const parts = [
      `${formatNumber(template.buyIn.chips)} ${t('game.chips')}`,
      `$${formatNumber(template.buyIn.amount)}`,
    ];
    if (template.structure) parts.push(`⏱ ${template.structure.name || t('cashPreset.structure')}`);
    return parts.join(' · ');
  }
  const bountyType = template.bounty?.type;
  const head = bountyType === BOUNTY_TYPE.KO || bountyType === BOUNTY_TYPE.PKO ? bountyPerEntry(template.bounty, template.buyIn.amount) : 0;
  return [
    `$${formatNumber(template.buyIn.amount)}`,
    ...(head > 0 ? [`🎯 ${bountyType === BOUNTY_TYPE.PKO ? 'PKO' : 'KO'} $${formatNumber(head)}`] : []),
    `${formatNumber(template.buyIn.chips)} ${t('game.chips')}`,
    t('structure.levelsCount', { n: playLevels(template.structure?.levels) }),
    reentrySummary(template, t),
  ].join(' · ');
}
