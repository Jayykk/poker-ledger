/**
 * Tests for the home-screen app LINE Login hand-off (callback + claim).
 * Uses an in-memory Firestore stand-in; LINE's token endpoint and the
 * Firebase login step are injected.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  HANDOFF_TTL_MS,
  isValidState,
  isValidCodeVerifier,
  resolveCallbackUrl,
  evaluateHandoff,
  handleLineLoginCallback,
  exchangeLineCode,
  claimLineLoginHandoff,
} from '../../functions/src/handlers/lineLoginHandoff.js';

const NOW = 1_700_000_000_000;
const STATE = 'a'.repeat(43);
const VERIFIER = 'v'.repeat(43);

const ts = (ms) => ({ toMillis: () => ms });

/** Minimal in-memory Firestore: one flat map of "collection/id" → data. */
function fakeDb(initial = {}) {
  const store = new Map(Object.entries(initial));
  const refOf = (col, id) => {
    const key = `${col}/${id}`;
    return {
      key,
      async get() {
        return { exists: store.has(key), data: () => store.get(key) };
      },
      async create(data) {
        if (store.has(key)) throw Object.assign(new Error('exists'), { code: 6 });
        store.set(key, data);
      },
    };
  };
  return {
    store,
    collection: (col) => ({ doc: (id) => refOf(col, id) }),
    async runTransaction(fn) {
      const tx = {
        get: (ref) => ref.get(),
        update: (ref, patch) => store.set(ref.key, { ...store.get(ref.key), ...patch }),
        delete: (ref) => store.delete(ref.key),
      };
      return fn(tx);
    },
  };
}

/** Express-like response recorder. */
function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: '' };
  res.set = (h) => { Object.assign(res.headers, h); return res; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.send = (b) => { res.body = b; return res; };
  return res;
}

const key = `lineLoginHandoffs/${STATE}`;

describe('validators', () => {
  it('accepts long url-safe states only', () => {
    expect(isValidState(STATE)).toBe(true);
    expect(isValidState('short')).toBe(false);
    expect(isValidState(`${'a'.repeat(40)}/..`)).toBe(false);
    expect(isValidState(undefined)).toBe(false);
  });

  it('accepts RFC 7636 verifiers only', () => {
    expect(isValidCodeVerifier(VERIFIER)).toBe(true);
    expect(isValidCodeVerifier('a'.repeat(42))).toBe(false);
    expect(isValidCodeVerifier('a'.repeat(129))).toBe(false);
    expect(isValidCodeVerifier(`${'a'.repeat(43)} `)).toBe(false);
  });
});

describe('resolveCallbackUrl', () => {
  it('defaults to the region/project cloudfunctions.net URL', () => {
    expect(resolveCallbackUrl({ GCLOUD_PROJECT: 'proj' }))
      .toBe('https://asia-east1-proj.cloudfunctions.net/lineLoginCallback');
  });

  it('honours an explicit override', () => {
    expect(resolveCallbackUrl({ LINE_LOGIN_CALLBACK_URL: 'https://x/cb', GCLOUD_PROJECT: 'p' }))
      .toBe('https://x/cb');
  });
});

describe('evaluateHandoff', () => {
  const live = ts(NOW + 1000);
  it('is pending while missing, codeless or unconfirmed', () => {
    expect(evaluateHandoff(undefined, NOW).status).toBe('pending');
    expect(evaluateHandoff({ expireAt: live, code: 'c', confirmed: false }, NOW).status).toBe('pending');
  });

  it('is ready once confirmed', () => {
    expect(evaluateHandoff({ expireAt: live, code: 'c', confirmed: true }, NOW))
      .toEqual({ status: 'ready', code: 'c' });
  });

  it('reports cancellation and expiry', () => {
    expect(evaluateHandoff({ expireAt: live, error: 'access_denied' }, NOW).status).toBe('cancelled');
    expect(evaluateHandoff({ expireAt: ts(NOW - 1), code: 'c', confirmed: true }, NOW).status).toBe('expired');
  });
});

