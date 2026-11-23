/**
 * 稱號圖鑑「幾人拿到」: titleStats/global counted from every userTitles doc.
 */
import { describe, it, expect } from 'vitest';
import { titleStatsFrom, sameTitleStats } from '../functions/src/utils/titleStatsMath.js';
import { TITLE_FAMILIES, CROWN_FRAMES } from '../functions/src/utils/titleRules.js';
import { CROWN_IDS } from '../functions/src/utils/crownRules.js';

const NOV = '2026-11';

describe('titleStatsFrom', () => {
  const docs = [
    // 10 titles: bronze; regular / host on tier 5: clock / carnival
    { unlocked: { regular: { tier: 5, at: 1 }, host: { tier: 5, at: 2 } }, crowns: { crownProfit: '2026-10' } },
    { unlocked: { regular: { tier: 2, at: 1 } }, crownHistory: { crownProfit: ['2026-08'], crownLoss: ['2026-09'] } },
    // Only leading November's race: no crown won yet
    { unlocked: { regular: { tier: 1, at: 1 } }, crowns: { crownHunter: NOV } },
    // No titles at all
    { unlocked: {} },
    null,
  ];
  const stats = titleStatsFrom(docs, NOV);

  it('players: docs with a title step', () => {
    expect(stats.players).toBe(3);
  });

  it('titles: players at or above each step, every family listed', () => {
    expect(Object.keys(stats.titles).sort()).toEqual(TITLE_FAMILIES.map((f) => f.id).sort());
    expect(stats.titles.regular).toEqual([3, 2, 1, 1, 1, 0, 0, 0, 0, 0]);
    expect(stats.titles.host).toEqual([1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
    expect(stats.titles.champion).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('crowns: won at least once (a crown being led is not won)', () => {
    expect(Object.keys(stats.crowns).sort()).toEqual([...CROWN_IDS].sort());
    expect(stats.crowns).toMatchObject({ crownProfit: 2, crownLoss: 1, crownHunter: 0 });
  });

  it('frames: earned tier / themed frames, crown frames as their crown', () => {
    expect(stats.frames).toMatchObject({ bronze: 1, clock: 1, carnival: 1, mint: 2, grace: 1, reticle: 0 });
    for (const f of CROWN_FRAMES) expect(stats.frames[f.id]).toBe(stats.crowns[f.crown]);
    expect(stats.frames.silver).toBeUndefined();
  });

  it('sameTitleStats ignores key order and extra fields', () => {
    const shuffled = { updatedAt: 1, crowns: stats.crowns, frames: stats.frames, titles: stats.titles, players: 3 };
    expect(sameTitleStats(stats, shuffled)).toBe(true);
    expect(sameTitleStats(stats, { ...stats, players: 4 })).toBe(false);
    expect(sameTitleStats(null, titleStatsFrom([], NOV))).toBe(false);
  });
});
