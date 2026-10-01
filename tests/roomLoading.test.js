import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { setActivePinia, createPinia } from 'pinia';

// The game listener: tests drive it through `snap` / `fail`
let snap = null;
let fail = null;
let subscriptions = 0;
vi.mock('../src/firebase-init.js', () => ({ db: {}, auth: { currentUser: null }, functions: {}, storage: {} }));
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal()),
  doc: (_db, col, id) => ({ col, id }),
  onSnapshot: (_ref, next, error) => {
    subscriptions += 1;
    snap = (data, id = 'g1') => next({ exists: () => !!data, id, data: () => data });
    fail = (code) => error({ code });
    return () => {};
  },
}));

const { useGameStore } = await import('../src/store/modules/game.js');

describe('joining a room waits for its first snapshot', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    snap = null;
    fail = null;
    subscriptions = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('resolves true once the game is on screen; loading meanwhile', async () => {
    const store = useGameStore();
    let done = null;
    store.joinGameListener('g1').then((ok) => { done = ok; });
    expect(store.gameLoading).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(null); // not before the snapshot
    snap({ status: 'active', name: 'Poker Game', players: [], rev: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    expect(store.game?.name).toBe('Poker Game');
    expect(store.gameLoading).toBe(false);
  });

  it('a room that is gone resolves false', async () => {
    const store = useGameStore();
    const p = store.joinGameListener('g1');
    snap(null);
    expect(await p).toBe(false);
    expect(store.gameLoading).toBe(false);
  });

  it('permission-denied (sign-in still restoring) retries, staying "loading"', async () => {
    const store = useGameStore();
    const p = store.joinGameListener('g1');
    fail('permission-denied');
    expect(await p).toBe(false);
    expect(store.gameLoading).toBe(true);
    await vi.advanceTimersByTimeAsync(1600);
    expect(subscriptions).toBe(2);
    snap({ status: 'active', name: 'Poker Game', players: [], rev: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.game?.name).toBe('Poker Game');
    expect(store.gameLoading).toBe(false);
  });

  it('gives up waiting after 10 s (the listener keeps running)', async () => {
    const store = useGameStore();
    const p = store.joinGameListener('g1');
    await vi.advanceTimersByTimeAsync(10000);
    expect(await p).toBe(false);
    expect(store.gameLoading).toBe(false);
  });
});

describe('rooms show "loading" while the first snapshot is on its way', () => {
  for (const f of ['src/views/GameView.vue', 'src/views/TournamentGameView.vue']) {
    it(f, () => {
      const v = readFileSync(resolve(__dirname, '..', f), 'utf-8');
      expect(v).toContain('v-if="autoJoinLoading || (!game && gameLoading)"');
    });
  }
});

describe('charts', () => {
  it('Chart.js instances stay out of deep reactivity (shallowRef)', () => {
    const c = readFileSync(resolve(__dirname, '..', 'src/composables/useChart.js'), 'utf-8');
    expect(c).toContain('const chartInstance = shallowRef(null);');
    expect(c).not.toMatch(/const chartInstance = ref\(/);
  });
});

describe('a stuck connection never freezes the screen', () => {
  const init = readFileSync(resolve(__dirname, '..', 'src/firebase-init.js'), 'utf-8');
  const lobby = readFileSync(resolve(__dirname, '..', 'src/views/LobbyView.vue'), 'utf-8');

  it('the iOS home-screen app uses the memory cache, like the LINE webview', () => {
    expect(init).toContain('if (isLineClient || isIosHomeScreenApp) {');
    expect(init).toMatch(/isIosHomeScreenApp = isIos && isStandalone/);
  });

  it('back from the background (20 s+): a fresh Firestore connection', () => {
    expect(init).toMatch(/RECONNECT_AFTER_HIDDEN_MS[\s\S]*?disableNetwork\(db\)\.then\(\(\) => enableNetwork\(db\)\)/);
  });

  it('creating a table gives up waiting after 20 s and frees the screen', () => {
    expect(lobby).toMatch(/Promise\.race\(\[[\s\S]*?CREATE_TIMEOUT_MS[\s\S]*?if \(stuck\) \{[\s\S]*?stopLoading\(\);[\s\S]*?lobby\.createStuck/);
    expect(lobby).toMatch(/finally \{\s*clearTimeout\(timer\);\s*isCreating\.value = false;/);
  });
});
