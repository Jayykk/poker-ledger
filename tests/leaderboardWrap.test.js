/**
 * Narrow rows (a phone's large system font, LINE's in-app browser on
 * Android): the leaderboard's stat line wraps between its " · " parts, and
 * accent-filled buttons take the theme's on-accent text color.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf-8');

describe('leaderboard rows on a narrow screen', () => {
  it('every locale writes the 歐皇 line in " · " parts, the points it may wrap at', () => {
    for (const loc of ['zh-TW', 'zh-CN', 'en', 'ja']) {
      const line = JSON.parse(read(`src/i18n/locales/${loc}.json`)).friends.luckyLine;
      expect(line.split(' · ').length, loc).toBeGreaterThan(1);
    }
  });

  it('the name keeps a minimum width; the number may drop under it but never squeezes it', () => {
    const v = read('src/components/social/Leaderboard.vue');
    expect(v).toMatch(/\.lb-who \{[^}]*min-width: 4\.5em/);
    expect(v).toMatch(/\.lb-head \{[^}]*flex-wrap: wrap/);
    expect(v).toContain("...statLine(entry).split(' · ')");
  });
});

describe('稱號圖鑑 → 我的 button', () => {
  it('its text takes the on-accent color, not `white` (dark ink in a light theme)', () => {
    const v = read('src/components/titles/CodexDetail.vue');
    const rule = v.slice(v.indexOf('.cd-go {'), v.indexOf('}', v.indexOf('.cd-go {')));
    expect(rule).toContain('color: var(--on-accent)');
    expect(rule).not.toContain('--tw-white');
  });
});
