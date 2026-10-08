import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// poker-ledger-errors#2: the periodic reg.update() rejected on a flaky phone
// network ("Failed to update a ServiceWorker … fetching the script") and the
// unhandled rejection was filed as an app error.
const main = readFileSync(resolve(__dirname, '..', 'src/main.js'), 'utf-8');

describe('service worker update check', () => {
  it('a failed periodic check is caught, and offline skips it', () => {
    expect(main).not.toMatch(/setInterval\(\(\) => reg\.update\(\),/);
    expect(main).toContain('if (!navigator.onLine) return;');
    expect(main).toMatch(/reg\.update\(\)\.catch\(/);
  });
});
