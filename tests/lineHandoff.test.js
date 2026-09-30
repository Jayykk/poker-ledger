import { describe, it, expect } from 'vitest';
import {
  HANDOFF_TTL_MS,
  isStandaloneDisplay,
  channelIdFromLiffId,
  defaultCallbackUrl,
  codeChallengeFor,
  createHandoff,
  savePendingHandoff,
  loadPendingHandoff,
  clearPendingHandoff,
} from '../src/utils/lineHandoff.js';

/** In-memory Storage stand-in. */
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  };
}

const win = ({ standalone, displayMode = false } = {}) => ({
  navigator: { standalone },
  matchMedia: () => ({ matches: displayMode }),
});

describe('isStandaloneDisplay', () => {
  it('detects the iOS home-screen app', () => {
    expect(isStandaloneDisplay(win({ standalone: true }))).toBe(true);
  });

  it('detects display-mode: standalone (Android / modern iOS)', () => {
    expect(isStandaloneDisplay(win({ standalone: undefined, displayMode: true }))).toBe(true);
  });

  it('is false in a normal browser tab', () => {
    expect(isStandaloneDisplay(win({ standalone: false }))).toBe(false);
    expect(isStandaloneDisplay(undefined)).toBe(false);
  });
});

describe('channelIdFromLiffId', () => {
  it('takes the numeric channel prefix', () => {
    expect(channelIdFromLiffId('1657000000-AbCdEfGh')).toBe('1657000000');
  });

  it('returns empty for missing or malformed ids', () => {
    expect(channelIdFromLiffId('')).toBe('');
    expect(channelIdFromLiffId(undefined)).toBe('');
    expect(channelIdFromLiffId('abc')).toBe('');
  });
});

describe('defaultCallbackUrl', () => {
  it('matches the backend default', () => {
    expect(defaultCallbackUrl('asia-east1', 'proj'))
      .toBe('https://asia-east1-proj.cloudfunctions.net/lineLoginCallback');
  });
});

describe('codeChallengeFor', () => {
  it('computes the RFC 7636 S256 example', async () => {
    // RFC 7636 Appendix B test vector.
    expect(await codeChallengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'))
      .toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('createHandoff', () => {
  it('builds a PKCE authorize URL bound to a fresh state', async () => {
    const h = await createHandoff({ channelId: '123', callbackUrl: 'https://cb/x', nowMs: 5 });
    expect(h.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(h.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(h.createdAt).toBe(5);

    const url = new URL(h.authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://access.line.me/oauth2/v2.1/authorize');
    const p = url.searchParams;
    expect(p.get('response_type')).toBe('code');
    expect(p.get('client_id')).toBe('123');
    expect(p.get('redirect_uri')).toBe('https://cb/x');
    expect(p.get('state')).toBe(h.state);
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('code_challenge')).toBe(await codeChallengeFor(h.codeVerifier));
    // The verifier itself never leaves the app.
    expect(h.authorizeUrl).not.toContain(h.codeVerifier);
  });

  it('never reuses a state', async () => {
    const a = await createHandoff({ channelId: '1', callbackUrl: 'https://cb' });
    const b = await createHandoff({ channelId: '1', callbackUrl: 'https://cb' });
    expect(a.state).not.toBe(b.state);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });
});

describe('pending hand-off storage', () => {
  const handoff = { state: 's'.repeat(43), codeVerifier: 'v'.repeat(43), createdAt: 1000, authorizeUrl: 'x' };

  it('round-trips state + verifier only', () => {
    const storage = memoryStorage();
    savePendingHandoff(handoff, storage);
    expect(loadPendingHandoff(storage, 2000))
      .toEqual({ state: handoff.state, codeVerifier: handoff.codeVerifier, createdAt: 1000 });
  });

  it('drops expired hand-offs', () => {
    const storage = memoryStorage();
    savePendingHandoff(handoff, storage);
    expect(loadPendingHandoff(storage, 1000 + HANDOFF_TTL_MS)).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  it('clears and tolerates corrupt storage', () => {
    const storage = memoryStorage();
    savePendingHandoff(handoff, storage);
    clearPendingHandoff(storage);
    expect(loadPendingHandoff(storage, 2000)).toBeNull();

    storage.setItem('line_login_handoff', '{not json');
    expect(loadPendingHandoff(storage, 2000)).toBeNull();
  });
});
