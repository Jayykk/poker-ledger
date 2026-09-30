import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  THEMES,
  THEME_IDS,
  DEFAULT_THEME,
  TAILWIND_PALETTES,
  STOPS,
  resolveThemeId,
  rampFrom,
  themePalettes,
  themeCss,
  buildThemeCss,
  hexToRgb,
  channels,
  themeSwatches,
} from '../src/utils/themes.js';

const lum = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

describe('theme list', () => {
  it('has the six themes, classic first and default', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['classic', 'premium', 'burgundy', 'neon', 'graphite', 'ivory']);
    expect(DEFAULT_THEME).toBe(THEME_IDS.CLASSIC);
    expect(THEMES.find((t) => t.id === 'ivory').mode).toBe('light');
  });

  it('every custom theme has 11 neutral stops and valid colors', () => {
    for (const t of THEMES.filter((x) => !x.tailwind)) {
      expect(t.neutral).toHaveLength(11);
      for (const hex of [...t.neutral, t.white, t.accent, t.success, t.danger, t.onAccent]) {
        expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('maps saved preferences, including the old dark / light values', () => {
    expect(resolveThemeId('premium')).toBe('premium');
    expect(resolveThemeId('dark')).toBe('classic');
    expect(resolveThemeId('light')).toBe('ivory');
    expect(resolveThemeId(null)).toBe('classic');
    expect(resolveThemeId('nope')).toBe('classic');
  });
});

describe('palettes', () => {
  it('classic is exactly Tailwind (the app looks the same as before)', () => {
    const p = themePalettes(THEMES[0]);
    for (const [name, list] of Object.entries(TAILWIND_PALETTES)) {
      expect(STOPS.map((s) => p[name][s])).toEqual(list);
    }
    expect(p.white).toBe('#ffffff');
  });

  it('ramps keep the base at 500 and get lighter toward 50', () => {
    const r = rampFrom('#c9a96e');
    expect(r[500]).toBe('#c9a96e');
    expect(lum(r[50])).toBeGreaterThan(lum(r[300]));
    expect(lum(r[300])).toBeGreaterThan(lum(r[500]));
    expect(lum(r[500])).toBeGreaterThan(lum(r[900]));
  });

  it('a light theme flips the ends of the semantic ramps', () => {
    const ivory = themePalettes(THEMES.find((t) => t.id === 'ivory'));
    // text-amber-400 was a light highlight on dark — on paper it must be darker than the base
    expect(lum(ivory.amber[400])).toBeLessThan(lum(ivory.amber[500]));
    // page (900) is light, text (100) is dark
    expect(lum(ivory.slate[900])).toBeGreaterThan(lum(ivory.slate[100]));
  });
});

describe('readability', () => {
  for (const t of THEMES) {
    const p = themePalettes(t);
    it(`${t.id}: primary and muted text are readable`, () => {
      expect(contrast(p.white, p.slate[900])).toBeGreaterThanOrEqual(7);
      expect(contrast(p.white, p.slate[800])).toBeGreaterThanOrEqual(7);
      expect(contrast(p.gray[400], p.slate[800])).toBeGreaterThanOrEqual(4.5);
    });
    it(`${t.id}: text on accent buttons is readable`, () => {
      // classic keeps its original white-on-amber buttons
      const min = t.tailwind ? 2 : 4.5;
      expect(contrast(t.onAccent, p.amber[500])).toBeGreaterThanOrEqual(min);
    });
  }
});

describe('generated CSS', () => {
  const css = buildThemeCss();

  it('defines every palette variable for every theme', () => {
    for (const t of THEMES) {
      expect(css).toContain(`:root[data-theme="${t.id}"]`);
      const block = themeCss(t);
      for (const name of ['slate', 'gray', 'amber', 'emerald', 'rose', 'red']) {
        for (const s of STOPS) expect(block).toContain(`--tw-${name}-${s}:`);
      }
      expect(block).toContain('--tw-white:');
      expect(block).toContain(`color-scheme: ${t.mode};`);
    }
  });

  it('the default theme also applies before data-theme is set', () => {
    expect(css).toContain(':root, :root[data-theme="classic"]');
  });

  it('writes channels, not hex, so opacity modifiers work', () => {
    expect(channels('#0f172a')).toBe('15 23 42');
    expect(themeCss(THEMES[0])).toContain('--tw-slate-900: 15 23 42;');
  });

  it('filled accent buttons get the theme\'s text color', () => {
    const premium = themeCss(THEMES.find((t) => t.id === 'premium'));
    expect(premium).toMatch(/:root\[data-theme="premium"\] \.bg-amber-600[,\s]/);
    // classic keeps plain white text: no override rules
    expect(themeCss(THEMES[0])).not.toContain('.bg-amber-600');
  });

  it('swatches for the picker', () => {
    expect(themeSwatches(THEMES[0])).toEqual(['#0f172a', '#1e293b', '#f59e0b', '#f43f5e', '#10b981']);
  });
});

describe('wiring', () => {
  const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf-8');

  it('tailwind maps the themed palettes to variables', () => {
    const cfg = read('tailwind.config.js');
    for (const name of ['slate', 'gray', 'amber', 'emerald', 'rose', 'red']) {
      expect(cfg).toContain(`${name}: themed('${name}')`);
    }
    expect(cfg).toContain("white: 'rgb(var(--tw-white) / <alpha-value>)'");
  });

  it('main.js injects the themes before mounting; the profile page switches them', () => {
    expect(read('src/main.js')).toMatch(/buildThemeCss\(\)[\s\S]*applyTheme\(saved\)/);
    const profile = read('src/views/ProfileView.vue');
    expect(profile).toContain('v-for="th in themeOptions"');
    expect(profile).toContain('applyTheme(id, { storageKey: STORAGE_KEYS.THEME })');
  });
});