describe('handleLineLoginCallback', () => {
  it('parks the code unconfirmed and shows the confirm form', async () => {
    const db = fakeDb();
    const res = fakeRes();
    await handleLineLoginCallback({ method: 'GET', query: { state: STATE, code: 'CODE' } }, res, { db, nowMs: NOW });

    const doc = db.store.get(key);
    expect(doc.code).toBe('CODE');
    expect(doc.confirmed).toBe(false);
    expect(doc.expireAt.toMillis()).toBe(NOW + HANDOFF_TTL_MS);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<form method="post">');
    expect(res.body).toContain(`value="${STATE}"`);
    expect(res.headers['X-Frame-Options']).toBe('DENY');
    expect(res.headers['Referrer-Policy']).toBe('no-referrer');
  });

  it('records a cancelled login', async () => {
    const db = fakeDb();
    const res = fakeRes();
    await handleLineLoginCallback({ method: 'GET', query: { state: STATE, error: 'access_denied' } }, res, { db, nowMs: NOW });
    expect(db.store.get(key).error).toBe('access_denied');
    expect(res.body).not.toContain('<form');
  });

  it('rejects malformed requests without writing', async () => {
    const db = fakeDb();
    const res = fakeRes();
    await handleLineLoginCallback({ method: 'GET', query: { state: 'bad', code: 'C' } }, res, { db, nowMs: NOW });
    expect(res.statusCode).toBe(400);
    expect(db.store.size).toBe(0);
  });

  it('never overwrites a parked code on reload', async () => {
    const db = fakeDb({ [key]: { code: 'FIRST', confirmed: false, expireAt: ts(NOW + 1000) } });
    const res = fakeRes();
    await handleLineLoginCallback({ method: 'GET', query: { state: STATE, code: 'SECOND' } }, res, { db, nowMs: NOW });
    expect(db.store.get(key).code).toBe('FIRST');
    expect(res.body).toContain('<form method="post">');
  });

  it('confirms on POST', async () => {
    const db = fakeDb({ [key]: { code: 'CODE', confirmed: false, expireAt: ts(NOW + 1000) } });
    const res = fakeRes();
    await handleLineLoginCallback({ method: 'POST', body: { state: STATE } }, res, { db, nowMs: NOW });
    expect(db.store.get(key).confirmed).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('<form');
  });

  it('refuses to confirm an unknown or expired hand-off', async () => {
    const db = fakeDb({ [key]: { code: 'CODE', confirmed: false, expireAt: ts(NOW - 1) } });
    const res = fakeRes();
    await handleLineLoginCallback({ method: 'POST', body: { state: STATE } }, res, { db, nowMs: NOW });
    expect(db.store.get(key).confirmed).toBe(false);
    expect(res.statusCode).toBe(400);

    const res2 = fakeRes();
    await handleLineLoginCallback({ method: 'POST', body: { state: 'b'.repeat(43) } }, res2, { db, nowMs: NOW });
    expect(res2.statusCode).toBe(400);
  });
});

describe('exchangeLineCode', () => {
  it('posts the code, verifier and channel credentials', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ access_token: 'AT' }) }));
    const token = await exchangeLineCode({
      code: 'CODE',
      codeVerifier: VERIFIER,
      env: { LINE_CHANNEL_ID: '123', LINE_CHANNEL_SECRET: 'sec', GCLOUD_PROJECT: 'proj' },
      fetchImpl,
    });
    expect(token).toBe('AT');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.line.me/oauth2/v2.1/token');
    const body = new URLSearchParams(init.body);
    expect(body.get('code')).toBe('CODE');
    expect(body.get('code_verifier')).toBe(VERIFIER);
    expect(body.get('client_id')).toBe('123');
    expect(body.get('client_secret')).toBe('sec');
    expect(body.get('redirect_uri')).toBe('https://asia-east1-proj.cloudfunctions.net/lineLoginCallback');
  });

  it('fails clearly when the channel is not configured', async () => {
    await expect(exchangeLineCode({ code: 'C', codeVerifier: VERIFIER, env: {} }))
      .rejects.toThrow(/not configured/);
  });
});

describe('claimLineLoginHandoff', () => {
  const deps = (db) => ({
    db,
    nowMs: NOW,
    exchange: vi.fn(async () => 'AT'),
    login: vi.fn(async () => ({ customToken: 'CT', profile: { userId: 'U' } })),
  });

  it('stays pending (and keeps the doc) until confirmed', async () => {
    const db = fakeDb({ [key]: { code: 'CODE', confirmed: false, expireAt: ts(NOW + 1000) } });
    const d = deps(db);
    expect(await claimLineLoginHandoff({ state: STATE, codeVerifier: VERIFIER }, d)).toEqual({ status: 'pending' });
    expect(db.store.has(key)).toBe(true);
    expect(d.exchange).not.toHaveBeenCalled();
  });

  it('exchanges once confirmed and consumes the doc', async () => {
    const db = fakeDb({ [key]: { code: 'CODE', confirmed: true, expireAt: ts(NOW + 1000) } });
    const d = deps(db);
    const result = await claimLineLoginHandoff({ state: STATE, codeVerifier: VERIFIER }, d);
    expect(result).toEqual({ status: 'ok', customToken: 'CT', profile: { userId: 'U' } });
    expect(d.exchange).toHaveBeenCalledWith({ code: 'CODE', codeVerifier: VERIFIER });
    expect(d.login).toHaveBeenCalledWith('AT');
    expect(db.store.has(key)).toBe(false);

    // Single use: a replay finds nothing.
    expect((await claimLineLoginHandoff({ state: STATE, codeVerifier: VERIFIER }, d)).status).toBe('pending');
  });

  it('reports and consumes cancelled / expired hand-offs', async () => {
    const db = fakeDb({ [key]: { error: 'access_denied', expireAt: ts(NOW + 1000) } });
    expect((await claimLineLoginHandoff({ state: STATE, codeVerifier: VERIFIER }, deps(db))).status).toBe('cancelled');
    expect(db.store.has(key)).toBe(false);

    const db2 = fakeDb({ [key]: { code: 'C', confirmed: true, expireAt: ts(NOW - 1) } });
    expect((await claimLineLoginHandoff({ state: STATE, codeVerifier: VERIFIER }, deps(db2))).status).toBe('expired');
    expect(db2.store.has(key)).toBe(false);
  });

  it('rejects malformed parameters', async () => {
    await expect(claimLineLoginHandoff({ state: 'x', codeVerifier: VERIFIER }, deps(fakeDb())))
      .rejects.toThrow(/Invalid/);
    await expect(claimLineLoginHandoff({ state: STATE, codeVerifier: 'short' }, deps(fakeDb())))
      .rejects.toThrow(/Invalid/);
  });
});
