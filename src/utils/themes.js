// App color themes (個人設定 → 主題).
//
// Tailwind's slate / gray / amber / emerald / rose / red / white are mapped to
// CSS variables (tailwind.config.js), so every `bg-slate-800`, `text-amber-400`,
// `bg-white/10` in the app follows the active theme. A theme supplies:
//   neutral   11 colors for the slate/gray stops 950 … 50 — from the page
//             background to the strongest text (a light theme runs light →
//             dark, so the same classes flip)
//   white     what `text-white` / `bg-white/x` mean (primary text / overlays)
//   accent    base of the amber ramp (money, clock, primary buttons)
//   success   base of the emerald ramp (re-entry, profit)
//   danger    base of the rose / red ramps (eliminate, KO, loss)
//   onAccent  text on accent-filled buttons
// The classic theme keeps Tailwind's own values, so it looks exactly like the
// app did before themes. Pure functions only (unit-tested); main.js injects
// the CSS and applyTheme() switches it.

export const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
// neutral[] order: 950, 900, 800, … 50
const NEUTRAL_STOPS = [950, 900, 800, 700, 600, 500, 400, 300, 200, 100, 50];

export const TAILWIND_PALETTES = {
  slate: ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a', '#020617'],
  gray: ['#f9fafb', '#f3f4f6', '#e5e7eb', '#d1d5db', '#9ca3af', '#6b7280', '#4b5563', '#374151', '#1f2937', '#111827', '#030712'],
  amber: ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f', '#451a03'],
  emerald: ['#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#065f46', '#064e3b', '#022c22'],
  rose: ['#fff1f2', '#ffe4e6', '#fecdd3', '#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c', '#9f1239', '#881337', '#4c0519'],
  red: ['#fef2f2', '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#450a0a'],
};
const byStop = (list) => Object.fromEntries(STOPS.map((s, i) => [s, list[i]]));

export const THEME_IDS = Object.freeze({
  CLASSIC: 'classic',
  PREMIUM: 'premium',
  BURGUNDY: 'burgundy',
  NEON: 'neon',
  GRAPHITE: 'graphite',
  IVORY: 'ivory',
});
export const DEFAULT_THEME = THEME_IDS.CLASSIC;

/** Theme definitions, in the order the picker shows them. */
export const THEMES = [
  {
    id: THEME_IDS.CLASSIC, mode: 'dark', meta: '#0f172a',
    // Tailwind's own palette — the app as it was
    tailwind: true, white: '#ffffff', onAccent: '#ffffff',
  },
  {
    id: THEME_IDS.PREMIUM, mode: 'dark', meta: '#141312',
    neutral: ['#0e0d0c', '#141312', '#1d1b18', '#2a2723', '#3a3530', '#5c554c', '#8c8479', '#b5ad9f', '#d6cfc2', '#ece6da', '#f7f3ec'],
    white: '#f5efe4', accent: '#c9a96e', success: '#8fc98a', danger: '#d98a74', onAccent: '#1b1610',
  },
  {
    id: THEME_IDS.BURGUNDY, mode: 'dark', meta: '#24090f',
    neutral: ['#1a0609', '#24090f', '#33101a', '#461925', '#5e2533', '#7d4552', '#b99a8e', '#d8bfae', '#ead8c4', '#f6ead6', '#fbf4e8'],
    white: '#fbf1e0', accent: '#e6c07a', success: '#a9d18e', danger: '#ff8f7d', onAccent: '#2b1606',
  },
  {
    id: THEME_IDS.NEON, mode: 'dark', meta: '#120e24',
    neutral: ['#0b0818', '#120e24', '#1c1736', '#2b2450', '#3c3469', '#5d5590', '#9b93c4', '#bdb6e0', '#d9d4f2', '#ece9ff', '#f7f5ff'],
    white: '#f5f3ff', accent: '#ff4fa3', success: '#3ee6ff', danger: '#ff7a59', onAccent: '#2a0418',
  },
  {
    id: THEME_IDS.GRAPHITE, mode: 'dark', meta: '#17191d',
    neutral: ['#0f1114', '#17191d', '#202329', '#2d3139', '#3d424c', '#5e6470', '#8b919c', '#b3b8c1', '#d4d7dc', '#eceef1', '#f7f8f9'],
    white: '#ffffff', accent: '#ff8a3d', success: '#5cc98c', danger: '#ff6b5e', onAccent: '#2a1203',
  },
  {
    id: THEME_IDS.IVORY, mode: 'light', meta: '#f6f2ea',
    // page → ink (a light theme runs the neutral ramp the other way)
    neutral: ['#fbf8f2', '#f6f2ea', '#ffffff', '#efe8db', '#e2d9c8', '#c9bfae', '#756d61', '#5c554b', '#4a443b', '#2b2823', '#1a1815'],
    white: '#22201c', accent: '#1f4e8c', success: '#2d7a4f', danger: '#b8322a', onAccent: '#ffffff',
  },
];

const themeById = (id) => THEMES.find((t) => t.id === id);

/** Saved preference → theme id (the old dark / light values map over). */
export function resolveThemeId(saved) {
  if (themeById(saved)) return saved;
  if (saved === 'light') return THEME_IDS.IVORY;
  return DEFAULT_THEME;
}

// ── color math ─────────────────────────────────────────────────────────

export function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** "r g b" — the form `rgb(var(--x) / <alpha-value>)` needs. */
export const channels = (hex) => hexToRgb(hex).join(' ');

