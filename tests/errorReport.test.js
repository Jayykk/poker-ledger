import { describe, it, expect, vi, beforeEach } from 'vitest';

const deliver = vi.fn(() => Promise.resolve({ data: { ok: true } }));
const auth = { currentUser: { uid: 'u1' } };

vi.mock('../src/firebase-init.js', () => ({ functions: {}, auth }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => deliver }));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: () => () => {} }));

const store = new Map();
vi.stubGlobal('localStorage', {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
});
vi.stubGlobal('window', {
  location: { hash: '#/game/abc', pathname: '/' },
  matchMedia: () => ({ matches: false }),
  addEventListener: () => {},
});
const nav = { onLine: true, userAgent: 'test', standalone: false };
vi.stubGlobal('navigator', nav);

const { isIgnoredError, caughtFromConsoleArgs, reportError, flushQueuedErrors } = await import('../src/utils/errorReport.js');

const QUEUE_KEY = 'poker_pending_error_reports';

describe('errorReport: handled errors', () => {
  beforeEach(() => {
    deliver.mockClear();
    store.clear();
    nav.onLine = true;
    auth.currentUser = { uid: 'u1' };
  });

  it('picks the error and the catch label out of console.error args', () => {
    const err = new Error('Failed to get document because the client is offline.');
    expect(caughtFromConsoleArgs(['Check game error:', err])).toEqual({ err, label: 'Check game error' });
    expect(caughtFromConsoleArgs(['just a string'])).toBeNull();
    expect(caughtFromConsoleArgs(['@firebase/firestore: Firestore (10): Could not reach', err])).toBeNull();
  });

  it('skips expected refusals but keeps real failures', () => {
    expect(isIgnoredError('FirebaseError: Firebase: Error (auth/invalid-credential).')).toBe(true);
    expect(isIgnoredError('Error: Seat already taken')).toBe(true);
    expect(isIgnoredError('Error: BUY_IN_CLOSED')).toBe(true);
    expect(isIgnoredError('FirebaseError: Failed to get document because the client is offline.')).toBe(false);
    expect(isIgnoredError('FirebaseError: Missing or insufficient permissions.')).toBe(false);
  });

  it('sends right away when online and signed in', () => {
    reportError(new Error('boom online'), 'caught:x');
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0][0]).toMatchObject({ message: 'Error: boom online', context: 'caught:x', route: '/game/abc', online: true });
  });

  it('reports one error object once even if logged again', () => {
    const err = new Error('boom twice');
    reportError(err, 'vue:render');
    reportError(err, 'caught:[global:vue:render]');
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('keeps offline reports and sends them once back online', async () => {
    nav.onLine = false;
    reportError(new Error('client is offline'), 'caught:Check game error');
    expect(deliver).not.toHaveBeenCalled();
    const queued = JSON.parse(store.get(QUEUE_KEY));
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ online: false, context: 'caught:Check game error' });
    expect(typeof queued[0].queuedAt).toBe('number');

    await flushQueuedErrors(); // still offline: nothing
    expect(deliver).not.toHaveBeenCalled();

    nav.onLine = true;
    await flushQueuedErrors();
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(store.has(QUEUE_KEY)).toBe(false);
  });

  it('keeps a report until the server has it', async () => {
    let resolve;
    deliver.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    reportError(new Error('slow network'), 'caught:z');
    // still waiting (the app could be closed now): it's on the device
    expect(JSON.parse(store.get(QUEUE_KEY))).toHaveLength(1);
    // a flush meanwhile doesn't send it a second time
    await flushQueuedErrors();
    expect(deliver).toHaveBeenCalledTimes(1);
    resolve({ data: { ok: true } });
    await new Promise((r) => setTimeout(r, 0));
    expect(store.has(QUEUE_KEY)).toBe(false);
  });

  it('keeps a report whose send fails', async () => {
    deliver.mockImplementationOnce(() => Promise.reject(new Error('network')));
    reportError(new Error('send fails'), 'caught:y');
    await new Promise((r) => setTimeout(r, 0));
    expect(JSON.parse(store.get(QUEUE_KEY))).toHaveLength(1);
  });
});
