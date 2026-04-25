import { ref } from 'vue';
import {
  doc,
  updateDoc,
  addDoc,
  getDocs,
  collection,
  serverTimestamp,
  query,
  orderBy,
  limit,
  getDoc,
} from 'firebase/firestore';
import { db } from '../firebase-init.js';
import { useAuthStore } from '../store/modules/auth.js';

/**
 * Composable for saving game / tournament config with version history.
 *
 * Every successful config update writes a record to:
 *   `{parentCollection}/{parentId}/configVersions/{versionId}`
 *
 * Each version record contains:
 *   targetId, targetType, before, after, editorUid, editorName, timestamp, reason
 */
export function useConfigEditor() {
  const authStore = useAuthStore();
  const saving = ref(false);
  const error = ref('');

  function _getNestedValue(obj, dotPath) {
    return dotPath.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
  }

  function _normalizePokerGameRollback(target) {
    if (!target || typeof target !== 'object') return {};

    const normalized = {};
    const candidate = target.meta && typeof target.meta === 'object' ? target.meta : target;

    if (candidate.blinds && typeof candidate.blinds === 'object') {
      if (Object.prototype.hasOwnProperty.call(candidate.blinds, 'small')) {
        normalized['meta.blinds.small'] = candidate.blinds.small;
      }
      if (Object.prototype.hasOwnProperty.call(candidate.blinds, 'big')) {
        normalized['meta.blinds.big'] = candidate.blinds.big;
      }
    }

    const fieldMap = {
      minBuyIn: 'meta.minBuyIn',
      maxBuyIn: 'meta.maxBuyIn',
      notes: 'meta.notes',
    };

    for (const [sourceKey, targetKey] of Object.entries(fieldMap)) {
      if (Object.prototype.hasOwnProperty.call(candidate, sourceKey)) {
        normalized[targetKey] = candidate[sourceKey];
      }
    }

    for (const [key, value] of Object.entries(target)) {
      if (key.startsWith('meta.') && key !== 'meta.maxPlayers') {
        normalized[key] = value;
      }
    }

    return normalized;
  }

  async function _writeVersion(parentCollection, parentId, targetType, before, after, reason) {
    await addDoc(collection(db, parentCollection, parentId, 'configVersions'), {
      targetId: parentId,
      targetType,
      before,
      after,
      editorUid: authStore.user?.uid || 'anonymous',
      editorName: authStore.displayName || 'anonymous',
      timestamp: serverTimestamp(),
      reason: reason || '',
    });
  }

  async function getConfigVersions(parentCollection, parentId, maxResults = 20) {
    const q = query(
      collection(db, parentCollection, parentId, 'configVersions'),
      orderBy('timestamp', 'desc'),
      limit(maxResults)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  /**
   * Supports both the `games` collection (flat schema) and the `pokerGames`
   * collection (nested `meta` schema). Callers may omit the collection and
   * default to `pokerGames` for backward compatibility.
   */
  async function saveGameConfig(parentCollectionOrGameId, gameIdOrUpdates, maybeUpdates, before, reason) {
    let parentCollection = 'pokerGames';
    let gameId = parentCollectionOrGameId;
    let updates = gameIdOrUpdates;
    let snapshotBefore = maybeUpdates;
    let changeReason = before;

    if (parentCollectionOrGameId === 'games' || parentCollectionOrGameId === 'pokerGames') {
      parentCollection = parentCollectionOrGameId;
      gameId = gameIdOrUpdates;
      updates = maybeUpdates;
      snapshotBefore = before;
      changeReason = reason;
    }

    if (!gameId) throw new Error('Missing gameId');
    saving.value = true;
    error.value = '';
    try {
      const gameRef = doc(db, parentCollection, gameId);
      await updateDoc(gameRef, { ...updates, updatedAt: serverTimestamp() });
      await _writeVersion(parentCollection, gameId, 'cash', snapshotBefore, updates, changeReason);
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function saveTournamentConfig(sessionId, newConfig, before, reason) {
    if (!sessionId) throw new Error('Missing sessionId');
    saving.value = true;
    error.value = '';
    try {
      const sessionRef = doc(db, 'tournamentSessions', sessionId);
      await updateDoc(sessionRef, { config: newConfig, updatedAt: serverTimestamp() });
      await _writeVersion('tournamentSessions', sessionId, 'tournament', before, newConfig, reason);
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function rollbackToVersion(parentCollection, parentId, versionId, reason) {
    saving.value = true;
    error.value = '';
    try {
      const versionSnap = await getDoc(
        doc(db, parentCollection, parentId, 'configVersions', versionId)
      );
      if (!versionSnap.exists()) throw new Error('Version not found');

      const version = versionSnap.data();
      const rollbackTarget = version.before;

      const currentSnap = await getDoc(doc(db, parentCollection, parentId));
      if (!currentSnap.exists()) throw new Error('Target document not found');

      const currentData = currentSnap.data();

      if (parentCollection === 'tournamentSessions') {
        const currentConfig = currentData.config || {};
        await updateDoc(doc(db, parentCollection, parentId), {
          config: rollbackTarget,
          updatedAt: serverTimestamp(),
        });
        await _writeVersion(
          parentCollection,
          parentId,
          'tournament',
          currentConfig,
          rollbackTarget,
          reason || `Rollback to version ${versionId}`
        );
      } else if (parentCollection === 'pokerGames') {
        const normalizedRollback = _normalizePokerGameRollback(rollbackTarget);
        const currentBefore = {};

        for (const key of Object.keys(normalizedRollback)) {
          currentBefore[key] = _getNestedValue(currentData, key);
        }

        await updateDoc(doc(db, parentCollection, parentId), {
          ...normalizedRollback,
          updatedAt: serverTimestamp(),
        });
        await _writeVersion(
          parentCollection,
          parentId,
          'cash',
          currentBefore,
          normalizedRollback,
          reason || `Rollback to version ${versionId}`
        );
      } else {
        const currentBefore = {};

        for (const key of Object.keys(rollbackTarget)) {
          currentBefore[key] = currentData[key];
        }

        await updateDoc(doc(db, parentCollection, parentId), {
          ...rollbackTarget,
          updatedAt: serverTimestamp(),
        });
        await _writeVersion(
          parentCollection,
          parentId,
          'cash',
          currentBefore,
          rollbackTarget,
          reason || `Rollback to version ${versionId}`
        );
      }
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      saving.value = false;
    }
  }

  return {
    saving,
    error,
    getConfigVersions,
    saveGameConfig,
    saveTournamentConfig,
    rollbackToVersion,
  };
}
