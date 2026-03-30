import { ref, computed, watch, onUnmounted } from 'vue';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase-init.js';
import { useAuth } from './useAuth.js';

/**
 * Composable for managing buy-in transactions with "who did it for whom" tracking.
 * Real-time listener on the `transactions` collection filtered by gameId.
 */
export function useTransactions(gameIdRef) {
  const { user, displayName } = useAuth();
  const transactions = ref([]);
  const txLoading = ref(false);
  const txError = ref('');

  let unsubscribe = null;
  const functions = getFunctions();

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
   * Record a buy-in via Cloud Function
   */
  const recordBuyIn = async (targetUid, targetName, amount, type = 'buy_in') => {
    txLoading.value = true;
    txError.value = '';
    try {
      const fn = httpsCallable(functions, 'recordBuyInTx');
      const { data } = await fn({
        gameId: typeof gameIdRef === 'object' ? gameIdRef.value : gameIdRef,
        targetUid,
        targetName,
        amount,
        type,
      });
      return data;
    } catch (err) {
      console.error('[useTransactions] recordBuyIn error:', err);
      txError.value = err.message;
      return null;
    } finally {
      txLoading.value = false;
    }
  };

  /**
   * Undo a previous buy-in via Cloud Function
   */
  const undoBuyIn = async (txId) => {
    txLoading.value = true;
    txError.value = '';
    try {
      const fn = httpsCallable(functions, 'undoBuyInTx');
      const { data } = await fn({ txId });
      return data;
    } catch (err) {
      console.error('[useTransactions] undoBuyIn error:', err);
      txError.value = err.message;
      return null;
    } finally {
      txLoading.value = false;
    }
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
    undoBuyIn,
  };
}
