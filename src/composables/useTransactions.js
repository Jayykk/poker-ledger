import { ref, computed, watch, onUnmounted } from 'vue';
import { collection, query, where, orderBy, onSnapshot, addDoc, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase-init.js';
import { useAuth } from './useAuth.js';

/**
 * Composable for managing buy-in transactions with "who did it for whom" tracking.
 * Real-time listener on the `transactions` collection filtered by gameId.
 *
 * Writes transactions directly to Firestore for reliability.
 * Falls back to Cloud Functions if direct writes fail.
 */
export function useTransactions(gameIdRef) {
  const { user, displayName } = useAuth();
  const transactions = ref([]);
  const txLoading = ref(false);
  const txError = ref('');

  let unsubscribe = null;
  const functions = getFunctions();

  /**
   * Resolve current gameId from the ref
   */
  const resolveGameId = () => {
    return typeof gameIdRef === 'object' && gameIdRef !== null ? gameIdRef.value : gameIdRef;
  };

  // Real-time listener
  const startListening = (gameId) => {
    stopListening();
    if (!gameId) return;

    const q = query(
      collection(db, 'transactions'),
      where('gameId', '==', gameId),
      orderBy('timestamp', 'desc'),
    );

    unsubscribe = onSnapshot(q, (snap) => {
      transactions.value = snap.docs.map((d) => ({
        txId: d.id,
        ...d.data(),
        // Normalize Firestore Timestamp to millis for display
        timestamp: d.data().timestamp?.toMillis?.() || d.data().timestamp || Date.now(),
      }));
      txError.value = '';
    }, (err) => {
      console.error('[useTransactions] snapshot error:', err);
      txError.value = err.message;
    });
  };

  const stopListening = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  // Auto-start/stop when gameId ref changes
  if (gameIdRef && typeof gameIdRef === 'object' && 'value' in gameIdRef) {
    watch(gameIdRef, (newId) => {
      if (newId) {
        startListening(newId);
      } else {
        stopListening();
      }
    }, { immediate: true });
  }

  onUnmounted(() => stopListening());

  /**
   * Active (non-undone) transactions
   */
  const activeTransactions = computed(() =>
    transactions.value.filter((tx) => tx.status === 'active' && tx.type !== 'undo'),
  );

  /**
   * Total buy-in for a specific player uid
   */
  const playerTotalBuyIn = (uid) => {
    return transactions.value
      .filter((tx) => tx.status === 'active' && tx.targetUid === uid)
      .reduce((sum, tx) => sum + (tx.amount || 0), 0);
  };

  /**
   * Write a transaction document directly to Firestore.
   * Returns the document reference on success, or null on failure.
   */
  const writeTransactionDirect = async (txData) => {
    try {
      const docRef = await addDoc(collection(db, 'transactions'), {
        ...txData,
        timestamp: serverTimestamp(),
      });
      return { txId: docRef.id };
    } catch (err) {
      console.error('[useTransactions] direct write error:', err);
      return null;
    }
  };

  /**
   * Record a buy-in transaction.
   * Tries Cloud Function first; falls back to direct Firestore write.
   */
  const recordBuyIn = async (targetUid, targetName, amount, type = 'buy_in') => {
    txLoading.value = true;
    txError.value = '';
    const gameId = resolveGameId();
    if (!gameId || !targetName) {
      txError.value = 'Missing gameId or targetName';
      txLoading.value = false;
      return null;
    }

    const safeAmount = Number(amount) || 0;

    // Try Cloud Function first
    try {
      const fn = httpsCallable(functions, 'recordBuyInTx');
      const { data } = await fn({
        gameId,
        targetUid,
        targetName,
        amount: safeAmount,
        type,
      });
      txLoading.value = false;
      return data;
    } catch (cfErr) {
      console.warn('[useTransactions] CF recordBuyIn failed, using direct write:', cfErr.message);
    }

    // Fallback: write directly to Firestore
    try {
      const result = await writeTransactionDirect({
        gameId,
        targetUid: targetUid || null,
        targetName,
        actionUid: user.value?.uid || null,
        actionName: displayName.value || 'Player',
        amount: safeAmount,
        type,
        status: 'active',
        undoneBy: null,
        undoOf: null,
      });
      if (result) {
        return { success: true, ...result, fallback: true };
      }
      txError.value = 'Failed to record transaction';
      return null;
    } catch (err) {
      console.error('[useTransactions] recordBuyIn fallback error:', err);
      txError.value = err.message;
      return null;
    } finally {
      txLoading.value = false;
    }
  };

  /**
   * Record a non-buy-in action (join, modify, remove, bind).
   * Writes directly to Firestore with CF fallback.
   */
  const recordAction = async (targetUid, targetName, type, amount = 0) => {
    txLoading.value = true;
    txError.value = '';
    const gameId = resolveGameId();
    if (!gameId || !targetName) {
      txError.value = 'Missing gameId or targetName';
      txLoading.value = false;
      return null;
    }

    const safeAmount = Number(amount) || 0;

    // Try Cloud Function first
    try {
      const fn = httpsCallable(functions, 'recordBuyInTx');
      const { data } = await fn({
        gameId,
        targetUid,
        targetName,
        amount: safeAmount,
        type,
      });
      txLoading.value = false;
      return data;
    } catch (cfErr) {
      console.warn('[useTransactions] CF recordAction failed, using direct write:', cfErr.message);
    }

    // Fallback: write directly to Firestore
    try {
      const result = await writeTransactionDirect({
        gameId,
        targetUid: targetUid || null,
        targetName,
        actionUid: user.value?.uid || null,
        actionName: displayName.value || 'Player',
        amount: safeAmount,
        type,
        status: 'active',
        undoneBy: null,
        undoOf: null,
      });
      if (result) {
        return { success: true, ...result, fallback: true };
      }
      txError.value = 'Failed to record action';
      return null;
    } catch (err) {
      console.error('[useTransactions] recordAction fallback error:', err);
      txError.value = err.message;
      return null;
    } finally {
      txLoading.value = false;
    }
  };

  /**
   * Undo a previous buy-in.
   * Tries Cloud Function first; falls back to direct Firestore transaction.
   */
  const undoBuyIn = async (txId) => {
    txLoading.value = true;
    txError.value = '';

    // Try Cloud Function first
    try {
      const fn = httpsCallable(functions, 'undoBuyInTx');
      const { data } = await fn({ txId });
      txLoading.value = false;
      return data;
    } catch (cfErr) {
      console.warn('[useTransactions] CF undoBuyIn failed, using direct write:', cfErr.message);
    }

    // Fallback: use client-side Firestore transaction
    try {
      const txRef = doc(db, 'transactions', txId);
      const undoResult = await runTransaction(db, async (transaction) => {
        const txSnap = await transaction.get(txRef);
        if (!txSnap.exists()) throw new Error('Transaction not found');
        const txData = txSnap.data();
        if (txData.status !== 'active') throw new Error('Transaction already undone');

        // Mark original as undone
        transaction.update(txRef, { status: 'undone' });

        // Create undo record
        const undoRef = doc(collection(db, 'transactions'));
        transaction.set(undoRef, {
          gameId: txData.gameId,
          targetUid: txData.targetUid || null,
          targetName: txData.targetName,
          actionUid: user.value?.uid || null,
          actionName: displayName.value || 'Player',
          amount: -(txData.amount || 0),
          type: 'undo',
          status: 'active',
          undoneBy: null,
          undoOf: txId,
          timestamp: serverTimestamp(),
        });

        return { undoTxId: undoRef.id };
      });
      return { success: true, ...undoResult, fallback: true };
    } catch (err) {
      console.error('[useTransactions] undoBuyIn fallback error:', err);
      txError.value = err.message;
      return null;
    } finally {
      txLoading.value = false;
    }
  };

  /**
   * Record a transaction directly to Firestore (no Cloud Function).
   * Used for recording initial buy-ins that are already reflected in the game state.
   */
  const recordDirect = async (targetUid, targetName, type, amount = 0) => {
    const gameId = resolveGameId();
    if (!gameId || !targetName) return null;

    return writeTransactionDirect({
      gameId,
      targetUid: targetUid || null,
      targetName,
      actionUid: user.value?.uid || null,
      actionName: displayName.value || 'Player',
      amount: Number(amount) || 0,
      type,
      status: 'active',
      undoneBy: null,
      undoOf: null,
    });
  };

  return {
    transactions,
    activeTransactions,
    txLoading,
    txError,
    startListening,
    stopListening,
    playerTotalBuyIn,
    recordBuyIn,
    recordAction,
    recordDirect,
    undoBuyIn,
  };
}