function mix(hex, toward, amount) {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * amount));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// How far each stop moves from the base (500) toward white / black
const LIGHTEN = { 50: 0.92, 100: 0.84, 200: 0.68, 300: 0.48, 400: 0.24 };
const DARKEN = { 600: 0.16, 700: 0.32, 800: 0.48, 900: 0.62, 950: 0.78 };

/** A Tailwind-like 50 … 950 ramp around a base color (the 500). */
export function rampFrom(base) {
  return Object.fromEntries(STOPS.map((s) => {
    if (LIGHTEN[s]) return [s, mix(base, '#ffffff', LIGHTEN[s])];
    if (DARKEN[s]) return [s, mix(base, '#000000', DARKEN[s])];
    return [s, base];
  }));
}

// Light themes: classes written for a dark page (text-amber-300, bg-amber-900/30)
// need the other end of the ramp.
const LIGHT_MODE_STOP = { 50: 900, 100: 800, 200: 800, 300: 700, 400: 600, 500: 500, 600: 600, 700: 200, 800: 100, 900: 100, 950: 50 };

function semanticRamp(base, mode) {
  const ramp = rampFrom(base);
  if (mode !== 'light') return ramp;
  return Object.fromEntries(STOPS.map((s) => [s, ramp[LIGHT_MODE_STOP[s]]]));
}

/** Every palette a theme defines: { slate: {50: hex, …}, …, white: hex }. */
export function themePalettes(theme) {
  if (theme.tailwind) {
    return {
      ...Object.fromEntries(Object.entries(TAILWIND_PALETTES).map(([name, list]) => [name, byStop(list)])),
      white: theme.white,
    };
  }
  const neutral = Object.fromEntries(NEUTRAL_STOPS.map((s, i) => [s, theme.neutral[i]]));
  const danger = semanticRamp(theme.danger, theme.mode);
  return {
    slate: neutral,
    gray: neutral,
    amber: semanticRamp(theme.accent, theme.mode),
    emerald: semanticRamp(theme.success, theme.mode),
    rose: danger,
    red: danger,
    white: theme.white,
  };
}

export const PALETTE_NAMES = ['slate', 'gray', 'amber', 'emerald', 'rose', 'red'];

// Filled buttons whose text is `text-white`: accent fills take the theme's
// onAccent; other fills keep real white (a light theme's `white` is ink).
const ACCENT_FILLS = [400, 500, 600, 700].map((s) => `.bg-amber-${s}`);
const OTHER_FILLS = ['emerald', 'rose', 'red', 'blue', 'sky', 'purple']
  .flatMap((p) => [500, 600, 700].map((s) => `.bg-${p}-${s}`));

// Covers the fill itself too: plenty of filled buttons have no text class and
// inherit the page text color, which a light theme turns dark.
function onFillRules(sel, fills, color) {
  const targets = fills.flatMap((f) => [`${sel} ${f}`, `${sel} ${f} .text-white`]);
  return `${targets.join(',\n')} { color: ${color} !important; }`;
}

/** CSS for one theme: palette variables + the legacy --bg- / --text- vars. */
export function themeCss(theme) {
  const sel = `:root[data-theme="${theme.id}"]`;
  // The default theme also covers a document with no data-theme yet
  const block = theme.id === DEFAULT_THEME ? `:root, ${sel}` : sel;
  const p = themePalettes(theme);
  const vars = [];
  for (const name of PALETTE_NAMES) {
    for (const s of STOPS) vars.push(`--tw-${name}-${s}: ${channels(p[name][s])};`);
  }
  vars.push(`--tw-white: ${channels(p.white)};`);
  // Older styles (main.css, glass, cards) read these
  vars.push(
    `--bg-primary: ${p.slate[900]};`, `--bg-secondary: ${p.slate[800]};`, `--bg-tertiary: ${p.slate[700]};`,
    `--text-primary: ${p.slate[100]};`, `--text-secondary: ${p.slate[300]};`, `--text-tertiary: ${p.slate[400]};`,
    `--border-color: ${p.slate[600]};`, `--accent-primary: ${p.amber[500]};`,
    `--accent-secondary: ${p.emerald[500]};`, `--accent-danger: ${p.red[500]};`,
    `--on-accent: ${theme.onAccent};`,
    `color-scheme: ${theme.mode};`,
  );
  const rules = [`${block} {\n  ${vars.join('\n  ')}\n}`];
  if (channels(theme.onAccent) !== channels(p.white)) {
    rules.push(onFillRules(sel, ACCENT_FILLS, theme.onAccent));
  }
  if (theme.mode === 'light' || channels(theme.white) !== '255 255 255') {
    rules.push(onFillRules(sel, OTHER_FILLS, '#ffffff'));
  }
  return rules.join('\n');
}

/** All themes' CSS (main.js injects it once). */
export function buildThemeCss(themes = THEMES) {
  return themes.map(themeCss).join('\n\n');
}

/** Switch the document to a theme (and remember it). */
export function applyTheme(id, { storageKey } = {}) {
  const theme = themeById(resolveThemeId(id));
  if (typeof document === 'undefined') return theme.id;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme.id);
  root.setAttribute('data-mode', theme.mode);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme.meta);
  if (storageKey) {
    try { localStorage.setItem(storageKey, theme.id); } catch { /* private mode */ }
  }
  return theme.id;
}

/** A few swatches for the picker: page, card, accent, danger, success. */
export function themeSwatches(theme) {
  const p = themePalettes(theme);
  return [p.slate[900], p.slate[800], p.amber[500], p.rose[500], p.emerald[500]];
}
