/**
 * useCashPresets — manage a user's reusable cash table presets.
 *
 * Each preset stores only the two pieces of info the user wants to fix up-front:
 *   - buyIn  : default buy-in chip count (numeric, > 0)
 *   - rate   : settlement exchange rate (numeric, > 0; 1 means chips == currency)
 *
 * Stored at: users/{uid}/cashPresets/{presetId}
 *
 * Mirrors the shape used by tournament presets (see useTournamentClock.js)
 * so the lobby's "Create Game" picker can use the same UI affordances.
 */
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase-init.js';
import { useAuthStore } from '../store/modules/auth.js';

export function useCashPresets() {
  const authStore = useAuthStore();

  /**
   * Create or update a preset.
   * @param {{ name: string, buyIn: number, rate: number }} presetData
   * @param {?string} presetId — when omitted, a new doc id is generated
   * @returns {Promise<string>} the doc id
   */
  async function savePreset(presetData, presetId = null) {
    const uid = authStore.user?.uid;
    if (!uid) throw new Error('Not authenticated');
    const colRef = collection(db, 'users', uid, 'cashPresets');
    const docRef = presetId ? doc(colRef, presetId) : doc(colRef);
    await setDoc(
      docRef,
      {
        ...presetData,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return docRef.id;
  }

  async function deletePreset(presetId) {
    const uid = authStore.user?.uid;
    if (!uid) throw new Error('Not authenticated');
    await deleteDoc(doc(db, 'users', uid, 'cashPresets', presetId));
  }

  /**
   * Subscribe to preset list changes.
   * @param {(presets: Array) => void} callback
   * @returns {() => void} unsubscribe
   */
  function listenPresets(callback) {
    const uid = authStore.user?.uid;
    if (!uid) return () => {};
    const colRef = collection(db, 'users', uid, 'cashPresets');
    return onSnapshot(colRef, (snap) => {
      const presets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(presets);
    });
  }

  return {
    savePreset,
    deletePreset,
    listenPresets,
  };
}
