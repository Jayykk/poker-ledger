/**
 * ExpenseEditor's close (X) button and the layer it sits on: unchanged → closes
 * at once; changed → asks first, and only closes on yes. The confirm dialog
 * must sit above the editor, which must sit above the bottom nav (main.css).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils';
import { ref } from 'vue';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import zhTW from '../src/i18n/locales/zh-TW.json';

const confirm = vi.fn();
vi.mock('../src/composables/useConfirm.js', () => ({ useConfirm: () => ({ confirm }) }));
vi.mock('../src/composables/useEventExpenses.js', () => ({
  useEventExpenses: () => ({
    recognizing: ref(false),
    recognizeReceipt: vi.fn(),
    saveExpense: vi.fn(),
    deleteExpense: vi.fn(),
  }),
  prewarmReceiptRecognition: vi.fn(),
}));

const { default: ExpenseEditor } = await import('../src/components/session/ExpenseEditor.vue');
const { useAuthStore } = await import('../src/store/modules/auth.js');

const people = [{ uid: 'jay', name: 'Jay' }, { uid: 'amy', name: 'Amy' }];

function mountEditor(props = {}) {
  setActivePinia(createPinia());
  useAuthStore().user = { uid: 'jay', displayName: 'Jay' };
  const i18n = createI18n({ legacy: false, locale: 'zh-TW', messages: { 'zh-TW': zhTW } });
  return mount(ExpenseEditor, {
    props: { modelValue: true, sessionId: 's1', people, ...props },
    global: { plugins: [i18n], stubs: { Teleport: true } },
  });
}

const closeButton = (w) => w.find('.fa-times').element.closest('button');
const closed = (w) => (w.emitted('update:modelValue') || []).some(([v]) => v === false);

describe('ExpenseEditor close button', () => {
  enableAutoUnmount(afterEach);
  beforeEach(() => confirm.mockReset());

  it('closes a new, untouched expense without asking', async () => {
    const w = mountEditor();
    closeButton(w).click();
    await flushPromises();
    expect(confirm).not.toHaveBeenCalled();
    expect(closed(w)).toBe(true);
  });

  it('asks before throwing away changes, and stays open on no', async () => {
    confirm.mockResolvedValue(false);
    const w = mountEditor();
    await w.find('input[maxlength="100"]').setValue('UE 晚餐');
    closeButton(w).click();
    await flushPromises();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(closed(w)).toBe(false);

    confirm.mockResolvedValue(true);
    closeButton(w).click();
    await flushPromises();
    expect(closed(w)).toBe(true);
  });

  it('a read-only view closes without asking', async () => {
    const w = mountEditor({
      expense: { id: 'e1', title: 'x', payerUid: 'amy', createdBy: 'amy', names: { amy: 'Amy' }, lines: [] },
    });
    closeButton(w).click();
    await flushPromises();
    expect(confirm).not.toHaveBeenCalled();
    expect(closed(w)).toBe(true);
  });
});

describe('overlay layers', () => {
  const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf8');
  const zOf = (cls) => Number(cls.match(/z-\[(\d+)\]/)?.[1] ?? cls.match(/z-(\d+)/)?.[1]);

  it('confirm dialog and toasts > expense editor > bottom nav', () => {
    const nav = Number(read('src/styles/main.css').match(/\.fixed-bottom-nav \{[^}]*?z-index: (\d+)/s)?.[1]);
    const editor = zOf(read('src/components/session/ExpenseEditor.vue').match(/fixed inset-0 (z-\[\d+\])/)[1]);
    const confirmLayer = zOf(read('src/components/common/ConfirmDialog.vue').match(/layer="([^"]+)"/)[1]);
    const toast = zOf(read('src/components/common/ToastNotification.vue').match(/fixed top-4 right-4 (z-\[\d+\])/)[1]);
    expect(nav).toBe(9999);
    expect(editor).toBeGreaterThan(nav);
    expect(confirmLayer).toBeGreaterThan(editor);
    expect(toast).toBeGreaterThan(editor);
  });
});
