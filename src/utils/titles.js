// 稱號 (titles) — catalog and rules shared with the Cloud Functions.
import { isCrownId } from '../../functions/src/utils/crownRules.js';

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
