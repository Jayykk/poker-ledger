import { ref, computed, watch, onUnmounted } from 'vue';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase-init.js';
import { useAuth } from './useAuth.js';
import { useGameStore } from '../store/modules/game.js';

/**
 * Composable for managing buy-in transactions with "who did it for whom" tracking.
 * Real-time listener on the `transactions` collection filtered by gameId.
 *
 * Anything that moves a seat's buyIn goes through the game store's client
 * transaction (roster + audit record in one atomic write, shown on this
 * device as soon as it commits). Zero-amount log entries (join / bind /
 * remove) are plain writes. No Cloud Function round trip — the old
 * recordBuyInTx / undoBuyInTx callables cold-started for seconds.
 */
export function useTransactions(gameIdRef) {
  const { user, displayName } = useAuth();
  const gameStore = useGameStore();
  const transactions = ref([]);
  const txLoading = ref(false);
  const txError = ref('');
  const listenerReady = ref(false);

  let unsubscribe = null;

  /**
   * Resolve current gameId from the ref
   */
  const resolveGameId = () => {
    return typeof gameIdRef === 'object' && gameIdRef !== null ? gameIdRef.value : gameIdRef;
  };

  // Real-time listener
  const startListening = (gameId) => {
    stopListening();
    listenerReady.value = false;
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
      listenerReady.value = true;
    }, (err) => {
      console.error('[useTransactions] snapshot error:', err);
      txError.value = err.message;
      listenerReady.value = true;
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

  // Same stalled-stream recovery as the game listener: resubscribe when the
  // page comes back to the foreground.
  const handleVisible = () => {
    if (document.visibilityState !== 'visible' || !unsubscribe) return;
    const id = resolveGameId();
    if (id) startListening(id);
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisible);
  }

  onUnmounted(() => {
    stopListening();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisible);
    }
  });

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
   * Run a store ledger op with the composable's loading/error bookkeeping.
   * Returns the op's result, or null on failure (message in txError).
   */
  const runLedgerOp = async (label, op) => {
    txLoading.value = true;
    txError.value = '';
    try {
      return await op();
    } catch (err) {
      console.error(`[useTransactions] ${label} error:`, err);
      txError.value = err.message;
      return null;
    } finally {
      txLoading.value = false;
    }
  };

  /**
   * Record a buy-in (or add-on): moves the seat's buyIn by `amount` and logs
   * it in one transaction.
   * @returns {Promise<{success: true, txId: string, totalBuyIn: number}|null>}
   */
  const recordBuyIn = async (targetId, targetUid, targetName, amount, type = 'buy_in') => {
    const gameId = resolveGameId();
    if (!gameId || !targetName) {
      txError.value = 'Missing gameId or targetName';
      return null;
    }
    return runLedgerOp('recordBuyIn', () => gameStore.recordLedgerTx({
      gameId, targetId, targetUid, targetName, amount, type,
    }));
  };

  /**
   * Record a non-buy-in action (join, modify, remove, bind).
   * A non-zero amount (a 'modify' buy-in correction) moves the seat's buyIn
   * atomically with the log entry; `fields` (stack / name) ride along in the
   * same write. Zero-amount entries are log-only.
   */
  const recordAction = async (targetId, targetUid, targetName, type, amount = 0, fields = {}) => {
    const gameId = resolveGameId();
    if (!gameId || !targetName) {
      txError.value = 'Missing gameId or targetName';
      return null;
    }

    const safeAmount = Number(amount) || 0;
    if (safeAmount !== 0) {
      return runLedgerOp('recordAction', () => gameStore.recordLedgerTx({
        gameId, targetId, targetUid, targetName, amount: safeAmount, type, fields,
      }));
    }

    const result = await writeTransactionDirect({
      gameId,
      targetId: targetId || null,
      targetUid: targetUid || null,
      targetName,
      actionUid: user.value?.uid || null,
      actionName: displayName.value || 'Player',
      amount: 0,
      type,
      status: 'active',
      undoneBy: null,
      undoOf: null,
    });
    if (!result) txError.value = 'Failed to record action';
    return result ? { success: true, ...result } : null;
  };

  /**
   * Undo a previous buy-in: voids the record and moves the seat's buyIn back
   * in one transaction.
   * @returns {Promise<{success: true, undoTxId: string, totalBuyIn: number}|null>}
   */
  const undoBuyIn = async (txId) => {
    const gameId = resolveGameId();
    return runLedgerOp('undoBuyIn', () => gameStore.undoLedgerTx(txId, gameId));
  };

  /**
   * Record a transaction directly to Firestore (no Cloud Function).
   * Used for recording initial buy-ins that are already reflected in the game state.
   */
  const recordDirect = async (targetId, targetUid, targetName, type, amount = 0) => {
    const gameId = resolveGameId();
    if (!gameId || !targetName) return null;

    return writeTransactionDirect({
      gameId,
      targetId: targetId || null,
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
    listenerReady,
    startListening,
    stopListening,
    playerTotalBuyIn,
    recordBuyIn,
    recordAction,
    recordDirect,
    undoBuyIn,
  };
}
