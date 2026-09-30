/**
 * useTableTemplates — a user's table templates (開桌範本) and blind-structure
 * library (盲注結構).
 *
 * Stored at:
 *   users/{uid}/tableTemplates/{id}    normalizeTemplate() shape
 *   users/{uid}/blindStructures/{id}   normalizeStructure() shape
 *
 * Until every screen moves over, the legacy collections (cashPresets,
 * tournamentPresets) are read alongside and converted on the fly (see
 * mergeTemplateSources). Saving a legacy item writes a new template with
 * `migratedFrom`, which hides the legacy one; nothing is bulk-migrated and
 * the legacy docs are left for the screens that still use them.
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
import {
  LEGACY_SOURCE,
  mergeStructureSources,
  mergeTemplateSources,
  normalizeStructure,
  templateForSave,
} from '../utils/tableTemplates.js';

const TEMPLATES = 'tableTemplates';
const STRUCTURES = 'blindStructures';

export function useTableTemplates() {
  const authStore = useAuthStore();

  const requireUid = () => {
    const uid = authStore.user?.uid;
    if (!uid) throw new Error('Not authenticated');
    return uid;
  };

  const docsOf = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  /**
   * Listen to several user subcollections and call back with the merged
   * result whenever any of them changes (after all have loaded once).
   */
  function listenMerged(names, merge, callback) {
    const uid = authStore.user?.uid;
    if (!uid) return () => {};
    const latest = {};
    const unsubs = names.map((name) =>
      onSnapshot(collection(db, 'users', uid, name), (snap) => {
        latest[name] = docsOf(snap);
        if (names.every((n) => latest[n])) callback(merge(latest));
      })
    );
    return () => unsubs.forEach((u) => u());
  }

  /** Templates (stored + legacy), each tagged with `source`. */
  function listenTemplates(callback) {
    return listenMerged(
      [TEMPLATES, LEGACY_SOURCE.CASH_PRESETS, LEGACY_SOURCE.TOURNAMENT_PRESETS],
      (l) => mergeTemplateSources({
        templates: l[TEMPLATES],
        cashPresets: l[LEGACY_SOURCE.CASH_PRESETS],
        tournamentPresets: l[LEGACY_SOURCE.TOURNAMENT_PRESETS],
      }),
      callback
    );
  }

  /** Blind structures (stored + the levels of legacy tournament presets). */
  function listenStructures(callback) {
    return listenMerged(
      [STRUCTURES, LEGACY_SOURCE.TOURNAMENT_PRESETS],
      (l) => mergeStructureSources({
        structures: l[STRUCTURES],
        tournamentPresets: l[LEGACY_SOURCE.TOURNAMENT_PRESETS],
      }),
      callback
    );
  }

  /**
   * Save a template. `source` is the list item's source: a legacy item is
   * saved as a new template that replaces it in the list.
   * @returns {Promise<string>} template id
   */
  async function saveTemplate(template, source = 'template') {
    const uid = requireUid();
    const { id, source: _s, builtIn: _b, ...data } = templateForSave(template, source);
    const colRef = collection(db, 'users', uid, TEMPLATES);
    const docRef = id ? doc(colRef, id) : doc(colRef);
    await setDoc(docRef, { ...data, updatedAt: serverTimestamp() });
    return docRef.id;
  }

  /**
   * Delete a template. A legacy item deletes its legacy doc; a stored
   * template made from a legacy one deletes that too, so it can't reappear.
   */
  async function deleteTemplate(template) {
    const uid = requireUid();
    if (template.source && template.source !== 'template') {
      await deleteDoc(doc(db, 'users', uid, template.source, template.id));
      return;
    }
    await deleteDoc(doc(db, 'users', uid, TEMPLATES, template.id));
    if (template.migratedFrom) {
      const [col, legacyId] = template.migratedFrom.split('/');
      if (Object.values(LEGACY_SOURCE).includes(col) && legacyId) {
        await deleteDoc(doc(db, 'users', uid, col, legacyId));
      }
    }
  }

  /** Save a blind structure (a legacy one becomes a stored copy). */
  async function saveStructure(structure, source = 'structure') {
    const uid = requireUid();
    const { id, ...data } = normalizeStructure(structure);
    const fromLegacy = source && source !== 'structure';
    const colRef = collection(db, 'users', uid, STRUCTURES);
    const docRef = !fromLegacy && id ? doc(colRef, id) : doc(colRef);
    await setDoc(docRef, {
      ...data,
      migratedFrom: fromLegacy ? `${source}/${structure.id}` : (structure.migratedFrom || null),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }

  /**
   * Delete a stored blind structure. Templates keep their own snapshot, so
   * nothing else changes. Legacy structures live inside a tournament preset
   * and go away with it (deleteTemplate).
   */
  async function deleteStructure(structure) {
    const uid = requireUid();
    if (structure.source && structure.source !== 'structure') return;
    await deleteDoc(doc(db, 'users', uid, STRUCTURES, structure.id));
  }

  return {
    listenTemplates,
    listenStructures,
    saveTemplate,
    deleteTemplate,
    saveStructure,
    deleteStructure,
  };
}
