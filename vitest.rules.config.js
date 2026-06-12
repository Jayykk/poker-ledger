import { defineConfig } from 'vitest/config';

// Firestore security-rules tests. These need the Firestore emulator and are
// excluded from the default `npm test` run. Execute via `npm run test:rules`
// (wraps the run in `firebase emulators:exec`).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/rules/**/*.test.js'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
