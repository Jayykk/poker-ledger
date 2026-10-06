// 稱號 (titles) — catalog and rules shared with the Cloud Functions.
export * from '../../functions/src/utils/titleRules.js';

// Rarity per tier: 1 common (gray) · 2 rare (blue) · 3 epic (purple) · 4 legendary (gold)
export const TITLE_RARITY = Object.freeze({ 1: 'common', 2: 'rare', 3: 'epic', 4: 'legendary' });

/** Rarity name of a tier ('common' for anything unknown). */
export function titleRarity(tier) {
  return TITLE_RARITY[tier] || 'common';
}
