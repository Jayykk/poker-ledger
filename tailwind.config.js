/** @type {import('tailwindcss').Config} */
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
        secondary: '#10b981'
      }
    },
  },
  plugins: [],
}
