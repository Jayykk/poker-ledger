import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  reportClientError, sanitizeReport, errorSignature, topFrame, isMilestone, MAX_NEW_ISSUES_PER_DAY,
} from '../functions/src/handlers/clientErrors.js';

// In-memory stand-in for the bits of Firestore the handler uses
function fakeDb() {
  const docs = new Map();
  const merge = (id, data) => {
    const prev = docs.get(id) || {};
    const next = { ...prev };
    for (const [k, v] of Object.entries(data)) {
      next[k] = v && v.constructor?.name === 'NumericIncrementTransform'
        ? (prev[k] || 0) + v.operand
        : v;
    }
    docs.set(id, next);
  };
  const ref = (id) => ({
    id,
    set: async (data) => merge(id, data),
  });
  return {
    docs,
    collection: () => ({ doc: (id) => ref(id) }),
    runTransaction: async (fn) => fn({
      get: async (r) => ({ exists: docs.has(r.id), data: () => docs.get(r.id) }),
      set: (r, data) => merge(r.id, data),
    }),
  };
}

function fakeGithub() {
  const calls = [];
  const fetchImpl = vi.fn(async (url, { method, body }) => {
    calls.push({ url, method, body: body && JSON.parse(body) });
    return { ok: true, json: async () => ({ number: 7 }) };
  });
  return { calls, fetchImpl };
}

const env = { ERRORS_GITHUB_TOKEN: 'tok', ERRORS_GITHUB_REPO: 'me/errors' };
const err = (msg = "TypeError: Cannot read properties of null (reading 'save')") => ({
  message: msg,
  stack: `${msg}\n    at ei (https://jayykk.github.io/poker-ledger/assets/chart-vendor-BR_H7_9u.js:11:15887)\n    at draw (https://jayykk.github.io/poker-ledger/assets/index-Abc12345.js:3:100)`,
  context: 'window:error',
  route: '/report',
  build: 'abc1234',
  userAgent: 'iPhone',
  standalone: true,
});

describe('client error reports → GitHub issues', () => {
  it('first report opens one issue in the private repo, labelled, with the details', async () => {
    const db = fakeDb();
    const gh = fakeGithub();
    const r = await reportClientError(err(), { db, uid: 'user-1234567890', env, fetchImpl: gh.fetchImpl });
    expect(r).toMatchObject({ ok: true, count: 1, issue: 7 });
    expect(gh.calls).toHaveLength(1);
    expect(gh.calls[0].url).toBe('https://api.github.com/repos/me/errors/issues');
    expect(gh.calls[0].body.labels).toEqual(['client-error']);
    expect(gh.calls[0].body.title).toContain("Cannot read properties of null (reading 'save')");
    expect(gh.calls[0].body.body).toContain('主畫面 App');
    expect(gh.calls[0].body.body).toContain('`/report`');
    expect(gh.calls[0].body.body).not.toContain('user-1234567890'); // only a prefix
  });

  it('the same error again only counts; at the milestones it comments and reopens', async () => {
    const db = fakeDb();
    const gh = fakeGithub();
    const deps = { db, uid: 'u', env, fetchImpl: gh.fetchImpl };
    await reportClientError(err(), deps); // issue
    await reportClientError(err(), deps); // 2 → comment + reopen
    await reportClientError(err(), deps); // 3 → nothing
    expect(gh.calls.map((c) => `${c.method} ${c.url.replace('https://api.github.com/repos/me/errors', '')}`)).toEqual([
      'POST /issues', 'POST /issues/7/comments', 'PATCH /issues/7',
    ]);
    expect(gh.calls[2].body).toEqual({ state: 'open' });
  });

  it('a new build (different chunk hash / line numbers) is still the same error', () => {
    const a = sanitizeReport(err());
    const b = sanitizeReport({ ...err(), stack: err().stack.replace('BR_H7_9u', 'Zz99Yy88').replace(':11:15887', ':12:4') });
    expect(errorSignature(a)).toBe(errorSignature(b));
    expect(topFrame(a.stack)).toBe('at draw (/poker-ledger/assets/index.js)');
  });

  it('without a token (or signed out) it is counted but nothing is filed', async () => {
    const db = fakeDb();
    const gh = fakeGithub();
    const r = await reportClientError(err(), { db, env: {}, fetchImpl: gh.fetchImpl });
    expect(r).toMatchObject({ ok: true, count: 1 });
    expect(gh.calls).toHaveLength(0);
  });

  it(`at most ${MAX_NEW_ISSUES_PER_DAY} new issues a day`, async () => {
    const db = fakeDb();
    const gh = fakeGithub();
    for (let i = 0; i < MAX_NEW_ISSUES_PER_DAY + 3; i++) {
      await reportClientError(err(`Error: kind ${String.fromCharCode(97 + i)}`), { db, uid: 'u', env, fetchImpl: gh.fetchImpl });
    }
    expect(gh.calls).toHaveLength(MAX_NEW_ISSUES_PER_DAY);
  });

  it('empty reports are ignored; milestones', async () => {
    expect(await reportClientError({ message: '  ' }, { db: fakeDb(), env })).toEqual({ ok: false });
    expect([1, 2, 3, 5, 10, 25, 99, 100, 200, 250].filter(isMilestone)).toEqual([2, 5, 10, 25, 100, 200]);
  });
});

describe('wiring', () => {
  const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf-8');
  it('the app reports Vue, promise and window errors', () => {
    const main = read('src/main.js');
    expect(main).toMatch(/reportGlobalError = \(err, context\) => \{[\s\S]*?reportError\(err, context\);/);
    expect(main).toContain("window.addEventListener('error'");
  });
  it('the error store is backend only; the deploy passes the token', () => {
    expect(read('firestore.rules')).toMatch(/match \/clientErrors\/\{id\} \{\s*allow read, write: if false;/);
    const wf = read('.github/workflows/firebase-deploy.yml');
    expect(wf).toContain('ERRORS_GITHUB_TOKEN: ${{ secrets.ERRORS_GITHUB_TOKEN }}');
    expect(wf).toContain('echo "ERRORS_GITHUB_TOKEN=$ERRORS_GITHUB_TOKEN" >> functions/.env');
  });
});
