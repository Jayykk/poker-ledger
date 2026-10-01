/**
 * useTableTemplates — a user's table templates (開桌設定) and blind-structure
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
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase-init.js';
import { useAuthStore } from '../store/modules/auth.js';
import {
  LEGACY_SOURCE,
  mergeStructureSources,
  mergeTemplateSources,
  normalizeStructure,
  structureFromTournamentPreset,
  templateForSave,
  templateFromTournamentPreset,
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

  const isLegacy = (source) => Object.values(LEGACY_SOURCE).includes(source);

  async function writeCopy(uid, collectionName, data) {
    const ref_ = doc(collection(db, 'users', uid, collectionName));
    await setDoc(ref_, { ...data, updatedAt: serverTimestamp() });
  }

  /**
   * Remove a legacy doc ('<collection>/<id>') once one of its list items is
   * deleted. A tournament preset shows up twice — as a template and as a
   * structure — so the side that is NOT being deleted is first saved as a
   * copy of its own (unless it already was), then the legacy doc goes.
   * @param {'template'|'structure'} deleting
   */
  async function retireLegacy(uid, legacyPath, deleting) {
    const [col, legacyId] = String(legacyPath || '').split('/');
    if (!isLegacy(col) || !legacyId) return;
    const legacyRef = doc(db, 'users', uid, col, legacyId);
    if (col === LEGACY_SOURCE.TOURNAMENT_PRESETS) {
      const snap = await getDoc(legacyRef);
      if (snap.exists()) {
        const preset = { id: legacyId, ...snap.data() };
        const keep = deleting === 'template' ? STRUCTURES : TEMPLATES;
        const kept = await getDocs(query(
          collection(db, 'users', uid, keep), where('migratedFrom', '==', legacyPath), limit(1)
        ));
        if (kept.empty) {
          if (keep === STRUCTURES) {
            const { id: _id, ...structure } = structureFromTournamentPreset(preset);
            await writeCopy(uid, STRUCTURES, { ...structure, migratedFrom: legacyPath });
          } else {
            const { id: _id, ...template } = templateForSave(templateFromTournamentPreset(preset), col);
            await writeCopy(uid, TEMPLATES, template);
          }
        }
      }
    }
    await deleteDoc(legacyRef);
  }

  /**
   * Delete a template. Legacy items (and templates saved from one) also
   * retire the legacy doc, so it can't reappear in the list.
   */
  async function deleteTemplate(template) {
    const uid = requireUid();
    if (isLegacy(template.source)) {
      await retireLegacy(uid, `${template.source}/${template.id}`, 'template');
      return;
    }
    await deleteDoc(doc(db, 'users', uid, TEMPLATES, template.id));
    if (template.migratedFrom) await retireLegacy(uid, template.migratedFrom, 'template');
  }

  /** Save a blind structure (a legacy one becomes a stored copy). */
  async function saveStructure(structure, source = 'structure') {
    const uid = requireUid();
    const { id, ...data } = normalizeStructure(structure);
    const colRef = collection(db, 'users', uid, STRUCTURES);
    const isStored = !source || source === 'structure';
    const docRef = isStored && id ? doc(colRef, id) : doc(colRef);
    await setDoc(docRef, {
      ...data,
      migratedFrom: isLegacy(source) ? `${source}/${structure.id}` : (isStored ? structure.migratedFrom || null : null),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }

  /**
   * Delete a blind structure. Templates keep their own snapshot, so tables
   * and templates made from it don't change. Built-ins can't be deleted.
   */
  async function deleteStructure(structure) {
    const uid = requireUid();
    if (isLegacy(structure.source)) {
      await retireLegacy(uid, `${structure.source}/${structure.id}`, 'structure');
      return;
    }
    if (structure.source && structure.source !== 'structure') return;
    await deleteDoc(doc(db, 'users', uid, STRUCTURES, structure.id));
    if (structure.migratedFrom) await retireLegacy(uid, structure.migratedFrom, 'structure');
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
