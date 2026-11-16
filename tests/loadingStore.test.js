import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useLoadingStore } from '../src/store/modules/loading.js';
import { useLoading } from '../src/composables/useLoading.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('global loading overlay', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('stays up until every wait is done', async () => {
    const store = useLoadingStore();
    const { withLoading } = useLoading();
    const a = withLoading(() => sleep(10), 'a');
    const b = withLoading(() => sleep(40), 'b');
    await a;
    expect(store.isLoading).toBe(true);
    await b;
    expect(store.isLoading).toBe(false);
  });

  it('a timed-out wait settling late does not end a newer one', async () => {
    const store = useLoadingStore();
    const { withLoading, stopLoading } = useLoading();
    let finishSlow;
    const slow = withLoading(() => new Promise((r) => { finishSlow = r; }), 'creating');
    stopLoading(); // the create timed out: free the screen
    expect(store.isLoading).toBe(false);

    let finishNext;
    const next = withLoading(() => new Promise((r) => { finishNext = r; }), 'saving');
    finishSlow();
    await slow;
    expect(store.isLoading).toBe(true); // the newer wait still shows
    finishNext();
    await next;
    expect(store.isLoading).toBe(false);
  });

  it('a delayed spinner that never showed stops nothing', async () => {
    const store = useLoadingStore();
    const { withLoading } = useLoading();
    const long = withLoading(() => sleep(40), 'long');
    await withLoading(() => sleep(5), 'quick', { delayMs: 30 });
    expect(store.isLoading).toBe(true);
    await long;
    expect(store.isLoading).toBe(false);
  });
});
