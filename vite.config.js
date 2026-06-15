import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: '/poker-ledger/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Shared poker engine logic that is authoritative on the backend but also
      // imported by the client for instant, pre-flight action validation.
      // Keep anything reached through here free of firebase-admin / Node deps.
      '@engine': fileURLToPath(new URL('./functions/src/engines', import.meta.url))
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'chart-vendor': ['chart.js']
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // Rules tests need the Firestore emulator — run via `npm run test:rules`
    exclude: ['**/node_modules/**', 'tests/rules/**'],
  }
});
