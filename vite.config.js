import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/**
 * Stamp dist/sw.js's CACHE_NAME with the built entry-bundle hash. The hash only
 * changes when the app code changes, so every meaningful deploy ships a new
 * sw.js → the browser sees a Service Worker update → the in-app "新版本可用"
 * reload prompt fires and old caches are purged. Without this, sw.js stays
 * byte-identical across deploys and the prompt never triggers.
 */
function swCacheVersionPlugin() {
  return {
    name: 'sw-cache-version',
    apply: 'build',
    closeBundle() {
      const dist = fileURLToPath(new URL('./dist', import.meta.url));
      const swPath = `${dist}/sw.js`;
      const htmlPath = `${dist}/index.html`;
      if (!existsSync(swPath) || !existsSync(htmlPath)) return;
      const html = readFileSync(htmlPath, 'utf8');
      const m = html.match(/assets\/index-([A-Za-z0-9_-]+)\.js/);
      const version = m ? `poker-sync-${m[1]}` : `poker-sync-${Date.now().toString(36)}`;
      const sw = readFileSync(swPath, 'utf8')
        .replace(/const CACHE_NAME = '[^']*';/, `const CACHE_NAME = '${version}';`);
      writeFileSync(swPath, sw);
      console.log(`[sw-cache-version] CACHE_NAME = ${version}`);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), swCacheVersionPlugin()],
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
