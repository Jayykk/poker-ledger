/**
 * Event expenses (代墊分帳) — sessions/{sessionId}/expenses/{expenseId}.
 *
 * A subcollection rather than a field on the session: non-hosts may only touch
 * the session's rosters (see firestore.rules), while any player of the event
 * records the orders they paid for. The split maths lives in
 * utils/eventExpenses.js; this wires it to Firestore and reads receipts with
 * Gemini (same Firebase AI Logic setup as card recognition).
 */
import { ref, onUnmounted } from 'vue';
import { db } from '../firebase-init.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs,
  onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { useAuthStore } from '../store/modules/auth.js';
import { lazyGeminiJsonModel } from './useCardRecognition.js';
import {
  CardRecognitionError, RECOGNITION_ERROR, parseGeminiJson, mapAiError,
} from '../utils/cardRecognition.js';
import { RECEIPT_RESPONSE_SCHEMA, RECEIPT_PROMPT, normalizeReceipt, serializeExpense } from '../utils/eventExpenses.js';
import { fileToCompressedBase64 } from '../utils/imageCompression.js';
import { logger } from '../utils/logger.js';

const getReceiptModel = lazyGeminiJsonModel(RECEIPT_RESPONSE_SCHEMA);

/** Load firebase/ai + App Check while the picker is open. */
export function prewarmReceiptRecognition() {
  getReceiptModel().catch(() => {});
}

const expensesCol = (sessionId) => collection(db, 'sessions', sessionId, 'expenses');

const createdMs = (e) => e.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;

/** Host deleting an event: remove its expenses too (they'd be unreachable). */
export async function deleteEventExpenses(sessionId) {
  const snap = await getDocs(expensesCol(sessionId));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

export function useEventExpenses() {
  const authStore = useAuthStore();
  const expenses = ref([]);
  const recognizing = ref(false);
  let unsubscribe = null;

  function stop() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  }

  /** Live list of an event's expenses, oldest first. */
  function listen(sessionId) {
    stop();
    expenses.value = [];
    if (!sessionId) return;
    unsubscribe = onSnapshot(
      expensesCol(sessionId),
      (snap) => {
        expenses.value = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => createdMs(a) - createdMs(b));
      },
      (err) => logger.warn('[eventExpenses] listen failed', err),
    );
  }

  /**
   * Create or update an expense from an editor draft.
   * @param {string} sessionId
   * @param {object} draft editor state ({ id?, title, payerUid, lines, receiptTotal, names? })
   * @param {Array<{uid: string, name: string}>} people the event's players
   * @returns {Promise<string>} expense id
   */
  async function saveExpense(sessionId, draft, people) {
    const uid = authStore.user?.uid;
    if (!uid) throw new Error('Not authenticated');
    const data = serializeExpense(draft, people);
    if (draft.id) {
      await updateDoc(doc(db, 'sessions', sessionId, 'expenses', draft.id), {
        ...data,
        updatedAt: serverTimestamp(),
      });
      return draft.id;
    }
    const ref_ = await addDoc(expensesCol(sessionId), {
      ...data,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref_.id;
  }

  async function deleteExpense(sessionId, expenseId) {
    await deleteDoc(doc(db, 'sessions', sessionId, 'expenses', expenseId));
  }

  /**
   * Screenshot / photo of an order → receipt lines.
   * @param {File|Blob} file
   * @returns {Promise<ReturnType<typeof normalizeReceipt>>}
   * @throws {CardRecognitionError} NO_CARDS when nothing priced was found
   */
  async function recognizeReceipt(file) {
    recognizing.value = true;
    try {
      // Order screenshots are tall and the text is small: keep more pixels than for cards.
      const { data, mimeType } = await fileToCompressedBase64(file, { maxSize: 2048 });
      const model = await getReceiptModel();
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: RECEIPT_PROMPT }, { inlineData: { mimeType, data } }] }],
      });
      const receipt = normalizeReceipt(parseGeminiJson(result.response.text()));
      if (!receipt.items.length && !receipt.fees.length) {
        throw new CardRecognitionError(RECOGNITION_ERROR.NO_CARDS);
      }
      return receipt;
    } catch (e) {
      const code = mapAiError(e);
      logger.warn('[eventExpenses] receipt', code, e);
      throw e instanceof CardRecognitionError ? e : new CardRecognitionError(code, e);
    } finally {
      recognizing.value = false;
    }
  }

  onUnmounted(stop);

  return { expenses, recognizing, listen, stop, saveExpense, deleteExpense, recognizeReceipt };
}
