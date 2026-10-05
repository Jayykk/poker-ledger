import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { liffLink } from '../src/utils/liffLink.js';

const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf-8');

describe('liffLink: the page rides in ?__path= (no GitHub Pages 404 hop)', () => {
  it('room / report links', () => {
    expect(liffLink('ID', 'game/abc')).toBe('https://liff.line.me/ID/?__path=game%2Fabc');
    expect(liffLink('ID', '/tournament-game/abc')).toBe('https://liff.line.me/ID/?__path=tournament-game%2Fabc');
  });

  it('a page with its own query stays in one parameter', () => {
    const url = new URL(liffLink('ID', 'daily-report?start=2026-10-01&end=2026-10-05'));
    expect([...url.searchParams.keys()]).toEqual(['__path']);
    expect(url.searchParams.get('__path')).toBe('daily-report?start=2026-10-01&end=2026-10-05');
  });

  it('no Flex Message or share link builds the old path form', () => {
    for (const f of ['src/composables/useLiff.js', 'src/composables/useShare.js']) {
      expect(read(f)).not.toMatch(/https:\/\/liff\.line\.me\/\$\{LIFF_ID\}\//);
    }
  });
});

describe('main.js: ?__path= becomes the hash route without a reload', () => {
  const main = read('src/main.js');

  it('rewrites in place (old 404.html links too)', () => {
    expect(main).toMatch(/const pathFromQuery = params\.get\('__path'\);[\s\S]*?history\.replaceState\(null, '', `\$\{base\}#\/\$\{pathFromQuery\}\$\{qs\}`\);\s*return;/);
    expect(main).not.toMatch(/location\.replace\(`\$\{base\}#\/\$\{pathFromQuery\}/);
  });

  it('extra params join a page query with &', () => {
    expect(main).toContain("pathFromQuery.includes('?') ? '&' : '?'");
  });

  it('liff.state: LIFF redirects before the app boots (capped at 5 s)', () => {
    expect(main).toMatch(/has\('liff\.state'\)\) \{\s*await Promise\.race\(\[\s*initLiff\(\)\.catch\(\(\) => \{\}\),\s*new Promise\(\(r\) => setTimeout\(r, 5000\)\),/);
    // before the router reads the hash
    expect(main.indexOf("has('liff.state')")).toBeLessThan(main.indexOf('const router = createRouter('));
  });
});
