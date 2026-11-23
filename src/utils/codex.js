// 稱號圖鑑: where a player stands on each 頭像框, and how many in a group of
// players (the 牌友圈) hold a title step / frame / crown. Pure, shared by
// TitlesView and its detail dialog.
import {
  CROWN_FRAMES, CROWN_IDS, FRAME_TIERS, THEME_FRAMES, TITLE_TIER_COUNT, crownCtxOf, getCrownFrame,
  getThemeFrame, lastingFrames, titleCount, wonCrownMonths, wornCrowns,
} from './titles.js';

// The three kinds, in the order the codex and the picker list them
export const FRAME_KINDS = Object.freeze(['tier', 'theme', 'crown']);

/**
 * Kind of a frame id.
 *
 * @param {string} id Frame id.
 * @return {?string} 'tier' | 'theme' | 'crown', null when unknown.
 */
export function frameKind(id) {
  if (getCrownFrame(id)) return 'crown';
  if (getThemeFrame(id)) return 'theme';
  return FRAME_TIERS.some((f) => f.id === id) ? 'tier' : null;
}

/**
 * Frame ids of a kind, catalog order.
 *
 * @param {string} kind One of FRAME_KINDS.
 * @return {Array<string>}
 */
export function framesOfKind(kind) {
  if (kind === 'tier') return FRAME_TIERS.map((f) => f.id);
  if (kind === 'theme') return THEME_FRAMES.map((f) => f.id);
  if (kind === 'crown') return CROWN_FRAMES.map((f) => f.id);
  return [];
}

/**
 * Where a player stands on a frame.
 *
 * earned: can wear it now. at: when it was first earned (millis; 0 = earned
 * before that was recorded; null = no time, e.g. not earned). progress:
 * { value, goal } towards it (tier: titles held / needed; theme: the
 * family's tier / the tier needed). Crown frames: wonMonths (months the crown
 * was won, ascending; worn the month after each) and wornFrom (the won month
 * that is worn right now, or null).
 *
 * @param {string} id Frame id.
 * @param {?object} doc The player's userTitles entry.
 * @param {string} month Current month key.
 * @return {?{kind: string, earned: boolean, at: ?number,
 *   progress: ?{value: number, goal: number}, wonMonths: Array<string>,
 *   wornFrom: ?string}}
 */
export function frameStatus(id, doc, month) {
  const kind = frameKind(id);
  if (!kind) return null;
  const stored = doc?.frames?.[id];
  const at = Number.isFinite(stored) ? stored : null;
  if (kind === 'crown') {
    const { crown } = getCrownFrame(id);
    const wonMonths = wonCrownMonths(doc, crown, month);
    const earned = wornCrowns(crownCtxOf(doc, month)).includes(crown);
    return {
      kind, earned, at: null, progress: null, wonMonths, wornFrom: earned ? wonMonths[wonMonths.length - 1] : null,
    };
  }
  const earned = lastingFrames(doc?.unlocked).includes(id);
  const progress = kind === 'tier'
    ? { value: titleCount(doc?.unlocked), goal: FRAME_TIERS.find((f) => f.id === id).min }
    : { value: Number(doc?.unlocked?.[getThemeFrame(id).family]?.tier) || 0, goal: getThemeFrame(id).minTier };
  return {
    kind, earned, at: earned ? (at ?? 0) : null, progress, wonMonths: [], wornFrom: null,
  };
}

/**
 * In a group of players: how many are at or above each step of a family.
 *
 * @param {Array<?object>} docs userTitles entries.
 * @param {string} familyId Family.
 * @return {Array<number>} TITLE_TIER_COUNT counts, step 1 first.
 */
export function stepCounts(docs, familyId) {
  const counts = Array(TITLE_TIER_COUNT).fill(0);
  for (const doc of docs || []) {
    const tier = Math.min(Number(doc?.unlocked?.[familyId]?.tier) || 0, TITLE_TIER_COUNT);
    for (let step = 1; step <= tier; step += 1) counts[step - 1] += 1;
  }
  return counts;
}

/**
 * In a group of players: how many earned a frame (a crown frame: won its
 * crown at least once, like titleStats).
 *
 * @param {Array<?object>} docs userTitles entries.
 * @param {string} frameId Frame.
 * @param {string} month Current month key.
 * @return {number}
 */
export function frameCount(docs, frameId, month) {
  const crown = getCrownFrame(frameId)?.crown;
  return (docs || []).filter((doc) => (crown
    ? wonCrownMonths(doc, crown, month).length > 0
    : lastingFrames(doc?.unlocked).includes(frameId))).length;
}

/**
 * In a group of players: who wears a crown this month (won it last month).
 *
 * @param {Array<{uid: string, doc: ?object}>} members Players.
 * @param {string} crownId Crown.
 * @param {string} month Current month key.
 * @return {Array<string>} uids.
 */
export function crownWearers(members, crownId, month) {
  if (!CROWN_IDS.includes(crownId)) return [];
  return (members || [])
    .filter(({ doc }) => wornCrowns(crownCtxOf(doc, month)).includes(crownId))
    .map(({ uid }) => uid);
}

/**
 * A month key as shown ('2026-10' → '2026/10').
 *
 * @param {string} month Month key.
 * @return {string}
 */
export function monthLabel(month) {
  return typeof month === 'string' ? month.replace('-', '/') : '';
}
