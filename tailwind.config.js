/** @type {import('tailwindcss').Config} */

// Theme-able palettes: each stop reads a CSS variable ("r g b") that the
// active theme sets (src/utils/themes.js), so opacity modifiers like
// bg-slate-800/90 keep working. Other palettes (blue, sky, purple, …) stay
// Tailwind's own.
const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const themed = (name) => Object.fromEntries(
  STOPS.map((stop) => [stop, `rgb(var(--tw-${name}-${stop}) / <alpha-value>)`])
);

export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Noto Sans TC', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      colors: {
        primary: '#f59e0b',
        secondary: '#10b981',
        slate: themed('slate'),
        gray: themed('gray'),
        amber: themed('amber'),
        emerald: themed('emerald'),
        rose: themed('rose'),
        red: themed('red'),
        white: 'rgb(var(--tw-white) / <alpha-value>)',
      }
    },
  },
  plugins: [],
}
