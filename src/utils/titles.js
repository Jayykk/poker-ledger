// 稱號 (titles) — catalog and rules shared with the Cloud Functions.
import { isCrownId } from '../../functions/src/utils/crownRules.js';
import { NAME_SET_CHUUNI, NAME_SET_CLASSIC, titleTierOf } from '../../functions/src/utils/titleRules.js';

export * from '../../functions/src/utils/titleRules.js';
// 本月王座: who leads a circle, active crowns, the current month key
export * from '../../functions/src/utils/crownRules.js';

// Rarity per tier, in bands of two over the ten steps:
// 1–2 common (gray) · 3–4 rare (blue) · 5–6 epic (purple) ·
// 7–8 legendary (gold + crown icon) · 9–10 mythic (prismatic + crown icon)
export const TITLE_RARITY = Object.freeze({
  1: 'common',
  2: 'common',
  3: 'rare',
  4: 'rare',
  5: 'epic',
  6: 'epic',
  7: 'legendary',
  8: 'legendary',
  9: 'mythic',
  10: 'mythic',
});

// The rarities lowest first (codex dots / bars)
export const TITLE_RARITIES = Object.freeze(['common', 'rare', 'epic', 'legendary', 'mythic']);

// From this tier up a badge carries the crown icon (legendary and mythic)
export const CROWN_ICON_MIN_TIER = 7;

/**
 * Rarity name of a tier ('common' for anything unknown). A 本月王座 crown has
 * its own one step and reads as legendary whatever its tier number.
 *
 * @param {number} tier Tier 1..10.
 * @param {string} [familyId] Family, so crowns can be told apart.
 * @return {string}
 */
export function titleRarity(tier, familyId = '') {
  if (familyId && isCrownId(familyId)) return 'legendary';
  return TITLE_RARITY[tier] || 'common';
}

/**
 * i18n key of a step's name in a name set, or null when the set has no names
 * of its own for it: the classic set (use the step's nameKey), and crowns,
 * which have one set of names.
 *
 * @param {string} familyId Family.
 * @param {number} tier Tier.
 * @param {?string} nameSet One of TITLE_NAME_SETS.
 * @return {?string}
 */
export function nameSetKey(familyId, tier, nameSet) {
  if (nameSet !== NAME_SET_CHUUNI || !familyId || isCrownId(familyId)) return null;
  return `titles.familiesChuuni.${familyId}.t${tier}`;
}

/**
 * A step's name in a name set, falling back to its classic name when the set
 * has none for it in this language. '' for an unknown family or step.
 *
 * @param {{t: function, te: function}} i18n useI18n()'s t and te.
 * @param {string} familyId Family.
 * @param {number} tier Tier.
 * @param {?string} [nameSet] One of TITLE_NAME_SETS (none: classic).
 * @return {string}
 */
export function titleName({ t, te }, familyId, tier, nameSet = NAME_SET_CLASSIC) {
  const step = titleTierOf(familyId, tier);
  if (!step) return '';
  const key = nameSetKey(familyId, tier, nameSet);
  return t(key && te(key) ? key : step.nameKey);
}
