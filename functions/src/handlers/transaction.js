/**
 * Transaction handler for Cloud Functions
 * Records buy-ins with "who did it for whom" audit trail
 */
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/**
 * Record a buy-in (or add-on) transaction, or an action log entry.
 *
 * @param {object} params
 * @param {string} params.gameId
 * @param {string} params.targetUid - player receiving chips (may be null for unbound seats)
 * @param {string} params.targetName - display name of target
 * @param {number} params.amount
 * @param {string} params.type - 'buy_in' | 'add_on' | 'join' | 'modify' | 'remove' | 'bind'
 * @param {string} actionUid - caller's uid (from auth context)
 * @param {string} actionName - caller's display name
 * @return {{ txId: string, totalBuyIn: number }}
 */
export async function recordBuyIn({ gameId, targetUid, targetName, amount, type = 'buy_in' }, actionUid, actionName) {
  const db = getFirestore();
  if (!gameId) throw new Error('Missing gameId');

  const isBuyInType = type === 'buy_in' || type === 'add_on';

  // Only buy_in / add_on require a positive amount
  if (isBuyInType && (!amount || amount <= 0)) throw new Error('Amount must be positive');
  if (!targetName) throw new Error('Missing targetName');

  const txRef = db.collection('transactions').doc();

  const txData = {
    gameId,
    targetUid: targetUid || null,
    targetName,
    actionUid,
    actionName,
    amount: Number(amount) || 0,
    type,
    status: 'active',
    undoneBy: null,
    undoOf: null,
    timestamp: FieldValue.serverTimestamp(),
  };

  const batch = db.batch();
  batch.set(txRef, txData);

  // Only sync the buy-in amount into the game players array for buy_in / add_on types.
  // Other action types (join, modify, remove, bind) are already handled by the client-side
  // game store and should not modify the players array here.
  if (isBuyInType) {
    const gameRef = db.collection('games').doc(gameId);
    const gameSnap = await gameRef.get();
    if (gameSnap.exists) {
      const players = gameSnap.data().players || [];
      const updatedPlayers = players.map((p) => {
        // Match by uid if available, otherwise by name
        const isTarget = targetUid ? p.uid === targetUid : p.name === targetName;
        if (isTarget) {
          return { ...p, buyIn: (p.buyIn || 0) + Number(amount) };
        }
        return p;
      });
      batch.update(gameRef, { players: updatedPlayers });
    }
  }

  await batch.commit();

  // Calculate total buy-in for target (only meaningful for buy-in types)
  const totalBuyIn = isBuyInType
    ? await getPlayerTotalBuyIn(gameId, targetUid, targetName)
    : 0;

  return { txId: txRef.id, totalBuyIn };
}

/**
 * Undo (cancel) a previous buy-in transaction.
 * Only the original actionUid or the game host can undo.
 *
 * @param {string} txId - transaction ID to undo
 * @param {string} callerUid - who is requesting the undo
 * @param {string} callerName - display name
 * @return {{ undoTxId: string }}
 */
export async function undoBuyIn(txId, callerUid, callerName) {
  const db = getFirestore();
  if (!txId) throw new Error('Missing txId');

  const txRef = db.collection('transactions').doc(txId);
  const txSnap = await txRef.get();

  if (!txSnap.exists) throw new Error('Transaction not found');

  const tx = txSnap.data();
  if (tx.status !== 'active') throw new Error('Transaction already undone');

  // Permission check: only original actor or game host
  const gameRef = db.collection('games').doc(tx.gameId);
  const gameSnap = await gameRef.get();
  const isHost = gameSnap.exists && gameSnap.data().hostUid === callerUid;

  if (tx.actionUid !== callerUid && !isHost) {
    throw new Error('Only the original operator or game host can undo');
  }

  // Create undo transaction + mark original
  const undoRef = db.collection('transactions').doc();
  const batch = db.batch();

  batch.update(txRef, { status: 'undone', undoneBy: undoRef.id });
  batch.set(undoRef, {
    gameId: tx.gameId,
    targetUid: tx.targetUid,
    targetName: tx.targetName,
    actionUid: callerUid,
    actionName: callerName,
    amount: -tx.amount,
    type: 'undo',
    status: 'active',
    undoneBy: null,
    undoOf: txId,
    timestamp: FieldValue.serverTimestamp(),
  });

  // Sync back to game players array
  if (gameSnap.exists) {
    const players = gameSnap.data().players || [];
    const updatedPlayers = players.map((p) => {
      const isTarget = tx.targetUid ? p.uid === tx.targetUid : p.name === tx.targetName;
      if (isTarget) {
        return { ...p, buyIn: Math.max(0, (p.buyIn || 0) - tx.amount) };
      }
      return p;
    });
    batch.update(gameRef, { players: updatedPlayers });
  }

  await batch.commit();

  return { undoTxId: undoRef.id };
}

/**
 * Get transaction log for a game.
 *
 * @param {string} gameId
 * @return {Array} transactions sorted by timestamp desc
 */
export async function getTransactionLog(gameId) {
  const db = getFirestore();
  if (!gameId) throw new Error('Missing gameId');

  const snap = await db
    .collection('transactions')
    .where('gameId', '==', gameId)
    .orderBy('timestamp', 'desc')
    .get();

  return snap.docs.map((d) => ({ txId: d.id, ...d.data() }));
}

/**
 * Calculate total active buy-in for a player in a game.
 *
 * @param {string} gameId - game ID
 * @param {string} targetUid - player UID
 * @param {string} targetName - player display name
 * @return {Promise<number>} total buy-in amount
 */
async function getPlayerTotalBuyIn(gameId, targetUid, targetName) {
  const db = getFirestore();
  let q = db
    .collection('transactions')
    .where('gameId', '==', gameId)
    .where('status', '==', 'active');

  if (targetUid) {
    q = q.where('targetUid', '==', targetUid);
  }

  const snap = await q.get();

  let total = 0;
  snap.docs.forEach((d) => {
    const data = d.data();
    // If matching by name (for unbound seats)
    if (!targetUid && data.targetName !== targetName) return;
    total += data.amount || 0;
  });

  return total;
}
